import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../src/app/models/enums/defence-type.js';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { PlanetType } from '../../../../src/app/models/enums/planet-type.js';
import { PlayerType } from '../../../../src/app/models/enums/player-type.js';
import { ReportType } from '../../../../src/app/models/enums/report-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
import { DiplomaticProposalState } from '../../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import { DiplomacyResolver } from '../../../../src/app/models/diplomacy/diplomacy-resolver.js';
import { ManyDefences } from '../../../../src/app/models/defences/many-defences.js';
import { ManyShips } from '../../../../src/app/models/fleets/many-ships.js';
import {
  industryPowerMultiplier,
  maxActiveFleets,
  researchPowerMultiplier
} from '../../../../src/app/models/tech/technology-effects.js';
import {
  calculateRepairDroneProductionBasePower,
  routeRepairDroneProduction
} from '../../../../src/app/models/turns/repair-drone-production.js';
import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../../src/app/models/player.ts';
import type {
  BotEmpireSnapshot,
  BotIntelCandidateSnapshot,
  BotPlanetMaturityStage,
  BotPlanetSnapshot,
  BotStrategicDiplomaticFactionSnapshot,
  BotStrategicDiplomaticKnownPlanetSnapshot,
  BotStrategicDiplomaticSupportRequestSnapshot,
  BotStrategicMilitaryTargetSnapshot,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type { EspionageReportData } from '../../../../src/app/models/reports/espionage-report-data.ts';
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
  const computerTechnologyLevel = player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY);
  const activeFleets = galaxy.activeFleets.filter((fleet) => fleet.ownerId === player.playerId);

  return {
    ownedPlanetCount: planets.length,
    computerTechnologyLevel,
    imperiumFleetCap: 4 + Math.max(0, computerTechnologyLevel),
    activeFleetCount: activeFleets.length,
    maxActiveFleetCount: maxActiveFleets(computerTechnologyLevel),
    activeColonizeFleetCount: activeFleets.filter((fleet) => fleet.missionType === FleetMissionType.COLONIZE).length,
    totalResources,
    atWar,
    hasCriticalEnergyProblem: planets.some((planet) => planet.blockers.energyStarved),
    hasCriticalStorageProblem: planets.some((planet) => planet.blockers.storageBlocked),
    intelCandidates: resolveIntelCandidates(galaxy, player, planets.length),
    strategicMilitaryTargets: resolveStrategicMilitaryTargets(galaxy, player),
    strategicDiplomaticFactions: resolveStrategicDiplomaticFactions(galaxy, player)
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
  const baseIndustryPower = resolveIndustryPower(planet, effectiveParameters.industryModifier, adaptiveTechnologyLevel, energyEfficiency);
  const baseShipyardPower = resolveShipyardPower(planet, effectiveParameters.industryModifier, adaptiveTechnologyLevel, energyEfficiency);
  const droneProductionRouting = routeRepairDroneProduction(
    calculateRepairDroneProductionBasePower({
      repairDroneCount: ManyShips.countByType(planet.rBDSFTQ.ships).get(ShipType.REPAIR_DRONE) ?? 0,
      industryModifier: effectiveParameters.industryModifier,
      adaptiveIndustryMultiplier: industryPowerMultiplier(adaptiveTechnologyLevel),
      energyEfficiency
    }),
    {
      hasBuildingQueueWork: planet.rBDSFTQ.buildingQueue.length > 0,
      hasShipyardQueueWork: planet.rBDSFTQ.shipyardQueue.length > 0
    }
  );
  const industryPower = baseIndustryPower + droneProductionRouting.droneIndustryPower;
  const shipyardPower = baseShipyardPower + droneProductionRouting.droneShipyardPower;
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
  const undamagedShipCounts = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const damagedShipCounts = ManyShips.damagedCountByType(planet.rBDSFTQ.ships);
  const installedShipCountByType = Object.fromEntries(shipCounts.entries()) as Partial<Record<ShipType, number>>;
  const undamagedShipCountByType = Object.fromEntries(undamagedShipCounts.entries()) as Partial<Record<ShipType, number>>;
  const damagedShipCountByType = Object.fromEntries(damagedShipCounts.entries()) as Partial<Record<ShipType, number>>;
  const installedShipValueByType = resolveInstalledShipValues(shipCounts);
  const totalInstalledShipValue = Object.values(installedShipValueByType)
    .reduce((sum, value) => sum + value, 0);
  const buildingDamageSummary = resolveBuildingDamageSummary(planet);
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
      sensorPhalanxLevel: planet.getBuildingLevel(BuildingType.SENSOR_PHALANX),
      jumpGateLevel: planet.getBuildingLevel(BuildingType.JUMP_GATE),
      allianceDepotLevel: planet.getBuildingLevel(BuildingType.ALLIANCE_DEPOT),
      bombDepotLevel: planet.getBuildingLevel(BuildingType.BOMB_DEPOT),
      interstellarTradePortLevel: planet.getBuildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT),
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
      industry: effectiveParameters.industryModifier,
      anomaliesAndNoise: effectiveParameters.anomaliesAndNoise,
      hyperspaceParameters: effectiveParameters.hyperspaceParameters
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
      undamagedCountByType: undamagedShipCountByType,
      damagedCountByType: damagedShipCountByType,
      installedCountByType: installedShipCountByType,
      installedValueByType: installedShipValueByType,
      totalInstalledShipValue
    },
    infrastructure: buildingDamageSummary,
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

