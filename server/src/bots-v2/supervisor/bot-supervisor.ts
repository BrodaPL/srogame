import type {
  BotProposal,
  BotSupervisor,
  BotSupervisorDecision,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type { BotMemoryV2 } from '../../../../src/app/models/player.ts';
import * as buildingTypeModule from '../../../../src/app/models/enums/building-type.js';
import * as diplomaticStatusModule from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import * as defenceTypeModule from '../../../../src/app/models/enums/defence-type.js';
import * as fleetMissionTypeModule from '../../../../src/app/models/enums/fleet-mission-type.js';
import * as fleetMissionRegistryModule from '../../../../src/app/models/missions/fleet-mission-registry.js';
import type { ShipType } from '../../../../src/app/models/enums/ship-type.ts';
import * as technologyTypeModule from '../../../../src/app/models/enums/technology-type.js';
import {
  calculateWeightedResourceValue,
  pruneSupervisorHistory,
  resolveTargetShares,
  scoreSupervisorProposal
} from './bot-supervisor-scoring.js';
import { normalizeFleetExecutionProposal } from '../execution/bot-fleet-execution-adapters.js';
import { normalizeQueueExecutionProposal } from '../execution/bot-execution-adapters.js';
import { normalizeRequestDecisionProposal } from '../execution/bot-request-decision-adapters.js';
import { normalizeRequestCreationProposal } from '../execution/bot-request-creation-adapters.js';
import { normalizeDiplomacyDecisionProposal } from '../execution/bot-diplomacy-decision-adapters.js';
import { normalizeDiplomacyProposal } from '../execution/bot-diplomacy-proposal-adapters.js';
import type { CreateFleetMissionCommand } from '../../game-commands/fleet-commands.ts';
import {
  BUILDING_BLUEPRINTS,
  calculateFuelCost,
  calculateTravelDistance,
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS
} from '../../game-commands/command-helpers.js';
import { resolveModule } from '../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../src/app/models/enums/building-type.js');
const { DiplomaticStatus } = resolveModule(diplomaticStatusModule) as typeof import('../../../../src/app/models/diplomacy/diplomatic-status.js');
const { DefenceType } = resolveModule(defenceTypeModule) as typeof import('../../../../src/app/models/enums/defence-type.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeModule) as typeof import('../../../../src/app/models/enums/fleet-mission-type.js');
const { FleetMissionRegistry } = resolveModule(fleetMissionRegistryModule) as typeof import('../../../../src/app/models/missions/fleet-mission-registry.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../src/app/models/enums/technology-type.js');

const QUEUE_ACTION_KINDS = new Set<BotProposal['kind']>(['BUILDING', 'RESEARCH', 'SHIPYARD']);
const FLEET_ACTION_KINDS = new Set<BotProposal['kind']>(['FLEET_MISSION']);
const REQUEST_ACTION_KINDS = new Set<BotProposal['kind']>(['REQUEST_DECISION']);
const DIPLOMACY_ACTION_KINDS = new Set<BotProposal['kind']>(['DIPLOMACY_DECISION', 'DIPLOMACY_PROPOSAL']);
const COMMITMENT_LIFETIME_TURNS = 5;
const DUPLICATE_REPLACEMENT_THRESHOLD = 1.25;
const NEXT_TURN_FLEET_PENDING_LIFETIME_TURNS = 1;
const FLEET_MISSION_REGISTRY = FleetMissionRegistry.createDefault();

type ScoredProposal = {
  proposal: BotProposal;
  score: number;
  adapterReason: string | null;
  retryCommitment: boolean;
};

export class BotSupervisorV2 implements BotSupervisor {
  constructor(private readonly flags: BotV2FeatureFlags) {}

  public decide(
    snapshot: BotWorldSnapshot,
    memory: BotMemoryV2,
    proposals: BotProposal[]
  ): BotSupervisorDecision {
    const expiredCommitments = expirePendingCommitments(memory, snapshot.turn);
    pruneSupervisorHistory(memory, snapshot.turn);

    if (this.flags.mode === 'DISABLED') {
      return this.rejectAll(proposals, 'supervisor_disabled');
    }

    const retryProposals = buildPendingRetryProposals(memory, snapshot.turn);
    const allProposals = [...retryProposals, ...proposals];
    if (allProposals.length === 0) {
      return this.rejectAll([], 'no_proposals');
    }
    const shipNeedPressure = buildShipNeedPressure(proposals);
    const researchOverlapBonus = buildResearchOverlapBonus(proposals);
    const shipyardOverlapBonus = buildShipyardOverlapBonus(proposals);
    const rejected: BotSupervisorDecision['rejected'] = [];
    const scored = allProposals
      .map((proposal) => this.scoreProposal(
        proposal,
        snapshot,
        memory,
        shipNeedPressure,
        researchOverlapBonus,
        shipyardOverlapBonus,
        retryProposals.some((retry) => retry.proposalId === proposal.proposalId)
      ))
      .filter((entry): entry is ScoredProposal => {
        if (!entry) {
          return false;
        }
        if (entry.adapterReason) {
          rejected.push({
            proposalId: entry.proposal.proposalId,
            reason: entry.adapterReason
          });
          return false;
        }
        return true;
      })
      .sort((left, right) =>
        Number(REQUEST_ACTION_KINDS.has(right.proposal.kind)) - Number(REQUEST_ACTION_KINDS.has(left.proposal.kind))
        ||
        Number(DIPLOMACY_ACTION_KINDS.has(right.proposal.kind)) - Number(DIPLOMACY_ACTION_KINDS.has(left.proposal.kind))
        ||
        Number(right.retryCommitment) - Number(left.retryCommitment)
        || right.score - left.score
        || left.proposal.proposalId.localeCompare(right.proposal.proposalId)
      );

    if (this.flags.mode === 'SHADOW') {
      return {
        accepted: [],
        pending: [],
        rejected: allProposals.map((proposal) => ({
          proposalId: proposal.proposalId,
          reason: rejected.find((entry) => entry.proposalId === proposal.proposalId)?.reason
            ?? 'shadow_mode_no_execution'
        })),
        debug: {
          mode: 'SHADOW',
          scoredProposalCount: scored.length
        }
      };
    }

    const accepted: BotProposal[] = [];
    const pending: BotProposal[] = [];
    const usedPlanetBuildSlots = new Set<string>();
    const usedPlanetShipyardSlots = new Set<string>();
    const reservedFleetShipsByOrigin = new Map<string, Map<ShipType, { undamaged: number; damaged: number }>>();
    const reservedFleetCargoByOrigin = new Map<string, { metal: number; crystal: number; deuterium: number }>();
    const reservedFleetFuelByOrigin = new Map<string, number>();
    const reservedQueueResourcesByPlanet = new Map<string, { metal: number; crystal: number; deuterium: number }>();
    let researchAccepted = false;
    const globalQueueCap = Math.max(1, snapshot.planets.length * 2);
    const maxFleetExecutions = resolveMaxFleetExecutions(snapshot);
    let acceptedFleetCount = 0;
    const fleetSlotCaps = resolveFleetSlotCaps(scored, maxFleetExecutions, memory);
    const fleetSlotsBySubsystem = new Map<string, number>();
    const criticalAccepted = scored.some((entry) => entry.proposal.subsystemId === 'CRITICAL');

    for (const entry of scored) {
      if (entry.score <= 0) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'nonpositive_score' });
        continue;
      }

      if (REQUEST_ACTION_KINDS.has(entry.proposal.kind)) {
        accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
        continue;
      }

      if (DIPLOMACY_ACTION_KINDS.has(entry.proposal.kind)) {
        accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
        continue;
      }

      if (entry.proposal.kind === 'REQUEST_CREATION') {
        accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
        continue;
      }

      if (QUEUE_ACTION_KINDS.has(entry.proposal.kind) && accepted.length + pending.length >= globalQueueCap) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'global_queue_cap_reached' });
        continue;
      }

      if (FLEET_ACTION_KINDS.has(entry.proposal.kind)) {
        if (acceptedFleetCount >= maxFleetExecutions) {
          rejected.push({ proposalId: entry.proposal.proposalId, reason: 'fleet_slot_cap_reached' });
          continue;
        }

        const usedBySubsystem = fleetSlotsBySubsystem.get(entry.proposal.subsystemId) ?? 0;
        const subsystemCap = fleetSlotCaps.get(entry.proposal.subsystemId) ?? 1;
        if (usedBySubsystem >= subsystemCap) {
          rejected.push({ proposalId: entry.proposal.proposalId, reason: 'fleet_slot_subsystem_cap_reached' });
          continue;
        }

        const fleetDecision = evaluateFleetProposal(
          snapshot,
          memory,
          entry,
          snapshot.turn,
          reservedFleetShipsByOrigin,
          reservedFleetCargoByOrigin,
          reservedFleetFuelByOrigin
        );
        if (!fleetDecision.ok) {
          rejected.push({ proposalId: entry.proposal.proposalId, reason: fleetDecision.reason });
          continue;
        }

        if (fleetDecision.accepted) {
          accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
          reserveFleetResources(
            entry.proposal,
            reservedFleetShipsByOrigin,
            reservedFleetCargoByOrigin,
            reservedFleetFuelByOrigin
          );
        } else {
          pending.push({ ...entry.proposal, status: 'ACCEPTED' });
          upsertPendingFleetCommitment(memory, entry, snapshot.turn);
        }
        acceptedFleetCount += 1;
        fleetSlotsBySubsystem.set(entry.proposal.subsystemId, usedBySubsystem + 1);
        continue;
      }

      const queueDecision = evaluateQueueProposal(
        snapshot,
        memory,
        entry,
        usedPlanetBuildSlots,
        usedPlanetShipyardSlots,
        researchAccepted,
        reservedQueueResourcesByPlanet
      );
      if (!queueDecision.ok) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: queueDecision.reason });
        continue;
      }

      if (queueDecision.accepted) {
        accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
        reserveQueueResources(entry.proposal, queueDecision.planetKey, reservedQueueResourcesByPlanet);
      } else {
        pending.push({ ...entry.proposal, status: 'ACCEPTED' });
        upsertPendingCommitment(memory, entry, snapshot.turn);
      }

      if (queueDecision.kind === 'RESEARCH') {
        researchAccepted = true;
      }
      if (queueDecision.kind === 'BUILDING' || queueDecision.kind === 'RESEARCH') {
        usedPlanetBuildSlots.add(queueDecision.planetKey);
      }
      if (queueDecision.kind === 'SHIPYARD') {
        usedPlanetShipyardSlots.add(queueDecision.planetKey);
      }
    }

    appendProposalHistory(memory, snapshot.turn, accepted, pending, rejected, allProposals);

    return {
      accepted,
      pending,
      rejected,
      debug: {
        mode: 'LIVE',
        acceptedCount: accepted.length,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
        acceptedFleetCount,
        expiredCommitmentCount: expiredCommitments,
        criticalAccepted
      }
    };
  }

  private scoreProposal(
    proposal: BotProposal,
    snapshot: BotWorldSnapshot,
    memory: BotMemoryV2,
    shipNeedPressure: Map<string, number>,
    researchOverlapBonus: Map<string, number>,
    shipyardOverlapBonus: Map<string, number>,
    retryCommitment = false
  ): ScoredProposal | null {
    if (proposal.status === 'BLOCKED' || proposal.blockers.length > 0) {
      return {
        proposal,
        score: 0,
        adapterReason: 'proposal_blocked',
        retryCommitment
      };
    }

    if (proposal.kind === 'FLEET_MISSION') {
      const normalized = normalizeFleetExecutionProposal(proposal);
      if (!normalized.ok) {
        if (
          normalized.reason !== 'combat_execution_deferred'
          && normalized.reason !== 'fleet_mission_not_allowed_in_current_supervisor_phase'
        ) {
          console.warn(`[BotV2 Supervisor] Invalid fleet proposal ${proposal.proposalId}: ${normalized.reason}`);
        }
        return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
      }
      const score = scoreSupervisorProposal({
        proposal,
        snapshot,
        memory,
        shipNeedPressure: 0,
        criticalAccepted: false
      });
      return {
        proposal,
        score,
        adapterReason: null,
        retryCommitment
      };
    }
    if (proposal.kind === 'MAINTENANCE_REQUEST') {
      // TODO: Extract request command policy before enabling Supervisor request handling.
      return { proposal, score: 0, adapterReason: 'request_handling_phase4_deferred', retryCommitment };
    }
    if (proposal.kind === 'REQUEST_DECISION') {
      const normalized = normalizeRequestDecisionProposal(proposal);
      if (!normalized.ok) {
        console.warn(`[BotV2 Supervisor] Invalid request decision proposal ${proposal.proposalId}: ${normalized.reason}`);
        return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
      }
      const score = scoreSupervisorProposal({
        proposal,
        snapshot,
        memory,
        shipNeedPressure: 0,
        criticalAccepted: false
      });
      return {
        proposal,
        score: score + 10000,
        adapterReason: null,
        retryCommitment
      };
    }
    if (proposal.kind === 'REQUEST_CREATION') {
      const normalized = normalizeRequestCreationProposal(proposal);
      if (!normalized.ok) {
        console.warn(`[BotV2 Supervisor] Invalid request creation proposal ${proposal.proposalId}: ${normalized.reason}`);
        return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
      }
      const score = scoreSupervisorProposal({
        proposal,
        snapshot,
        memory,
        shipNeedPressure: 0,
        criticalAccepted: false
      });
      return {
        proposal,
        score,
        adapterReason: null,
        retryCommitment
      };
    }
    if (proposal.kind === 'DIPLOMACY_DECISION') {
      const normalized = normalizeDiplomacyDecisionProposal(proposal);
      if (!normalized.ok) {
        console.warn(`[BotV2 Supervisor] Invalid diplomacy decision proposal ${proposal.proposalId}: ${normalized.reason}`);
        return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
      }
      const expiringBoost = proposal.expiresOnTurn !== null && proposal.expiresOnTurn <= snapshot.turn + 1
        ? 10000
        : 0;
      const score = scoreSupervisorProposal({
        proposal,
        snapshot,
        memory,
        shipNeedPressure: 0,
        criticalAccepted: false
      });
      return {
        proposal,
        score: score + expiringBoost,
        adapterReason: null,
        retryCommitment
      };
    }
    if (proposal.kind === 'DIPLOMACY_PROPOSAL') {
      const normalized = normalizeDiplomacyProposal(proposal);
      if (!normalized.ok) {
        console.warn(`[BotV2 Supervisor] Invalid diplomacy proposal ${proposal.proposalId}: ${normalized.reason}`);
        return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
      }
      const score = scoreSupervisorProposal({
        proposal,
        snapshot,
        memory,
        shipNeedPressure: 0,
        criticalAccepted: false
      });
      return {
        proposal,
        score,
        adapterReason: null,
        retryCommitment
      };
    }
    if (!QUEUE_ACTION_KINDS.has(proposal.kind)) {
      return { proposal, score: 0, adapterReason: 'unsupported_execution_kind', retryCommitment };
    }

    const normalized = normalizeQueueExecutionProposal(proposal);
    if (!normalized.ok) {
      if (normalized.reason !== 'ship_need_pressure_only') {
        console.warn(`[BotV2 Supervisor] Invalid queue proposal ${proposal.proposalId}: ${normalized.reason}`);
      }
      return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
    }

    const pressure = proposal.kind === 'SHIPYARD'
      ? shipNeedPressure.get(resolveShipyardNeedKey(proposal) ?? '') ?? 0
      : 0;

    let score = scoreSupervisorProposal({
      proposal,
      snapshot,
      memory,
      shipNeedPressure: pressure,
      criticalAccepted: false
    });
    if (proposal.kind === 'RESEARCH') {
      const technologyType = readResearchTechnologyType(proposal);
      const overlapBonus = technologyType ? (researchOverlapBonus.get(technologyType) ?? 0) : 0;
      score *= 1 + overlapBonus;
    }
    if (proposal.kind === 'SHIPYARD' && proposal.requestPayload.demandOnly !== true) {
      const shipyardKey = resolveShipyardNeedKey(proposal);
      const overlapBonus = shipyardKey ? (shipyardOverlapBonus.get(shipyardKey) ?? 0) : 0;
      score *= 1 + overlapBonus;
    }

    return {
      proposal,
      score,
      adapterReason: null,
      retryCommitment
    };
  }

  private rejectAll(proposals: BotProposal[], reason: string): BotSupervisorDecision {
    return {
      accepted: [],
      pending: [],
      rejected: proposals.map((proposal) => ({
        proposalId: proposal.proposalId,
        reason
      })),
      debug: {
        mode: this.flags.mode
      }
    };
  }
}

