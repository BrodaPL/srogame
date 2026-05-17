import type { Technology } from '../../../../../src/app/models/tech/technology.ts';
import type { TechnologyType } from '../../../../../src/app/models/enums/technology-type.ts';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  TECHNOLOGY_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import { calculateWeightedResourceValue } from '../../supervisor/bot-supervisor-scoring.js';

type ResourceAmounts = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type ResearchCandidate = {
  technology: Technology;
  nextLevel: number;
  mainPlanet: BotPlanetSnapshot;
  helperPlanets: BotPlanetSnapshot[];
  affordabilityEta: number;
  estimatedResearchEtc: number;
  weightedCost: number;
  resourceMatchScore: number;
  adaptiveColonizationBias: number;
};

const MIN_AFFORDABILITY_WINDOW_TURNS = 5;
const ADAPTIVE_COLONIZATION_PRIORITY_BONUS = 1;

export class BotResearchSubsystem implements BotSubsystem {
  public readonly subsystemId = 'RESEARCH' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const planetsWithLabs = context.snapshot.planets
      .filter((planet) => planet.economy.researchLabLevel > 0);
    const availableMainLabs = planetsWithLabs
      .filter((planet) => isAvailableMainLab(planet));
    const activeResearchTypes = new Set(
      context.snapshot.planets
        .map((planet) => planet.queues.currentResearchType)
        .filter((technologyType): technologyType is TechnologyType => technologyType !== null)
    );
    const maxLabsPerTechnology = resolveMaxLabsPerTechnology(context.snapshot);
    let affordabilityWindowTurns = Math.max(
      MIN_AFFORDABILITY_WINDOW_TURNS,
      context.memory.research.affordabilityWindowTurns
    );
    let widenedThisTurn = false;

    let evaluation = evaluateBestResearchCandidate({
      snapshot: context.snapshot,
      planetsWithLabs,
      availableMainLabs,
      activeResearchTypes,
      affordabilityWindowTurns,
      maxLabsPerTechnology,
      adaptiveColonizationPressure: resolveAdaptiveColonizationPressure(context.priorProposals ?? [])
    });

    if (
      !evaluation.bestCandidate
      && context.memory.research.lastWindowIncreaseTurn !== context.snapshot.turn
    ) {
      affordabilityWindowTurns += 1;
      context.memory.research.affordabilityWindowTurns = affordabilityWindowTurns;
      context.memory.research.lastWindowIncreaseTurn = context.snapshot.turn;
      widenedThisTurn = true;
      evaluation = evaluateBestResearchCandidate({
        snapshot: context.snapshot,
        planetsWithLabs,
        availableMainLabs,
        activeResearchTypes,
        affordabilityWindowTurns,
        maxLabsPerTechnology,
        adaptiveColonizationPressure: resolveAdaptiveColonizationPressure(context.priorProposals ?? [])
      });
    }

    if (!widenedThisTurn) {
      context.memory.research.affordabilityWindowTurns = affordabilityWindowTurns;
    }

    const proposal = evaluation.bestCandidate
      ? createResearchProposal(context, evaluation.bestCandidate, affordabilityWindowTurns, widenedThisTurn)
      : null;

    // TODO: future phase can reevaluate and reassign helper labs for already running researches.
    return {
      subsystemId: this.subsystemId,
      proposals: proposal ? [proposal] : [],
      debug: {
        affordabilityWindowTurns,
        widenedThisTurn,
        planetsWithLabs: planetsWithLabs.length,
        availableMainLabs: availableMainLabs.length,
        helperEligibleLabs: planetsWithLabs.filter((planet) => isHelperEligible(planet)).length,
        activeResearchCount: activeResearchTypes.size,
        availableTechnologyCount: evaluation.availableTechnologyCount,
        blockedByBuildingRequirementsCount: evaluation.blockedByBuildingRequirementsCount,
        blockedByTechRequirementsCount: evaluation.blockedByTechRequirementsCount,
        candidatePairCount: evaluation.candidatePairCount,
        adaptiveColonizationPressureActive: evaluation.adaptiveColonizationPressure.active,
        adaptiveColonizationBlockedCandidateCount: evaluation.adaptiveColonizationPressure.blockedCandidateCount,
        selectedTechnologyType: evaluation.bestCandidate?.technology.type ?? null,
        selectedMainPlanet: evaluation.bestCandidate
          ? toCoordinatesKey(evaluation.bestCandidate.mainPlanet.coordinates)
          : null
      }
    };
  }
}