function resolveBuildingDamageSummary(planet: Planet): {
  damagedBuildingCount: number;
  missingBuildingStructuralPoints: number;
} {
  let damagedBuildingCount = 0;
  let missingBuildingStructuralPoints = 0;

  for (const [buildingType, level] of planet.rBDSFTQ.buildingsLevels.entries()) {
    if (level <= 0) {
      continue;
    }

    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(buildingType);
    if (maxStructuralPoints <= 0) {
      continue;
    }

    const currentStructuralPoints = planet.getCurrentBuildingStructuralPoints(buildingType);
    if (currentStructuralPoints >= maxStructuralPoints) {
      continue;
    }

    damagedBuildingCount += 1;
    missingBuildingStructuralPoints += Math.max(0, maxStructuralPoints - currentStructuralPoints);
  }

  return {
    damagedBuildingCount,
    missingBuildingStructuralPoints
  };
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

function resolveIntelCandidates(
  galaxy: Galaxy,
  player: Player,
  ownedPlanetCount: number
): BotIntelCandidateSnapshot[] {
  const scanRadius = 2 + Math.max(0, ownedPlanetCount);
  const ownedCoordinates = player.planets.map((planet) => ({
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y
  }));
  const candidates: BotIntelCandidateSnapshot[] = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== null) {
          continue;
        }

        if (!ownedCoordinates.some((coordinates) =>
          resolveSystemScanRadiusDistance(coordinates, system.coordinates) <= scanRadius
        )) {
          continue;
        }

        if (planet.basicInfo.size < 140) {
          continue;
        }

        const report = planet.lastReportData.get(player.playerId) ?? null;
        const lastRelevantReportAge = report === null
          ? null
          : Math.max(0, galaxy.currentTurn - report.createdTurn);
        const neverScanned = report === null;
        const needsScan = neverScanned || lastRelevantReportAge === null || lastRelevantReportAge > 200;
        const reportedParameters = report?.planetaryParameters ?? planet.getEffectivePlanetaryParameters();
        const reportedSize = report?.size ?? planet.basicInfo.size;
        const reportedColonizationDifficulty = report?.diff ?? null;
        candidates.push({
          coordinates: {
            x: system.coordinates.x,
            y: system.coordinates.y,
            z: planet.basicInfo.order
          },
          size: reportedSize,
          colonizationDifficulty: reportedColonizationDifficulty,
          industryModifier: reportedParameters.industryModifier,
          metalModifier: reportedParameters.metalModifier,
          crystalModifier: reportedParameters.crystalModifier,
          deuteriumModifier: reportedParameters.deuteriumModifier,
          neverScanned,
          needsScan,
          lastRelevantReportAge,
          colonizationScore: resolveColonizationScore({
            size: reportedSize,
            industryModifier: reportedParameters.industryModifier,
            metalModifier: reportedParameters.metalModifier,
            crystalModifier: reportedParameters.crystalModifier,
            deuteriumModifier: reportedParameters.deuteriumModifier
          })
        });
      }
    }
  }

  return candidates;
}

