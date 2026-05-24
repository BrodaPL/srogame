import * as buildingTypeModule from '../../../../../src/app/models/enums/building-type.js';
import * as shipTypeModule from '../../../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../../../src/app/models/enums/technology-type.js';
import * as fusionReactorOperationModule from '../../../../../src/app/models/planets/fusion-reactor-operation.js';
import * as technologyEffectsModule from '../../../../../src/app/models/tech/technology-effects.js';
import type { Technology } from '../../../../../src/app/models/tech/technology.ts';
import type {
  BotEconomicBranch,
  BotEconomicGoal,
  BotEconomicPlanetResult,
  BotPlanetSnapshot,
  BotProposal,
  BotProposalKind,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import { resolveModule } from '../../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../../src/app/models/enums/building-type.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../../src/app/models/enums/technology-type.js');
const { resolveFusionReactorOperation } = resolveModule(fusionReactorOperationModule) as typeof import('../../../../../src/app/models/planets/fusion-reactor-operation.js');
const { industryPowerMultiplier, researchPowerMultiplier } = resolveModule(technologyEffectsModule) as typeof import('../../../../../src/app/models/tech/technology-effects.js');

type BuildingTypeT = buildingTypeModule.BuildingType;
type ShipTypeT = shipTypeModule.ShipType;
type TechnologyTypeT = technologyTypeModule.TechnologyType;

type ResourceKey = 'metal' | 'crystal' | 'deuterium';

type ResourceAmounts = Record<ResourceKey, number>;

type SimulatedState = {
  buildingLevels: Map<BuildingTypeT, number>;
  techLevels: Map<TechnologyTypeT, number>;
};

type SimulatedThroughput = {
  availableEnergy: number;
  usedEnergy: number;
  energyEfficiency: number;
  industryPower: number;
  researchPower: number;
};

