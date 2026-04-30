import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../src/app/models/enums/defence-type.js';
import { ReportType } from '../../../../src/app/models/enums/report-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
import { ManyDefences } from '../../../../src/app/models/defences/many-defences.js';
import { ManyShips } from '../../../../src/app/models/fleets/many-ships.js';
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
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS,
  calculateMaxBuildingQueueLength,
  calculateMaxShipyardQueueLength
} from '../../game-commands/command-helpers.js';

export function buildBotWorldSnapshot(
  galaxy: Galaxy,
  player: Player,
  flags: BotV2FeatureFlags
): BotWorldSnapshot {
  const planets = player.planets.map((planet) => buildPlanetSnapshot(planet, player, galaxy.currentTurn));
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
  player: Player,
  currentTurn: number
): BotPlanetSnapshot {
  const energyTechnologyLevel = player.getTechLevel(TechnologyType.ENERGY_TECHNOLOGY);
  const materialTechnologyLevel = player.getTechLevel(TechnologyType.MATERIAL_TECHNOLOGY);
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  const computerTechnologyLevel = player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY);
  const intergalacticResearchNetworkLevel = player.getTechLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK);
  const shieldingTechnologyLevel = player.getTechLevel(TechnologyType.SHIELDING_TECHNOLOGY);
  const armourTechnologyLevel = player.getTechLevel(TechnologyType.ARMOUR_TECHNOLOGY);
  const railgunsWeaponsLevel = player.getTechLevel(TechnologyType.RAILGUNS_WEAPONS);
  const beamsWeaponsLevel = player.getTechLevel(TechnologyType.BEAMS_WEAPONS);
  const missilesWeaponsLevel = player.getTechLevel(TechnologyType.MISSILES_WEAPONS);
  const fusionDriveLevel = player.getTechLevel(TechnologyType.FUSION_DRIVE);
  const hyperspaceDriveLevel = player.getTechLevel(TechnologyType.HYPERSPACE_DRIVE);
  const hyperspaceTechnologyLevel = player.getTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY);
  const espionageTechnologyLevel = player.getTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY);
  const astrophysicsTechnologyLevel = player.getTechLevel(TechnologyType.ASTROPHYSICS_TECHNOLOGY);
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
  const maxShipyardQueueLength = calculateMaxShipyardQueueLength(planet, player);
  const queueSaturated = planet.rBDSFTQ.buildingQueue.length >= maxBuildingQueueLength;
  const industryPower = resolveIndustryPower(planet, effectiveParameters.industryModifier, adaptiveTechnologyLevel, energyEfficiency);
  const shipyardPower = resolveShipyardPower(planet, effectiveParameters.industryModifier, adaptiveTechnologyLevel, energyEfficiency);
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
  const defenseCounts = ManyDefences.countByType(planet.rBDSFTQ.defences);
  const installedCountByType = Object.fromEntries(defenseCounts.entries()) as Partial<Record<DefenceType, number>>;
  const installedValueByType = resolveInstalledDefenseValues(defenseCounts);
  const totalInstalledDefenseValue = Object.values(installedValueByType)
    .reduce((sum, value) => sum + value, 0);
  const shipCounts = ManyShips.countByType(planet.rBDSFTQ.ships);
  const installedShipCountByType = Object.fromEntries(shipCounts.entries()) as Partial<Record<ShipType, number>>;
  const installedShipValueByType = resolveInstalledShipValues(shipCounts);
  const totalInstalledShipValue = Object.values(installedShipValueByType)
    .reduce((sum, value) => sum + value, 0);
  const bunkerLevel = planet.getBuildingLevel(BuildingType.BUNKER_NETWORK);
  const recentHostileAttackCountLast100Turns = resolveRecentHostileAttackCountLast100Turns(
    player,
    planet,
    currentTurn,
    100
  );

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
      intergalacticResearchNetworkLevel,
      shieldingTechnologyLevel,
      armourTechnologyLevel,
      railgunsWeaponsLevel,
      beamsWeaponsLevel,
      missilesWeaponsLevel,
      fusionDriveLevel,
      hyperspaceDriveLevel,
      hyperspaceTechnologyLevel,
      espionageTechnologyLevel,
      astrophysicsTechnologyLevel
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
      maxBuildingQueueLength,
      shipyardPower,
      shipyardQueueRemainingEtc: resolveShipyardQueueRemainingEtc(planet, shipyardPower),
      maxShipyardQueueLength
    },
    queues: {
      buildingQueueLength: planet.rBDSFTQ.buildingQueue.length,
      shipyardQueueLength: planet.rBDSFTQ.shipyardQueue.length,
      hasActiveResearch: planet.rBDSFTQ.currentResearchQueue !== null,
      queuedBuildingTypes: planet.rBDSFTQ.buildingQueue.map((entry) => entry.buildingType),
      queuedDefenceTypes: planet.rBDSFTQ.shipyardQueue
        .filter((entry) => entry.itemKind === 'defence' && entry.defenceType !== null)
        .map((entry) => entry.defenceType as DefenceType),
      queuedShipTypes: planet.rBDSFTQ.shipyardQueue
        .filter((entry) => entry.itemKind === 'ship' && entry.shipType !== null)
        .map((entry) => entry.shipType as ShipType),
      currentResearchType: planet.rBDSFTQ.currentResearchQueue?.technologyType ?? null
    },
    defense: {
      bunkerLevel,
      avgIndustryLevel: resolveAverageIndustryLevel(planet),
      planetSize: planet.basicInfo.size,
      recentHostileAttackCountLast100Turns,
      recentHostileAttackStep: resolveHostileAttackStep(recentHostileAttackCountLast100Turns),
      totalBunkerValue: resolveCompletedBuildingInvestment(BuildingType.BUNKER_NETWORK, bunkerLevel),
      totalInstalledDefenseValue,
      installedCountByType,
      installedValueByType
    },
    ships: {
      installedCountByType: installedShipCountByType,
      installedValueByType: installedShipValueByType,
      totalInstalledShipValue
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

function resolveShipyardPower(
  planet: Planet,
  industryModifier: number,
  adaptiveTechnologyLevel: number,
  energyEfficiency: number
): number {
  const shipyardBasePower = planet.getBuildingLevel(BuildingType.SHIPYARD) <= 0
    ? 0
    : planet.getBuildingProductionValue1(BuildingType.SHIPYARD);
  const naniteMultiplier = planet.getBuildingLevel(BuildingType.NANITE_FACTORY) <= 0
    ? 1
    : planet.getBuildingProductionValue1Exact(BuildingType.NANITE_FACTORY);

  return Math.max(0, Math.floor(
    shipyardBasePower
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

function resolveShipyardQueueRemainingEtc(planet: Planet, shipyardPower: number): number {
  if (shipyardPower <= 0) {
    return planet.rBDSFTQ.shipyardQueue.length > 0 ? Number.MAX_SAFE_INTEGER : 0;
  }

  let remainingPower = 0;
  for (const entry of planet.rBDSFTQ.shipyardQueue) {
    const blueprint = entry.itemKind === 'defence'
      ? (entry.defenceType ? DEFENCE_BLUEPRINTS.get(entry.defenceType) : null)
      : (entry.shipType ? SHIP_BLUEPRINTS.get(entry.shipType) : null);
    if (!blueprint) {
      continue;
    }

    const totalRequiredPower = Math.max(0, Math.floor(
      blueprint.cost.getTotalResourceAmount() * Math.max(0, Math.floor(entry.amount))
    ));
    remainingPower += Math.max(0, totalRequiredPower - entry.investedShipyardPower);
  }

  return remainingPower <= 0 ? 0 : Math.ceil(remainingPower / shipyardPower);
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

function resolveAverageIndustryLevel(planet: Planet): number {
  const includedBuildings: Array<{ buildingType: BuildingType; weight: number }> = [
    { buildingType: BuildingType.METAL_MINE, weight: 1 },
    { buildingType: BuildingType.CRYSTAL_MINE, weight: 1 },
    { buildingType: BuildingType.DEUTERIUM_SYNTHESIZER, weight: 1 },
    { buildingType: BuildingType.METAL_STORAGE, weight: 1 },
    { buildingType: BuildingType.CRYSTAL_STORAGE, weight: 1 },
    { buildingType: BuildingType.DEUTERIUM_TANK, weight: 1 },
    { buildingType: BuildingType.SOLAR_WIND_GEOTHERMAL, weight: 1 },
    { buildingType: BuildingType.NUCLEAR_PLANT, weight: 1 },
    { buildingType: BuildingType.FUSION_REACTOR, weight: 1.25 },
    { buildingType: BuildingType.ROBOTICS_FACTORY, weight: 1 },
    { buildingType: BuildingType.SHIPYARD, weight: 1 },
    { buildingType: BuildingType.NANITE_FACTORY, weight: 2 }
  ];

  let weightedSum = 0;
  let includedCount = 0;
  for (const entry of includedBuildings) {
    const level = planet.getBuildingLevel(entry.buildingType);
    if (level <= 0) {
      continue;
    }

    weightedSum += level * entry.weight;
    includedCount += 1;
  }

  if (includedCount <= 0) {
    return 0;
  }

  return weightedSum / includedCount;
}

function resolveInstalledDefenseValues(
  counts: Map<DefenceType, number>
): Partial<Record<DefenceType, number>> {
  const values: Partial<Record<DefenceType, number>> = {};

  for (const [defenceType, amount] of counts.entries()) {
    const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
    if (!blueprint || amount <= 0) {
      continue;
    }

    values[defenceType] = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount() * amount));
  }

  return values;
}

function resolveInstalledShipValues(
  counts: Map<ShipType, number>
): Partial<Record<ShipType, number>> {
  const values: Partial<Record<ShipType, number>> = {};

  for (const [shipType, amount] of counts.entries()) {
    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint || amount <= 0) {
      continue;
    }

    values[shipType] = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount() * amount));
  }

  return values;
}