function resolveStrategicMilitaryTargets(
  galaxy: Galaxy,
  player: Player
): BotStrategicMilitaryTargetSnapshot[] {
  const targets: BotStrategicMilitaryTargetSnapshot[] = [];

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (
          planet.basicInfo.type === PlanetType.ASTEROIDS
          || planet.info.ownerId === player.playerId
        ) {
          continue;
        }

        const report = planet.lastReportData.get(player.playerId) ?? null;
        const reportAge = report === null
          ? null
          : Math.max(0, galaxy.currentTurn - report.createdTurn);
        const owner = planet.info.ownerId === null
          ? null
          : galaxy.players.find((entry) => entry.playerId === planet.info.ownerId) ?? null;
        const reportTurn = report?.createdTurn ?? null;
        const mineLevels = report === null
          ? null
          : {
            metalMineLevel: report.buildingsLevels.get(BuildingType.METAL_MINE) ?? 0,
            crystalMineLevel: report.buildingsLevels.get(BuildingType.CRYSTAL_MINE) ?? 0,
            deuteriumSynthesizerLevel: report.buildingsLevels.get(BuildingType.DEUTERIUM_SYNTHESIZER) ?? 0
          };
        const currentResources = report === null
          ? null
          : {
            metal: Math.max(0, Math.floor(report.resourcesAmount.metal)),
            crystal: Math.max(0, Math.floor(report.resourcesAmount.crystal)),
            deuterium: Math.max(0, Math.floor(report.resourcesAmount.deuterium))
          };
        const adaptiveTechnologyLevel = report?.techLevels.get(TechnologyType.ADAPTIVE_TECHNOLOGY)
          ?? owner?.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY)
          ?? 0;
        const storageCapacity = report === null
          ? null
          : resolveReportedStorageCapacity(report);
        const bunkerReductionPercent = report === null
          ? null
          : resolveReportedBunkerReductionPercent(report);
        const latestBattleObservation = resolveLatestBattleObservation(player, planet);
        const latestPlunderObservation = resolveLatestPlunderObservation(player, planet);
        const knownShipCountsByType = report === null
          ? {}
          : resolveKnownShipCountsForStrategicMilitary(report, latestBattleObservation);
        const knownDefenceCountsByType = report === null
          ? {}
          : resolveKnownDefenceCountsForStrategicMilitary(report, latestBattleObservation);

        targets.push({
          coordinates: {
            x: system.coordinates.x,
            y: system.coordinates.y,
            z: planet.basicInfo.order
          },
          neverScanned: report === null,
          hasEspionageReport: report !== null,
          reportAge,
          reportTurn,
          needsScan: report === null,
          isNeutral: owner?.type === PlayerType.NEUTRAL,
          mineLevels,
          currentShipsCount: report === null ? null : sumCountsByType(knownShipCountsByType),
          currentDefencesCount: report === null ? null : sumCountsByType(knownDefenceCountsByType),
          knownShipCountsByType,
          knownDefenceCountsByType,
          currentResources,
          storageCapacity,
          income: report === null
            ? null
            : resolveReportedIncome(report, adaptiveTechnologyLevel),
          bunkerReductionPercent,
          size: report?.size ?? null,
          industryModifier: report?.planetaryParameters.industryModifier ?? null,
          metalModifier: report?.planetaryParameters.metalModifier ?? null,
          crystalModifier: report?.planetaryParameters.crystalModifier ?? null,
          deuteriumModifier: report?.planetaryParameters.deuteriumModifier ?? null,
          lastAttackTurn: latestBattleObservation?.turn ?? null,
          lastPlunderTurn: latestPlunderObservation?.turn ?? null,
          latestPlunderedResources: latestPlunderObservation?.stolenResources ?? null,
          combatObservationTurn: latestBattleObservation?.turn ?? reportTurn
        });
      }
    }
  }

  return targets;
}