function precheckQueue(
  snapshot: BotWorldSnapshot,
  kind: 'BUILDING' | 'RESEARCH' | 'SHIPYARD',
  planetKey: string
): string | null {
  const planet = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === planetKey);
  if (!planet) {
    return 'target_planet_not_owned';
  }

  if (kind === 'SHIPYARD') {
    return planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength
      ? 'queue_became_unavailable'
      : null;
  }

  if (kind === 'RESEARCH') {
    return planet.queues.hasActiveResearch || planet.queues.isResearchHelper
      ? 'queue_became_unavailable'
      : null;
  }

  return planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength
    ? 'queue_became_unavailable'
    : null;
}

function isLocallyAffordable(
  snapshot: BotWorldSnapshot,
  planetKey: string,
  proposal: BotProposal,
  reservedQueueResourcesByPlanet: Map<string, { metal: number; crystal: number; deuterium: number }>
): boolean {
  const planet = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === planetKey);
  if (!planet) {
    return false;
  }

  const reserved = reservedQueueResourcesByPlanet.get(planetKey) ?? { metal: 0, crystal: 0, deuterium: 0 };
  return planet.localResources.metal >= proposal.requestedResources.metal + reserved.metal
    && planet.localResources.crystal >= proposal.requestedResources.crystal + reserved.crystal
    && planet.localResources.deuterium >= proposal.requestedResources.deuterium + reserved.deuterium;
}

