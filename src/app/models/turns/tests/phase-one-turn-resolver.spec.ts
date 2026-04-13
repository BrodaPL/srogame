import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildingBlueprintsFactory } from '../../../factories/building-blueprints.factory';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { BuildingQueueEntry } from '../../buildings/building-queue-entry';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { DefenceType } from '../../enums/defence-type';
import { BuildingType } from '../../enums/building-type';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { PlayerType } from '../../enums/player-type';
import { ShipType } from '../../enums/ship-type';
import { TechnologyType } from '../../enums/technology-type';
import { ManyDefences } from '../../defences/many-defences';
import { Fleet, FleetOrbitActivity, FleetState } from '../../fleets/fleet';
import { ManyShips } from '../../fleets/many-ships';
import { ShipInstance } from '../../fleets/ship-instance';
import { ShipyardQueueEntry } from '../../fleets/shipyard-queue-entry';
import { Galaxy } from '../../planets/galaxy';
import { Planet } from '../../planets/planet';
import { SolarSystem } from '../../planets/solar-system';
import { Player } from '../../player';
import { ResourcesPack } from '../../resources-pack';
import { TechnologyQueueEntry } from '../../tech/technology-queue-entry';
import { resolvePhaseOneTurn } from '../phase-one-turn-resolver';

const blueprints = ShipBlueprintsFactory.fromDefaultJson();
const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson().buildingsMap;

function point(x: number, y: number, z: number) {
  return { x, y, z };
}

function shipInstance(type: ShipType): ShipInstance {
  const blueprint = blueprints.get(type);
  if (!blueprint) {
    throw new Error(`Missing blueprint for ${type}`);
  }

  return new ShipInstance(blueprint, blueprint.hullPointsCapacity, blueprint.shieldCapacity, 0, []);
}

function manyShips(...entries: Array<{ type: ShipType; amount: number }>): ManyShips {
  const ships = ManyShips.empty();
  for (const entry of entries) {
    ships.addUndamaged(entry.type, entry.amount);
  }

  return ships;
}

function mixedShips(options: {
  undamaged?: Array<{ type: ShipType; amount: number }>;
  damaged?: Array<{ type: ShipType; missingHull: number }>;
}): ManyShips {
  const ships = ManyShips.empty();
  for (const entry of options.undamaged ?? []) {
    ships.addUndamaged(entry.type, entry.amount);
  }

  for (const entry of options.damaged ?? []) {
    const blueprint = blueprints.get(entry.type);
    if (!blueprint) {
      throw new Error(`Missing blueprint for ${entry.type}`);
    }

    ships.addDamaged(entry.type, blueprint.hullPointsCapacity - entry.missingHull);
  }

  return ships;
}

function manyDefences(...entries: Array<{ type: DefenceType; amount: number }>): ManyDefences {
  const defences = ManyDefences.empty();
  for (const entry of entries) {
    defences.addUndamaged(entry.type, entry.amount);
  }

  return defences;
}

