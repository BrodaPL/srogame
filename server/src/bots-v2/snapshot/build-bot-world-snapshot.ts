import * as buildingTypeModule from '../../../../src/app/models/enums/building-type.js';
import * as defenceTypeModule from '../../../../src/app/models/enums/defence-type.js';
import * as fleetMissionTypeModule from '../../../../src/app/models/enums/fleet-mission-type.js';
import * as planetTypeModule from '../../../../src/app/models/enums/planet-type.js';
import * as playerTypeModule from '../../../../src/app/models/enums/player-type.js';
import * as reportTypeModule from '../../../../src/app/models/enums/report-type.js';
import * as shipTypeModule from '../../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../../src/app/models/enums/technology-type.js';
import * as diplomaticProposalStateModule from '../../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import * as diplomaticStatusModule from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import * as diplomacyResolverModule from '../../../../src/app/models/diplomacy/diplomacy-resolver.js';
import * as manyDefencesModule from '../../../../src/app/models/defences/many-defences.js';
import * as manyShipsModule from '../../../../src/app/models/fleets/many-ships.js';
import * as technologyEffectsModule from '../../../../src/app/models/tech/technology-effects.js';
import * as repairDroneProductionModule from '../../../../src/app/models/turns/repair-drone-production.js';
import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../../src/app/models/player.ts';
import type {
  BotEmpireSnapshot,
  BotIntelCandidateSnapshot,
  BotPlanetMaturityStage,
  BotPlanetSnapshot,
  BotStrategicDiplomaticFactionSnapshot,
  BotStrategicDiplomaticSharedHostileEventSnapshot,
  BotStrategicDiplomaticKnownPlanetSnapshot,
  BotStrategicDiplomaticSupportRequestSnapshot,
  BotStrategicMilitaryTargetSnapshot,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import { resolveInfrastructureDamageSummary } from '../infrastructure-damage.js';
import type { EspionageReportData } from '../../../../src/app/models/reports/espionage-report-data.ts';
import {
  BUILDING_BLUEPRINTS,
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS,
  calculateMaxBuildingQueueLength,
  calculateMaxShipyardQueueLength,
  countPlanetaryBombs,
  isPlanetaryBombDefenceType
} from '../../game-commands/command-helpers.js';
import { resolveModule } from '../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../src/app/models/enums/building-type.js');
const { DefenceType } = resolveModule(defenceTypeModule) as typeof import('../../../../src/app/models/enums/defence-type.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeModule) as typeof import('../../../../src/app/models/enums/fleet-mission-type.js');
const { PlanetType } = resolveModule(planetTypeModule) as typeof import('../../../../src/app/models/enums/planet-type.js');
const { PlayerType } = resolveModule(playerTypeModule) as typeof import('../../../../src/app/models/enums/player-type.js');
const { ReportType } = resolveModule(reportTypeModule) as typeof import('../../../../src/app/models/enums/report-type.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../src/app/models/enums/technology-type.js');
const { DiplomaticProposalState } = resolveModule(diplomaticProposalStateModule) as typeof import('../../../../src/app/models/diplomacy/diplomatic-proposal-state.js');
const { DiplomaticStatus } = resolveModule(diplomaticStatusModule) as typeof import('../../../../src/app/models/diplomacy/diplomatic-status.js');
const { DiplomacyResolver } = resolveModule(diplomacyResolverModule) as typeof import('../../../../src/app/models/diplomacy/diplomacy-resolver.js');
const { ManyDefences } = resolveModule(manyDefencesModule) as typeof import('../../../../src/app/models/defences/many-defences.js');
const { ManyShips } = resolveModule(manyShipsModule) as typeof import('../../../../src/app/models/fleets/many-ships.js');
const {
  industryPowerMultiplier,
  maxActiveFleets,
  researchPowerMultiplier
} = resolveModule(technologyEffectsModule) as typeof import('../../../../src/app/models/tech/technology-effects.js');
const {
  calculateRepairDroneProductionBasePower,
  routeRepairDroneProduction
} = resolveModule(repairDroneProductionModule) as typeof import('../../../../src/app/models/turns/repair-drone-production.js');

const ALL_BUILDING_TYPES = Array.from(BUILDING_BLUEPRINTS.buildingsMap.keys());
const SHARED_HOSTILE_EVENT_REPORT_WINDOW = 40;

export function buildBotWorldSnapshot(
  galaxy: Galaxy,
  player: Player,
  flags: BotV2FeatureFlags
): BotWorldSnapshot {
  const planets = player.planets.map((planet) => buildPlanetSnapshot(planet, player, galaxy.currentTurn));
  const empire = buildEmpireSnapshot(galaxy, player, planets);
  annotateKnownWarDiscovery(planets, player, galaxy);

  return {
    turn: galaxy.currentTurn,
    playerId: player.playerId,
    playerName: player.playerName,
    profileId: player.botProfileId,
    planets,
    empire,
    flags: {
      shadowMode: flags.mode === 'SHADOW',
      currentBotStillExecutes: flags.mode !== 'LIVE',
      mode: flags.mode
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
    activeStrategicDevelopmentLogisticsFleetCount: activeFleets.filter((fleet) =>
      fleet.missionType === FleetMissionType.TRANSPORT
      || fleet.missionType === FleetMissionType.ARMAMENT_DELIVERY
    ).length,
    maxActiveFleetCount: maxActiveFleets(computerTechnologyLevel),
    activeColonizeFleetCount: activeFleets.filter((fleet) => fleet.missionType === FleetMissionType.COLONIZE).length,
    activeRecycleFleetCount: activeFleets.filter((fleet) => fleet.missionType === FleetMissionType.RECYCLE).length,
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
  const gravitonTechnologyLevel = player.getTechLevel(TechnologyType.GRAVITON_TECHNOLOGY);
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
  const buildingDamageSummary = resolveInfrastructureDamageSummary(planet);
  const bunkerLevel = planet.getBuildingLevel(BuildingType.BUNKER_NETWORK);
  const recentHostileAttackCountLast20Turns = resolveRecentHostileAttackCountLast100Turns(
    player,
    planet,
    currentTurn,
    20
  );
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
      astrophysicsTechnologyLevel,
      gravitonTechnologyLevel
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
      isResearchHelper: planet.rBDSFTQ.researchHelperFor !== null,
      queuedBuildingTypes: planet.rBDSFTQ.buildingQueue.map((entry) => entry.buildingType),
      queuedDefenceTypes: planet.rBDSFTQ.shipyardQueue
        .filter((entry) => entry.itemKind === 'defence' && entry.defenceType !== null)
        .map((entry) => entry.defenceType as DefenceType),
      queuedShipTypes: planet.rBDSFTQ.shipyardQueue
        .filter((entry) => entry.itemKind === 'ship' && entry.shipType !== null)
        .map((entry) => entry.shipType as ShipType),
      shipsCompletingNextTurnByType: resolveShipsCompletingNextTurnByType(planet, shipyardPower),
      currentResearchType: planet.rBDSFTQ.currentResearchQueue?.technologyType ?? null
    },
    defense: {
      bunkerLevel,
      avgIndustryLevel: resolveAverageIndustryLevel(planet),
      planetSize: planet.basicInfo.size,
      knownByWarFaction: false,
      recentHostileAttackCountLast20Turns,
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
    spaceDebris: {
      metal: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.metal)),
      crystal: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.crystal)),
      deuterium: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.deuterium))
    },
    blockers: {
      energyStarved: energyGap > 0,
      storageBlocked: Math.max(storagePressure.metal, storagePressure.crystal, storagePressure.deuterium) >= 0.95,
      queueSaturated,
      missingRoboticsForGrowth: averageMineLevel >= 2 && planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY) <= 0
    }
  };
}