function evaluateQueueProposal(
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2,
  entry: ScoredProposal,
  usedPlanetBuildSlots: Set<string>,
  usedPlanetShipyardSlots: Set<string>,
  researchAccepted: boolean,
  reservedQueueResourcesByPlanet: Map<string, { metal: number; crystal: number; deuterium: number }>
): {
  ok: true;
  accepted: boolean;
  kind: 'BUILDING' | 'RESEARCH' | 'SHIPYARD';
  planetKey: string;
} | {
  ok: false;
  reason: string;
} {
  const normalized = normalizeQueueExecutionProposal(entry.proposal);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }

  const planetCoordinates = readQueueProposalCoordinates(entry.proposal);
  if (!planetCoordinates) {
    return { ok: false, reason: 'invalid_queue_target_coordinates' };
  }
  const planetKey = toCoordinatesKey(planetCoordinates);
  const duplicate = memory.supervisor.pendingCommitments.find((commitment) =>
    isActivePendingCommitment(commitment.status)
    && commitment.dedupeKey === entry.proposal.dedupeKey
  );
  if (
    duplicate
    && !entry.retryCommitment
    && entry.score < duplicate.score * DUPLICATE_REPLACEMENT_THRESHOLD
  ) {
    return { ok: false, reason: 'already_committed' };
  }

  if (normalized.value.kind === 'RESEARCH' && researchAccepted) {
    return { ok: false, reason: 'research_global_cap_reached' };
  }
  if (
    (normalized.value.kind === 'BUILDING' || normalized.value.kind === 'RESEARCH')
    && usedPlanetBuildSlots.has(planetKey)
  ) {
    return { ok: false, reason: 'planet_build_slot_taken' };
  }
  if (normalized.value.kind === 'SHIPYARD' && usedPlanetShipyardSlots.has(planetKey)) {
    return { ok: false, reason: 'planet_shipyard_slot_taken' };
  }

  const queuePrecheck = precheckQueue(snapshot, normalized.value.kind, planetKey);
  if (queuePrecheck) {
    return { ok: false, reason: queuePrecheck };
  }

  const requirementPrecheck = precheckQueueRequirements(snapshot, entry.proposal, planetKey);
  if (requirementPrecheck) {
    return { ok: false, reason: requirementPrecheck };
  }

  const affordable = isLocallyAffordable(snapshot, planetKey, entry.proposal, reservedQueueResourcesByPlanet);

  return {
    ok: true,
    accepted: affordable || entry.proposal.subsystemId === 'CRITICAL',
    kind: normalized.value.kind,
    planetKey
  };
}