function resolveStrategicDiplomaticFactions(
  galaxy: Galaxy,
  player: Player
): BotStrategicDiplomaticFactionSnapshot[] {
  const diplomacyResolver = new DiplomacyResolver(galaxy.diplomaticRelations);

  return galaxy.players
    .filter((foreignPlayer) =>
      foreignPlayer.playerId !== player.playerId
      && foreignPlayer.type !== PlayerType.NEUTRAL
    )
    .map((foreignPlayer) => {
      const knownReports = foreignPlayer.planets
        .map((planet) => planet.lastReportData.get(player.playerId) ?? null)
        .filter((report): report is EspionageReportData => report !== null);
      if (knownReports.length <= 0) {
        return null;
      }

      const pendingIncomingRequestedStatuses = galaxy.diplomaticProposals
        .filter((proposal) =>
          proposal.state === DiplomaticProposalState.PENDING
          && proposal.fromPlayerId === foreignPlayer.playerId
          && proposal.toPlayerId === player.playerId
        )
        .map((proposal) => proposal.requestedStatus);
      const pendingOutgoingRequestedStatuses = galaxy.diplomaticProposals
        .filter((proposal) =>
          proposal.state === DiplomaticProposalState.PENDING
          && proposal.fromPlayerId === player.playerId
          && proposal.toPlayerId === foreignPlayer.playerId
        )
        .map((proposal) => proposal.requestedStatus);
      const pendingIncomingSupportRequests = galaxy.supportRequests
        .filter((request) =>
          request.state === DiplomaticProposalState.PENDING
          && request.fromPlayerId === foreignPlayer.playerId
          && request.toPlayerId === player.playerId
          && (request.supportType === 'PLANET_REPAIR' || request.supportType === 'PLANET_DEFENSE')
        )
        .map((request) => ({
          supportType: request.supportType,
          targetCoordinates: { ...request.targetCoordinates },
          createdTurn: request.createdTurn,
          expiresOnTurn: request.expiresOnTurn
        } satisfies BotStrategicDiplomaticSupportRequestSnapshot))
        .sort((left, right) =>
          left.supportType.localeCompare(right.supportType)
          || left.createdTurn - right.createdTurn
          || left.targetCoordinates.x - right.targetCoordinates.x
          || left.targetCoordinates.y - right.targetCoordinates.y
          || left.targetCoordinates.z - right.targetCoordinates.z
        );
      const knownPlanets = foreignPlayer.planets
        .map((planet) => {
          const report = planet.lastReportData.get(player.playerId) ?? null;
          if (!report) {
            return null;
          }

          const latestBattleObservation = resolveLatestBattleObservation(player, planet);
          const latestPlunderObservation = resolveLatestPlunderObservation(player, planet);
          const adaptiveTechnologyLevel = report.techLevels.get(TechnologyType.ADAPTIVE_TECHNOLOGY)
            ?? foreignPlayer.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY)
            ?? 0;
          const knownShipCountsByType = resolveKnownShipCountsForStrategicMilitary(report, latestBattleObservation);
          const knownDefenceCountsByType = resolveKnownDefenceCountsForStrategicMilitary(report, latestBattleObservation);

          return {
            coordinates: {
              x: planet.basicInfo.solarSystem.coordinates.x,
              y: planet.basicInfo.solarSystem.coordinates.y,
              z: planet.basicInfo.order
            },
            intelDepth: resolveEspionageIntelDepth(report),
            lastRelevantReportAge: Math.max(0, galaxy.currentTurn - report.createdTurn),
            anomaliesAndNoise: report.planetaryParameters.anomaliesAndNoise,
            averageBuildingLevel: report.averageBuildingLevel,
            averageTechLevel: report.averageTechLevel,
            totalShipsAmount: sumCountsByType(knownShipCountsByType),
            totalDefencesAmount: sumCountsByType(knownDefenceCountsByType),
            knownShipCountsByType,
            knownDefenceCountsByType,
            currentResources: {
              metal: Math.max(0, Math.floor(report.resourcesAmount.metal)),
              crystal: Math.max(0, Math.floor(report.resourcesAmount.crystal)),
              deuterium: Math.max(0, Math.floor(report.resourcesAmount.deuterium))
            },
            storageCapacity: resolveReportedStorageCapacity(report),
            income: resolveReportedIncome(report, adaptiveTechnologyLevel),
            bunkerLevel: report.buildingsLevels.get(BuildingType.BUNKER_NETWORK) ?? null,
            recentBattleReportCount: countRecentBattleReportsForCoordinates(
              player,
              {
                x: planet.basicInfo.solarSystem.coordinates.x,
                y: planet.basicInfo.solarSystem.coordinates.y,
                z: planet.basicInfo.order
              },
              galaxy.currentTurn,
              80
            ),
            lastCombatObservationTurn: latestBattleObservation?.turn ?? null,
            lastPlunderTurn: latestPlunderObservation?.turn ?? null,
            latestPlunderedResources: latestPlunderObservation?.stolenResources ?? null
          } satisfies BotStrategicDiplomaticKnownPlanetSnapshot;
        })
        .filter((entry): entry is BotStrategicDiplomaticKnownPlanetSnapshot => entry !== null)
        .sort((left, right) =>
          left.lastRelevantReportAge - right.lastRelevantReportAge
          || right.intelDepth - left.intelDepth
          || left.coordinates.x - right.coordinates.x
          || left.coordinates.y - right.coordinates.y
          || left.coordinates.z - right.coordinates.z
        );

      return {
        playerId: foreignPlayer.playerId,
        playerName: foreignPlayer.playerName,
        playerType: foreignPlayer.type,
        currentStatus: diplomacyResolver.getStatus(player.playerId, foreignPlayer.playerId),
        totalPlanetCount: foreignPlayer.planets.length,
        knownPlanetCount: knownReports.length,
        averageKnownBuildingLevel: averageNumber(knownReports.map((report) => report.averageBuildingLevel)),
        averageKnownTechLevel: averageNumber(knownReports.map((report) => report.averageTechLevel)),
        averageKnownShipsAmount: averageNumber(knownReports.map((report) => report.totalShipsAmount)),
        averageKnownDefencesAmount: averageNumber(knownReports.map((report) => report.totalDefencesAmount)),
        bestIntelDepth: knownReports.reduce((best, report) => Math.max(best, resolveEspionageIntelDepth(report)), 0),
        lastRelevantReportAge: knownReports.reduce<number | null>((best, report) => {
          const age = Math.max(0, galaxy.currentTurn - report.createdTurn);
          return best === null ? age : Math.min(best, age);
        }, null),
        recentBattleReportCount: countRecentBattleReportsForFaction(player, foreignPlayer, galaxy.currentTurn, 80),
        pendingIncomingRequestedStatuses,
        pendingOutgoingRequestedStatuses,
        pendingIncomingSupportRequests,
        knownPlanets
      } satisfies BotStrategicDiplomaticFactionSnapshot;
    })
    .filter((entry): entry is BotStrategicDiplomaticFactionSnapshot => entry !== null)
    .sort((left, right) =>
      left.currentStatus.localeCompare(right.currentStatus)
      || right.totalPlanetCount - left.totalPlanetCount
      || left.playerId - right.playerId
    );
}

