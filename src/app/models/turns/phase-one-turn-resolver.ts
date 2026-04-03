import { EspionageReportGenerator } from '../../generators/espionage-report-generator';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { DefenceBlueprintsFactory } from '../../factories/defence-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { TechnologyBlueprintsFactory } from '../../factories/technology-blueprints.factory';
import {
  applyBuildingBombardment,
  hasBombardmentCapability,
  hasBombardmentWeapons,
  hasDamagedBuildings
} from '../bombardment/building-bombardment';
import {
  bombardmentPriorityLabel,
  hasAnyBombardmentPriority
} from '../bombardment/bombardment-priority';
import {
  SpaceBattleResolver,
  type SpaceBattleReports,
  type SpaceBattleResult
} from '../battles/space-battle-resolver';
import { DefenceInstance } from '../defences/defence-instance';
import { ManyDefences } from '../defences/many-defences';
import { Defence } from '../defences/defence';
import { countPlanetaryBombs, isPlanetaryBombDefenceType, splitPlanetaryBombDefences } from '../defences/planetary-bomb';
import { DiplomaticStatus } from '../diplomacy/diplomatic-status';
import { DiplomacyResolver } from '../diplomacy/diplomacy-resolver';
import { BuildingType } from '../enums/building-type';
import { FleetMissionType } from '../enums/fleet-mission-type';
import { HullClass } from '../enums/hull-class';
import { PlayerType } from '../enums/player-type';
import { ShipType } from '../enums/ship-type';
import { TechnologyType } from '../enums/technology-type';
import { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } from '../fleets/fleet';
import { Destination } from '../fleets/destination';
import { ManyShips, type ManyShipsLike } from '../fleets/many-ships';
import { Ship } from '../fleets/ship';
import { ShipInstance } from '../fleets/ship-instance';
import {
  EncounterResolver,
  type PlanetOrbitEncounterArrival,
  type PlanetOrbitEncounterOccupantFleet,
  type PlanetOrbitEncounterResolvedArrival
} from '../missions/encounters/encounter-resolver';
import { MissionEffectExecutor } from '../missions/mission-effect-executor';
import { FleetMissionRegistry } from '../missions/fleet-mission-registry';
import { Galaxy } from '../planets/galaxy';
import { Planet } from '../planets/planet';
import { Player } from '../player';
import { BuildingsReport } from '../reports/buildings-report';
import { FleetReport } from '../reports/fleet-report';
import {
  calculateRepairCapabilityForManyShips,
  collectRepairEquipmentBurstGroupsForManyShips,
  type RepairEquipmentBurstGroup
} from '../repairs/ship-repair-capability';
import { ResearchReport } from '../reports/research-report';
import { ResourcesPack } from '../resources-pack';
import { energyDeficitEfficiencyMultiplier } from '../planets/energy-deficit';
import { industryPowerMultiplier, researchPowerMultiplier } from '../tech/technology-effects';

type ResourceSnapshot = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type PlanetTurnSnapshot = {
  coordinatesId: string;
  ownerId: number | null;
  metalIncome: number;
  crystalIncome: number;
  deuteriumIncome: number;
  metalCapacity: number;
  crystalCapacity: number;
  deuteriumCapacity: number;
  industryPower: number;
  shipyardPower: number;
  researchPower: number;
  currentResearchQueue: {
    technologyType: TechnologyType;
    helperLabIds: string[];
  } | null;
  researchHelperFor: {
    targetId: string;
    technologyType: TechnologyType;
  } | null;
};

type AttackPlunderSummary = {
  plunderPercent: number;
  bunkerReductionPercent: number;
  availableLoot: ResourcesPack;
  stolenResources: ResourcesPack;
  freeCargoCapacity: number;
};

export type TurnDifficultyConfig = {
  botDifficultyPercent?: number;
};

const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();
const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();
const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const TECHNOLOGY_BLUEPRINTS = TechnologyBlueprintsFactory.fromDefaultJson();
const ALL_BUILDING_TYPES = Array.from(BUILDING_BLUEPRINTS.buildingsMap.keys());
const SPACE_BATTLE_RESOLVER = new SpaceBattleResolver();
const MISSION_EFFECT_EXECUTOR = new MissionEffectExecutor();
const FLEET_MISSION_REGISTRY = FleetMissionRegistry.createDefault();

export function resolvePhaseOneTurn(
  galaxy: Galaxy,
  resolvedTurnNumber = galaxy.currentTurn + 1,
  difficultyConfig: TurnDifficultyConfig = {}
): void {
  const playersById = new Map<number, Player>();
  const techLevelsByPlayerId = new Map<number, Map<TechnologyType, number>>();
  const planetById = new Map<string, Planet>();
  const snapshotsByPlanetId = new Map<string, PlanetTurnSnapshot>();

  for (const player of galaxy.players) {
    playersById.set(player.playerId, player);
    techLevelsByPlayerId.set(player.playerId, new Map(player.tech));
  }

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        const coordinatesId = toPlanetCoordinatesId(planet);
        planetById.set(coordinatesId, planet);
        snapshotsByPlanetId.set(
          coordinatesId,
          createPlanetTurnSnapshot(
            planet,
            coordinatesId,
            techLevelsByPlayerId.get(planet.info.ownerId ?? -1) ?? null,
            planet.info.ownerId === null
              ? null
              : playersById.get(planet.info.ownerId) ?? null,
            difficultyConfig
          )
        );
      }
    }
  }

  for (const [coordinatesId, planet] of planetById.entries()) {
    const snapshot = snapshotsByPlanetId.get(coordinatesId);
    if (!snapshot) {
      continue;
    }

    applyIncomeForTurn(planet, snapshot);
  }

  for (const [coordinatesId, planet] of planetById.entries()) {
    const snapshot = snapshotsByPlanetId.get(coordinatesId);
    if (!snapshot) {
      continue;
    }

    advanceBuildingQueue(planet, snapshot.industryPower);
    advanceShipyardQueue(planet, snapshot.shipyardPower);
  }

  for (const [coordinatesId, planet] of planetById.entries()) {
    const snapshot = snapshotsByPlanetId.get(coordinatesId);
    if (!snapshot || !snapshot.currentResearchQueue || snapshot.ownerId === null) {
      continue;
    }

    const owner = playersById.get(snapshot.ownerId);
    if (!owner) {
      continue;
    }

    const totalResearchPower = calculateQueuedResearchPower(
      snapshot,
      snapshotsByPlanetId
    );
    advanceResearchQueue(
      planet,
      owner,
      totalResearchPower,
      planetById,
      resolvedTurnNumber
    );
  }

  const diplomacyResolver = new DiplomacyResolver(galaxy.diplomaticRelations);
  const encounterResolver = new EncounterResolver(diplomacyResolver);

  resolveActiveFleets(
    galaxy,
    playersById,
    planetById,
    resolvedTurnNumber,
    diplomacyResolver,
    encounterResolver
  );
  resolveShipRepairs(galaxy, playersById, planetById, snapshotsByPlanetId, diplomacyResolver, resolvedTurnNumber);
}

function createPlanetTurnSnapshot(
  planet: Planet,
  coordinatesId: string,
  techLevels: Map<TechnologyType, number> | null,
  owner: Player | null,
  difficultyConfig: TurnDifficultyConfig
): PlanetTurnSnapshot {
  const adaptiveTechnologyLevel = techLevels?.get(TechnologyType.ADAPTIVE_TECHNOLOGY) ?? 0;
  const computerTechnologyLevel = techLevels?.get(TechnologyType.COMPUTER_TECHNOLOGY) ?? 0;
  const energyTechnologyLevel = techLevels?.get(TechnologyType.ENERGY_TECHNOLOGY) ?? 0;
  const intergalacticResearchNetworkLevel = techLevels?.get(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK) ?? 0;
  const energyState = calculateEnergyState(planet, energyTechnologyLevel);
  const energyEfficiency = energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);
  const effectiveParameters = planet.getEffectivePlanetaryParameters();
  const naniteMultiplier = planet.getBuildingLevel(BuildingType.NANITE_FACTORY) <= 0
    ? 1
    : planet.getBuildingProductionValue1Exact(BuildingType.NANITE_FACTORY);
  const roboticsPower = planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY) <= 0
    ? 5
    : planet.getBuildingProductionValue1(BuildingType.ROBOTICS_FACTORY);
  const shipyardBasePower = planet.getBuildingLevel(BuildingType.SHIPYARD) <= 0
    ? 0
    : planet.getBuildingProductionValue1(BuildingType.SHIPYARD);
  const researchLabBasePower = planet.getBuildingProductionValue1(BuildingType.RESEARCH_LAB);
  const industryModifier = effectiveParameters.industryModifier;
  const scienceModifier = effectiveParameters.scienceModifier;
  const adaptiveIndustryMultiplier = industryPowerMultiplier(adaptiveTechnologyLevel);
  const totalResearchMultiplier = researchPowerMultiplier(
    computerTechnologyLevel,
    adaptiveTechnologyLevel,
    intergalacticResearchNetworkLevel
  );
  const botDifficultyMultiplier = resolveBotDifficultyMultiplier(owner, difficultyConfig);

  return {
    coordinatesId,
    ownerId: planet.info.ownerId,
    metalIncome: Math.floor(
      planet.getMetalGain(adaptiveTechnologyLevel)
      * energyEfficiency
      * botDifficultyMultiplier
    ),
    crystalIncome: Math.floor(
      planet.getCrystalGain(adaptiveTechnologyLevel)
      * energyEfficiency
      * botDifficultyMultiplier
    ),
    deuteriumIncome: Math.floor(
      planet.getDeuteriumGain(adaptiveTechnologyLevel)
      * energyEfficiency
      * botDifficultyMultiplier
    ),
    metalCapacity: planet.getBuildingProductionValue1(BuildingType.METAL_STORAGE),
    crystalCapacity: planet.getBuildingProductionValue1(BuildingType.CRYSTAL_STORAGE),
    deuteriumCapacity: planet.getBuildingProductionValue1(BuildingType.DEUTERIUM_TANK),
    industryPower: Math.max(0, Math.floor(
      roboticsPower
      * naniteMultiplier
      * industryModifier
      * adaptiveIndustryMultiplier
      * energyEfficiency
      * botDifficultyMultiplier
    )),
    shipyardPower: Math.max(0, Math.floor(
      shipyardBasePower
      * naniteMultiplier
      * industryModifier
      * adaptiveIndustryMultiplier
      * energyEfficiency
      * botDifficultyMultiplier
    )),
    researchPower: Math.max(0, Math.floor(
      researchLabBasePower
      * totalResearchMultiplier
      * scienceModifier
      * energyEfficiency
      * botDifficultyMultiplier
    )),
    currentResearchQueue: planet.rBDSFTQ.currentResearchQueue
      ? {
        technologyType: planet.rBDSFTQ.currentResearchQueue.technologyType,
        helperLabIds: planet.rBDSFTQ.currentResearchQueue.helperLabs.map((helperCoordinates) =>
          toCoordinatesId(helperCoordinates.x, helperCoordinates.y, helperCoordinates.z)
        )
      }
      : null,
    researchHelperFor: planet.rBDSFTQ.researchHelperFor
      ? {
        targetId: toCoordinatesId(
          planet.rBDSFTQ.researchHelperFor.mainResearchCoordinates.x,
          planet.rBDSFTQ.researchHelperFor.mainResearchCoordinates.y,
          planet.rBDSFTQ.researchHelperFor.mainResearchCoordinates.z
        ),
        technologyType: planet.rBDSFTQ.researchHelperFor.technologyType
      }
      : null
  };
}