function reserveQueueResources(
  proposal: BotProposal,
  planetKey: string,
  reservedQueueResourcesByPlanet: Map<string, { metal: number; crystal: number; deuterium: number }>
): void {
  const reserved = reservedQueueResourcesByPlanet.get(planetKey) ?? { metal: 0, crystal: 0, deuterium: 0 };
  reservedQueueResourcesByPlanet.set(planetKey, {
    metal: reserved.metal + proposal.requestedResources.metal,
    crystal: reserved.crystal + proposal.requestedResources.crystal,
    deuterium: reserved.deuterium + proposal.requestedResources.deuterium
  });
}

function evaluateFleetProposal(
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2,
  entry: ScoredProposal,
  turn: number,
  reservedFleetShipsByOrigin: Map<string, Map<ShipType, { undamaged: number; damaged: number }>>,
  reservedFleetCargoByOrigin: Map<string, { metal: number; crystal: number; deuterium: number }>,
  reservedFleetFuelByOrigin: Map<string, number>
): {
  ok: true;
  accepted: boolean;
} | {
  ok: false;
  reason: string;
} {
  const normalized = normalizeFleetExecutionProposal(entry.proposal);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }

  const originCoordinates = readFleetOriginCoordinates(entry.proposal);
  if (!originCoordinates) {
    return { ok: false, reason: 'invalid_origin_coordinates' };
  }
  const originKey = toCoordinatesKey(originCoordinates);
  const origin = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === originKey);
  if (!origin) {
    return { ok: false, reason: 'origin_planet_not_owned' };
  }

  const relationPrecheck = precheckFleetMissionRelation(entry.proposal);
  if (relationPrecheck) {
    return { ok: false, reason: relationPrecheck };
  }

  const reservedCargo = reservedFleetCargoByOrigin.get(originKey) ?? { metal: 0, crystal: 0, deuterium: 0 };
  const reservedFuel = reservedFleetFuelByOrigin.get(originKey) ?? 0;
  const fuelCost = resolveFleetFuelCost(normalized.value);
  if (
    origin.localResources.metal < (normalized.value.cargo.metal + reservedCargo.metal)
    || origin.localResources.crystal < (normalized.value.cargo.crystal + reservedCargo.crystal)
    || origin.localResources.deuterium < (normalized.value.cargo.deuterium + reservedCargo.deuterium + fuelCost + reservedFuel)
  ) {
    return {
      ok: false,
      reason: origin.localResources.deuterium < (normalized.value.cargo.deuterium + reservedCargo.deuterium + fuelCost + reservedFuel)
        ? 'fuel_resources_unavailable'
        : 'cargo_resources_unavailable'
    };
  }

  const reservedShips = reservedFleetShipsByOrigin.get(originKey) ?? new Map<ShipType, { undamaged: number; damaged: number }>();
  const missingShips = resolveMissingFleetShips(origin, normalized.value.ships, reservedShips);
  if (missingShips.length === 0) {
    return { ok: true, accepted: true };
  }

  if (entry.retryCommitment) {
    expireMatchingPendingCommitment(memory, entry.proposal.dedupeKey, turn, 'ships_unavailable_after_pending');
    return { ok: false, reason: 'ships_unavailable_after_pending' };
  }

  if (areMissingShipsCompletingNextTurn(origin, missingShips)) {
    return { ok: true, accepted: false };
  }

  return { ok: false, reason: 'ships_unavailable' };
}

function precheckFleetMissionRelation(proposal: BotProposal): string | null {
  const missionType = proposal.requestPayload.missionType;
  if (missionType !== FleetMissionType.BOMBARD && missionType !== FleetMissionType.SIEGE) {
    return null;
  }

  const targetStatus = proposal.requestPayload.targetStatus ?? proposal.debug.targetStatus;
  if (targetStatus !== undefined && targetStatus !== DiplomaticStatus.WAR) {
    return 'bombard_siege_requires_war';
  }

  return null;
}

function resolveMissingFleetShips(
  origin: BotWorldSnapshot['planets'][number],
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>,
  reservedShips: Map<ShipType, { undamaged: number; damaged: number }>
): Array<{ type: ShipType; missingUndamagedAmount: number; missingDamagedAmount: number }> {
  const missing: Array<{ type: ShipType; missingUndamagedAmount: number; missingDamagedAmount: number }> = [];
  for (const ship of ships) {
    const reserved = reservedShips.get(ship.type) ?? { undamaged: 0, damaged: 0 };
    const undamaged = Math.max(0, (origin.ships.undamagedCountByType[ship.type] ?? 0) - reserved.undamaged);
    const damaged = Math.max(0, (origin.ships.damagedCountByType[ship.type] ?? 0) - reserved.damaged);
    const missingUndamagedAmount = Math.max(0, ship.undamagedAmount - undamaged);
    const missingDamagedAmount = Math.max(0, ship.damagedAmount - damaged);
    if (missingUndamagedAmount > 0 || missingDamagedAmount > 0) {
      missing.push({
        type: ship.type,
        missingUndamagedAmount,
        missingDamagedAmount
      });
    }
  }

  return missing;
}