function resolveSystemScanRadiusDistance(
  left: { x: number; y: number },
  right: { x: number; y: number }
): number {
  return Math.max(
    Math.abs(left.x - right.x),
    Math.abs(left.y - right.y)
  );
}

function resolveColonizationScore(candidate: {
  size: number;
  industryModifier: number;
  metalModifier: number;
  crystalModifier: number;
  deuteriumModifier: number;
}): number {
  const positiveIndustry = Math.max(0, candidate.industryModifier - 1);
  const positiveResourceSpread = (
    Math.max(0, candidate.metalModifier - 1)
    + Math.max(0, candidate.crystalModifier - 1)
    + Math.max(0, candidate.deuteriumModifier - 1)
  );

  return (
    candidate.size
    + (positiveIndustry * 200)
    + (positiveResourceSpread * 150)
  );
}

function resolveEspionageIntelDepth(report: EspionageReportData): number {
  let depth = 0;
  if (report.averageBuildingLevel > 0) {
    depth += 1;
  }
  if (report.averageTotalResources > 0) {
    depth += 1;
  }
  if (report.averageTechLevel > 0) {
    depth += 1;
  }
  if (report.totalDefencesAmount > 0 || report.totalShipsAmount > 0) {
    depth += 1;
  }
  if (report.buildingsLevels.size > 0) {
    depth += 2;
  }
  if (report.resourcesAmount.getTotalResourceAmount() > 0) {
    depth += 2;
  }
  if (report.techLevels.size > 0) {
    depth += 2;
  }
  if (report.defences.length > 0) {
    depth += 2;
  }
  if (report.ships.size > 0) {
    depth += 2;
  }
  return Math.max(0, Math.min(14, depth));
}

