import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import {
  industryPowerMultiplier,
  maxOwnedPlanets,
  researchPowerMultiplier
} from '../../../../../src/app/models/tech/technology-effects.js';
import {
  calculateRepairDroneProductionBasePower,
  routeRepairDroneProduction
} from '../../../../../src/app/models/turns/repair-drone-production.js';
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
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';

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

type PlanetStrategicDevelopmentEvaluationResult = {
  proposals: BotProposal[];
  goals: BotStrategicDevelopmentGoal[];
  planetResult: BotStrategicDevelopmentPlanetResult;
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

export class BotStrategicDevelopmentSubsystem implements BotSubsystem {
  public readonly subsystemId = 'STRATEGIC_DEVELOPMENT' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const proposals: BotProposal[] = [];
    const goals: BotStrategicDevelopmentGoal[] = [];
    const planetResults: BotStrategicDevelopmentPlanetResult[] = [];
    let blockedPlanetCount = 0;

    for (const planet of context.snapshot.planets) {
      const planetResult = buildPlanetStrategicDevelopmentResult(context, planet);
      if (planetResult.proposals.length === 0) {
        blockedPlanetCount += 1;
      }

      proposals.push(...planetResult.proposals);
      goals.push(...planetResult.goals);
      planetResults.push(planetResult.planetResult);
    }

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
  const weightedEtc = totalEtc / bonusFactor;

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
