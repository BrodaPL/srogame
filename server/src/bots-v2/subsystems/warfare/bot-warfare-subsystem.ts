import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import {
  fleetTravelTurnsForDistance,
  industryPowerMultiplier,
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
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult,
  BotWarfareBranch,
  BotWarfareGoal,
  BotWarfarePlanetResult
} from '../../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  calculateFuelCost,
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

type WarfareGoalEvaluation = BotWarfareGoal & {
  immediateRequest: BuildingStep | ResearchStep | ProductionStep | null;
  selectedRequestKind: BotProposalKind;
};

type PlanetWarfareEvaluationResult = {
  proposals: BotProposal[];
  goals: BotWarfareGoal[];
  planetResult: BotWarfarePlanetResult;
};

type RecycleTarget = {
  scope: 'OWN' | 'SAFE_FOREIGN' | 'NEUTRAL_FOREIGN';
  targetCoordinates: { x: number; y: number; z: number };
  targetName: string;
  targetOwnerId: number | null;
  targetStatus: DiplomaticStatus | null;
  debris: ResourceAmounts;
  debrisValue: number;
  thresholdValue: number;
  intelAge: number | null;
  knownShipsCount: number;
  knownDefencesCount: number;
};

type RecycleCandidate = RecycleTarget & {
  originPlanet: BotPlanetSnapshot;
  desiredRecyclerCount: number;
  escortShipType: ShipType | null;
  escortShipCount: number;
  travelDistance: number;
  travelTurns: number;
  fuelCost: number;
  idleTurnsEstimate: number;
  score: number;
};

type RecoveryPlan = {
  proposals: BotProposal[];
  goals: BotWarfareGoal[];
  debug: Record<string, string | number | boolean | null>;
};

const CARGO_SHIP_TYPES = [
  ShipType.TRANSPORTER,
  ShipType.MASS_HAULER,
  ShipType.CARGO_SUPPORT
] as const;

const COMBAT_SHIP_TYPES = [
  ShipType.FIGHTER,
  ShipType.ASSAULT_FIGHTER,
  ShipType.ATMOSPHERIC_FIGHTER,
  ShipType.ATMOSPHERIC_BOMBER,
  ShipType.CORVETTE,
  ShipType.CRUISER,
  ShipType.BATTLE_SHIP,
  ShipType.FRIGATE,
  ShipType.BATTLE_CRUISER,
  ShipType.DESTROYER,
  ShipType.DREADNOUGHT,
  ShipType.ORBITAL_BOMBER,
  ShipType.CARRIER,
  ShipType.TITAN,
  ShipType.ARMAGEDDON_BOMBER,
  ShipType.BEHEMOTH,
  ShipType.FLEET_CARRIER,
  ShipType.MOTHER_SHIP
] as const;

const EXCLUDED_WARFARE_SHIP_TYPES = [
  ShipType.SPY_PROBE,
  ShipType.REPAIR_DRONE,
  ShipType.RECYCLER,
  ShipType.COLONIZER
] as const;

const INCLUDED_WARFARE_SHIP_TYPES = [
  ...COMBAT_SHIP_TYPES,
  ...CARGO_SHIP_TYPES
] as const;

const SMALL_SUPPORT_SHIP_TYPES = [
  ShipType.FIGHTER,
  ShipType.ASSAULT_FIGHTER,
  ShipType.ATMOSPHERIC_FIGHTER,
  ShipType.CORVETTE,
  ShipType.ATMOSPHERIC_BOMBER
] as const;
// TODO: Add dedicated production-goal handling for MOTHER_SHIP if its order sizing
// or unlock/selection rules need to differ from the generic ship-production flow.

const ALLOWED_WARFARE_BUILDING_SCOPE = new Set<BuildingType>([
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.RESEARCH_LAB,
  BuildingType.SHIPYARD,
  BuildingType.NANITE_FACTORY
]);

const BONUS_FACTOR_CEILING = 3;
const NANITE_WEIGHTED_ETC_PENALTY = 1.2;
const MAX_VISIBLE_GOALS = 5;
const STRUCTURAL_VISIBILITY_THRESHOLD = 1.5;
const FOREIGN_RECYCLE_INTEL_MAX_AGE = 20;

export class BotWarfareSubsystem implements BotSubsystem {
  public readonly subsystemId = 'WARFARE' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const proposals: BotProposal[] = [];
    const goals: BotWarfareGoal[] = [];
    const planetResults: BotWarfarePlanetResult[] = [];
    let blockedPlanetCount = 0;

    for (const planet of context.snapshot.planets) {
      const planetResult = buildPlanetWarfareResult(context, planet);
      if (planetResult.proposals.length === 0) {
        blockedPlanetCount += 1;
      }

      proposals.push(...planetResult.proposals);
      goals.push(...planetResult.goals);
      planetResults.push(planetResult.planetResult);
    }

    const recoveryPlan = buildRecoveryPlan(context);
    proposals.push(...recoveryPlan.proposals);
    goals.push(...recoveryPlan.goals);

    return {
      subsystemId: this.subsystemId,
      proposals,
      goals,
      planetResults,
      debug: {
        blockedPlanetCount,
        excludedShipTypeCount: EXCLUDED_WARFARE_SHIP_TYPES.length,
        goalCount: goals.length,
        planetCount: context.snapshot.planets.length,
        planetResultCount: planetResults.length,
        recycleProposalCount: recoveryPlan.proposals.length,
        recoveryGoalCount: recoveryPlan.goals.length,
        ...recoveryPlan.debug
      }
    };
  }
}