function countRecentBattleReportsForFaction(
  player: Player,
  foreignPlayer: Player,
  currentTurn: number,
  windowTurns: number
): number {
  const factionCoordinates = new Set(
    foreignPlayer.planets.map((planet) =>
      `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`
    )
  );
  let count = 0;

  for (const report of player.reports) {
    if (
      report.reportType !== ReportType.FLEET_REPORT
      || !report.title.startsWith('Battle Report:')
      || !report.sourceCoordinates
      || Math.max(0, currentTurn - report.createdTurn) > windowTurns
    ) {
      continue;
    }

    const key = `${report.sourceCoordinates.x}:${report.sourceCoordinates.y}:${report.sourceCoordinates.z}`;
    if (factionCoordinates.has(key)) {
      count += 1;
    }
  }

  return count;
}

function countRecentBattleReportsForCoordinates(
  player: Player,
  coordinates: { x: number; y: number; z: number },
  currentTurn: number,
  windowTurns: number
): number {
  let count = 0;

  for (const report of player.reports) {
    if (
      report.reportType !== ReportType.FLEET_REPORT
      || !report.title.startsWith('Battle Report:')
      || !report.sourceCoordinates
      || Math.max(0, currentTurn - report.createdTurn) > windowTurns
    ) {
      continue;
    }

    if (
      report.sourceCoordinates.x === coordinates.x
      && report.sourceCoordinates.y === coordinates.y
      && report.sourceCoordinates.z === coordinates.z
    ) {
      count += 1;
    }
  }

  return count;
}

function averageNumber(values: number[]): number {
  if (values.length <= 0) {
    return 0;
  }

  const sum = values.reduce((accumulator, value) =>
    accumulator + (Number.isFinite(value) ? value : 0), 0
  );
  return sum / values.length;
}

function resolveLastFleetReportTurn(
  player: Player,
  planet: Planet,
  titlePrefix: string
): number | null {
  const coordinates = {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: planet.basicInfo.order
  };
  let latestTurn: number | null = null;

  for (const report of player.reports) {
    if (
      report.reportType !== ReportType.FLEET_REPORT
      || !report.title.startsWith(titlePrefix)
      || report.sourceCoordinates?.x !== coordinates.x
      || report.sourceCoordinates?.y !== coordinates.y
      || report.sourceCoordinates?.z !== coordinates.z
    ) {
      continue;
    }

    if (latestTurn === null || report.createdTurn > latestTurn) {
      latestTurn = report.createdTurn;
    }
  }

  return latestTurn;
}

