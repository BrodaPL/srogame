import * as buildingTypeModule from '../../../../../src/app/models/enums/building-type.js';
import * as defenceTypeModule from '../../../../../src/app/models/enums/defence-type.js';
import * as shipTypeModule from '../../../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../../../src/app/models/enums/technology-type.js';
import * as fusionReactorOperationModule from '../../../../../src/app/models/planets/fusion-reactor-operation.js';
import * as technologyEffectsModule from '../../../../../src/app/models/tech/technology-effects.js';
import * as repairDroneProductionModule from '../../../../../src/app/models/turns/repair-drone-production.js';
import type { Technology } from '../../../../../src/app/models/tech/technology.ts';
import type {
  BotDefensiveBranch,
  BotDefensiveGoal,
  BotDefensivePlanetResult,
  BotPlanetSnapshot,
  BotProposal,
  BotProposalKind,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  DEFENCE_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import { resolveModule } from '../../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../../src/app/models/enums/building-type.js');
const { DefenceType } = resolveModule(defenceTypeModule) as typeof import('../../../../../src/app/models/enums/defence-type.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../../src/app/models/enums/technology-type.js');
const { resolveFusionReactorOperation } = resolveModule(fusionReactorOperationModule) as typeof import('../../../../../src/app/models/planets/fusion-reactor-operation.js');
const { industryPowerMultiplier, researchPowerMultiplier } = resolveModule(technologyEffectsModule) as typeof import('../../../../../src/app/models/tech/technology-effects.js');
const {
  calculateRepairDroneProductionBasePower,
  routeRepairDroneProduction
} = resolveModule(repairDroneProductionModule) as typeof import('../../../../../src/app/models/turns/repair-drone-production.js');

type BuildingTypeT = buildingTypeModule.BuildingType;
type DefenceTypeT = defenceTypeModule.DefenceType;
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
  shipyardPower: number;
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
  defenceType: DefenceTypeT;
  amount: number;
  cost: ResourceAmounts;
  blockers: string[];
};

type DefensiveGoalEvaluation = BotDefensiveGoal & {
  immediateRequest: BuildingStep | ResearchStep | ProductionStep | null;
  selectedRequestKind: BotProposalKind;
};

type PlanetDefensiveEvaluationResult = {
  proposals: BotProposal[];
  goals: BotDefensiveGoal[];
  planetResult: BotDefensivePlanetResult;
};

const NON_BOMB_DEFENCE_TYPES = [
  DefenceType.SAM_SITE,
  DefenceType.LIGHT_BEAM_CANNON,
  DefenceType.ORBITAL_MISSILE_LAUNCHER,
  DefenceType.BEAM_CANNON,
  DefenceType.HEAVY_ORBITAL_MISSILE_LAUNCHER,
  DefenceType.HEAVY_BEAM_CANNON,
  DefenceType.RAIL_GUN_CANNON
] as const;

const ALLOWED_DEFENSIVE_BUILDING_SCOPE = new Set<BuildingTypeT>([
  BuildingType.BUNKER_NETWORK,
  BuildingType.SHIPYARD,
  BuildingType.RESEARCH_LAB
]);

const BONUS_FACTOR_CEILING = 3;

const UNLOCK_THRESHOLDS: Array<{ defenceType: DefenceTypeT; threshold: number }> = [
  { defenceType: DefenceType.SAM_SITE, threshold: 2 },
  { defenceType: DefenceType.LIGHT_BEAM_CANNON, threshold: 2.5 },
  { defenceType: DefenceType.ORBITAL_MISSILE_LAUNCHER, threshold: 3.5 },
  { defenceType: DefenceType.BEAM_CANNON, threshold: 3.5 },
  { defenceType: DefenceType.HEAVY_ORBITAL_MISSILE_LAUNCHER, threshold: 5 },
  { defenceType: DefenceType.HEAVY_BEAM_CANNON, threshold: 5 },
  { defenceType: DefenceType.RAIL_GUN_CANNON, threshold: 5 }
] as const;

