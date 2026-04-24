import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
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
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  const fusionOperation = planet.resolveFusionReactorOperation(adaptiveTechnologyLevel, energyTechnologyLevel);
  const availableEnergy = resolveAvailableEnergy(planet, energyTechnologyLevel, fusionOperation.powerOutput);
  const usedEnergy = resolveUsedEnergy(planet);
  const energyGap = Math.max(0, usedEnergy - availableEnergy);
  const storagePressure = {
    metal: resolveStoragePressure(planet.rBDSFTQ.resources.metal, planet.getBuildingProductionValue1(BuildingType.METAL_STORAGE)),
    crystal: resolveStoragePressure(
      planet.rBDSFTQ.resources.crystal,
      planet.getBuildingProductionValue1(BuildingType.CRYSTAL_STORAGE)
    ),
    deuterium: resolveStoragePressure(
      planet.rBDSFTQ.resources.deuterium,
      planet.getBuildingProductionValue1(BuildingType.DEUTERIUM_TANK)
    )
  };
  const averageMineLevel = (
    planet.getBuildingLevel(BuildingType.METAL_MINE)
    + planet.getBuildingLevel(BuildingType.CRYSTAL_MINE)
    + planet.getBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER)
  ) / 3;
  const queueSaturated = planet.rBDSFTQ.buildingQueue.length >= calculateMaxBuildingQueueLength(planet, player);

  return {
    planetId: null,
    name: planet.basicInfo.name,
    coordinates: {
      x: planet.basicInfo.solarSystem.coordinates.x,
      y: planet.basicInfo.solarSystem.coordinates.y,
      z: planet.basicInfo.order
    },
    maturityStage: resolveMaturityStage(averageMineLevel),
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
      metalStorageLevel: planet.getBuildingLevel(BuildingType.METAL_STORAGE),
      crystalStorageLevel: planet.getBuildingLevel(BuildingType.CRYSTAL_STORAGE),
      deuteriumTankLevel: planet.getBuildingLevel(BuildingType.DEUTERIUM_TANK),
      averageMineLevel,
      availableEnergy,
      usedEnergy,
      energyGap,
      storagePressure
    },
    queues: {
      buildingQueueLength: planet.rBDSFTQ.buildingQueue.length,
      shipyardQueueLength: planet.rBDSFTQ.shipyardQueue.length,
      hasActiveResearch: planet.rBDSFTQ.currentResearchQueue !== null,
      queuedBuildingTypes: planet.rBDSFTQ.buildingQueue.map((entry) => entry.buildingType)
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