function resolveBotDifficultyMultiplier(
  owner: Player | null,
  difficultyConfig: TurnDifficultyConfig
): number {
  if (!owner || owner.type !== PlayerType.BOT) {
    return 1;
  }

  const configuredPercent = difficultyConfig.botDifficultyPercent;
  const percent = typeof configuredPercent === 'number' && Number.isFinite(configuredPercent)
    ? configuredPercent
    : 0;
  return Math.max(0.25, 1 + (percent / 100));
}

function calculateEnergyState(
  planet: Planet,
  energyTechnologyLevel: number
): { used: number; available: number } {
  const solarProduction = planet.getBuildingProductionValue1(BuildingType.SOLAR_WIND_GEOTHERMAL);
  const nuclearProduction = planet.getBuildingProductionValue1(BuildingType.NUCLEAR_PLANT);
  const fusionProduction = planet.getBuildingProductionValue1(BuildingType.FUSION_REACTOR);
  const parameters = planet.info.planetaryParameters;
  const available = roundNumber((
    (solarProduction * parameters.energyModifierRES)
    + (nuclearProduction * parameters.energyModifierNuclear)
    + fusionProduction
  ) * (1 + ((energyTechnologyLevel * 2) / 100)), 2);

  let used = 0;
  for (const buildingType of ALL_BUILDING_TYPES) {
    used += planet.getCurrentBuildingPowerConsumption(buildingType);
  }

  return {
    available,
    used: roundNumber(used, 2)
  };
}

function calculateQueuedResearchPower(
  snapshot: PlanetTurnSnapshot,
  snapshotsByPlanetId: Map<string, PlanetTurnSnapshot>
): number {
  let total = snapshot.researchPower;
  const researchQueue = snapshot.currentResearchQueue;
  if (!researchQueue) {
    return total;
  }

  for (const helperLabId of researchQueue.helperLabIds) {
    const helperSnapshot = snapshotsByPlanetId.get(helperLabId);
    if (!helperSnapshot || !helperSnapshot.researchHelperFor) {
      continue;
    }

    if (
      helperSnapshot.researchHelperFor.targetId !== snapshot.coordinatesId
      || helperSnapshot.researchHelperFor.technologyType !== researchQueue.technologyType
    ) {
      continue;
    }

    total += helperSnapshot.researchPower;
  }

  return Math.max(0, Math.floor(total));
}

function applyIncomeForTurn(planet: Planet, snapshot: PlanetTurnSnapshot): void {
  applyIncomeToResource(
    planet.rBDSFTQ.resources,
    'metal',
    snapshot.metalIncome,
    snapshot.metalCapacity
  );
  applyIncomeToResource(
    planet.rBDSFTQ.resources,
    'crystal',
    snapshot.crystalIncome,
    snapshot.crystalCapacity
  );
  applyIncomeToResource(
    planet.rBDSFTQ.resources,
    'deuterium',
    snapshot.deuteriumIncome,
    snapshot.deuteriumCapacity
  );
}

function applyIncomeToResource(
  resources: ResourceSnapshot,
  key: keyof ResourceSnapshot,
  income: number,
  capacity: number
): void {
  const normalizedIncome = Math.max(0, Math.floor(income));
  if (normalizedIncome <= 0) {
    return;
  }

  const current = Math.max(0, resources[key]);
  const normalizedCapacity = Math.max(0, Math.floor(capacity));
  if (normalizedCapacity <= 0 || current >= normalizedCapacity) {
    return;
  }

  resources[key] = Math.min(normalizedCapacity, current + normalizedIncome);
}

function advanceBuildingQueue(planet: Planet, industryPower: number): void {
  let remainingIndustryPower = Math.max(0, Math.floor(industryPower));
  while (planet.rBDSFTQ.buildingQueue.length > 0) {
    const queueEntry = planet.rBDSFTQ.buildingQueue[0];
    const blueprint = BUILDING_BLUEPRINTS.get(queueEntry.buildingType);
    if (!blueprint) {
      planet.rBDSFTQ.buildingQueue.shift();
      continue;
    }

    const totalRequiredPower = Math.max(0, Math.floor(
      blueprint.getCostForLevel(queueEntry.nextLevel).getTotalResourceAmount()
    ));
    if (totalRequiredPower <= 0) {
      planet.setBuildingLevel(queueEntry.buildingType, queueEntry.nextLevel);
      planet.rBDSFTQ.buildingQueue.shift();
      continue;
    }

    if (remainingIndustryPower <= 0) {
      break;
    }

    const remainingRequiredPower = Math.max(0, totalRequiredPower - queueEntry.investedIndustryPower);
    const investedPower = Math.min(remainingIndustryPower, remainingRequiredPower);
    queueEntry.investedIndustryPower += investedPower;
    remainingIndustryPower -= investedPower;

    if (queueEntry.investedIndustryPower < totalRequiredPower) {
      break;
    }

    planet.setBuildingLevel(queueEntry.buildingType, queueEntry.nextLevel);
    planet.rBDSFTQ.buildingQueue.shift();
  }
}

function advanceShipyardQueue(planet: Planet, shipyardPower: number): void {
  let remainingShipyardPower = Math.max(0, Math.floor(shipyardPower));
  while (planet.rBDSFTQ.shipyardQueue.length > 0) {
    const queueEntry = planet.rBDSFTQ.shipyardQueue[0];
    if (
      queueEntry.itemKind === 'defence'
      && queueEntry.defenceType
      && isPlanetaryBombDefenceType(queueEntry.defenceType)
      && countPlanetaryBombs(planet.rBDSFTQ.defences) >= planet.getBuildingProductionValue1(BuildingType.BOMB_DEPOT)
    ) {
      break;
    }

    const blueprint = queueEntry.itemKind === 'defence'
      ? (queueEntry.defenceType ? DEFENCE_BLUEPRINTS.get(queueEntry.defenceType) : undefined)
      : (queueEntry.shipType ? SHIP_BLUEPRINTS.get(queueEntry.shipType) : undefined);
    if (!blueprint) {
      planet.rBDSFTQ.shipyardQueue.shift();
      continue;
    }

    const singleConstructionCost = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
    const totalRequiredPower = singleConstructionCost * Math.max(0, Math.floor(queueEntry.amount));
    if (totalRequiredPower <= 0) {
      addProducedShipyardUnitsToPlanet(planet, blueprint, queueEntry.itemKind, queueEntry.amount);
      planet.rBDSFTQ.shipyardQueue.shift();
      continue;
    }

    if (remainingShipyardPower <= 0) {
      break;
    }

    const remainingRequiredPower = Math.max(0, totalRequiredPower - queueEntry.investedShipyardPower);
    const investedPower = Math.min(remainingShipyardPower, remainingRequiredPower);
    queueEntry.investedShipyardPower += investedPower;
    remainingShipyardPower -= investedPower;

    if (queueEntry.investedShipyardPower < totalRequiredPower) {
      break;
    }

    addProducedShipyardUnitsToPlanet(planet, blueprint, queueEntry.itemKind, queueEntry.amount);
    planet.rBDSFTQ.shipyardQueue.shift();
  }
}

function addProducedShipyardUnitsToPlanet(
  planet: Planet,
  blueprint: Ship | Defence,
  itemKind: 'ship' | 'defence',
  amount: number
): void {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  if (itemKind === 'defence') {
    planet.rBDSFTQ.defences.addUndamaged((blueprint as Defence).type, normalizedAmount);
    return;
  }

  planet.rBDSFTQ.ships.addUndamaged((blueprint as Ship).type, normalizedAmount);
}

function advanceResearchQueue(
  planet: Planet,
  player: Player,
  researchPower: number,
  planetById: Map<string, Planet>,
  resolvedTurnNumber: number
): void {
  const queueEntry = planet.rBDSFTQ.currentResearchQueue;
  if (!queueEntry) {
    return;
  }

  const technology = TECHNOLOGY_BLUEPRINTS.get(queueEntry.technologyType);
  if (!technology) {
    planet.rBDSFTQ.currentResearchQueue = null;
    clearResearchHelpers(planet, queueEntry.helperLabs, planetById);
    return;
  }

  const totalRequiredPower = Math.max(0, Math.floor(
    technology.getCostForLevel(queueEntry.nextLevel).getTotalResourceAmount()
  ));
  if (totalRequiredPower <= 0) {
    player.setTechLevel(queueEntry.technologyType, queueEntry.nextLevel);
    planet.rBDSFTQ.currentResearchQueue = null;
    clearResearchHelpers(planet, queueEntry.helperLabs, planetById);
    addResearchCompletionReport(player, planet, queueEntry, resolvedTurnNumber);
    return;
  }

  const normalizedResearchPower = Math.max(0, Math.floor(researchPower));
  if (normalizedResearchPower <= 0) {
    return;
  }

  queueEntry.investedResearchPower += Math.min(
    normalizedResearchPower,
    Math.max(0, totalRequiredPower - queueEntry.investedResearchPower)
  );
  if (queueEntry.investedResearchPower < totalRequiredPower) {
    return;
  }

  player.setTechLevel(queueEntry.technologyType, queueEntry.nextLevel);
  planet.rBDSFTQ.currentResearchQueue = null;
  clearResearchHelpers(planet, queueEntry.helperLabs, planetById);
  addResearchCompletionReport(player, planet, queueEntry, resolvedTurnNumber);
}