function annotateKnownWarDiscovery(
  snapshots: BotPlanetSnapshot[],
  player: Player,
  galaxy: Galaxy
): void {
  const warPlayerIds = new Set<number>();
  for (const relation of galaxy.diplomaticRelations) {
    if (relation.status !== DiplomaticStatus.WAR) {
      continue;
    }
    if (relation.playerAId === player.playerId) {
      warPlayerIds.add(relation.playerBId);
    } else if (relation.playerBId === player.playerId) {
      warPlayerIds.add(relation.playerAId);
    }
  }
  if (warPlayerIds.size === 0) {
    return;
  }

  for (let index = 0; index < player.planets.length; index += 1) {
    const livePlanet = player.planets[index];
    const snapshot = snapshots[index];
    if (!livePlanet || !snapshot) {
      continue;
    }

    snapshot.defense.knownByWarFaction = Array.from(livePlanet.lastReportData.keys())
      .some((viewerPlayerId) => warPlayerIds.has(viewerPlayerId));
  }
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
    if (
      entry.itemKind === 'defence'
      && entry.defenceType
      && isPlanetaryBombDefenceType(entry.defenceType)
      && countPlanetaryBombs(planet.rBDSFTQ.defences) >= planet.getBuildingProductionValue1(BuildingType.BOMB_DEPOT)
    ) {
      break;
    }

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

function resolveShipsCompletingNextTurnByType(
  planet: Planet,
  shipyardPower: number
): Partial<Record<ShipType, number>> {
  const completing: Partial<Record<ShipType, number>> = {};
  let remainingShipyardPower = Math.max(0, Math.floor(shipyardPower));
  if (remainingShipyardPower <= 0) {
    return completing;
  }

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
    const remainingRequiredPower = Math.max(0, totalRequiredPower - entry.investedShipyardPower);
    if (remainingRequiredPower > remainingShipyardPower) {
      break;
    }

    remainingShipyardPower -= remainingRequiredPower;
    if (entry.itemKind === 'ship' && entry.shipType) {
      completing[entry.shipType] = (completing[entry.shipType] ?? 0) + Math.max(0, Math.floor(entry.amount));
    }
  }

  return completing;
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

        if (planet.basicInfo.size < 110) {
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
  const ownedSystems = new Set(player.planets.map((planet) =>
    `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}`));
  const homeSystemKey = player.planets[0]
    ? `${player.planets[0].basicInfo.solarSystem.coordinates.x}:${player.planets[0].basicInfo.solarSystem.coordinates.y}`
    : null;

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
        const systemKey = `${system.coordinates.x}:${system.coordinates.y}`;
        const owner = planet.info.ownerId === null
          ? null
          : galaxy.players.find((entry) => entry.playerId === planet.info.ownerId) ?? null;
        const reportTurn = report?.createdTurn ?? null;
        const spyCombatIntelEnough = report !== null && (
          (report.hasTotalDefencesIntel || report.defences.length > 0)
          && (report.hasTotalShipsIntel || report.ships.size > 0)
        );
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
        const targetCoordinatesMatch = (coordinates: { x: number; y: number; z: number } | null | undefined) =>
          coordinates?.x === system.coordinates.x
          && coordinates?.y === system.coordinates.y
          && (coordinates?.z + 1) === planet.basicInfo.order;
        const hasForeignGuard = galaxy.activeFleets.some((fleet) =>
          fleet.ownerId !== player.playerId
          && targetCoordinatesMatch(fleet.target)
          && fleet.state === 'ORBITING'
        );
        const hasOwnActiveFarmMission = galaxy.activeFleets.some((fleet) =>
          fleet.ownerId === player.playerId
          && targetCoordinatesMatch(fleet.target)
          && (
            fleet.missionType === FleetMissionType.SPY
            || fleet.missionType === FleetMissionType.ATTACK
          )
        );
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
          inOwnedSystem: ownedSystems.has(systemKey),
          inHomeSystem: homeSystemKey === systemKey,
          neverScanned: report === null,
          hasEspionageReport: report !== null,
          spyCombatIntelEnough,
          reportAge,
          reportTurn,
          needsScan: report === null,
          isNeutral: owner?.type === PlayerType.NEUTRAL,
          hasForeignGuard,
          hasOwnActiveFarmMission,
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
          combatObservationTurn: latestBattleObservation?.turn ?? reportTurn,
          spaceDebris: {
            metal: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.metal)),
            crystal: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.crystal)),
            deuterium: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.deuterium))
          }
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
  type DiplomaticFactionDraft = BotStrategicDiplomaticFactionSnapshot & {
    recentBattleReportCountShort: number;
    recentBattleReportCountLong: number;
  };

  const factionDrafts = galaxy.players
    .filter((foreignPlayer) =>
      foreignPlayer.playerId !== player.playerId
      && foreignPlayer.type !== PlayerType.NEUTRAL
    )
    .map((foreignPlayer): DiplomaticFactionDraft | null => {
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
      const pendingIncomingDiplomacyProposals = galaxy.diplomaticProposals
        .filter((proposal) =>
          proposal.state === DiplomaticProposalState.PENDING
          && proposal.fromPlayerId === foreignPlayer.playerId
          && proposal.toPlayerId === player.playerId
        )
        .map((proposal) => ({
          proposalId: proposal.proposalId,
          fromPlayerId: proposal.fromPlayerId,
          toPlayerId: proposal.toPlayerId,
          requestedStatus: proposal.requestedStatus,
          createdTurn: proposal.createdTurn,
          expiresOnTurn: proposal.expiresOnTurn
        }))
        .sort((left, right) =>
          left.expiresOnTurn - right.expiresOnTurn
          || left.proposalId - right.proposalId
        );
      const pendingOutgoingRequestedStatuses = galaxy.diplomaticProposals
        .filter((proposal) =>
          proposal.state === DiplomaticProposalState.PENDING
          && proposal.fromPlayerId === player.playerId
          && proposal.toPlayerId === foreignPlayer.playerId
        )
        .map((proposal) => proposal.requestedStatus);
      const pendingOutgoingDiplomacyProposals = galaxy.diplomaticProposals
        .filter((proposal) =>
          proposal.state === DiplomaticProposalState.PENDING
          && proposal.fromPlayerId === player.playerId
          && proposal.toPlayerId === foreignPlayer.playerId
        )
        .map((proposal) => ({
          proposalId: proposal.proposalId,
          fromPlayerId: proposal.fromPlayerId,
          toPlayerId: proposal.toPlayerId,
          requestedStatus: proposal.requestedStatus,
          createdTurn: proposal.createdTurn,
          expiresOnTurn: proposal.expiresOnTurn
        }))
        .sort((left, right) =>
          left.expiresOnTurn - right.expiresOnTurn
          || left.proposalId - right.proposalId
        );
      const pendingIncomingJumpGateRequests = galaxy.jumpGateRequests
        .filter((request) =>
          request.state === DiplomaticProposalState.PENDING
          && request.fromPlayerId === foreignPlayer.playerId
          && request.toPlayerId === player.playerId
        )
        .map((request) => ({
          requestId: request.requestId,
          fleetId: request.fleetId,
          missionType: request.missionType,
          originCoordinates: { ...request.originCoordinates },
          targetCoordinates: { ...request.targetCoordinates },
          totalShips: request.totalShips,
          createdTurn: request.createdTurn,
          expiresOnTurn: request.expiresOnTurn
        }))
        .sort((left, right) =>
          left.createdTurn - right.createdTurn
          || left.requestId - right.requestId
        );
      const pendingIncomingMaintenanceRequests = galaxy.maintenanceRequests
        .filter((request) =>
          request.state === DiplomaticProposalState.PENDING
          && request.fromPlayerId === foreignPlayer.playerId
          && request.toPlayerId === player.playerId
        )
        .map((request) => ({
          requestId: request.requestId,
          fleetId: request.fleetId,
          targetCoordinates: { ...request.targetCoordinates },
          createdTurn: request.createdTurn,
          expiresOnTurn: request.expiresOnTurn,
          requested: {
            fuel: request.requested.fuel,
            ships: request.requested.ships.map((entry) => ({ ...entry })),
            bombs: request.requested.bombs.map((entry) => ({ ...entry }))
          }
        }))
        .sort((left, right) =>
          left.createdTurn - right.createdTurn
          || left.requestId - right.requestId
        );
      const pendingIncomingSupportRequests = galaxy.supportRequests
        .filter((request) =>
          request.state === DiplomaticProposalState.PENDING
          && request.fromPlayerId === foreignPlayer.playerId
          && request.toPlayerId === player.playerId
        )
        .map((request) => ({
          requestId: request.requestId,
          supportType: request.supportType,
          targetCoordinates: { ...request.targetCoordinates },
          createdTurn: request.createdTurn,
          expiresOnTurn: request.expiresOnTurn,
          requestedResources: request.supportType === 'RESOURCE_SUPPORT'
            ? {
              metal: request.requestedResources.metal,
              crystal: request.requestedResources.crystal,
              deuterium: request.requestedResources.deuterium
            }
            : null,
          missionType: request.supportType === 'ATTACK_TARGET'
            || request.supportType === 'BOMBARD_TARGET'
            || request.supportType === 'SIEGE_TARGET'
            ? request.missionType
            : null,
          minimumShips: request.supportType === 'ATTACK_TARGET'
            || request.supportType === 'BOMBARD_TARGET'
            || request.supportType === 'SIEGE_TARGET'
            ? request.minimumShips.map((entry) => ({
              type: entry.type,
              amount: entry.amount
            }))
            : []
        } satisfies BotStrategicDiplomaticSupportRequestSnapshot))
        .sort((left, right) =>
          left.supportType.localeCompare(right.supportType)
          || left.createdTurn - right.createdTurn
          || left.targetCoordinates.x - right.targetCoordinates.x
          || left.targetCoordinates.y - right.targetCoordinates.y
          || left.targetCoordinates.z - right.targetCoordinates.z
        );
      const outgoingCoercion = resolveRecentOutgoingCoercionForFaction(
        player,
        foreignPlayer,
        galaxy.currentTurn
      );
      const recentWarValueSignals = resolveRecentWarValueSignalsForFaction(
        player,
        foreignPlayer,
        galaxy.currentTurn
      );
      const sharedHostileEvents = resolveSharedHostileEventsForFaction(
        galaxy,
        player,
        foreignPlayer,
        diplomacyResolver
      );
      const recentBattleReportCountShort = countRecentBattleReportsForFaction(player, foreignPlayer, galaxy.currentTurn, 20);
      const recentBattleReportCountLong = countRecentBattleReportsForFaction(player, foreignPlayer, galaxy.currentTurn, 100);
      const knownPlanets = foreignPlayer.planets
        .map((planet): BotStrategicDiplomaticKnownPlanetSnapshot | null => {
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
            allianceDepotLevel: report.buildingsLevels.get(BuildingType.ALLIANCE_DEPOT) ?? null,
            jumpGateLevel: report.buildingsLevels.get(BuildingType.JUMP_GATE) ?? null,
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
            latestPlunderedResources: latestPlunderObservation?.stolenResources ?? null,
            spaceDebris: {
              metal: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.metal)),
              crystal: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.crystal)),
              deuterium: Math.max(0, Math.floor(planet.rBDSFTQ.spaceDebris.deuterium))
            }
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
        recentBattleReportCountShort,
        recentBattleReportCountLong,
        recentOutgoingCoercionPressureShort: outgoingCoercion.shortPressure,
        recentOutgoingCoercionPressureLong: outgoingCoercion.longPressure,
        recentIncomingCoercionPressureShort: 0,
        recentIncomingCoercionPressureLong: 0,
        recentOutgoingShipLossValueShort: recentWarValueSignals.outgoingShipLossValueShort,
        recentIncomingShipLossValueShort: recentWarValueSignals.incomingShipLossValueShort,
        recentOutgoingPlunderValueShort: recentWarValueSignals.outgoingPlunderValueShort,
        recentIncomingPlunderValueShort: recentWarValueSignals.incomingPlunderValueShort,
        recentOutgoingDamagePercentShort: outgoingCoercion.shortDamagePercent,
        recentOutgoingDamagePercentLong: outgoingCoercion.longDamagePercent,
        recentIncomingDamagePercentShort: 0,
        recentIncomingDamagePercentLong: 0,
        lastSuccessfulOutgoingBombardTurn: outgoingCoercion.lastSuccessfulBombardTurn,
        lastSuccessfulOutgoingSiegeTurn: outgoingCoercion.lastSuccessfulSiegeTurn,
        sharedHostileEvents,
        pendingIncomingRequestedStatuses,
        pendingOutgoingRequestedStatuses,
        pendingIncomingDiplomacyProposals,
        pendingOutgoingDiplomacyProposals,
        pendingIncomingJumpGateRequests,
        pendingIncomingMaintenanceRequests,
        pendingIncomingSupportRequests,
        knownPlanets
      };
    })
    .filter((entry): entry is DiplomaticFactionDraft => entry !== null);

  const ownShortDamagePercent = resolveOwnRecentStructuralDamagePercent(player, galaxy.currentTurn, 20);
  const ownLongDamagePercent = resolveOwnRecentStructuralDamagePercent(player, galaxy.currentTurn, 100);
  const activeWarDrafts = factionDrafts.filter((entry) => entry.currentStatus === DiplomaticStatus.WAR);
  const totalShortWarActivity = activeWarDrafts.reduce((sum, entry) =>
    sum + Math.max(1, entry.recentBattleReportCountShort), 0);
  const totalLongWarActivity = activeWarDrafts.reduce((sum, entry) =>
    sum + Math.max(1, entry.recentBattleReportCountLong), 0);

  return factionDrafts
    .map((entry) => {
      if (entry.currentStatus !== DiplomaticStatus.WAR || activeWarDrafts.length <= 0) {
        const { recentBattleReportCountShort: _short, recentBattleReportCountLong: _long, ...rest } = entry;
        return rest satisfies BotStrategicDiplomaticFactionSnapshot;
      }

      const shortShareBase = totalShortWarActivity > 0
        ? Math.max(1, entry.recentBattleReportCountShort) / totalShortWarActivity
        : 1 / activeWarDrafts.length;
      const longShareBase = totalLongWarActivity > 0
        ? Math.max(1, entry.recentBattleReportCountLong) / totalLongWarActivity
        : 1 / activeWarDrafts.length;
      const recentIncomingDamagePercentShort = ownShortDamagePercent * shortShareBase;
      const recentIncomingDamagePercentLong = ownLongDamagePercent * longShareBase;
      const recentIncomingCoercionPressureShort = Math.max(
        0,
        (entry.recentBattleReportCountShort * 4) + (recentIncomingDamagePercentShort * 0.5)
      );
      const recentIncomingCoercionPressureLong = Math.max(
        0,
        (entry.recentBattleReportCountLong * 3) + (recentIncomingDamagePercentLong * 0.5)
      );
      const { recentBattleReportCountShort: _short, recentBattleReportCountLong: _long, ...rest } = entry;

      return {
        ...rest,
        recentIncomingCoercionPressureShort,
        recentIncomingCoercionPressureLong,
        recentIncomingDamagePercentShort,
        recentIncomingDamagePercentLong
      } satisfies BotStrategicDiplomaticFactionSnapshot;
    })
    .sort((left, right) =>
      left.currentStatus.localeCompare(right.currentStatus)
      || right.totalPlanetCount - left.totalPlanetCount
      || left.playerId - right.playerId
    );
}