function areMissingShipsCompletingNextTurn(
  origin: BotWorldSnapshot['planets'][number],
  missingShips: Array<{ type: ShipType; missingUndamagedAmount: number; missingDamagedAmount: number }>
): boolean {
  for (const missing of missingShips) {
    if (missing.missingDamagedAmount > 0) {
      return false;
    }
    if ((origin.queues.shipsCompletingNextTurnByType[missing.type] ?? 0) < missing.missingUndamagedAmount) {
      return false;
    }
  }

  return true;
}

function resolveMaxFleetExecutions(snapshot: BotWorldSnapshot): number {
  const availableSlots = Math.max(0, snapshot.empire.maxActiveFleetCount - snapshot.empire.activeFleetCount);
  if (availableSlots <= 1) {
    return availableSlots;
  }
  return availableSlots - 1;
}

function resolveFleetSlotCaps(
  scored: ScoredProposal[],
  maxFleetExecutions: number,
  memory: BotMemoryV2
): Map<string, number> {
  const result = new Map<string, number>();
  if (maxFleetExecutions <= 0) {
    return result;
  }

  const subsystemIds = [...new Set(scored
    .filter((entry) => entry.proposal.kind === 'FLEET_MISSION')
    .map((entry) => entry.proposal.subsystemId))];
  if (subsystemIds.length === 0) {
    return result;
  }

  const shares = resolveTargetShares({
    ECONOMIC: averageLocalWeight(memory, 'economicWeight'),
    DEFENSIVE: averageLocalWeight(memory, 'defensiveWeight'),
    WARFARE: averageLocalWeight(memory, 'warfareWeight'),
    RESEARCH: memory.weightManager.researchWeight || 50,
    STRATEGIC_DEVELOPMENT: memory.weightManager.strategicDevelopmentWeight || 50,
    STRATEGIC_MILITARY: memory.weightManager.strategicMilitaryWeight || 50,
    STRATEGIC_DIPLOMATIC: memory.weightManager.strategicDiplomaticWeight || 50
  });
  const activeShareTotal = subsystemIds.reduce((sum, subsystemId) => sum + (shares[subsystemId] ?? 0), 0) || subsystemIds.length;
  for (const subsystemId of subsystemIds) {
    const share = shares[subsystemId] ?? (1 / subsystemIds.length);
    const redistributedShare = share / activeShareTotal;
    result.set(subsystemId, Math.max(1, Math.round(maxFleetExecutions * redistributedShare)));
  }

  return result;
}

function buildPendingRetryProposals(memory: BotMemoryV2, turn: number): BotProposal[] {
  return memory.supervisor.pendingCommitments
    .filter((commitment) =>
      (commitment.status === 'PENDING_RESOURCES' || commitment.status === 'PENDING_SHIPS_NEXT_TURN')
      && commitment.expiresOnTurn >= turn
      && (
        QUEUE_ACTION_KINDS.has(commitment.kind as BotProposal['kind'])
        || FLEET_ACTION_KINDS.has(commitment.kind as BotProposal['kind'])
      )
    )
    .map((commitment): BotProposal => ({
      proposalId: `${commitment.proposalId}:retry:${turn}`,
      subsystemId: commitment.subsystemId,
      kind: commitment.kind as BotProposal['kind'],
      status: 'PROPOSED',
      goalKey: commitment.commitmentKey,
      dedupeKey: commitment.dedupeKey,
      summary: `Retry pending ${commitment.kind} commitment ${commitment.dedupeKey}.`,
      planetId: null,
      targetCoordinates: commitment.targetCoordinates,
      expectedValue: Math.max(1, commitment.score),
      urgency: 100,
      risk: 0,
      confidence: 100,
      requestedResources: { ...commitment.requestedResources },
      requestPayload: { ...commitment.executionPayload },
      blockers: [],
      expiresOnTurn: commitment.expiresOnTurn,
      debug: {
        retryCommitment: true,
        originalProposalId: commitment.proposalId
      }
    }));
}

function expirePendingCommitments(memory: BotMemoryV2, turn: number): number {
  let expired = 0;
  for (const commitment of memory.supervisor.pendingCommitments) {
    if (commitment.expiresOnTurn < turn && commitment.status !== 'CANCELLED') {
      commitment.status = 'EXPIRED';
      commitment.updatedTurn = turn;
      commitment.cancelReason = 'expired';
      expired += 1;
    }
  }
  return expired;
}

function upsertPendingCommitment(memory: BotMemoryV2, entry: ScoredProposal, turn: number): void {
  const existingIndex = memory.supervisor.pendingCommitments.findIndex((commitment) =>
    isActivePendingCommitment(commitment.status)
    && commitment.dedupeKey === entry.proposal.dedupeKey
  );
  const commitment = {
    commitmentKey: `${entry.proposal.subsystemId}:${entry.proposal.kind}:${entry.proposal.dedupeKey}`,
    dedupeKey: entry.proposal.dedupeKey,
    proposalId: entry.proposal.proposalId,
    subsystemId: entry.proposal.subsystemId,
    kind: entry.proposal.kind,
    targetCoordinates: entry.proposal.targetCoordinates,
    requestedResources: { ...entry.proposal.requestedResources },
    weightedResourceValue: calculateWeightedResourceValue(entry.proposal.requestedResources),
    score: entry.score,
    status: 'PENDING_RESOURCES' as const,
    createdTurn: existingIndex >= 0
      ? memory.supervisor.pendingCommitments[existingIndex]!.createdTurn
      : turn,
    updatedTurn: turn,
    expiresOnTurn: turn + COMMITMENT_LIFETIME_TURNS,
    executionPayload: { ...entry.proposal.requestPayload },
    cancelReason: null
  };

  if (existingIndex >= 0) {
    memory.supervisor.pendingCommitments[existingIndex] = commitment;
  } else {
    memory.supervisor.pendingCommitments.push(commitment);
  }
}