export class BotDefensiveSubsystem implements BotSubsystem {
  public readonly subsystemId = 'DEFENSIVE' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const proposals: BotProposal[] = [];
    const goals: BotDefensiveGoal[] = [];
    const planetResults: BotDefensivePlanetResult[] = [];
    let blockedPlanetCount = 0;

    for (const planet of context.snapshot.planets) {
      const planetResult = buildPlanetDefensiveResult(context, planet);
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

function buildPlanetDefensiveResult(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): PlanetDefensiveEvaluationResult {
  const structuralGoals = [
    evaluateBunkerGoal(context, planet),
    ...resolveUnlockCandidates(planet).map((entry) =>
      evaluateUnlockGoal(context, planet, entry.defenceType, entry.threshold)
    )
  ].filter((goal): goal is DefensiveGoalEvaluation => goal !== null)
    .sort(compareGoals);
  const productionGoals = NON_BOMB_DEFENCE_TYPES
    .map((defenceType) => evaluateProductionGoal(context, planet, defenceType))
    .filter((goal): goal is DefensiveGoalEvaluation => goal !== null)
    .sort(compareGoals);

  const selectedGoals = resolveSelectedGoals(structuralGoals, productionGoals);
  const proposals = createPlanetProposals(context, planet, selectedGoals.selectedGoals);
  const blockedGoalCount = [...structuralGoals, ...productionGoals]
    .filter((goal) => goal.blockers.length > 0)
    .length;

  return {
    proposals,
    goals: [...structuralGoals, ...productionGoals].map(stripImmediateRequest).sort(compareGoals),
    planetResult: {
      subsystemId: 'DEFENSIVE',
      planetId: planet.planetId,
      targetCoordinates: { ...planet.coordinates },
      branch: selectedGoals.branch,
      emittedRequestCount: proposals.length,
      primaryGoalKey: selectedGoals.selectedGoals[0]?.goalKey ?? null,
      secondaryGoalKey: selectedGoals.selectedGoals[1]?.goalKey ?? null,
      noActionReason: proposals.length > 0
        ? null
        : resolvePlanetNoActionReason(planet, structuralGoals, productionGoals, selectedGoals.branch),
      blockedGoalCount
    }
  };
}

function evaluateBunkerGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): DefensiveGoalEvaluation | null {
  const currentLevel = planet.defense.bunkerLevel;
  const desiredLevel = resolveDesiredBunkerLevel(planet);
  if (desiredLevel <= currentLevel) {
    return null;
  }

  const buildingSteps: BuildingStep[] = [];
  const blockers: string[] = [];
  const requiredTechLevels = new Map<TechnologyTypeT, number>();
  const dependencyState = createSimulationState(planet);
  collectBuildingGoalDependencies(
    BuildingType.BUNKER_NETWORK,
    desiredLevel,
    dependencyState,
    requiredTechLevels,
    buildingSteps,
    blockers,
    new Set()
  );

  if (blockers.length > 0 || buildingSteps.length === 0) {
    return createBlockedGoal(planet, 'BUILDING', currentLevel + 1, blockers, {
      finalTargetKind: 'BUILDING',
      finalBuildingType: BuildingType.BUNKER_NETWORK,
      finalTechnologyType: null,
      finalDefenceType: null,
      finalLevel: desiredLevel,
      finalAmount: null
    });
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels, buildingSteps);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, 'BUILDING', currentLevel + 1, researchBlockers, {
      finalTargetKind: 'BUILDING',
      finalBuildingType: BuildingType.BUNKER_NETWORK,
      finalTechnologyType: null,
      finalDefenceType: null,
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
    return createBlockedGoal(planet, 'BUILDING', currentLevel + 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'BUILDING',
      finalBuildingType: BuildingType.BUNKER_NETWORK,
      finalTechnologyType: null,
      finalDefenceType: null,
      finalLevel: desiredLevel,
      finalAmount: null
    });
  }

  const bonusFactor = resolveBunkerBonusFactor(planet, desiredLevel);
  const weightedEtc = totalEtc / bonusFactor;