function buildPlanetWarfareResult(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): PlanetWarfareEvaluationResult {
  const capacityGoals = [
    evaluateCapacityGoal(context, planet, BuildingType.SHIPYARD, resolveTargetShipyardLevel(planet)),
    evaluateCapacityGoal(context, planet, BuildingType.NANITE_FACTORY, resolveTargetNaniteLevel(planet))
  ].filter((goal): goal is WarfareGoalEvaluation => goal !== null)
    .sort(compareGoals);
  const unlockGoals = INCLUDED_WARFARE_SHIP_TYPES
    .filter((shipType) => isShipUnlockBandOpen(planet, shipType) && !canProduceShipNow(planet, shipType))
    .map((shipType) => evaluateUnlockGoal(context, planet, shipType))
    .filter((goal): goal is WarfareGoalEvaluation => goal !== null)
    .sort(compareGoals);
  const structuralGoals = [...capacityGoals, ...unlockGoals].sort(compareGoals);
  const productionGoals = INCLUDED_WARFARE_SHIP_TYPES
    .map((shipType) => evaluateProductionGoal(context, planet, shipType))
    .filter((goal): goal is WarfareGoalEvaluation => goal !== null)
    .sort(compareGoals);

  const selectedGoals = resolveSelectedGoals(planet, structuralGoals, productionGoals);
  const proposals = createPlanetProposals(context, planet, selectedGoals.selectedGoals);
  const blockedGoalCount = [...structuralGoals, ...productionGoals]
    .filter((goal) => goal.blockers.length > 0)
    .length;

  return {
    proposals,
    goals: [...structuralGoals, ...productionGoals].map(stripImmediateRequest).sort(compareGoals),
    planetResult: {
      subsystemId: 'WARFARE',
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

function buildRecoveryPlan(context: BotSubsystemContext): RecoveryPlan {
  const recycleFleetCap = resolveRecycleFleetCap(context);
  const activeRecycleFleetCount = context.snapshot.empire.activeRecycleFleetCount ?? 0;
  if (activeRecycleFleetCount >= recycleFleetCap) {
    return {
      proposals: [],
      goals: [],
      debug: {
        recoveryNoActionReason: 'ACTIVE_RECYCLE_FLEET_PRESENT',
        recycleFleetCap,
        activeRecycleFleetCount
      }
    };
  }

  const targets = collectRecycleTargets(context);
  if (targets.length <= 0) {
    return {
      proposals: [],
      goals: [],
      debug: {
        recoveryNoActionReason: 'NO_RECYCLE_TARGETS',
        recycleFleetCap,
        activeRecycleFleetCount
      }
    };
  }

  const totalRecyclerCount = context.snapshot.planets.reduce((sum, planet) =>
    sum + (planet.ships.undamagedCountByType[ShipType.RECYCLER] ?? 0), 0);
  const candidates = targets
    .map((target) => evaluateBestRecycleCandidateForTarget(context, target))
    .filter((candidate): candidate is RecycleCandidate => candidate !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
      || left.targetCoordinates.x - right.targetCoordinates.x
      || left.targetCoordinates.y - right.targetCoordinates.y
      || left.targetCoordinates.z - right.targetCoordinates.z
    );
  const bestCandidate = candidates[0] ?? null;
  const bestTarget = targets
    .sort((left, right) =>
      right.debrisValue - left.debrisValue
      || right.thresholdValue - left.thresholdValue
      || left.targetCoordinates.x - right.targetCoordinates.x
      || left.targetCoordinates.y - right.targetCoordinates.y
      || left.targetCoordinates.z - right.targetCoordinates.z
    )[0] ?? null;

  if (bestCandidate) {
    return {
      proposals: [createRecycleFleetProposal(context, bestCandidate)],
      goals: [createRecycleRecoveryGoal(context, bestCandidate)],
      debug: {
        recoveryNoActionReason: null,
        recycleFleetCap,
        activeRecycleFleetCount,
        recycleTargetCount: targets.length,
        recycleCandidateCount: candidates.length,
        recycleBestTargetScope: bestCandidate.scope,
        recycleBestTargetDebrisValue: Math.round(bestCandidate.debrisValue),
        recycleBestTargetTravelTurns: bestCandidate.travelTurns
      }
    };
  }

  if (bestTarget && totalRecyclerCount <= 0) {
    return {
      proposals: [createRecycleShipNeedProposal(context, bestTarget)],
      goals: [createRecyclerNeedGoal(context, bestTarget, 1)],
      debug: {
        recoveryNoActionReason: 'NO_RECYCLERS_AVAILABLE',
        recycleFleetCap,
        activeRecycleFleetCount,
        recycleTargetCount: targets.length,
        recycleCandidateCount: 0
      }
    };
  }

  if (bestTarget && totalRecyclerCount > 0) {
    const shipyardPlanet = resolveBestRecyclerProductionPlanet(context.snapshot.planets);
    if (shipyardPlanet) {
      const desiredRecyclerCount = resolveDesiredRecyclerCount(bestTarget);
      const availableOnBestPlanet = shipyardPlanet.ships.undamagedCountByType[ShipType.RECYCLER] ?? 0;
      const shortage = Math.max(0, desiredRecyclerCount - availableOnBestPlanet);
      if (shortage > 0) {
        return {
          proposals: [createRecycleShipyardProposal(context, shipyardPlanet, bestTarget, shortage)],
          goals: [createRecyclerNeedGoal(context, bestTarget, shortage)],
          debug: {
            recoveryNoActionReason: 'RECYCLER_SHORTAGE',
            recycleFleetCap,
            activeRecycleFleetCount,
            recycleTargetCount: targets.length,
            recycleCandidateCount: 0,
            recycleShortageAmount: shortage
          }
        };
      }
    }
  }

  return {
    proposals: [],
    goals: [],
    debug: {
      recoveryNoActionReason: 'NO_ACTIONABLE_RECYCLE_OR_FALLBACK',
      recycleFleetCap,
      activeRecycleFleetCount,
      recycleTargetCount: targets.length,
      recycleCandidateCount: 0
    }
  };
}

function collectRecycleTargets(context: BotSubsystemContext): RecycleTarget[] {
  const ownTargets = context.snapshot.planets
    .map((planet): RecycleTarget | null => {
      const debris = normalizeResources(planet.spaceDebris ?? { metal: 0, crystal: 0, deuterium: 0 });
      const debrisValue = calculateWeightedValue(debris);
      const thresholdValue = calculateWeightedValue(normalizeResources(planet.economy.income));
      if (debrisValue < thresholdValue || getTotalResourceAmount(debris) <= 0) {
        return null;
      }

      return {
        scope: 'OWN' as const,
        targetCoordinates: { ...planet.coordinates },
        targetName: planet.name,
        targetOwnerId: context.snapshot.playerId,
        targetStatus: null,
        debris,
        debrisValue,
        thresholdValue,
        intelAge: 0,
        knownShipsCount: 0,
        knownDefencesCount: 0
      };
    })
    .filter((entry): entry is RecycleTarget => entry !== null);
  const averageDevelopedIncomeValue = resolveAverageDevelopedIncomeValue(context.snapshot.planets);
  const safeForeignTargets = context.snapshot.empire.strategicMilitaryTargets
    .map((target): RecycleTarget | null => {
      const debris = normalizeResources(target.spaceDebris ?? { metal: 0, crystal: 0, deuterium: 0 });
      const debrisValue = calculateWeightedValue(debris);
      const thresholdValue = averageDevelopedIncomeValue * 4;
      if (
        !target.isNeutral
        || target.reportAge === null
        || target.reportAge > FOREIGN_RECYCLE_INTEL_MAX_AGE
        || (target.currentDefencesCount ?? 0) > 0
        || (target.currentShipsCount ?? 0) > 0
        || debrisValue < thresholdValue
        || getTotalResourceAmount(debris) <= 0
      ) {
        return null;
      }

      return {
        scope: 'SAFE_FOREIGN' as const,
        targetCoordinates: { ...target.coordinates },
        targetName: formatCoordinatesLabel(target.coordinates),
        targetOwnerId: null,
        targetStatus: null,
        debris,
        debrisValue,
        thresholdValue,
        intelAge: target.reportAge,
        knownShipsCount: target.currentShipsCount ?? 0,
        knownDefencesCount: target.currentDefencesCount ?? 0
      };
    })
    .filter((entry): entry is RecycleTarget => entry !== null);
  const neutralForeignTargets = context.snapshot.empire.strategicDiplomaticFactions
    .filter((faction) => faction.currentStatus === DiplomaticStatus.NEUTRAL)
    .flatMap((faction) => faction.knownPlanets
      .map((planet): RecycleTarget | null => {
        const debris = normalizeResources(planet.spaceDebris ?? { metal: 0, crystal: 0, deuterium: 0 });
        const debrisValue = calculateWeightedValue(debris);
        const thresholdValue = averageDevelopedIncomeValue * 8;
        if (
          planet.lastRelevantReportAge > FOREIGN_RECYCLE_INTEL_MAX_AGE
          || debrisValue < thresholdValue
          || getTotalResourceAmount(debris) <= 0
        ) {
          return null;
        }

        return {
          scope: 'NEUTRAL_FOREIGN' as const,
          targetCoordinates: { ...planet.coordinates },
          targetName: formatCoordinatesLabel(planet.coordinates),
          targetOwnerId: faction.playerId,
          targetStatus: faction.currentStatus,
          debris,
          debrisValue,
          thresholdValue,
          intelAge: planet.lastRelevantReportAge,
          knownShipsCount: planet.totalShipsAmount,
          knownDefencesCount: planet.totalDefencesAmount
        };
      })
      .filter((entry): entry is RecycleTarget => entry !== null));

  return [...ownTargets, ...safeForeignTargets, ...neutralForeignTargets];
}

function evaluateBestRecycleCandidateForTarget(
  context: BotSubsystemContext,
  target: RecycleTarget
): RecycleCandidate | null {
  const desiredRecyclerCount = resolveDesiredRecyclerCount(target);
  const candidates = context.snapshot.planets
    .map((originPlanet) => buildRecycleCandidate(context, target, originPlanet, desiredRecyclerCount))
    .filter((candidate): candidate is RecycleCandidate => candidate !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
      || left.originPlanet.coordinates.x - right.originPlanet.coordinates.x
      || left.originPlanet.coordinates.y - right.originPlanet.coordinates.y
      || left.originPlanet.coordinates.z - right.originPlanet.coordinates.z
    );

  return candidates[0] ?? null;
}

function buildRecycleCandidate(
  context: BotSubsystemContext,
  target: RecycleTarget,
  originPlanet: BotPlanetSnapshot,
  desiredRecyclerCount: number
): RecycleCandidate | null {
  const availableRecyclers = originPlanet.ships.undamagedCountByType[ShipType.RECYCLER] ?? 0;
  if (availableRecyclers < desiredRecyclerCount) {
    return null;
  }

  const escortShipCount = target.scope === 'NEUTRAL_FOREIGN'
    ? Math.max(1, Math.ceil(desiredRecyclerCount / 10))
    : 0;
  const escortShipType = escortShipCount > 0
    ? resolveCheapestAvailableCombatShipType(originPlanet, escortShipCount)
    : null;
  if (escortShipCount > 0 && !escortShipType) {
    return null;
  }

  const travelDistance = calculateTravelDistance(originPlanet.coordinates, target.targetCoordinates);
  const travelTurns = resolveTravelTurns(originPlanet, travelDistance);
  const fuelCost = calculateFuelCost([
    { type: ShipType.RECYCLER, amount: desiredRecyclerCount },
    ...(escortShipType ? [{ type: escortShipType, amount: escortShipCount }] : [])
  ], travelDistance);
  if (originPlanet.localResources.deuterium < fuelCost) {
    return null;
  }

  const recyclerStrength = resolveRecyclerStrength();
  const recyclerCargoCapacity = resolveRecyclerCargoCapacity();
  const idleTurnsEstimate = Math.max(1, Math.ceil(
    getTotalResourceAmount(target.debris)
    / Math.max(1, desiredRecyclerCount * Math.min(recyclerStrength, recyclerCargoCapacity))
  ));
  const escortCostValue = escortShipType
    ? calculateWeightedValue(normalizeResources(SHIP_BLUEPRINTS.get(escortShipType)?.cost ?? {
      metal: 0,
      crystal: 0,
      deuterium: 0
    })) * escortShipCount
    : 0;
  const fuelValue = fuelCost * 2.6;
  const score = target.debrisValue
    + ((target.debrisValue / Math.max(1, target.thresholdValue)) * 400)
    - (travelTurns * 120)
    - (idleTurnsEstimate * 40)
    - (fuelValue * 0.5)
    - (escortCostValue * 0.25);

  return {
    ...target,
    originPlanet,
    desiredRecyclerCount,
    escortShipType,
    escortShipCount,
    travelDistance,
    travelTurns,
    fuelCost,
    idleTurnsEstimate,
    score
  };
}

function createRecycleFleetProposal(context: BotSubsystemContext, candidate: RecycleCandidate): BotProposal {
  const ships = [{
    type: ShipType.RECYCLER,
    undamagedAmount: candidate.desiredRecyclerCount,
    damagedAmount: 0
  }, ...(candidate.escortShipType
    ? [{
      type: candidate.escortShipType,
      undamagedAmount: candidate.escortShipCount,
      damagedAmount: 0
    }]
    : [])];
  const urgency = candidate.scope === 'OWN'
    ? 56
    : candidate.scope === 'SAFE_FOREIGN'
      ? 48
      : 42;
  const risk = candidate.scope === 'OWN'
    ? 4
    : candidate.scope === 'SAFE_FOREIGN'
      ? 12
      : 24;
  const confidence = candidate.scope === 'OWN'
    ? 92
    : candidate.scope === 'SAFE_FOREIGN'
      ? 80
      : 68;

  return {
    proposalId: `warfare:recycle:${candidate.originPlanet.coordinates.x}:${candidate.originPlanet.coordinates.y}:${candidate.originPlanet.coordinates.z}:${candidate.targetCoordinates.x}:${candidate.targetCoordinates.y}:${candidate.targetCoordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'WARFARE',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `warfare:recovery:recycle:${candidate.targetCoordinates.x}:${candidate.targetCoordinates.y}:${candidate.targetCoordinates.z}`,
    dedupeKey: `warfare:recycle:${candidate.originPlanet.coordinates.x}:${candidate.originPlanet.coordinates.y}:${candidate.originPlanet.coordinates.z}:${candidate.targetCoordinates.x}:${candidate.targetCoordinates.y}:${candidate.targetCoordinates.z}`,
    summary: candidate.scope === 'OWN'
      ? `Primary request: recycle own debris over ${candidate.targetName} from ${candidate.originPlanet.name}.`
      : candidate.scope === 'SAFE_FOREIGN'
        ? `Primary request: recycle safe debris over ${candidate.targetName} from ${candidate.originPlanet.name}.`
        : `Primary request: recycle neutral debris over ${candidate.targetName} with escort from ${candidate.originPlanet.name}.`,
    planetId: candidate.originPlanet.planetId,
    targetCoordinates: { ...candidate.targetCoordinates },
    expectedValue: Math.max(1, Math.round(candidate.score / 10)),
    urgency,
    risk,
    confidence,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      missionType: FleetMissionType.RECYCLE,
      origin: { ...candidate.originPlanet.coordinates },
      target: { ...candidate.targetCoordinates },
      ships,
      carriedBombs: [],
      cargo: { metal: 0, crystal: 0, deuterium: 0 },
      useJumpGate: false,
      bombardmentPriorities: null,
      targetStatus: candidate.targetStatus
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      goalFamily: 'RECOVERY',
      branch: 'RECOVERY',
      recycleScope: candidate.scope,
      targetOwnerId: candidate.targetOwnerId,
      targetStatus: candidate.targetStatus,
      debrisValue: Math.round(candidate.debrisValue),
      debrisThresholdValue: Math.round(candidate.thresholdValue),
      desiredRecyclerCount: candidate.desiredRecyclerCount,
      escortShipType: candidate.escortShipType,
      escortShipCount: candidate.escortShipCount,
      travelDistance: candidate.travelDistance,
      travelTurns: candidate.travelTurns,
      idleTurnsEstimate: candidate.idleTurnsEstimate,
      hostilityTargetPlayerId: candidate.scope === 'NEUTRAL_FOREIGN' ? candidate.targetOwnerId : null,
      hostilitySeverity: candidate.scope === 'NEUTRAL_FOREIGN' ? 1 : null
    }
  };
}

function createRecycleShipNeedProposal(context: BotSubsystemContext, target: RecycleTarget): BotProposal {
  return {
    proposalId: `warfare:recovery:ship-need:recycler:${target.targetCoordinates.x}:${target.targetCoordinates.y}:${target.targetCoordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'WARFARE',
    kind: 'SHIPYARD',
    status: 'PROPOSED',
    goalKey: `warfare:recovery:need:recycler:${target.targetCoordinates.x}:${target.targetCoordinates.y}:${target.targetCoordinates.z}`,
    dedupeKey: 'warfare:ship-need:recycler',
    summary: `Primary request: emergency recycler demand for recovery over ${target.targetName}.`,
    planetId: null,
    targetCoordinates: { ...target.targetCoordinates },
    expectedValue: Math.max(1, Math.round(target.debrisValue / 20)),
    urgency: 50,
    risk: 8,
    confidence: 84,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      x: 0,
      y: 0,
      z: 0,
      itemKind: 'ship',
      shipType: ShipType.RECYCLER,
      amount: 1,
      demandOnly: true
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      goalFamily: 'RECOVERY',
      branch: 'RECOVERY',
      queueType: 'SHIP_NEED',
      recycleScope: target.scope,
      debrisValue: Math.round(target.debrisValue),
      debrisThresholdValue: Math.round(target.thresholdValue)
    }
  };
}

function createRecycleShipyardProposal(
  context: BotSubsystemContext,
  shipyardPlanet: BotPlanetSnapshot,
  target: RecycleTarget,
  amount: number
): BotProposal {
  const blueprintCost = normalizeResources(SHIP_BLUEPRINTS.get(ShipType.RECYCLER)?.cost ?? {
    metal: 0,
    crystal: 0,
    deuterium: 0
  });
  const totalCost = multiplyResources(blueprintCost, amount);

  return {
    proposalId: `warfare:recovery:shipyard:recycler:${shipyardPlanet.coordinates.x}:${shipyardPlanet.coordinates.y}:${shipyardPlanet.coordinates.z}:${amount}:${context.snapshot.turn}`,
    subsystemId: 'WARFARE',
    kind: 'SHIPYARD',
    status: 'PROPOSED',
    goalKey: `warfare:recovery:produce:recycler:${shipyardPlanet.coordinates.x}:${shipyardPlanet.coordinates.y}:${shipyardPlanet.coordinates.z}`,
    dedupeKey: `warfare:shipyard:${shipyardPlanet.coordinates.x}:${shipyardPlanet.coordinates.y}:${shipyardPlanet.coordinates.z}:${ShipType.RECYCLER}`,
    summary: `Primary request: produce ${amount} ${ShipType.RECYCLER} for recovery over ${target.targetName} on ${shipyardPlanet.name}.`,
    planetId: shipyardPlanet.planetId,
    targetCoordinates: { ...shipyardPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(target.debrisValue / 25)),
    urgency: 44,
    risk: 10,
    confidence: 78,
    requestedResources: { ...totalCost },
    requestPayload: {
      x: shipyardPlanet.coordinates.x,
      y: shipyardPlanet.coordinates.y,
      z: shipyardPlanet.coordinates.z,
      itemKind: 'ship',
      shipType: ShipType.RECYCLER,
      amount
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      goalFamily: 'RECOVERY',
      branch: 'RECOVERY',
      recycleScope: target.scope,
      recycleShortageAmount: amount,
      debrisValue: Math.round(target.debrisValue),
      debrisThresholdValue: Math.round(target.thresholdValue)
    }
  };
}

function createRecycleRecoveryGoal(context: BotSubsystemContext, candidate: RecycleCandidate): BotWarfareGoal {
  return {
    goalKey: `warfare:recovery:recycle:${candidate.targetCoordinates.x}:${candidate.targetCoordinates.y}:${candidate.targetCoordinates.z}`,
    subsystemId: 'WARFARE',
    goalFamily: 'RECOVERY',
    branch: 'RECOVERY',
    planetId: candidate.originPlanet.planetId,
    targetCoordinates: { ...candidate.targetCoordinates },
    finalTargetKind: 'MISSION',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: ShipType.RECYCLER,
    finalLevel: null,
    finalAmount: candidate.desiredRecyclerCount,
    weightedEtc: candidate.travelTurns + candidate.idleTurnsEstimate,
    totalEtc: candidate.travelTurns + candidate.idleTurnsEstimate,
    buildingSideEtc: 0,
    researchSideEtc: 0,
    bonusFactor: 1,
    blockers: [],
    debug: {
      recoveryScope: candidate.scope,
      debrisValue: Math.round(candidate.debrisValue),
      targetOwnerId: candidate.targetOwnerId
    }
  };
}

function createRecyclerNeedGoal(
  context: BotSubsystemContext,
  target: RecycleTarget,
  amount: number
): BotWarfareGoal {
  return {
    goalKey: `warfare:recovery:recycler-need:${target.targetCoordinates.x}:${target.targetCoordinates.y}:${target.targetCoordinates.z}`,
    subsystemId: 'WARFARE',
    goalFamily: 'RECOVERY',
    branch: 'RECOVERY',
    planetId: null,
    targetCoordinates: { ...target.targetCoordinates },
    finalTargetKind: 'SHIP',
    finalBuildingType: null,
    finalTechnologyType: null,
    finalDefenceType: null,
    finalShipType: ShipType.RECYCLER,
    finalLevel: null,
    finalAmount: amount,
    weightedEtc: Number.MAX_SAFE_INTEGER,
    totalEtc: Number.MAX_SAFE_INTEGER,
    buildingSideEtc: 0,
    researchSideEtc: 0,
    bonusFactor: 1,
    blockers: [],
    debug: {
      recoveryScope: target.scope,
      debrisValue: Math.round(target.debrisValue),
      targetOwnerId: target.targetOwnerId
    }
  };
}

function resolveRecycleFleetCap(context: BotSubsystemContext): number {
  return Math.max(1, Math.floor(Math.max(1, context.snapshot.empire.maxActiveFleetCount) / 10));
}

function resolveAverageDevelopedIncomeValue(planets: BotPlanetSnapshot[]): number {
  const developedPlanets = planets.filter((planet) =>
    planet.maturityStage === 'DEVELOPED'
    || planet.maturityStage === 'MILITARY_CAPABLE'
    || planet.maturityStage === 'STRATEGIC_HUB'
  );
  const source = developedPlanets.length > 0 ? developedPlanets : planets;
  if (source.length <= 0) {
    return 1;
  }

  const total = source.reduce((sum, planet) =>
    sum + calculateWeightedValue(normalizeResources(planet.economy.income)), 0);
  return Math.max(1, total / source.length);
}

function resolveDesiredRecyclerCount(target: RecycleTarget): number {
  return Math.max(1, Math.ceil(getTotalResourceAmount(target.debris) / Math.max(1, resolveRecyclerCargoCapacity())));
}

function resolveBestRecyclerProductionPlanet(planets: BotPlanetSnapshot[]): BotPlanetSnapshot | null {
  return [...planets]
    .sort((left, right) =>
      right.power.shipyardPower - left.power.shipyardPower
      || right.economy.shipyardLevel - left.economy.shipyardLevel
      || right.localResources.metal - left.localResources.metal
    )[0] ?? null;
}

function resolveCheapestAvailableCombatShipType(originPlanet: BotPlanetSnapshot, requiredAmount: number): ShipType | null {
  return [...COMBAT_SHIP_TYPES]
    .filter((shipType) =>
      (originPlanet.ships.undamagedCountByType[shipType] ?? 0) >= requiredAmount
      && (SHIP_BLUEPRINTS.get(shipType)?.canJump ?? false)
    )
    .sort((left, right) =>
      calculateWeightedValue(normalizeResources(SHIP_BLUEPRINTS.get(left)?.cost ?? {
        metal: 0,
        crystal: 0,
        deuterium: 0
      }))
      - calculateWeightedValue(normalizeResources(SHIP_BLUEPRINTS.get(right)?.cost ?? {
        metal: 0,
        crystal: 0,
        deuterium: 0
      }))
    )[0] ?? null;
}

function calculateWeightedValue(resources: ResourceAmounts): number {
  return resources.metal + (resources.crystal * 1.8) + (resources.deuterium * 2.6);
}

function formatCoordinatesLabel(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function calculateTravelDistance(
  origin: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number }
): number {
  return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
}

function resolveRecyclerCargoCapacity(): number {
  return Math.max(1, SHIP_BLUEPRINTS.get(ShipType.RECYCLER)?.cargoCapacity ?? 0);
}

function resolveRecyclerStrength(): number {
  const recycler = SHIP_BLUEPRINTS.get(ShipType.RECYCLER);
  if (!recycler) {
    return 1;
  }

  return Math.max(1, recycler.weapons.reduce((sum, weapon) => sum + Math.max(0, weapon.dmg * weapon.shots), 0));
}

function resolveTravelTurns(originPlanet: BotPlanetSnapshot, distance: number): number {
  return fleetTravelTurnsForDistance(
    distance,
    originPlanet.tech.fusionDriveLevel,
    originPlanet.tech.hyperspaceDriveLevel,
    0
  );
}

function evaluateCapacityGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  buildingType: BuildingType.SHIPYARD | BuildingType.NANITE_FACTORY,
  desiredLevel: number
): WarfareGoalEvaluation | null {
  const currentLevel = getBuildingLevel(planet, buildingType);
  if (desiredLevel <= currentLevel) {
    return null;
  }

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
    return createBlockedGoal(planet, 'CAPACITY', currentLevel + 1, blockers, {
      finalTargetKind: 'BUILDING',
      finalBuildingType: buildingType,
      finalTechnologyType: null,
      finalShipType: null,
      finalLevel: desiredLevel,
      finalAmount: null,
      branch: 'CAPACITY'
    });
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels, buildingSteps);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, 'CAPACITY', currentLevel + 1, researchBlockers, {
      finalTargetKind: 'BUILDING',
      finalBuildingType: buildingType,
      finalTechnologyType: null,
      finalShipType: null,
      finalLevel: desiredLevel,
      finalAmount: null,
      branch: 'CAPACITY'
    });
  }

  const initialState = createSimulationState(planet);
  const buildingSideEtc = estimateBuildingChainEtc(planet, initialState, buildingSteps);
  const researchSideEtc = estimateResearchChainEtc(planet, initialState, researchSteps);
  const totalEtc = Math.max(buildingSideEtc, researchSideEtc);
  const immediateRequest = selectImmediateStructuralRequest(planet, buildingSteps, buildingSideEtc, researchSteps, researchSideEtc);
  if (!immediateRequest || !Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, 'CAPACITY', currentLevel + 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'BUILDING',
      finalBuildingType: buildingType,
      finalTechnologyType: null,
      finalShipType: null,
      finalLevel: desiredLevel,
      finalAmount: null,
      branch: 'CAPACITY'
    });
  }

  const bonusFactor = resolveCapacityBonusFactor(planet, buildingType, desiredLevel);
  let weightedEtc = totalEtc / bonusFactor;
  if (buildingType === BuildingType.NANITE_FACTORY) {
    weightedEtc *= NANITE_WEIGHTED_ETC_PENALTY;
  }

  return {
    goalKey: `warfare:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:capacity:${buildingType}:${desiredLevel}`,
    subsystemId: 'WARFARE',
    goalFamily: 'CAPACITY',
    branch: 'CAPACITY',
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
      currentLevel,
      desiredLevel,
      goalFamily: 'CAPACITY',
      nanitePenaltyApplied: buildingType === BuildingType.NANITE_FACTORY,
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateUnlockGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: ShipType
): WarfareGoalEvaluation | null {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return null;
  }

  const dependencyState = createSimulationState(planet);
  const requiredTechLevels = new Map<TechnologyType, number>();
  const buildingSteps: BuildingStep[] = [];
  const blockers: string[] = [];

  for (const requirement of blueprint.buildingRequirements) {
    if (!ALLOWED_WARFARE_BUILDING_SCOPE.has(requirement.building)) {
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
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1,
      branch: 'UNLOCK'
    });
  }

  const researchSteps = resolveResearchSteps(planet, requiredTechLevels, buildingSteps);
  const researchBlockers = researchSteps.flatMap((step) => step.blockers);
  if (researchBlockers.length > 0) {
    return createBlockedGoal(planet, 'UNLOCK', 1, researchBlockers, {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1,
      branch: 'UNLOCK'
    });
  }

  const initialState = createSimulationState(planet);
  const buildingSideEtc = estimateBuildingChainEtc(planet, initialState, buildingSteps);
  const researchSideEtc = estimateResearchChainEtc(planet, initialState, researchSteps);
  const totalEtc = Math.max(buildingSideEtc, researchSideEtc);
  const immediateRequest = selectImmediateStructuralRequest(planet, buildingSteps, buildingSideEtc, researchSteps, researchSideEtc);
  if (!immediateRequest || !Number.isFinite(totalEtc) || totalEtc <= 0) {
    return createBlockedGoal(planet, 'UNLOCK', 1, ['NO_ACTIONABLE_REQUEST'], {
      finalTargetKind: 'SHIP',
      finalBuildingType: null,
      finalTechnologyType: null,
      finalShipType: shipType,
      finalLevel: null,
      finalAmount: 1,
      branch: 'UNLOCK'
    });
  }

  const bonusFactor = 1;
  const weightedEtc = totalEtc / bonusFactor;

  return {
    goalKey: `warfare:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:unlock:${shipType}`,
    subsystemId: 'WARFARE',
    goalFamily: 'UNLOCK',
    branch: 'UNLOCK',
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
      avgIndustryLevel: roundToTwoDecimals(planet.defense.avgIndustryLevel),
      goalFamily: 'UNLOCK',
      shipyardRequirement: resolveShipyardUnlockThreshold(shipType),
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function evaluateProductionGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: ShipType
): WarfareGoalEvaluation | null {
  if (isImmaturePlanet(planet)) {
    return null;
  }
  if (!canProduceShipNow(planet, shipType)) {
    return null;
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
      finalAmount: 1,
      branch: 'PRODUCTION'
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
      finalAmount: immediateRequest.amount,
      branch: 'PRODUCTION'
    });
  }

  const bonusFactor = resolveProductionBonusFactor(planet, shipType);
  const smallShipPenaltyMultiplier = resolveSmallShipPenaltyMultiplier(context, planet, shipType);
  const transporterPenaltyMultiplier = resolveTransporterPenaltyMultiplier(context, planet, shipType);
  const repairDronePenaltyMultiplier = resolveRepairDronePenaltyMultiplier(planet, shipType);
  const weightedEtc = (totalEtc / bonusFactor)
    * smallShipPenaltyMultiplier
    * transporterPenaltyMultiplier
    * repairDronePenaltyMultiplier;

  return {
    goalKey: `warfare:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:produce:${shipType}:${immediateRequest.amount}`,
    subsystemId: 'WARFARE',
    goalFamily: 'PRODUCTION',
    branch: 'PRODUCTION',
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
      isCargoShip: isCargoShipType(shipType),
      orderAmount: immediateRequest.amount,
      queueRemainingEtc: planet.power.shipyardQueueRemainingEtc,
      smallShipPenaltyMultiplier: roundToTwoDecimals(smallShipPenaltyMultiplier),
      transporterPenaltyMultiplier: roundToTwoDecimals(transporterPenaltyMultiplier),
      repairDronePenaltyMultiplier: roundToTwoDecimals(repairDronePenaltyMultiplier),
      smallShipTargetCapacity: resolveLocalSmallShipTargetCapacity(context, planet),
      localSmallShipRequiredCapacity: resolveLocalSmallShipRequiredCapacity(planet),
      localCarrierHangarCapacity: resolveLocalCarrierHangarCapacity(planet),
      transporterCap: resolveTransporterCap(context, planet),
      repairDroneCap: resolveRepairDroneCap(planet),
      totalEtc: roundToTwoDecimals(totalEtc),
      weightedEtc: roundToTwoDecimals(weightedEtc)
    }
  };
}