function upsertPendingFleetCommitment(memory: BotMemoryV2, entry: ScoredProposal, turn: number): void {
  const existingIndex = memory.supervisor.pendingCommitments.findIndex((commitment) =>
    isActivePendingCommitment(commitment.status)
    && commitment.dedupeKey === entry.proposal.dedupeKey
  );
  const commitment = {
    commitmentKey: `${entry.proposal.subsystemId}:${entry.proposal.kind}:${entry.proposal.dedupeKey}`,
    dedupeKey: entry.proposal.dedupeKey,
    proposalId: entry.proposal.proposalId,
    subsystemId: entry.proposal.subsystemId,
    kind: entry.proposal.kind,
    targetCoordinates: entry.proposal.targetCoordinates,
    requestedResources: { ...entry.proposal.requestedResources },
    weightedResourceValue: calculateWeightedResourceValue(entry.proposal.requestedResources),
    score: entry.score,
    status: 'PENDING_SHIPS_NEXT_TURN' as const,
    createdTurn: existingIndex >= 0
      ? memory.supervisor.pendingCommitments[existingIndex]!.createdTurn
      : turn,
    updatedTurn: turn,
    expiresOnTurn: turn + NEXT_TURN_FLEET_PENDING_LIFETIME_TURNS,
    executionPayload: {
      ...entry.proposal.requestPayload,
      reservedFleetSlot: true
    },
    cancelReason: null
  };

  if (existingIndex >= 0) {
    memory.supervisor.pendingCommitments[existingIndex] = commitment;
  } else {
    memory.supervisor.pendingCommitments.push(commitment);
  }
}

function expireMatchingPendingCommitment(
  memory: BotMemoryV2,
  dedupeKey: string,
  turn: number,
  reason: string
): void {
  for (const commitment of memory.supervisor.pendingCommitments) {
    if (commitment.dedupeKey !== dedupeKey || !isActivePendingCommitment(commitment.status)) {
      continue;
    }

    commitment.status = 'EXPIRED';
    commitment.updatedTurn = turn;
    commitment.cancelReason = reason;
  }
}

function isActivePendingCommitment(status: BotMemoryV2['supervisor']['pendingCommitments'][number]['status']): boolean {
  return status === 'PENDING_RESOURCES'
    || status === 'PENDING_QUEUE'
    || status === 'PENDING_SHIPS_NEXT_TURN';
}

function averageLocalWeight(
  memory: BotMemoryV2,
  key: 'economicWeight' | 'defensiveWeight' | 'warfareWeight'
): number {
  if (memory.weightManager.planets.length === 0) {
    return 50;
  }

  return memory.weightManager.planets.reduce((sum, planet) => sum + planet[key], 0)
    / memory.weightManager.planets.length;
}

function appendProposalHistory(
  memory: BotMemoryV2,
  turn: number,
  accepted: BotProposal[],
  pending: BotProposal[],
  rejected: BotSupervisorDecision['rejected'],
  allProposals: BotProposal[]
): void {
  const acceptedIds = new Set(accepted.map((proposal) => proposal.proposalId));
  const pendingIds = new Set(pending.map((proposal) => proposal.proposalId));
  const reasons = new Map(rejected.map((entry) => [entry.proposalId, entry.reason]));

  memory.supervisor.proposalHistory.push(
    ...allProposals.map((proposal) => ({
      turn,
      proposalId: proposal.proposalId,
      dedupeKey: proposal.dedupeKey,
      subsystemId: proposal.subsystemId,
      kind: proposal.kind,
      accepted: acceptedIds.has(proposal.proposalId),
      pending: pendingIds.has(proposal.proposalId),
      reason: reasons.get(proposal.proposalId) ?? null
    }))
  );
}

function buildShipNeedPressure(proposals: BotProposal[]): Map<string, number> {
  const pressure = new Map<string, number>();
  for (const proposal of proposals) {
    if (proposal.kind !== 'SHIPYARD' || proposal.requestPayload.demandOnly !== true) {
      continue;
    }
    const key = resolveShipyardNeedKey(proposal);
    if (!key) {
      continue;
    }
    const amount = Math.max(1, Number(proposal.requestPayload.amount ?? 1));
    const urgency = Math.max(0, proposal.urgency);
    pressure.set(key, (pressure.get(key) ?? 0) + amount + urgency);
  }
  return pressure;
}

function buildResearchOverlapBonus(proposals: BotProposal[]): Map<string, number> {
  const subsystemSets = new Map<string, Set<string>>();
  for (const proposal of proposals) {
    if (proposal.kind !== 'RESEARCH') {
      continue;
    }

    const technologyType = readResearchTechnologyType(proposal);
    if (!technologyType) {
      continue;
    }

    if (!subsystemSets.has(technologyType)) {
      subsystemSets.set(technologyType, new Set());
    }
    subsystemSets.get(technologyType)!.add(proposal.subsystemId);
  }

  const bonusByTechnology = new Map<string, number>();
  for (const [technologyType, subsystemIds] of subsystemSets.entries()) {
    const overlapCount = subsystemIds.size - 1;
    if (overlapCount <= 0) {
      continue;
    }
    bonusByTechnology.set(technologyType, Math.min(0.6, overlapCount * 0.2));
  }

  return bonusByTechnology;
}

function buildShipyardOverlapBonus(proposals: BotProposal[]): Map<string, number> {
  const subsystemSets = new Map<string, Set<string>>();
  for (const proposal of proposals) {
    if (proposal.kind !== 'SHIPYARD' || proposal.requestPayload.demandOnly === true) {
      continue;
    }

    const shipyardKey = resolveShipyardNeedKey(proposal);
    if (!shipyardKey) {
      continue;
    }

    if (!subsystemSets.has(shipyardKey)) {
      subsystemSets.set(shipyardKey, new Set());
    }
    subsystemSets.get(shipyardKey)!.add(proposal.subsystemId);
  }

  const bonusByShipyardKey = new Map<string, number>();
  for (const [shipyardKey, subsystemIds] of subsystemSets.entries()) {
    const overlapCount = subsystemIds.size - 1;
    if (overlapCount <= 0) {
      continue;
    }
    bonusByShipyardKey.set(shipyardKey, Math.min(0.6, overlapCount * 0.2));
  }

  return bonusByShipyardKey;
}

function readResearchTechnologyType(proposal: BotProposal): string | null {
  return typeof proposal.requestPayload.technologyType === 'string'
    ? proposal.requestPayload.technologyType
    : null;
}