function addResearchCompletionReport(
  player: Player,
  planet: Planet,
  queueEntry: { technologyType: TechnologyType; nextLevel: number },
  resolvedTurnNumber: number
): void {
  if (player.type !== PlayerType.PLAYER) {
    return;
  }

  const report = new ResearchReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Research Completed: ${queueEntry.technologyType} L${queueEntry.nextLevel}`,
      sourceCoordinates: toPlanetReportCoordinates(planet),
      sourcePlanetName: planet.basicInfo.name,
      sourceSystemName: planet.basicInfo.solarSystem.name
    },
    `${queueEntry.technologyType} reached level ${queueEntry.nextLevel} on ${planet.basicInfo.name}.`
  );
  player.addReport(report);
}

function resolveActiveFleets(
  galaxy: Galaxy,
  playersById: Map<number, Player>,
  planetById: Map<string, Planet>,
  resolvedTurnNumber: number,
  diplomacyResolver: DiplomacyResolver,
  encounterResolver: EncounterResolver
): void {
  const espionageReportGenerator = new EspionageReportGenerator();
  const activeFleets: Fleet[] = [];
  const encounterArrivalsByLocationKey = new Map<string, PlanetOrbitEncounterArrival[]>();
  const deferredMovingFleets: Fleet[] = [];

  // TODO: Define a formal deterministic same-turn arrival order once simultaneous arrivals need dedicated rules.
  for (const fleet of galaxy.activeFleets) {
    if (
      fleet.state !== FleetState.ORBITING
      && !isFleetResolvingThisTurn(fleet, resolvedTurnNumber)
    ) {
      activeFleets.push(fleet);
      continue;
    }

    if (fleet.state === FleetState.MOVING_TO_TARGET) {
      const mission = FLEET_MISSION_REGISTRY.get(fleet.missionType);
      const owner = playersById.get(fleet.ownerId) ?? null;
      const originPlanet = planetById.get(toCoordinatesId(fleet.origin.x, fleet.origin.y, fleet.origin.z)) ?? null;
      const targetPlanet = planetById.get(toCoordinatesId(fleet.target.x, fleet.target.y, fleet.target.z)) ?? null;
      const targetOwner = targetPlanet?.info.ownerId === null
        ? null
        : playersById.get(targetPlanet?.info.ownerId ?? -1) ?? null;
      const encounterLocation = mission?.getEncounterLocationForFleet(fleet) ?? null;

      if (mission && targetPlanet && encounterLocation?.kind === 'planetOrbit') {
        const locationKey = toEncounterLocationKey(encounterLocation);
        const current = encounterArrivalsByLocationKey.get(locationKey) ?? [];
        current.push({
          fleet,
          mission,
          owner,
          originPlanet,
          targetPlanet,
          targetOwner,
          resolvedTurnNumber
        });
        encounterArrivalsByLocationKey.set(locationKey, current);
        continue;
      }

      deferredMovingFleets.push(fleet);
      continue;
    }

    const nextFleetState = resolveFleetState(
      galaxy,
      fleet,
      playersById,
      planetById,
      espionageReportGenerator,
      resolvedTurnNumber,
      diplomacyResolver
    );
    if (nextFleetState) {
      activeFleets.push(nextFleetState);
    }
  }

  for (const [locationKey, arrivals] of encounterArrivalsByLocationKey.entries()) {
    const pendingArrivals = [...arrivals].sort(compareEncounterArrivalPriority);

    while (pendingArrivals.length > 0) {
      const current = pendingArrivals.shift()!;
      const currentOwnerId = current.owner?.playerId ?? current.fleet.ownerId;
      const coalition = [
        current,
        ...pendingArrivals.filter((entry) => {
          const candidateOwnerId = entry.owner?.playerId ?? entry.fleet.ownerId;
          const status = diplomacyResolver.getStatus(currentOwnerId, candidateOwnerId);
          return status === DiplomaticStatus.SELF || status === DiplomaticStatus.ALLIED;
        })
      ].sort(compareEncounterArrivalPriority);

      for (const member of coalition.slice(1)) {
        const memberIndex = pendingArrivals.findIndex((entry) => entry.fleet.fleetId === member.fleet.fleetId);
        if (memberIndex >= 0) {
          pendingArrivals.splice(memberIndex, 1);
        }
      }

      const stationaryOccupants = activeFleets
        .filter((fleet) =>
          fleet.state === FleetState.ORBITING
          && toPlanetOrbitLocationKeyForFleet(fleet) === locationKey
        )
        .map((fleet) => ({
          fleet,
          owner: playersById.get(fleet.ownerId) ?? null
        })) satisfies PlanetOrbitEncounterOccupantFleet[];
      const resolvedArrivals = encounterResolver.resolvePlanetOrbit(coalition, stationaryOccupants);

      for (const resolvedArrival of resolvedArrivals) {
        const nextFleetState = resolveEncounterArrival(
          galaxy,
          resolvedArrival,
          espionageReportGenerator,
          diplomacyResolver
        );
        if (nextFleetState) {
          activeFleets.push(nextFleetState);
        }
      }
    }
  }

  for (const fleet of deferredMovingFleets) {
    const nextFleetState = resolveFleetState(
      galaxy,
      fleet,
      playersById,
      planetById,
      espionageReportGenerator,
      resolvedTurnNumber,
      diplomacyResolver
    );
    if (nextFleetState) {
      activeFleets.push(nextFleetState);
    }
  }

  galaxy.activeFleets = activeFleets.filter((fleet) =>
    fleet.state !== FleetState.ORBITING
      ? true
      : ManyShips.totalShipsCount(fleet.ships) > 0
  );
}

function isFleetResolvingThisTurn(fleet: Fleet, resolvedTurnNumber: number): boolean {
  switch (fleet.state) {
    case FleetState.MOVING_TO_TARGET:
      return Math.max(0, resolvedTurnNumber - fleet.createdAtTurn) >= fleet.travelTurns;
    case FleetState.RETURNING:
    case FleetState.MISSION_FAILURE_RETURNING:
      return Math.max(0, resolvedTurnNumber - fleet.createdAtTurn) >= fleet.returnTurns;
    default:
      return false;
  }
}

function resolveFleetState(
  galaxy: Galaxy,
  fleet: Fleet,
  playersById: Map<number, Player>,
  planetById: Map<string, Planet>,
  espionageReportGenerator: EspionageReportGenerator,
  resolvedTurnNumber: number,
  diplomacyResolver: DiplomacyResolver
): Fleet | null {
  switch (fleet.state) {
    case FleetState.MOVING_TO_TARGET:
      return resolveTargetArrival(
        galaxy,
        fleet,
        playersById,
        planetById,
        espionageReportGenerator,
        resolvedTurnNumber,
        diplomacyResolver
      );
    case FleetState.RETURNING:
    case FleetState.MISSION_FAILURE_RETURNING:
      return resolveReturnArrival(
        fleet,
        planetById,
        resolvedTurnNumber,
      );
    case FleetState.ORBITING:
      return resolveIdleFleetState(
        galaxy,
        fleet,
        playersById,
        planetById,
        espionageReportGenerator,
        resolvedTurnNumber,
        diplomacyResolver
      );
    default:
      return fleet;
  }
}

function resolveIdleFleetState(
  galaxy: Galaxy,
  fleet: Fleet,
  playersById: Map<number, Player>,
  planetById: Map<string, Planet>,
  espionageReportGenerator: EspionageReportGenerator,
  resolvedTurnNumber: number,
  diplomacyResolver: DiplomacyResolver
): Fleet | null {
  if (fleet.state !== FleetState.ORBITING) {
    return fleet;
  }

  const targetPlanet = planetById.get(toCoordinatesId(fleet.target.x, fleet.target.y, fleet.target.z)) ?? null;
  if (!targetPlanet) {
    return fleet;
  }

  if (
    fleet.orbitActivity === FleetOrbitActivity.GUARDING
    && targetPlanet.info.ownerId !== null
    && !isNonHostileDiplomaticStatus(diplomacyResolver.getStatus(fleet.ownerId, targetPlanet.info.ownerId))
  ) {
    fleet.missionType = FleetMissionType.HOLD;
    fleet.orbitActivity = FleetOrbitActivity.PASSIVE_HOLD;
    fleet.suspendedMissionType = FleetMissionType.DEFEND;
    return fleet;
  }

  if (fleet.orbitActivity !== FleetOrbitActivity.MISSION_IN_PROGRESS) {
    return fleet;
  }

  if (fleet.missionType === FleetMissionType.SIEGE) {
    if (targetPlanet.info.ownerId === null) {
      return fleet;
    }

    const diplomaticStatus = diplomacyResolver.getStatus(fleet.ownerId, targetPlanet.info.ownerId);
    if (diplomaticStatus !== DiplomaticStatus.WAR) {
      return fleet;
    }

    if (!consumeFuelForSiegeTurn(fleet, resolvedTurnNumber)) {
      return fleet;
    }

    applyPostArrivalBombardmentIfNeeded(
      fleet,
      targetPlanet,
      resolvedTurnNumber,
      playersById.get(fleet.ownerId) ?? null
    );
    return fleet;
  }

  if (fleet.missionType === FleetMissionType.REPAIR && targetPlanet.info.ownerId !== null) {
    const diplomaticStatus = diplomacyResolver.getStatus(fleet.ownerId, targetPlanet.info.ownerId);
    if (diplomaticStatus === DiplomaticStatus.WAR) {
      return createMissionFailureReturnFleet(fleet, resolvedTurnNumber);
    }
  }

  const mission = FLEET_MISSION_REGISTRY.get(fleet.missionType);
  if (!mission) {
    return fleet;
  }

  const owner = playersById.get(fleet.ownerId) ?? null;
  const originPlanet = planetById.get(toCoordinatesId(fleet.origin.x, fleet.origin.y, fleet.origin.z)) ?? null;
  const targetOwner = targetPlanet.info.ownerId === null
    ? null
    : playersById.get(targetPlanet.info.ownerId) ?? null;
  const resolution = mission.resolveIdleTurn({
    fleet,
    owner,
    targetOwner,
    originPlanet,
    targetPlanet,
    resolvedTurnNumber,
    diplomacyResolver
  });
  if (!resolution) {
    return fleet;
  }

  return applyMissionResolution(
    resolution,
    galaxy,
    {
      fleet,
      owner,
      targetOwner,
      originPlanet,
      targetPlanet,
      resolvedTurnNumber
    },
    espionageReportGenerator
  );
}

function resolveTargetArrival(
  galaxy: Galaxy,
  fleet: Fleet,
  playersById: Map<number, Player>,
  planetById: Map<string, Planet>,
  espionageReportGenerator: EspionageReportGenerator,
  resolvedTurnNumber: number,
  diplomacyResolver: DiplomacyResolver
): Fleet | null {
  const mission = FLEET_MISSION_REGISTRY.get(fleet.missionType);
  if (!mission) {
    return null;
  }

  const owner = playersById.get(fleet.ownerId) ?? null;
  const originPlanet = planetById.get(toCoordinatesId(fleet.origin.x, fleet.origin.y, fleet.origin.z)) ?? null;
  const targetPlanet = planetById.get(toCoordinatesId(fleet.target.x, fleet.target.y, fleet.target.z)) ?? null;
  if (!owner || !targetPlanet) {
    return createMissionFailureReturnFleet(fleet, resolvedTurnNumber);
  }

  const targetOwner = targetPlanet.info.ownerId === null
    ? null
    : playersById.get(targetPlanet.info.ownerId) ?? null;
  const resolutionContext = {
    fleet,
    owner,
    targetOwner,
    originPlanet,
    targetPlanet,
    resolvedTurnNumber,
    diplomacyResolver
  };

  if (mission.participatesInEncounter()) {
    const battleResolution = resolveHostilePlanetBattle(
      fleet,
      targetPlanet,
      playersById,
      resolvedTurnNumber,
      mission.getBattleRounds(),
      diplomacyResolver
    );
    if (battleResolution === 'attacker_destroyed') {
      return null;
    }
    if (battleResolution === 'attacker_retreating') {
      return applyMissionResolution(
        mission.onBattleRetreat(resolutionContext),
        galaxy,
        resolutionContext,
        espionageReportGenerator
      );
    }

    if (battleResolution === 'attacker_won') {
      applyPostArrivalBombardmentIfNeeded(fleet, targetPlanet, resolvedTurnNumber, owner);
      return applyMissionResolution(
        mission.resolveAfterEncounter(
          resolutionContext,
          { fleetId: fleet.fleetId, resolution: 'victory' }
        ),
        galaxy,
        resolutionContext,
        espionageReportGenerator
      );
    }
  }

  applyPostArrivalBombardmentIfNeeded(fleet, targetPlanet, resolvedTurnNumber, owner);
  return applyMissionResolution(
    mission.resolveWithoutEncounter(resolutionContext),
    galaxy,
    resolutionContext,
    espionageReportGenerator
  );
}

function applyPostArrivalBombardmentIfNeeded(
  fleet: Fleet,
  targetPlanet: Planet,
  resolvedTurnNumber: number,
  owner: Player | null = null
): void {
  if (
    fleet.missionType !== FleetMissionType.BOMBARD
    && fleet.missionType !== FleetMissionType.SIEGE
  ) {
    return;
  }

  if (
    ManyShips.totalShipsCount(fleet.ships) <= 0
    || !hasBombardmentCapability(fleet.ships, fleet.carriedBombs)
  ) {
    return;
  }

  const summary = applyBuildingBombardment(fleet.ships, targetPlanet, fleet.carriedBombs, {
    missionType: fleet.missionType,
    priorities: fleet.bombardmentPriorities
  });
  fleet.carriedBombs = summary.remainingBombs;
  if (summary.shots <= 0) {
    return;
  }

  addBombardmentReport(owner, fleet, targetPlanet, summary, resolvedTurnNumber);
  if (fleet.missionType === FleetMissionType.BOMBARD) {
    fleet.createdAtTurn = resolvedTurnNumber;
  }
}

function resolveShipRepairs(
  galaxy: Galaxy,
  playersById: Map<number, Player>,
  planetById: Map<string, Planet>,
  snapshotsByPlanetId: Map<string, PlanetTurnSnapshot>,
  diplomacyResolver: DiplomacyResolver,
  resolvedTurnNumber: number
): void {
  for (const [coordinatesId, planet] of planetById.entries()) {
    const snapshot = snapshotsByPlanetId.get(coordinatesId);
    const planetOwnerId = snapshot?.ownerId ?? null;
    if (!snapshot || planetOwnerId === null) {
      continue;
    }

    const eligibleOrbitFleets = shuffleCopy(
      galaxy.activeFleets.filter((fleet) =>
        isFleetEligibleForOrbitRepair(fleet, coordinatesId, planetOwnerId, diplomacyResolver)
      )
    );
    const totalDroneRepair = totalDroneRepairCapabilityAtPlanet(planet, eligibleOrbitFleets);
    const shipDamagePresent = hasShipDamageAtPlanet(planet, eligibleOrbitFleets);
    const buildingDamagePresent = hasDamagedBuildings(planet);
    const defenceDamagePresent = hasDefenceDamageAtPlanet(planet);
    const droneRepairSplit = splitDroneRepairBudget(
      totalDroneRepair,
      shipDamagePresent,
      buildingDamagePresent,
      defenceDamagePresent
    );
    const industryRepairSplit = splitIndustryRepairBudget(
      Math.max(0, Math.floor(snapshot.industryPower)),
      buildingDamagePresent,
      defenceDamagePresent
    );

    let remainingSharedShipyardRepair = Math.max(0, Math.floor(snapshot.shipyardPower)) + droneRepairSplit.shipRepair;
    remainingSharedShipyardRepair = repairShipsWithLocalCapabilitiesAndSharedShipyard(
      planet.rBDSFTQ.ships,
      remainingSharedShipyardRepair
    );

    for (const fleet of eligibleOrbitFleets) {
      remainingSharedShipyardRepair = repairShipsWithLocalCapabilitiesAndSharedShipyard(
        fleet.ships,
        remainingSharedShipyardRepair
      );

      if (remainingSharedShipyardRepair <= 0) {
        break;
      }
    }

    repairBuildingsAtPlanet(
      planet,
      industryRepairSplit.buildingRepair + droneRepairSplit.buildingRepair
    );
    repairDefencesAtPlanet(
      planet,
      industryRepairSplit.defenceRepair + droneRepairSplit.defenceRepair
    );

    if (!hasRepairableDamageAtPlanet(planet, eligibleOrbitFleets)) {
      for (const fleet of eligibleOrbitFleets) {
        if (
          fleet.missionType !== FleetMissionType.REPAIR
          || fleet.state !== FleetState.ORBITING
          || fleet.orbitActivity !== FleetOrbitActivity.MISSION_IN_PROGRESS
        ) {
          continue;
        }

        fleet.state = FleetState.RETURNING;
        fleet.orbitActivity = FleetOrbitActivity.IDLE;
        fleet.createdAtTurn = resolvedTurnNumber;
        addRepairReturnSummaryReport(playersById.get(fleet.ownerId) ?? null, fleet, planet, resolvedTurnNumber);
      }
    }
  }
}

function repairShipsWithLocalCapabilitiesAndSharedShipyard(
  ships: ManyShips,
  sharedShipyardRepair: number
): number {
  let remainingSharedShipyardRepair = Math.max(0, Math.floor(sharedShipyardRepair));
  if (!ships.hasDamagedShips()) {
    return remainingSharedShipyardRepair;
  }

  applyRepairEquipmentBursts(
    ships,
    collectRepairEquipmentBurstGroupsForManyShips(ships).filter((group) => !group.isDrone)
  );
  remainingSharedShipyardRepair = applyPooledShipRepair(ships, remainingSharedShipyardRepair);
  ships.normalizeFullyRepairedShips();
  return remainingSharedShipyardRepair;
}

function applyRepairEquipmentBursts(
  ships: ManyShips,
  burstGroups: RepairEquipmentBurstGroup[]
): void {
  for (const group of burstGroups) {
    for (let shotIndex = 0; shotIndex < group.shots; shotIndex += 1) {
      const targetIndex = selectRandomRepairTargetIndex(ships, group.preferNonSmallTargets);
      if (targetIndex < 0) {
        return;
      }

      ships.repairDamagedShipAtIndex(targetIndex, group.damage);
    }
  }
}

function applyPooledShipRepair(
  ships: ManyShips,
  pooledRepair: number
): number {
  let remainingRepair = Math.max(0, Math.floor(pooledRepair));
  while (remainingRepair > 0) {
    const targetIndex = selectRandomRepairTargetIndex(ships, false);
    if (targetIndex < 0) {
      break;
    }

    const usedRepair = ships.repairDamagedShipAtIndex(targetIndex, remainingRepair);
    if (usedRepair <= 0) {
      break;
    }

    remainingRepair -= usedRepair;
  }

  return remainingRepair;
}

function repairBuildingsAtPlanet(
  planet: Planet,
  pooledRepair: number
): number {
  let remainingRepair = Math.max(0, Math.floor(pooledRepair));
  while (remainingRepair > 0) {
    const targetType = selectRandomDamagedBuildingType(planet);
    if (!targetType) {
      break;
    }

    const usedRepair = planet.repairBuildingStructuralPoints(targetType, remainingRepair);
    if (usedRepair <= 0) {
      break;
    }

    remainingRepair -= usedRepair;
  }

  return remainingRepair;
}

function repairDefencesAtPlanet(
  planet: Planet,
  pooledRepair: number
): number {
  let remainingRepair = Math.max(0, Math.floor(pooledRepair));
  while (remainingRepair > 0) {
    const targetIndex = selectRandomDamagedDefenceIndex(planet.rBDSFTQ.defences);
    if (targetIndex < 0) {
      break;
    }

    const usedRepair = planet.rBDSFTQ.defences.repairDamagedDefenceAtIndex(targetIndex, remainingRepair);
    if (usedRepair <= 0) {
      break;
    }

    remainingRepair -= usedRepair;
  }

  planet.rBDSFTQ.defences.normalizeFullyRepairedDefences();
  return remainingRepair;
}

function selectRandomDamagedBuildingType(planet: Planet): BuildingType | null {
  const candidates = [...planet.rBDSFTQ.buildingsLevels.entries()]
    .filter(([type, level]) =>
      level > 0 && planet.getCurrentBuildingStructuralPoints(type) < planet.getMaxBuildingStructuralPoints(type)
    )
    .map(([type]) => type);
  if (candidates.length <= 0) {
    return null;
  }

  const randomIndex = Math.max(0, Math.min(
    candidates.length - 1,
    Math.floor(Math.random() * candidates.length)
  ));
  return candidates[randomIndex] ?? null;
}

function totalDroneRepairCapabilityAtPlanet(
  planet: Planet,
  eligibleOrbitFleets: Fleet[]
): number {
  let total = calculateRepairCapabilityForManyShips(planet.rBDSFTQ.ships).droneRepair;
  for (const fleet of eligibleOrbitFleets) {
    total += calculateRepairCapabilityForManyShips(fleet.ships).droneRepair;
  }

  return total;
}

function hasShipDamageAtPlanet(
  planet: Planet,
  eligibleOrbitFleets: Fleet[]
): boolean {
  if (planet.rBDSFTQ.ships.hasDamagedShips()) {
    return true;
  }

  return eligibleOrbitFleets.some((fleet) => fleet.ships.hasDamagedShips());
}

function hasDefenceDamageAtPlanet(planet: Planet): boolean {
  return planet.rBDSFTQ.defences.hasDamagedDefences();
}

function splitDroneRepairBudget(
  totalDroneRepair: number,
  shipDamagePresent: boolean,
  buildingDamagePresent: boolean,
  defenceDamagePresent: boolean
): { shipRepair: number; buildingRepair: number; defenceRepair: number } {
  const normalized = Math.max(0, Math.floor(totalDroneRepair));
  if (normalized <= 0) {
    return { shipRepair: 0, buildingRepair: 0, defenceRepair: 0 };
  }

  const categories = [
    shipDamagePresent ? 'ship' : null,
    buildingDamagePresent ? 'building' : null,
    defenceDamagePresent ? 'defence' : null
  ].filter((entry): entry is 'ship' | 'building' | 'defence' => entry !== null);
  if (categories.length <= 0) {
    return { shipRepair: 0, buildingRepair: 0, defenceRepair: 0 };
  }

  const baseShare = Math.floor(normalized / categories.length);
  let remainder = normalized - (baseShare * categories.length);
  const result = {
    shipRepair: 0,
    buildingRepair: 0,
    defenceRepair: 0
  };

  for (const category of categories) {
    const share = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }

    if (category === 'ship') {
      result.shipRepair += share;
    } else if (category === 'building') {
      result.buildingRepair += share;
    } else {
      result.defenceRepair += share;
    }
  }

  return result;
}

function splitIndustryRepairBudget(
  totalIndustryRepair: number,
  buildingDamagePresent: boolean,
  defenceDamagePresent: boolean
): { buildingRepair: number; defenceRepair: number } {
  const normalized = Math.max(0, Math.floor(totalIndustryRepair));
  if (normalized <= 0) {
    return { buildingRepair: 0, defenceRepair: 0 };
  }

  const categories = [
    buildingDamagePresent ? 'building' : null,
    defenceDamagePresent ? 'defence' : null
  ].filter((entry): entry is 'building' | 'defence' => entry !== null);
  if (categories.length <= 0) {
    return { buildingRepair: 0, defenceRepair: 0 };
  }

  const baseShare = Math.floor(normalized / categories.length);
  let remainder = normalized - (baseShare * categories.length);
  const result = {
    buildingRepair: 0,
    defenceRepair: 0
  };

  for (const category of categories) {
    const share = baseShare + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }

    if (category === 'building') {
      result.buildingRepair += share;
    } else {
      result.defenceRepair += share;
    }
  }

  return result;
}

function selectRandomDamagedDefenceIndex(defences: ManyDefences): number {
  const candidates = defences.damagedDefences
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      const instances = ManyDefences.toDefenceInstances({
        undamagedDefencesCount: {},
        damagedDefences: [entry]
      });
      const instance = instances[0];
      return instance ? entry.hull < instance.type.hullPointsCapacity : false;
    })
    .map(({ index }) => index);
  if (candidates.length <= 0) {
    return -1;
  }

  const randomIndex = Math.max(0, Math.min(
    candidates.length - 1,
    Math.floor(Math.random() * candidates.length)
  ));
  return candidates[randomIndex] ?? -1;
}

function selectRandomRepairTargetIndex(
  ships: ManyShips,
  preferNonSmallTargets: boolean
): number {
  const allCandidates = ships.damagedShips
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => {
      const blueprint = SHIP_BLUEPRINTS.get(entry.type);
      if (!blueprint) {
        return false;
      }

      return entry.hull < blueprint.hullPointsCapacity;
    });
  if (allCandidates.length <= 0) {
    return -1;
  }

  const preferredCandidates = preferNonSmallTargets
    ? allCandidates.filter(({ entry }) => {
      const blueprint = SHIP_BLUEPRINTS.get(entry.type);
      return blueprint && blueprint.hullClass !== HullClass.SMALL;
    })
    : [];
  const candidates = preferredCandidates.length > 0 ? preferredCandidates : allCandidates;
  const randomIndex = Math.max(0, Math.min(
    candidates.length - 1,
    Math.floor(Math.random() * candidates.length)
  ));
  return candidates[randomIndex]?.index ?? -1;
}

function isFleetEligibleForOrbitRepair(
  fleet: Fleet,
  planetCoordinatesId: string,
  planetOwnerId: number,
  diplomacyResolver: DiplomacyResolver
): boolean {
  if (fleet.state !== FleetState.ORBITING) {
    return false;
  }

  if (toPlanetOrbitLocationKeyForFleet(fleet) !== toPlanetOrbitLocationKeyForCoordinatesId(planetCoordinatesId)) {
    return false;
  }

  const diplomaticStatus = diplomacyResolver.getStatus(planetOwnerId, fleet.ownerId);
  return diplomaticStatus === DiplomaticStatus.SELF
    || diplomaticStatus === DiplomaticStatus.ALLIED
    || diplomaticStatus === DiplomaticStatus.PEACE;
}

function hasRepairableDamageAtPlanet(
  planet: Planet,
  eligibleOrbitFleets: Fleet[]
): boolean {
  if (planet.rBDSFTQ.ships.hasDamagedShips()) {
    return true;
  }

  if (planet.rBDSFTQ.defences.hasDamagedDefences()) {
    return true;
  }

  if (hasDamagedBuildings(planet)) {
    return true;
  }

  return eligibleOrbitFleets.some((fleet) => fleet.ships.hasDamagedShips());
}

function resolveEncounterArrival(
  galaxy: Galaxy,
  resolvedArrival: PlanetOrbitEncounterResolvedArrival,
  espionageReportGenerator: EspionageReportGenerator,
  diplomacyResolver: DiplomacyResolver
): Fleet | null {
  const {
    arrival,
    outcome
  } = resolvedArrival;
  const resolutionContext = {
    fleet: arrival.fleet,
    owner: arrival.owner,
    targetOwner: arrival.targetOwner,
    originPlanet: arrival.originPlanet,
    targetPlanet: arrival.targetPlanet,
    resolvedTurnNumber: arrival.resolvedTurnNumber,
    diplomacyResolver
  };

  switch (outcome.resolution) {
    case 'victory':
      applyAttackPlunderIfNeeded(
        arrival.fleet,
        arrival.targetPlanet,
        arrival.owner,
        arrival.targetOwner,
        arrival.resolvedTurnNumber,
        outcome.battleReports ?? null,
        diplomacyResolver
      );
      applyPostArrivalBombardmentIfNeeded(
        arrival.fleet,
        arrival.targetPlanet,
        arrival.resolvedTurnNumber,
        arrival.owner
      );
      return applyMissionResolution(
        arrival.mission.resolveAfterEncounter(resolutionContext, outcome),
        galaxy,
        resolutionContext,
        espionageReportGenerator
      );
    case 'retreat':
    case 'stalemate':
      return applyMissionResolution(
        arrival.mission.onBattleRetreat(resolutionContext),
        galaxy,
        resolutionContext,
        espionageReportGenerator
      );
    case 'defeat':
      return null;
    case 'notInvolved':
    default:
      applyAttackPlunderIfNeeded(
        arrival.fleet,
        arrival.targetPlanet,
        arrival.owner,
        arrival.targetOwner,
        arrival.resolvedTurnNumber,
        outcome.battleReports ?? null,
        diplomacyResolver
      );
      applyPostArrivalBombardmentIfNeeded(
        arrival.fleet,
        arrival.targetPlanet,
        arrival.resolvedTurnNumber,
        arrival.owner
      );
      return applyMissionResolution(
        arrival.mission.resolveWithoutEncounter(resolutionContext),
        galaxy,
        resolutionContext,
        espionageReportGenerator
      );
  }
}

function applyAttackPlunderIfNeeded(
  fleet: Fleet,
  targetPlanet: Planet,
  owner: Player | null,
  targetOwner: Player | null,
  resolvedTurnNumber: number,
  battleReports: SpaceBattleReports | null,
  diplomacyResolver: DiplomacyResolver
): AttackPlunderSummary | null {
  if (fleet.missionType !== FleetMissionType.ATTACK) {
    return null;
  }

  const targetOwnerId = targetPlanet.info.ownerId;
  const targetStatus = diplomacyResolver.getStatus(fleet.ownerId, targetOwnerId);
  if (targetOwnerId === null || (targetStatus !== DiplomaticStatus.WAR && targetStatus !== DiplomaticStatus.PASSIVE)) {
    return null;
  }

  const summary = resolveAttackPlunder(fleet, targetPlanet);
  appendAttackPlunderToBattleReports(battleReports, targetPlanet, summary);
  if (!battleReports) {
    addAttackPlunderSummaryReport(owner, targetOwner, targetPlanet, summary, resolvedTurnNumber);
  }

  return summary;
}

function resolveAttackPlunder(
  fleet: Fleet,
  targetPlanet: Planet
): AttackPlunderSummary {
  const bunkerReductionPercent = resolveBunkerPlunderReductionPercent(targetPlanet);
  const plunderPercent = Math.max(0, 80 - bunkerReductionPercent) / 100;
  const availableLoot = new ResourcesPack(
    Math.floor(Math.max(0, targetPlanet.rBDSFTQ.resources.metal) * plunderPercent),
    Math.floor(Math.max(0, targetPlanet.rBDSFTQ.resources.crystal) * plunderPercent),
    Math.floor(Math.max(0, targetPlanet.rBDSFTQ.resources.deuterium) * plunderPercent)
  );
  const freeCargoCapacity = Math.max(0, fleet.totalCargoCapacity - fleet.usedCargoCapacity);
  const stolenResources = distributeAttackPlunder(availableLoot, freeCargoCapacity);

  if (stolenResources.getTotalResourceAmount() > 0) {
    targetPlanet.rBDSFTQ.resources.subtractResourcePack(stolenResources);
    fleet.cargo.addResourcePack(stolenResources);
    fleet.usedCargoCapacity = Math.min(
      fleet.totalCargoCapacity,
      fleet.usedCargoCapacity + stolenResources.getTotalResourceAmount()
    );
  }

  return {
    plunderPercent,
    bunkerReductionPercent,
    availableLoot,
    stolenResources,
    freeCargoCapacity
  };
}

function resolveBunkerPlunderReductionPercent(targetPlanet: Planet): number {
  const bunkerLevel = targetPlanet.getBuildingLevel(BuildingType.BUNKER_NETWORK);
  if (bunkerLevel <= 0) {
    return 0;
  }

  const bunkerBlueprint = BUILDING_BLUEPRINTS.get(BuildingType.BUNKER_NETWORK);
  if (!bunkerBlueprint) {
    return 0;
  }

  const rawValue = bunkerBlueprint.production1[bunkerLevel - 1];
  return Number.isFinite(rawValue) ? Math.max(0, Math.floor(rawValue)) : 0;
}

function distributeAttackPlunder(
  availableLoot: ResourcesPack,
  freeCargoCapacity: number
): ResourcesPack {
  const totalLootable = availableLoot.getTotalResourceAmount();
  if (freeCargoCapacity <= 0 || totalLootable <= 0) {
    return new ResourcesPack(0, 0, 0);
  }

  const remainingByType: Record<'metal' | 'crystal' | 'deuterium', number> = {
    metal: availableLoot.metal,
    crystal: availableLoot.crystal,
    deuterium: availableLoot.deuterium
  };
  const stolen = new ResourcesPack(0, 0, 0);
  let remainingCapacity = Math.min(freeCargoCapacity, totalLootable);
  const resourceTypes: Array<'metal' | 'crystal' | 'deuterium'> = ['metal', 'crystal', 'deuterium'];
  let activeTypes: Array<'metal' | 'crystal' | 'deuterium'> = resourceTypes
    .filter((type) => remainingByType[type] > 0);

  while (remainingCapacity > 0 && activeTypes.length > 0) {
    const share = Math.max(1, Math.floor(remainingCapacity / activeTypes.length));
    let progress = false;

    for (const type of [...activeTypes]) {
      if (remainingCapacity <= 0) {
        break;
      }

      const take = Math.min(remainingByType[type], share, remainingCapacity);
      if (take <= 0) {
        continue;
      }

      addPlunderResource(stolen, type, take);
      remainingByType[type] -= take;
      remainingCapacity -= take;
      progress = true;
    }

    activeTypes = activeTypes.filter((type) => remainingByType[type] > 0);
    if (!progress) {
      break;
    }
  }

  return stolen;
}

function addPlunderResource(
  pack: ResourcesPack,
  type: 'metal' | 'crystal' | 'deuterium',
  amount: number
): void {
  switch (type) {
    case 'metal':
      pack.metal += amount;
      break;
    case 'crystal':
      pack.crystal += amount;
      break;
    case 'deuterium':
      pack.deuterium += amount;
      break;
  }
}

function appendAttackPlunderToBattleReports(
  battleReports: SpaceBattleReports | null,
  targetPlanet: Planet,
  summary: AttackPlunderSummary
): void {
  if (!battleReports) {
    return;
  }

  const effectivePercent = Math.round(summary.plunderPercent * 100);
  const availableTotal = summary.availableLoot.getTotalResourceAmount();
  const stolenTotal = summary.stolenResources.getTotalResourceAmount();
  const attackerLines = [
    'Plunder summary:',
    `Base plunder: 80%`,
    `Bunker reduction: ${summary.bunkerReductionPercent}%`,
    `Effective plunder: ${effectivePercent}%`,
    `Free cargo space before looting: ${summary.freeCargoCapacity}`
  ];
  const defenderLines = [
    'Enemy plunder summary:',
    `Base plunder: 80%`,
    `Bunker reduction: ${summary.bunkerReductionPercent}%`,
    `Effective plunder: ${effectivePercent}%`
  ];

  if (availableTotal <= 0) {
    attackerLines.push(`No stealable resources remained on ${targetPlanet.basicInfo.name}.`);
    defenderLines.push(`No stealable resources remained on ${targetPlanet.basicInfo.name}.`);
  } else if (summary.freeCargoCapacity <= 0) {
    attackerLines.push('No free cargo space remained, so no resources were stolen.');
    defenderLines.push('Attacking fleet had no free cargo space, so no resources were stolen.');
  } else if (stolenTotal <= 0) {
    attackerLines.push('Loot attempt failed to secure any resources.');
    defenderLines.push('Attacking fleet failed to secure any resources.');
  } else {
    const breakdown = `Metal ${summary.stolenResources.metal}, Crystal ${summary.stolenResources.crystal}, Deuterium ${summary.stolenResources.deuterium}`;
    attackerLines.push(`Resources stolen: ${breakdown}.`);
    defenderLines.push(`Resources lost: ${breakdown}.`);
  }

  battleReports.attacker.body = `${battleReports.attacker.body}\n${attackerLines.join('\n')}`;
  battleReports.defender.body = `${battleReports.defender.body}\n${defenderLines.join('\n')}`;
}

function addAttackPlunderSummaryReport(
  player: Player | null,
  targetOwner: Player | null,
  targetPlanet: Planet,
  summary: AttackPlunderSummary,
  resolvedTurnNumber: number
): void {
  if (!player || player.type !== PlayerType.PLAYER) {
    return;
  }

  const effectivePercent = Math.round(summary.plunderPercent * 100);
  const stolenTotal = summary.stolenResources.getTotalResourceAmount();
  const availableTotal = summary.availableLoot.getTotalResourceAmount();
  let body = [
    `Attack mission reached ${targetPlanet.basicInfo.name}.`,
    `Base plunder: 80%`,
    `Bunker reduction: ${summary.bunkerReductionPercent}%`,
    `Effective plunder: ${effectivePercent}%`
  ];

  if (availableTotal <= 0) {
    body.push('No stealable resources remained on the target.');
  } else if (summary.freeCargoCapacity <= 0) {
    body.push('No free cargo space remained, so no resources were stolen.');
  } else if (stolenTotal <= 0) {
    body.push('No resources were stolen.');
  } else {
    body.push(
      `Resources stolen: Metal ${summary.stolenResources.metal}, `
      + `Crystal ${summary.stolenResources.crystal}, `
      + `Deuterium ${summary.stolenResources.deuterium}.`
    );
  }

  const report = new FleetReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Plunder Report: ${targetPlanet.basicInfo.name}`,
      sourceCoordinates: toPlanetReportCoordinates(targetPlanet),
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: targetOwner?.playerName ?? player.playerName
    },
    body.join('\n')
  );
  player.addReport(report);
}