  return {
    goalKey: `defensive:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:bunker:${desiredLevel}`,
    subsystemId: 'DEFENSIVE',
    goalFamily: 'BUILDING',
    branch: 'STRUCTURAL_ONLY',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'BUILDING',
    finalBuildingType: BuildingType.BUNKER_NETWORK,
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
      bunkerCurrentLevel: currentLevel,
      bunkerDesiredLevel: desiredLevel,
      goalFamily: 'BUILDING',
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateUnlockGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  defenceType: DefenceTypeT,
  threshold: number
): DefensiveGoalEvaluation | null {
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return null;
  }

  const dependencyState = createSimulationState(planet);
  const requiredTechLevels = new Map<TechnologyTypeT, number>();
  const buildingSteps: BuildingStep[] = [];
  const blockers: string[] = [];

  for (const requirement of blueprint.buildingRequirements) {
    if (!ALLOWED_DEFENSIVE_BUILDING_SCOPE.has(requirement.building)) {
      blockers.push(`OUT_OF_SCOPE_BUILDING_REQUIREMENT:${requirement.building}`);
      continue;
    }

    const requiredLevel = Math.ceil(requirement.level);
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
    return createBlockedGoal(planet, 'UNLOCK', 1, blockers, {
      finalTargetKind: 'DEFENCE',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalDefenceType: defenceType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels, buildingSteps);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, 'UNLOCK', 1, researchBlockers, {
      finalTargetKind: 'DEFENCE',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalDefenceType: defenceType,
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
    return createBlockedGoal(planet, 'UNLOCK', 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'DEFENCE',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalDefenceType: defenceType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const bonusFactor = 1;
  const weightedEtc = totalEtc / bonusFactor;

  return {
    goalKey: `defensive:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:unlock:${defenceType}`,
    subsystemId: 'DEFENSIVE',
    goalFamily: 'UNLOCK',
    branch: 'STRUCTURAL_ONLY',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'DEFENCE',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: defenceType,
    finalShipType: null,
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
      avgIndustryLevel: roundToTwoDecimals(planet.defense.avgIndustryLevel),
      bonusFactor,
      goalFamily: 'UNLOCK',
      threshold,
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateProductionGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  defenceType: DefenceTypeT
): DefensiveGoalEvaluation | null {
  if (isImmaturePlanet(planet)) {
    return null;
  }
  if (!canProduceDefenseNow(planet, defenceType)) {
    return null;
  }

  const immediateRequest = resolveProductionRequest(planet, defenceType);
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return null;
  }

  if (!immediateRequest) {
    return createBlockedGoal(planet, 'PRODUCTION', 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'DEFENCE',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalDefenceType: defenceType,
      finalLevel: null,
      finalAmount: 1
    });
  }

  const totalEtc = estimateProductionEtc(planet, immediateRequest);
  if (!Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, 'PRODUCTION', immediateRequest.amount, ['ETC_NOT_FINITE'], {
      finalTargetKind: 'DEFENCE',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalDefenceType: defenceType,
      finalLevel: null,
      finalAmount: immediateRequest.amount
    });
  }

  const bonusFactor = resolveProductionBonusFactor(planet, defenceType);
  const softCapPenaltyMultiplier = resolveDefenceSoftCapPenaltyMultiplier(context, planet, defenceType);
  const weightedEtc = (totalEtc / bonusFactor) * softCapPenaltyMultiplier;

  return {
    goalKey: `defensive:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:produce:${defenceType}:${immediateRequest.amount}`,
    subsystemId: 'DEFENSIVE',
    goalFamily: 'PRODUCTION',
    branch: 'PRODUCTION_ONLY',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: 'DEFENCE',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: defenceType,
    finalShipType: null,
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
      softCapPenaltyMultiplier: roundToTwoDecimals(softCapPenaltyMultiplier),
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function resolveSelectedGoals(
  structuralGoals: DefensiveGoalEvaluation[],
  productionGoals: DefensiveGoalEvaluation[]
): {
  branch: BotDefensiveBranch;
  selectedGoals: DefensiveGoalEvaluation[];
} {
  const actionableStructuralGoals = structuralGoals.filter(isActionableGoal);
  const actionableProductionGoals = productionGoals.filter(isActionableGoal);

  if (actionableProductionGoals.length <= 0) {
    return {
      branch: 'STRUCTURAL_ONLY',
      selectedGoals: actionableStructuralGoals.slice(0, 2)
    };
  }

  if (actionableStructuralGoals.length <= 0) {
    return {
      branch: 'PRODUCTION_ONLY',
      selectedGoals: actionableProductionGoals.slice(0, 2)
    };
  }

  return {
    branch: 'STRUCTURE_AND_PRODUCTION',
    selectedGoals: [
      actionableStructuralGoals[0],
      actionableProductionGoals[0]
    ].filter((goal): goal is DefensiveGoalEvaluation => goal !== undefined)
  };
}

function resolveUnlockCandidates(
  planet: BotPlanetSnapshot
): Array<{ defenceType: DefenceTypeT; threshold: number }> {
  return UNLOCK_THRESHOLDS.filter((entry) =>
    planet.defense.avgIndustryLevel >= entry.threshold
    && !canProduceDefenseNow(planet, entry.defenceType)
  );
}

function isDefenseUnlocked(planet: BotPlanetSnapshot, defenceType: DefenceTypeT): boolean {
  const installedCount = planet.defense.installedCountByType[defenceType] ?? 0;
  if (installedCount > 0 || planet.queues.queuedDefenceTypes.includes(defenceType)) {
    return true;
  }

  const threshold = UNLOCK_THRESHOLDS.find((entry) => entry.defenceType === defenceType)?.threshold ?? Number.MAX_SAFE_INTEGER;
  if (planet.defense.avgIndustryLevel < threshold) {
    return false;
  }

  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return false;
  }

  return blueprint.buildingRequirements.every((requirement) =>
    getBuildingLevel(planet, requirement.building) >= Math.ceil(requirement.level)
  ) && blueprint.techRequirements.every((requirement) =>
    getTechnologyLevel(planet, requirement.tech) >= Math.ceil(requirement.level)
  );
}

function canProduceDefenseNow(planet: BotPlanetSnapshot, defenceType: DefenceTypeT): boolean {
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return false;
  }

  return blueprint.buildingRequirements.every((requirement) =>
    getBuildingLevel(planet, requirement.building) >= Math.ceil(requirement.level)
  ) && blueprint.techRequirements.every((requirement) =>
    getTechnologyLevel(planet, requirement.tech) >= Math.ceil(requirement.level)
  );
}

function resolveDesiredBunkerLevel(planet: BotPlanetSnapshot): number {
  const baseTarget = Math.max(0, Math.floor(planet.defense.avgIndustryLevel - 1));
  return Math.min(resolveMaxBunkerLevel(planet), baseTarget);
}

function resolveMaxBunkerLevel(planet: BotPlanetSnapshot): number {
  const sizeBonus = planet.defense.planetSize <= 100
    ? 0
    : Math.floor((planet.defense.planetSize - 100) / 10);
  return 2 + sizeBonus + planet.defense.recentHostileAttackStep;
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
      if (!ALLOWED_DEFENSIVE_BUILDING_SCOPE.has(requirement.building)) {
        const requiredLevel = Math.ceil(nextLevel * requirement.level);
        if ((state.buildingLevels.get(requirement.building) ?? 0) < requiredLevel) {
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
  requiredTechLevels: Map<TechnologyTypeT, number>,
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
  technologyType: TechnologyTypeT,
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

    ensureResearchBuildingRequirements(
      technology,
      nextLevel,
      state,
      buildingSteps
    );
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
    if (!ALLOWED_DEFENSIVE_BUILDING_SCOPE.has(requirement.building)) {
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
  defenceType: DefenceTypeT
): ProductionStep | null {
  if (planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return null;
  }

  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return null;
  }

  const amount = resolveProductionOrderAmount(planet, defenceType);
  return {
    kind: 'SHIPYARD',
    defenceType,
    amount,
    cost: multiplyResources(normalizeResources(blueprint.cost), amount),
    blockers: []
  };
}

function resolveProductionOrderAmount(
  planet: BotPlanetSnapshot,
  defenceType: DefenceTypeT
): number {
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return 1;
  }

  const localIncomeTotal = planet.economy.income.metal + planet.economy.income.crystal + planet.economy.income.deuterium;
  const orderFactor = resolveDeterministicOrderFactor(planet, defenceType);
  const totalCost = Math.max(1, Math.floor(blueprint.cost.getTotalResourceAmount()));
  const targetBudget = Math.max(totalCost, Math.floor(localIncomeTotal * orderFactor));

  return Math.max(1, Math.floor(targetBudget / totalCost));
}

function resolveDeterministicOrderFactor(planet: BotPlanetSnapshot, defenceType: DefenceTypeT): number {
  const seed = `${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${planet.name}:${defenceType}`;
  let hash = 0;
  for (const character of seed) {
    hash = ((hash * 31) + character.charCodeAt(0)) % 100000;
  }

  return 1 + ((hash % 11) / 10);
}

function resolveBunkerBonusFactor(planet: BotPlanetSnapshot, desiredLevel: number): number {
  let bonusFactor = 1;
  bonusFactor *= 1 + (planet.defense.recentHostileAttackStep * 0.5);
  bonusFactor *= 1 + (Math.max(0, desiredLevel - planet.defense.bunkerLevel) * 0.1);
  bonusFactor *= 1 + resolveEquilibriumBonusRatio(
    planet.defense.totalInstalledDefenseValue,
    planet.defense.totalBunkerValue
  );
  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, bonusFactor));
}

function resolveProductionBonusFactor(planet: BotPlanetSnapshot, defenceType: DefenceTypeT): number {
  let bonusFactor = 1;
  bonusFactor *= 1 + resolveEquilibriumBonusRatio(
    planet.defense.totalBunkerValue,
    planet.defense.totalInstalledDefenseValue
  );
  bonusFactor *= 1 + resolveDistributionBonusRatio(planet, defenceType);
  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, bonusFactor));
}

