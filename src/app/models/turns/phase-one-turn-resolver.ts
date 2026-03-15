import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { TechnologyBlueprintsFactory } from '../../factories/technology-blueprints.factory';
import { BuildingType } from '../enums/building-type';
import { TechnologyType } from '../enums/technology-type';
import { Ship } from '../fleets/ship';
import { ShipInstance } from '../fleets/ship-instance';
import { Galaxy } from '../planets/galaxy';
import { Planet } from '../planets/planet';
import { Player } from '../player';
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

const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();
const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const TECHNOLOGY_BLUEPRINTS = TechnologyBlueprintsFactory.fromDefaultJson();
const ALL_BUILDING_TYPES = Array.from(BUILDING_BLUEPRINTS.buildingsMap.keys());

export function resolvePhaseOneTurn(galaxy: Galaxy): void {
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
            techLevelsByPlayerId.get(planet.info.ownerId ?? -1) ?? null
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
    advanceResearchQueue(planet, owner, totalResearchPower, planetById);
  }
}

function createPlanetTurnSnapshot(
  planet: Planet,
  coordinatesId: string,
  techLevels: Map<TechnologyType, number> | null
): PlanetTurnSnapshot {
  const adaptiveTechnologyLevel = techLevels?.get(TechnologyType.ADAPTIVE_TECHNOLOGY) ?? 0;
  const computerTechnologyLevel = techLevels?.get(TechnologyType.COMPUTER_TECHNOLOGY) ?? 0;
  const energyTechnologyLevel = techLevels?.get(TechnologyType.ENERGY_TECHNOLOGY) ?? 0;
  const intergalacticResearchNetworkLevel = techLevels?.get(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK) ?? 0;
  const energyState = calculateEnergyState(planet, energyTechnologyLevel);
  const energyEfficiency = energyDeficitEfficiencyMultiplier(energyState.available, energyState.used);
  const naniteMultiplier = planet.getBuildingLevel(BuildingType.NANITE_FACTORY) <= 0
    ? 1
    : planet.getBuildingProductionValue1(BuildingType.NANITE_FACTORY);
  const roboticsPower = planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY) <= 0
    ? 5
    : planet.getBuildingProductionValue1(BuildingType.ROBOTICS_FACTORY);
  const shipyardBasePower = planet.getBuildingLevel(BuildingType.SHIPYARD) <= 0
    ? 0
    : planet.getBuildingProductionValue1(BuildingType.SHIPYARD);
  const researchLabBasePower = planet.getBuildingProductionValue1(BuildingType.RESEARCH_LAB);
  const industryModifier = planet.info.planetaryParameters.industryModifier;
  const scienceModifier = planet.info.planetaryParameters.scienceModifier;
  const adaptiveIndustryMultiplier = industryPowerMultiplier(adaptiveTechnologyLevel);
  const totalResearchMultiplier = researchPowerMultiplier(
    computerTechnologyLevel,
    adaptiveTechnologyLevel,
    intergalacticResearchNetworkLevel
  );

  return {
    coordinatesId,
    ownerId: planet.info.ownerId,
    metalIncome: Math.floor(planet.getMetalGain(adaptiveTechnologyLevel) * energyEfficiency),
    crystalIncome: Math.floor(planet.getCrystalGain(adaptiveTechnologyLevel) * energyEfficiency),
    deuteriumIncome: Math.floor(planet.getDeuteriumGain(adaptiveTechnologyLevel) * energyEfficiency),
    metalCapacity: planet.getBuildingProductionValue1(BuildingType.METAL_STORAGE),
    crystalCapacity: planet.getBuildingProductionValue1(BuildingType.CRYSTAL_STORAGE),
    deuteriumCapacity: planet.getBuildingProductionValue1(BuildingType.DEUTERIUM_TANK),
    industryPower: Math.max(0, Math.floor(
      roboticsPower
      * naniteMultiplier
      * industryModifier
      * adaptiveIndustryMultiplier
      * energyEfficiency
    )),
    shipyardPower: Math.max(0, Math.floor(
      shipyardBasePower
      * naniteMultiplier
      * industryModifier
      * adaptiveIndustryMultiplier
      * energyEfficiency
    )),
    researchPower: Math.max(0, Math.floor(
      researchLabBasePower
      * totalResearchMultiplier
      * scienceModifier
      * energyEfficiency
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
    const blueprint = SHIP_BLUEPRINTS.get(queueEntry.shipType);
    if (!blueprint) {
      planet.rBDSFTQ.shipyardQueue.shift();
      continue;
    }

    const singleShipCost = Math.max(0, Math.floor(blueprint.cost.getTotalResourceAmount()));
    const totalRequiredPower = singleShipCost * Math.max(0, Math.floor(queueEntry.amount));
    if (totalRequiredPower <= 0) {
      addProducedShipsToPlanet(planet, blueprint, queueEntry.amount);
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

    addProducedShipsToPlanet(planet, blueprint, queueEntry.amount);
    planet.rBDSFTQ.shipyardQueue.shift();
  }
}

function addProducedShipsToPlanet(
  planet: Planet,
  blueprint: Ship,
  amount: number
): void {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  for (let index = 0; index < normalizedAmount; index += 1) {
    planet.rBDSFTQ.ships.push(new ShipInstance(
      blueprint,
      blueprint.hullPointsCapacity,
      blueprint.shieldCapacity,
      0,
      []
    ));
  }
}

function advanceResearchQueue(
  planet: Planet,
  player: Player,
  researchPower: number,
  planetById: Map<string, Planet>
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

function toCoordinatesId(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

function roundNumber(value: number, precision: number): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}
