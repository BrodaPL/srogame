import { BuildingQueueEntry } from '../buildings/building-queue-entry';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { TechnologyBlueprintsFactory } from '../../factories/technology-blueprints.factory';
import { BuildingType } from '../enums/building-type';
import { FleetMissionType } from '../enums/fleet-mission-type';
import { PlayerType } from '../enums/player-type';
import { ShipType } from '../enums/ship-type';
import { TechnologyType } from '../enums/technology-type';
import { Fleet, FleetState } from '../fleets/fleet';
import { Destination } from '../fleets/destination';
import { ManyShips } from '../fleets/many-ships';
import { ShipyardQueueEntry } from '../fleets/shipyard-queue-entry';
import { Galaxy } from '../planets/galaxy';
import { Planet } from '../planets/planet';
import { PlanetType } from '../enums/planet-type';
import { SolarSystem } from '../planets/solar-system';
import { Player } from '../player';
import { ResourcesPack } from '../resources-pack';
import { TechnologyQueueEntry } from '../tech/technology-queue-entry';
import { createTutorialReadState } from '../../tutorial/tutorial-types';

export const SMOKE_TEST_SCENARIO_KEYS = [
  'routeSmoke',
  'turnProgression',
  'fleetLifecycle',
  'battleDebris',
  'damagedShipsUi',
  'smokeSuite'
] as const;

export type SmokeTestScenarioKey = typeof SMOKE_TEST_SCENARIO_KEYS[number];

const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();
const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const TECHNOLOGY_BLUEPRINTS = TechnologyBlueprintsFactory.fromDefaultJson();

export function isSmokeTestScenarioKey(value: unknown): value is SmokeTestScenarioKey {
  return typeof value === 'string' && SMOKE_TEST_SCENARIO_KEYS.includes(value as SmokeTestScenarioKey);
}

export function applySmokeTestScenario(galaxy: Galaxy, scenario: SmokeTestScenarioKey): void {
  switch (scenario) {
    case 'routeSmoke':
      applyRouteSmokeScenario(galaxy);
      return;
    case 'turnProgression':
      applyTurnProgressionScenario(galaxy);
      return;
    case 'fleetLifecycle':
      applyFleetLifecycleScenario(galaxy);
      return;
    case 'battleDebris':
      applyBattleDebrisScenario(galaxy);
      return;
    case 'damagedShipsUi':
      applyDamagedShipsUiScenario(galaxy);
      return;
    case 'smokeSuite':
      applySmokeSuiteScenario(galaxy);
      return;
  }
}

function applyRouteSmokeScenario(galaxy: Galaxy): void {
  const player = getPrimaryHumanPlayer(galaxy);
  const homePlanet = getHomePlanet(player);
  configureOperationalPlanet(homePlanet, {
    resources: new ResourcesPack(900, 700, 500),
    undamagedShips: [
      { type: ShipType.TRANSPORTER, amount: 3 },
      { type: ShipType.SPY_PROBE, amount: 2 },
      { type: ShipType.CRUISER, amount: 1 }
    ]
  });
  galaxy.activeFleets = [];
}

function applyTurnProgressionScenario(galaxy: Galaxy): void {
  const player = getPrimaryHumanPlayer(galaxy);
  const homePlanet = getHomePlanet(player);
  configureOperationalPlanet(homePlanet, {
    resources: new ResourcesPack(25, 20, 15),
    undamagedShips: [{ type: ShipType.TRANSPORTER, amount: 1 }]
  });
  setPlayerTechLevels(player, new Map());
  seedNearCompletionTurnProgression(homePlanet);
  galaxy.activeFleets = [];
}

function applyFleetLifecycleScenario(galaxy: Galaxy): void {
  const player = getPrimaryHumanPlayer(galaxy);
  const homePlanet = getHomePlanet(player);
  configureOperationalPlanet(homePlanet, {
    resources: new ResourcesPack(2200, 1800, 2400),
    undamagedShips: [
      { type: ShipType.TRANSPORTER, amount: 8 },
      { type: ShipType.SPY_PROBE, amount: 4 },
      { type: ShipType.CRUISER, amount: 3 }
    ]
  });

  setPlayerTechLevels(player, new Map([
    [TechnologyType.COMPUTER_TECHNOLOGY, 2],
    [TechnologyType.ESPIONAGE_TECHNOLOGY, 1],
    [TechnologyType.FUSION_DRIVE, 2],
    [TechnologyType.HYPERSPACE_DRIVE, 1],
    [TechnologyType.HYPERSPACE_TECHNOLOGY, 1]
  ]));

  const remoteOwnedPlanet = ensureOwnedPlanetInNearbySystem(galaxy, player, homePlanet);
  configureOperationalPlanet(remoteOwnedPlanet, {
    resources: new ResourcesPack(600, 400, 350),
    undamagedShips: []
  });

  const spyTarget = ensureNeutralTargetPlanet(
    galaxy,
    homePlanet.basicInfo.solarSystem,
    'Smoke Target',
    homePlanet
  );
  configureNeutralPlanet(spyTarget.planet, {
    resources: new ResourcesPack(350, 200, 150),
    undamagedShips: [{ type: ShipType.FIGHTER, amount: 1 }]
  });

  galaxy.activeFleets = [];
}