function resolveEquilibriumBonusRatio(leadingValue: number, trailingValue: number): number {
  if (leadingValue <= trailingValue) {
    return 0;
  }

  const trailingBase = Math.max(1, trailingValue);
  return Math.max(0, (leadingValue - trailingValue) / trailingBase) / 2;
}

function resolveDistributionBonusRatio(
  planet: BotPlanetSnapshot,
  defenceType: DefenceTypeT
): number {
  const unlockedTypes = NON_BOMB_DEFENCE_TYPES.filter((type) => isDefenseUnlocked(planet, type));
  if (unlockedTypes.length <= 1) {
    return 0;
  }

  const maxInstalledValue = unlockedTypes.reduce((maxValue, type) =>
    Math.max(maxValue, planet.defense.installedValueByType[type] ?? 0), 0);
  if (maxInstalledValue <= 0) {
    return 0;
  }

  const candidateValue = planet.defense.installedValueByType[defenceType] ?? 0;
  const missingRatio = Math.max(0, (maxInstalledValue - candidateValue) / maxInstalledValue);
  return missingRatio * 0.35;
}

function resolveDefenceSoftCapPenaltyMultiplier(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  defenceType: DefenceTypeT
): number {
  if (isImmaturePlanet(planet)) {
    return Number.MAX_SAFE_INTEGER;
  }

  if (planet.defense.knownByWarFaction || planet.defense.recentHostileAttackCountLast20Turns > 0) {
    return 1;
  }

  const multiplier = context.snapshot.profileId === 'BUNKERER' ? 20 : 12;
  const capResources = {
    metal: Math.max(1, planet.economy.income.metal * multiplier),
    crystal: Math.max(1, planet.economy.income.crystal * multiplier),
    deuterium: Math.max(1, planet.economy.income.deuterium * multiplier)
  };
  const layerValue = resolveDefenceLayerResources(planet, defenceType);
  const overageRatio = Math.max(
    layerValue.metal / capResources.metal,
    layerValue.crystal / capResources.crystal,
    layerValue.deuterium / capResources.deuterium
  );
  if (overageRatio <= 1) {
    return 1;
  }

  return 1 + Math.min(6, (overageRatio - 1) * 2.5);
}

