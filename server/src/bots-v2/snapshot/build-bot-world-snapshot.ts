import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
import { industryPowerMultiplier, researchPowerMultiplier } from '../../../../src/app/models/tech/technology-effects.js';
import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../../src/app/models/player.ts';
import type {
  BotEmpireSnapshot,
  BotPlanetMaturityStage,
  BotPlanetSnapshot,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS,
  calculateMaxBuildingQueueLength
} from '../../game-commands/command-helpers.js';

export function buildBotWorldSnapshot(
  galaxy: Galaxy,
  player: Player,
  flags: BotV2FeatureFlags
): BotWorldSnapshot {
  const planets = player.planets.map((planet) => buildPlanetSnapshot(planet, player));
  const empire = buildEmpireSnapshot(galaxy, player, planets);

  return {
    turn: galaxy.currentTurn,
    playerId: player.playerId,
    playerName: player.playerName,
    profileId: player.botProfileId,
    planets,
    empire,
    flags: {
      shadowMode: flags.shadowMode,
      currentBotStillExecutes: true
    }
  };
}

function buildEmpireSnapshot(
  galaxy: Galaxy,
  player: Player,
  planets: BotPlanetSnapshot[]
): BotEmpireSnapshot {
  const totalResources = planets.reduce((sum, planet) => ({
    metal: sum.metal + planet.localResources.metal,
    crystal: sum.crystal + planet.localResources.crystal,
    deuterium: sum.deuterium + planet.localResources.deuterium
  }), {
    metal: 0,
    crystal: 0,
    deuterium: 0
  });

  const atWar = galaxy.diplomaticRelations.some((relation) =>
    relation.status === 'WAR'
    && (relation.playerAId === player.playerId || relation.playerBId === player.playerId)
  );

  return {
    ownedPlanetCount: planets.length,
    totalResources,
    atWar,
    hasCriticalEnergyProblem: planets.some((planet) => planet.blockers.energyStarved),
    hasCriticalStorageProblem: planets.some((planet) => planet.blockers.storageBlocked)
  };
}