function resolveCompletedBuildingInvestment(buildingType: BuildingType, level: number): number {
  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  if (!blueprint || level <= 0) {
    return 0;
  }

  let total = 0;
  for (let currentLevel = 1; currentLevel <= level; currentLevel += 1) {
    total += Math.max(0, Math.floor(blueprint.getCostForLevel(currentLevel).getTotalResourceAmount()));
  }

  return total;
}

function resolveRecentHostileAttackCountLast100Turns(
  player: Player,
  planet: Planet,
  currentTurn: number,
  windowTurns: number
): number {
  const minTurn = Math.max(0, currentTurn - Math.max(0, Math.floor(windowTurns)));
  const targetCoordinates = {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: planet.basicInfo.order
  };

  return player.reports.filter((report) =>
    report.reportType === ReportType.FLEET_REPORT
    && report.createdTurn >= minTurn
    && report.sourceCoordinates?.x === targetCoordinates.x
    && report.sourceCoordinates?.y === targetCoordinates.y
    && report.sourceCoordinates?.z === targetCoordinates.z
    && (
      report.title.startsWith('Battle Report:')
      || report.title.startsWith('Bombardment Report:')
    )
  ).length;
}

function resolveHostileAttackStep(attackCount: number): number {
  if (attackCount <= 0) {
    return 0;
  }
  if (attackCount <= 2) {
    return 1;
  }
  if (attackCount <= 5) {
    return 2;
  }
  if (attackCount <= 15) {
    return 3;
  }
  return 4;
}