function resolveShipyardNeedKey(proposal: BotProposal): string | null {
  if (proposal.requestPayload.itemKind === 'ship' && typeof proposal.requestPayload.shipType === 'string') {
    return `ship:${proposal.requestPayload.shipType}`;
  }
  if (proposal.requestPayload.itemKind === 'defence' && typeof proposal.requestPayload.defenceType === 'string') {
    return `defence:${proposal.requestPayload.defenceType}`;
  }
  return null;
}

function toCoordinatesKey(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function precheckQueueRequirements(
  snapshot: BotWorldSnapshot,
  proposal: BotProposal,
  planetKey: string
): string | null {
  const planet = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === planetKey);
  if (!planet) {
    return 'target_planet_not_owned';
  }

  if (proposal.kind === 'BUILDING') {
    const buildingType = typeof proposal.requestPayload.buildingType === 'string'
      ? proposal.requestPayload.buildingType as BuildingType
      : null;
    const blueprint = buildingType ? BUILDING_BLUEPRINTS.get(buildingType) : null;
    if (!buildingType || !blueprint) {
      return 'invalid_building_type';
    }

    const nextLevel = getSnapshotBuildingLevel(planet, buildingType) + 1;
    if (!hasSnapshotBuildingRequirements(planet, blueprint.buildingRequirements, nextLevel)) {
      return 'building_requirements_not_met';
    }
    if (!hasSnapshotTechnologyRequirements(planet, blueprint.techRequirements, nextLevel)) {
      return 'technology_requirements_not_met';
    }
    return null;
  }

  if (proposal.kind === 'RESEARCH') {
    const technologyType = typeof proposal.requestPayload.technologyType === 'string'
      ? proposal.requestPayload.technologyType as TechnologyType
      : null;
    const blueprint = technologyType ? TECHNOLOGY_BLUEPRINTS.get(technologyType) : null;
    if (!technologyType || !blueprint) {
      return 'invalid_technology_type';
    }

    const nextLevel = getSnapshotTechnologyLevel(planet, technologyType) + 1;
    if (!hasSnapshotBuildingRequirements(planet, blueprint.buildingRequirements, nextLevel)) {
      return 'building_requirements_not_met';
    }
    if (!hasSnapshotTechnologyRequirements(planet, blueprint.techRequirements, nextLevel)) {
      return 'technology_requirements_not_met';
    }
    return null;
  }

  if (proposal.kind === 'SHIPYARD') {
    const itemKind = proposal.requestPayload.itemKind;
    if (itemKind === 'ship') {
      const shipType = typeof proposal.requestPayload.shipType === 'string'
        ? proposal.requestPayload.shipType as ShipType
        : null;
      const blueprint = shipType ? SHIP_BLUEPRINTS.get(shipType) : null;
      if (!shipType || !blueprint) {
        return 'invalid_ship_type';
      }

      if (!hasSnapshotStaticRequirements(planet, blueprint.buildingRequirements, 'building')) {
        return 'building_requirements_not_met';
      }
      if (!hasSnapshotStaticRequirements(planet, blueprint.techRequirements, 'technology')) {
        return 'technology_requirements_not_met';
      }
      return null;
    }

    if (itemKind === 'defence') {
      const defenceType = typeof proposal.requestPayload.defenceType === 'string'
        ? proposal.requestPayload.defenceType as DefenceType
        : null;
      const blueprint = defenceType ? DEFENCE_BLUEPRINTS.get(defenceType) : null;
      if (!defenceType || !blueprint) {
        return 'invalid_defence_type';
      }

      if (!hasSnapshotStaticRequirements(planet, blueprint.buildingRequirements, 'building')) {
        return 'building_requirements_not_met';
      }
      if (!hasSnapshotStaticRequirements(planet, blueprint.techRequirements, 'technology')) {
        return 'technology_requirements_not_met';
      }
      return null;
    }
  }

  return null;
}

function readQueueProposalCoordinates(proposal: BotProposal): { x: number; y: number; z: number } | null {
  if (proposal.targetCoordinates) {
    return proposal.targetCoordinates;
  }

  if (!proposal.requestPayload || typeof proposal.requestPayload !== 'object') {
    return null;
  }

  const payload = proposal.requestPayload as Record<string, unknown>;
  return readOneBasedCoordinates(payload);
}

function readFleetOriginCoordinates(proposal: BotProposal): { x: number; y: number; z: number } | null {
  if (!proposal.requestPayload || typeof proposal.requestPayload !== 'object') {
    return null;
  }

  const payload = proposal.requestPayload as Record<string, unknown>;
  return readOneBasedCoordinates(payload.origin);
}

function readOneBasedCoordinates(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const x = Number(record.x);
  const y = Number(record.y);
  const z = Number(record.z);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return null;
  }

  return { x, y, z };
}