function applyBattleDebrisScenario(galaxy: Galaxy): void {
  const player = getPrimaryHumanPlayer(galaxy);
  const homePlanet = getHomePlanet(player);
  configureOperationalPlanet(homePlanet, {
    resources: new ResourcesPack(1600, 1200, 1800),
    undamagedShips: [{ type: ShipType.TRANSPORTER, amount: 4 }]
  });

  const hostileTarget = ensureNeutralTargetPlanet(
    galaxy,
    homePlanet.basicInfo.solarSystem,
    'Battle Target',
    homePlanet
  );
  configureNeutralPlanet(hostileTarget.planet, {
    resources: new ResourcesPack(500, 300, 200),
    undamagedShips: [{ type: ShipType.MOTHER_SHIP, amount: 1 }]
  });
  hostileTarget.planet.rBDSFTQ.spaceDebris = new ResourcesPack(0, 0, 0);

  galaxy.activeFleets = [
    new Fleet(
      1,
      player.playerId,
      FleetMissionType.TRANSPORT,
      destinationOf(homePlanet),
      destinationOf(hostileTarget.planet),
      homePlanet.basicInfo.name,
      hostileTarget.planet.basicInfo.name,
      manyUndamagedShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(120, 80, 30),
      2,
      600,
      230,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      galaxy.currentTurn
    )
  ];
  galaxy.nextFleetId = 2;
}

function applyDamagedShipsUiScenario(galaxy: Galaxy): void {
  const player = getPrimaryHumanPlayer(galaxy);
  const homePlanet = getHomePlanet(player);
  configureOperationalPlanet(homePlanet, {
    resources: new ResourcesPack(1000, 750, 600),
    undamagedShips: [
      { type: ShipType.TRANSPORTER, amount: 3 },
      { type: ShipType.CRUISER, amount: 1 }
    ],
    damagedShips: [
      { type: ShipType.TRANSPORTER, hull: Math.max(1, shipHullCapacity(ShipType.TRANSPORTER) - 40) },
      { type: ShipType.TRANSPORTER, hull: Math.max(1, shipHullCapacity(ShipType.TRANSPORTER) - 90) },
      { type: ShipType.CRUISER, hull: Math.max(1, shipHullCapacity(ShipType.CRUISER) - 35) }
    ]
  });
  galaxy.activeFleets = [];
}

function applySmokeSuiteScenario(galaxy: Galaxy): void {
  applyFleetLifecycleScenario(galaxy);

  const player = getPrimaryHumanPlayer(galaxy);
  setPlayerTechLevels(player, new Map([
    [TechnologyType.COMPUTER_TECHNOLOGY, 2],
    [TechnologyType.ESPIONAGE_TECHNOLOGY, 1],
    [TechnologyType.FUSION_DRIVE, 2],
    [TechnologyType.HYPERSPACE_DRIVE, 1],
    [TechnologyType.HYPERSPACE_TECHNOLOGY, 1]
  ]));

  const homePlanet = getHomePlanet(player);
  addDamagedShips(homePlanet, [
    { type: ShipType.TRANSPORTER, hull: Math.max(1, shipHullCapacity(ShipType.TRANSPORTER) - 40) },
    { type: ShipType.TRANSPORTER, hull: Math.max(1, shipHullCapacity(ShipType.TRANSPORTER) - 90) },
    { type: ShipType.CRUISER, hull: Math.max(1, shipHullCapacity(ShipType.CRUISER) - 35) }
  ]);
  seedNearCompletionTurnProgression(homePlanet);

  const battleTarget = ensureNeutralTargetPlanet(
    galaxy,
    findNearestDifferentSystem(galaxy, homePlanet.basicInfo.solarSystem),
    'Debris Target'
  );
  configureNeutralPlanet(battleTarget.planet, {
    resources: new ResourcesPack(500, 300, 200),
    undamagedShips: [{ type: ShipType.MOTHER_SHIP, amount: 1 }]
  });
  battleTarget.planet.rBDSFTQ.spaceDebris = new ResourcesPack(0, 0, 0);

  galaxy.activeFleets = [
    new Fleet(
      1,
      player.playerId,
      FleetMissionType.TRANSPORT,
      destinationOf(homePlanet),
      destinationOf(battleTarget.planet),
      homePlanet.basicInfo.name,
      battleTarget.planet.basicInfo.name,
      manyUndamagedShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(120, 80, 30),
      2,
      600,
      230,
      Math.max(1, distanceBetween(homePlanet, battleTarget.planet)),
      Math.max(1, distanceBetween(homePlanet, battleTarget.planet)),
      FleetState.MOVING_TO_TARGET,
      galaxy.currentTurn
    )
  ];
  galaxy.nextFleetId = 2;
}