function resolveDefenceLayerResources(
  planet: BotPlanetSnapshot,
  defenceType: DefenceTypeT
): ResourceAmounts {
  const layerTypes = isMissileLayerDefenceType(defenceType)
    ? [DefenceType.SAM_SITE, DefenceType.ORBITAL_MISSILE_LAUNCHER, DefenceType.HEAVY_ORBITAL_MISSILE_LAUNCHER]
    : [DefenceType.LIGHT_BEAM_CANNON, DefenceType.BEAM_CANNON, DefenceType.HEAVY_BEAM_CANNON, DefenceType.RAIL_GUN_CANNON];
  const total: ResourceAmounts = { metal: 0, crystal: 0, deuterium: 0 };

  for (const type of layerTypes) {
    const blueprint = DEFENCE_BLUEPRINTS.get(type);
    if (!blueprint) {
      continue;
    }
    const amount = planet.defense.installedCountByType[type] ?? 0;
    total.metal += blueprint.cost.metal * amount;
    total.crystal += blueprint.cost.crystal * amount;
    total.deuterium += blueprint.cost.deuterium * amount;
  }

  return total;
}

function isMissileLayerDefenceType(defenceType: DefenceTypeT): boolean {
  return defenceType === DefenceType.SAM_SITE
    || defenceType === DefenceType.ORBITAL_MISSILE_LAUNCHER
    || defenceType === DefenceType.HEAVY_ORBITAL_MISSILE_LAUNCHER;
}

