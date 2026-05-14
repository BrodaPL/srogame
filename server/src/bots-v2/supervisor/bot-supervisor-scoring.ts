import type {
  BotPlanetSnapshot,
  BotProposal,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type {
  BotMemoryV2,
  BotMemoryV2SupervisorSpendingEntry,
  BotV2SubsystemId
} from '../../../../src/app/models/player.ts';

const NORMAL_WEIGHTED_SUBSYSTEMS: BotV2SubsystemId[] = [
  'ECONOMIC',
  'DEFENSIVE',
  'WARFARE',
  'STRATEGIC_DEVELOPMENT',
  'STRATEGIC_MILITARY',
  'STRATEGIC_DIPLOMATIC'
];

const LOCAL_SUBSYSTEMS = new Set<BotV2SubsystemId>(['ECONOMIC', 'DEFENSIVE', 'WARFARE']);

export function calculateWeightedResourceValue(resources: {
  metal: number;
  crystal: number;
  deuterium: number;
}): number {
  return resources.metal + (resources.crystal * 1.8) + (resources.deuterium * 2.6);
}

export function calculateRawProposalScore(proposal: BotProposal): number {
  return proposal.expectedValue
    + (proposal.urgency * 0.5)
    + (proposal.confidence * 0.25)
    - (proposal.risk * 0.25);
}

export function scoreSupervisorProposal(input: {
  proposal: BotProposal;
  snapshot: BotWorldSnapshot;
  memory: BotMemoryV2;
  shipNeedPressure: number;
  criticalAccepted: boolean;
}): number {
  const rawScore = calculateRawProposalScore(input.proposal);
  if (input.proposal.subsystemId === 'CRITICAL') {
    return (rawScore * 10) + 10000;
  }

  const weight = resolveProposalWeight(input.proposal, input.snapshot, input.memory);
  const weightMultiplier = weight <= 0 ? 0.5 : Math.max(0.25, weight / 50);
  const alignmentMultiplier = input.criticalAccepted
    ? 1
    : resolveResourceAlignmentMultiplier(input.proposal.subsystemId, input.snapshot.turn, input.memory);
  const shipNeedMultiplier = input.shipNeedPressure > 0
    ? 1 + Math.min(0.5, input.shipNeedPressure / 100)
    : 1;

  return rawScore * weightMultiplier * alignmentMultiplier * shipNeedMultiplier;
}

export function resolveProposalWeight(
  proposal: BotProposal,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): number {
  if (!NORMAL_WEIGHTED_SUBSYSTEMS.includes(proposal.subsystemId)) {
    return 0;
  }

  if (LOCAL_SUBSYSTEMS.has(proposal.subsystemId)) {
    const planet = findMatchingPlanet(snapshot, proposal);
    const weightEntry = planet
      ? memory.weightManager.planets.find((entry) =>
        entry.coordinates.x === planet.coordinates.x
        && entry.coordinates.y === planet.coordinates.y
        && entry.coordinates.z === planet.coordinates.z
      ) ?? null
      : null;
    if (!weightEntry) {
      return 50;
    }

    switch (proposal.subsystemId) {
      case 'ECONOMIC':
        return weightEntry.economicWeight;
      case 'DEFENSIVE':
        return weightEntry.defensiveWeight;
      case 'WARFARE':
        return weightEntry.warfareWeight;
      default:
        return 50;
    }
  }

  return resolveStrategicProposalWeight(proposal.subsystemId, memory);
}

export function resolveStrategicProposalWeight(
  subsystemId: BotV2SubsystemId,
  memory: BotMemoryV2
): number {
  switch (subsystemId) {
    case 'STRATEGIC_DEVELOPMENT':
      return memory.weightManager.strategicDevelopmentWeight || 50;
    case 'STRATEGIC_MILITARY':
      return memory.weightManager.strategicMilitaryWeight || 50;
    case 'STRATEGIC_DIPLOMATIC':
      return memory.weightManager.strategicDiplomaticWeight || 50;
    default:
      return 50;
  }
}

export function resolveTargetShares(weights: Partial<Record<BotV2SubsystemId, number>>): Partial<Record<BotV2SubsystemId, number>> {
  const active = NORMAL_WEIGHTED_SUBSYSTEMS.map((subsystemId) => ({
    subsystemId,
    weight: Math.max(0, weights[subsystemId] ?? 50)
  }));
  const total = active.reduce((sum, entry) => sum + entry.weight, 0) || active.length;
  const result: Partial<Record<BotV2SubsystemId, number>> = {};
  for (const entry of active) {
    result[entry.subsystemId] = entry.weight / total;
  }
  return result;
}

function resolveResourceAlignmentMultiplier(
  subsystemId: BotV2SubsystemId,
  turn: number,
  memory: BotMemoryV2
): number {
  if (!NORMAL_WEIGHTED_SUBSYSTEMS.includes(subsystemId)) {
    return 1;
  }

  const weights = resolveMemoryWeights(memory);
  const shares = resolveTargetShares(weights);
  const targetShare = shares[subsystemId] ?? (1 / NORMAL_WEIGHTED_SUBSYSTEMS.length);
  const spending = memory.supervisor.spendingHistory
    .filter((entry) => turn - entry.turn <= 40);
  const total = spending.reduce((sum, entry) => sum + entry.weightedResourceValue, 0);
  if (total <= 0) {
    return 1;
  }

  const currentShare = spending
    .filter((entry) => entry.subsystemId === subsystemId)
    .reduce((sum, entry) => sum + entry.weightedResourceValue, 0) / total;
  const drift = targetShare - currentShare;
  if (drift > 0) {
    return 1 + Math.min(0.25, Math.floor((drift * 100) / 10) * 0.05);
  }

  return 1 - Math.min(0.4, Math.floor((Math.abs(drift) * 100) / 10) * 0.05);
}

function resolveMemoryWeights(memory: BotMemoryV2): Partial<Record<BotV2SubsystemId, number>> {
  return {
    ECONOMIC: averageLocalWeight(memory, 'economicWeight'),
    DEFENSIVE: averageLocalWeight(memory, 'defensiveWeight'),
    WARFARE: averageLocalWeight(memory, 'warfareWeight'),
    STRATEGIC_DEVELOPMENT: memory.weightManager.strategicDevelopmentWeight || 50,
    STRATEGIC_MILITARY: memory.weightManager.strategicMilitaryWeight || 50,
    STRATEGIC_DIPLOMATIC: memory.weightManager.strategicDiplomaticWeight || 50
  };
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

function findMatchingPlanet(snapshot: BotWorldSnapshot, proposal: BotProposal): BotPlanetSnapshot | null {
  const target = proposal.targetCoordinates ?? readPayloadCoordinates(proposal.requestPayload);
  if (!target) {
    return null;
  }

  return snapshot.planets.find((planet) =>
    planet.coordinates.x === target.x
    && planet.coordinates.y === target.y
    && planet.coordinates.z === target.z
  ) ?? null;
}

function readPayloadCoordinates(payload: Record<string, unknown>): { x: number; y: number; z: number } | null {
  const source = payload.targetCoordinates && typeof payload.targetCoordinates === 'object'
    ? payload.targetCoordinates as Record<string, unknown>
    : payload;
  const x = Number(source.x);
  const y = Number(source.y);
  const z = Number(source.z);
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return null;
  }
  return { x, y, z };
}

export function pruneSupervisorHistory(memory: BotMemoryV2, turn: number): void {
  memory.supervisor.spendingHistory = memory.supervisor.spendingHistory
    .filter((entry: BotMemoryV2SupervisorSpendingEntry) => turn - entry.turn <= 40);
  memory.supervisor.proposalHistory = memory.supervisor.proposalHistory
    .filter((entry) => turn - entry.turn <= 40);
  memory.supervisor.pendingCommitments = memory.supervisor.pendingCommitments
    .filter((entry) => turn - entry.updatedTurn <= 40);
}