function resolveRecentOutgoingCoercionForFaction(
  player: Player,
  foreignPlayer: Player,
  currentTurn: number
): {
  shortPressure: number;
  longPressure: number;
  shortDamagePercent: number;
  longDamagePercent: number;
  lastSuccessfulBombardTurn: number | null;
  lastSuccessfulSiegeTurn: number | null;
} {
  const factionPlanets = new Map(
    foreignPlayer.planets.map((planet) => {
      const key = `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`;
      return [key, planet] as const;
    })
  );
  let shortPressure = 0;
  let longPressure = 0;
  let shortDamagePercent = 0;
  let longDamagePercent = 0;
  let lastSuccessfulBombardTurn: number | null = null;
  let lastSuccessfulSiegeTurn: number | null = null;

  for (const report of player.reports) {
    if (
      report.reportType !== ReportType.BUILDINGS_REPORT
      || !report.title.startsWith('Bombardment Report:')
      || !report.sourceCoordinates
    ) {
      continue;
    }

    const key = `${report.sourceCoordinates.x}:${report.sourceCoordinates.y}:${report.sourceCoordinates.z}`;
    const targetPlanet = factionPlanets.get(key);
    if (!targetPlanet) {
      continue;
    }

    const age = Math.max(0, currentTurn - report.createdTurn);
    if (age > 100) {
      continue;
    }

    const lines = 'body' in report && typeof report.body === 'string'
      ? report.body.split('\n')
      : [];
    const missionTypeLine = lines.find((line) => line.startsWith('Bombardment mission:')) ?? '';
    const totalDamageLine = lines.find((line) => line.startsWith('Total structural damage:')) ?? '';
    const missionType = missionTypeLine.includes(FleetMissionType.SIEGE)
      ? FleetMissionType.SIEGE
      : FleetMissionType.BOMBARD;
    const totalDamage = parseNonNegativeNumberFromLine(totalDamageLine);
    if (totalDamage <= 0) {
      continue;
    }

    const targetReport = targetPlanet.lastReportData.get(player.playerId) ?? null;
    const estimatedCapacity = targetReport ? estimateReportedStructuralCapacity(targetReport) : 0;
    const damagePercent = estimatedCapacity > 0
      ? Math.min(100, (totalDamage / estimatedCapacity) * 100)
      : Math.min(100, totalDamage / 200);
    const hostilitySwingMagnitude = (missionType === FleetMissionType.SIEGE ? 3 : 5) + (damagePercent * 0.5);
    const pressureContribution = hostilitySwingMagnitude + damagePercent;

    if (age <= 20) {
      shortPressure += pressureContribution;
      shortDamagePercent += damagePercent;
    }
    longPressure += pressureContribution;
    longDamagePercent += damagePercent;

    if (missionType === FleetMissionType.SIEGE) {
      if (lastSuccessfulSiegeTurn === null || report.createdTurn > lastSuccessfulSiegeTurn) {
        lastSuccessfulSiegeTurn = report.createdTurn;
      }
    } else if (lastSuccessfulBombardTurn === null || report.createdTurn > lastSuccessfulBombardTurn) {
      lastSuccessfulBombardTurn = report.createdTurn;
    }
  }

  return {
    shortPressure,
    longPressure,
    shortDamagePercent,
    longDamagePercent,
    lastSuccessfulBombardTurn,
    lastSuccessfulSiegeTurn
  };
}