function resolveReturnArrival(
  fleet: Fleet,
  planetById: Map<string, Planet>,
  resolvedTurnNumber: number
): Fleet | null {
  const originPlanet = planetById.get(toCoordinatesId(fleet.origin.x, fleet.origin.y, fleet.origin.z));
  if (!originPlanet || originPlanet.info.ownerId !== fleet.ownerId) {
    fleet.state = FleetState.ORBITING;
    fleet.missionType = FleetMissionType.HOLD;
    fleet.orbitActivity = FleetOrbitActivity.PASSIVE_HOLD;
    fleet.suspendedMissionType = null;
    fleet.target = new Destination(fleet.origin.x, fleet.origin.y, fleet.origin.z);
    fleet.targetPlanetName = fleet.originPlanetName;
    fleet.createdAtTurn = resolvedTurnNumber;
    fleet.returnReason = FleetReturnReason.NORMAL;
    return fleet;
  }

  addFleetShipsToPlanet(originPlanet, fleet.ships);
  addFleetBombsToPlanet(originPlanet, fleet.carriedBombs);
  originPlanet.rBDSFTQ.resources.addResourcePack(new ResourcesPack(
    fleet.cargo.metal,
    fleet.cargo.crystal,
    fleet.cargo.deuterium
  ));
  return null;
}