function evaluateBestResearchCandidate(input: {
  snapshot: BotSubsystemContext['snapshot'];
  planetsWithLabs: BotPlanetSnapshot[];
  availableMainLabs: BotPlanetSnapshot[];
  activeResearchTypes: Set<TechnologyType>;
  affordabilityWindowTurns: number;
  maxLabsPerTechnology: number;
  adaptiveColonizationPressure: {
    active: boolean;
    blockedCandidateCount: number;
  };
}): {
  bestCandidate: ResearchCandidate | null;
  availableTechnologyCount: number;
  blockedByBuildingRequirementsCount: number;
  blockedByTechRequirementsCount: number;
  candidatePairCount: number;
  adaptiveColonizationPressure: {
    active: boolean;
    blockedCandidateCount: number;
  };
} {
  let bestCandidate: ResearchCandidate | null = null;
  let availableTechnologyCount = 0;
  let blockedByBuildingRequirementsCount = 0;
  let blockedByTechRequirementsCount = 0;
  let candidatePairCount = 0;

  for (const technology of input.snapshot.planets.length > 0
    ? inputTechnologies()
    : []) {
    if (input.activeResearchTypes.has(technology.type)) {
      continue;
    }

    const nextLevel = resolveTechnologyLevel(input.snapshot.planets[0]!, technology.type) + 1;
    if (!hasResearchTechnologyRequirementsFromSnapshot(input.snapshot, technology, nextLevel)) {
      blockedByTechRequirementsCount += 1;
      continue;
    }

    const mainCandidates = input.availableMainLabs
      .filter((planet) => hasResearchBuildingRequirementsFromSnapshot(planet, technology, nextLevel));

    if (mainCandidates.length <= 0) {
      blockedByBuildingRequirementsCount += 1;
      continue;
    }
    availableTechnologyCount += 1;

    for (const mainPlanet of mainCandidates) {
      const cost = normalizeResources(technology.getCostForLevel(nextLevel));
      const affordabilityEta = estimateAffordabilityEta(mainPlanet, cost);
      if (affordabilityEta > input.affordabilityWindowTurns) {
        continue;
      }

      const helperPlanets = selectHelperPlanets(
        input.planetsWithLabs,
        mainPlanet,
        cost,
        input.affordabilityWindowTurns,
        Math.max(0, input.maxLabsPerTechnology - 1)
      );
      const totalResearchPower = mainPlanet.power.researchPower
        + helperPlanets.reduce((sum, planet) => sum + planet.power.researchPower, 0);
      if (totalResearchPower <= 0) {
        continue;
      }

      const candidate: ResearchCandidate = {
        technology,
        nextLevel,
        mainPlanet,
        helperPlanets,
        affordabilityEta,
        estimatedResearchEtc: Math.max(1, Math.ceil(getTotalResourceAmount(cost) / totalResearchPower)),
        weightedCost: calculateWeightedResourceValue(cost),
        resourceMatchScore: resolveResourceMatchScore(mainPlanet, cost),
        adaptiveColonizationBias: resolveAdaptiveColonizationBiasForTechnology(
          technology.type,
          input.adaptiveColonizationPressure
        )
      };
      candidatePairCount += 1;

      if (!bestCandidate || compareCandidates(candidate, bestCandidate) < 0) {
        bestCandidate = candidate;
      }
    }
  }

  return {
    bestCandidate,
    availableTechnologyCount,
    blockedByBuildingRequirementsCount,
    blockedByTechRequirementsCount,
    candidatePairCount,
    adaptiveColonizationPressure: input.adaptiveColonizationPressure
  };
}