function resolveRecentWarValueSignalsForFaction(
  player: Player,
  foreignPlayer: Player,
  currentTurn: number
): {
  outgoingShipLossValueShort: number;
  incomingShipLossValueShort: number;
  outgoingPlunderValueShort: number;
  incomingPlunderValueShort: number;
} {
  const ownPlanetCoordinates = new Set(
    player.planets.map((planet) =>
      `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`
    )
  );
  const foreignPlanetCoordinates = new Set(
    foreignPlayer.planets.map((planet) =>
      `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`
    )
  );
  let outgoingShipLossValueShort = 0;
  let incomingShipLossValueShort = 0;
  let outgoingPlunderValueShort = 0;
  let incomingPlunderValueShort = 0;

  for (const report of player.reports) {
    const age = Math.max(0, currentTurn - report.createdTurn);
    if (age > 20 || !report.sourceCoordinates) {
      continue;
    }

    const coordinatesKey = `${report.sourceCoordinates.x}:${report.sourceCoordinates.y}:${report.sourceCoordinates.z}`;
    const isForeignCoordinates = foreignPlanetCoordinates.has(coordinatesKey);
    const isOwnCoordinates = ownPlanetCoordinates.has(coordinatesKey);
    if (!isForeignCoordinates && !isOwnCoordinates) {
      continue;
    }

    const reportWithBody = report as unknown as { body?: unknown };
    const body = typeof reportWithBody.body === 'string'
      ? reportWithBody.body
      : '';
    if (!body) {
      continue;
    }
    const lines = body.split('\n');

    if (
      report.reportType === ReportType.FLEET_REPORT
      && report.title.startsWith('Battle Report:')
      && (isForeignCoordinates || report.senderPlayerName === foreignPlayer.playerName)
    ) {
      outgoingShipLossValueShort += resolveTypedShipValueFromLine(
        lines.find((line) => line.startsWith('Enemy ship losses by type:')) ?? null,
        'Enemy ship losses by type:'
      );
      incomingShipLossValueShort += resolveTypedShipValueFromLine(
        lines.find((line) => line.startsWith('Own ship losses by type:')) ?? null,
        'Own ship losses by type:'
      );
      outgoingPlunderValueShort += resolveResourceValueFromLine(
        lines.find((line) => line.startsWith('Resources stolen: ')) ?? null,
        'Resources stolen: '
      );
      incomingPlunderValueShort += resolveResourceValueFromLine(
        lines.find((line) => line.startsWith('Resources lost: ')) ?? null,
        'Resources lost: '
      );
      continue;
    }

    if (
      report.reportType === ReportType.FLEET_REPORT
      && report.title.startsWith('Plunder Report:')
      && isForeignCoordinates
    ) {
      outgoingPlunderValueShort += resolveResourceValueFromLine(
        lines.find((line) => line.startsWith('Resources stolen: ')) ?? null,
        'Resources stolen: '
      );
    }
  }

  return {
    outgoingShipLossValueShort,
    incomingShipLossValueShort,
    outgoingPlunderValueShort,
    incomingPlunderValueShort
  };
}