function buildPlanetSnapshot(
  planet: Planet,
  player: Player
): BotPlanetSnapshot {
  const energyTechnologyLevel = player.getTechLevel(TechnologyType.ENERGY_TECHNOLOGY);
  const materialTechnologyLevel = player.getTechLevel(TechnologyType.MATERIAL_TECHNOLOGY);
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  const computerTechnologyLevel = player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY);
  const intergalacticResearchNetworkLevel = player.getTechLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK);
  const effectiveParameters = planet.getEffectivePlanetaryParameters();
  const fusionOperation = planet.resolveFusionReactorOperation(adaptiveTechnologyLevel, energyTechnologyLevel);
  const availableEnergy = resolveAvailableEnergy(planet, energyTechnologyLevel, fusionOperation.powerOutput);
  const usedEnergy = resolveUsedEnergy(planet);
  const energyGap = Math.max(0, usedEnergy - availableEnergy);
  const energyEfficiency = resolveEnergyEfficiency(availableEnergy, usedEnergy);
  const storageCapacity = {
    metal: Math.max(1, planet.getBuildingProductionValue1(BuildingType.METAL_STORAGE)),
    crystal: Math.max(1, planet.getBuildingProductionValue1(BuildingType.CRYSTAL_STORAGE)),
    deuterium: Math.max(1, planet.getBuildingProductionValue1(BuildingType.DEUTERIUM_TANK))
  };
  const storagePressure = {
    metal: resolveStoragePressure(planet.rBDSFTQ.resources.metal, storageCapacity.metal),
    crystal: resolveStoragePressure(
      planet.rBDSFTQ.resources.crystal,
      storageCapacity.crystal
    ),
    deuterium: resolveStoragePressure(
      planet.rBDSFTQ.resources.deuterium,
      storageCapacity.deuterium
    )
  };
  const averageMineLevel = (
    planet.getBuildingLevel(BuildingType.METAL_MINE)
    + planet.getBuildingLevel(BuildingType.CRYSTAL_MINE)
    + planet.getBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER)
  ) / 3;
  const maxBuildingQueueLength = calculateMaxBuildingQueueLength(planet, player);
  const queueSaturated = planet.rBDSFTQ.buildingQueue.length >= maxBuildingQueueLength;
  const industryPower = resolveIndustryPower(planet, effectiveParameters.industryModifier, adaptiveTechnologyLevel, energyEfficiency);
  const researchPower = resolveResearchPower(
    planet,
    effectiveParameters.scienceModifier,
    computerTechnologyLevel,
    adaptiveTechnologyLevel,
    intergalacticResearchNetworkLevel,
    energyEfficiency
  );
  const income = {
    metal: Math.max(0, Math.floor(planet.getMetalGain(adaptiveTechnologyLevel) * energyEfficiency)),
    crystal: Math.max(0, Math.floor(planet.getCrystalGain(adaptiveTechnologyLevel) * energyEfficiency)),
    deuterium: Math.max(0, Math.floor(fusionOperation.netDeuteriumIncome))
  };

  return {
    planetId: null,
    name: planet.basicInfo.name,
    coordinates: {
      x: planet.basicInfo.solarSystem.coordinates.x,
      y: planet.basicInfo.solarSystem.coordinates.y,
      z: planet.basicInfo.order
    },
    maturityStage: resolveMaturityStage(averageMineLevel),
    tech: {
      energyTechnologyLevel,
      materialTechnologyLevel,
      adaptiveTechnologyLevel,
      computerTechnologyLevel,
      intergalacticResearchNetworkLevel
    },
    economy: {
      metalMineLevel: planet.getBuildingLevel(BuildingType.METAL_MINE),
      crystalMineLevel: planet.getBuildingLevel(BuildingType.CRYSTAL_MINE),
      deuteriumSynthesizerLevel: planet.getBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER),
      solarLevel: planet.getBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL),
      nuclearLevel: planet.getBuildingLevel(BuildingType.NUCLEAR_PLANT),
      fusionLevel: planet.getBuildingLevel(BuildingType.FUSION_REACTOR),
      roboticsLevel: planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY),
      naniteLevel: planet.getBuildingLevel(BuildingType.NANITE_FACTORY),
      shipyardLevel: planet.getBuildingLevel(BuildingType.SHIPYARD),
      researchLabLevel: planet.getBuildingLevel(BuildingType.RESEARCH_LAB),
      metalStorageLevel: planet.getBuildingLevel(BuildingType.METAL_STORAGE),
      crystalStorageLevel: planet.getBuildingLevel(BuildingType.CRYSTAL_STORAGE),
      deuteriumTankLevel: planet.getBuildingLevel(BuildingType.DEUTERIUM_TANK),
      averageMineLevel,
      availableEnergy,
      usedEnergy,
      energyGap,
      storagePressure,
      storageCapacity,
      income
    },
    modifiers: {
      metal: effectiveParameters.metalModifier,
      crystal: effectiveParameters.crystalModifier,
      deuterium: effectiveParameters.deuteriumModifier,
      solarEnergy: effectiveParameters.energyModifierRES,
      nuclearEnergy: effectiveParameters.energyModifierNuclear,
      science: effectiveParameters.scienceModifier,
      industry: effectiveParameters.industryModifier
    },
    power: {
      industryPower,
      researchPower,
      buildingQueueRemainingEtc: resolveBuildingQueueRemainingEtc(planet, industryPower),
      researchQueueRemainingEtc: resolveResearchQueueRemainingEtc(planet, researchPower),
      maxBuildingQueueLength
    },
    queues: {
      buildingQueueLength: planet.rBDSFTQ.buildingQueue.length,
      shipyardQueueLength: planet.rBDSFTQ.shipyardQueue.length,
      hasActiveResearch: planet.rBDSFTQ.currentResearchQueue !== null,
      queuedBuildingTypes: planet.rBDSFTQ.buildingQueue.map((entry) => entry.buildingType),
      currentResearchType: planet.rBDSFTQ.currentResearchQueue?.technologyType ?? null
    },
    localResources: {
      metal: Math.max(0, Math.floor(planet.rBDSFTQ.resources.metal)),
      crystal: Math.max(0, Math.floor(planet.rBDSFTQ.resources.crystal)),
      deuterium: Math.max(0, Math.floor(planet.rBDSFTQ.resources.deuterium))
    },
    blockers: {
      energyStarved: energyGap > 0,
      storageBlocked: Math.max(storagePressure.metal, storagePressure.crystal, storagePressure.deuterium) >= 0.95,
      queueSaturated,
      missingRoboticsForGrowth: averageMineLevel >= 2 && planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY) <= 0
    }
  };
}

function resolveAvailableEnergy(planet: Planet, energyTechnologyLevel: number, fusionPowerOutput: number): number {
  const multiplier = 1 + ((Math.max(0, energyTechnologyLevel) * 2) / 100);
  const baseEnergy = (
    (planet.getBuildingProductionValue1(BuildingType.SOLAR_WIND_GEOTHERMAL) * planet.info.planetaryParameters.energyModifierRES)
    + (planet.getBuildingProductionValue1(BuildingType.NUCLEAR_PLANT) * planet.info.planetaryParameters.energyModifierNuclear)
    + fusionPowerOutput
  ) * multiplier;

  return Math.max(0, Math.floor(baseEnergy));
}