function createResearchProposal(
  context: BotSubsystemContext,
  candidate: ResearchCandidate,
  affordabilityWindowTurns: number,
  widenedThisTurn: boolean
): BotProposal {
  const cost = normalizeResources(candidate.technology.getCostForLevel(candidate.nextLevel));
  const helperPlanets = candidate.helperPlanets.map((planet) => ({ ...planet.coordinates }));

  return {
    proposalId: `research:${candidate.technology.type}:${candidate.nextLevel}:${context.snapshot.turn}`,
    subsystemId: 'RESEARCH',
    kind: 'RESEARCH',
    status: 'PROPOSED',
    goalKey: `research:${candidate.technology.type}:${candidate.nextLevel}`,
    dedupeKey: `research:technology:${candidate.technology.type}`,
    summary: `Research ${candidate.technology.type} on ${candidate.mainPlanet.name}.`,
    planetId: candidate.mainPlanet.planetId,
    targetCoordinates: { ...candidate.mainPlanet.coordinates },
    expectedValue: Math.max(1, Math.round((1200 / Math.max(1, candidate.estimatedResearchEtc)) * 100)),
    urgency: 58,
    risk: 6,
    confidence: 82,
    requestedResources: cost,
    requestPayload: {
      x: candidate.mainPlanet.coordinates.x,
      y: candidate.mainPlanet.coordinates.y,
      z: candidate.mainPlanet.coordinates.z,
      technologyType: candidate.technology.type,
      helperPlanets
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      affordabilityWindowTurns,
      widenedThisTurn,
      technologyType: candidate.technology.type,
      nextLevel: candidate.nextLevel,
      affordabilityEta: candidate.affordabilityEta,
      estimatedResearchEtc: candidate.estimatedResearchEtc,
      weightedCost: roundToTwoDecimals(candidate.weightedCost),
      resourceMatchScore: roundToTwoDecimals(candidate.resourceMatchScore),
      adaptiveColonizationBias: candidate.adaptiveColonizationBias,
      helperCount: helperPlanets.length,
      helperPlanets: helperPlanets.map(toCoordinatesKey).join(',') || 'none'
    }
  };
}

function resolveAdaptiveColonizationPressure(priorProposals: BotProposal[]): {
  active: boolean;
  blockedCandidateCount: number;
} {
  let blockedCandidateCount = 0;

  for (const proposal of priorProposals) {
    if (proposal.subsystemId !== 'STRATEGIC_DEVELOPMENT') {
      continue;
    }
    if (proposal.debug.adaptiveColonizationPressureActive !== true) {
      continue;
    }

    blockedCandidateCount = Math.max(
      blockedCandidateCount,
      Number(proposal.debug.adaptiveColonizationBlockedCandidateCount ?? 0)
    );
  }

  return {
    active: blockedCandidateCount > 0,
    blockedCandidateCount
  };
}

function resolveAdaptiveColonizationBiasForTechnology(
  technologyType: TechnologyType,
  pressure: {
    active: boolean;
    blockedCandidateCount: number;
  }
): number {
  if (!pressure.active || technologyType !== 'Adaptive Technology') {
    return 0;
  }

  return ADAPTIVE_COLONIZATION_PRIORITY_BONUS;
}

function inputTechnologies(): Technology[] {
  return [...TECHNOLOGY_BLUEPRINTS.techByType.values()]
    .sort((left, right) => left.type.localeCompare(right.type));
}

function isAvailableMainLab(planet: BotPlanetSnapshot): boolean {
  return planet.economy.researchLabLevel > 0
    && planet.power.researchPower > 0
    && !planet.queues.hasActiveResearch
    && !planet.queues.isResearchHelper;
}

function isHelperEligible(planet: BotPlanetSnapshot): boolean {
  return planet.economy.researchLabLevel > 0
    && planet.power.researchPower > 0
    && !planet.queues.hasActiveResearch
    && !planet.queues.isResearchHelper;
}