type BuildingStep = {
  kind: 'BUILDING';
  buildingType: BuildingTypeT;
  nextLevel: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type ResearchStep = {
  kind: 'RESEARCH';
  technologyType: TechnologyTypeT;
  nextLevel: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type ProductionStep = {
  kind: 'SHIPYARD';
  shipType: ShipTypeT;
  amount: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type EconomicGoalEvaluation = BotEconomicGoal & {
  immediateRequest: BuildingStep | ResearchStep | ProductionStep | null;
  selectedRequestKind: BotProposalKind;
};

type PlanetEconomicEvaluationResult = {
  proposals: BotProposal[];
  goals: BotEconomicGoal[];
  planetResult: BotEconomicPlanetResult;
};

const ECONOMY_BUILDING_TYPES = [
  BuildingType.METAL_MINE,
  BuildingType.CRYSTAL_MINE,
  BuildingType.DEUTERIUM_SYNTHESIZER,
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.NANITE_FACTORY
] as const;

const ENERGY_BUILDING_TYPES = [
  BuildingType.SOLAR_WIND_GEOTHERMAL,
  BuildingType.NUCLEAR_PLANT,
  BuildingType.FUSION_REACTOR
] as const;

const STORAGE_BUILDING_TYPES = [
  BuildingType.METAL_STORAGE,
  BuildingType.CRYSTAL_STORAGE,
  BuildingType.DEUTERIUM_TANK
] as const;

const ALLOWED_ECONOMIC_BUILDING_SCOPE = new Set<BuildingTypeT>([
  ...ECONOMY_BUILDING_TYPES,
  ...ENERGY_BUILDING_TYPES,
  ...STORAGE_BUILDING_TYPES
]);

const BRANCH_ENERGY_TARGET_BUFFER = 5;
const INDUSTRY_BONUS_FACTOR = 1.1;
const BONUS_FACTOR_CEILING = 2;
const STORAGE_TARGET_MULTIPLIER = 1.5;
const REPAIR_DRONE_BASE_INDUSTRY_RATIO = 0.05;
const METAL_PENALTY_MINE_PRIORITY_MULTIPLIER = 1.25;
const CRYSTAL_PENALTY_MINE_PRIORITY_MULTIPLIER = 1.1;

export class BotEconomicSubsystem implements BotSubsystem {
  public readonly subsystemId = 'ECONOMIC' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const proposals: BotProposal[] = [];
    const goals: BotEconomicGoal[] = [];
    const planetResults: BotEconomicPlanetResult[] = [];
    let blockedPlanetCount = 0;

    for (const planet of context.snapshot.planets) {
      const planetResult = buildPlanetEconomicResult(context, planet);
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
        planetCount: context.snapshot.planets.length,
        planetResultCount: planetResults.length
      }
    };
  }
}

function buildPlanetEconomicResult(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): PlanetEconomicEvaluationResult {
  const branch = resolveActiveBranch(planet);
  const candidateTypes = resolveCandidateBuildingTypes(planet, branch);
  const evaluatedGoals = candidateTypes
    .map((buildingType) => evaluateGoalForBuilding(context, planet, branch, buildingType))
    .filter((goal): goal is EconomicGoalEvaluation => goal !== null);
  const rankedGoals = evaluatedGoals
    .sort((left, right) =>
      left.weightedEtc - right.weightedEtc
      || left.totalEtc - right.totalEtc
      || resolveEconomicGoalTargetLabel(left).localeCompare(resolveEconomicGoalTargetLabel(right))
    );
  const selectedGoals = rankedGoals
    .filter((goal) => goal.immediateRequest !== null && goal.blockers.length === 0)
    .slice(0, 2);
  const repairDroneGoal = evaluateRepairDroneEconomyGoal(planet);
  const proposals = createPlanetProposals(context, planet, [
    ...selectedGoals,
    ...(repairDroneGoal ? [repairDroneGoal] : [])
  ]);
  const blockedGoalCount = rankedGoals.filter((goal) => goal.blockers.length > 0).length;

  return {
    proposals,
    goals: rankedGoals.map(stripImmediateRequest),
    planetResult: {
      subsystemId: 'ECONOMIC',
      planetId: planet.planetId,
      targetCoordinates: { ...planet.coordinates },
      branch,
      emittedRequestCount: proposals.length,
      primaryGoalKey: selectedGoals[0]?.goalKey ?? null,
      secondaryGoalKey: selectedGoals[1]?.goalKey ?? null,
      noActionReason: proposals.length > 0 ? null : resolvePlanetNoActionReason(planet, rankedGoals),
      blockedGoalCount
    }
  };
}

function resolveActiveBranch(planet: BotPlanetSnapshot): BotEconomicBranch {
  const energyTarget = planet.economy.usedEnergy + BRANCH_ENERGY_TARGET_BUFFER;
  if (planet.economy.availableEnergy < energyTarget) {
    return 'ENERGY';
  }

  if (resolveMostDeficientStorageType(planet) !== null) {
    return 'STORAGE';
  }

  return 'ECONOMY';
}

function resolveCandidateBuildingTypes(
  planet: BotPlanetSnapshot,
  branch: BotEconomicBranch
): BuildingTypeT[] {
  if (branch === 'ENERGY') {
    return [...ENERGY_BUILDING_TYPES];
  }

  if (branch === 'STORAGE') {
    const storageType = resolveMostDeficientStorageType(planet);
    return storageType ? [storageType] : [];
  }

  return [...ECONOMY_BUILDING_TYPES];
}

function evaluateGoalForBuilding(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  branch: BotEconomicBranch,
  finalBuildingType: BuildingTypeT
): EconomicGoalEvaluation | null {
  const finalBuildingLevel = getBuildingLevel(planet, finalBuildingType) + 1;
  const buildingBlueprint = BUILDING_BLUEPRINTS.get(finalBuildingType);
  if (!buildingBlueprint) {
    return null;
  }

  const dependencyState = createSimulationState(planet);
  const requiredTechLevels = new Map<TechnologyTypeT, number>();
  const buildingSteps: BuildingStep[] = [];
  const blockers: string[] = [];
  collectBuildingGoalDependencies(
    finalBuildingType,
    finalBuildingLevel,
    dependencyState,
    requiredTechLevels,
    buildingSteps,
    blockers,
    new Set()
  );

  if (blockers.length > 0 || buildingSteps.length === 0) {
    return createBlockedGoal(planet, branch, finalBuildingType, finalBuildingLevel, blockers);
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, branch, finalBuildingType, finalBuildingLevel, researchBlockers);
  }

  const initialState = createSimulationState(planet);
  const buildingSideEtc = estimateBuildingChainEtc(planet, initialState, buildingSteps);
  const researchSideEtc = estimateResearchChainEtc(planet, initialState, researchSteps);
  const totalEtc = Math.max(buildingSideEtc, researchSideEtc);
  if (!Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, branch, finalBuildingType, finalBuildingLevel, ['ETC_NOT_FINITE']);
  }

  const immediateRequest = selectImmediateRequest(planet, buildingSteps, buildingSideEtc, researchSteps, researchSideEtc);
  if (!immediateRequest) {
    return createBlockedGoal(planet, branch, finalBuildingType, finalBuildingLevel, ['NO_ACTIONABLE_REQUEST']);
  }

  const bonusFactor = resolveBonusFactor(planet, branch, finalBuildingType);
  const weightedEtc = totalEtc / bonusFactor;

  return {
    goalKey: `economic:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${finalBuildingType}:${finalBuildingLevel}`,
    subsystemId: 'ECONOMIC',
    goalFamily: 'ECONOMIC',
    branch,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'BUILDING',
    finalBuildingType,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: null,
    finalLevel: finalBuildingLevel,
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
      branch,
      buildingSideEtc: roundToTwoDecimals(buildingSideEtc),
      finalBuildingType,
      finalBuildingLevel,
      immediateRequestKind: immediateRequest.kind,
      researchSideEtc: roundToTwoDecimals(researchSideEtc),
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateRepairDroneEconomyGoal(
  planet: BotPlanetSnapshot
): EconomicGoalEvaluation | null {
  if (planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return null;
  }
  if (!canProduceShipNow(planet, ShipType.REPAIR_DRONE)) {
    return null;
  }

  const installed = planet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0;
  const target = resolveEconomicRepairDroneTarget(planet);
  const gap = Math.max(0, target - installed);
  if (gap <= 0) {
    return null;
  }

  const blueprint = SHIP_BLUEPRINTS.get(ShipType.REPAIR_DRONE);
  if (!blueprint || planet.power.shipyardPower <= 0) {
    return null;
  }

  const unitCost = normalizeResources(blueprint.cost);
  const unitCostTotal = Math.max(1, getTotalResourceAmount(unitCost));
  const localIncomeTotal = planet.economy.income.metal + planet.economy.income.crystal + planet.economy.income.deuterium;
  const amount = Math.min(
    gap,
    Math.max(1, Math.floor(localIncomeTotal / unitCostTotal), Math.ceil(gap / 3))
  );
  const cost = multiplyResources(unitCost, amount);
  const totalEtc = normalizeFiniteEtc(planet.power.shipyardQueueRemainingEtc)
    + Math.ceil(getTotalResourceAmount(cost) / planet.power.shipyardPower);
  const weightedEtc = totalEtc / resolveRepairDroneEconomyBonusFactor(planet, installed, target);

  return {
    goalKey: `economic:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:ship:${ShipType.REPAIR_DRONE}:${target}`,
    subsystemId: 'ECONOMIC',
    goalFamily: 'ECONOMIC',
    branch: 'ECONOMY',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'SHIP',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: ShipType.REPAIR_DRONE,
    finalLevel: null,
    finalAmount: amount,
    weightedEtc,
    totalEtc,
    buildingSideEtc: totalEtc,
    researchSideEtc: 0,
    bonusFactor: resolveRepairDroneEconomyBonusFactor(planet, installed, target),
    blockers: [],
    selectedRequestKind: 'SHIPYARD',
    immediateRequest: {
      kind: 'SHIPYARD',
      shipType: ShipType.REPAIR_DRONE,
      amount,
      cost,
      blockers: []
    },
    debug: {
      branch: 'ECONOMY',
      finalShipType: ShipType.REPAIR_DRONE,
      goalFamily: 'ECONOMIC',
      repairDroneInstalled: installed,
      repairDroneTarget: target,
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function resolveEconomicRepairDroneTarget(planet: BotPlanetSnapshot): number {
  const industryModifierPenalty = Math.max(0, 1 - planet.modifiers.industry);
  const targetRatio = REPAIR_DRONE_BASE_INDUSTRY_RATIO + industryModifierPenalty;
  return Math.max(0, Math.ceil(planet.power.industryPower * targetRatio));
}

function resolveRepairDroneEconomyBonusFactor(
  planet: BotPlanetSnapshot,
  installed: number,
  target: number
): number {
  if (target <= 0) {
    return 1;
  }

  const missingRatio = Math.max(0, (target - installed) / target);
  const industryPenalty = Math.max(0, 1 - planet.modifiers.industry);
  return Math.min(BONUS_FACTOR_CEILING, 1 + (missingRatio * 0.5) + industryPenalty);
}

function collectBuildingGoalDependencies(
  buildingType: BuildingTypeT,
  targetLevel: number,
  state: SimulatedState,
  requiredTechLevels: Map<TechnologyTypeT, number>,
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
      if (!ALLOWED_ECONOMIC_BUILDING_SCOPE.has(requirement.building)) {
        const requiredLevel = Math.ceil(nextLevel * requirement.level);
        const existingLevel = state.buildingLevels.get(requirement.building) ?? 0;
        if (existingLevel < requiredLevel) {
          blockers.push(`OUT_OF_SCOPE_BUILDING_REQUIREMENT:${requirement.building}`);
        }
        continue;
      }

      const requiredLevel = Math.ceil(nextLevel * requirement.level);
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

    const cost = normalizeResources(blueprint.getCostForLevel(nextLevel));
    buildingSteps.push({
      kind: 'BUILDING',
      buildingType,
      nextLevel,
      cost,
      blockers: []
    });
    currentLevel = nextLevel;
    state.buildingLevels.set(buildingType, currentLevel);
  }

  visiting.delete(visitKey);
}

function resolveResearchSteps(
  planet: BotPlanetSnapshot,
  requiredTechLevels: Map<TechnologyTypeT, number>
): ResearchStep[] {
  const steps: ResearchStep[] = [];
  const state = createSimulationState(planet);

  for (const [technologyType, requiredLevel] of [...requiredTechLevels.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))) {
    collectResearchDependencies(
      technologyType,
      requiredLevel,
      state,
      steps,
      new Set()
    );
  }

  return steps;
}

function collectResearchDependencies(
  technologyType: TechnologyTypeT,
  targetLevel: number,
  state: SimulatedState,
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

    const blockers = resolveResearchBuildingBlockers(state, technology, nextLevel);
    for (const requirement of technology.techRequirements) {
      const requiredLevel = Math.ceil(nextLevel * requirement.level);
      if ((state.techLevels.get(requirement.tech) ?? 0) < requiredLevel) {
        collectResearchDependencies(requirement.tech, requiredLevel, state, steps, visiting);
      }
    }

    const cost = normalizeResources(technology.getCostForLevel(nextLevel));
    steps.push({
      kind: 'RESEARCH',
      technologyType,
      nextLevel,
      cost,
      blockers
    });
    currentLevel = nextLevel;
    state.techLevels.set(technologyType, currentLevel);
  }

  visiting.delete(visitKey);
}

function resolveResearchBuildingBlockers(
  state: SimulatedState,
  technology: Technology,
  nextLevel: number
): string[] {
  const blockers: string[] = [];
  for (const requirement of technology.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = state.buildingLevels.get(requirement.building) ?? 0;
    if (currentLevel < requiredLevel) {
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

    const buildTurns = Math.ceil(getTotalResourceAmount(step.cost) / throughput.industryPower);
    elapsed += buildTurns;
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

    const researchTurns = Math.ceil(getTotalResourceAmount(step.cost) / throughput.researchPower);
    elapsed += researchTurns;
    state.techLevels.set(step.technologyType, step.nextLevel);
  }

  return elapsed;
}

function selectImmediateRequest(
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

function resolveBonusFactor(
  planet: BotPlanetSnapshot,
  branch: BotEconomicBranch,
  finalBuildingType: BuildingTypeT
): number {
  let bonusFactor = 1;

  if (finalBuildingType === BuildingType.ROBOTICS_FACTORY || finalBuildingType === BuildingType.NANITE_FACTORY) {
    bonusFactor *= INDUSTRY_BONUS_FACTOR;
  }

  if (branch === 'ENERGY') {
    const energyTarget = planet.economy.usedEnergy + BRANCH_ENERGY_TARGET_BUFFER;
    const deficit = Math.max(0, energyTarget - planet.economy.availableEnergy);
    bonusFactor *= 1 + (deficit * 0.1);
  }

  if (branch === 'STORAGE') {
    const deficiency = resolveStorageDeficiencyForType(planet, finalBuildingType);
    bonusFactor *= 1 + deficiency;
  }

  bonusFactor *= resolvePlanetaryBonusFactor(planet, finalBuildingType);
  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, bonusFactor));
}

function resolvePlanetaryBonusFactor(planet: BotPlanetSnapshot, buildingType: BuildingTypeT): number {
  if (planet.economy.interstellarTradePortLevel > 0) {
    return 1;
  }

  switch (buildingType) {
    case BuildingType.METAL_MINE:
      return 1 + (Math.max(0, 1 - planet.modifiers.metal) * METAL_PENALTY_MINE_PRIORITY_MULTIPLIER);
    case BuildingType.CRYSTAL_MINE:
      return 1 + (Math.max(0, 1 - planet.modifiers.crystal) * CRYSTAL_PENALTY_MINE_PRIORITY_MULTIPLIER);
    default:
      return 1;
  }
}

function resolveMostDeficientStorageType(planet: BotPlanetSnapshot): BuildingTypeT | null {
  const targets = resolveStorageTargets(planet);
  const deficiencies = [
    {
      buildingType: BuildingType.METAL_STORAGE,
      deficiency: Math.max(0, (targets.metal - planet.economy.storageCapacity.metal) / Math.max(1, targets.metal))
    },
    {
      buildingType: BuildingType.CRYSTAL_STORAGE,
      deficiency: Math.max(0, (targets.crystal - planet.economy.storageCapacity.crystal) / Math.max(1, targets.crystal))
    },
    {
      buildingType: BuildingType.DEUTERIUM_TANK,
      deficiency: Math.max(0, (targets.deuterium - planet.economy.storageCapacity.deuterium) / Math.max(1, targets.deuterium))
    }
  ]
    .filter((entry) => entry.deficiency > 0)
    .sort((left, right) => right.deficiency - left.deficiency);

  return deficiencies[0]?.buildingType ?? null;
}

function resolveStorageDeficiencyForType(planet: BotPlanetSnapshot, buildingType: BuildingTypeT): number {
  const targets = resolveStorageTargets(planet);
  if (buildingType === BuildingType.METAL_STORAGE) {
    return Math.max(0, (targets.metal - planet.economy.storageCapacity.metal) / Math.max(1, targets.metal));
  }
  if (buildingType === BuildingType.CRYSTAL_STORAGE) {
    return Math.max(0, (targets.crystal - planet.economy.storageCapacity.crystal) / Math.max(1, targets.crystal));
  }
  if (buildingType === BuildingType.DEUTERIUM_TANK) {
    return Math.max(0, (targets.deuterium - planet.economy.storageCapacity.deuterium) / Math.max(1, targets.deuterium));
  }
  return 0;
}

function resolveStorageTargets(planet: BotPlanetSnapshot): ResourceAmounts {
  const consideredBuildingTypes = [
    ...ECONOMY_BUILDING_TYPES,
    ...ENERGY_BUILDING_TYPES
  ];
  const highestRelevantCost = consideredBuildingTypes.reduce<ResourceAmounts>((maxCost, buildingType) => {
    const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
    if (!blueprint) {
      return maxCost;
    }

    const nextLevel = getBuildingLevel(planet, buildingType) + 1;
    const cost = normalizeResources(blueprint.getCostForLevel(nextLevel));
    return {
      metal: Math.max(maxCost.metal, cost.metal),
      crystal: Math.max(maxCost.crystal, cost.crystal),
      deuterium: Math.max(maxCost.deuterium, cost.deuterium)
    };
  }, {
    metal: 0,
    crystal: 0,
    deuterium: 0
  });

  return {
    metal: Math.max(1, Math.ceil(highestRelevantCost.metal * STORAGE_TARGET_MULTIPLIER)),
    crystal: Math.max(1, Math.ceil(highestRelevantCost.crystal * STORAGE_TARGET_MULTIPLIER)),
    deuterium: Math.max(1, Math.ceil(highestRelevantCost.deuterium * STORAGE_TARGET_MULTIPLIER))
  };
}

function createPlanetProposals(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goals: EconomicGoalEvaluation[]
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
      existing.summary = `${existing.summary} Also advances secondary goal ${goal.finalBuildingType}.`;
      existing.debug.requestRole = 'Primary+Secondary';
      existing.debug.secondaryGoalKey = goal.goalKey;
      existing.debug.secondaryGoalBuildingType = goal.finalBuildingType;
      existing.debug.secondaryGoalBuildingLevel = goal.finalLevel;
      existing.debug.sharedImmediateRequest = true;
      continue;
    }

    const proposal = createProposalFromGoal(context, planet, goal, index);
    proposalsByRequest.set(requestKey, proposal);
    proposals.push(proposal);
  }

  return proposals;
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

function createProposalFromGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goal: EconomicGoalEvaluation,
  selectedIndex: number
): BotProposal {
  const request = goal.immediateRequest;
  if (!request) {
    throw new Error(`Economic goal ${goal.goalKey} has no immediate request.`);
  }

  const requestKey = selectedIndex === 0 ? 'primary_request' : 'secondary_request';
  const requestLabel = selectedIndex === 0 ? 'Primary request' : 'Secondary request';
  const goalLabel = selectedIndex === 0 ? 'Primary goal' : 'Secondary goal';
  const goalTargetLabel = resolveEconomicGoalTargetLabel(goal);
  const summary = request.kind === 'BUILDING'
    ? `${requestLabel}: queue ${request.buildingType} for ${goalLabel} ${goalTargetLabel} on ${planet.name}.`
    : request.kind === 'RESEARCH'
      ? `${requestLabel}: research ${request.technologyType} for ${goalLabel} ${goalTargetLabel} on ${planet.name}.`
      : `${requestLabel}: produce ${request.amount} ${request.shipType} for ${goalLabel} production support on ${planet.name}.`;

  const expectedValue = Math.max(1, Math.round((1000 / Math.max(1, goal.weightedEtc)) * 100));
  const urgency = goal.branch === 'ENERGY'
    ? 95
    : goal.branch === 'STORAGE'
      ? 80
      : 60;

  return {
    proposalId: `${goal.goalKey}:${requestKey}:${context.snapshot.turn}`,
    subsystemId: 'ECONOMIC',
    kind: goal.selectedRequestKind,
    status: 'PROPOSED',
    goalKey: goal.goalKey,
    dedupeKey: request.kind === 'BUILDING'
      ? `economic:building:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.buildingType}`
      : request.kind === 'RESEARCH'
        ? `economic:research:${request.technologyType}`
        : `economic:shipyard:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.shipType}`,
    summary,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    expectedValue,
    urgency,
    risk: 5,
    confidence: 80,
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
      bonusFactor: roundToTwoDecimals(goal.bonusFactor),
      finalGoalBuildingType: goal.finalBuildingType,
      finalGoalShipType: goal.finalShipType,
      finalGoalBuildingLevel: goal.finalLevel,
      goalRole: goalLabel,
      immediateRequestKind: request.kind,
      immediateRequestLabel: requestLabel,
      immediateRequestTarget: request.kind === 'BUILDING'
        ? request.buildingType
        : request.kind === 'RESEARCH'
          ? request.technologyType
          : request.shipType,
      immediateRequestAmount: request.kind === 'SHIPYARD' ? request.amount : null,
      primaryGoalKey: goal.goalKey,
      secondaryGoalKey: null,
      selectedIndex: selectedIndex + 1,
      sharedImmediateRequest: false
    }
  };
}

