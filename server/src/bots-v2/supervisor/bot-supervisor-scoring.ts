import type {
  BotProposal,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type {
  BotMemoryV2,
  BotMemoryV2SupervisorSpendingEntry,
  BotV2SubsystemId
} from '../../../../src/app/models/player.ts';
import {
  LOCAL_SUBSYSTEMS,
  NORMAL_WEIGHTED_SUBSYSTEMS,
  resolveMatchingPlanet,
  resolveProposalBudgetState,
  resolveStrategicProposalWeight
} from './bot-supervisor-budgeting.js';

export {
  resolveProposalBudgetAttribution,
  resolveTargetShares
} from './bot-supervisor-budgeting.js';

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
  const weightMultiplier = weight <= 0 ? 0 : Math.max(0.25, weight / 50);
  const alignmentMultiplier = input.criticalAccepted
    ? 1
    : resolveResourceAlignmentMultiplier(input.proposal, input.snapshot, input.memory);
  const shipNeedMultiplier = input.shipNeedPressure > 0
    ? 1 + Math.min(0.75, input.shipNeedPressure / 100)
    : 1;

  return rawScore * weightMultiplier * alignmentMultiplier * shipNeedMultiplier;
}

export function resolveProposalWeight(
  proposal: BotProposal,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): number {
  const weightedSubsystemId = proposal.budgetAttribution?.intentSubsystemId ?? proposal.subsystemId;
  if (!NORMAL_WEIGHTED_SUBSYSTEMS.includes(weightedSubsystemId)) {
    return 0;
  }

  if (LOCAL_SUBSYSTEMS.has(weightedSubsystemId)) {
    const planet = resolveMatchingPlanet(snapshot, proposal);
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

    switch (weightedSubsystemId) {
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

  return resolveStrategicProposalWeight(weightedSubsystemId, memory);
}

function resolveResourceAlignmentMultiplier(
  proposal: BotProposal,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): number {
  const budgetState = resolveProposalBudgetState({ proposal, snapshot, memory });
  if (budgetState.lanes.length === 0) {
    return 1;
  }

  return budgetState.lanes.reduce((sum, lane) => sum + resolveLaneAlignmentMultiplier(lane.drift), 0)
    / budgetState.lanes.length;
}

function resolveLaneAlignmentMultiplier(drift: number): number {
  if (drift > 0) {
    return 1 + Math.min(0.25, Math.floor((drift * 100) / 10) * 0.05);
  }

  return 1 - Math.min(0.4, Math.floor((Math.abs(drift) * 100) / 10) * 0.05);
}

export function pruneSupervisorHistory(memory: BotMemoryV2, turn: number): void {
  memory.supervisor.spendingHistory = memory.supervisor.spendingHistory
    .filter((entry: BotMemoryV2SupervisorSpendingEntry) => turn - entry.turn <= 40);
  memory.supervisor.planetarySpendingHistory = memory.supervisor.planetarySpendingHistory
    .filter((entry) => turn - entry.turn <= 100);
  memory.supervisor.imperiumSpendingHistory = memory.supervisor.imperiumSpendingHistory
    .filter((entry) => turn - entry.turn <= 100);
  memory.supervisor.fuelSpendingHistory = memory.supervisor.fuelSpendingHistory
    .filter((entry) => turn - entry.turn <= 40);
  memory.supervisor.proposalHistory = memory.supervisor.proposalHistory
    .filter((entry) => turn - entry.turn <= 40);
  memory.supervisor.pendingCommitments = memory.supervisor.pendingCommitments
    .filter((entry) => turn - entry.updatedTurn <= 100);
}
