import type {
  BotProposal,
  BotSupervisor,
  BotSupervisorDecision,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type { BotMemoryV2 } from '../../../../src/app/models/player.ts';
import {
  calculateWeightedResourceValue,
  pruneSupervisorHistory,
  scoreSupervisorProposal
} from './bot-supervisor-scoring.js';
import { normalizeQueueExecutionProposal } from '../execution/bot-execution-adapters.js';

const QUEUE_ACTION_KINDS = new Set<BotProposal['kind']>(['BUILDING', 'RESEARCH', 'SHIPYARD']);
const COMMITMENT_LIFETIME_TURNS = 5;
const DUPLICATE_REPLACEMENT_THRESHOLD = 1.25;

type ScoredProposal = {
  proposal: BotProposal;
  score: number;
  adapterReason: string | null;
};

export class BotSupervisorV2 implements BotSupervisor {
  constructor(private readonly flags: BotV2FeatureFlags) {}

  public decide(
    snapshot: BotWorldSnapshot,
    memory: BotMemoryV2,
    proposals: BotProposal[]
  ): BotSupervisorDecision {
    pruneSupervisorHistory(memory, snapshot.turn);

    if (this.flags.mode === 'DISABLED' || proposals.length === 0) {
      return this.rejectAll(proposals, 'supervisor_disabled');
    }

    const shipNeedPressure = buildShipNeedPressure(proposals);
    const rejected: BotSupervisorDecision['rejected'] = [];
    const scored = proposals
      .map((proposal) => this.scoreProposal(proposal, snapshot, memory, shipNeedPressure))
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
        right.score - left.score || left.proposal.proposalId.localeCompare(right.proposal.proposalId)
      );

    if (this.flags.mode === 'SHADOW') {
      return {
        accepted: [],
        pending: [],
        rejected: proposals.map((proposal) => ({
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
    const criticalAccepted = scored.some((entry) => entry.proposal.subsystemId === 'CRITICAL');

    for (const entry of scored) {
      if (accepted.length + pending.length >= globalQueueCap) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'global_queue_cap_reached' });
        continue;
      }

      const normalized = normalizeQueueExecutionProposal(entry.proposal);
      if (!normalized.ok) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: normalized.reason });
        continue;
      }

      const planetKey = `${normalized.value.command.x}:${normalized.value.command.y}:${normalized.value.command.z}`;
      if (normalized.value.kind === 'RESEARCH' && researchAccepted) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'research_global_cap_reached' });
        continue;
      }
      if (
        (normalized.value.kind === 'BUILDING' || normalized.value.kind === 'RESEARCH')
        && usedPlanetBuildSlots.has(planetKey)
      ) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'planet_build_slot_taken' });
        continue;
      }
      if (normalized.value.kind === 'SHIPYARD' && usedPlanetShipyardSlots.has(planetKey)) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'planet_shipyard_slot_taken' });
        continue;
      }

      const queuePrecheck = precheckQueue(snapshot, normalized.value.kind, planetKey);
      if (queuePrecheck) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: queuePrecheck });
        continue;
      }

      const affordable = isLocallyAffordable(snapshot, planetKey, entry.proposal);
      const duplicate = memory.supervisor.pendingCommitments.find((commitment) =>
        commitment.dedupeKey === entry.proposal.dedupeKey
      );
      if (duplicate && entry.score < duplicate.score * DUPLICATE_REPLACEMENT_THRESHOLD) {
        rejected.push({ proposalId: entry.proposal.proposalId, reason: 'already_committed' });
        continue;
      }

      if (affordable || entry.proposal.subsystemId === 'CRITICAL') {
        accepted.push({ ...entry.proposal, status: 'ACCEPTED' });
      } else {
        pending.push({ ...entry.proposal, status: 'ACCEPTED' });
        upsertPendingCommitment(memory, entry, snapshot.turn);
      }

      if (normalized.value.kind === 'RESEARCH') {
        researchAccepted = true;
      }
      if (normalized.value.kind === 'BUILDING' || normalized.value.kind === 'RESEARCH') {
        usedPlanetBuildSlots.add(planetKey);
      }
      if (normalized.value.kind === 'SHIPYARD') {
        usedPlanetShipyardSlots.add(planetKey);
      }
    }

    appendProposalHistory(memory, snapshot.turn, accepted, pending, rejected, proposals);

    return {
      accepted,
      pending,
      rejected,
      debug: {
        mode: 'LIVE',
        acceptedCount: accepted.length,
        pendingCount: pending.length,
        rejectedCount: rejected.length,
        criticalAccepted
      }
    };
  }

  private scoreProposal(
    proposal: BotProposal,
    snapshot: BotWorldSnapshot,
    memory: BotMemoryV2,
    shipNeedPressure: Map<string, number>
  ): ScoredProposal | null {
    if (proposal.status === 'BLOCKED' || proposal.blockers.length > 0) {
      return {
        proposal,
        score: 0,
        adapterReason: 'proposal_blocked'
      };
    }

    if (proposal.kind === 'FLEET_MISSION') {
      // TODO: Supervisor phase 2 should execute fleet missions and verify Jump Gate default-use mechanics.
      return { proposal, score: 0, adapterReason: 'fleet_execution_deferred' };
    }
    if (proposal.kind === 'MAINTENANCE_REQUEST') {
      // TODO: Extract request command policy before enabling Supervisor request handling.
      return { proposal, score: 0, adapterReason: 'request_handling_deferred' };
    }
    if (!QUEUE_ACTION_KINDS.has(proposal.kind)) {
      return { proposal, score: 0, adapterReason: 'unsupported_execution_kind' };
    }

    const normalized = normalizeQueueExecutionProposal(proposal);
    if (!normalized.ok) {
      return { proposal, score: 0, adapterReason: normalized.reason };
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
      adapterReason: null
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

function upsertPendingCommitment(memory: BotMemoryV2, entry: ScoredProposal, turn: number): void {
  const existingIndex = memory.supervisor.pendingCommitments.findIndex((commitment) =>
    commitment.dedupeKey === entry.proposal.dedupeKey
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