function resolveEconomicGoalTargetLabel(goal: EconomicGoalEvaluation): string {
  return goal.finalBuildingType ?? goal.finalShipType ?? goal.finalTechnologyType ?? 'economic support';
}

function resolvePlanetNoActionReason(
  planet: BotPlanetSnapshot,
  goals: EconomicGoalEvaluation[]
): string {
  if (goals.length <= 0) {
    return 'NO_CANDIDATE_GOALS';
  }

  if (goals.every((goal) => goal.blockers.length > 0)) {
    return goals[0]?.blockers[0] ?? 'ALL_GOALS_BLOCKED';
  }

  if (
    planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength
    && planet.queues.hasActiveResearch
  ) {
    return 'ALL_QUEUES_BLOCKED';
  }

  if (planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength) {
    return 'BUILDING_QUEUE_SATURATED';
  }

  if (planet.queues.hasActiveResearch) {
    return 'RESEARCH_QUEUE_ACTIVE';
  }

  return 'NO_ACTIONABLE_REQUEST';
}

function createBlockedGoal(
  planet: BotPlanetSnapshot,
  branch: BotEconomicBranch,
  finalBuildingType: BuildingTypeT,
  finalBuildingLevel: number,
  blockers: string[]
): EconomicGoalEvaluation {
  return {
    goalKey: `economic:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${finalBuildingType}:${finalBuildingLevel}`,
    subsystemId: 'ECONOMIC',
    goalFamily: 'ECONOMIC',
    branch,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'BUILDING',
    finalBuildingType,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: null,
    finalLevel: finalBuildingLevel,
    finalAmount: null,
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
      branch
    }
  };
}