function isImmaturePlanet(planet: BotPlanetSnapshot): boolean {
  return planet.maturityStage === 'BOOTSTRAP' || planet.maturityStage === 'STABILIZING';
}

function createPlanetProposals(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goals: DefensiveGoalEvaluation[]
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
      existing.summary = `${existing.summary} Also advances secondary goal ${resolveGoalTargetLabel(goal)}.`;
      existing.debug.requestRole = 'Primary+Secondary';
      existing.debug.secondaryGoalKey = goal.goalKey;
      existing.debug.secondaryGoalTarget = resolveGoalTargetLabel(goal);
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

  return `shipyard:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.defenceType}:${request.amount}`;
}

function createProposalFromGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goal: DefensiveGoalEvaluation,
  selectedIndex: number
): BotProposal {
  const request = goal.immediateRequest;
  if (!request) {
    throw new Error(`Defensive goal ${goal.goalKey} has no immediate request.`);
  }

  const requestLabel = selectedIndex === 0 ? 'Primary request' : 'Secondary request';
  const goalLabel = selectedIndex === 0 ? 'Primary goal' : 'Secondary goal';
  const summary = request.kind === 'BUILDING'
    ? `${requestLabel}: queue ${request.buildingType} for ${goalLabel} ${resolveGoalTargetLabel(goal)} on ${planet.name}.`
    : request.kind === 'RESEARCH'
      ? `${requestLabel}: research ${request.technologyType} for ${goalLabel} ${resolveGoalTargetLabel(goal)} on ${planet.name}.`
      : `${requestLabel}: produce ${request.amount} ${request.defenceType} for ${goalLabel} on ${planet.name}.`;
  const urgency = goal.goalFamily === 'BUILDING'
    ? 78
    : goal.goalFamily === 'UNLOCK'
      ? 72
      : 65;

  return {
    proposalId: `${goal.goalKey}:${selectedIndex}:${context.snapshot.turn}`,
    subsystemId: 'DEFENSIVE',
    kind: goal.selectedRequestKind,
    status: 'PROPOSED',
    goalKey: goal.goalKey,
    dedupeKey: resolveDedupeKey(planet, request),
    summary,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    expectedValue: Math.max(1, Math.round((1000 / Math.max(1, goal.weightedEtc)) * 100)),
    urgency,
    risk: 8,
    confidence: 76,
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
          itemKind: 'defence',
          defenceType: request.defenceType,
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
      goalRole: goalLabel,
      immediateRequestKind: request.kind,
      immediateRequestTarget: request.kind === 'BUILDING'
        ? request.buildingType
        : request.kind === 'RESEARCH'
          ? request.technologyType
          : request.defenceType,
      immediateRequestAmount: request.kind === 'SHIPYARD' ? request.amount : null,
      primaryGoalKey: goal.goalKey,
      secondaryGoalKey: null,
      selectedIndex: selectedIndex + 1,
      sharedImmediateRequest: false
    }
  };
}

