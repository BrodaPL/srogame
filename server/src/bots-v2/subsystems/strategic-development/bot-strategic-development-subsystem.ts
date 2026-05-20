import * as buildingTypeModule from '../../../../../src/app/models/enums/building-type.js';
import * as fleetMissionTypeModule from '../../../../../src/app/models/enums/fleet-mission-type.js';
import * as shipTypeModule from '../../../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../../../src/app/models/enums/technology-type.js';
import * as technologyEffectsModule from '../../../../../src/app/models/tech/technology-effects.js';
import * as repairDroneProductionModule from '../../../../../src/app/models/turns/repair-drone-production.js';
import type { Technology } from '../../../../../src/app/models/tech/technology.ts';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotProposalKind,
  BotStrategicDevelopmentGoal,
  BotStrategicDevelopmentPlanetResult,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  calculateFuelCost,
  calculateTravelDistance,
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import {
  resolveEffectiveInfrastructureDamagePercent,
  resolvePrioritizedInfrastructureDamagePoints
} from '../../infrastructure-damage.js';
import { resolveModule } from '../../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../../src/app/models/enums/building-type.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeModule) as typeof import('../../../../../src/app/models/enums/fleet-mission-type.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../../src/app/models/enums/technology-type.js');
const {
  industryPowerMultiplier,
  maxOwnedPlanets,
  researchPowerMultiplier
} = resolveModule(technologyEffectsModule) as typeof import('../../../../../src/app/models/tech/technology-effects.js');
const {
  calculateRepairDroneProductionBasePower,
  routeRepairDroneProduction
} = resolveModule(repairDroneProductionModule) as typeof import('../../../../../src/app/models/turns/repair-drone-production.js');

type ResourceKey = 'metal' | 'crystal' | 'deuterium';

type ResourceAmounts = Record<ResourceKey, number>;

type SimulatedState = {
  buildingLevels: Map<BuildingType, number>;
  techLevels: Map<TechnologyType, number>;
};

type SimulatedThroughput = {
  energyEfficiency: number;
  industryPower: number;
  researchPower: number;
  shipyardPower: number;
};