function resolveSelectedGoals(
  planet: BotPlanetSnapshot,
  structuralGoals: WarfareGoalEvaluation[],
  productionGoals: WarfareGoalEvaluation[]
): {
  branch: BotWarfareBranch;
  selectedGoals: WarfareGoalEvaluation[];
} {
  const actionableStructuralGoals = structuralGoals.filter(isActionableGoal);
  const actionableProductionGoals = productionGoals.filter(isActionableGoal);
  const selectedGoals: WarfareGoalEvaluation[] = [];
  const selectedRequestKeys = new Set<string>();
  const selectedShipTypes = new Set<ShipType>();

  const bestStructural = actionableStructuralGoals[0] ?? null;
  const bestProduction = actionableProductionGoals[0] ?? null;
  const allowStructural = bestStructural !== null
    && (
      bestProduction === null
      || bestStructural.weightedEtc <= (bestProduction.weightedEtc * STRUCTURAL_VISIBILITY_THRESHOLD)
    );
  const initialStructuralLimit = allowStructural
    ? Math.min(2, actionableStructuralGoals.length)
    : 0;

  pushUniqueGoals(planet, actionableStructuralGoals, selectedGoals, selectedRequestKeys, selectedShipTypes, initialStructuralLimit);

  const cargoProductionGoals = actionableProductionGoals.filter((goal) => isCargoShipType(goal.finalShipType));
  if (cargoProductionGoals.length > 0) {
    pushUniqueGoals(planet, cargoProductionGoals, selectedGoals, selectedRequestKeys, selectedShipTypes, 1);
  }

  const nonCargoProductionGoals = actionableProductionGoals.filter((goal) => !isCargoShipType(goal.finalShipType));
  pushUniqueGoals(
    planet,
    nonCargoProductionGoals,
    selectedGoals,
    selectedRequestKeys,
    selectedShipTypes,
    Math.max(0, MAX_VISIBLE_GOALS - selectedGoals.length)
  );

  pushUniqueGoals(
    planet,
    cargoProductionGoals,
    selectedGoals,
    selectedRequestKeys,
    selectedShipTypes,
    Math.max(0, MAX_VISIBLE_GOALS - selectedGoals.length)
  );

  pushUniqueGoals(
    planet,
    actionableStructuralGoals.slice(initialStructuralLimit),
    selectedGoals,
    selectedRequestKeys,
    selectedShipTypes,
    Math.max(0, MAX_VISIBLE_GOALS - selectedGoals.length)
  );

  const branch = selectedGoals[0]?.branch ?? resolveFallbackBranch(actionableStructuralGoals, actionableProductionGoals);
  return {
    branch,
    selectedGoals
  };
}