function resolveDedupeKey(
  planet: BotPlanetSnapshot,
  request: BuildingStep | ResearchStep | ProductionStep
): string {
  if (request.kind === 'BUILDING') {
    return `defensive:building:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.buildingType}`;
  }
  if (request.kind === 'RESEARCH') {
    return `defensive:research:${request.technologyType}`;
  }

  return `defensive:shipyard:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.defenceType}`;
}

function resolvePlanetNoActionReason(
  planet: BotPlanetSnapshot,
  structuralGoals: DefensiveGoalEvaluation[],
  productionGoals: DefensiveGoalEvaluation[],
  branch: BotDefensiveBranch
): string {
  const allGoals = [...structuralGoals, ...productionGoals];
  if (allGoals.length <= 0) {
    return 'NO_CANDIDATE_GOALS';
  }

  if (allGoals.every((goal) => goal.blockers.length > 0)) {
    return allGoals[0]?.blockers[0] ?? 'ALL_GOALS_BLOCKED';
  }

  if (branch === 'STRUCTURAL_ONLY' && planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength && planet.queues.hasActiveResearch) {
    return 'STRUCTURAL_QUEUES_BLOCKED';
  }
  if (branch === 'PRODUCTION_ONLY' && planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return 'SHIPYARD_QUEUE_SATURATED';
  }
  if (branch === 'STRUCTURE_AND_PRODUCTION' && planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return 'PRODUCTION_QUEUE_SATURATED';
  }

  return 'NO_ACTIONABLE_REQUEST';
}