function createReturningFleet(
  fleet: Fleet,
  resolvedTurnNumber: number
): Fleet {
  fleet.state = FleetState.RETURNING;
  fleet.orbitActivity = FleetOrbitActivity.IDLE;
  fleet.returnReason = FleetReturnReason.NORMAL;
  fleet.createdAtTurn = resolvedTurnNumber;
  return fleet;
}

function calculateSiegeFuelUpkeep(fleet: Fleet): number {
  return Math.max(1, Math.ceil(fleet.fuelCost / Math.max(1, fleet.travelTurns)));
}

function calculateRequiredReturnFuelReserve(fleet: Fleet): number {
  return Math.max(0, Math.ceil(fleet.fuelCost / 2));
}

function consumeFuelForSiegeTurn(
  fleet: Fleet,
  resolvedTurnNumber: number
): boolean {
  if (fleet.fuelCost <= 0) {
    fleet.remainingFuelReserve = Math.max(0, fleet.remainingFuelReserve);
    return true;
  }

  const upkeep = calculateSiegeFuelUpkeep(fleet);
  const requiredReturnReserve = calculateRequiredReturnFuelReserve(fleet);
  const availableReserve = Number.isFinite(fleet.remainingFuelReserve)
    ? Math.max(0, fleet.remainingFuelReserve)
    : Math.max(0, fleet.fuelCost);
  if (availableReserve <= requiredReturnReserve || (availableReserve - upkeep) < requiredReturnReserve) {
    createReturningFleet(fleet, resolvedTurnNumber);
    return false;
  }

  fleet.remainingFuelReserve = Math.max(0, availableReserve - upkeep);
  return true;
}