function resolveSharedHostileEventsForFaction(
  galaxy: Galaxy,
  player: Player,
  foreignPlayer: Player,
  diplomacyResolver: DiplomacyResolver
): BotStrategicDiplomaticSharedHostileEventSnapshot[] {
  const deduped = new Map<string, BotStrategicDiplomaticSharedHostileEventSnapshot>();
  const foreignStatus = diplomacyResolver.getStatus(player.playerId, foreignPlayer.playerId);

  if (foreignStatus === DiplomaticStatus.ALLIED || foreignStatus === DiplomaticStatus.PEACE) {
    const sharedFromStatus = foreignStatus;
    const ownedPlanetCoordinates = new Set(
      foreignPlayer.planets.map((planet) =>
        `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`
      )
    );

    for (const report of foreignPlayer.reports) {
      if (Math.max(0, galaxy.currentTurn - report.createdTurn) > SHARED_HOSTILE_EVENT_REPORT_WINDOW) {
        continue;
      }

      const parsedEvent = parseDirectVictimSharedHostileEventFromReport(
        report,
        galaxy,
        foreignPlayer,
        ownedPlanetCoordinates
      );
      if (!parsedEvent) {
        continue;
      }

      const nextEvent: BotStrategicDiplomaticSharedHostileEventSnapshot = {
        attackerPlayerId: parsedEvent.attackerPlayerId,
        victimPlayerId: foreignPlayer.playerId,
        targetCoordinates: parsedEvent.targetCoordinates,
        eventType: parsedEvent.eventType,
        eventTurn: report.createdTurn,
        sharedFromPlayerId: foreignPlayer.playerId,
        sharedFromStatus,
        severity: parsedEvent.severity
      };
      const dedupeKey = [
        nextEvent.attackerPlayerId,
        nextEvent.victimPlayerId,
        toCoordinatesKey(nextEvent.targetCoordinates),
        nextEvent.eventType,
        nextEvent.eventTurn
      ].join(':');
      const previous = deduped.get(dedupeKey);
      if (!previous || resolveSharedStatusWeight(sharedFromStatus) > resolveSharedStatusWeight(previous.sharedFromStatus)) {
        deduped.set(dedupeKey, nextEvent);
      }
    }
  }

  const directFriendlyContacts = galaxy.players.filter((friendlyPlayer) =>
    friendlyPlayer.playerId !== player.playerId
    && friendlyPlayer.playerId !== foreignPlayer.playerId
    && friendlyPlayer.type !== PlayerType.NEUTRAL
    && (
      diplomacyResolver.getStatus(player.playerId, friendlyPlayer.playerId) === DiplomaticStatus.ALLIED
      || diplomacyResolver.getStatus(player.playerId, friendlyPlayer.playerId) === DiplomaticStatus.PEACE
    )
  );

  for (const friendlyPlayer of directFriendlyContacts) {
    const sharedFromStatus = diplomacyResolver.getStatus(player.playerId, friendlyPlayer.playerId);
    const ownedPlanetCoordinates = new Set(
      friendlyPlayer.planets.map((planet) =>
        `${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`
      )
    );

    for (const report of friendlyPlayer.reports) {
      if (Math.max(0, galaxy.currentTurn - report.createdTurn) > SHARED_HOSTILE_EVENT_REPORT_WINDOW) {
        continue;
      }
      const parsedEvent = parseSharedHostileEventFromReport(
        report,
        friendlyPlayer,
        foreignPlayer,
        ownedPlanetCoordinates
      );
      if (!parsedEvent) {
        continue;
      }

      const nextEvent: BotStrategicDiplomaticSharedHostileEventSnapshot = {
        attackerPlayerId: foreignPlayer.playerId,
        victimPlayerId: friendlyPlayer.playerId,
        targetCoordinates: parsedEvent.targetCoordinates,
        eventType: parsedEvent.eventType,
        eventTurn: report.createdTurn,
        sharedFromPlayerId: friendlyPlayer.playerId,
        sharedFromStatus,
        severity: parsedEvent.severity
      };
      const dedupeKey = [
        nextEvent.attackerPlayerId,
        nextEvent.victimPlayerId,
        toCoordinatesKey(nextEvent.targetCoordinates),
        nextEvent.eventType,
        nextEvent.eventTurn
      ].join(':');
      const previous = deduped.get(dedupeKey);
      if (!previous || resolveSharedStatusWeight(sharedFromStatus) > resolveSharedStatusWeight(previous.sharedFromStatus)) {
        deduped.set(dedupeKey, nextEvent);
      }
    }
  }

  return [...deduped.values()]
    .sort((left, right) =>
      right.eventTurn - left.eventTurn
      || right.severity - left.severity
      || left.victimPlayerId - right.victimPlayerId
    )
    .slice(0, 120);
}

