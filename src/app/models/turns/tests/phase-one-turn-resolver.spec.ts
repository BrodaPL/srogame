import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { PlayerType } from '../../enums/player-type';
import { ShipType } from '../../enums/ship-type';
import { Fleet, FleetState } from '../../fleets/fleet';
import { ManyShips } from '../../fleets/many-ships';
import { ShipInstance } from '../../fleets/ship-instance';
import { Galaxy } from '../../planets/galaxy';
import { SolarSystem } from '../../planets/solar-system';
import { Player } from '../../player';
import { ResourcesPack } from '../../resources-pack';
import { resolvePhaseOneTurn } from '../phase-one-turn-resolver';

const blueprints = ShipBlueprintsFactory.fromDefaultJson();

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
});