function createMissionFailureReturnFleet(
  fleet: Fleet,
  resolvedTurnNumber: number
): Fleet {
  fleet.state = FleetState.MISSION_FAILURE_RETURNING;
  fleet.orbitActivity = FleetOrbitActivity.IDLE;
  fleet.returnReason = FleetReturnReason.MISSION_FAILURE;
  fleet.createdAtTurn = resolvedTurnNumber;
  return fleet;
}

function isNonHostileDiplomaticStatus(status: DiplomaticStatus): boolean {
  return status === DiplomaticStatus.SELF
    || status === DiplomaticStatus.ALLIED
    || status === DiplomaticStatus.PEACE;
}

function addFleetShipsToPlanet(
  planet: Planet,
  ships: ManyShipsLike
): void {
  planet.rBDSFTQ.ships.addManyShips(ships);
}

function addFleetBombsToPlanet(
  planet: Planet,
  bombs: ManyDefences
): void {
  planet.rBDSFTQ.defences.addManyDefences(bombs);
}

function applyMissionResolution(
  resolution: import('../missions/mission-effect').MissionResolutionResult,
  galaxy: Galaxy,
  context: {
    fleet: Fleet;
    owner: Player | null;
    targetOwner: Player | null;
    originPlanet: Planet | null;
    targetPlanet: Planet | null;
    resolvedTurnNumber: number;
  },
  espionageReportGenerator: EspionageReportGenerator
): Fleet | null {
  MISSION_EFFECT_EXECUTOR.execute({
    galaxy,
    fleet: context.fleet,
    owner: context.owner,
    targetOwner: context.targetOwner,
    originPlanet: context.originPlanet,
    targetPlanet: context.targetPlanet,
    resolvedTurnNumber: context.resolvedTurnNumber,
    espionageReportGenerator
  }, resolution);

  if (context.owner) {
    addMissionReports(
      context.owner,
      context.fleet,
      context.resolvedTurnNumber,
      resolution.reports
    );
  }

  return resolution.fleetOutcome === 'remove' ? null : context.fleet;
}