function pushUniqueGoals(
  planet: BotPlanetSnapshot,
  candidates: WarfareGoalEvaluation[],
  selectedGoals: WarfareGoalEvaluation[],
  selectedRequestKeys: Set<string>,
  selectedShipTypes: Set<ShipType>,
  limit: number
): void {
  if (limit <= 0) {
    return;
  }

  for (const candidate of candidates) {
    if (selectedGoals.length >= MAX_VISIBLE_GOALS || limit <= 0) {
      break;
    }
    if (!candidate.immediateRequest) {
      continue;
    }
    if (candidate.finalShipType && candidate.goalFamily === 'PRODUCTION' && selectedShipTypes.has(candidate.finalShipType)) {
      continue;
    }

    const requestKey = resolveRequestKey(planet, candidate.immediateRequest);
    if (selectedRequestKeys.has(requestKey)) {
      continue;
    }

    selectedGoals.push(candidate);
    selectedRequestKeys.add(requestKey);
    if (candidate.finalShipType && candidate.goalFamily === 'PRODUCTION') {
      selectedShipTypes.add(candidate.finalShipType);
    }
    limit -= 1;
  }
}

function resolveFallbackBranch(
  structuralGoals: WarfareGoalEvaluation[],
  productionGoals: WarfareGoalEvaluation[]
): BotWarfareBranch {
  if (structuralGoals.length <= 0) {
    return 'PRODUCTION';
  }
  if (productionGoals.length <= 0) {
    return structuralGoals[0]?.branch ?? 'CAPACITY';
  }
  return structuralGoals[0]?.weightedEtc <= productionGoals[0]?.weightedEtc
    ? structuralGoals[0].branch
    : 'PRODUCTION';
}