function configureOperationalPlanet(
  planet: Planet,
  options: {
    resources: ResourcesPack;
    undamagedShips: Array<{ type: ShipType; amount: number }>;
    damagedShips?: Array<{ type: ShipType; hull: number }>;
  }
): void {
  setBuildingLevels(planet, new Map([
    [BuildingType.METAL_MINE, 5],
    [BuildingType.CRYSTAL_MINE, 4],
    [BuildingType.DEUTERIUM_SYNTHESIZER, 3],
    [BuildingType.SOLAR_WIND_GEOTHERMAL, 6],
    [BuildingType.METAL_STORAGE, 8],
    [BuildingType.CRYSTAL_STORAGE, 8],
    [BuildingType.DEUTERIUM_TANK, 8],
    [BuildingType.ROBOTICS_FACTORY, 2],
    [BuildingType.SHIPYARD, 2],
    [BuildingType.RESEARCH_LAB, 2]
  ]));

  planet.rBDSFTQ.resources = new ResourcesPack(
    options.resources.metal,
    options.resources.crystal,
    options.resources.deuterium
  );
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
  planet.rBDSFTQ.researchHelperFor = null;
  planet.rBDSFTQ.fleets = [];
  planet.rBDSFTQ.spaceDebris = new ResourcesPack(0, 0, 0);
  planet.rBDSFTQ.ships = ManyShips.empty();

  for (const entry of options.undamagedShips) {
    planet.rBDSFTQ.ships.addUndamaged(entry.type, entry.amount);
  }

  for (const entry of options.damagedShips ?? []) {
    planet.rBDSFTQ.ships.addDamaged(entry.type, entry.hull);
  }
}

function seedNearCompletionTurnProgression(planet: Planet): void {
  const shipyardCurrentLevel = planet.getBuildingLevel(BuildingType.SHIPYARD);
  const shipyardNextLevel = Math.max(1, shipyardCurrentLevel + 1);
  const shipyardUpgradeCost = Math.floor(
    BUILDING_BLUEPRINTS.get(BuildingType.SHIPYARD)?.getCostForLevel(shipyardNextLevel).getTotalResourceAmount() ?? 1
  );
  planet.rBDSFTQ.buildingQueue = [
    new BuildingQueueEntry(
      BuildingType.SHIPYARD,
      shipyardNextLevel,
      Math.max(0, shipyardUpgradeCost - 1)
    )
  ];

  const fighterCost = Math.floor(
    SHIP_BLUEPRINTS.get(ShipType.FIGHTER)?.cost.getTotalResourceAmount() ?? 1
  );
  planet.rBDSFTQ.shipyardQueue = [
    new ShipyardQueueEntry(
      ShipType.FIGHTER,
      1,
      Math.max(0, fighterCost - 1)
    )
  ];

  const researchCost = Math.floor(
    TECHNOLOGY_BLUEPRINTS.get(TechnologyType.ENERGY_TECHNOLOGY)?.getCostForLevel(1).getTotalResourceAmount() ?? 1
  );
  planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
    TechnologyType.ENERGY_TECHNOLOGY,
    1,
    Math.max(0, researchCost - 1),
    []
  );
  planet.rBDSFTQ.researchHelperFor = null;
}