function resolveHostilePlanetBattle(
  fleet: Fleet,
  targetPlanet: Planet,
  playersById: Map<number, Player>,
  resolvedTurnNumber: number,
  maxRounds = SpaceBattleResolver.DEFAULT_MAX_ROUNDS,
  diplomacyResolver: DiplomacyResolver
): 'no_battle' | 'attacker_destroyed' | 'attacker_retreating' | 'attacker_won' {
  const activeDefences = splitPlanetaryBombDefences(targetPlanet.rBDSFTQ.defences).activeDefences;
  const defenderOwnerId = targetPlanet.info.ownerId;
  if (defenderOwnerId === null) {
    return 'no_battle';
  }

  const diplomaticStatus = diplomacyResolver.getStatus(fleet.ownerId, defenderOwnerId);
  if (diplomaticStatus !== DiplomaticStatus.WAR) {
    return 'no_battle';
  }

  if (
    ManyShips.totalShipsCount(targetPlanet.rBDSFTQ.ships) <= 0
    && ManyDefences.totalDefencesCount(activeDefences) <= 0
  ) {
    return 'no_battle';
  }

  const attacker = playersById.get(fleet.ownerId);
  const defender = playersById.get(defenderOwnerId);
  if (!attacker || !defender) {
    return 'no_battle';
  }

  const battleResult = resolvePlanetBattle(
    fleet,
    targetPlanet,
    attacker,
    defender,
    resolvedTurnNumber,
    maxRounds
  );
  const attackerSurvivors = ManyShips.totalShipsCount(fleet.ships);
  const defenderSurvivors =
    ManyShips.totalShipsCount(targetPlanet.rBDSFTQ.ships)
    + ManyDefences.totalDefencesCount(splitPlanetaryBombDefences(targetPlanet.rBDSFTQ.defences).activeDefences);
  const battleIsUnresolved = attackerSurvivors > 0 && defenderSurvivors > 0;

  if (attackerSurvivors <= 0) {
    return 'attacker_destroyed';
  }

  if (battleIsUnresolved) {
    return 'attacker_retreating';
  }

  if (battleResult.defender.survivingShipCount + battleResult.defender.survivingDefenceCount <= 0) {
    return 'attacker_won';
  }

  return 'attacker_retreating';
}

function resolvePlanetBattle(
  fleet: Fleet,
  targetPlanet: Planet,
  attacker: Player,
  defender: Player,
  resolvedTurnNumber: number,
  maxRounds = SpaceBattleResolver.DEFAULT_MAX_ROUNDS
): SpaceBattleResult {
  const attackerShips = ManyShips.toShipInstances(fleet.ships);
  const attackerBombs = ManyDefences.toDefenceInstances(fleet.carriedBombs);
  const defenderShips = ManyShips.toShipInstances(targetPlanet.rBDSFTQ.ships);
  const splitDefences = splitPlanetaryBombDefences(targetPlanet.rBDSFTQ.defences);
  const defenderDefences = ManyDefences.toDefenceInstances(splitDefences.activeDefences);
  const battleResult = SPACE_BATTLE_RESOLVER.resolve({
    attacker: {
      player: attacker,
      ships: attackerShips,
      label: attacker.playerName
    },
    defender: {
      player: defender,
      ships: defenderShips,
      defences: defenderDefences,
      label: defender.playerName
    },
    attackerPlanetaryBombs: attackerBombs,
    reportContext: {
      createdTurn: resolvedTurnNumber,
      sourceCoordinates: toPlanetReportCoordinates(targetPlanet),
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name
    },
    maxRounds
  });

  fleet.ships = ManyShips.fromShipInstances(battleResult.attacker.survivingShips);
  fleet.carriedBombs = ManyDefences.fromDefenceInstances(attackerBombs);
  const overflowShips = fleet.ships.trimNonJumpShipsToTravelHangarCapacity();
  targetPlanet.rBDSFTQ.ships = ManyShips.fromShipInstances(battleResult.defender.survivingShips);
  targetPlanet.rBDSFTQ.defences = ManyDefences.fromDefenceInstances(battleResult.defender.survivingDefences);
  targetPlanet.rBDSFTQ.defences.addManyDefences(splitDefences.planetaryBombs);
  // TODO: Surface `spaceDebris` in the UI and add recycler/recovery gameplay once that layer is implemented.
  targetPlanet.rBDSFTQ.spaceDebris.addResourcePack(calculateBattleDebris(battleResult, fleet, overflowShips));
  targetPlanet.rBDSFTQ.resources.addResourcePack(calculateDefenceBattleRecovery(battleResult));

  addBattleFleetReport(attacker, battleResult.reports.attacker);
  addBattleFleetReport(defender, battleResult.reports.defender);

  return battleResult;
}

function calculateBattleDebris(
  battleResult: SpaceBattleResult,
  fleet: Fleet,
  overflowShips: ManyShipsLike
): ResourcesPack {
  const destroyedShipResources = new ResourcesPack(0, 0, 0);
  addDestroyedShipResources(destroyedShipResources, battleResult.attacker.destroyedShips);
  addDestroyedShipResources(destroyedShipResources, battleResult.defender.destroyedShips);
  addDestroyedShipResources(destroyedShipResources, ManyShips.toShipInstances(overflowShips));

  const lostCargoResources = ManyShips.totalShipsCount(fleet.ships) <= 0
    ? new ResourcesPack(fleet.cargo.metal, fleet.cargo.crystal, fleet.cargo.deuterium)
    : new ResourcesPack(0, 0, 0);

  const totalLostResources = new ResourcesPack(
    destroyedShipResources.metal + lostCargoResources.metal,
    destroyedShipResources.crystal + lostCargoResources.crystal,
    destroyedShipResources.deuterium + lostCargoResources.deuterium
  );

  if (totalLostResources.getTotalResourceAmount() <= 0) {
    return new ResourcesPack(0, 0, 0);
  }

  const metalRate = randomBetween(0.2, 0.3);
  const crystalRate = randomBetween(0.2, 0.3);
  const deuteriumRate = randomBetween(0.05, 0.1);

  return new ResourcesPack(
    Math.floor(totalLostResources.metal * metalRate),
    Math.floor(totalLostResources.crystal * crystalRate),
    Math.floor(totalLostResources.deuterium * deuteriumRate)
  );
}

function addDestroyedShipResources(
  target: ResourcesPack,
  ships: ShipInstance[]
): void {
  for (const ship of ships) {
    target.metal += ship.type.cost.metal;
    target.crystal += ship.type.cost.crystal;
    target.deuterium += ship.type.cost.deuterium;
  }
}

function calculateDefenceBattleRecovery(
  battleResult: SpaceBattleResult
): ResourcesPack {
  const recoveredResources = new ResourcesPack(0, 0, 0);
  addDestroyedDefenceResources(recoveredResources, battleResult.attacker.destroyedDefences);
  addDestroyedDefenceResources(recoveredResources, battleResult.defender.destroyedDefences);
  return recoveredResources;
}

function addDestroyedDefenceResources(
  target: ResourcesPack,
  defences: DefenceInstance[]
): void {
  for (const defence of defences) {
    target.metal += defence.type.cost.metal;
    target.crystal += defence.type.cost.crystal;
    target.deuterium += defence.type.cost.deuterium;
  }
}

function randomBetween(min: number, max: number): number {
  if (max <= min) {
    return min;
  }

  return min + Math.random() * (max - min);
}

