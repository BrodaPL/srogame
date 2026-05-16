import type {
  BotProposal,
  BotSupervisor,
  BotSupervisorDecision,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type { BotMemoryV2 } from '../../../../src/app/models/player.ts';
import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import type { ShipType } from '../../../../src/app/models/enums/ship-type.ts';
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

const QUEUE_ACTION_KINDS = new Set<BotProposal['kind']>(['BUILDING', 'RESEARCH', 'SHIPYARD']);
const FLEET_ACTION_KINDS = new Set<BotProposal['kind']>(['FLEET_MISSION']);
const REQUEST_ACTION_KINDS = new Set<BotProposal['kind']>(['REQUEST_DECISION']);
const DIPLOMACY_ACTION_KINDS = new Set<BotProposal['kind']>(['DIPLOMACY_DECISION']);
const COMMITMENT_LIFETIME_TURNS = 5;
const DUPLICATE_REPLACEMENT_THRESHOLD = 1.25;
const NEXT_TURN_FLEET_PENDING_LIFETIME_TURNS = 1;

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
    const rejected: BotSupervisorDecision['rejected'] = [];
    const scored = allProposals
      .map((proposal) => this.scoreProposal(
        proposal,
        snapshot,
        memory,
        shipNeedPressure,
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
    let researchAccepted = false;
    const globalQueueCap = Math.max(1, snapshot.planets.length * 2);
    const maxFleetExecutions = resolveMaxFleetExecutions(snapshot);
    let acceptedFleetCount = 0;
    const fleetSlotCaps = resolveFleetSlotCaps(scored, maxFleetExecutions, memory);
    const fleetSlotsBySubsystem = new Map<string, number>();
    const criticalAccepted = scored.some((entry) => entry.proposal.subsystemId === 'CRITICAL');

    for (const entry of scored) {
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

        const fleetDecision = evaluateFleetProposal(snapshot, memory, entry, snapshot.turn);
        if (!fleetDecision.ok) {
          rejected.push({ proposalId: entry.proposal.proposalId, reason: fleetDecision.reason });
          continue;
        }

        if (fleetDecision.accepted) {
          accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
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
        researchAccepted
      );
      if (!queueDecision.ok) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: queueDecision.reason });
        continue;
      }

      if (queueDecision.accepted) {
        accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
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
      return {
        proposal,
        score: scoreSupervisorProposal({
          proposal,
          snapshot,
          memory,
          shipNeedPressure: 0,
          criticalAccepted: false
        }),
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
      return {
        proposal,
        score: scoreSupervisorProposal({
          proposal,
          snapshot,
          memory,
          shipNeedPressure: 0,
          criticalAccepted: false
        }) + 10000,
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
      return {
        proposal,
        score: scoreSupervisorProposal({
          proposal,
          snapshot,
          memory,
          shipNeedPressure: 0,
          criticalAccepted: false
        }),
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
      return {
        proposal,
        score: scoreSupervisorProposal({
          proposal,
          snapshot,
          memory,
          shipNeedPressure: 0,
          criticalAccepted: false
        }) + expiringBoost,
        adapterReason: null,
        retryCommitment
      };
    }
    if (!QUEUE_ACTION_KINDS.has(proposal.kind)) {
      return { proposal, score: 0, adapterReason: 'unsupported_execution_kind', retryCommitment };
    }

    const normalized = normalizeQueueExecutionProposal(proposal);
    if (!normalized.ok) {
      console.warn(`[BotV2 Supervisor] Invalid queue proposal ${proposal.proposalId}: ${normalized.reason}`);
      return { proposal, score: 0, adapterReason: normalized.reason, retryCommitment };
    }

    const pressure = proposal.kind === 'SHIPYARD'
      ? shipNeedPressure.get(resolveShipyardNeedKey(proposal) ?? '') ?? 0
      : 0;

    return {
      proposal,
      score: scoreSupervisorProposal({
        proposal,
        snapshot,
        memory,
        shipNeedPressure: pressure,
        criticalAccepted: false
      }),
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
    return planet.queues.hasActiveResearch ? 'queue_became_unavailable' : null;
  }

  return planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength
    ? 'queue_became_unavailable'
    : null;
}

function isLocallyAffordable(snapshot: BotWorldSnapshot, planetKey: string, proposal: BotProposal): boolean {
  const planet = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === planetKey);
  if (!planet) {
    return false;
  }

  return planet.localResources.metal >= proposal.requestedResources.metal
    && planet.localResources.crystal >= proposal.requestedResources.crystal
    && planet.localResources.deuterium >= proposal.requestedResources.deuterium;
}

function evaluateQueueProposal(
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2,
  entry: ScoredProposal,
  usedPlanetBuildSlots: Set<string>,
  usedPlanetShipyardSlots: Set<string>,
  researchAccepted: boolean
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

  const planetKey = `${normalized.value.command.x}:${normalized.value.command.y}:${normalized.value.command.z}`;
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

  const affordable = isLocallyAffordable(snapshot, planetKey, entry.proposal);

  return {
    ok: true,
    accepted: affordable || entry.proposal.subsystemId === 'CRITICAL',
    kind: normalized.value.kind,
    planetKey
  };
}

function evaluateFleetProposal(
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2,
  entry: ScoredProposal,
  turn: number
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

  const originKey = toCoordinatesKey(normalized.value.origin);
  const origin = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === originKey);
  if (!origin) {
    return { ok: false, reason: 'origin_planet_not_owned' };
  }

  const relationPrecheck = precheckFleetMissionRelation(entry.proposal);
  if (relationPrecheck) {
    return { ok: false, reason: relationPrecheck };
  }

  if (
    origin.localResources.metal < normalized.value.cargo.metal
    || origin.localResources.crystal < normalized.value.cargo.crystal
    || origin.localResources.deuterium < normalized.value.cargo.deuterium
  ) {
    return { ok: false, reason: 'cargo_resources_unavailable' };
  }

  const missingShips = resolveMissingFleetShips(origin, normalized.value.ships);
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
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>
): Array<{ type: ShipType; missingUndamagedAmount: number; missingDamagedAmount: number }> {
  const missing: Array<{ type: ShipType; missingUndamagedAmount: number; missingDamagedAmount: number }> = [];
  for (const ship of ships) {
    const undamaged = origin.ships.undamagedCountByType[ship.type] ?? 0;
    const damaged = origin.ships.damagedCountByType[ship.type] ?? 0;
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