function configureNeutralPlanet(
  planet: Planet,
  options: {
    resources: ResourcesPack;
    undamagedShips: Array<{ type: ShipType; amount: number }>;
  }
): void {
  setBuildingLevels(planet, new Map([
    [BuildingType.METAL_MINE, 3],
    [BuildingType.CRYSTAL_MINE, 2],
    [BuildingType.DEUTERIUM_SYNTHESIZER, 2],
    [BuildingType.SOLAR_WIND_GEOTHERMAL, 4],
    [BuildingType.METAL_STORAGE, 5],
    [BuildingType.CRYSTAL_STORAGE, 5],
    [BuildingType.DEUTERIUM_TANK, 5]
  ]));

  planet.rBDSFTQ.resources = new ResourcesPack(
    options.resources.metal,
    options.resources.crystal,
    options.resources.deuterium
  );
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
  planet.rBDSFTQ.researchHelperFor = null;
  planet.rBDSFTQ.fleets = [];
  planet.rBDSFTQ.ships = ManyShips.empty();
  for (const entry of options.undamagedShips) {
    planet.rBDSFTQ.ships.addUndamaged(entry.type, entry.amount);
  }
}

function setBuildingLevels(planet: Planet, levels: Map<BuildingType, number>): void {
  planet.rBDSFTQ.buildingsLevels.clear();
  planet.rBDSFTQ.buildingsCurrentPowerConsumption.clear();
  for (const [buildingType, level] of levels.entries()) {
    planet.setBuildingLevel(buildingType, level);
  }
}

function setPlayerTechLevels(player: Player, levels: Map<TechnologyType, number>): void {
  player.tech.clear();
  for (const [technologyType, level] of levels.entries()) {
    player.setTechLevel(technologyType, level);
  }
}

function ensureOwnedPlanetInNearbySystem(galaxy: Galaxy, player: Player, homePlanet: Planet): Planet {
  const existingRemotePlanet = player.planets.find((planet) =>
    distanceBetween(planet, homePlanet) > 0
  );
  if (existingRemotePlanet) {
    return existingRemotePlanet;
  }

  const targetSystem = findNearestDifferentSystem(galaxy, homePlanet.basicInfo.solarSystem);
  const targetPlanet = ensureAvailablePlanet(targetSystem);
  return claimPlanetForPlayer(galaxy, player, targetSystem, targetPlanet, {
    resetToStartingPlanet: true
  });
}

function ensureNeutralTargetPlanet(
  galaxy: Galaxy,
  preferredSystem: SolarSystem,
  playerNamePrefix: string,
  excludedPlanet?: Planet
): { planet: Planet; owner: Player } {
  const candidate = ensureSecondaryPlanet(preferredSystem, excludedPlanet);
  return assignPlanetToDedicatedNeutralPlayer(galaxy, candidate, playerNamePrefix);
}

function ensureAvailablePlanet(system: SolarSystem): Planet {
  const candidate = system.planets.find((planet) => planet.basicInfo.type !== PlanetType.ASTEROIDS);
  if (candidate) {
    return candidate;
  }

  return createAdditionalPlanet(system);
}

function ensureSecondaryPlanet(system: SolarSystem, excludedPlanet?: Planet): Planet {
  const candidate = system.planets.find((planet) =>
    planet.basicInfo.type !== PlanetType.ASTEROIDS
    && planet !== excludedPlanet
  );
  if (candidate) {
    return candidate;
  }

  return createAdditionalPlanet(system);
}

function createAdditionalPlanet(system: SolarSystem): Planet {
  const nextOrder = system.planets.reduce((maxOrder, planet) => Math.max(maxOrder, planet.basicInfo.order), 0) + 1;
  const planet = Planet.createRandomEmpty('', nextOrder, system, null);
  planet.basicInfo.name = `${system.name} ${nextOrder}-${planet.basicInfo.type.charAt(0)}`;
  system.planets.push(planet);
  return planet;
}

function claimPlanetForPlayer(
  galaxy: Galaxy,
  player: Player,
  system: SolarSystem,
  planet: Planet,
  options: { resetToStartingPlanet: boolean }
): Planet {
  const planetIndex = system.planets.indexOf(planet);
  const ownedPlanet = options.resetToStartingPlanet
    ? Planet.createStartingPlanet(planet.basicInfo.name, planet.basicInfo.order, system, player.playerId)
    : planet;

  ownedPlanet.info.ownerId = player.playerId;
  ownedPlanet.basicInfo.name = planet.basicInfo.name;

  if (planetIndex >= 0 && ownedPlanet !== planet) {
    system.planets[planetIndex] = ownedPlanet;
  }

  detachPlanetFromPreviousOwner(galaxy, planet);
  if (!player.planets.includes(ownedPlanet)) {
    player.planets.push(ownedPlanet);
  }

  return ownedPlanet;
}