function addBombardmentReport(
  player: Player | null,
  fleet: Fleet,
  targetPlanet: Planet,
  summary: ReturnType<typeof applyBuildingBombardment>,
  resolvedTurnNumber: number
): void {
  if (!player || player.type !== PlayerType.PLAYER) {
    return;
  }

  const groupedDamage = new Map<BuildingType, {
    hits: number;
    damage: number;
    reducedToZero: number;
    minimumStructuralUtilization: number;
    floorApplied: boolean;
  }>();
  for (const target of summary.buildingTargets) {
    const current = groupedDamage.get(target.type) ?? {
      hits: 0,
      damage: 0,
      reducedToZero: 0,
      minimumStructuralUtilization: target.minimumStructuralUtilization,
      floorApplied: false
    };

    current.hits += 1;
    current.damage += target.damage;
    current.reducedToZero += target.reducedToZero ? 1 : 0;
    current.minimumStructuralUtilization = target.minimumStructuralUtilization;
    current.floorApplied = current.floorApplied
      || (target.minimumStructuralUtilization > 0 && target.structuralUtilization <= target.minimumStructuralUtilization);
    groupedDamage.set(target.type, current);
  }

  const detailLines = [...groupedDamage.entries()]
    .map(([type, entry]) => {
      const floorSuffix = entry.floorApplied
        ? `, bunker floor active at ${Math.round(entry.minimumStructuralUtilization * 100)}%`
        : '';
      const zeroSuffix = entry.reducedToZero > 0
        ? `, reduced to 0 SP x${entry.reducedToZero}`
        : '';
      return `${type}: hits ${entry.hits}, damage ${entry.damage}${zeroSuffix}${floorSuffix}`;
    });
  const groupedDefenceDamage = new Map<string, { hits: number; damage: number; destroyed: number }>();
  for (const target of summary.defenceTargets) {
    const current = groupedDefenceDamage.get(target.type) ?? {
      hits: 0,
      damage: 0,
      destroyed: 0
    };
    current.hits += 1;
    current.damage += target.damage;
    current.destroyed += target.destroyed ? 1 : 0;
    groupedDefenceDamage.set(target.type, current);
  }
  const defenceDetailLines = [...groupedDefenceDamage.entries()]
    .map(([type, entry]) => `${type}: hits ${entry.hits}, damage ${entry.damage}${entry.destroyed > 0 ? `, destroyed x${entry.destroyed}` : ''}`);
  const priorityLines = hasAnyBombardmentPriority(fleet.bombardmentPriorities)
    ? [
      `Priorities: Main ${bombardmentPriorityLabel(fleet.bombardmentPriorities?.main)}, `
      + `Secondary ${bombardmentPriorityLabel(fleet.bombardmentPriorities?.secondary)}, `
      + `Tertiary ${bombardmentPriorityLabel(fleet.bombardmentPriorities?.tertiary)}`
    ]
    : ['Priorities: random'];

  const report = new BuildingsReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Bombardment Report: ${fleet.missionType} at ${targetPlanet.basicInfo.name}`,
      sourceCoordinates: toPlanetReportCoordinates(targetPlanet),
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: player.playerName
    },
    [
      `Bombardment mission: ${fleet.missionType}`,
      `Target: ${targetPlanet.basicInfo.name}`,
      `Shots: ${summary.shots}`,
      `Hits: ${summary.hits}`,
      `Total structural damage: ${summary.totalDamage}`,
      `Planetary bombs launched: ${summary.bombsLaunched}`,
      `Planetary bombs activated: ${summary.bombsActivated}`,
      `Planetary bombs intercepted: ${summary.bombsIntercepted}`,
      `Planetary bombs lost: ${summary.bombsLost}`,
      ...priorityLines,
      `Buildings engaged: ${summary.buildingTargetCount}`,
      `Defences engaged: ${summary.defenceTargetCount}`,
      'Building damage summary:',
      ...(detailLines.length > 0 ? detailLines : ['No lasting building damage recorded.']),
      'Defence damage summary:',
      ...(defenceDetailLines.length > 0 ? defenceDetailLines : ['No lasting defence damage recorded.'])
    ].join('\n')
  );
  player.addReport(report);
}

function addRepairReturnSummaryReport(
  player: Player | null,
  fleet: Fleet,
  targetPlanet: Planet,
  resolvedTurnNumber: number
): void {
  if (!player || player.type !== PlayerType.PLAYER) {
    return;
  }

  const report = new FleetReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Repair Report: ${targetPlanet.basicInfo.name} stabilized`,
      sourceCoordinates: toPlanetReportCoordinates(targetPlanet),
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: player.playerName
    },
    [
      `Repair mission completed at ${targetPlanet.basicInfo.name}.`,
      'No non-hostile damaged ships, buildings, or defences remained at the target.',
      `Fleet ${fleet.fleetId} is returning to ${fleet.originPlanetName}.`
    ].join('\n')
  );
  player.addReport(report);
}

function addBattleFleetReport(player: Player, fleetReport: FleetReport): void {
  if (player.type !== PlayerType.PLAYER) {
    return;
  }

  player.addReport(fleetReport);
}

function addFleetSuccessReport(
  player: Player,
  fleet: Fleet,
  resolvedTurnNumber: number,
  body: string
): void {
  if (player.type !== PlayerType.PLAYER) {
    return;
  }

  const report = new FleetReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Fleet Arrived: ${fleet.missionType} to ${fleet.targetPlanetName}`,
      sourceCoordinates: { ...fleet.target },
      sourcePlanetName: fleet.targetPlanetName,
      senderPlayerName: player.playerName
    },
    body
  );
  player.addReport(report);
}

function addFleetFailureReport(
  player: Player,
  fleet: Fleet,
  resolvedTurnNumber: number,
  reason: string
): void {
  if (player.type !== PlayerType.PLAYER) {
    return;
  }

  const report = new FleetReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Fleet Failed: ${fleet.missionType} to ${fleet.targetPlanetName}`,
      sourceCoordinates: { ...fleet.target },
      sourcePlanetName: fleet.targetPlanetName,
      senderPlayerName: player.playerName
    },
    `${reason}\n\nFleet turned around and started a failure return flight.`
  );
  player.addReport(report);
}

function addFleetDrawReport(
  player: Player,
  fleet: Fleet,
  resolvedTurnNumber: number,
  body: string
): void {
  if (player.type !== PlayerType.PLAYER) {
    return;
  }

  const report = new FleetReport(
    {
      reportId: player.createReportId(),
      createdTurn: resolvedTurnNumber,
      title: `Fleet Draw: ${fleet.missionType} at ${fleet.targetPlanetName}`,
      sourceCoordinates: { ...fleet.target },
      sourcePlanetName: fleet.targetPlanetName,
      senderPlayerName: player.playerName
    },
    body
  );
  player.addReport(report);
}

function addMissionReports(
  player: Player,
  fleet: Fleet,
  resolvedTurnNumber: number,
  reports: Array<{ kind: 'success' | 'failure' | 'draw'; body: string }>
): void {
  for (const report of reports) {
    switch (report.kind) {
      case 'success':
        addFleetSuccessReport(player, fleet, resolvedTurnNumber, report.body);
        break;
      case 'failure':
        addFleetFailureReport(player, fleet, resolvedTurnNumber, report.body);
        break;
      case 'draw':
        addFleetDrawReport(player, fleet, resolvedTurnNumber, report.body);
        break;
      default:
        break;
    }
  }
}

function clearResearchHelpers(
  mainPlanet: Planet,
  helperLabs: Array<{ x: number; y: number; z: number }>,
  planetById: Map<string, Planet>
): void {
  const mainPlanetId = toPlanetCoordinatesId(mainPlanet);
  for (const helperCoordinates of helperLabs) {
    const helperPlanet = planetById.get(
      toCoordinatesId(helperCoordinates.x, helperCoordinates.y, helperCoordinates.z)
    );
    if (!helperPlanet?.rBDSFTQ.researchHelperFor) {
      continue;
    }

    const helperTarget = helperPlanet.rBDSFTQ.researchHelperFor.mainResearchCoordinates;
    const helperTargetId = toCoordinatesId(helperTarget.x, helperTarget.y, helperTarget.z);
    if (helperTargetId !== mainPlanetId) {
      continue;
    }

    helperPlanet.rBDSFTQ.researchHelperFor = null;
  }
}

function toPlanetCoordinatesId(planet: Planet): string {
  return toCoordinatesId(
    planet.basicInfo.solarSystem.coordinates.x,
    planet.basicInfo.solarSystem.coordinates.y,
    Math.max(0, planet.basicInfo.order - 1)
  );
}

function toPlanetReportCoordinates(planet: Planet): { x: number; y: number; z: number } {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: Math.max(0, planet.basicInfo.order - 1)
  };
}

function toCoordinatesId(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

function toEncounterLocationKey(location: { kind: 'planetOrbit'; x: number; y: number; z: number } | { kind: 'starSystem'; x: number; y: number }): string {
  if (location.kind === 'planetOrbit') {
    return `planetOrbit:${location.x}:${location.y}:${location.z}`;
  }

  return `starSystem:${location.x}:${location.y}`;
}

function toPlanetOrbitLocationKeyForFleet(fleet: Fleet): string {
  const coordinates = fleet.target;
  return `planetOrbit:${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function toPlanetOrbitLocationKeyForCoordinatesId(coordinatesId: string): string {
  return `planetOrbit:${coordinatesId}`;
}

function shuffleCopy<T>(values: T[]): T[] {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function compareEncounterArrivalPriority(
  left: PlanetOrbitEncounterArrival,
  right: PlanetOrbitEncounterArrival
): number {
  const priorityByMissionType: Partial<Record<FleetMissionType, number>> = {
    [FleetMissionType.DEFEND]: 0,
    [FleetMissionType.ATTACK]: 1,
    [FleetMissionType.PLUNDER]: 2,
    [FleetMissionType.BOMBARD]: 3,
    [FleetMissionType.SIEGE]: 4,
    [FleetMissionType.MOVE]: 5,
    [FleetMissionType.TRANSPORT]: 6,
    [FleetMissionType.SPY]: 7,
    [FleetMissionType.COLONIZE]: 8,
    [FleetMissionType.INVADE]: 9,
    [FleetMissionType.BLOCK]: 10,
    [FleetMissionType.INTERCEPT]: 11,
    [FleetMissionType.STAR_SYSTEM_SPY]: 12,
    [FleetMissionType.RECYCLE]: 13,
    [FleetMissionType.REPAIR]: 14
  };
  const leftPriority = priorityByMissionType[left.fleet.missionType] ?? 999;
  const rightPriority = priorityByMissionType[right.fleet.missionType] ?? 999;
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return left.fleet.fleetId - right.fleet.fleetId;
}

function roundNumber(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
