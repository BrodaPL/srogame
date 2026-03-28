import { describe, expect, it } from 'vitest';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
import { SolarSystem } from '../solar-system';
import { Galaxy } from '../galaxy';
import { ManyShips } from '../../fleets/many-ships';
import { ShipType } from '../../enums/ship-type';
import { Destination } from '../../fleets/destination';
import { Fleet, FleetState } from '../../fleets/fleet';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { ResourcesPack } from '../../resources-pack';
import { GalaxyPresentationData } from '../galaxy-presentation-data';

describe('GalaxyPresentationData', () => {
  it('projects own fleet movements for galaxy view routes and system presence', () => {
    const systemA = new SolarSystem('A', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const systemB = new SolarSystem('B', 1, false, false, { x: 2, y: 1 }, new Set(), new Map());
    const systemC = new SolarSystem('C', 1, false, false, { x: 4, y: 0 }, new Set(), new Map());
    const planetA = systemA.planets[0]!;
    const planetB = systemB.planets[0]!;
    const planetC = systemC.planets[0]!;

    planetA.info.ownerId = 1;
    planetB.info.ownerId = 1;
    planetC.info.ownerId = 2;

    const player = new Player(1, 'Alpha', [planetA, planetB], new Map(), [], PlayerType.PLAYER);
    const otherPlayer = new Player(2, 'Beta', [planetC], new Map(), [], PlayerType.PLAYER);

    const enRouteShips = ManyShips.empty();
    enRouteShips.addUndamaged(ShipType.LIGHT_FIGHTER, 3);
    const orbitingShips = ManyShips.empty();
    orbitingShips.addUndamaged(ShipType.SPY_PROBE, 1);
    const returningShips = ManyShips.empty();
    returningShips.addUndamaged(ShipType.RECYCLER, 2);

    const enRouteFleet = new Fleet(
      1,
      1,
      FleetMissionType.MOVE,
      new Destination(0, 0, 0),
      new Destination(2, 1, 0),
      planetA.basicInfo.name,
      planetB.basicInfo.name,
      enRouteShips,
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      4,
      4,
      FleetState.MOVING_TO_TARGET,
      10
    );
    const orbitingFleet = new Fleet(
      2,
      1,
      FleetMissionType.DEFEND,
      new Destination(0, 0, 0),
      new Destination(2, 1, 0),
      planetA.basicInfo.name,
      planetB.basicInfo.name,
      orbitingShips,
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      3,
      3,
      FleetState.ORBITING,
      9
    );
    const returningFleet = new Fleet(
      3,
      1,
      FleetMissionType.TRANSPORT,
      new Destination(0, 0, 0),
      new Destination(4, 0, 0),
      planetA.basicInfo.name,
      planetC.basicInfo.name,
      returningShips,
      new ResourcesPack(0, 0, 0),
      0,
      0,
      0,
      5,
      2,
      FleetState.RETURNING,
      11
    );

    const galaxy = new Galaxy('Test', [player, otherPlayer], [[systemA, systemB, systemC]], 12, [
      enRouteFleet,
      orbitingFleet,
      returningFleet
    ]);

    const presentation = GalaxyPresentationData.fromGalaxy(galaxy, 1);

    expect(presentation.ownFleetMovements).toEqual([
      {
        fleetId: 1,
        missionType: FleetMissionType.MOVE,
        state: FleetState.MOVING_TO_TARGET,
        routeKind: 'OUTBOUND',
        originSystemCoordinates: { x: 0, y: 0 },
        targetSystemCoordinates: { x: 2, y: 1 },
        currentSystemCoordinates: { x: 0, y: 0 },
        shipCount: 3,
        etaTurns: 4,
        originPlanetName: planetA.basicInfo.name,
        targetPlanetName: planetB.basicInfo.name
      },
      {
        fleetId: 2,
        missionType: FleetMissionType.DEFEND,
        state: FleetState.ORBITING,
        routeKind: 'OUTBOUND',
        originSystemCoordinates: { x: 0, y: 0 },
        targetSystemCoordinates: { x: 2, y: 1 },
        currentSystemCoordinates: { x: 2, y: 1 },
        shipCount: 1,
        etaTurns: null,
        originPlanetName: planetA.basicInfo.name,
        targetPlanetName: planetB.basicInfo.name
      },
      {
        fleetId: 3,
        missionType: FleetMissionType.TRANSPORT,
        state: FleetState.RETURNING,
        routeKind: 'RETURNING',
        originSystemCoordinates: { x: 0, y: 0 },
        targetSystemCoordinates: { x: 4, y: 0 },
        currentSystemCoordinates: null,
        shipCount: 2,
        etaTurns: 2,
        originPlanetName: planetA.basicInfo.name,
        targetPlanetName: planetC.basicInfo.name
      }
    ]);
  });
});