function assignPlanetToDedicatedNeutralPlayer(
  galaxy: Galaxy,
  planet: Planet,
  playerNamePrefix: string
): { planet: Planet; owner: Player } {
  detachPlanetFromPreviousOwner(galaxy, planet);

  const playerId = nextAvailablePlayerId(galaxy);
  const neutralPlayer = new Player(
    playerId,
    `${playerNamePrefix} ${playerId}`,
    [planet],
    new Map(),
    [],
    PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );

  planet.info.ownerId = playerId;
  galaxy.players.push(neutralPlayer);
  galaxy.neutralPlayerMap.set(neutralPlayer.playerId, neutralPlayer);
  galaxy.playerNameMap.set(neutralPlayer.playerName, neutralPlayer.playerId);

  return { planet, owner: neutralPlayer };
}

function detachPlanetFromPreviousOwner(galaxy: Galaxy, planet: Planet): void {
  if (planet.info.ownerId === null) {
    return;
  }

  const previousOwner = galaxy.players.find((candidate) => candidate.playerId === planet.info.ownerId);
  if (!previousOwner) {
    planet.info.ownerId = null;
    return;
  }

  previousOwner.planets = previousOwner.planets.filter((candidate) => candidate !== planet);
  if (previousOwner.planets.length === 0 && previousOwner.type !== PlayerType.PLAYER) {
    galaxy.players = galaxy.players.filter((candidate) => candidate !== previousOwner);
    galaxy.botPlayerMap.delete(previousOwner.playerId);
    galaxy.neutralPlayerMap.delete(previousOwner.playerId);
    galaxy.playerNameMap.delete(previousOwner.playerName);
  }

  planet.info.ownerId = null;
}

function nextAvailablePlayerId(galaxy: Galaxy): number {
  return galaxy.players.reduce((maxId, player) => Math.max(maxId, player.playerId), 0) + 1;
}

function getPrimaryHumanPlayer(galaxy: Galaxy): Player {
  const player = galaxy.players.find((candidate) => candidate.type === PlayerType.PLAYER);
  if (!player) {
    throw new Error('Smoke test scenario requires a human player.');
  }

  return player;
}

function getHomePlanet(player: Player): Planet {
  const planet = player.planets[0];
  if (!planet) {
    throw new Error('Smoke test scenario requires at least one owned planet.');
  }

  return planet;
}

function findNearestDifferentSystem(galaxy: Galaxy, originSystem: SolarSystem): SolarSystem {
  const candidates = galaxy.stars
    .flatMap((row) => row)
    .filter((system) =>
      !system.isVoid
      && !system.isGalaxyCenter
      && system !== originSystem
    )
    .sort((left, right) =>
      systemDistance(originSystem, left) - systemDistance(originSystem, right)
    );

  return candidates[0] ?? originSystem;
}

function coordinatesOf(planet: Planet): { x: number; y: number; z: number } {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: planet.basicInfo.order - 1
  };
}

function destinationOf(planet: Planet): Destination {
  const coordinates = coordinatesOf(planet);
  return new Destination(coordinates.x, coordinates.y, coordinates.z);
}

function distanceBetween(left: Planet, right: Planet): number {
  return (
    Math.abs(left.basicInfo.solarSystem.coordinates.x - right.basicInfo.solarSystem.coordinates.x)
    + Math.abs(left.basicInfo.solarSystem.coordinates.y - right.basicInfo.solarSystem.coordinates.y)
    + Math.abs(left.basicInfo.order - right.basicInfo.order)
  );
}

function systemDistance(left: SolarSystem, right: SolarSystem): number {
  return (
    Math.abs(left.coordinates.x - right.coordinates.x)
    + Math.abs(left.coordinates.y - right.coordinates.y)
  );
}

function shipHullCapacity(shipType: ShipType): number {
  return SHIP_BLUEPRINTS.get(shipType)?.hullPointsCapacity ?? 1;
}

function addDamagedShips(
  planet: Planet,
  entries: Array<{ type: ShipType; hull: number }>
): void {
  for (const entry of entries) {
    planet.rBDSFTQ.ships.addDamaged(entry.type, entry.hull);
  }
}

function manyUndamagedShips(entry: { type: ShipType; amount: number }): ManyShips {
  const ships = ManyShips.empty();
  ships.addUndamaged(entry.type, entry.amount);
  return ships;
}
