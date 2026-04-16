import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../../src/app/models/diplomacy/diplomatic-status.js';
import { DiplomacyResolver } from '../../src/app/models/diplomacy/diplomacy-resolver.js';
import { Fleet, FleetState } from '../../src/app/models/fleets/fleet.js';
import { ManyShips } from '../../src/app/models/fleets/many-ships.js';
import { FleetMissionType } from '../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../src/app/models/enums/player-type.js';
import { ShipType } from '../../src/app/models/enums/ship-type.js';
import { Galaxy } from '../../src/app/models/planets/galaxy.js';
import { SolarSystem } from '../../src/app/models/planets/solar-system.js';
import { Player } from '../../src/app/models/player.js';
import { ResourcesPack } from '../../src/app/models/resources-pack.js';
import { collectSensorPhalanxPassiveDetections } from './sensor-phalanx-passive.js';

function point(x: number, y: number, z: number) {
  return { x, y, z };
}

function manyShips(...entries: Array<{ type: ShipType; amount: number }>): ManyShips {
  const ships = ManyShips.empty();
  for (const entry of entries) {
    ships.addUndamaged(entry.type, entry.amount);
  }

  return ships;
}

describe('sensor-phalanx passive detection', () => {
  it('skips self-owned incoming fleets while keeping allied and enemy detections', () => {
    const system = new SolarSystem('Phalanx', 3, false, false, { x: 0, y: 0 }, new Set<number>(), new Map());
    const homePlanet = system.planets[0];
    const guardedPlanet = system.planets[1];
    const sparePlanet = system.planets[2];

    homePlanet.info.ownerId = 1;
    guardedPlanet.info.ownerId = 1;
    sparePlanet.info.ownerId = 2;
    guardedPlanet.basicInfo.name = 'Guarded World';

    const viewer = new Player(1, 'Viewer', [homePlanet, guardedPlanet], new Map(), [], PlayerType.PLAYER);
    const ally = new Player(2, 'Ally', [sparePlanet], new Map(), [], PlayerType.PLAYER);
    const enemy = new Player(3, 'Enemy', [], new Map(), [], PlayerType.PLAYER);

    const ownFleet = new Fleet(
      10,
      1,
      FleetMissionType.MOVE,
      point(0, 0, 2),
      point(0, 0, 1),
      'Spare World',
      'Guarded World',
      manyShips({ type: ShipType.SPY_PROBE, amount: 1 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      2,
      2,
      FleetState.MOVING_TO_TARGET,
      5
    );
    const alliedFleet = new Fleet(
      11,
      2,
      FleetMissionType.MOVE,
      point(0, 0, 2),
      point(0, 0, 1),
      'Ally Origin',
      'Guarded World',
      manyShips({ type: ShipType.TRANSPORTER, amount: 2 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      3,
      3,
      FleetState.MOVING_TO_TARGET,
      5
    );
    const enemyFleet = new Fleet(
      12,
      3,
      FleetMissionType.ATTACK,
      point(0, 0, 2),
      point(0, 0, 1),
      'Enemy Origin',
      'Guarded World',
      manyShips({ type: ShipType.FIGHTER, amount: 3 }),
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      1,
      1,
      FleetState.MOVING_TO_TARGET,
      5
    );

    const galaxy = new Galaxy('Sensor', [viewer, ally, enemy], [[system]], 5, [ownFleet, alliedFleet, enemyFleet], 13);
    galaxy.diplomaticRelations = [
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }
    ];

    const detections = collectSensorPhalanxPassiveDetections(
      galaxy,
      viewer.playerId,
      point(0, 0, 0),
      1,
      new DiplomacyResolver(galaxy.diplomaticRelations)
    );

    expect(detections.map((entry) => entry.fleetId)).toEqual([12, 11]);
    expect(detections.every((entry) => entry.fleetId !== 10)).toBe(true);
    expect(detections.find((entry) => entry.fleetId === 11)?.contact.isAllied).toBe(true);
    expect(detections.find((entry) => entry.fleetId === 12)?.contact.isAllied).toBe(false);
  });
});