function resolveLatestBattleObservation(
  player: Player,
  planet: Planet
): {
  turn: number;
  survivingShipsByType: Partial<Record<ShipType, number>>;
  survivingDefencesByType: Partial<Record<DefenceType, number>>;
} | null {
  const latestReport = resolveLatestFleetReport(player, planet, 'Battle Report:');
  if (!latestReport?.body) {
    return null;
  }

  const survivingShipsLine = latestReport.body.split('\n')
    .find((line) => line.startsWith('Enemy survivors by type:'))
    ?? null;
  const survivingDefencesLine = latestReport.body.split('\n')
    .find((line) => line.startsWith('Enemy defense survivors by type:'))
    ?? null;

  return {
    turn: latestReport.createdTurn,
    survivingShipsByType: parseTypedCountSummary<ShipType>(survivingShipsLine, 'Enemy survivors by type:'),
    survivingDefencesByType: parseTypedCountSummary<DefenceType>(survivingDefencesLine, 'Enemy defense survivors by type:')
  };
}

function resolveLatestPlunderObservation(
  player: Player,
  planet: Planet
): {
  turn: number;
  stolenResources: { metal: number; crystal: number; deuterium: number };
} | null {
  const latestReport = resolveLatestFleetReport(player, planet, 'Plunder Report:');
  if (!latestReport?.body) {
    return null;
  }

  const resourcesLine = latestReport.body.split('\n')
    .find((line) => line.startsWith('Resources stolen: '))
    ?? null;
  if (!resourcesLine) {
    return {
      turn: latestReport.createdTurn,
      stolenResources: {
        metal: 0,
        crystal: 0,
        deuterium: 0
      }
    };
  }

  const match = resourcesLine.match(/Resources stolen: Metal (\d+), Crystal (\d+), Deuterium (\d+)\./);
  if (!match) {
    return {
      turn: latestReport.createdTurn,
      stolenResources: {
        metal: 0,
        crystal: 0,
        deuterium: 0
      }
    };
  }

  return {
    turn: latestReport.createdTurn,
    stolenResources: {
      metal: Math.max(0, Number.parseInt(match[1] ?? '0', 10)),
      crystal: Math.max(0, Number.parseInt(match[2] ?? '0', 10)),
      deuterium: Math.max(0, Number.parseInt(match[3] ?? '0', 10))
    }
  };
}

function resolveLatestFleetReport(
  player: Player,
  planet: Planet,
  titlePrefix: string
): { createdTurn: number; body: string } | null {
  const coordinates = {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: planet.basicInfo.order
  };
  let latestReport: { createdTurn: number; body: string } | null = null;

  for (const report of player.reports) {
    if (
      report.reportType !== ReportType.FLEET_REPORT
      || !report.title.startsWith(titlePrefix)
      || report.sourceCoordinates?.x !== coordinates.x
      || report.sourceCoordinates?.y !== coordinates.y
      || report.sourceCoordinates?.z !== coordinates.z
      || typeof (report as { body?: unknown }).body !== 'string'
    ) {
      continue;
    }

    if (latestReport === null || report.createdTurn > latestReport.createdTurn) {
      latestReport = {
        createdTurn: report.createdTurn,
        body: (report as { body: string }).body
      };
    }
  }

  return latestReport;
}

