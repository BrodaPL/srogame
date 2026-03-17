import { describe, expect, it } from 'vitest';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { PlayerType } from '../../enums/player-type';
import { ReportType } from '../../enums/report-type';
import { ShipType } from '../../enums/ship-type';
import { Fleet, FleetState } from '../../fleets/fleet';
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
  it('turns a hostile move victory into a failure return and creates battle reports', () => {
    const moveFleet = new Fleet(
      1,
      1,
      FleetMissionType.MOVE,
      point(1, 1, 0),
      point(1, 1, 1),
      'Alpha Prime',
      'Beta Frontier',
      [{ type: ShipType.TITAN, amount: 1 }],
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
      solarSystem.planets[1].rBDSFTQ.ships.push(shipInstance(ShipType.SPY_PROBE));
      solarSystem.planets[3].info.ownerId = 2;
    });

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(galaxy.activeFleets[0].state).toBe(FleetState.MISSION_FAILURE_RETURNING);
    expect(galaxy.activeFleets[0].ships).toEqual([{ type: ShipType.TITAN, amount: 1 }]);
    expect(galaxy.activeFleets[0].cargo.metal).toBe(40);
    expect(system.planets[1].rBDSFTQ.ships).toHaveLength(0);
    expect(attacker.reports.some((report) => report.reportType === ReportType.BATTLE_REPORT)).toBe(true);
    expect(attacker.reports.some((report) =>
      report.reportType === ReportType.FLEET_REPORT && report.title.startsWith('Battle Report:')
    )).toBe(true);
    expect(attacker.reports.some((report) =>
      report.reportType === ReportType.FLEET_REPORT && report.title.startsWith('Fleet Failed: Move')
    )).toBe(true);
    expect(defender.reports.some((report) => report.reportType === ReportType.BATTLE_REPORT)).toBe(true);
  });

  it('destroys a hostile transport that loses its arrival battle before cargo delivery', () => {
    const transportFleet = new Fleet(
      2,
      1,
      FleetMissionType.TRANSPORT,
      point(1, 1, 2),
      point(1, 1, 3),
      'Alpha Haul',
      'Beta Bastion',
      [{ type: ShipType.TRANSPORTER, amount: 1 }],
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
      solarSystem.planets[3].rBDSFTQ.ships.push(shipInstance(ShipType.MOTHER_SHIP));
      solarSystem.planets[1].info.ownerId = 2;
    });

    const defenderCargoBefore = {
      metal: system.planets[3].rBDSFTQ.resources.metal,
      crystal: system.planets[3].rBDSFTQ.resources.crystal,
      deuterium: system.planets[3].rBDSFTQ.resources.deuterium
    };

    resolvePhaseOneTurn(galaxy);

    expect(galaxy.activeFleets).toHaveLength(0);
    expect(system.planets[3].rBDSFTQ.resources.metal).toBe(defenderCargoBefore.metal);
    expect(system.planets[3].rBDSFTQ.resources.crystal).toBe(defenderCargoBefore.crystal);
    expect(system.planets[3].rBDSFTQ.resources.deuterium).toBe(defenderCargoBefore.deuterium);
    expect(system.planets[3].rBDSFTQ.ships.length).toBeGreaterThan(0);
    expect(attacker.reports.some((report) => report.reportType === ReportType.BATTLE_REPORT)).toBe(true);
    expect(attacker.reports.some((report) =>
      report.reportType === ReportType.FLEET_REPORT && report.title.startsWith('Battle Report:')
    )).toBe(true);
    expect(defender.reports.some((report) => report.reportType === ReportType.BATTLE_REPORT)).toBe(true);
  });
});