function stripImmediateRequest(goal: EconomicGoalEvaluation): BotEconomicGoal {
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

function createSimulationState(planet: BotPlanetSnapshot): SimulatedState {
  return {
    buildingLevels: new Map<BuildingTypeT, number>([
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
      [BuildingType.NANITE_FACTORY, planet.economy.naniteLevel],
      [BuildingType.SHIPYARD, planet.economy.shipyardLevel],
      [BuildingType.RESEARCH_LAB, planet.economy.researchLabLevel]
    ]),
    techLevels: new Map<TechnologyTypeT, number>([
      [TechnologyType.ENERGY_TECHNOLOGY, planet.tech.energyTechnologyLevel],
      [TechnologyType.MATERIAL_TECHNOLOGY, planet.tech.materialTechnologyLevel],
      [TechnologyType.ADAPTIVE_TECHNOLOGY, planet.tech.adaptiveTechnologyLevel],
      [TechnologyType.COMPUTER_TECHNOLOGY, planet.tech.computerTechnologyLevel],
      [TechnologyType.INTERGALACTIC_RESEARCH_NETWORK, planet.tech.intergalacticResearchNetworkLevel]
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
  const energyTechnologyLevel = state.techLevels.get(TechnologyType.ENERGY_TECHNOLOGY) ?? 0;
  const adaptiveTechnologyLevel = state.techLevels.get(TechnologyType.ADAPTIVE_TECHNOLOGY) ?? 0;
  const computerTechnologyLevel = state.techLevels.get(TechnologyType.COMPUTER_TECHNOLOGY) ?? 0;
  const intergalacticResearchNetworkLevel = state.techLevels.get(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK) ?? 0;
  const usedEnergy = resolveSimulatedUsedEnergy(state);
  const solarProduction = getRawBuildingProductionValue(BuildingType.SOLAR_WIND_GEOTHERMAL, state);
  const nuclearProduction = getRawBuildingProductionValue(BuildingType.NUCLEAR_PLANT, state);
  const deuteriumSynthesizerProduction = getRawBuildingProductionValue(BuildingType.DEUTERIUM_SYNTHESIZER, state);
  const fusionLevel = state.buildingLevels.get(BuildingType.FUSION_REACTOR) ?? 0;
  const fusionOperation = resolveFusionReactorOperation({
    selectedStage: fusionLevel,
    maxStage: fusionLevel,
    structuralUtilization: 1,
    energyTechnologyLevel,
    adaptiveTechnologyLevel,
    solarProduction,
    nuclearProduction,
    otherEnergyUsed: usedEnergy,
    energyModifierRES: planet.modifiers.solarEnergy,
    energyModifierNuclear: planet.modifiers.nuclearEnergy,
    deuteriumSynthesizerProduction,
    deuteriumModifier: planet.modifiers.deuterium,
    fusionPowerAtStage: (stage) => getRawBuildingStageProductionValue(BuildingType.FUSION_REACTOR, stage, 'production1'),
    fusionDeuteriumAtStage: (stage) => getRawBuildingStageProductionValue(BuildingType.FUSION_REACTOR, stage, 'production2')
  });
  const availableEnergy = Math.max(0, Math.floor(
    (
      (solarProduction * planet.modifiers.solarEnergy)
      + (nuclearProduction * planet.modifiers.nuclearEnergy)
      + fusionOperation.powerOutput
    )
    * (1 + ((Math.max(0, energyTechnologyLevel) * 2) / 100))
  ));
  const energyEfficiency = resolveEnergyEfficiency(availableEnergy, usedEnergy);
  const roboticsLevel = state.buildingLevels.get(BuildingType.ROBOTICS_FACTORY) ?? 0;
  const naniteLevel = state.buildingLevels.get(BuildingType.NANITE_FACTORY) ?? 0;
  const researchLabLevel = state.buildingLevels.get(BuildingType.RESEARCH_LAB) ?? 0;
  const roboticsPower = roboticsLevel <= 0
    ? 5
    : getRawBuildingStageProductionValue(BuildingType.ROBOTICS_FACTORY, roboticsLevel, 'production1');
  const naniteMultiplier = naniteLevel <= 0
    ? 1
    : getRawBuildingStageProductionValue(BuildingType.NANITE_FACTORY, naniteLevel, 'production1');
  const researchLabPower = researchLabLevel <= 0
    ? 0
    : getRawBuildingStageProductionValue(BuildingType.RESEARCH_LAB, researchLabLevel, 'production1');

  return {
    availableEnergy,
    usedEnergy,
    energyEfficiency,
    industryPower: Math.max(0, Math.floor(
      roboticsPower
      * naniteMultiplier
      * planet.modifiers.industry
      * industryPowerMultiplier(adaptiveTechnologyLevel)
      * energyEfficiency
    )),
    researchPower: Math.max(0, Math.floor(
      researchLabPower
      * planet.modifiers.science
      * researchPowerMultiplier(
        computerTechnologyLevel,
        adaptiveTechnologyLevel,
        intergalacticResearchNetworkLevel
      )
      * energyEfficiency
    ))
  };
}

function resolveSimulatedUsedEnergy(state: SimulatedState): number {
  let usedEnergy = 0;
  for (const [buildingType, level] of state.buildingLevels.entries()) {
    if (level <= 0 || buildingType === BuildingType.FUSION_REACTOR) {
      continue;
    }

    usedEnergy += getMaxPowerConsumption(buildingType, level);
  }

  return Math.max(0, Math.floor(usedEnergy));
}

function getMaxPowerConsumption(buildingType: BuildingTypeT, level: number): number {
  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  if (!blueprint || level <= 0) {
    return 0;
  }

  return Math.max(0, level * (blueprint.powerConsumption ?? 0));
}

function getRawBuildingProductionValue(
  buildingType: BuildingTypeT,
  state: SimulatedState
): number {
  return getRawBuildingStageProductionValue(
    buildingType,
    state.buildingLevels.get(buildingType) ?? 0,
    'production1'
  );
}

function getRawBuildingStageProductionValue(
  buildingType: BuildingTypeT,
  level: number,
  key: 'production1' | 'production2'
): number {
  if (level <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  if (!blueprint) {
    return 0;
  }

  const values = blueprint[key];
  const value = values[level - 1];
  return Number.isFinite(value) ? value : 0;
}

function resolveEnergyEfficiency(availableEnergy: number, usedEnergy: number): number {
  if (usedEnergy <= 0 || availableEnergy >= usedEnergy) {
    return 1;
  }

  return Math.max(0, Math.min(1, availableEnergy / usedEnergy));
}

function getBuildingLevel(planet: BotPlanetSnapshot, buildingType: BuildingTypeT): number {
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
    default:
      return 0;
  }
}

function canProduceShipNow(planet: BotPlanetSnapshot, shipType: ShipTypeT): boolean {
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

function getTechnologyLevel(planet: BotPlanetSnapshot, technologyType: TechnologyTypeT): number {
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

function normalizeResources(resources: { metal: number; crystal: number; deuterium: number }): ResourceAmounts {
  return {
    metal: Math.max(0, Math.floor(resources.metal)),
    crystal: Math.max(0, Math.floor(resources.crystal)),
    deuterium: Math.max(0, Math.floor(resources.deuterium))
  };
}

function multiplyResources(resources: ResourceAmounts, amount: number): ResourceAmounts {
  return {
    metal: resources.metal * amount,
    crystal: resources.crystal * amount,
    deuterium: resources.deuterium * amount
  };
}

function getTotalResourceAmount(resources: ResourceAmounts): number {
  return resources.metal + resources.crystal + resources.deuterium;
}

function normalizeFiniteEtc(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