function parseTypedCountSummary<T extends string>(
  line: string | null,
  prefix: string
): Partial<Record<T, number>> {
  if (!line || !line.startsWith(prefix)) {
    return {};
  }

  const summary = line.slice(prefix.length).trim();
  if (summary === 'none') {
    return {};
  }

  const counts: Partial<Record<T, number>> = {};
  for (const entry of summary.split(', ')) {
    const match = entry.match(/^(.*) x(\d+)$/);
    if (!match) {
      continue;
    }

    const key = (match[1] ?? '').trim() as T;
    const amount = Number.parseInt(match[2] ?? '0', 10);
    if (!key || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    counts[key] = amount;
  }

  return counts;
}

function resolveKnownShipCountsForStrategicMilitary(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>,
  latestBattleObservation: ReturnType<typeof resolveLatestBattleObservation>
): Partial<Record<ShipType, number>> {
  if (latestBattleObservation && latestBattleObservation.turn > report.createdTurn) {
    return latestBattleObservation.survivingShipsByType;
  }

  return Object.fromEntries(report.ships.entries()) as Partial<Record<ShipType, number>>;
}

function resolveKnownDefenceCountsForStrategicMilitary(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>,
  latestBattleObservation: ReturnType<typeof resolveLatestBattleObservation>
): Partial<Record<DefenceType, number>> {
  if (latestBattleObservation && latestBattleObservation.turn > report.createdTurn) {
    return latestBattleObservation.survivingDefencesByType;
  }

  return Object.fromEntries(
    report.defences.map((entry) => [entry.type, entry.amount] satisfies [DefenceType, number])
  ) as Partial<Record<DefenceType, number>>;
}

function sumCountsByType<T extends string>(counts: Partial<Record<T, number>>): number {
  return Object.values(counts).reduce((sum, value) => sum + Math.max(0, value ?? 0), 0);
}

function resolveReportedStorageCapacity(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>
): {
  metal: number;
  crystal: number;
  deuterium: number;
} {
  return {
    metal: Math.max(1, resolveReportedBuildingProductionValue1(report, BuildingType.METAL_STORAGE)),
    crystal: Math.max(1, resolveReportedBuildingProductionValue1(report, BuildingType.CRYSTAL_STORAGE)),
    deuterium: Math.max(1, resolveReportedBuildingProductionValue1(report, BuildingType.DEUTERIUM_TANK))
  };
}

function resolveReportedBunkerReductionPercent(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>
): number {
  return Math.max(0, resolveReportedBuildingProductionValue1(report, BuildingType.BUNKER_NETWORK));
}

function resolveReportedIncome(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>,
  adaptiveTechnologyLevel: number
): {
  metal: number;
  crystal: number;
  deuterium: number;
} {
  const adaptiveMultiplier = 1 + (Math.max(0, adaptiveTechnologyLevel) / 100);
  return {
    metal: Math.max(
      0,
      Math.floor(
        resolveReportedBuildingProductionValue1(report, BuildingType.METAL_MINE)
        * adaptiveMultiplier
        * report.planetaryParameters.metalModifier
      )
    ),
    crystal: Math.max(
      0,
      Math.floor(
        resolveReportedBuildingProductionValue1(report, BuildingType.CRYSTAL_MINE)
        * adaptiveMultiplier
        * report.planetaryParameters.crystalModifier
      )
    ),
    deuterium: Math.max(
      0,
      Math.floor(
        resolveReportedBuildingProductionValue1(report, BuildingType.DEUTERIUM_SYNTHESIZER)
        * adaptiveMultiplier
        * report.planetaryParameters.deuteriumModifier
      )
    )
  };
}

function resolveReportedBuildingProductionValue1(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>,
  buildingType: BuildingType
): number {
  const level = report.buildingsLevels.get(buildingType) ?? 0;
  if (level <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  if (!blueprint) {
    return 0;
  }

  const value = blueprint.production1[level - 1];
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function resolveBunkerReductionPercent(planet: Planet): number {
  const bunkerLevel = planet.getBuildingLevel(BuildingType.BUNKER_NETWORK);
  if (bunkerLevel <= 0) {
    return 0;
  }

  const bunkerBlueprint = BUILDING_BLUEPRINTS.get(BuildingType.BUNKER_NETWORK);
  const rawValue = bunkerBlueprint?.production1[bunkerLevel - 1] ?? 0;
  return Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
}