function selectHelperPlanets(
  planets: BotPlanetSnapshot[],
  mainPlanet: BotPlanetSnapshot,
  cost: ResourceAmounts,
  affordabilityWindowTurns: number,
  maxHelpers: number
): BotPlanetSnapshot[] {
  if (maxHelpers <= 0) {
    return [];
  }

  const eligible = planets
    .filter((planet) =>
      isHelperEligible(planet)
      && !sameCoordinates(planet.coordinates, mainPlanet.coordinates)
    );

  const ordered = eligible
    .map((planet) => ({
      planet,
      affordabilityEta: estimateAffordabilityEta(planet, cost)
    }))
    .sort((left, right) => {
      const leftPreferAsHelper = Number(left.affordabilityEta > affordabilityWindowTurns);
      const rightPreferAsHelper = Number(right.affordabilityEta > affordabilityWindowTurns);
      return rightPreferAsHelper - leftPreferAsHelper
        || right.affordabilityEta - left.affordabilityEta
        || right.planet.power.researchPower - left.planet.power.researchPower
        || left.planet.name.localeCompare(right.planet.name);
    });

  return ordered
    .slice(0, maxHelpers)
    .map((entry) => entry.planet);
}

function hasResearchBuildingRequirementsFromSnapshot(
  planet: BotPlanetSnapshot,
  technology: Technology,
  nextLevel: number
): boolean {
  return technology.buildingRequirements.every((requirement) =>
    getSnapshotBuildingLevel(planet, requirement.building) >= Math.ceil(nextLevel * requirement.level)
  );
}

function hasResearchTechnologyRequirementsFromSnapshot(
  snapshot: BotSubsystemContext['snapshot'],
  technology: Technology,
  nextLevel: number
): boolean {
  const referencePlanet = snapshot.planets[0];
  if (!referencePlanet) {
    return false;
  }

  return technology.techRequirements.every((requirement) =>
    resolveTechnologyLevel(referencePlanet, requirement.tech) >= Math.ceil(nextLevel * requirement.level)
  );
}

function estimateAffordabilityEta(
  planet: BotPlanetSnapshot,
  cost: ResourceAmounts
): number {
  return Math.max(
    resolveResourceAffordabilityEta(planet.localResources.metal, planet.economy.income.metal, cost.metal),
    resolveResourceAffordabilityEta(planet.localResources.crystal, planet.economy.income.crystal, cost.crystal),
    resolveResourceAffordabilityEta(planet.localResources.deuterium, planet.economy.income.deuterium, cost.deuterium)
  );
}