function parseSharedHostileEventFromReport(
  report: Player['reports'][number],
  victimPlayer: Player,
  foreignPlayer: Player,
  ownedPlanetCoordinates: Set<string>
): {
  targetCoordinates: { x: number; y: number; z: number };
  eventType: BotStrategicDiplomaticSharedHostileEventSnapshot['eventType'];
  severity: number;
} | null {
  if (
    !report.sourceCoordinates
    || report.senderPlayerName !== foreignPlayer.playerName
  ) {
    return null;
  }

  const coordinatesKey = `${report.sourceCoordinates.x}:${report.sourceCoordinates.y}:${report.sourceCoordinates.z}`;
  if (!ownedPlanetCoordinates.has(coordinatesKey)) {
    return null;
  }

  if (
    report.reportType === ReportType.FLEET_REPORT
    && report.title.startsWith('Battle Report:')
  ) {
    const body = typeof (report as { body?: unknown }).body === 'string'
      ? (report as { body: string }).body
      : '';
    const severity = resolveBattleSharedHostileSeverity(body);
    if (severity <= 0) {
      return null;
    }

    return {
      targetCoordinates: { ...report.sourceCoordinates },
      eventType: 'BATTLE',
      severity
    };
  }

  if (
    report.reportType === ReportType.FLEET_REPORT
    && report.title.startsWith('Incoming Attack Report:')
  ) {
    const body = typeof (report as { body?: unknown }).body === 'string'
      ? (report as { body: string }).body
      : '';
    const lostValue = resolveResourceValueFromLine(
      body.split('\n').find((line) => line.startsWith('Resources lost: ')) ?? null,
      'Resources lost: '
    );
    return {
      targetCoordinates: { ...report.sourceCoordinates },
      eventType: 'ATTACK',
      severity: Math.max(2, 4 + Math.min(12, lostValue / 1200))
    };
  }

  if (
    report.reportType === ReportType.BUILDINGS_REPORT
    && report.title.startsWith('Incoming Bombardment Report:')
  ) {
    const body = typeof (report as { body?: unknown }).body === 'string'
      ? (report as { body: string }).body
      : '';
    const missionTypeLine = body.split('\n').find((line) => line.startsWith('Bombardment mission:')) ?? '';
    const totalDamageLine = body.split('\n').find((line) => line.startsWith('Total structural damage:')) ?? '';
    const targetPlanet = victimPlayer.planets.find((planet) =>
      planet.basicInfo.solarSystem.coordinates.x === report.sourceCoordinates?.x
      && planet.basicInfo.solarSystem.coordinates.y === report.sourceCoordinates?.y
      && planet.basicInfo.order === report.sourceCoordinates?.z
    ) ?? null;
    const totalDamage = parseNonNegativeNumberFromLine(totalDamageLine);
    if (totalDamage <= 0) {
      return null;
    }

    const estimatedCapacity = targetPlanet ? estimatePlanetStructuralCapacity(targetPlanet) : 0;
    const damagePercent = estimatedCapacity > 0
      ? Math.min(100, (totalDamage / estimatedCapacity) * 100)
      : Math.min(100, totalDamage / 200);
    const base = missionTypeLine.includes(FleetMissionType.SIEGE) ? 3 : 5;
    return {
      targetCoordinates: { ...report.sourceCoordinates },
      eventType: missionTypeLine.includes(FleetMissionType.SIEGE) ? 'SIEGE' : 'BOMBARD',
      severity: Math.max(0, base + (damagePercent * 0.5))
    };
  }

  return null;
}