function createBlockedGoal(
  planet: BotPlanetSnapshot,
  goalFamily: 'UNLOCK' | 'BUILDING' | 'PRODUCTION',
  fallbackAmount: number,
  blockers: string[],
  finalTarget: {
    finalTargetKind: 'BUILDING' | 'DEFENCE';
    finalBuildingType: BuildingTypeT | null;
    finalTechnologyType: TechnologyTypeT | null;
    finalDefenceType: DefenceTypeT | null;
    finalShipType?: null;
    finalLevel: number | null;
    finalAmount: number | null;
  }
): DefensiveGoalEvaluation {
  return {
    goalKey: `defensive:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${goalFamily}:${finalTarget.finalBuildingType ?? finalTarget.finalDefenceType ?? fallbackAmount}`,
    subsystemId: 'DEFENSIVE',
    goalFamily,
    branch: goalFamily === 'PRODUCTION' ? 'PRODUCTION_ONLY' : 'STRUCTURAL_ONLY',
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    finalTargetKind: finalTarget.finalTargetKind,
    finalBuildingType: finalTarget.finalBuildingType,
    finalTechnologyType: finalTarget.finalTechnologyType,
    finalDefenceType: finalTarget.finalDefenceType,
    finalShipType: null,
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

function stripImmediateRequest(goal: DefensiveGoalEvaluation): BotDefensiveGoal {
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

function isActionableGoal(goal: DefensiveGoalEvaluation): boolean {
  return goal.immediateRequest !== null && goal.blockers.length === 0;
}

function compareGoals(left: DefensiveGoalEvaluation | BotDefensiveGoal, right: DefensiveGoalEvaluation | BotDefensiveGoal): number {
  return left.weightedEtc - right.weightedEtc
    || left.totalEtc - right.totalEtc
    || resolveGoalTargetLabel(left).localeCompare(resolveGoalTargetLabel(right));
}

function resolveGoalTargetLabel(
  goal: Pick<
    BotDefensiveGoal,
    'goalFamily' | 'finalBuildingType' | 'finalTechnologyType' | 'finalDefenceType' | 'finalShipType' | 'finalAmount'
  >
): string {
  if (goal.goalFamily === 'BUILDING') {
    return goal.finalBuildingType ?? 'Building';
  }
  if (goal.goalFamily === 'UNLOCK') {
    return goal.finalDefenceType ? `unlock ${goal.finalDefenceType}` : 'unlock';
  }
  return goal.finalDefenceType
    ? `${goal.finalAmount ?? 1} ${goal.finalDefenceType}`
    : 'defence production';
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
      [BuildingType.RESEARCH_LAB, planet.economy.researchLabLevel],
      [BuildingType.BUNKER_NETWORK, planet.defense.bunkerLevel]
    ]),
    techLevels: new Map<TechnologyTypeT, number>([
      [TechnologyType.ENERGY_TECHNOLOGY, planet.tech.energyTechnologyLevel],
      [TechnologyType.MATERIAL_TECHNOLOGY, planet.tech.materialTechnologyLevel],
      [TechnologyType.ADAPTIVE_TECHNOLOGY, planet.tech.adaptiveTechnologyLevel],
      [TechnologyType.COMPUTER_TECHNOLOGY, planet.tech.computerTechnologyLevel],
      [TechnologyType.INTERGALACTIC_RESEARCH_NETWORK, planet.tech.intergalacticResearchNetworkLevel],
      [TechnologyType.SHIELDING_TECHNOLOGY, planet.tech.shieldingTechnologyLevel],
      [TechnologyType.ARMOUR_TECHNOLOGY, planet.tech.armourTechnologyLevel],
      [TechnologyType.RAILGUNS_WEAPONS, planet.tech.railgunsWeaponsLevel],
      [TechnologyType.BEAMS_WEAPONS, planet.tech.beamsWeaponsLevel],
      [TechnologyType.MISSILES_WEAPONS, planet.tech.missilesWeaponsLevel]
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
  const shipyardLevel = state.buildingLevels.get(BuildingType.SHIPYARD) ?? 0;
  const roboticsPower = roboticsLevel <= 0
    ? 5
    : getRawBuildingStageProductionValue(BuildingType.ROBOTICS_FACTORY, roboticsLevel, 'production1');
  const naniteMultiplier = naniteLevel <= 0
    ? 1
    : getRawBuildingStageProductionValue(BuildingType.NANITE_FACTORY, naniteLevel, 'production1');
  const researchLabPower = researchLabLevel <= 0
    ? 0
    : getRawBuildingStageProductionValue(BuildingType.RESEARCH_LAB, researchLabLevel, 'production1');
  const shipyardBasePower = shipyardLevel <= 0
    ? 0
    : getRawBuildingStageProductionValue(BuildingType.SHIPYARD, shipyardLevel, 'production1');
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
    availableEnergy,
    usedEnergy,
    energyEfficiency,
    industryPower: Math.max(0, Math.floor(
      roboticsPower
      * naniteMultiplier
      * planet.modifiers.industry
      * industryPowerMultiplier(adaptiveTechnologyLevel)
      * energyEfficiency
    )) + droneProductionRouting.droneIndustryPower,
    researchPower: Math.max(0, Math.floor(
      researchLabPower
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

  const value = blueprint[key][level - 1];
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
    case BuildingType.BUNKER_NETWORK:
      return planet.defense.bunkerLevel;
    default:
      return 0;
  }
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

function multiplyResources(resources: ResourceAmounts, multiplier: number): ResourceAmounts {
  const normalizedMultiplier = Math.max(1, Math.floor(multiplier));
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
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.floor(value);
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