function resolveResourceAffordabilityEta(current: number, income: number, required: number): number {
  if (current >= required) {
    return 0;
  }
  if (income <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(1, Math.ceil((required - current) / income));
}

function resolveResourceMatchScore(
  planet: BotPlanetSnapshot,
  cost: ResourceAmounts
): number {
  const totalCost = getTotalResourceAmount(cost);
  if (totalCost <= 0) {
    return 0;
  }

  const localShare = normalizeShareVector({
    metal: planet.localResources.metal + (planet.economy.income.metal * 5),
    crystal: planet.localResources.crystal + (planet.economy.income.crystal * 5),
    deuterium: planet.localResources.deuterium + (planet.economy.income.deuterium * 5)
  });
  const costShare = normalizeShareVector(cost);
  const spread = Math.abs(localShare.metal - costShare.metal)
    + Math.abs(localShare.crystal - costShare.crystal)
    + Math.abs(localShare.deuterium - costShare.deuterium);

  return Math.max(0, 1 - (spread / 2));
}

function normalizeShareVector(resources: ResourceAmounts): {
  metal: number;
  crystal: number;
  deuterium: number;
} {
  const total = Math.max(1, getTotalResourceAmount(resources));
  return {
    metal: resources.metal / total,
    crystal: resources.crystal / total,
    deuterium: resources.deuterium / total
  };
}

function compareCandidates(left: ResearchCandidate, right: ResearchCandidate): number {
  return left.affordabilityEta - right.affordabilityEta
    || right.adaptiveColonizationBias - left.adaptiveColonizationBias
    || left.estimatedResearchEtc - right.estimatedResearchEtc
    || left.weightedCost - right.weightedCost
    || right.resourceMatchScore - left.resourceMatchScore
    || right.mainPlanet.power.researchPower - left.mainPlanet.power.researchPower
    || right.helperPlanets.length - left.helperPlanets.length
    || left.technology.type.localeCompare(right.technology.type)
    || toCoordinatesKey(left.mainPlanet.coordinates).localeCompare(toCoordinatesKey(right.mainPlanet.coordinates));
}

function resolveTechnologyLevel(planet: BotPlanetSnapshot, technologyType: TechnologyType): number {
  switch (technologyType) {
    case 'Energy Technology':
      return planet.tech.energyTechnologyLevel;
    case 'Material Technology':
      return planet.tech.materialTechnologyLevel;
    case 'Hyperspace Technology':
      return planet.tech.hyperspaceTechnologyLevel;
    case 'Espionage Technology':
      return planet.tech.espionageTechnologyLevel;
    case 'Computer Technology':
      return planet.tech.computerTechnologyLevel;
    case 'Astrophysics Technology':
      return planet.tech.astrophysicsTechnologyLevel;
    case 'Adaptive Technology':
      return planet.tech.adaptiveTechnologyLevel;
    case 'Intergalactic Research Network':
      return planet.tech.intergalacticResearchNetworkLevel;
    case 'Graviton Technology':
      return planet.tech.gravitonTechnologyLevel;
    case 'Shielding Technology':
      return planet.tech.shieldingTechnologyLevel;
    case 'Armour Technology':
      return planet.tech.armourTechnologyLevel;
    case 'Railgun Weapons':
      return planet.tech.railgunsWeaponsLevel;
    case 'Beam Weapons':
      return planet.tech.beamsWeaponsLevel;
    case 'Missile Weapons':
      return planet.tech.missilesWeaponsLevel;
    case 'Fusion Drive':
      return planet.tech.fusionDriveLevel;
    case 'Hyperspace Drive':
      return planet.tech.hyperspaceDriveLevel;
    default:
      return 0;
  }
}

function getSnapshotBuildingLevel(planet: BotPlanetSnapshot, buildingType: string): number {
  switch (buildingType) {
    case 'Metal Mine':
      return planet.economy.metalMineLevel;
    case 'Crystal Mine':
      return planet.economy.crystalMineLevel;
    case 'Deuterium Synthesizer':
      return planet.economy.deuteriumSynthesizerLevel;
    case 'Solar Wind Geothermal':
      return planet.economy.solarLevel;
    case 'Nuclear Plant':
      return planet.economy.nuclearLevel;
    case 'Fusion Reactor':
      return planet.economy.fusionLevel;
    case 'Robotics Factory':
      return planet.economy.roboticsLevel;
    case 'Nanite Factory':
      return planet.economy.naniteLevel;
    case 'Shipyard':
      return planet.economy.shipyardLevel;
    case 'Research Lab':
      return planet.economy.researchLabLevel;
    case 'Sensor Phalanx':
      return planet.economy.sensorPhalanxLevel;
    case 'Jump Gate':
      return planet.economy.jumpGateLevel;
    case 'Alliance Depot':
      return planet.economy.allianceDepotLevel;
    case 'Bomb Depot':
      return planet.economy.bombDepotLevel;
    case 'Interstellar Trade Port':
      return planet.economy.interstellarTradePortLevel;
    case 'Metal Storage':
      return planet.economy.metalStorageLevel;
    case 'Crystal Storage':
      return planet.economy.crystalStorageLevel;
    case 'Deuterium Tank':
      return planet.economy.deuteriumTankLevel;
    default:
      return 0;
  }
}

function resolveMaxLabsPerTechnology(snapshot: BotSubsystemContext['snapshot']): number {
  const irnLevel = snapshot.planets[0]?.tech.intergalacticResearchNetworkLevel ?? 0;
  return Math.max(1, Math.floor((1.5 * Math.sqrt(Math.max(0, irnLevel))) + 1));
}

function getTotalResourceAmount(resources: ResourceAmounts): number {
  return resources.metal + resources.crystal + resources.deuterium;
}

function normalizeResources(resources: ResourceAmounts): ResourceAmounts {
  return {
    metal: Math.max(0, Math.floor(resources.metal)),
    crystal: Math.max(0, Math.floor(resources.crystal)),
    deuterium: Math.max(0, Math.floor(resources.deuterium))
  };
}

function sameCoordinates(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number }
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function toCoordinatesKey(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}

export const __researchTestInternals = {
  estimateAffordabilityEta,
  selectHelperPlanets,
  resolveResourceMatchScore
};