function createPlayersAndGalaxy(activeFleet: Fleet, configure: (system: SolarSystem) => void) {
  const system = new SolarSystem('Combat Test', 4, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
  configure(system);
  const attackerPlanet = system.planets[0];
  const defenderPlanetA = system.planets[1];
  const attackerPlanetB = system.planets[2];
  const defenderPlanetB = system.planets[3];

  const attacker = new Player(1, 'Alpha', [attackerPlanet, attackerPlanetB], new Map(), [], PlayerType.PLAYER);
  const defender = new Player(2, 'Beta', [defenderPlanetA, defenderPlanetB], new Map(), [], PlayerType.PLAYER);
  const galaxy = new Galaxy('Combat Galaxy', [attacker, defender], [[system]], 1, [activeFleet], 2);

  return { galaxy, attacker, defender, system };
}

function createGalaxyWithPlayers(
  activeFleets: Fleet[],
  configure: (system: SolarSystem) => void,
  buildPlayers: (system: SolarSystem) => Player[]
) {
  const system = new SolarSystem('Combat Test', 4, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
  configure(system);
  const players = buildPlayers(system);
  const galaxy = new Galaxy('Combat Galaxy', players, [[system]], 1, activeFleets, 2);

  return { galaxy, players, system };
}

describe('resolvePhaseOneTurn battle integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('turns a hostile move victory into a failure return and creates battle reports', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const moveFleet = new Fleet(
      1,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Frontier',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(40, 20, 10),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, attacker, defender, system } = createPlayersAndGalaxy(moveFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Frontier';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.SPY_PROBE)]);
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    const destroyedSpyProbeCost = blueprints.get(ShipType.SPY_PROBE)!.cost;
    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.MISSION_FAILURE_RETURNING);
    expect(ManyShips.countByType(galaxy.activeFleets[0].ships).get(ShipType.TITAN)).toBe(1);
    expect(galaxy.activeFleets[0].cargo.metal).toBe(40);
    expect(ManyShips.totalShipsCount(system.planets[1].rBDSFTQ.ships)).toBe(0);
    expect(system.planets[1].rBDSFTQ.spaceDebris.metal).toBe(Math.floor(destroyedSpyProbeCost.metal * 0.2));
    expect(system.planets[1].rBDSFTQ.spaceDebris.crystal).toBe(Math.floor(destroyedSpyProbeCost.crystal * 0.2));
    expect(system.planets[1].rBDSFTQ.spaceDebris.deuterium).toBe(Math.floor(destroyedSpyProbeCost.deuterium * 0.05));
    expect(attacker.reports.some((report) =>
      report.title.startsWith('Battle Report:')
    )).toBe(true);
    expect(attacker.reports.some((report) =>
      report.title.startsWith('Fleet Failed: Move')
    )).toBe(true);
    expect(defender.reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(true);
  });

  it('keeps pending jump gate fleets waiting at origin through end turn resolution', () => {
    const waitingFleet = new Fleet(
      90,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Frontier',
      manyShips({ type: ShipType.TRANSPORTER, amount: 3 }),
      new ResourcesPack(15, 0, 5),
      20,
      600,
      20,
      1,
      1,
      FleetState.PENDING_JUMP_GATE,
      1
    );
    waitingFleet.pendingJumpGateRequestId = 7;
    waitingFleet.usesJumpGate = true;

    const { galaxy, system } = createPlayersAndGalaxy(waitingFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Frontier';
      solarSystem.planets[1].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.PENDING_JUMP_GATE);
    expect(galaxy.activeFleets[0].pendingJumpGateRequestId).toBe(7);
    expect(galaxy.activeFleets[0].originPlanetName).toBe('Alpha Prime');
    expect(system.planets[0].rBDSFTQ.resources.metal).toBe(0);
  });

  it('destroys a hostile transport that loses its arrival battle before cargo delivery', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const transportFleet = new Fleet(
      2,
      1,
      FleetMissionType.TRANSPORT,
      point(1, 1, 2),
      point(1, 1, 3),
      'Alpha Haul',
      'Beta Bastion',
      manyShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(120, 80, 30),
      0,
      600,
      230,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, attacker, defender, system } = createPlayersAndGalaxy(transportFleet, (solarSystem) => {
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[2].basicInfo.name = 'Alpha Haul';
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[3].basicInfo.name = 'Beta Bastion';
      solarSystem.planets[3].info.ownerId = 2;
      solarSystem.planets[3].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.MOTHER_SHIP)]);
      solarSystem.planets[1].info.ownerId = 2;
    });

    const defenderCargoBefore = {
      metal: system.planets[3].rBDSFTQ.resources.metal,
      crystal: system.planets[3].rBDSFTQ.resources.crystal,
      deuterium: system.planets[3].rBDSFTQ.resources.deuterium
    };

    resolvePhaseOneTurn(galaxy);

    const transporterCost = blueprints.get(ShipType.TRANSPORTER)!.cost;
    expect(galaxy.activeFleets).toHaveLength(0);
    expect(system.planets[3].rBDSFTQ.resources.metal).toBe(defenderCargoBefore.metal);
    expect(system.planets[3].rBDSFTQ.resources.crystal).toBe(defenderCargoBefore.crystal);
    expect(system.planets[3].rBDSFTQ.resources.deuterium).toBe(defenderCargoBefore.deuterium);
    expect(ManyShips.totalShipsCount(system.planets[3].rBDSFTQ.ships)).toBeGreaterThan(0);
    expect(system.planets[3].rBDSFTQ.spaceDebris.metal).toBe(Math.floor((transporterCost.metal + 120) * 0.2));
    expect(system.planets[3].rBDSFTQ.spaceDebris.crystal).toBe(Math.floor((transporterCost.crystal + 80) * 0.2));
    expect(system.planets[3].rBDSFTQ.spaceDebris.deuterium).toBe(Math.floor((transporterCost.deuterium + 30) * 0.05));
    expect(attacker.reports.some((report) =>
      report.title.startsWith('Battle Report:')
    )).toBe(true);
    expect(defender.reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(true);
  });

  it('accumulates space debris across repeated battles on the same planet', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const firstFleet = new Fleet(
      10,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Frontier',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createPlayersAndGalaxy(firstFleet, (solarSystem) => {
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Frontier';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.SPY_PROBE)]);
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy, 2);

    const debrisAfterFirstBattle = {
      metal: system.planets[1].rBDSFTQ.spaceDebris.metal,
      crystal: system.planets[1].rBDSFTQ.spaceDebris.crystal,
      deuterium: system.planets[1].rBDSFTQ.spaceDebris.deuterium
    };

    galaxy.activeFleets = [
      new Fleet(
        11,
        1,
        FleetMissionType.MOVE,
        point(1, 1, 0),
        point(1, 1, 1),
        'Alpha Prime',
        'Beta Frontier',
        manyShips({ type: ShipType.TITAN, amount: 1 }),
        new ResourcesPack(0, 0, 0),
        0,
        0,
        0,
        1,
        1,
        FleetState.MOVING_TO_TARGET,
        2
      )
    ];
    system.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.SPY_PROBE)]);

    resolvePhaseOneTurn(galaxy, 3);

    expect(system.planets[1].rBDSFTQ.spaceDebris.metal).toBe(debrisAfterFirstBattle.metal * 2);
    expect(system.planets[1].rBDSFTQ.spaceDebris.crystal).toBe(debrisAfterFirstBattle.crystal * 2);
    expect(system.planets[1].rBDSFTQ.spaceDebris.deuterium).toBe(debrisAfterFirstBattle.deuterium * 2);
  });

  it('destroys excess non-jump survivor ships after battle when carrier hangar space is insufficient', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const moveFleet = new Fleet(
      12,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Frontier',
      manyShips(
        { type: ShipType.CRUISER, amount: 1 },
        { type: ShipType.FIGHTER, amount: 2 }
      ),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createPlayersAndGalaxy(moveFleet, (solarSystem) => {
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Frontier';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.SPY_PROBE)]);
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    const survivingFleet = galaxy.activeFleets[0];
    const survivingFleetCounts = ManyShips.countByType(survivingFleet.ships);
    const spyProbeCost = blueprints.get(ShipType.SPY_PROBE)!.cost;
    const fighterCost = blueprints.get(ShipType.FIGHTER)!.cost;

    expect(survivingFleet.state).toBe(FleetState.MISSION_FAILURE_RETURNING);
    expect(survivingFleetCounts.get(ShipType.CRUISER)).toBe(1);
    expect(survivingFleetCounts.get(ShipType.FIGHTER)).toBe(1);
    expect(ManyShips.totalRequiredHangarCapacity(survivingFleet.ships)).toBeLessThanOrEqual(
      ManyShips.totalTravelHangarCapacity(survivingFleet.ships)
    );
    expect(system.planets[1].rBDSFTQ.spaceDebris.metal).toBe(
      Math.floor((spyProbeCost.metal + fighterCost.metal) * 0.2)
    );
    expect(system.planets[1].rBDSFTQ.spaceDebris.crystal).toBe(
      Math.floor((spyProbeCost.crystal + fighterCost.crystal) * 0.2)
    );
    expect(system.planets[1].rBDSFTQ.spaceDebris.deuterium).toBe(
      Math.floor((spyProbeCost.deuterium + fighterCost.deuterium) * 0.05)
    );
  });

  it('lets same-turn hostile arrivals meet fleets that already entered orbit earlier in the same encounter group', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const firstMoveFleet = new Fleet(
      20,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Unowned Orbit',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );
    const secondMoveFleet = new Fleet(
      21,
      2,
      FleetMissionType.MOVE,
      point(1, 1, 2),
      point(1, 1, 1),
      'Beta Prime',
      'Unowned Orbit',
      manyShips({ type: ShipType.SPY_PROBE, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, players } = createGalaxyWithPlayers(
      [firstMoveFleet, secondMoveFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Unowned Orbit';
        solarSystem.planets[1].info.ownerId = null;
        solarSystem.planets[2].basicInfo.name = 'Beta Prime';
        solarSystem.planets[2].info.ownerId = 2;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.WAR }
    ];

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].ownerId).toBe(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
    expect(ManyShips.countByType(galaxy.activeFleets[0].ships).get(ShipType.TITAN)).toBe(1);
    expect(players[0].reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(true);
    expect(players[1].reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(true);
  });

  it('uses mission priority before fleet id when different hostile arrivals resolve on the same orbit', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const transportFleet = new Fleet(
      30,
      1,
      FleetMissionType.TRANSPORT,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Haul',
      'Gamma Bastion',
      manyShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(50, 0, 0),
      0,
      600,
      50,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );
    const moveFleet = new Fleet(
      31,
      2,
      FleetMissionType.MOVE,
      point(1, 1, 2),
      point(1, 1, 1),
      'Beta Spearhead',
      'Gamma Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, players } = createGalaxyWithPlayers(
      [transportFleet, moveFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Haul';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Gamma Bastion';
        solarSystem.planets[1].info.ownerId = 3;
        solarSystem.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.SPY_PROBE)]);
        solarSystem.planets[2].basicInfo.name = 'Beta Spearhead';
        solarSystem.planets[2].info.ownerId = 2;
        solarSystem.planets[3].info.ownerId = 3;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER),
        new Player(3, 'Gamma', [solarSystem.planets[1], solarSystem.planets[3]], new Map(), [], PlayerType.PLAYER)
      ])
    );

    resolvePhaseOneTurn(galaxy);

    const alphaBattleReports = players[0].reports.filter((report) => report.title.startsWith('Battle Report:'));
    const betaBattleReports = players[1].reports.filter((report) => report.title.startsWith('Battle Report:'));

    expect(betaBattleReports).toHaveLength(1);
    expect(alphaBattleReports).toHaveLength(0);
    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === 2 && fleet.state === FleetState.MISSION_FAILURE_RETURNING)).toBe(true);
    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === 1 && fleet.state === FleetState.MISSION_FAILURE_RETURNING)).toBe(true);
  });

  it('lets move missions idle in allied orbit without merging into the allied planet', () => {
    const moveFleet = new Fleet(
      40,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Relay',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(25, 0, 0),
      0,
      100,
      25,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createGalaxyWithPlayers(
      [moveFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Relay';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[2].info.ownerId = 2;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1], solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED },
      { playerAId: 1, playerBId: 3, status: DiplomaticStatus.WAR },
      { playerAId: 2, playerBId: 3, status: DiplomaticStatus.WAR }
    ];

    const targetPlanetShipsBefore = ManyShips.totalShipsCount(system.planets[1].rBDSFTQ.ships);

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
    expect(galaxy.activeFleets[0].missionType).toBe(FleetMissionType.HOLD);
    expect(galaxy.activeFleets[0].orbitActivity).toBe(FleetOrbitActivity.PASSIVE_HOLD);
    expect(galaxy.activeFleets[0].ownerId).toBe(1);
    expect(galaxy.activeFleets[0].cargo.metal).toBe(25);
    expect(ManyShips.totalShipsCount(system.planets[1].rBDSFTQ.ships)).toBe(targetPlanetShipsBefore);
  });

  it('delivers transport cargo to allied planets and returns home', () => {
    const transportFleet = new Fleet(
      41,
      1,
      FleetMissionType.TRANSPORT,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Depot',
      manyShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(120, 80, 30),
      0,
      600,
      230,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createGalaxyWithPlayers(
      [transportFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Depot';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[2].info.ownerId = 2;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1], solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED },
      { playerAId: 1, playerBId: 3, status: DiplomaticStatus.WAR },
      { playerAId: 2, playerBId: 3, status: DiplomaticStatus.WAR }
    ];

    const targetResourcesBefore = {
      metal: system.planets[1].rBDSFTQ.resources.metal,
      crystal: system.planets[1].rBDSFTQ.resources.crystal,
      deuterium: system.planets[1].rBDSFTQ.resources.deuterium
    };

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].cargo.getTotalResourceAmount()).toBe(0);
    expect(system.planets[1].rBDSFTQ.resources.metal).toBe(targetResourcesBefore.metal + 120);
    expect(system.planets[1].rBDSFTQ.resources.crystal).toBe(targetResourcesBefore.crystal + 80);
    expect(system.planets[1].rBDSFTQ.resources.deuterium).toBe(targetResourcesBefore.deuterium + 30);
  });

  it('prevents auto-combat against peace targets and leaves move fleets idling in orbit', () => {
    const moveFleet = new Fleet(
      42,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Peace',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, players } = createGalaxyWithPlayers(
      [moveFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Peace';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.MOTHER_SHIP)]);
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.PEACE }
    ];

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
    expect(players[0].reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(false);
    expect(players[1].reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(false);
  });

  it('lets passive move-orbit fleets intercept hostile orbit-staying arrivals', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const alliedIdleFleet = new Fleet(
      50,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.PASSIVE_HOLD
    );
    const hostileSiegeFleet = new Fleet(
      51,
      3,
      FleetMissionType.SIEGE,
      point(1, 1, 2),
      point(1, 1, 1),
      'Gamma Spearhead',
      'Beta Bastion',
      manyShips({ type: ShipType.ATMOSPHERIC_FIGHTER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy } = createGalaxyWithPlayers(
      [alliedIdleFleet, hostileSiegeFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
        solarSystem.planets[2].basicInfo.name = 'Gamma Spearhead';
        solarSystem.planets[2].info.ownerId = 3;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER),
        new Player(3, 'Gamma', [solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED },
      { playerAId: 1, playerBId: 3, status: DiplomaticStatus.WAR },
      { playerAId: 2, playerBId: 3, status: DiplomaticStatus.WAR }
    ];

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].ownerId).toBe(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
    expect(ManyShips.countByType(galaxy.activeFleets[0].ships).get(ShipType.TITAN)).toBe(1);
  });

  it('does not let passive move-orbit fleets defend a planet against direct assault missions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const passiveOrbitFleet = new Fleet(
      52,
      1,
      FleetMissionType.HOLD,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.PASSIVE_HOLD
    );
    const hostileBombardFleet = new Fleet(
      53,
      3,
      FleetMissionType.BOMBARD,
      point(1, 1, 2),
      point(1, 1, 1),
      'Gamma Spearhead',
      'Beta Bastion',
      manyShips({ type: ShipType.SPY_PROBE, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, players } = createGalaxyWithPlayers(
      [passiveOrbitFleet, hostileBombardFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
        solarSystem.planets[2].basicInfo.name = 'Gamma Spearhead';
        solarSystem.planets[2].info.ownerId = 3;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER),
        new Player(3, 'Gamma', [solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED },
      { playerAId: 2, playerBId: 3, status: DiplomaticStatus.WAR },
      { playerAId: 1, playerBId: 3, status: DiplomaticStatus.WAR }
    ];

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === 1 && fleet.state === FleetState.ORBITING)).toBe(true);
    expect(players[0].reports.some((report) => report.title.startsWith('Battle Report:'))).toBe(false);
  });

  it('lets guard fleets join planet defense against direct assault missions', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const guardFleet = new Fleet(
      54,
      1,
      FleetMissionType.DEFEND,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.GUARDING
    );
    const hostileBombardFleet = new Fleet(
      55,
      3,
      FleetMissionType.BOMBARD,
      point(1, 1, 2),
      point(1, 1, 1),
      'Gamma Spearhead',
      'Beta Bastion',
      manyShips({ type: ShipType.SPY_PROBE, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy } = createGalaxyWithPlayers(
      [guardFleet, hostileBombardFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
        solarSystem.planets[2].basicInfo.name = 'Gamma Spearhead';
        solarSystem.planets[2].info.ownerId = 3;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER),
        new Player(3, 'Gamma', [solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED },
      { playerAId: 2, playerBId: 3, status: DiplomaticStatus.WAR }
    ];

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].ownerId).toBe(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
  });

  it('uses terraformer-adjusted industry and science modifiers during turn-resolution queue progress', () => {
    const { galaxy, system } = createGalaxyWithPlayers(
      [],
      (solarSystem) => {
        const homePlanet = solarSystem.planets[0];
        homePlanet.basicInfo.name = 'Alpha Prime';
        homePlanet.info.ownerId = 1;
        homePlanet.info.planetaryParameters.industryModifier = 0.8;
        homePlanet.info.planetaryParameters.scienceModifier = 0.95;
        homePlanet.info.planetaryParameters.energyModifierRES = 1;
        homePlanet.info.planetaryParameters.energyModifierNuclear = 1;
        homePlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 13);
        homePlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
        homePlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
        homePlanet.setBuildingLevel(BuildingType.TERRAFORMER, 10);
        homePlanet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(BuildingType.METAL_MINE, 1, 0));
        homePlanet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
          TechnologyType.ENERGY_TECHNOLOGY,
          1,
          0,
          []
        );
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER)
      ])
    );

    resolvePhaseOneTurn(galaxy);

    expect(system.planets[0].rBDSFTQ.buildingQueue[0]?.investedIndustryPower).toBe(23);
    expect(system.planets[0].rBDSFTQ.currentResearchQueue?.investedResearchPower).toBe(32);
  });

  it('applies fractional nanite multipliers to industry and shipyard power', () => {
    const { galaxy, system } = createGalaxyWithPlayers(
      [],
      (solarSystem) => {
        const homePlanet = solarSystem.planets[0];
        homePlanet.info.ownerId = 1;
        homePlanet.info.planetaryParameters.industryModifier = 1;
        homePlanet.info.planetaryParameters.energyModifierRES = 1;
        homePlanet.info.planetaryParameters.energyModifierNuclear = 1;
        homePlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 8);
        homePlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
        homePlanet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);
        homePlanet.setBuildingLevel(BuildingType.SHIPYARD, 1);
        homePlanet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(BuildingType.FUSION_REACTOR, 1, 0));
        homePlanet.rBDSFTQ.shipyardQueue.push(ShipyardQueueEntry.ship(ShipType.ATMOSPHERIC_BOMBER, 1, 0));
      },
      (solarSystem) => ([new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER)])
    );

    resolvePhaseOneTurn(galaxy);

    expect(system.planets[0].rBDSFTQ.buildingQueue[0]?.investedIndustryPower).toBe(60);
    expect(system.planets[0].rBDSFTQ.shipyardQueue[0]?.investedShipyardPower).toBe(52);
  });

  it('adds parked repair-drone industry separately from nanite-amplified base industry', () => {
    const { galaxy, system } = createGalaxyWithPlayers(
      [],
      (solarSystem) => {
        const controlPlanet = solarSystem.planets[0];
        controlPlanet.info.ownerId = 1;
        controlPlanet.info.planetaryParameters.industryModifier = 1;
        controlPlanet.info.planetaryParameters.energyModifierRES = 1;
        controlPlanet.info.planetaryParameters.energyModifierNuclear = 1;
        controlPlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 8);
        controlPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
        controlPlanet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);
        controlPlanet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(BuildingType.FUSION_REACTOR, 1, 0));

        const dronePlanet = solarSystem.planets[1];
        dronePlanet.info.ownerId = 2;
        dronePlanet.info.planetaryParameters.industryModifier = 1;
        dronePlanet.info.planetaryParameters.energyModifierRES = 1;
        dronePlanet.info.planetaryParameters.energyModifierNuclear = 1;
        dronePlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 8);
        dronePlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
        dronePlanet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);
        dronePlanet.rBDSFTQ.ships = manyShips({ type: ShipType.REPAIR_DRONE, amount: 1 });
        dronePlanet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(BuildingType.FUSION_REACTOR, 1, 0));
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER)
      ])
    );

    resolvePhaseOneTurn(galaxy);

    expect(system.planets[0].rBDSFTQ.buildingQueue[0]?.investedIndustryPower).toBe(60);
    expect(system.planets[1].rBDSFTQ.buildingQueue[0]?.investedIndustryPower).toBe(61);
  });

  it('prioritizes non-small damaged ships for strong repair equipment', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const { galaxy, system } = createGalaxyWithPlayers(
      [],
      (solarSystem) => {
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[0].rBDSFTQ.ships = mixedShips({
          undamaged: [{ type: ShipType.CARGO_SUPPORT, amount: 1 }],
          damaged: [
            { type: ShipType.FIGHTER, missingHull: 5 },
            { type: ShipType.CRUISER, missingHull: 30 }
          ]
        });
      },
      (solarSystem) => ([new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER)])
    );

    resolvePhaseOneTurn(galaxy);

    const damagedCounts = ManyShips.damagedCountByType(system.planets[0].rBDSFTQ.ships);
    expect(damagedCounts.get(ShipType.CRUISER) ?? 0).toBe(0);
    expect(damagedCounts.get(ShipType.FIGHTER) ?? 0).toBe(1);
    expect(ManyShips.undamagedCountByType(system.planets[0].rBDSFTQ.ships).get(ShipType.CRUISER) ?? 0).toBe(1);
  });

  it('uses leftover shipyard repair on idle orbit fleets after repairing planet ships first', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const idleFleet = new Fleet(
      200,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 0),
      'Alpha Prime',
      'Alpha Prime',
      mixedShips({
        damaged: [{ type: ShipType.CRUISER, missingHull: 20 }]
      }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.MISSION_IN_PROGRESS
    );

    const { galaxy, system } = createGalaxyWithPlayers(
      [idleFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[0].info.planetaryParameters.industryModifier = 1;
        solarSystem.planets[0].info.planetaryParameters.energyModifierRES = 1;
        solarSystem.planets[0].info.planetaryParameters.energyModifierNuclear = 1;
        solarSystem.planets[0].setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
        solarSystem.planets[0].setBuildingLevel(BuildingType.SHIPYARD, 1);
        solarSystem.planets[0].rBDSFTQ.ships = mixedShips({
          damaged: [{ type: ShipType.CRUISER, missingHull: 10 }]
        });
      },
      (solarSystem) => ([new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER)])
    );

    resolvePhaseOneTurn(galaxy);

    expect(ManyShips.hasDamagedShips(system.planets[0].rBDSFTQ.ships)).toBe(false);
    expect(ManyShips.hasDamagedShips(galaxy.activeFleets[0].ships)).toBe(false);
    expect(ManyShips.undamagedCountByType(galaxy.activeFleets[0].ships).get(ShipType.CRUISER) ?? 0).toBe(1);
  });

  it('repairs allied idle fleets in orbit with the host planet shipyard power', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const alliedIdleFleet = new Fleet(
      201,
      2,
      FleetMissionType.MOVE,
      point(1, 1, 2),
      point(1, 1, 0),
      'Beta Forward',
      'Alpha Prime',
      mixedShips({
        damaged: [{ type: ShipType.CRUISER, missingHull: 20 }]
      }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.MISSION_IN_PROGRESS
    );

    const { galaxy } = createGalaxyWithPlayers(
      [alliedIdleFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[0].info.planetaryParameters.industryModifier = 1;
        solarSystem.planets[0].info.planetaryParameters.energyModifierRES = 1;
        solarSystem.planets[0].info.planetaryParameters.energyModifierNuclear = 1;
        solarSystem.planets[0].setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
        solarSystem.planets[0].setBuildingLevel(BuildingType.SHIPYARD, 1);
        solarSystem.planets[2].basicInfo.name = 'Beta Forward';
        solarSystem.planets[2].info.ownerId = 2;
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[2]], new Map(), [], PlayerType.PLAYER)
      ])
    );
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }
    ];

    resolvePhaseOneTurn(galaxy);

    expect(ManyShips.hasDamagedShips(galaxy.activeFleets[0].ships)).toBe(false);
    expect(ManyShips.undamagedCountByType(galaxy.activeFleets[0].ships).get(ShipType.CRUISER) ?? 0).toBe(1);
  });

  it('lets Bombard missions damage hostile buildings once and then return', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    const bombardFleet = new Fleet(
      300,
      1,
      FleetMissionType.BOMBARD,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createPlayersAndGalaxy(bombardFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].setBuildingLevel(BuildingType.METAL_MINE, 1);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
    });
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.WAR }
    ];

    const maxStructuralPoints = system.planets[1].getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(system.planets[1].getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE)).toBeLessThan(maxStructuralPoints);
  });

  it('lets Attack missions steal resources from hostile planets and return immediately', () => {
    const transporterCargoCapacity = blueprints.get(ShipType.TRANSPORTER)!.cargoCapacity;
    const attackFleet = new Fleet(
      299,
      1,
      FleetMissionType.ATTACK,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Storehouse',
      manyShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      transporterCargoCapacity,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, attacker, system } = createPlayersAndGalaxy(attackFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Storehouse';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].cargo.metal).toBe(200);
    expect(galaxy.activeFleets[0].cargo.crystal).toBe(200);
    expect(galaxy.activeFleets[0].cargo.deuterium).toBe(200);
    expect(system.planets[1].rBDSFTQ.resources.metal).toBe(100);
    expect(system.planets[1].rBDSFTQ.resources.crystal).toBe(100);
    expect(system.planets[1].rBDSFTQ.resources.deuterium).toBe(100);
    expect(attacker.reports.some((report) => report.title.startsWith('Plunder Report: Beta Storehouse'))).toBe(true);
  });

  it('reduces Attack plunder efficiency by raw Bunker Network production1 value', () => {
    const transporterCargoCapacity = blueprints.get(ShipType.TRANSPORTER)!.cargoCapacity;
    const attackFleet = new Fleet(
      298,
      1,
      FleetMissionType.ATTACK,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Vault',
      manyShips({ type: ShipType.TRANSPORTER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      transporterCargoCapacity,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createPlayersAndGalaxy(attackFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Vault';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].setBuildingLevel(BuildingType.BUNKER_NETWORK, 1);
      solarSystem.planets[1].rBDSFTQ.resources = new ResourcesPack(100, 100, 100);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets[0].cargo.metal).toBe(76);
    expect(galaxy.activeFleets[0].cargo.crystal).toBe(76);
    expect(galaxy.activeFleets[0].cargo.deuterium).toBe(76);
    expect(system.planets[1].rBDSFTQ.resources.metal).toBe(24);
    expect(system.planets[1].rBDSFTQ.resources.crystal).toBe(24);
    expect(system.planets[1].rBDSFTQ.resources.deuterium).toBe(24);
  });

  it('adds plunder lines to battle reports when an Attack fleet wins with no free cargo space', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const titanCargoCapacity = blueprints.get(ShipType.TITAN)!.cargoCapacity * 3;
    const attackFleet = new Fleet(
      297,
      1,
      FleetMissionType.ATTACK,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Frontier',
      manyShips({ type: ShipType.TITAN, amount: 3 }),
      new ResourcesPack(titanCargoCapacity, 0, 0),
      0,
      titanCargoCapacity,
      titanCargoCapacity,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, attacker, defender, system } = createPlayersAndGalaxy(attackFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Frontier';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].rBDSFTQ.resources = new ResourcesPack(200, 200, 200);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.fromShipInstances([shipInstance(ShipType.SPY_PROBE)]);
      solarSystem.planets[2].info.ownerId = 1;
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].cargo.metal).toBe(titanCargoCapacity);
    expect(system.planets[1].rBDSFTQ.resources.metal).toBe(200);
    expect(attacker.reports.some((report) =>
      report.title.startsWith('Battle Report:') && report.show().includes('No free cargo space remained, so no resources were stolen.')
    )).toBe(true);
    expect(defender.reports.some((report) =>
      report.title.startsWith('Battle Report:') && report.show().includes('Attacking fleet had no free cargo space, so no resources were stolen.')
    )).toBe(true);
  });

  it('lets carried planetary bombs drive Bombard missions even without ship bombardment weapons', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    const bombardFleet = new Fleet(
      302,
      1,
      FleetMissionType.BOMBARD,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.CARRIER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1,
      manyDefences({ type: DefenceType.MEDIUM_BOMB, amount: 1 })
    );

    const { galaxy, system } = createPlayersAndGalaxy(bombardFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].setBuildingLevel(BuildingType.METAL_MINE, 1);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
      solarSystem.planets[1].rBDSFTQ.defences = ManyDefences.empty();
    });
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.WAR }
    ];

    const maxStructuralPoints = system.planets[1].getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(system.planets[1].getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE)).toBeLessThan(maxStructuralPoints);
    expect(ManyDefences.totalDefencesCount(galaxy.activeFleets[0].carriedBombs)).toBe(0);
  });

  it('lets idle Siege fleets keep bombarding hostile buildings each turn', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6);

    const siegeFleet = new Fleet(
      301,
      1,
      FleetMissionType.SIEGE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.MISSION_IN_PROGRESS
    );

    const { galaxy, system } = createPlayersAndGalaxy(siegeFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].setBuildingLevel(BuildingType.METAL_MINE, 1);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
    });
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.WAR }
    ];

    const maxStructuralPoints = system.planets[1].getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
    expect(system.planets[1].getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE)).toBeLessThan(maxStructuralPoints);
  });

  it('returns Siege fleets when only return fuel reserve remains', () => {
    const siegeFleet = new Fleet(
      305,
      1,
      FleetMissionType.SIEGE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Bastion',
      manyShips({ type: ShipType.TITAN, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      10,
      0,
      0,
      2,
      2,
      FleetState.ORBITING,
      1,
      ManyDefences.empty(),
      FleetOrbitActivity.MISSION_IN_PROGRESS
    );
    siegeFleet.remainingFuelReserve = 5;

    const { galaxy, system } = createPlayersAndGalaxy(siegeFleet, (solarSystem) => {
      solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
      solarSystem.planets[0].info.ownerId = 1;
      solarSystem.planets[1].basicInfo.name = 'Beta Bastion';
      solarSystem.planets[1].info.ownerId = 2;
      solarSystem.planets[1].setBuildingLevel(BuildingType.METAL_MINE, 1);
      solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
    });
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.WAR }
    ];

    const maxStructuralPoints = system.planets[1].getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].remainingFuelReserve).toBe(5);
    expect(system.planets[1].getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE)).toBe(maxStructuralPoints);
  });

  it('lets Recycle missions establish orbit over hostile debris fields when no defenders remain', () => {
    const recycleFleet = new Fleet(
      400,
      1,
      FleetMissionType.RECYCLE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Debris',
      manyShips({ type: ShipType.RECYCLER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      1200,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy, system } = createGalaxyWithPlayers(
      [recycleFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Beta Debris';
        solarSystem.planets[1].info.ownerId = 2;
        solarSystem.planets[1].rBDSFTQ.ships = ManyShips.empty();
        solarSystem.planets[1].rBDSFTQ.spaceDebris = new ResourcesPack(120, 60, 60);
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER)
      ])
    );

    resolvePhaseOneTurn(galaxy, 2);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.ORBITING);
    expect(galaxy.activeFleets[0].createdAtTurn).toBe(2);
    expect(galaxy.activeFleets[0].cargo.getTotalResourceAmount()).toBe(0);
    expect(system.planets[1].rBDSFTQ.spaceDebris.metal).toBe(120);
    expect(system.planets[1].rBDSFTQ.spaceDebris.crystal).toBe(60);
    expect(system.planets[1].rBDSFTQ.spaceDebris.deuterium).toBe(60);
  });

  it('returns Recycle missions immediately when no debris exists on arrival', () => {
    const recycleFleet = new Fleet(
      401,
      1,
      FleetMissionType.RECYCLE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Alpha Orbit',
      manyShips({ type: ShipType.RECYCLER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      1200,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      1
    );

    const { galaxy } = createGalaxyWithPlayers(
      [recycleFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Alpha Orbit';
        solarSystem.planets[1].info.ownerId = 1;
        solarSystem.planets[1].rBDSFTQ.spaceDebris = new ResourcesPack(0, 0, 0);
      },
      (solarSystem) => ([new Player(1, 'Alpha', [solarSystem.planets[0], solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER)])
    );

    resolvePhaseOneTurn(galaxy, 2);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].createdAtTurn).toBe(2);
    expect(galaxy.activeFleets[0].cargo.getTotalResourceAmount()).toBe(0);
  });

  it('lets idle Recycle missions collect debris proportionally and return when the field is empty', () => {
    const recycleFleet = new Fleet(
      402,
      1,
      FleetMissionType.RECYCLE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Alpha Orbit',
      manyShips({ type: ShipType.RECYCLER, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      240,
      0,
      1,
      1,
      FleetState.ORBITING,
      2,
      ManyDefences.empty(),
      FleetOrbitActivity.MISSION_IN_PROGRESS
    );

    const { galaxy, system } = createGalaxyWithPlayers(
      [recycleFleet],
      (solarSystem) => {
        solarSystem.planets[0].basicInfo.name = 'Alpha Prime';
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[1].basicInfo.name = 'Alpha Orbit';
        solarSystem.planets[1].info.ownerId = 1;
        solarSystem.planets[1].rBDSFTQ.spaceDebris = new ResourcesPack(120, 60, 60);
      },
      (solarSystem) => ([new Player(1, 'Alpha', [solarSystem.planets[0], solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER)])
    );

    resolvePhaseOneTurn(galaxy, 3);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.RETURNING);
    expect(galaxy.activeFleets[0].createdAtTurn).toBe(3);
    expect(galaxy.activeFleets[0].cargo.metal).toBe(120);
    expect(galaxy.activeFleets[0].cargo.crystal).toBe(60);
    expect(galaxy.activeFleets[0].cargo.deuterium).toBe(60);
    expect(galaxy.activeFleets[0].usedCargoCapacity).toBe(240);
    expect(system.planets[1].rBDSFTQ.spaceDebris.getTotalResourceAmount()).toBe(0);
  });

  it('splits drone repair between damaged ships and damaged buildings', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const { galaxy, system } = createGalaxyWithPlayers(
      [],
      (solarSystem) => {
        solarSystem.planets[0].info.ownerId = 1;
        solarSystem.planets[0].setBuildingLevel(BuildingType.METAL_MINE, 1);
        const maxStructuralPoints = solarSystem.planets[0].getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);
        solarSystem.planets[0].setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, maxStructuralPoints - 10);
        solarSystem.planets[0].rBDSFTQ.ships = mixedShips({
          undamaged: [{ type: ShipType.REPAIR_DRONE, amount: 1 }],
          damaged: [{ type: ShipType.CRUISER, missingHull: 10 }]
        });
      },
      (solarSystem) => ([new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER)])
    );

    const initialStructuralPoints = system.planets[0].getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE);
    const initialMissingHull = system.planets[0].rBDSFTQ.ships.totalMissingHull();

    resolvePhaseOneTurn(galaxy);

    expect(system.planets[0].getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE)).toBeGreaterThan(initialStructuralPoints);
    expect(system.planets[0].rBDSFTQ.ships.totalMissingHull()).toBeLessThan(initialMissingHull);
  });

  it('applies configured bot difficulty bonuses to bot income and turn throughput only', () => {
    const system = new SolarSystem('Economy Test', 2, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
    const humanPlanet = Planet.createStartingPlanet('Human Prime', 1, system, 1);
    const botPlanet = Planet.createStartingPlanet('Bot Prime', 2, system, 2);
    system.planets[0] = humanPlanet;
    system.planets[1] = botPlanet;

    humanPlanet.info.ownerId = 1;
    botPlanet.info.ownerId = 2;

    for (const planet of [humanPlanet, botPlanet]) {
      planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
      planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
      planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
      planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
      planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
      planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
      planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
      planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 3);
      planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
      planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 3);
      planet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
      planet.rBDSFTQ.buildingQueue = [new BuildingQueueEntry(BuildingType.METAL_MINE, 5, 0)];
      planet.rBDSFTQ.shipyardQueue = [ShipyardQueueEntry.ship(ShipType.SPY_PROBE, 2, 0)];
      planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
        TechnologyType.ENERGY_TECHNOLOGY,
        1,
        0,
        []
      );
    }

    const human = new Player(1, 'Human', [humanPlanet], new Map(), [], PlayerType.PLAYER);
    const bot = new Player(2, 'Bot', [botPlanet], new Map(), [], PlayerType.BOT);
    const galaxy = new Galaxy(
      'Economy Galaxy',
      [human, bot],
      [[system]],
      1,
      [],
      1,
      new Map([[human.playerId, human]]),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[human.playerName, human.playerId], [bot.playerName, bot.playerId]])
    );

    resolvePhaseOneTurn(galaxy, 2, { botDifficultyPercent: 100 });

    expect(botPlanet.rBDSFTQ.resources.metal).toBeGreaterThan(humanPlanet.rBDSFTQ.resources.metal);
    expect(botPlanet.rBDSFTQ.resources.crystal).toBeGreaterThan(humanPlanet.rBDSFTQ.resources.crystal);
    expect(botPlanet.rBDSFTQ.resources.deuterium).toBeGreaterThan(humanPlanet.rBDSFTQ.resources.deuterium);
    expect(botPlanet.rBDSFTQ.buildingQueue[0]?.investedIndustryPower ?? 0)
      .toBeGreaterThan(humanPlanet.rBDSFTQ.buildingQueue[0]?.investedIndustryPower ?? 0);
    expect(botPlanet.rBDSFTQ.shipyardQueue[0]?.investedShipyardPower ?? 0)
      .toBeGreaterThan(humanPlanet.rBDSFTQ.shipyardQueue[0]?.investedShipyardPower ?? 0);
    expect(botPlanet.rBDSFTQ.currentResearchQueue?.investedResearchPower ?? 0)
      .toBeGreaterThan(humanPlanet.rBDSFTQ.currentResearchQueue?.investedResearchPower ?? 0);
  });

  it('restores full power after a building upgrade only when that building was already at full power', () => {
    const metalMineUpgradeCost = buildingBlueprints.get(BuildingType.METAL_MINE)?.getCostForLevel(2).getTotalResourceAmount();
    const crystalMineUpgradeCost = buildingBlueprints.get(BuildingType.CRYSTAL_MINE)?.getCostForLevel(2).getTotalResourceAmount();

    expect(metalMineUpgradeCost).toBeTypeOf('number');
    expect(crystalMineUpgradeCost).toBeTypeOf('number');

    const { galaxy, system } = createGalaxyWithPlayers(
      [],
      (solarSystem) => {
        const fullPowerPlanet = solarSystem.planets[0];
        fullPowerPlanet.info.ownerId = 1;
        fullPowerPlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 13);
        fullPowerPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
        fullPowerPlanet.setBuildingLevel(BuildingType.METAL_MINE, 1);
        fullPowerPlanet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(
          BuildingType.METAL_MINE,
          2,
          Math.max(0, Math.floor(metalMineUpgradeCost!) - 1)
        ));

        const throttledPlanet = solarSystem.planets[1];
        throttledPlanet.info.ownerId = 2;
        throttledPlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 13);
        throttledPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
        throttledPlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
        throttledPlanet.setCurrentBuildingPowerConsumption(BuildingType.CRYSTAL_MINE, 0);
        throttledPlanet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(
          BuildingType.CRYSTAL_MINE,
          2,
          Math.max(0, Math.floor(crystalMineUpgradeCost!) - 1)
        ));
      },
      (solarSystem) => ([
        new Player(1, 'Alpha', [solarSystem.planets[0]], new Map(), [], PlayerType.PLAYER),
        new Player(2, 'Beta', [solarSystem.planets[1]], new Map(), [], PlayerType.PLAYER)
      ])
    );

    resolvePhaseOneTurn(galaxy);

    expect(system.planets[0].getBuildingLevel(BuildingType.METAL_MINE)).toBe(2);
    expect(system.planets[0].getCurrentBuildingPowerConsumption(BuildingType.METAL_MINE))
      .toBe(system.planets[0].getMaxBuildingPowerConsumption(BuildingType.METAL_MINE));

    expect(system.planets[1].getBuildingLevel(BuildingType.CRYSTAL_MINE)).toBe(2);
    expect(system.planets[1].getCurrentBuildingPowerConsumption(BuildingType.CRYSTAL_MINE)).toBe(0);
    expect(system.planets[1].getMaxBuildingPowerConsumption(BuildingType.CRYSTAL_MINE)).toBeGreaterThan(0);
  });
});