function parseDirectVictimSharedHostileEventFromReport(
  report: Player['reports'][number],
  galaxy: Galaxy,
  victimPlayer: Player,
  ownedPlanetCoordinates: Set<string>
): {
  attackerPlayerId: number;
  targetCoordinates: { x: number; y: number; z: number };
  eventType: BotStrategicDiplomaticSharedHostileEventSnapshot['eventType'];
  severity: number;
} | null {
  if (!report.sourceCoordinates || !report.senderPlayerName) {
    return null;
  }

  const coordinatesKey = `${report.sourceCoordinates.x}:${report.sourceCoordinates.y}:${report.sourceCoordinates.z}`;
  if (!ownedPlanetCoordinates.has(coordinatesKey)) {
    return null;
  }

  const attackerId = galaxy.playerNameMap.get(report.senderPlayerName);
  const attacker = attackerId === undefined
    ? null
    : galaxy.players.find((player) => player.playerId === attackerId) ?? null;
  if (!attacker) {
    return null;
  }

  if (
    report.reportType === ReportType.FLEET_REPORT
    && report.title.startsWith('Battle Report:')
  ) {
    const body = typeof (report as { body?: unknown }).body === 'string'
      ? (report as { body: string }).body
      : '';
    const severity = resolveBattleSharedHostileSeverity(body);
    if (severity <= 0) {
      return null;
    }

    return {
      attackerPlayerId: attacker.playerId,
      targetCoordinates: { ...report.sourceCoordinates },
      eventType: 'BATTLE',
      severity
    };
  }

  if (
    report.reportType === ReportType.FLEET_REPORT
    && report.title.startsWith('Incoming Attack Report:')
  ) {
    const body = typeof (report as { body?: unknown }).body === 'string'
      ? (report as { body: string }).body
      : '';
    const lostValue = resolveResourceValueFromLine(
      body.split('\n').find((line) => line.startsWith('Resources lost: ')) ?? null,
      'Resources lost: '
    );
    return {
      attackerPlayerId: attacker.playerId,
      targetCoordinates: { ...report.sourceCoordinates },
      eventType: 'ATTACK',
      severity: Math.max(2, 4 + Math.min(12, lostValue / 1200))
    };
  }

  if (
    report.reportType === ReportType.BUILDINGS_REPORT
    && report.title.startsWith('Incoming Bombardment Report:')
  ) {
    const body = typeof (report as { body?: unknown }).body === 'string'
      ? (report as { body: string }).body
      : '';
    const missionTypeLine = body.split('\n').find((line) => line.startsWith('Bombardment mission:')) ?? '';
    const totalDamageLine = body.split('\n').find((line) => line.startsWith('Total structural damage:')) ?? '';
    const targetPlanet = victimPlayer.planets.find((planet) =>
      planet.basicInfo.solarSystem.coordinates.x === report.sourceCoordinates?.x
      && planet.basicInfo.solarSystem.coordinates.y === report.sourceCoordinates?.y
      && planet.basicInfo.order === report.sourceCoordinates?.z
    ) ?? null;
    const totalDamage = parseNonNegativeNumberFromLine(totalDamageLine);
    if (totalDamage <= 0) {
      return null;
    }

    const estimatedCapacity = targetPlanet ? estimatePlanetStructuralCapacity(targetPlanet) : 0;
    const damagePercent = estimatedCapacity > 0
      ? Math.min(100, (totalDamage / estimatedCapacity) * 100)
      : Math.min(100, totalDamage / 200);
    const base = missionTypeLine.includes(FleetMissionType.SIEGE) ? 3 : 5;
    return {
      attackerPlayerId: attacker.playerId,
      targetCoordinates: { ...report.sourceCoordinates },
      eventType: missionTypeLine.includes(FleetMissionType.SIEGE) ? 'SIEGE' : 'BOMBARD',
      severity: Math.max(0, base + (damagePercent * 0.5))
    };
  }

  return null;
}

function resolveBattleSharedHostileSeverity(body: string): number {
  if (!body) {
    return 0;
  }

  const ownShipsLine = body.split('\n').find((line) => line.startsWith('Own ships (')) ?? '';
  const ownDefencesLine = body.split('\n').find((line) => line.startsWith('Own defenses (')) ?? '';
  const resultLine = body.split('\n').find((line) => line.startsWith('Battle result:')) ?? '';
  const ownShipsLost = parseBattleLossCount(ownShipsLine);
  const ownDefencesLost = parseBattleLossCount(ownDefencesLine);
  const defeatBonus = resultLine.includes('Attacker') ? 8 : resultLine.includes('Defender') ? 0 : 4;
  return Math.max(0, Math.min(50, (ownShipsLost * 2) + ownDefencesLost + defeatBonus));
}

function parseBattleLossCount(line: string): number {
  const match = line.match(/,\s*(\d+)\s+lost\./);
  if (!match) {
    return 0;
  }
  return Math.max(0, Number.parseInt(match[1] ?? '0', 10));
}

function resolveSharedStatusWeight(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.ALLIED:
      return 0.4;
    case DiplomaticStatus.PEACE:
      return 0.1;
    default:
      return 0;
  }
}

