import type {
  BotPlanetSnapshot,
  BotProposal,
  BotProposalBudgetAttribution,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type {
  BotMemoryV2,
  BotMemoryV2BudgetScope,
  BotMemoryV2SupervisorBudgetSpendingEntry,
  BotV2SubsystemId
} from '../../../../src/app/models/player.ts';

export const NORMAL_WEIGHTED_SUBSYSTEMS: BotV2SubsystemId[] = [
  'ECONOMIC',
  'DEFENSIVE',
  'WARFARE',
  'RESEARCH',
  'STRATEGIC_DEVELOPMENT',
  'STRATEGIC_MILITARY',
  'STRATEGIC_DIPLOMATIC'
];

export const LOCAL_SUBSYSTEMS = new Set<BotV2SubsystemId>(['ECONOMIC', 'DEFENSIVE', 'WARFARE']);

export type BudgetStatus = 'UNDER_BUDGET' | 'ON_BUDGET' | 'OVER_BUDGET' | 'SEVERELY_OVER_BUDGET';

export type BudgetLaneState = {
  scope: BotProposalBudgetAttribution['scope'];
  lane: 'PLANETARY' | 'IMPERIUM';
  planetKey: string | null;
  subsystemId: BotV2SubsystemId;
  targetShare: number;
  currentShare: number;
  drift: number;
  status: BudgetStatus;
  windowTurns: number;
  totalWeightedValue: number;
};

export type ProposalBudgetState = {
  attribution: BotProposalBudgetAttribution;
  primary: BudgetLaneState | null;
  lanes: BudgetLaneState[];
};

const BUDGET_DRIFT_THRESHOLD = 0.10;
const SEVERE_OVER_BUDGET_DRIFT_THRESHOLD = 0.20;

export function resolveProposalBudgetState(input: {
  proposal: BotProposal;
  snapshot: BotWorldSnapshot;
  memory: BotMemoryV2;
}): ProposalBudgetState {
  const attribution = resolveProposalBudgetAttribution(input.proposal, input.snapshot, input.memory);
  const lanes = resolveAttributionLaneStates(attribution, input.snapshot, input.memory);
  return {
    attribution,
    primary: lanes.find((entry) => entry.status === 'SEVERELY_OVER_BUDGET')
      ?? lanes.find((entry) => entry.status === 'OVER_BUDGET')
      ?? lanes.find((entry) => entry.status === 'UNDER_BUDGET')
      ?? lanes[0]
      ?? null,
    lanes
  };
}

export function resolveProposalBudgetAttribution(
  proposal: BotProposal,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): BotProposalBudgetAttribution {
  if (proposal.budgetAttribution) {
    return proposal.budgetAttribution;
  }
  if (proposal.subsystemId === 'CRITICAL') {
    return {
      scope: 'NONE',
      planetKey: null,
      intentSubsystemId: proposal.subsystemId,
      executorSubsystemId: proposal.subsystemId
    };
  }

  const planet = findMatchingPlanet(snapshot, proposal);
  const planetKey = planet ? toCoordinatesKey(planet.coordinates) : null;
  const weightEntry = planetKey
    ? memory.weightManager.planets.find((entry) => toCoordinatesKey(entry.coordinates) === planetKey) ?? null
    : null;

  if (LOCAL_SUBSYSTEMS.has(proposal.subsystemId)) {
    return {
      scope: resolveFallbackLocalBudgetScope(weightEntry?.budgetScope),
      planetKey,
      intentSubsystemId: proposal.subsystemId,
      executorSubsystemId: proposal.subsystemId
    };
  }

  return {
    scope: 'IMPERIUM',
    planetKey,
    intentSubsystemId: proposal.subsystemId,
    executorSubsystemId: proposal.subsystemId
  };
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

export function resolveBothPlanetaryShare(
  attribution: Pick<BotProposalBudgetAttribution, 'planetKey'>,
  memory: BotMemoryV2
): number {
  if (!attribution.planetKey) {
    return 0.5;
  }
  const planet = memory.weightManager.planets.find((entry) => toCoordinatesKey(entry.coordinates) === attribution.planetKey);
  switch (planet?.budgetScope) {
    case 'PLANETARY_ONLY':
      return 1;
    case 'PLANETARY_DOMINANT':
      return 0.75;
    case 'IMPERIUM_ONLY':
      return 0;
    case 'HYBRID':
    default:
      return 0.5;
  }
}

export function resolveBudgetWindowForAvgIndustry(avgIndustry: number): number {
  const normalizedAvgIndustry = Math.max(0, avgIndustry);
  return clamp(
    5 + fibonacci(Math.floor(normalizedAvgIndustry * 1.5)) + Math.floor(normalizedAvgIndustry * 4),
    10,
    100
  );
}

export function resolveMatchingPlanet(snapshot: BotWorldSnapshot, proposal: BotProposal): BotPlanetSnapshot | null {
  return findMatchingPlanet(snapshot, proposal);
}

export function toCoordinatesKey(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

export function resolveMemoryWeights(memory: BotMemoryV2): Partial<Record<BotV2SubsystemId, number>> {
  return {
    ECONOMIC: averageLocalWeight(memory, 'economicWeight'),
    DEFENSIVE: averageLocalWeight(memory, 'defensiveWeight'),
    WARFARE: averageLocalWeight(memory, 'warfareWeight'),
    RESEARCH: memory.weightManager.researchWeight || 50,
    STRATEGIC_DEVELOPMENT: memory.weightManager.strategicDevelopmentWeight || 50,
    STRATEGIC_MILITARY: memory.weightManager.strategicMilitaryWeight || 50,
    STRATEGIC_DIPLOMATIC: memory.weightManager.strategicDiplomaticWeight || 50
  };
}

export function resolveStrategicProposalWeight(
  subsystemId: BotV2SubsystemId,
  memory: BotMemoryV2
): number {
  switch (subsystemId) {
    case 'RESEARCH':
      return memory.weightManager.researchWeight || 50;
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

function resolveAttributionLaneStates(
  attribution: BotProposalBudgetAttribution,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): BudgetLaneState[] {
  if (
    attribution.scope === 'NONE'
    || !NORMAL_WEIGHTED_SUBSYSTEMS.includes(attribution.intentSubsystemId)
  ) {
    return [];
  }

  if (attribution.scope === 'PLANETARY') {
    const state = resolvePlanetaryBudgetState(attribution, snapshot, memory);
    return state ? [state] : [];
  }
  if (attribution.scope === 'IMPERIUM') {
    return [resolveImperiumBudgetState(attribution, snapshot, memory)];
  }

  const planetaryShare = resolveBothPlanetaryShare(attribution, memory);
  const lanes: BudgetLaneState[] = [];
  if (planetaryShare > 0) {
    const planetary = resolvePlanetaryBudgetState(attribution, snapshot, memory);
    if (planetary) {
      lanes.push(planetary);
    }
  }
  if (planetaryShare < 1) {
    lanes.push(resolveImperiumBudgetState(attribution, snapshot, memory));
  }
  return lanes;
}

function resolvePlanetaryBudgetState(
  attribution: BotProposalBudgetAttribution,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): BudgetLaneState | null {
  if (!LOCAL_SUBSYSTEMS.has(attribution.intentSubsystemId) || !attribution.planetKey) {
    return null;
  }

  const weightEntry = memory.weightManager.planets.find((entry) => toCoordinatesKey(entry.coordinates) === attribution.planetKey);
  const snapshotPlanet = snapshot.planets.find((entry) => toCoordinatesKey(entry.coordinates) === attribution.planetKey);
  if (!weightEntry && !snapshotPlanet) {
    return null;
  }

  const weights: Partial<Record<BotV2SubsystemId, number>> = {
    ECONOMIC: weightEntry?.economicWeight ?? 50,
    DEFENSIVE: weightEntry?.defensiveWeight ?? 50,
    WARFARE: weightEntry?.warfareWeight ?? 50,
    RESEARCH: 0,
    STRATEGIC_DEVELOPMENT: 0,
    STRATEGIC_MILITARY: 0,
    STRATEGIC_DIPLOMATIC: 0
  };
  const avgIndustry = weightEntry?.avgIndustry ?? snapshotPlanet?.defense.avgIndustryLevel ?? 0;
  const windowTurns = resolveBudgetWindowForAvgIndustry(avgIndustry);
  return resolveLedgerBudgetState({
    scope: 'PLANETARY',
    lane: 'PLANETARY',
    planetKey: attribution.planetKey,
    subsystemId: attribution.intentSubsystemId,
    turn: snapshot.turn,
    windowTurns,
    ledger: [
      ...memory.supervisor.planetarySpendingHistory.filter((entry) => entry.planetKey === attribution.planetKey),
      ...buildPendingBudgetLedger(memory, snapshot.turn, 'PLANETARY', attribution.planetKey)
    ],
    weights
  });
}

function resolveImperiumBudgetState(
  attribution: BotProposalBudgetAttribution,
  snapshot: BotWorldSnapshot,
  memory: BotMemoryV2
): BudgetLaneState {
  const avgIndustry = resolveImperiumBudgetAvgIndustry(memory);
  const windowTurns = resolveBudgetWindowForAvgIndustry(avgIndustry);
  return resolveLedgerBudgetState({
    scope: 'IMPERIUM',
    lane: 'IMPERIUM',
    planetKey: attribution.planetKey,
    subsystemId: attribution.intentSubsystemId,
    turn: snapshot.turn,
    windowTurns,
    ledger: [
      ...memory.supervisor.imperiumSpendingHistory,
      ...buildPendingBudgetLedger(memory, snapshot.turn, 'IMPERIUM', null)
    ],
    weights: resolveMemoryWeights(memory)
  });
}

function resolveLedgerBudgetState(input: {
  scope: BotProposalBudgetAttribution['scope'];
  lane: 'PLANETARY' | 'IMPERIUM';
  planetKey: string | null;
  subsystemId: BotV2SubsystemId;
  turn: number;
  windowTurns: number;
  ledger: BotMemoryV2SupervisorBudgetSpendingEntry[];
  weights: Partial<Record<BotV2SubsystemId, number>>;
}): BudgetLaneState {
  const shares = resolveTargetShares(input.weights);
  const targetShare = shares[input.subsystemId] ?? (1 / NORMAL_WEIGHTED_SUBSYSTEMS.length);
  const startTurn = Math.max(0, input.turn - input.windowTurns + 1);
  const spending = input.ledger.filter((entry) => entry.turn >= startTurn && entry.turn <= input.turn);
  const totalWeightedValue = spending.reduce((sum, entry) => sum + entry.weightedResourceValue, 0);
  const currentShare = totalWeightedValue > 0
    ? spending
      .filter((entry) => entry.subsystemId === input.subsystemId)
      .reduce((sum, entry) => sum + entry.weightedResourceValue, 0) / totalWeightedValue
    : 0;
  const drift = targetShare - currentShare;
  return {
    scope: input.scope,
    lane: input.lane,
    planetKey: input.planetKey,
    subsystemId: input.subsystemId,
    targetShare,
    currentShare,
    drift,
    status: resolveBudgetStatus(drift),
    windowTurns: input.windowTurns,
    totalWeightedValue
  };
}

function resolveBudgetStatus(drift: number): BudgetStatus {
  if (drift >= BUDGET_DRIFT_THRESHOLD) {
    return 'UNDER_BUDGET';
  }
  if (drift <= -SEVERE_OVER_BUDGET_DRIFT_THRESHOLD) {
    return 'SEVERELY_OVER_BUDGET';
  }
  if (drift <= -BUDGET_DRIFT_THRESHOLD) {
    return 'OVER_BUDGET';
  }
  return 'ON_BUDGET';
}

function buildPendingBudgetLedger(
  memory: BotMemoryV2,
  turn: number,
  lane: 'PLANETARY' | 'IMPERIUM',
  planetKey: string | null
): BotMemoryV2SupervisorBudgetSpendingEntry[] {
  return memory.supervisor.pendingCommitments
    .filter((commitment) =>
      (commitment.status === 'PENDING_RESOURCES'
        || commitment.status === 'PENDING_QUEUE'
        || commitment.status === 'PENDING_SHIPS_NEXT_TURN')
      && commitment.expiresOnTurn >= turn
      && (lane === 'IMPERIUM' || commitment.budgetPlanetKey === planetKey)
    )
    .map((commitment): BotMemoryV2SupervisorBudgetSpendingEntry | null => {
      const share = resolvePendingBudgetLaneShare(memory, commitment.budgetScope, commitment.budgetPlanetKey, lane);
      if (share <= 0) {
        return null;
      }
      return {
        turn: commitment.updatedTurn,
        proposalId: commitment.proposalId,
        dedupeKey: commitment.dedupeKey,
        subsystemId: commitment.budgetIntentSubsystemId,
        kind: commitment.kind,
        targetCoordinates: commitment.targetCoordinates,
        planetKey: commitment.budgetPlanetKey,
        lane,
        resources: {
          metal: Math.round(commitment.requestedResources.metal * share),
          crystal: Math.round(commitment.requestedResources.crystal * share),
          deuterium: Math.round(commitment.requestedResources.deuterium * share)
        },
        weightedResourceValue: commitment.weightedResourceValue * share
      };
    })
    .filter((entry): entry is BotMemoryV2SupervisorBudgetSpendingEntry => entry !== null);
}

function resolvePendingBudgetLaneShare(
  memory: BotMemoryV2,
  scope: 'PLANETARY' | 'IMPERIUM' | 'BOTH' | 'NONE',
  planetKey: string | null,
  lane: 'PLANETARY' | 'IMPERIUM'
): number {
  if (scope === 'NONE') {
    return 0;
  }
  if (scope === lane) {
    return 1;
  }
  if (scope !== 'BOTH') {
    return 0;
  }
  const planetaryShare = resolveBothPlanetaryShare({ planetKey }, memory);
  return lane === 'PLANETARY' ? planetaryShare : 1 - planetaryShare;
}

function resolveImperiumBudgetAvgIndustry(memory: BotMemoryV2): number {
  const participants = memory.weightManager.planets.filter((entry) =>
    entry.maturePlanet || entry.developedPlanet || entry.budgetScope === 'HYBRID' || entry.budgetScope === 'IMPERIUM_ONLY'
  );
  const source = participants.length > 0 ? participants : memory.weightManager.planets;
  if (source.length === 0) {
    return 0;
  }
  return source.reduce((sum, entry) => sum + entry.avgIndustry, 0) / source.length;
}

function resolveFallbackLocalBudgetScope(scope: BotMemoryV2BudgetScope | undefined): BotProposalBudgetAttribution['scope'] {
  switch (scope) {
    case 'HYBRID':
      return 'BOTH';
    case 'IMPERIUM_ONLY':
      return 'IMPERIUM';
    case 'PLANETARY_DOMINANT':
    case 'PLANETARY_ONLY':
    default:
      return 'PLANETARY';
  }
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

function fibonacci(index: number): number {
  if (index <= 0) {
    return 0;
  }
  let previous = 0;
  let current = 1;
  for (let i = 1; i < index; i += 1) {
    [previous, current] = [current, previous + current];
  }
  return current;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