function isShipUnlockBandOpen(planet: BotPlanetSnapshot, shipType: ShipType): boolean {
  return planet.defense.avgIndustryLevel >= resolveShipyardUnlockThreshold(shipType);
}

function isShipUnlocked(planet: BotPlanetSnapshot, shipType: ShipType): boolean {
  const installedCount = planet.ships.installedCountByType[shipType] ?? 0;
  if (installedCount > 0 || planet.queues.queuedShipTypes.includes(shipType)) {
    return true;
  }

  if (!isShipUnlockBandOpen(planet, shipType)) {
    return false;
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

function canProduceShipNow(planet: BotPlanetSnapshot, shipType: ShipType): boolean {
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

function resolveTargetShipyardLevel(planet: BotPlanetSnapshot): number {
  return Math.max(0, Math.round(planet.defense.avgIndustryLevel));
}

function resolveTargetNaniteLevel(planet: BotPlanetSnapshot): number {
  return Math.max(0, Math.floor(resolveTargetShipyardLevel(planet) / 2));
}

function resolveShipyardUnlockThreshold(shipType: ShipType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return Number.MAX_SAFE_INTEGER;
  }

  const shipyardRequirement = blueprint.buildingRequirements.find((requirement) => requirement.building === BuildingType.SHIPYARD);
  return shipyardRequirement ? Math.ceil(shipyardRequirement.level) : Number.MAX_SAFE_INTEGER;
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
      if (!ALLOWED_WARFARE_BUILDING_SCOPE.has(requirement.building)) {
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
    if (!ALLOWED_WARFARE_BUILDING_SCOPE.has(requirement.building)) {
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

function resolveCapacityBonusFactor(
  planet: BotPlanetSnapshot,
  buildingType: BuildingType.SHIPYARD | BuildingType.NANITE_FACTORY,
  desiredLevel: number
): number {
  const currentLevel = getBuildingLevel(planet, buildingType);
  const gap = Math.max(0, desiredLevel - currentLevel);
  const gapBonus = buildingType === BuildingType.SHIPYARD
    ? gap * 0.15
    : gap * 0.1;
  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, 1 + gapBonus));
}

function resolveProductionBonusFactor(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  let bonusFactor = 1;
  bonusFactor *= 1 + resolveDistributionBonusRatio(planet, shipType);
  return Math.min(BONUS_FACTOR_CEILING, Math.max(1, bonusFactor));
}

function resolveSmallShipPenaltyMultiplier(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  if (!isSmallSupportShipType(shipType)) {
    return 1;
  }

  const localSmallShipRequiredCapacity = resolveLocalSmallShipRequiredCapacity(planet);
  const localCarrierHangarCapacity = resolveLocalCarrierHangarCapacity(planet);
  if (localCarrierHangarCapacity > localSmallShipRequiredCapacity) {
    return 1;
  }

  const targetCapacity = resolveLocalSmallShipTargetCapacity(context, planet);
  if (localSmallShipRequiredCapacity <= targetCapacity) {
    return 1;
  }

  if (isMaturingPlanet(planet)) {
    return Number.MAX_SAFE_INTEGER;
  }

  const normalizedTarget = Math.max(1, targetCapacity);
  const overageRatio = localSmallShipRequiredCapacity / normalizedTarget;
  return 1 + Math.min(5, overageRatio * 2.5);
}

function resolveLocalSmallShipTargetCapacity(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): number {
  if (isImmaturePlanet(planet)) {
    return 0;
  }

  const ownedPlanetCount = Math.max(1, context.snapshot.empire.ownedPlanetCount);
  return Math.floor(resolveLocalCarrierHangarCapacity(planet) / (ownedPlanetCount + 1));
}

function resolveLocalSmallShipRequiredCapacity(planet: BotPlanetSnapshot): number {
  let total = 0;

  for (const shipType of SMALL_SUPPORT_SHIP_TYPES) {
    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint) {
      continue;
    }

    total += blueprint.size * (planet.ships.installedCountByType[shipType] ?? 0);
  }

  return total;
}

function isSmallSupportShipType(shipType: ShipType): boolean {
  return (SMALL_SUPPORT_SHIP_TYPES as readonly ShipType[]).includes(shipType);
}

function resolveLocalCarrierHangarCapacity(planet: BotPlanetSnapshot): number {
  let total = 0;

  for (const shipType of INCLUDED_WARFARE_SHIP_TYPES) {
    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint || blueprint.hangarCapacity <= 0) {
      continue;
    }

    total += blueprint.hangarCapacity * (planet.ships.installedCountByType[shipType] ?? 0);
  }

  return total;
}

function resolveTransporterPenaltyMultiplier(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  if (shipType !== ShipType.TRANSPORTER) {
    return 1;
  }

  const cap = resolveTransporterCap(context, planet);
  const installed = planet.ships.installedCountByType[ShipType.TRANSPORTER] ?? 0;
  if (installed <= cap) {
    return 1;
  }

  const overageRatio = installed / Math.max(1, cap);
  return 1 + Math.min(6, overageRatio * 2.5);
}

function resolveRepairDronePenaltyMultiplier(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  if (shipType !== ShipType.REPAIR_DRONE) {
    return 1;
  }

  const cap = resolveRepairDroneCap(planet);
  const installed = planet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0;
  if (installed <= cap) {
    return 1;
  }

  const overageRatio = installed / Math.max(1, cap);
  return 1 + Math.min(6, overageRatio * 2.5);
}

function resolveTransporterCap(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): number {
  const blueprint = SHIP_BLUEPRINTS.get(ShipType.TRANSPORTER);
  const cargoCapacity = Math.max(1, blueprint?.cargoCapacity ?? 1);
  const tenTurnIncomeCargo = (
    (planet.economy.income.metal + planet.economy.income.crystal + planet.economy.income.deuterium)
    * 10
  );
  return Math.max(
    1,
    Math.ceil(tenTurnIncomeCargo / cargoCapacity) + (Math.max(1, context.snapshot.empire.ownedPlanetCount) * 5)
  );
}

function resolveRepairDroneCap(planet: BotPlanetSnapshot): number {
  return Math.max(1, Math.floor(planet.power.industryPower / 2));
}

function isImmaturePlanet(planet: BotPlanetSnapshot): boolean {
  return planet.maturityStage === 'BOOTSTRAP' || planet.maturityStage === 'STABILIZING';
}

function isMaturingPlanet(planet: BotPlanetSnapshot): boolean {
  return planet.maturityStage === 'DEVELOPED';
}

function resolveDistributionBonusRatio(
  planet: BotPlanetSnapshot,
  shipType: ShipType
): number {
  const unlockedTypes = INCLUDED_WARFARE_SHIP_TYPES.filter((type) => isShipUnlocked(planet, type));
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

function createPlanetProposals(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goals: WarfareGoalEvaluation[]
): BotProposal[] {
  const proposals: BotProposal[] = [];

  for (const [index, goal] of goals.entries()) {
    const request = goal.immediateRequest;
    if (!request) {
      continue;
    }

    proposals.push(createProposalFromGoal(context, planet, goal, index));
  }

  return proposals;
}

function createProposalFromGoal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  goal: WarfareGoalEvaluation,
  selectedIndex: number
): BotProposal {
  const request = goal.immediateRequest;
  if (!request) {
    throw new Error(`Warfare goal ${goal.goalKey} has no immediate request.`);
  }

  const requestLabel = resolveRankLabel(selectedIndex, 'request');
  const goalLabel = resolveRankLabel(selectedIndex, 'goal');
  const summary = request.kind === 'BUILDING'
    ? `${requestLabel}: queue ${request.buildingType} for ${goalLabel} ${resolveGoalTargetLabel(goal)} on ${planet.name}.`
    : request.kind === 'RESEARCH'
      ? `${requestLabel}: research ${request.technologyType} for ${goalLabel} ${resolveGoalTargetLabel(goal)} on ${planet.name}.`
      : `${requestLabel}: produce ${request.amount} ${request.shipType} for ${goalLabel} on ${planet.name}.`;
  const urgency = goal.goalFamily === 'CAPACITY'
    ? 74
    : goal.goalFamily === 'UNLOCK'
      ? 70
      : 66;

  return {
    proposalId: `${goal.goalKey}:${selectedIndex}:${context.snapshot.turn}`,
    subsystemId: 'WARFARE',
    kind: goal.selectedRequestKind,
    status: 'PROPOSED',
    goalKey: goal.goalKey,
    dedupeKey: resolveDedupeKey(planet, request),
    summary,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    expectedValue: Math.max(1, Math.round((1000 / Math.max(1, goal.weightedEtc)) * 100)),
    urgency,
    risk: 10,
    confidence: 74,
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
      goalRole: goalLabel,
      immediateRequestKind: request.kind,
      immediateRequestTarget: request.kind === 'BUILDING'
        ? request.buildingType
        : request.kind === 'RESEARCH'
          ? request.technologyType
          : request.shipType,
      immediateRequestAmount: request.kind === 'SHIPYARD' ? request.amount : null,
      primaryGoalKey: goal.goalKey,
      secondaryGoalKey: selectedIndex === 1 ? goal.goalKey : null,
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
    return `warfare:building:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.buildingType}`;
  }
  if (request.kind === 'RESEARCH') {
    return `warfare:research:${request.technologyType}`;
  }

  return `warfare:shipyard:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${request.shipType}`;
}

function resolvePlanetNoActionReason(
  planet: BotPlanetSnapshot,
  structuralGoals: WarfareGoalEvaluation[],
  productionGoals: WarfareGoalEvaluation[],
  branch: BotWarfareBranch
): string {
  const allGoals = [...structuralGoals, ...productionGoals];
  if (allGoals.length <= 0) {
    return 'NO_CANDIDATE_GOALS';
  }

  if (allGoals.every((goal) => goal.blockers.length > 0)) {
    return allGoals[0]?.blockers[0] ?? 'ALL_GOALS_BLOCKED';
  }

  if (branch !== 'PRODUCTION' && planet.queues.buildingQueueLength >= planet.power.maxBuildingQueueLength && planet.queues.hasActiveResearch) {
    return 'STRUCTURAL_QUEUES_BLOCKED';
  }
  if (branch === 'PRODUCTION' && planet.queues.shipyardQueueLength >= planet.power.maxShipyardQueueLength) {
    return 'SHIPYARD_QUEUE_SATURATED';
  }

  return 'NO_ACTIONABLE_REQUEST';
}

function createBlockedGoal(
  planet: BotPlanetSnapshot,
  goalFamily: 'CAPACITY' | 'UNLOCK' | 'PRODUCTION',
  fallbackAmount: number,
  blockers: string[],
  finalTarget: {
    finalTargetKind: 'BUILDING' | 'SHIP';
    finalBuildingType: BuildingType | null;
    finalTechnologyType: TechnologyType | null;
    finalShipType: ShipType | null;
    finalLevel: number | null;
    finalAmount: number | null;
    branch: BotWarfareBranch;
  }
): WarfareGoalEvaluation {
  return {
    goalKey: `warfare:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${goalFamily}:${finalTarget.finalBuildingType ?? finalTarget.finalShipType ?? fallbackAmount}`,
    subsystemId: 'WARFARE',
    goalFamily,
    branch: finalTarget.branch,
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

function stripImmediateRequest(goal: WarfareGoalEvaluation): BotWarfareGoal {
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

function isActionableGoal(goal: WarfareGoalEvaluation): boolean {
  return goal.immediateRequest !== null && goal.blockers.length === 0;
}

function compareGoals(left: WarfareGoalEvaluation | BotWarfareGoal, right: WarfareGoalEvaluation | BotWarfareGoal): number {
  return left.weightedEtc - right.weightedEtc
    || left.totalEtc - right.totalEtc
    || resolveGoalTargetLabel(left).localeCompare(resolveGoalTargetLabel(right));
}

function resolveGoalTargetLabel(
  goal: Pick<
    BotWarfareGoal,
    'goalFamily' | 'finalBuildingType' | 'finalTechnologyType' | 'finalShipType' | 'finalAmount'
  >
): string {
  if (goal.goalFamily === 'CAPACITY') {
    return goal.finalBuildingType ?? 'capacity';
  }
  if (goal.goalFamily === 'UNLOCK') {
    return goal.finalShipType ? `unlock ${goal.finalShipType}` : 'unlock';
  }
  return goal.finalShipType
    ? `${goal.finalAmount ?? 1} ${goal.finalShipType}`
    : 'ship production';
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
      [BuildingType.NANITE_FACTORY, planet.economy.naniteLevel]
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

function isCargoShipType(shipType: ShipType | null): shipType is typeof CARGO_SHIP_TYPES[number] {
  return shipType !== null && (CARGO_SHIP_TYPES as readonly ShipType[]).includes(shipType);
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

function resolveRankLabel(index: number, noun: 'goal' | 'request'): string {
  const labels = ['Primary', 'Secondary', 'Tertiary', 'Quaternary', 'Quinary'];
  const prefix = labels[index] ?? `#${index + 1}`;
  return `${prefix} ${noun}`;
}