function resolveOwnRecentStructuralDamagePercent(
  player: Player,
  currentTurn: number,
  windowTurns: number
): number {
  const totalMaxStructuralPoints = player.planets.reduce((sum, planet) => {
    let planetMax = 0;
    for (const buildingType of ALL_BUILDING_TYPES) {
      const level = planet.getBuildingLevel(buildingType);
      if (level <= 0) {
        continue;
      }
      planetMax += planet.getMaxBuildingStructuralPoints(buildingType);
    }
    return sum + planetMax;
  }, 0);
  if (totalMaxStructuralPoints <= 0) {
    return 0;
  }

  const missingStructuralPoints = player.planets.reduce((sum, planet) =>
    sum + resolvePlanetMissingStructuralPoints(planet), 0);
  const recentHostileAttackCount = player.planets.reduce((sum, planet) =>
    sum + resolveRecentHostileAttackCountLast100Turns(player, planet, currentTurn, windowTurns), 0);
  if (recentHostileAttackCount <= 0) {
    return 0;
  }

  const activityMultiplier = Math.min(1, recentHostileAttackCount / Math.max(1, player.planets.length));
  return Math.max(0, Math.min(100, ((missingStructuralPoints / totalMaxStructuralPoints) * 100) * activityMultiplier));
}

function resolvePlanetMissingStructuralPoints(planet: Planet): number {
  let missing = 0;
  for (const buildingType of ALL_BUILDING_TYPES) {
    const level = planet.getBuildingLevel(buildingType);
    if (level <= 0) {
      continue;
    }
    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(buildingType);
    if (maxStructuralPoints <= 0) {
      continue;
    }
    const currentStructuralPoints = planet.getCurrentBuildingStructuralPoints(buildingType);
    missing += Math.max(0, maxStructuralPoints - currentStructuralPoints);
  }
  return missing;
}

function estimateReportedStructuralCapacity(report: EspionageReportData): number {
  let total = 0;

  for (const [buildingType, level] of report.buildingsLevels.entries()) {
    if (level <= 0) {
      continue;
    }
    const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
    if (!blueprint) {
      continue;
    }
    const cost = blueprint.getCostForLevel(level);
    total += Math.max(0, Math.floor((cost.metal * 2) + cost.crystal + Math.floor(cost.deuterium * 0.5)));
  }

  for (const defence of report.defences) {
    const blueprint = DEFENCE_BLUEPRINTS.get(defence.type);
    if (!blueprint) {
      continue;
    }
    total += Math.max(0, blueprint.hullPointsCapacity * Math.max(0, defence.amount));
  }

  return total;
}

function estimatePlanetStructuralCapacity(planet: Planet): number {
  let total = 0;

  for (const buildingType of ALL_BUILDING_TYPES) {
    const level = planet.getBuildingLevel(buildingType);
    if (level <= 0) {
      continue;
    }
    total += Math.max(0, planet.getMaxBuildingStructuralPoints(buildingType));
  }

  for (const [defenceType, amount] of ManyDefences.countByType(planet.rBDSFTQ.defences)) {
    const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
    if (!blueprint) {
      continue;
    }
    total += Math.max(0, blueprint.hullPointsCapacity * Math.max(0, amount));
  }

  return total;
}

function toCoordinatesKey(
  coordinates: { x: number; y: number; z: number }
): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
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

function parseNonNegativeNumberFromLine(line: string | null | undefined): number {
  if (!line) {
    return 0;
  }

  const match = line.match(/(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return 0;
  }

  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
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

function resolveTypedShipValueFromLine(
  line: string | null,
  prefix: string
): number {
  const counts = parseTypedCountSummary<ShipType>(line, prefix);
  let total = 0;

  for (const [shipType, amount] of Object.entries(counts) as Array<[ShipType, number]>) {
    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint || !Number.isFinite(amount) || amount <= 0) {
      continue;
    }

    total += resolveWeightedResourceValue({
      metal: blueprint.cost.metal * amount,
      crystal: blueprint.cost.crystal * amount,
      deuterium: blueprint.cost.deuterium * amount
    });
  }

  return Math.max(0, Math.floor(total));
}

function resolveResourceValueFromLine(
  line: string | null,
  prefix: string
): number {
  if (!line || !line.startsWith(prefix)) {
    return 0;
  }

  const match = line.match(/Metal (\d+), Crystal (\d+), Deuterium (\d+)\./);
  if (!match) {
    return 0;
  }

  return resolveWeightedResourceValue({
    metal: Math.max(0, Number.parseInt(match[1] ?? '0', 10)),
    crystal: Math.max(0, Number.parseInt(match[2] ?? '0', 10)),
    deuterium: Math.max(0, Number.parseInt(match[3] ?? '0', 10))
  });
}

function resolveWeightedResourceValue(resources: {
  metal: number;
  crystal: number;
  deuterium: number;
}): number {
  return Math.max(
    0,
    Math.floor(
      resources.metal
      + (resources.crystal * 1.8)
      + (resources.deuterium * 2.6)
    )
  );
}

function resolveKnownShipCountsForStrategicMilitary(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>,
  latestBattleObservation: ReturnType<typeof resolveLatestBattleObservation>
): Partial<Record<ShipType, number>> {
  const reportHasCombatIntel = (
    (report.hasTotalDefencesIntel || report.defences.length > 0)
    && (report.hasTotalShipsIntel || report.ships.size > 0)
  );
  if (latestBattleObservation && (!reportHasCombatIntel || latestBattleObservation.turn > report.createdTurn)) {
    return latestBattleObservation.survivingShipsByType;
  }

  return Object.fromEntries(report.ships.entries()) as Partial<Record<ShipType, number>>;
}

function resolveKnownDefenceCountsForStrategicMilitary(
  report: NonNullable<Planet['lastReportData'] extends Map<number, infer T> ? T : never>,
  latestBattleObservation: ReturnType<typeof resolveLatestBattleObservation>
): Partial<Record<DefenceType, number>> {
  const reportHasCombatIntel = (
    (report.hasTotalDefencesIntel || report.defences.length > 0)
    && (report.hasTotalShipsIntel || report.ships.size > 0)
  );
  if (latestBattleObservation && (!reportHasCombatIntel || latestBattleObservation.turn > report.createdTurn)) {
    return latestBattleObservation.survivingDefencesByType;
  }

  return Object.fromEntries(
    report.defences.map((entry) => [entry.type, entry.amount] satisfies [DefenceType, number])
  ) as Partial<Record<DefenceType, number>>;
}

function sumCountsByType<T extends string>(counts: Partial<Record<T, number>>): number {
  return (Object.values(counts) as Array<number | undefined>)
    .reduce<number>((sum, value) => sum + Math.max(0, value ?? 0), 0);
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