function hasSnapshotBuildingRequirements(
  planet: BotWorldSnapshot['planets'][number],
  requirements: Array<{ building: BuildingType; level: number }>,
  scaledLevel: number
): boolean {
  for (const requirement of requirements) {
    const requiredLevel = Math.ceil(scaledLevel * requirement.level);
    if (getSnapshotBuildingLevel(planet, requirement.building) < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasSnapshotTechnologyRequirements(
  planet: BotWorldSnapshot['planets'][number],
  requirements: Array<{ tech: TechnologyType; level: number }>,
  scaledLevel: number
): boolean {
  for (const requirement of requirements) {
    const requiredLevel = Math.ceil(scaledLevel * requirement.level);
    if (getSnapshotTechnologyLevel(planet, requirement.tech) < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasSnapshotStaticRequirements(
  planet: BotWorldSnapshot['planets'][number],
  requirements: Array<{ building: BuildingType; level: number }> | Array<{ tech: TechnologyType; level: number }>,
  kind: 'building' | 'technology'
): boolean {
  if (kind === 'building') {
    return (requirements as Array<{ building: BuildingType; level: number }>).every((requirement) =>
      getSnapshotBuildingLevel(planet, requirement.building) >= Math.ceil(requirement.level)
    );
  }

  return (requirements as Array<{ tech: TechnologyType; level: number }>).every((requirement) =>
    getSnapshotTechnologyLevel(planet, requirement.tech) >= Math.ceil(requirement.level)
  );
}

function getSnapshotBuildingLevel(
  planet: BotWorldSnapshot['planets'][number],
  buildingType: BuildingType
): number {
  switch (buildingType) {
    case BuildingType.METAL_MINE:
      return planet.economy.metalMineLevel;
    case BuildingType.CRYSTAL_MINE:
      return planet.economy.crystalMineLevel;
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return planet.economy.deuteriumSynthesizerLevel;
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
      return planet.economy.solarLevel;
    case BuildingType.NUCLEAR_PLANT:
      return planet.economy.nuclearLevel;
    case BuildingType.FUSION_REACTOR:
      return planet.economy.fusionLevel;
    case BuildingType.METAL_STORAGE:
      return planet.economy.metalStorageLevel;
    case BuildingType.CRYSTAL_STORAGE:
      return planet.economy.crystalStorageLevel;
    case BuildingType.DEUTERIUM_TANK:
      return planet.economy.deuteriumTankLevel;
    case BuildingType.ROBOTICS_FACTORY:
      return planet.economy.roboticsLevel;
    case BuildingType.NANITE_FACTORY:
      return planet.economy.naniteLevel;
    case BuildingType.SHIPYARD:
      return planet.economy.shipyardLevel;
    case BuildingType.RESEARCH_LAB:
      return planet.economy.researchLabLevel;
    case BuildingType.SENSOR_PHALANX:
      return planet.economy.sensorPhalanxLevel;
    case BuildingType.JUMP_GATE:
      return planet.economy.jumpGateLevel;
    case BuildingType.ALLIANCE_DEPOT:
      return planet.economy.allianceDepotLevel;
    case BuildingType.BOMB_DEPOT:
      return planet.economy.bombDepotLevel;
    case BuildingType.BUNKER_NETWORK:
      return planet.defense.bunkerLevel;
    case BuildingType.INTERSTELLAR_TRADE_PORT:
      return planet.economy.interstellarTradePortLevel;
    default:
      return 0;
  }
}

function getSnapshotTechnologyLevel(
  planet: BotWorldSnapshot['planets'][number],
  technologyType: TechnologyType
): number {
  switch (technologyType) {
    case TechnologyType.ENERGY_TECHNOLOGY:
      return planet.tech.energyTechnologyLevel;
    case TechnologyType.MATERIAL_TECHNOLOGY:
      return planet.tech.materialTechnologyLevel;
    case TechnologyType.ADAPTIVE_TECHNOLOGY:
      return planet.tech.adaptiveTechnologyLevel;
    case TechnologyType.COMPUTER_TECHNOLOGY:
      return planet.tech.computerTechnologyLevel;
    case TechnologyType.INTERGALACTIC_RESEARCH_NETWORK:
      return planet.tech.intergalacticResearchNetworkLevel;
    case TechnologyType.SHIELDING_TECHNOLOGY:
      return planet.tech.shieldingTechnologyLevel;
    case TechnologyType.ARMOUR_TECHNOLOGY:
      return planet.tech.armourTechnologyLevel;
    case TechnologyType.RAILGUNS_WEAPONS:
      return planet.tech.railgunsWeaponsLevel;
    case TechnologyType.BEAMS_WEAPONS:
      return planet.tech.beamsWeaponsLevel;
    case TechnologyType.MISSILES_WEAPONS:
      return planet.tech.missilesWeaponsLevel;
    case TechnologyType.FUSION_DRIVE:
      return planet.tech.fusionDriveLevel;
    case TechnologyType.HYPERSPACE_DRIVE:
      return planet.tech.hyperspaceDriveLevel;
    case TechnologyType.HYPERSPACE_TECHNOLOGY:
      return planet.tech.hyperspaceTechnologyLevel;
    case TechnologyType.ESPIONAGE_TECHNOLOGY:
      return planet.tech.espionageTechnologyLevel;
    case TechnologyType.ASTROPHYSICS_TECHNOLOGY:
      return planet.tech.astrophysicsTechnologyLevel;
    case TechnologyType.GRAVITON_TECHNOLOGY:
      return planet.tech.gravitonTechnologyLevel;
    default:
      return 0;
  }
}

function reserveFleetResources(
  proposal: BotProposal,
  shipsByOrigin: Map<string, Map<ShipType, { undamaged: number; damaged: number }>>,
  cargoByOrigin: Map<string, { metal: number; crystal: number; deuterium: number }>,
  fuelByOrigin: Map<string, number>
): void {
  const originCoordinates = readFleetOriginCoordinates(proposal);
  if (!originCoordinates) {
    return;
  }

  const originKey = toCoordinatesKey(originCoordinates);
  if (!shipsByOrigin.has(originKey)) {
    shipsByOrigin.set(originKey, new Map());
  }
  const shipReservations = shipsByOrigin.get(originKey)!;
  const fleetShips = Array.isArray(proposal.requestPayload.ships)
    ? proposal.requestPayload.ships as Array<{ type: ShipType; undamagedAmount?: number; damagedAmount?: number }>
    : [];
  for (const ship of fleetShips) {
    const existing = shipReservations.get(ship.type) ?? { undamaged: 0, damaged: 0 };
    existing.undamaged += Math.max(0, Math.floor(ship.undamagedAmount ?? 0));
    existing.damaged += Math.max(0, Math.floor(ship.damagedAmount ?? 0));
    shipReservations.set(ship.type, existing);
  }

  const existingCargo = cargoByOrigin.get(originKey) ?? { metal: 0, crystal: 0, deuterium: 0 };
  const cargo = proposal.requestPayload.cargo as Partial<{ metal: number; crystal: number; deuterium: number }> | undefined;
  existingCargo.metal += Math.max(0, Math.floor(cargo?.metal ?? 0));
  existingCargo.crystal += Math.max(0, Math.floor(cargo?.crystal ?? 0));
  existingCargo.deuterium += Math.max(0, Math.floor(cargo?.deuterium ?? 0));
  cargoByOrigin.set(originKey, existingCargo);

  const normalized = normalizeFleetExecutionProposal(proposal);
  if (normalized.ok) {
    fuelByOrigin.set(originKey, (fuelByOrigin.get(originKey) ?? 0) + resolveFleetFuelCost(normalized.value));
  }
}

function resolveFleetFuelCost(command: CreateFleetMissionCommand): number {
  const mission = FLEET_MISSION_REGISTRY.get(command.missionType);
  const minimumFuelReserves = mission?.minimumFuelReserves ?? 1;
  const distance = calculateTravelDistance(command.origin, command.target);
  return calculateFuelCost(
    command.ships.map((ship) => ({
      type: ship.type,
      amount: ship.undamagedAmount + ship.damagedAmount
    })),
    distance,
    minimumFuelReserves
  );
}