function resolveUsedEnergy(planet: Planet): number {
  let usedEnergy = 0;
  for (const [buildingType, level] of planet.rBDSFTQ.buildingsLevels.entries()) {
    if (
      level <= 0
      || buildingType === BuildingType.FUSION_REACTOR
    ) {
      continue;
    }

    usedEnergy += planet.getCurrentBuildingPowerConsumption(buildingType);
  }

  return Math.max(0, Math.floor(usedEnergy));
}

function resolveEnergyEfficiency(availableEnergy: number, usedEnergy: number): number {
  if (usedEnergy <= 0 || availableEnergy >= usedEnergy) {
    return 1;
  }

  return Math.max(0, Math.min(1, availableEnergy / usedEnergy));
}

function resolveIndustryPower(
  planet: Planet,
  industryModifier: number,
  adaptiveTechnologyLevel: number,
  energyEfficiency: number
): number {
  const naniteMultiplier = planet.getBuildingLevel(BuildingType.NANITE_FACTORY) <= 0
    ? 1
    : planet.getBuildingProductionValue1Exact(BuildingType.NANITE_FACTORY);
  const roboticsPower = planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY) <= 0
    ? 5
    : planet.getBuildingProductionValue1(BuildingType.ROBOTICS_FACTORY);

  return Math.max(0, Math.floor(
    roboticsPower
    * naniteMultiplier
    * industryModifier
    * industryPowerMultiplier(adaptiveTechnologyLevel)
    * energyEfficiency
  ));
}

function resolveResearchPower(
  planet: Planet,
  scienceModifier: number,
  computerTechnologyLevel: number,
  adaptiveTechnologyLevel: number,
  intergalacticResearchNetworkLevel: number,
  energyEfficiency: number
): number {
  const researchLabBasePower = planet.getBuildingProductionValue1(BuildingType.RESEARCH_LAB);
  return Math.max(0, Math.floor(
    researchLabBasePower
    * scienceModifier
    * researchPowerMultiplier(
      computerTechnologyLevel,
      adaptiveTechnologyLevel,
      intergalacticResearchNetworkLevel
    )
    * energyEfficiency
  ));
}

function resolveBuildingQueueRemainingEtc(planet: Planet, industryPower: number): number {
  if (industryPower <= 0) {
    return planet.rBDSFTQ.buildingQueue.length > 0 ? Number.MAX_SAFE_INTEGER : 0;
  }

  let remainingPower = 0;
  for (const entry of planet.rBDSFTQ.buildingQueue) {
    const blueprint = BUILDING_BLUEPRINTS.get(entry.buildingType);
    if (!blueprint) {
      continue;
    }

    const totalRequiredPower = Math.max(0, Math.floor(
      blueprint.getCostForLevel(entry.nextLevel).getTotalResourceAmount()
    ));
    remainingPower += Math.max(0, totalRequiredPower - entry.investedIndustryPower);
  }

  return remainingPower <= 0 ? 0 : Math.ceil(remainingPower / industryPower);
}

function resolveResearchQueueRemainingEtc(planet: Planet, researchPower: number): number {
  const entry = planet.rBDSFTQ.currentResearchQueue;
  if (!entry) {
    return 0;
  }
  if (researchPower <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  const technology = TECHNOLOGY_BLUEPRINTS.get(entry.technologyType);
  if (!technology) {
    return 0;
  }

  const totalRequiredPower = Math.max(0, Math.floor(
    technology.getCostForLevel(entry.nextLevel).getTotalResourceAmount()
  ));
  const remainingPower = Math.max(0, totalRequiredPower - entry.investedResearchPower);
  return remainingPower <= 0 ? 0 : Math.ceil(remainingPower / researchPower);
}

function resolveStoragePressure(currentAmount: number, capacity: number): number {
  const normalizedCapacity = Math.max(1, Number.isFinite(capacity) ? Math.floor(capacity) : 0);
  const normalizedAmount = Math.max(0, Number.isFinite(currentAmount) ? Math.floor(currentAmount) : 0);
  return normalizedAmount / normalizedCapacity;
}

function resolveMaturityStage(averageMineLevel: number): BotPlanetMaturityStage {
  if (averageMineLevel <= 3) {
    return 'BOOTSTRAP';
  }
  if (averageMineLevel <= 4) {
    return 'STABILIZING';
  }
  if (averageMineLevel <= 5.5) {
    return 'DEVELOPED';
  }
  if (averageMineLevel <= 7.5) {
    return 'MILITARY_CAPABLE';
  }
  return 'STRATEGIC_HUB';
}