type BuildingStep = {
  kind: 'BUILDING';
  buildingType: BuildingType;
  nextLevel: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type ResearchStep = {
  kind: 'RESEARCH';
  technologyType: TechnologyType;
  nextLevel: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type ProductionStep = {
  kind: 'SHIPYARD';
  shipType: ShipType;
  amount: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type StrategicDevelopmentGoalEvaluation = BotStrategicDevelopmentGoal & {
  immediateRequest: BuildingStep | ResearchStep | ProductionStep | null;
  selectedRequestKind: BotProposalKind;
};

type FleetMissionImmediateRequest = {
  kind: 'FLEET_MISSION';
  missionType: FleetMissionType;
  originPlanet: BotPlanetSnapshot;
  targetCoordinates: { x: number; y: number; z: number };
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>;
  cargo: ResourceAmounts;
  repairDroneAmount: number;
  priorityBand: number;
  sourceDistance: number;
  summaryLabel: string;
};

type PlanetStrategicDevelopmentEvaluationResult = {
  proposals: BotProposal[];
  goals: BotStrategicDevelopmentGoal[];
  planetResult: BotStrategicDevelopmentPlanetResult;
  selectedBuildingGoals: StrategicDevelopmentGoalEvaluation[];
  selectedProductionGoals: StrategicDevelopmentGoalEvaluation[];
};

const TARGET_BUILDING_TYPES = [
  BuildingType.INTERSTELLAR_TRADE_PORT,
  BuildingType.JUMP_GATE,
  BuildingType.RESEARCH_LAB,
  BuildingType.SENSOR_PHALANX
] as const;

const TARGET_PRODUCTION_SHIP_TYPES = [
  ShipType.COLONIZER,
  ShipType.TRANSPORTER,
  ShipType.MASS_HAULER,
  ShipType.CARGO_SUPPORT,
  ShipType.REPAIR_DRONE
] as const;

const ALLOWED_STRATEGIC_DEVELOPMENT_BUILDING_SCOPE = new Set<BuildingType>([
  BuildingType.INTERSTELLAR_TRADE_PORT,
  BuildingType.JUMP_GATE,
  BuildingType.RESEARCH_LAB,
  BuildingType.SENSOR_PHALANX,
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.SHIPYARD,
  BuildingType.NANITE_FACTORY
]);

const BONUS_FACTOR_CEILING = 3;
const MAX_BUILDING_GOALS_PER_PLANET = 2;
const MAX_PRODUCTION_GOALS_PER_PLANET = 2;
const LOW_INDUSTRY_REPAIR_DRONE_THRESHOLD = 2.5;
const STRATEGIC_DEVELOPMENT_AVAILABILITY = 0.4;
const NANITE_BONUS_FACTOR = 1.22;
const ROBOTICS_PENALTY_FACTOR = 1.12;
const COLONIZER_IDLE_CAP = 1;

export class BotStrategicDevelopmentSubsystem implements BotSubsystem {
  public readonly subsystemId = 'STRATEGIC_DEVELOPMENT' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const proposals: BotProposal[] = [];
    const goals: BotStrategicDevelopmentGoal[] = [];
    const planetResults: BotStrategicDevelopmentPlanetResult[] = [];
    const localResults: PlanetStrategicDevelopmentEvaluationResult[] = [];
    let blockedPlanetCount = 0;

    for (const planet of context.snapshot.planets) {
      const planetResult = buildPlanetStrategicDevelopmentResult(context, planet);
      if (planetResult.proposals.length === 0) {
        blockedPlanetCount += 1;
      }

      localResults.push(planetResult);
      proposals.push(...planetResult.proposals);
      goals.push(...planetResult.goals);
      planetResults.push(planetResult.planetResult);
    }
    const globalMissionProposals = createGlobalMissionProposals(context, localResults);
    proposals.push(...globalMissionProposals);

    return {
      subsystemId: this.subsystemId,
      proposals,
      goals,
      planetResults,
      debug: {
        blockedPlanetCount,
        goalCount: goals.length,
        maxBuildingGoalsPerPlanet: MAX_BUILDING_GOALS_PER_PLANET,
        maxProductionGoalsPerPlanet: MAX_PRODUCTION_GOALS_PER_PLANET,
        globalMissionRequestCount: globalMissionProposals.length,
        missionRequestCap: resolveMissionRequestCap(context),
        missionAvailabilityTarget: STRATEGIC_DEVELOPMENT_AVAILABILITY,
        // TODO: Revisit the shared strategic queue contract once all strategic
        // subsystems exist. Building and production requests stay separate for
        // now because planets use different queues and their costs differ greatly.
        productionAndBuildingAreSeparated: true
      }
    };
  }
}

function buildPlanetStrategicDevelopmentResult(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): PlanetStrategicDevelopmentEvaluationResult {
  const buildingGoals = TARGET_BUILDING_TYPES
    .map((buildingType) => evaluateBuildingGoal(context, planet, buildingType))
    .filter((goal): goal is StrategicDevelopmentGoalEvaluation => goal !== null)
    .sort(compareGoals);
  const productionGoals = TARGET_PRODUCTION_SHIP_TYPES
    .map((shipType) => evaluateProductionGoal(context, planet, shipType))
    .filter((goal): goal is StrategicDevelopmentGoalEvaluation => goal !== null)
    .sort(compareGoals);

  const selectedBuildingGoals = buildingGoals
    .filter(isActionableGoal)
    .slice(0, MAX_BUILDING_GOALS_PER_PLANET);
  const selectedProductionGoals = productionGoals
    .filter(isActionableGoal)
    .slice(0, MAX_PRODUCTION_GOALS_PER_PLANET);
  const proposals = createPlanetProposals(context, planet, selectedBuildingGoals, selectedProductionGoals);
  const blockedGoalCount = [...buildingGoals, ...productionGoals]
    .filter((goal) => goal.blockers.length > 0)
    .length;
  const combinedSelectedGoals = [...selectedBuildingGoals, ...selectedProductionGoals].sort(compareGoals);

  return {
    proposals,
    goals: [...buildingGoals, ...productionGoals].map(stripImmediateRequest).sort(compareGoals),
    selectedBuildingGoals,
    selectedProductionGoals,
    planetResult: {
      subsystemId: 'STRATEGIC_DEVELOPMENT',
      planetId: planet.planetId,
      targetCoordinates: { ...planet.coordinates },
      branch: 'LOCAL_DEVELOPMENT',
      emittedRequestCount: proposals.length,
      emittedBuildingRequestCount: proposals.filter((proposal) => proposal.debug.queueType === 'BUILDING').length,
      emittedProductionRequestCount: proposals.filter((proposal) => proposal.debug.queueType === 'PRODUCTION').length,
      buildingGoalKeys: selectedBuildingGoals.map((goal) => goal.goalKey),
      productionGoalKeys: selectedProductionGoals.map((goal) => goal.goalKey),
      primaryGoalKey: combinedSelectedGoals[0]?.goalKey ?? null,
      secondaryGoalKey: combinedSelectedGoals[1]?.goalKey ?? null,
      noActionReason: proposals.length > 0
        ? null
        : resolvePlanetNoActionReason(planet, buildingGoals, productionGoals),
      blockedGoalCount
    }
  };
}

function createGlobalMissionProposals(
  context: BotSubsystemContext,
  localResults: PlanetStrategicDevelopmentEvaluationResult[]
): BotProposal[] {
  const requests: FleetMissionImmediateRequest[] = [];
  const requestCap = resolveMissionRequestCap(context);

  for (const localResult of localResults) {
    const targetPlanet = resolvePlanetByCoordinates(context, localResult.planetResult.targetCoordinates);
    if (!targetPlanet) {
      continue;
    }

    const targetNeed = resolveTargetSupportNeed(targetPlanet, localResult);
    if (targetNeed.repairPriorityBand !== null) {
      const repairRequest = buildRepairSupportRequest(context, targetPlanet, targetNeed, localResults);
      if (repairRequest) {
        requests.push(repairRequest);
      }
    }

    if (getTotalResourceAmount(targetNeed.resourceNeed) > 0) {
      const resourceRequest = buildTargetResourceSupportRequest(context, targetPlanet, targetNeed, localResults);
      if (resourceRequest) {
        requests.push(resourceRequest);
      }
    }
  }

  for (const localResult of localResults) {
    const sourcePlanet = resolvePlanetByCoordinates(context, localResult.planetResult.targetCoordinates);
    if (!sourcePlanet) {
      continue;
    }

    const exportRequests = buildSourceDrivenResourceSupportRequests(context, sourcePlanet, localResults);
    requests.push(...exportRequests);
  }

  requests.push(...createColonizationRequests(context));
  requests.push(...createIntelScanRequests(context));

  return mergeFleetMissionRequests(requests)
    .sort(compareMissionRequests)
    .slice(0, requestCap)
    .map((request, index) => createFleetMissionProposal(context, request, index));
}

function resolveMissionRequestCap(context: BotSubsystemContext): number {
  return Math.max(
    0,
    Math.floor(context.snapshot.empire.imperiumFleetCap * STRATEGIC_DEVELOPMENT_AVAILABILITY)
      + context.snapshot.empire.ownedPlanetCount
  );
}

function resolvePlanetByCoordinates(
  context: BotSubsystemContext,
  coordinates: { x: number; y: number; z: number }
): BotPlanetSnapshot | null {
  return context.snapshot.planets.find((planet) =>
    planet.coordinates.x === coordinates.x
    && planet.coordinates.y === coordinates.y
    && planet.coordinates.z === coordinates.z
  ) ?? null;
}

function resolveTargetSupportNeed(
  planet: BotPlanetSnapshot,
  localResult: PlanetStrategicDevelopmentEvaluationResult
): {
  resourceNeed: ResourceAmounts;
  repairPriorityBand: number | null;
  repairNeedScore: number;
} {
  const immediateDemand = sumGoalImmediateRequestCosts([
    ...localResult.selectedBuildingGoals,
    ...localResult.selectedProductionGoals
  ]);
  const resourceNeed = resolveResourceShortage(planet, immediateDemand);
  const recentlyColonized = planet.defense.avgIndustryLevel < 2;
  const negativeIndustryModifier = planet.modifiers.industry < 1;
  const hasDamagedBuildings = planet.infrastructure.damagedBuildingCount > 0
    && planet.infrastructure.missingBuildingStructuralPoints > 0;
  const emergencyDamageTrigger = planet.infrastructure.emergencyRepairTriggered;
  const repairPriorityBand = hasDamagedBuildings
    ? 1
    : recentlyColonized
      ? 2
      : negativeIndustryModifier
        ? 3
        : null;
  const prioritizedDamagePoints = resolvePrioritizedInfrastructureDamagePoints(planet.infrastructure);
  const repairNeedScore = prioritizedDamagePoints
    + (negativeIndustryModifier ? Math.round((1 - planet.modifiers.industry) * 1000) : 0)
    + (recentlyColonized ? 500 : 0)
    + (emergencyDamageTrigger ? Math.round(resolveEffectiveInfrastructureDamagePercent(planet.infrastructure) * 10) : 0);

  return {
    resourceNeed,
    repairPriorityBand,
    repairNeedScore
  };
}

function buildRepairSupportRequest(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot,
  targetNeed: { resourceNeed: ResourceAmounts; repairPriorityBand: number | null; repairNeedScore: number },
  localResults: PlanetStrategicDevelopmentEvaluationResult[]
): FleetMissionImmediateRequest | null {
  const priorityBand = targetNeed.repairPriorityBand;
  if (priorityBand === null) {
    return null;
  }

  const targetDroneDemand = Math.max(
    1,
    Math.ceil((targetNeed.repairNeedScore / 2500))
  );
  let bestRequest: FleetMissionImmediateRequest | null = null;

  for (const localResult of localResults) {
    const originPlanet = resolvePlanetByCoordinates(context, localResult.planetResult.targetCoordinates);
    if (!originPlanet || originPlanet.coordinates.x === targetPlanet.coordinates.x
      && originPlanet.coordinates.y === targetPlanet.coordinates.y
      && originPlanet.coordinates.z === targetPlanet.coordinates.z) {
      continue;
    }

    if (!isLogisticsSourcePlanet(originPlanet)) {
      continue;
    }

    const droneRequest = createRepairArmamentRequest(originPlanet, targetPlanet, targetDroneDemand, targetNeed.resourceNeed);
    if (!droneRequest) {
      continue;
    }

    if (!bestRequest || compareMissionSourceScore(droneRequest, bestRequest) < 0) {
      bestRequest = {
        ...droneRequest,
        priorityBand,
        summaryLabel: priorityBand === 1
          ? 'building repair support'
          : priorityBand === 2
            ? 'recent colony support'
            : 'industry recovery support'
      };
    }
  }

  return bestRequest;
}

function buildTargetResourceSupportRequest(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot,
  targetNeed: { resourceNeed: ResourceAmounts },
  localResults: PlanetStrategicDevelopmentEvaluationResult[]
): FleetMissionImmediateRequest | null {
  let bestRequest: FleetMissionImmediateRequest | null = null;

  for (const localResult of localResults) {
    const originPlanet = resolvePlanetByCoordinates(context, localResult.planetResult.targetCoordinates);
    if (!originPlanet || sameCoordinates(originPlanet.coordinates, targetPlanet.coordinates)) {
      continue;
    }

    if (!isLogisticsSourcePlanet(originPlanet)) {
      continue;
    }

    const transportRequest = createTransportSupportRequest(originPlanet, targetPlanet, targetNeed.resourceNeed);
    if (!transportRequest) {
      continue;
    }

    if (!bestRequest || compareMissionSourceScore(transportRequest, bestRequest) < 0) {
      bestRequest = {
        ...transportRequest,
        priorityBand: 4,
        summaryLabel: 'resource support'
      };
    }
  }

  return bestRequest;
}

function buildSourceDrivenResourceSupportRequests(
  context: BotSubsystemContext,
  sourcePlanet: BotPlanetSnapshot,
  localResults: PlanetStrategicDevelopmentEvaluationResult[]
): FleetMissionImmediateRequest[] {
  if (!isLogisticsSourcePlanet(sourcePlanet)) {
    return [];
  }

  const sourceSurplus = resolveSourceSurplus(sourcePlanet);
  if (getTotalResourceAmount(sourceSurplus) <= 0) {
    return [];
  }

  const requests: FleetMissionImmediateRequest[] = [];
  for (const localResult of localResults) {
    const targetPlanet = resolvePlanetByCoordinates(context, localResult.planetResult.targetCoordinates);
    if (!targetPlanet || sameCoordinates(sourcePlanet.coordinates, targetPlanet.coordinates)) {
      continue;
    }

    const targetNeed = resolveTargetSupportNeed(targetPlanet, localResult);
    const exportNeed = minResources(targetNeed.resourceNeed, sourceSurplus);
    if (getTotalResourceAmount(exportNeed) <= 0) {
      continue;
    }

    const request = createTransportSupportRequest(sourcePlanet, targetPlanet, exportNeed);
    if (!request) {
      continue;
    }

    requests.push({
      ...request,
      priorityBand: 5,
      summaryLabel: 'surplus export support'
    });
  }

  return requests;
}

function createIntelScanRequests(
  context: BotSubsystemContext
): FleetMissionImmediateRequest[] {
  const requests: FleetMissionImmediateRequest[] = [];
  const claimedSpyTargets = collectClaimedSpyTargets(context.priorProposals ?? []);

  for (const candidate of context.snapshot.empire.intelCandidates) {
    if (!candidate.needsScan) {
      continue;
    }
    if (claimedSpyTargets.has(toCoordinatesKey(candidate.coordinates))) {
      continue;
    }

    const source = context.snapshot.planets
      .filter((planet) => (planet.ships.undamagedCountByType[ShipType.SPY_PROBE] ?? 0) > 0)
      .sort((left, right) =>
        calculateTravelDistance(left.coordinates, candidate.coordinates)
          - calculateTravelDistance(right.coordinates, candidate.coordinates)
      )[0];
    if (!source) {
      continue;
    }

    requests.push({
      kind: 'FLEET_MISSION',
      missionType: FleetMissionType.SPY,
      originPlanet: source,
      targetCoordinates: { ...candidate.coordinates },
      ships: [{
        type: ShipType.SPY_PROBE,
        undamagedAmount: 1,
        damagedAmount: 0
      }],
      cargo: emptyResources(),
      repairDroneAmount: 0,
      priorityBand: candidate.neverScanned ? 6 : 7,
      sourceDistance: calculateTravelDistance(source.coordinates, candidate.coordinates),
      summaryLabel: candidate.neverScanned ? 'colonization intel scout' : 'colonization intel refresh'
    });
  }

  return requests;
}

function createColonizationRequests(
  context: BotSubsystemContext
): FleetMissionImmediateRequest[] {
  if (!canEmpireColonizeMorePlanets(context)) {
    return [];
  }
  if (hasPendingColonizationPlan(context)) {
    return [];
  }

  const eligibleCandidates = context.snapshot.empire.intelCandidates
    .filter((candidate) =>
      !candidate.needsScan
      && candidate.colonizationDifficulty !== null
      && candidate.colonizationDifficulty <= resolveAdaptiveTechnologyLevel(context)
    )
    .sort((left, right) =>
      right.colonizationScore - left.colonizationScore
      || (left.lastRelevantReportAge ?? Number.MAX_SAFE_INTEGER) - (right.lastRelevantReportAge ?? Number.MAX_SAFE_INTEGER)
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.y - right.coordinates.y
      || left.coordinates.z - right.coordinates.z
    );
  if (eligibleCandidates.length <= 0) {
    return [];
  }

  const topCandidatePool = eligibleCandidates.slice(0, Math.min(2, eligibleCandidates.length));
  const chosenCandidate = topCandidatePool[Math.min(
    topCandidatePool.length - 1,
    Math.floor(Math.random() * topCandidatePool.length)
  )] ?? null;
  if (!chosenCandidate) {
    return [];
  }

  const source = selectColonizerSource(context, chosenCandidate);
  if (!source) {
    return [];
  }

  return [source.request];
}

function collectClaimedSpyTargets(priorProposals: BotProposal[]): Set<string> {
  const claimedTargets = new Set<string>();

  for (const proposal of priorProposals) {
    if (
      proposal.kind !== 'FLEET_MISSION'
      || proposal.requestPayload.missionType !== FleetMissionType.SPY
      || !proposal.targetCoordinates
    ) {
      continue;
    }

    claimedTargets.add(toCoordinatesKey(proposal.targetCoordinates));
  }

  return claimedTargets;
}

function canEmpireColonizeMorePlanets(context: BotSubsystemContext): boolean {
  return context.snapshot.empire.ownedPlanetCount < maxOwnedPlanets(resolveAdaptiveTechnologyLevel(context));
}

function hasPendingColonizationPlan(context: BotSubsystemContext): boolean {
  return context.snapshot.empire.activeColonizeFleetCount > 0;
}

function resolveIdleColonizerCount(context: BotSubsystemContext): number {
  const totalColonizers = context.snapshot.planets.reduce((sum, planet) =>
    sum + Math.max(0, planet.ships.installedCountByType[ShipType.COLONIZER] ?? 0), 0);
  return Math.max(0, totalColonizers - context.snapshot.empire.activeColonizeFleetCount);
}

function resolveAdaptiveTechnologyLevel(context: BotSubsystemContext): number {
  return Math.max(
    0,
    ...context.snapshot.planets.map((planet) => planet.tech.adaptiveTechnologyLevel)
  );
}

function resolveAdaptiveColonizationPressure(context: BotSubsystemContext): {
  active: boolean;
  blockedCandidateCount: number;
  requiredAdaptiveLevel: number | null;
} {
  if (!canEmpireColonizeMorePlanets(context)) {
    return {
      active: false,
      blockedCandidateCount: 0,
      requiredAdaptiveLevel: null
    };
  }

  const adaptiveLevel = resolveAdaptiveTechnologyLevel(context);
  const blockedCandidates = context.snapshot.empire.intelCandidates.filter((candidate) =>
    !candidate.needsScan
    && candidate.colonizationDifficulty !== null
    && candidate.colonizationDifficulty > adaptiveLevel
    && candidate.colonizationDifficulty <= adaptiveLevel + 1
  );

  const requiredAdaptiveLevel = blockedCandidates.reduce<number | null>((lowest, candidate) => {
    if (candidate.colonizationDifficulty === null) {
      return lowest;
    }
    if (lowest === null) {
      return candidate.colonizationDifficulty;
    }
    return Math.min(lowest, candidate.colonizationDifficulty);
  }, null);

  return {
    active: blockedCandidates.length > 0,
    blockedCandidateCount: blockedCandidates.length,
    requiredAdaptiveLevel
  };
}

function selectColonizerSource(
  context: BotSubsystemContext,
  candidate: { coordinates: { x: number; y: number; z: number } }
): {
  request: FleetMissionImmediateRequest;
} | null {
  if (context.snapshot.empire.activeFleetCount >= context.snapshot.empire.maxActiveFleetCount) {
    return null;
  }

  const sources = context.snapshot.planets
    .map((planet) => createColonizeMissionRequest(planet, candidate.coordinates))
    .filter((entry): entry is { request: FleetMissionImmediateRequest; cargoAmount: number } => entry !== null)
    .sort((left, right) =>
      right.cargoAmount - left.cargoAmount
      || left.request.sourceDistance - right.request.sourceDistance
      || left.request.originPlanet.coordinates.x - right.request.originPlanet.coordinates.x
      || left.request.originPlanet.coordinates.y - right.request.originPlanet.coordinates.y
      || left.request.originPlanet.coordinates.z - right.request.originPlanet.coordinates.z
    );

  return sources[0] ? { request: sources[0].request } : null;
}

function createColonizeMissionRequest(
  originPlanet: BotPlanetSnapshot,
  targetCoordinates: { x: number; y: number; z: number }
): {
  request: FleetMissionImmediateRequest;
  cargoAmount: number;
} | null {
  const availableColonizers = originPlanet.ships.undamagedCountByType[ShipType.COLONIZER] ?? 0;
  if (availableColonizers <= 0) {
    return null;
  }

  const distance = calculateTravelDistance(originPlanet.coordinates, targetCoordinates);
  const fuelCost = calculateFuelCost([{ type: ShipType.COLONIZER, amount: 1 }], distance, 2);
  if (originPlanet.localResources.deuterium < fuelCost) {
    return null;
  }

  const cargo = resolveColonizerBootstrapCargo(originPlanet, fuelCost);
  const cargoAmount = getTotalResourceAmount(cargo);

  return {
    request: {
      kind: 'FLEET_MISSION',
      missionType: FleetMissionType.COLONIZE,
      originPlanet,
      targetCoordinates: { ...targetCoordinates },
      ships: [{
        type: ShipType.COLONIZER,
        undamagedAmount: 1,
        damagedAmount: 0
      }],
      cargo,
      repairDroneAmount: 0,
      priorityBand: 3,
      sourceDistance: distance,
      summaryLabel: cargoAmount > 0 ? 'colony establishment with bootstrap cargo' : 'colony establishment'
    },
    cargoAmount
  };
}

function toCoordinatesKey(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function resolveColonizerBootstrapCargo(
  originPlanet: BotPlanetSnapshot,
  fuelCost: number
): ResourceAmounts {
  // TODO: Split this into richer optional Strategic Development goals later.
  // For now colonization uses only the agreed simple bootstrap-cargo heuristic.
  // TODO: Future Strategic Development follow-ups:
  // 1. smarter bootstrap cargo planning
  // 2. post-colony follow-up support goals
  // 3. richer colonizer-source selection
  // 4. longer-run trace tuning on real saves
  const colonizerCargoCapacity = SHIP_BLUEPRINTS.get(ShipType.COLONIZER)?.cargoCapacity ?? 0;
  const targetCargo = {
    metal: 200,
    crystal: 120,
    deuterium: 80
  };
  if (colonizerCargoCapacity <= 0) {
    return emptyResources();
  }

  return {
    metal: Math.min(targetCargo.metal, originPlanet.localResources.metal),
    crystal: Math.min(targetCargo.crystal, originPlanet.localResources.crystal),
    deuterium: Math.min(
      targetCargo.deuterium,
      Math.max(0, originPlanet.localResources.deuterium - fuelCost)
    )
  };
}

function evaluateBuildingGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  buildingType: typeof TARGET_BUILDING_TYPES[number]
): StrategicDevelopmentGoalEvaluation | null {
  const currentLevel = getBuildingLevel(planet, buildingType);
  const desiredLevel = currentLevel + 1;
  const dependencyState = createSimulationState(planet);
  const requiredTechLevels = new Map<TechnologyType, number>();
  const buildingSteps: BuildingStep[] = [];
  const blockers: string[] = [];

  collectBuildingGoalDependencies(
    buildingType,
    desiredLevel,
    dependencyState,
    requiredTechLevels,
    buildingSteps,
    blockers,
    new Set()
  );

  if (blockers.length > 0 || buildingSteps.length === 0) {
    return createBlockedGoal(planet, 'BUILDING', desiredLevel, blockers, {
      finalTargetKind: 'BUILDING',
      finalBuildingType: buildingType,
      finalTechnologyType: null,
      finalShipType: null,
      finalLevel: desiredLevel,
      finalAmount: null
    });
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels, buildingSteps);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, 'BUILDING', desiredLevel, researchBlockers, {
      finalTargetKind: 'BUILDING',
      finalBuildingType: buildingType,
      finalTechnologyType: null,
      finalShipType: null,
      finalLevel: desiredLevel,
      finalAmount: null
    });
  }

  const initialState = createSimulationState(planet);
  const buildingSideEtc = estimateBuildingChainEtc(planet, initialState, buildingSteps);
  const researchSideEtc = estimateResearchChainEtc(planet, initialState, researchSteps);
  const totalEtc = Math.max(buildingSideEtc, researchSideEtc);
  const immediateRequest = selectImmediateStructuralRequest(planet, buildingSteps, buildingSideEtc, researchSteps, researchSideEtc);
  if (!immediateRequest || !Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, 'BUILDING', desiredLevel, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'BUILDING',
      finalBuildingType: buildingType,
      finalTechnologyType: null,
      finalShipType: null,
      finalLevel: desiredLevel,
      finalAmount: null
    });
  }

  const bonusFactor = resolveBuildingBonusFactor(planet, buildingType);
  const roboticsPenaltyMultiplier = immediateRequest.kind === 'BUILDING'
    && immediateRequest.buildingType === BuildingType.ROBOTICS_FACTORY
    && shouldPenalizeFurtherRobotics(planet)
    ? ROBOTICS_PENALTY_FACTOR
    : 1;
  const weightedEtc = (totalEtc / bonusFactor) * roboticsPenaltyMultiplier;

  return {
    goalKey: `strategic-development:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:building:${buildingType}:${desiredLevel}`,
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    goalFamily: 'BUILDING',
    branch: 'LOCAL_DEVELOPMENT',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'BUILDING',
    finalBuildingType: buildingType,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: null,
    finalLevel: desiredLevel,
    finalAmount: null,
    weightedEtc,
    totalEtc,
    buildingSideEtc,
    researchSideEtc,
    bonusFactor,
    blockers: [],
    selectedRequestKind: immediateRequest.kind === 'BUILDING' ? 'BUILDING' : 'RESEARCH',
    immediateRequest,
    debug: {
      bonusFactor: roundToTwoDecimals(bonusFactor),
      buildingType,
      goalFamily: 'BUILDING',
      roboticsPenaltyMultiplier: roundToTwoDecimals(roboticsPenaltyMultiplier),
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateProductionGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: typeof TARGET_PRODUCTION_SHIP_TYPES[number]
): StrategicDevelopmentGoalEvaluation | null {
  if (!isProductionShipEligible(context, planet, shipType)) {
    return null;
  }
  if (!isShipUnlocked(planet, shipType)) {
    return evaluateUnlockLikeProductionGoal(context, planet, shipType);
  }

  const immediateRequest = resolveProductionRequest(planet, shipType);
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return null;
  }

  if (!immediateRequest) {
    return createBlockedGoal(planet, 'PRODUCTION', 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const totalEtc = estimateProductionEtc(planet, immediateRequest);
  if (!Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, 'PRODUCTION', immediateRequest.amount, ['ETC_NOT_FINITE'], {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: immediateRequest.amount
    });
  }

  const bonusFactor = resolveProductionBonusFactor(planet, shipType);
  const weightedEtc = totalEtc / bonusFactor;

  return {
    goalKey: `strategic-development:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:produce:${shipType}:${immediateRequest.amount}`,
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    goalFamily: 'PRODUCTION',
    branch: 'LOCAL_DEVELOPMENT',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'SHIP',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: shipType,
    finalLevel: null,
    finalAmount: immediateRequest.amount,
    weightedEtc,
    totalEtc,
    buildingSideEtc: totalEtc,
    researchSideEtc: 0,
    bonusFactor,
    blockers: [],
    selectedRequestKind: 'SHIPYARD',
    immediateRequest,
    debug: {
      bonusFactor: roundToTwoDecimals(bonusFactor),
      goalFamily: 'PRODUCTION',
      orderAmount: immediateRequest.amount,
      queueRemainingEtc: planet.power.shipyardQueueRemainingEtc,
      shipType,
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateUnlockLikeProductionGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: ShipType
): StrategicDevelopmentGoalEvaluation | null {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return null;
  }

  const dependencyState = createSimulationState(planet);
  const requiredTechLevels = new Map<TechnologyType, number>();
  const buildingSteps: BuildingStep[] = [];
  const blockers: string[] = [];

  for (const requirement of blueprint.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    if (!ALLOWED_STRATEGIC_DEVELOPMENT_BUILDING_SCOPE.has(requirement.building)) {
      if ((dependencyState.buildingLevels.get(requirement.building) ?? 0) < requiredLevel) {
        blockers.push(`OUT_OF_SCOPE_BUILDING_REQUIREMENT:${requirement.building}`);
      }
      continue;
    }
    if ((dependencyState.buildingLevels.get(requirement.building) ?? 0) >= requiredLevel) {
      continue;
    }
    collectBuildingGoalDependencies(
      requirement.building,
      requiredLevel,
      dependencyState,
      requiredTechLevels,
      buildingSteps,
      blockers,
      new Set()
    );
  }

  for (const requirement of blueprint.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    if ((dependencyState.techLevels.get(requirement.tech) ?? 0) < requiredLevel) {
      requiredTechLevels.set(requirement.tech, requiredLevel);
    }
  }

  if (blockers.length > 0) {
    return createBlockedGoal(planet, 'PRODUCTION', 1, blockers, {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels, buildingSteps);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, 'PRODUCTION', 1, researchBlockers, {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const initialState = createSimulationState(planet);
  const buildingSideEtc = estimateBuildingChainEtc(planet, initialState, buildingSteps);
  const researchSideEtc = estimateResearchChainEtc(planet, initialState, researchSteps);
  const totalEtc = Math.max(buildingSideEtc, researchSideEtc);
  const immediateRequest = selectImmediateStructuralRequest(planet, buildingSteps, buildingSideEtc, researchSteps, researchSideEtc);
  if (!immediateRequest || !Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, 'PRODUCTION', 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const bonusFactor = resolveProductionBonusFactor(planet, shipType);
  const weightedEtc = totalEtc / bonusFactor;

  return {
    goalKey: `strategic-development:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:unlock-production:${shipType}`,
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    goalFamily: 'PRODUCTION',
    branch: 'LOCAL_DEVELOPMENT',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'SHIP',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: shipType,
    finalLevel: null,
    finalAmount: 1,
    weightedEtc,
    totalEtc,
    buildingSideEtc,
    researchSideEtc,
    bonusFactor,
    blockers: [],
    selectedRequestKind: immediateRequest.kind === 'BUILDING' ? 'BUILDING' : 'RESEARCH',
    immediateRequest,
    debug: {
      bonusFactor: roundToTwoDecimals(bonusFactor),
      goalFamily: 'PRODUCTION',
      queueType: 'PRODUCTION',
      shipType,
      totalEtc: roundToTwoDecimals(totalEtc),
      unlockPath: true,
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function collectBuildingGoalDependencies(
  buildingType: BuildingType,
  targetLevel: number,
  state: SimulatedState,
  requiredTechLevels: Map<TechnologyType, number>,
  buildingSteps: BuildingStep[],
  blockers: string[],
  visiting: Set<string>
): void {
  const visitKey = `${buildingType}:${targetLevel}`;
  if (visiting.has(visitKey)) {
    blockers.push(`BUILDING_REQUIREMENT_CYCLE:${visitKey}`);
    return;
  }

  visiting.add(visitKey);
  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  if (!blueprint) {
    blockers.push(`UNKNOWN_BUILDING:${buildingType}`);
    visiting.delete(visitKey);
    return;
  }

  let currentLevel = state.buildingLevels.get(buildingType) ?? 0;
  while (currentLevel < targetLevel) {
    const nextLevel = currentLevel + 1;

    for (const requirement of blueprint.buildingRequirements) {
      const requiredLevel = Math.ceil(nextLevel * requirement.level);
      if (!ALLOWED_STRATEGIC_DEVELOPMENT_BUILDING_SCOPE.has(requirement.building)) {
        if ((state.buildingLevels.get(requirement.building) ?? 0) < requiredLevel) {
          blockers.push(`OUT_OF_SCOPE_BUILDING_REQUIREMENT:${requirement.building}`);
        }
        continue;
      }

      if ((state.buildingLevels.get(requirement.building) ?? 0) >= requiredLevel) {
        continue;
      }

      collectBuildingGoalDependencies(
        requirement.building,
        requiredLevel,
        state,
        requiredTechLevels,
        buildingSteps,
        blockers,
        visiting
      );
      if (blockers.length > 0) {
        visiting.delete(visitKey);
        return;
      }
    }

    for (const requirement of blueprint.techRequirements) {
      const requiredLevel = Math.ceil(nextLevel * requirement.level);
      const existingLevel = Math.max(
        state.techLevels.get(requirement.tech) ?? 0,
        requiredTechLevels.get(requirement.tech) ?? 0
      );
      if (existingLevel < requiredLevel) {
        requiredTechLevels.set(requirement.tech, requiredLevel);
      }
    }

    buildingSteps.push({
      kind: 'BUILDING',
      buildingType,
      nextLevel,
      cost: normalizeResources(blueprint.getCostForLevel(nextLevel)),
      blockers: []
    });
    state.buildingLevels.set(buildingType, nextLevel);
    currentLevel = nextLevel;
  }

  visiting.delete(visitKey);
}

function resolveResearchSteps(
  planet: BotPlanetSnapshot,
  requiredTechLevels: Map<TechnologyType, number>,
  buildingSteps: BuildingStep[]
): ResearchStep[] {
  const steps: ResearchStep[] = [];
  const state = createSimulationState(planet);

  for (const step of buildingSteps) {
    state.buildingLevels.set(step.buildingType, step.nextLevel);
  }

  for (const [technologyType, requiredLevel] of [...requiredTechLevels.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))) {
    collectResearchDependencies(
      technologyType,
      requiredLevel,
      state,
      buildingSteps,
      steps,
      new Set()
    );
  }

  return steps;
}

function collectResearchDependencies(
  technologyType: TechnologyType,
  targetLevel: number,
  state: SimulatedState,
  buildingSteps: BuildingStep[],
  steps: ResearchStep[],
  visiting: Set<string>
): void {
  const visitKey = `${technologyType}:${targetLevel}`;
  if (visiting.has(visitKey)) {
    steps.push({
      kind: 'RESEARCH',
      technologyType,
      nextLevel: targetLevel,
      cost: { metal: 0, crystal: 0, deuterium: 0 },
      blockers: [`TECH_REQUIREMENT_CYCLE:${visitKey}`]
    });
    return;
  }

  visiting.add(visitKey);
  const technology = TECHNOLOGY_BLUEPRINTS.get(technologyType);
  if (!technology) {
    steps.push({
      kind: 'RESEARCH',
      technologyType,
      nextLevel: targetLevel,
      cost: { metal: 0, crystal: 0, deuterium: 0 },
      blockers: [`UNKNOWN_TECHNOLOGY:${technologyType}`]
    });
    visiting.delete(visitKey);
    return;
  }

  let currentLevel = state.techLevels.get(technologyType) ?? 0;
  while (currentLevel < targetLevel) {
    const nextLevel = currentLevel + 1;

    ensureResearchBuildingRequirements(technology, nextLevel, state, buildingSteps);
    for (const requirement of technology.techRequirements) {
      const requiredLevel = Math.ceil(nextLevel * requirement.level);
      if ((state.techLevels.get(requirement.tech) ?? 0) < requiredLevel) {
        collectResearchDependencies(requirement.tech, requiredLevel, state, buildingSteps, steps, visiting);
      }
    }

    const blockers = resolveResearchBuildingBlockers(state, technology, nextLevel);
    steps.push({
      kind: 'RESEARCH',
      technologyType,
      nextLevel,
      cost: normalizeResources(technology.getCostForLevel(nextLevel)),
      blockers
    });
    currentLevel = nextLevel;
    state.techLevels.set(technologyType, currentLevel);
  }

  visiting.delete(visitKey);
}

function ensureResearchBuildingRequirements(
  technology: Technology,
  nextLevel: number,
  state: SimulatedState,
  buildingSteps: BuildingStep[]
): void {
  for (const requirement of technology.buildingRequirements) {
    if (!ALLOWED_STRATEGIC_DEVELOPMENT_BUILDING_SCOPE.has(requirement.building)) {
      continue;
    }

    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    let currentLevel = state.buildingLevels.get(requirement.building) ?? 0;
    while (currentLevel < requiredLevel) {
      const blueprint = BUILDING_BLUEPRINTS.get(requirement.building);
      if (!blueprint) {
        break;
      }

      const nextBuildingLevel = currentLevel + 1;
      buildingSteps.push({
        kind: 'BUILDING',
        buildingType: requirement.building,
        nextLevel: nextBuildingLevel,
        cost: normalizeResources(blueprint.getCostForLevel(nextBuildingLevel)),
        blockers: []
      });
      currentLevel = nextBuildingLevel;
      state.buildingLevels.set(requirement.building, currentLevel);
    }
  }
}

function resolveResearchBuildingBlockers(
  state: SimulatedState,
  technology: Technology,
  nextLevel: number
): string[] {
  const blockers: string[] = [];
  for (const requirement of technology.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    if ((state.buildingLevels.get(requirement.building) ?? 0) < requiredLevel) {
      blockers.push(`RESEARCH_BUILDING_REQUIREMENT_NOT_MET:${requirement.building}`);
    }
  }

  return blockers;
}

function estimateBuildingChainEtc(
  planet: BotPlanetSnapshot,
  initialState: SimulatedState,
  steps: BuildingStep[]
): number {
  if (steps.length <= 0) {
    return 0;
  }

  const state = cloneSimulationState(initialState);
  let elapsed = normalizeFiniteEtc(planet.power.buildingQueueRemainingEtc);

  for (const step of steps) {
    const throughput = resolveSimulatedThroughput(planet, state);
    if (throughput.industryPower <= 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    elapsed += Math.ceil(getTotalResourceAmount(step.cost) / throughput.industryPower);
    state.buildingLevels.set(step.buildingType, step.nextLevel);
  }

  return elapsed;
}

function estimateResearchChainEtc(
  planet: BotPlanetSnapshot,
  initialState: SimulatedState,
  steps: ResearchStep[]
): number {
  if (steps.length <= 0) {
    return 0;
  }

  const state = cloneSimulationState(initialState);
  let elapsed = normalizeFiniteEtc(planet.power.researchQueueRemainingEtc);

  for (const step of steps) {
    if (step.blockers.length > 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    const throughput = resolveSimulatedThroughput(planet, state);
    if (throughput.researchPower <= 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    elapsed += Math.ceil(getTotalResourceAmount(step.cost) / throughput.researchPower);
    state.techLevels.set(step.technologyType, step.nextLevel);
  }

  return elapsed;
}

function estimateProductionEtc(
  planet: BotPlanetSnapshot,
  step: ProductionStep
): number {
  if (planet.power.shipyardPower <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return normalizeFiniteEtc(planet.power.shipyardQueueRemainingEtc)
    + Math.ceil(getTotalResourceAmount(step.cost) / planet.power.shipyardPower);
}

function selectImmediateStructuralRequest(
  planet: BotPlanetSnapshot,
  buildingSteps: BuildingStep[],
  buildingSideEtc: number,
  researchSteps: ResearchStep[],
  researchSideEtc: number
): BuildingStep | ResearchStep | null {
  const buildingRequest = resolveActionableBuildingRequest(planet, buildingSteps);
  const researchRequest = resolveActionableResearchRequest(planet, researchSteps);

  if (researchSideEtc > buildingSideEtc) {
    return researchRequest ?? buildingRequest;
  }

  return buildingRequest ?? researchRequest;
}

function resolveActionableBuildingRequest(
  planet: BotPlanetSnapshot,
  steps: BuildingStep[]
): BuildingStep | null {
  if (planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength) {
    return null;
  }

  const queuedTypes = new Set(planet.queues.queuedBuildingTypes);
  return steps.find((step) => !queuedTypes.has(step.buildingType)) ?? null;
}

function resolveActionableResearchRequest(
  planet: BotPlanetSnapshot,
  steps: ResearchStep[]
): ResearchStep | null {
  if (planet.queues.hasActiveResearch) {
    return null;
  }

  return steps.find((step) => step.blockers.length === 0) ?? null;
}

function resolveProductionRequest(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): ProductionStep | null {
  if (planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return null;
  }

  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return null;
  }

  const amount = resolveProductionOrderAmount(planet, shipType);
  return {
    kind: 'SHIPYARD',
    shipType,
    amount,
    cost: multiplyResources(normalizeResources(blueprint.cost), amount),
    blockers: []
  };
}

function resolveProductionOrderAmount(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  if (shipType === ShipType.COLONIZER) {
    return 1;
  }

  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 1;
  }

  const localIncomeTotal = planet.economy.income.metal + planet.economy.income.crystal + planet.economy.income.deuterium;
  const targetBudget = Math.max(
    1,
    Math.floor(localIncomeTotal * resolveDeterministicOrderFactor(planet, shipType))
  );
  const totalCost = Math.max(1, Math.floor(blueprint.cost.getTotalResourceAmount()));
  return Math.max(1, Math.floor(targetBudget / totalCost));
}

function resolveDeterministicOrderFactor(planet: BotPlanetSnapshot, shipType: ShipType): number {
  const seed = `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${planet.name}:${shipType}`;
  let hash = 0;
  for (const character of seed) {
    hash = ((hash * 31) + character.charCodeAt(0)) % 100000;
  }

  const maxExtraFactor = Math.max(0, planet.defense.avgIndustryLevel);
  return 1 + (((hash % 1000) / 1000) * maxExtraFactor);
}

function resolveBuildingBonusFactor(
  planet: BotPlanetSnapshot,
  buildingType: BuildingType
): number {
  let bonusFactor = 1;

  if (buildingType === BuildingType.NANITE_FACTORY) {
    bonusFactor *= NANITE_BONUS_FACTOR;
  }

  if (buildingType === BuildingType.INTERSTELLAR_TRADE_PORT) {
    const maxModifier = Math.max(planet.modifiers.metal, planet.modifiers.crystal, planet.modifiers.deuterium);
    const minModifier = Math.min(planet.modifiers.metal, planet.modifiers.crystal, planet.modifiers.deuterium);
    bonusFactor *= 1 + Math.min(0.2, Math.max(0, (maxModifier - minModifier) / 2));
  }

  if (buildingType === BuildingType.SENSOR_PHALANX) {
    bonusFactor *= 1 + Math.min(0.3, Math.max(0, ((planet.modifiers.anomaliesAndNoise - 1) / 0.6) * 0.3));
  }

  if (buildingType === BuildingType.JUMP_GATE) {
    bonusFactor *= 1 + Math.min(0.3, Math.max(0, ((planet.modifiers.hyperspaceParameters - 1) / 0.5) * 0.3));
  }

  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, bonusFactor));
}

function shouldPenalizeFurtherRobotics(planet: BotPlanetSnapshot): boolean {
  const roboticsLevel = planet.economy.roboticsLevel;
  const shipyardLevel = planet.economy.shipyardLevel;
  const naniteLevel = planet.economy.naniteLevel;
  return naniteLevel > 0 || (roboticsLevel >= 4 && shipyardLevel >= 3);
}

function resolveProductionBonusFactor(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  let bonusFactor = 1;
  bonusFactor *= 1 + resolveProductionDistributionBonusRatio(planet, shipType);
  if (shipType === ShipType.REPAIR_DRONE && isRepairDroneSupportPlanet(planet)) {
    bonusFactor *= 1.1;
  }
  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, bonusFactor));
}

function resolveProductionDistributionBonusRatio(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  const unlockedTypes = TARGET_PRODUCTION_SHIP_TYPES.filter((type) => isShipUnlocked(planet, type));
  if (unlockedTypes.length <= 1) {
    return 0;
  }

  const maxInstalledValue = unlockedTypes.reduce((maxValue, type) =>
    Math.max(maxValue, planet.ships.installedValueByType[type] ?? 0), 0);
  if (maxInstalledValue <= 0) {
    return 0;
  }

  const candidateValue = planet.ships.installedValueByType[shipType] ?? 0;
  const missingRatio = Math.max(0, (maxInstalledValue - candidateValue) / maxInstalledValue);
  return missingRatio * 0.35;
}

function isProductionShipEligible(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: ShipType
): boolean {
  const threshold = resolveShipyardRequirement(shipType);
  if (planet.defense.avgIndustryLevel < threshold) {
    return false;
  }

  if (shipType === ShipType.COLONIZER) {
    return planet.defense.avgIndustryLevel >= threshold
      && resolveIdleColonizerCount(context) < COLONIZER_IDLE_CAP
      && canColonizeMorePlanets(context, planet);
  }

  if (shipType === ShipType.REPAIR_DRONE) {
    return isRepairDroneSupportPlanet(planet);
  }

  return true;
}

function canColonizeMorePlanets(context: BotSubsystemContext, planet: BotPlanetSnapshot): boolean {
  return context.snapshot.empire.ownedPlanetCount < maxOwnedPlanets(planet.tech.adaptiveTechnologyLevel);
}

function isRepairDroneSupportPlanet(planet: BotPlanetSnapshot): boolean {
  return planet.defense.avgIndustryLevel <= LOW_INDUSTRY_REPAIR_DRONE_THRESHOLD
    || planet.maturityStage === 'BOOTSTRAP'
    || planet.maturityStage === 'STABILIZING';
}

function isShipUnlocked(planet: BotPlanetSnapshot, shipType: ShipType): boolean {
  const installedCount = planet.ships.installedCountByType[shipType] ?? 0;
  if (installedCount > 0 || planet.queues.queuedShipTypes.includes(shipType)) {
    return true;
  }

  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return false;
  }

  return blueprint.buildingRequirements.every((requirement) =>
    getBuildingLevel(planet, requirement.building) >= Math.ceil(requirement.level)
  ) && blueprint.techRequirements.every((requirement) =>
    getTechnologyLevel(planet, requirement.tech) >= Math.ceil(requirement.level)
  );
}

function resolveShipyardRequirement(shipType: ShipType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return Number.MAX_SAFE_INTEGER;
  }

  const shipyardRequirement = blueprint.buildingRequirements.find((requirement) => requirement.building === BuildingType.SHIPYARD);
  return shipyardRequirement ? Math.ceil(shipyardRequirement.level) : Number.MAX_SAFE_INTEGER;
}

function createPlanetProposals(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  buildingGoals: StrategicDevelopmentGoalEvaluation[],
  productionGoals: StrategicDevelopmentGoalEvaluation[]
): BotProposal[] {
  const proposals: BotProposal[] = [];
  proposals.push(...createSectionProposals(context, planet, buildingGoals, 'BUILDING'));
  proposals.push(...createSectionProposals(context, planet, productionGoals, 'PRODUCTION'));
  return proposals;
}

function createSectionProposals(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goals: StrategicDevelopmentGoalEvaluation[],
  queueType: 'BUILDING' | 'PRODUCTION'
): BotProposal[] {
  const proposals: BotProposal[] = [];
  const proposalsByRequest = new Map<string, BotProposal>();

  for (const [index, goal] of goals.entries()) {
    const request = goal.immediateRequest;
    if (!request) {
      continue;
    }

    const requestKey = resolveRequestKey(planet, request);
    const existing = proposalsByRequest.get(requestKey);
    if (existing) {
      existing.summary = `${existing.summary} Also advances secondary ${queueType.toLowerCase()} goal ${resolveGoalTargetLabel(goal)}.`;
      existing.debug.secondaryGoalKey = goal.goalKey;
      existing.debug.sharedImmediateRequest = true;
      continue;
    }

    const proposal = createProposalFromGoal(context, planet, goal, index, queueType);
    proposalsByRequest.set(requestKey, proposal);
    proposals.push(proposal);
  }

  return proposals;
}

function createProposalFromGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goal: StrategicDevelopmentGoalEvaluation,
  selectedIndex: number,
  queueType: 'BUILDING' | 'PRODUCTION'
): BotProposal {
  const request = goal.immediateRequest;
  if (!request) {
    throw new Error(`Strategic Development goal ${goal.goalKey} has no immediate request.`);
  }

  const requestLabel = resolveRankLabel(selectedIndex, queueType === 'BUILDING' ? 'building request' : 'production request');
  const summary = request.kind === 'BUILDING'
    ? `${requestLabel}: queue ${request.buildingType} on ${planet.name}.`
    : request.kind === 'RESEARCH'
      ? `${requestLabel}: research ${request.technologyType} on ${planet.name}.`
      : `${requestLabel}: produce ${request.amount} ${request.shipType} on ${planet.name}.`;
  const adaptiveColonizationPressure = resolveAdaptiveColonizationPressure(context);

  return {
    proposalId: `${goal.goalKey}:${queueType}:${selectedIndex}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    kind: goal.selectedRequestKind,
    status: 'PROPOSED',
    goalKey: goal.goalKey,
    dedupeKey: resolveDedupeKey(planet, request),
    summary,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    expectedValue: Math.max(1, Math.round((1000 / Math.max(1, goal.weightedEtc)) * 100)),
    urgency: queueType === 'BUILDING' ? 68 : 62,
    risk: 6,
    confidence: 72,
    requestedResources: { ...request.cost },
    requestPayload: request.kind === 'BUILDING'
      ? {
        x: planet.coordinates.x,
        y: planet.coordinates.y,
        z: planet.coordinates.z,
        buildingType: request.buildingType
      }
      : request.kind === 'RESEARCH'
        ? {
          x: planet.coordinates.x,
          y: planet.coordinates.y,
          z: planet.coordinates.z,
          technologyType: request.technologyType
        }
        : {
          x: planet.coordinates.x,
          y: planet.coordinates.y,
          z: planet.coordinates.z,
          itemKind: 'ship',
          shipType: request.shipType,
          amount: request.amount
        },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      ...goal.debug,
      adaptiveColonizationPressureActive: adaptiveColonizationPressure.active,
      adaptiveColonizationBlockedCandidateCount: adaptiveColonizationPressure.blockedCandidateCount,
      adaptiveColonizationRequiredLevel: adaptiveColonizationPressure.requiredAdaptiveLevel,
      finalTargetKind: goal.finalTargetKind,
      finalBuildingType: goal.finalBuildingType,
      finalTechnologyType: goal.finalTechnologyType,
      finalDefenceType: goal.finalDefenceType,
      finalShipType: goal.finalShipType,
      finalLevel: goal.finalLevel,
      finalAmount: goal.finalAmount,
      goalFamily: goal.goalFamily,
      immediateRequestKind: request.kind,
      immediateRequestTarget: request.kind === 'BUILDING'
        ? request.buildingType
        : request.kind === 'RESEARCH'
          ? request.technologyType
          : request.shipType,
      immediateRequestAmount: request.kind === 'SHIPYARD' ? request.amount : null,
      queueType,
      requestRankInSection: selectedIndex + 1,
      sharedImmediateRequest: false
    }
  };
}

function createFleetMissionProposal(
  context: BotSubsystemContext,
  request: FleetMissionImmediateRequest,
  index: number
): BotProposal {
  const totalRequestedResources = getTotalResourceAmount(request.cargo);
  const adaptiveColonizationPressure = resolveAdaptiveColonizationPressure(context);
  const summary = request.missionType === FleetMissionType.SPY
    ? `Mission request #${index + 1}: spy ${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z} from ${request.originPlanet.name}.`
    : `Mission request #${index + 1}: ${request.missionType} from ${request.originPlanet.name} to ${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}.`;

  return {
    proposalId: `strategic-development:mission:${request.missionType}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-development:mission:${request.missionType}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`,
    dedupeKey: `strategic-development:mission:${request.missionType}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`,
    summary,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetCoordinates },
    expectedValue: Math.max(1, Math.round((totalRequestedResources / 50) + (request.repairDroneAmount * 40) + ((10 - Math.min(9, request.priorityBand)) * 100))),
    urgency: request.missionType === FleetMissionType.SPY
      ? (request.priorityBand <= 6 ? 61 : 52)
      : request.priorityBand === 1
        ? 92
        : request.priorityBand === 2
          ? 84
          : request.priorityBand === 3
            ? 76
            : 64,
    risk: request.missionType === FleetMissionType.SPY ? 5 : 11,
    confidence: request.missionType === FleetMissionType.SPY ? 74 : 68,
    requestedResources: { ...request.cargo },
    requestPayload: {
      missionType: request.missionType,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.targetCoordinates },
      ships: request.ships.map((ship) => ({ ...ship })),
      carriedBombs: [],
      cargo: { ...request.cargo },
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      adaptiveColonizationPressureActive: adaptiveColonizationPressure.active,
      adaptiveColonizationBlockedCandidateCount: adaptiveColonizationPressure.blockedCandidateCount,
      adaptiveColonizationRequiredLevel: adaptiveColonizationPressure.requiredAdaptiveLevel,
      missionSection: 'GLOBAL',
      missionType: request.missionType,
      originPlanet: request.originPlanet.name,
      priorityBand: request.priorityBand,
      sourceDistance: request.sourceDistance,
      repairDroneAmount: request.repairDroneAmount,
      totalRequestedResources,
      summaryLabel: request.summaryLabel
    }
  };
}

function mergeFleetMissionRequests(
  requests: FleetMissionImmediateRequest[]
): FleetMissionImmediateRequest[] {
  const merged = new Map<string, FleetMissionImmediateRequest>();

  for (const request of requests) {
    const key = `${request.missionType}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, request);
      continue;
    }

    existing.cargo = maxResources(existing.cargo, request.cargo);
    existing.repairDroneAmount = Math.max(existing.repairDroneAmount, request.repairDroneAmount);
    existing.priorityBand = Math.min(existing.priorityBand, request.priorityBand);
    existing.sourceDistance = Math.min(existing.sourceDistance, request.sourceDistance);
    if (request.summaryLabel.localeCompare(existing.summaryLabel) < 0) {
      existing.summaryLabel = request.summaryLabel;
    }
    if (request.ships.length > existing.ships.length) {
      existing.ships = request.ships.map((ship) => ({ ...ship }));
    }
  }

  return [...merged.values()];
}

function compareMissionRequests(left: FleetMissionImmediateRequest, right: FleetMissionImmediateRequest): number {
  return left.priorityBand - right.priorityBand
    || right.repairDroneAmount - left.repairDroneAmount
    || getTotalResourceAmount(right.cargo) - getTotalResourceAmount(left.cargo)
    || left.sourceDistance - right.sourceDistance
    || left.summaryLabel.localeCompare(right.summaryLabel);
}

function compareMissionSourceScore(left: FleetMissionImmediateRequest, right: FleetMissionImmediateRequest): number {
  const leftPayload = (left.repairDroneAmount * 1000) + getTotalResourceAmount(left.cargo);
  const rightPayload = (right.repairDroneAmount * 1000) + getTotalResourceAmount(right.cargo);
  const leftScore = left.sourceDistance - (leftPayload / 1000);
  const rightScore = right.sourceDistance - (rightPayload / 1000);
  return leftScore - rightScore;
}

function createTransportSupportRequest(
  originPlanet: BotPlanetSnapshot,
  targetPlanet: BotPlanetSnapshot,
  targetNeed: ResourceAmounts
): FleetMissionImmediateRequest | null {
  const sourceSurplus = resolveSourceSurplus(originPlanet);
  const transferableResources = minResources(targetNeed, sourceSurplus);
  if (getTotalResourceAmount(transferableResources) <= 0) {
    return null;
  }

  const cargoSelection = selectCargoShips(originPlanet, getTotalResourceAmount(transferableResources));
  if (!cargoSelection) {
    return null;
  }

  return {
    kind: 'FLEET_MISSION',
    missionType: FleetMissionType.TRANSPORT,
    originPlanet,
    targetCoordinates: { ...targetPlanet.coordinates },
    ships: cargoSelection,
    cargo: transferableResources,
    repairDroneAmount: 0,
    priorityBand: 4,
    sourceDistance: calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates),
    summaryLabel: 'resource support'
  };
}

function createRepairArmamentRequest(
  originPlanet: BotPlanetSnapshot,
  targetPlanet: BotPlanetSnapshot,
  targetDroneDemand: number,
  targetResourceNeed: ResourceAmounts
): FleetMissionImmediateRequest | null {
  if (originPlanet.power.industryPower <= targetPlanet.power.industryPower * 2) {
    return null;
  }

  const availableRepairDrones = originPlanet.ships.undamagedCountByType[ShipType.REPAIR_DRONE] ?? 0;
  if (availableRepairDrones <= 0) {
    return null;
  }

  const repairDroneBlueprint = SHIP_BLUEPRINTS.get(ShipType.REPAIR_DRONE);
  const repairDroneSize = Math.max(1, repairDroneBlueprint?.size ?? 1);
  const carrierSelection = selectHangarShips(originPlanet, repairDroneSize, targetDroneDemand);
  if (!carrierSelection) {
    return null;
  }

  const maxDroneAmount = Math.min(
    availableRepairDrones,
    Math.floor(resolveSelectionHangarCapacity(carrierSelection) / repairDroneSize)
  );
  if (maxDroneAmount <= 0) {
    return null;
  }

  const cargoCapacityFromCarriers = resolveSelectionCargoCapacity(carrierSelection);
  const sourceSurplus = resolveSourceSurplus(originPlanet);
  const transferableResources = minResources(targetResourceNeed, sourceSurplus);
  const carrierCargoLoad = limitResourcesToCapacity(transferableResources, cargoCapacityFromCarriers);
  const remainingCargoNeed = subtractResources(transferableResources, carrierCargoLoad);
  const extraCargoSelection = getTotalResourceAmount(remainingCargoNeed) > 0
    ? selectCargoShips(originPlanet, getTotalResourceAmount(remainingCargoNeed), new Set(carrierSelection.map((ship) => ship.type)))
    : null;
  const totalCargo = extraCargoSelection
    ? addResources(carrierCargoLoad, limitResourcesToCapacity(remainingCargoNeed, resolveSelectionCargoCapacity(extraCargoSelection)))
    : carrierCargoLoad;

  const ships = [
    ...carrierSelection.map((ship) => ({ ...ship })),
    {
      type: ShipType.REPAIR_DRONE,
      undamagedAmount: maxDroneAmount,
      damagedAmount: 0
    },
    ...(extraCargoSelection ?? []).map((ship) => ({ ...ship }))
  ];

  return {
    kind: 'FLEET_MISSION',
    missionType: FleetMissionType.ARMAMENT_DELIVERY,
    originPlanet,
    targetCoordinates: { ...targetPlanet.coordinates },
    ships,
    cargo: totalCargo,
    repairDroneAmount: maxDroneAmount,
    priorityBand: 1,
    sourceDistance: calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates),
    summaryLabel: 'repair support'
  };
}

function isLogisticsSourcePlanet(planet: BotPlanetSnapshot): boolean {
  return planet.defense.avgIndustryLevel >= 4
    && getTotalResourceAmount(resolveSourceSurplus(planet)) > 0
    && hasAnyCargoOrHangarFleet(planet);
}

function hasAnyCargoOrHangarFleet(planet: BotPlanetSnapshot): boolean {
  return Object.entries(planet.ships.undamagedCountByType)
    .some(([shipType, amount]) => {
      if ((amount ?? 0) <= 0) {
        return false;
      }
      const blueprint = SHIP_BLUEPRINTS.get(shipType as ShipType);
      return (blueprint?.cargoCapacity ?? 0) > 0 || (blueprint?.hangarCapacity ?? 0) > 0;
    });
}

function sumGoalImmediateRequestCosts(goals: StrategicDevelopmentGoalEvaluation[]): ResourceAmounts {
  return goals.reduce((sum, goal) => addResources(sum, goal.immediateRequest?.cost ?? emptyResources()), emptyResources());
}

function resolveResourceShortage(
  planet: BotPlanetSnapshot,
  immediateDemand: ResourceAmounts
): ResourceAmounts {
  const effectiveStored = {
    metal: planet.localResources.metal * Math.max(0.1, planet.modifiers.metal),
    crystal: planet.localResources.crystal * Math.max(0.1, planet.modifiers.crystal),
    deuterium: planet.localResources.deuterium * Math.max(0.1, planet.modifiers.deuterium)
  };
  const averageEffective = (effectiveStored.metal + effectiveStored.crystal + effectiveStored.deuterium) / 3;

  return {
    metal: Math.max(
      0,
      Math.floor(Math.max(0, immediateDemand.metal - planet.localResources.metal)
        + Math.max(0, ((averageEffective - effectiveStored.metal) / Math.max(0.1, planet.modifiers.metal)) * 0.25))
    ),
    crystal: Math.max(
      0,
      Math.floor(Math.max(0, immediateDemand.crystal - planet.localResources.crystal)
        + Math.max(0, ((averageEffective - effectiveStored.crystal) / Math.max(0.1, planet.modifiers.crystal)) * 0.25))
    ),
    deuterium: Math.max(
      0,
      Math.floor(Math.max(0, immediateDemand.deuterium - planet.localResources.deuterium)
        + Math.max(0, ((averageEffective - effectiveStored.deuterium) / Math.max(0.1, planet.modifiers.deuterium)) * 0.25))
    )
  };
}

function resolveSourceSurplus(planet: BotPlanetSnapshot): ResourceAmounts {
  const reserveFloor = {
    metal: Math.max(planet.economy.income.metal * 3, Math.floor(planet.economy.storageCapacity.metal * 0.25)),
    crystal: Math.max(planet.economy.income.crystal * 3, Math.floor(planet.economy.storageCapacity.crystal * 0.25)),
    deuterium: Math.max(planet.economy.income.deuterium * 3, Math.floor(planet.economy.storageCapacity.deuterium * 0.25))
  };
  const effectiveStored = {
    metal: planet.localResources.metal * Math.max(0.1, planet.modifiers.metal),
    crystal: planet.localResources.crystal * Math.max(0.1, planet.modifiers.crystal),
    deuterium: planet.localResources.deuterium * Math.max(0.1, planet.modifiers.deuterium)
  };
  const maxEffective = Math.max(effectiveStored.metal, effectiveStored.crystal, effectiveStored.deuterium);
  const averageEffective = (effectiveStored.metal + effectiveStored.crystal + effectiveStored.deuterium) / 3;

  return {
    metal: effectiveStored.metal >= maxEffective && effectiveStored.metal > averageEffective
      ? Math.max(0, planet.localResources.metal - reserveFloor.metal)
      : 0,
    crystal: effectiveStored.crystal >= maxEffective && effectiveStored.crystal > averageEffective
      ? Math.max(0, planet.localResources.crystal - reserveFloor.crystal)
      : 0,
    deuterium: effectiveStored.deuterium >= maxEffective && effectiveStored.deuterium > averageEffective
      ? Math.max(0, planet.localResources.deuterium - reserveFloor.deuterium)
      : 0
  };
}

function selectCargoShips(
  planet: BotPlanetSnapshot,
  requiredCargo: number,
  excludedTypes: Set<ShipType> = new Set()
): Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }> | null {
  if (requiredCargo <= 0) {
    return [];
  }

  const candidates = Object.entries(planet.ships.undamagedCountByType)
    .map(([type, amount]) => ({
      type: type as ShipType,
      amount: amount ?? 0,
      blueprint: SHIP_BLUEPRINTS.get(type as ShipType) ?? null
    }))
    .filter((entry) =>
      entry.amount > 0
      && !excludedTypes.has(entry.type)
      && (entry.blueprint?.cargoCapacity ?? 0) > 0
    )
    .sort((left, right) =>
      (right.blueprint?.cargoCapacity ?? 0) - (left.blueprint?.cargoCapacity ?? 0)
    );

  let remainingCargo = requiredCargo;
  const selection: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }> = [];
  for (const candidate of candidates) {
    if (remainingCargo <= 0) {
      break;
    }

    const cargoCapacity = candidate.blueprint?.cargoCapacity ?? 0;
    const amount = Math.min(candidate.amount, Math.max(1, Math.ceil(remainingCargo / Math.max(1, cargoCapacity))));
    selection.push({
      type: candidate.type,
      undamagedAmount: amount,
      damagedAmount: 0
    });
    remainingCargo -= cargoCapacity * amount;
  }

  return remainingCargo > 0 ? null : selection;
}

function selectHangarShips(
  planet: BotPlanetSnapshot,
  payloadSize: number,
  payloadAmount: number
): Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }> | null {
  const requiredHangar = payloadSize * Math.max(1, payloadAmount);
  const candidates = Object.entries(planet.ships.undamagedCountByType)
    .map(([type, amount]) => ({
      type: type as ShipType,
      amount: amount ?? 0,
      blueprint: SHIP_BLUEPRINTS.get(type as ShipType) ?? null
    }))
    .filter((entry) => entry.amount > 0 && (entry.blueprint?.hangarCapacity ?? 0) > 0)
    .sort((left, right) =>
      (right.blueprint?.hangarCapacity ?? 0) - (left.blueprint?.hangarCapacity ?? 0)
      || (right.blueprint?.cargoCapacity ?? 0) - (left.blueprint?.cargoCapacity ?? 0)
    );

  let remainingHangar = requiredHangar;
  const selection: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }> = [];
  for (const candidate of candidates) {
    if (remainingHangar <= 0) {
      break;
    }

    const hangarCapacity = candidate.blueprint?.hangarCapacity ?? 0;
    const amount = Math.min(candidate.amount, Math.max(1, Math.ceil(remainingHangar / Math.max(1, hangarCapacity))));
    selection.push({
      type: candidate.type,
      undamagedAmount: amount,
      damagedAmount: 0
    });
    remainingHangar -= hangarCapacity * amount;
  }

  return remainingHangar > 0 ? null : selection;
}

function resolveSelectionCargoCapacity(
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>
): number {
  return ships.reduce((total, ship) =>
    total + ((SHIP_BLUEPRINTS.get(ship.type)?.cargoCapacity ?? 0) * ship.undamagedAmount), 0);
}

function resolveSelectionHangarCapacity(
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>
): number {
  return ships.reduce((total, ship) =>
    total + ((SHIP_BLUEPRINTS.get(ship.type)?.hangarCapacity ?? 0) * ship.undamagedAmount), 0);
}

function limitResourcesToCapacity(resources: ResourceAmounts, capacity: number): ResourceAmounts {
  let remainingCapacity = Math.max(0, capacity);
  const limited = emptyResources();
  for (const key of ['metal', 'crystal', 'deuterium'] satisfies ResourceKey[]) {
    if (remainingCapacity <= 0) {
      break;
    }
    const amount = Math.min(resources[key], remainingCapacity);
    limited[key] = amount;
    remainingCapacity -= amount;
  }
  return limited;
}

function sameCoordinates(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number }
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function resolvePlanetNoActionReason(
  planet: BotPlanetSnapshot,
  buildingGoals: StrategicDevelopmentGoalEvaluation[],
  productionGoals: StrategicDevelopmentGoalEvaluation[]
): string {
  const allGoals = [...buildingGoals, ...productionGoals];
  if (allGoals.length <= 0) {
    return 'NO_CANDIDATE_GOALS';
  }

  if (allGoals.every((goal) => goal.blockers.length > 0)) {
    return allGoals[0]?.blockers[0] ?? 'ALL_GOALS_BLOCKED';
  }

  if (buildingGoals.some(isActionableGoal) && planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength && planet.queues.hasActiveResearch) {
    return 'BUILDING_AND_RESEARCH_BLOCKED';
  }
  if (productionGoals.some(isActionableGoal) && planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return 'SHIPYARD_QUEUE_SATURATED';
  }

  return 'NO_ACTIONABLE_REQUEST';
}

function createBlockedGoal(
  planet: BotPlanetSnapshot,
  goalFamily: 'BUILDING' | 'PRODUCTION',
  fallbackAmount: number,
  blockers: string[],
  finalTarget: {
    finalTargetKind: 'BUILDING' | 'SHIP';
    finalBuildingType: BuildingType | null;
    finalTechnologyType: TechnologyType | null;
    finalShipType: ShipType | null;
    finalLevel: number | null;
    finalAmount: number | null;
  }
): StrategicDevelopmentGoalEvaluation {
  return {
    goalKey: `strategic-development:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${goalFamily}:${finalTarget.finalBuildingType ?? finalTarget.finalShipType ?? fallbackAmount}`,
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    goalFamily,
    branch: 'LOCAL_DEVELOPMENT',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: finalTarget.finalTargetKind,
    finalBuildingType: finalTarget.finalBuildingType,
    finalTechnologyType: finalTarget.finalTechnologyType,
    finalDefenceType: null,
    finalShipType: finalTarget.finalShipType,
    finalLevel: finalTarget.finalLevel,
    finalAmount: finalTarget.finalAmount,
    weightedEtc: Number.MAX_SAFE_INTEGER,
    totalEtc: Number.MAX_SAFE_INTEGER,
    buildingSideEtc: Number.MAX_SAFE_INTEGER,
    researchSideEtc: Number.MAX_SAFE_INTEGER,
    bonusFactor: 1,
    blockers: [...new Set(blockers)],
    selectedRequestKind: 'NO_OP',
    immediateRequest: null,
    debug: {
      blocked: true,
      blockerCount: blockers.length,
      goalFamily
    }
  };
}

function stripImmediateRequest(goal: StrategicDevelopmentGoalEvaluation): BotStrategicDevelopmentGoal {
  return {
    goalKey: goal.goalKey,
    subsystemId: goal.subsystemId,
    goalFamily: goal.goalFamily,
    branch: goal.branch,
    planetId: goal.planetId,
    targetCoordinates: goal.targetCoordinates,
    finalTargetKind: goal.finalTargetKind,
    finalBuildingType: goal.finalBuildingType,
    finalTechnologyType: goal.finalTechnologyType,
    finalDefenceType: goal.finalDefenceType,
    finalShipType: goal.finalShipType,
    finalLevel: goal.finalLevel,
    finalAmount: goal.finalAmount,
    weightedEtc: goal.weightedEtc,
    totalEtc: goal.totalEtc,
    buildingSideEtc: goal.buildingSideEtc,
    researchSideEtc: goal.researchSideEtc,
    bonusFactor: goal.bonusFactor,
    blockers: [...goal.blockers],
    debug: { ...goal.debug }
  };
}

function isActionableGoal(goal: StrategicDevelopmentGoalEvaluation): boolean {
  return goal.immediateRequest !== null && goal.blockers.length === 0;
}

function compareGoals(
  left: StrategicDevelopmentGoalEvaluation | BotStrategicDevelopmentGoal,
  right: StrategicDevelopmentGoalEvaluation | BotStrategicDevelopmentGoal
): number {
  return left.weightedEtc - right.weightedEtc
    || left.totalEtc - right.totalEtc
    || resolveGoalTargetLabel(left).localeCompare(resolveGoalTargetLabel(right));
}

function resolveGoalTargetLabel(
  goal: Pick<
    BotStrategicDevelopmentGoal,
    'goalFamily' | 'finalBuildingType' | 'finalTechnologyType' | 'finalShipType' | 'finalAmount'
  >
): string {
  if (goal.goalFamily === 'BUILDING') {
    return goal.finalBuildingType ?? 'building';
  }
  return goal.finalShipType
    ? `${goal.finalAmount ?? 1} ${goal.finalShipType}`
    : 'production';
}

function createSimulationState(planet: BotPlanetSnapshot): SimulatedState {
  return {
    buildingLevels: new Map<BuildingType, number>([
      [BuildingType.METAL_MINE, planet.economy.metalMineLevel],
      [BuildingType.CRYSTAL_MINE, planet.economy.crystalMineLevel],
      [BuildingType.DEUTERIUM_SYNTHESIZER, planet.economy.deuteriumSynthesizerLevel],
      [BuildingType.SOLAR_WIND_GEOTHERMAL, planet.economy.solarLevel],
      [BuildingType.NUCLEAR_PLANT, planet.economy.nuclearLevel],
      [BuildingType.FUSION_REACTOR, planet.economy.fusionLevel],
      [BuildingType.METAL_STORAGE, planet.economy.metalStorageLevel],
      [BuildingType.CRYSTAL_STORAGE, planet.economy.crystalStorageLevel],
      [BuildingType.DEUTERIUM_TANK, planet.economy.deuteriumTankLevel],
      [BuildingType.ROBOTICS_FACTORY, planet.economy.roboticsLevel],
      [BuildingType.SHIPYARD, planet.economy.shipyardLevel],
      [BuildingType.RESEARCH_LAB, planet.economy.researchLabLevel],
      [BuildingType.NANITE_FACTORY, planet.economy.naniteLevel],
      [BuildingType.INTERSTELLAR_TRADE_PORT, getBuildingLevel(planet, BuildingType.INTERSTELLAR_TRADE_PORT)],
      [BuildingType.SENSOR_PHALANX, getBuildingLevel(planet, BuildingType.SENSOR_PHALANX)],
      [BuildingType.JUMP_GATE, getBuildingLevel(planet, BuildingType.JUMP_GATE)]
    ]),
    techLevels: new Map<TechnologyType, number>([
      [TechnologyType.ENERGY_TECHNOLOGY, planet.tech.energyTechnologyLevel],
      [TechnologyType.MATERIAL_TECHNOLOGY, planet.tech.materialTechnologyLevel],
      [TechnologyType.ADAPTIVE_TECHNOLOGY, planet.tech.adaptiveTechnologyLevel],
      [TechnologyType.COMPUTER_TECHNOLOGY, planet.tech.computerTechnologyLevel],
      [TechnologyType.INTERGALACTIC_RESEARCH_NETWORK, planet.tech.intergalacticResearchNetworkLevel],
      [TechnologyType.SHIELDING_TECHNOLOGY, planet.tech.shieldingTechnologyLevel],
      [TechnologyType.ARMOUR_TECHNOLOGY, planet.tech.armourTechnologyLevel],
      [TechnologyType.RAILGUNS_WEAPONS, planet.tech.railgunsWeaponsLevel],
      [TechnologyType.BEAMS_WEAPONS, planet.tech.beamsWeaponsLevel],
      [TechnologyType.MISSILES_WEAPONS, planet.tech.missilesWeaponsLevel],
      [TechnologyType.FUSION_DRIVE, planet.tech.fusionDriveLevel],
      [TechnologyType.HYPERSPACE_DRIVE, planet.tech.hyperspaceDriveLevel],
      [TechnologyType.HYPERSPACE_TECHNOLOGY, planet.tech.hyperspaceTechnologyLevel],
      [TechnologyType.ESPIONAGE_TECHNOLOGY, planet.tech.espionageTechnologyLevel],
      [TechnologyType.ASTROPHYSICS_TECHNOLOGY, planet.tech.astrophysicsTechnologyLevel]
    ])
  };
}

function cloneSimulationState(state: SimulatedState): SimulatedState {
  return {
    buildingLevels: new Map(state.buildingLevels),
    techLevels: new Map(state.techLevels)
  };
}

function resolveSimulatedThroughput(
  planet: BotPlanetSnapshot,
  state: SimulatedState
): SimulatedThroughput {
  const adaptiveTechnologyLevel = state.techLevels.get(TechnologyType.ADAPTIVE_TECHNOLOGY) ?? planet.tech.adaptiveTechnologyLevel;
  const computerTechnologyLevel = state.techLevels.get(TechnologyType.COMPUTER_TECHNOLOGY) ?? planet.tech.computerTechnologyLevel;
  const intergalacticResearchNetworkLevel = state.techLevels.get(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK) ?? planet.tech.intergalacticResearchNetworkLevel;
  const energyEfficiency = resolveEnergyEfficiency(planet);
  const naniteMultiplier = resolveBuildingProductionValue1Exact(BuildingType.NANITE_FACTORY, state.buildingLevels) || 1;
  const roboticsPower = resolveBuildingProductionValue1(BuildingType.ROBOTICS_FACTORY, state.buildingLevels) || 5;
  const shipyardBasePower = resolveBuildingProductionValue1(BuildingType.SHIPYARD, state.buildingLevels);
  const researchLabBasePower = resolveBuildingProductionValue1(BuildingType.RESEARCH_LAB, state.buildingLevels);
  const droneProductionRouting = routeRepairDroneProduction(
    calculateRepairDroneProductionBasePower({
      repairDroneCount: planet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0,
      industryModifier: planet.modifiers.industry,
      adaptiveIndustryMultiplier: industryPowerMultiplier(adaptiveTechnologyLevel),
      energyEfficiency
    }),
    {
      hasBuildingQueueWork: true,
      hasShipyardQueueWork: false
    }
  );

  return {
    energyEfficiency,
    industryPower: Math.max(0, Math.floor(
      roboticsPower
      * naniteMultiplier
      * planet.modifiers.industry
      * industryPowerMultiplier(adaptiveTechnologyLevel)
      * energyEfficiency
    )) + droneProductionRouting.droneIndustryPower,
    researchPower: Math.max(0, Math.floor(
      researchLabBasePower
      * planet.modifiers.science
      * researchPowerMultiplier(
        computerTechnologyLevel,
        adaptiveTechnologyLevel,
        intergalacticResearchNetworkLevel
      )
      * energyEfficiency
    )),
    shipyardPower: Math.max(0, Math.floor(
      shipyardBasePower
      * naniteMultiplier
      * planet.modifiers.industry
      * industryPowerMultiplier(adaptiveTechnologyLevel)
      * energyEfficiency
    ))
  };
}

function resolveEnergyEfficiency(planet: BotPlanetSnapshot): number {
  const usedEnergy = Math.max(0, planet.economy.usedEnergy);
  const availableEnergy = Math.max(0, planet.economy.availableEnergy);
  if (usedEnergy <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(1, availableEnergy / usedEnergy));
}

function resolveBuildingProductionValue1(
  buildingType: BuildingType,
  buildingLevels: Map<BuildingType, number>
): number {
  const level = buildingLevels.get(buildingType) ?? 0;
  if (level <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  const value = blueprint?.production1[level - 1] ?? 0;
  return Number.isFinite(value) ? Math.floor(value) : 0;
}

function resolveBuildingProductionValue1Exact(
  buildingType: BuildingType,
  buildingLevels: Map<BuildingType, number>
): number {
  const level = buildingLevels.get(buildingType) ?? 0;
  if (level <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  const value = blueprint?.production1[level - 1] ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function getBuildingLevel(planet: BotPlanetSnapshot, buildingType: BuildingType): number {
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
    case BuildingType.INTERSTELLAR_TRADE_PORT:
      return planet.economy.interstellarTradePortLevel;
    case BuildingType.METAL_STORAGE:
      return planet.economy.metalStorageLevel;
    case BuildingType.CRYSTAL_STORAGE:
      return planet.economy.crystalStorageLevel;
    case BuildingType.DEUTERIUM_TANK:
      return planet.economy.deuteriumTankLevel;
    default:
      return 0;
  }
}

function getTechnologyLevel(planet: BotPlanetSnapshot, technologyType: TechnologyType): number {
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
    default:
      return 0;
  }
}

function normalizeResources(resources: { metal: number; crystal: number; deuterium: number }): ResourceAmounts {
  return {
    metal: Math.max(0, Math.floor(resources.metal ?? 0)),
    crystal: Math.max(0, Math.floor(resources.crystal ?? 0)),
    deuterium: Math.max(0, Math.floor(resources.deuterium ?? 0))
  };
}

function emptyResources(): ResourceAmounts {
  return {
    metal: 0,
    crystal: 0,
    deuterium: 0
  };
}

function addResources(left: ResourceAmounts, right: ResourceAmounts): ResourceAmounts {
  return {
    metal: left.metal + right.metal,
    crystal: left.crystal + right.crystal,
    deuterium: left.deuterium + right.deuterium
  };
}

function subtractResources(left: ResourceAmounts, right: ResourceAmounts): ResourceAmounts {
  return {
    metal: Math.max(0, left.metal - right.metal),
    crystal: Math.max(0, left.crystal - right.crystal),
    deuterium: Math.max(0, left.deuterium - right.deuterium)
  };
}

function minResources(left: ResourceAmounts, right: ResourceAmounts): ResourceAmounts {
  return {
    metal: Math.min(left.metal, right.metal),
    crystal: Math.min(left.crystal, right.crystal),
    deuterium: Math.min(left.deuterium, right.deuterium)
  };
}

function maxResources(left: ResourceAmounts, right: ResourceAmounts): ResourceAmounts {
  return {
    metal: Math.max(left.metal, right.metal),
    crystal: Math.max(left.crystal, right.crystal),
    deuterium: Math.max(left.deuterium, right.deuterium)
  };
}

function multiplyResources(resources: ResourceAmounts, multiplier: number): ResourceAmounts {
  const normalizedMultiplier = Math.max(0, Math.floor(multiplier));
  return {
    metal: resources.metal * normalizedMultiplier,
    crystal: resources.crystal * normalizedMultiplier,
    deuterium: resources.deuterium * normalizedMultiplier
  };
}

function getTotalResourceAmount(resources: ResourceAmounts): number {
  return resources.metal + resources.crystal + resources.deuterium;
}

function normalizeFiniteEtc(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : Number.MAX_SAFE_INTEGER;
}

function roundToTwoDecimals(value: number): number {
  if (!Number.isFinite(value)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.round(value * 100) / 100;
}

function resolveRequestKey(
  planet: BotPlanetSnapshot,
  request: BuildingStep | ResearchStep | ProductionStep
): string {
  if (request.kind === 'BUILDING') {
    return `building:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.buildingType}:${request.nextLevel}`;
  }
  if (request.kind === 'RESEARCH') {
    return `research:${request.technologyType}:${request.nextLevel}`;
  }
  return `shipyard:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.shipType}:${request.amount}`;
}

function resolveDedupeKey(
  planet: BotPlanetSnapshot,
  request: BuildingStep | ResearchStep | ProductionStep
): string {
  if (request.kind === 'BUILDING') {
    return `strategic-development:building:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.buildingType}`;
  }
  if (request.kind === 'RESEARCH') {
    return `strategic-development:research:${request.technologyType}`;
  }
  return `strategic-development:shipyard:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.shipType}`;
}

function resolveRankLabel(index: number, noun: string): string {
  const labels = ['Primary', 'Secondary'];
  const prefix = labels[index] ?? `#${index + 1}`;
  return `${prefix} ${noun}`;
}
