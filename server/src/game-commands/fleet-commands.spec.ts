import { describe, expect, it } from 'vitest';
import { Fleet, FleetOrbitActivity, FleetState } from '../../../src/app/models/fleets/fleet.js';
import { Destination } from '../../../src/app/models/fleets/destination.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { ManyShips } from '../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../src/app/models/player.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import { createFleetMission } from './fleet-commands.js';

describe('fleet commands', () => {
  it('reuses an orbiting fleet slot when the whole remote-origin fleet launches', () => {
    const { galaxy, sourceFleet } = createRemoteOriginGalaxy({ sourceTransporters: 1, sourceDeuterium: 120 });

    const result = createFleetMission(
      { galaxy, playerId: 1 },
      {
        missionType: FleetMissionType.MOVE,
        origin: { x: 0, y: 0, z: 0 },
        originFleetId: sourceFleet.fleetId,
        target: { x: 0, y: 0, z: 1 },
        ships: [{ type: ShipType.TRANSPORTER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(galaxy.activeFleets).toHaveLength(1);
    expect(result.value.fleet.fleetId).toBe(sourceFleet.fleetId);
    expect(result.value.fleet.state).toBe(FleetState.MOVING_TO_TARGET);
    expect(result.value.fleet.origin).toMatchObject({ x: 0, y: 0, z: 0 });
    expect(result.value.fleet.target).toMatchObject({ x: 0, y: 0, z: 1 });
    expect(result.value.fleet.isRemoteOrigin).toBe(true);
    expect(result.value.fleet.remoteOriginSourceFleetId).toBe(sourceFleet.fleetId);
    expect(result.value.fleet.cargo.deuterium).toBe(120 - result.value.fleet.fuelCost);
  });

  it('creates a detached remote-origin subfleet and leaves the parent orbiting with remaining ships', () => {
    const { galaxy, sourceFleet } = createRemoteOriginGalaxy({ sourceTransporters: 2, sourceDeuterium: 120, sourceMetal: 10 });

    const result = createFleetMission(
      { galaxy, playerId: 1 },
      {
        missionType: FleetMissionType.MOVE,
        origin: { x: 0, y: 0, z: 0 },
        originFleetId: sourceFleet.fleetId,
        target: { x: 0, y: 0, z: 1 },
        ships: [{ type: ShipType.TRANSPORTER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 10, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(galaxy.activeFleets).toHaveLength(2);
    expect(result.value.fleet.fleetId).not.toBe(sourceFleet.fleetId);
    expect(result.value.fleet.isRemoteOrigin).toBe(true);
    expect(result.value.fleet.remoteOriginSourceFleetId).toBe(sourceFleet.fleetId);
    expect(result.value.fleet.cargo.metal).toBe(10);
    expect(ManyShips.countByType(result.value.fleet.ships).get(ShipType.TRANSPORTER)).toBe(1);
    expect(sourceFleet.state).toBe(FleetState.ORBITING);
    expect(ManyShips.countByType(sourceFleet.ships).get(ShipType.TRANSPORTER)).toBe(1);
    expect(sourceFleet.cargo.deuterium).toBe(120 - result.value.fleet.fuelCost);
    expect(sourceFleet.cargo.metal).toBe(0);
  });

  it('uses Jump Gate travel cost instead of distance fuel when Jump Gate is selected', () => {
    const { galaxy, origin } = createOwnedJumpGateGalaxy();

    const result = createFleetMission(
      { galaxy, playerId: 1 },
      {
        missionType: FleetMissionType.MOVE,
        origin: { x: 0, y: 0, z: 0 },
        target: { x: 0, y: 0, z: 1 },
        ships: [
          { type: ShipType.CRUISER, undamagedAmount: 2, damagedAmount: 0 },
          { type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }
        ],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: true,
        bombardmentPriorities: null
      }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.fleet.usesJumpGate).toBe(true);
    expect(result.value.fleet.travelTurns).toBe(1);
    expect(result.value.fleet.fuelCost).toBe(17);
    expect(origin.rBDSFTQ.resources.deuterium).toBe(100 - 17);
  });
});

function createRemoteOriginGalaxy(options: {
  sourceTransporters: number;
  sourceDeuterium: number;
  sourceMetal?: number;
}) {
  const system = new SolarSystem('Remote Test', 2, false, false, { x: 0, y: 0 }, new Set<number>(), new Map());
  const [originPlanet, targetPlanet] = system.planets;

  originPlanet.basicInfo.name = 'Forward Orbit';
  originPlanet.info.ownerId = 1;
  targetPlanet.basicInfo.name = 'Fallback Base';
  targetPlanet.info.ownerId = 1;

  const sourceFleetShips = ManyShips.empty();
  sourceFleetShips.addUndamaged(ShipType.TRANSPORTER, options.sourceTransporters);
  const sourceFleet = new Fleet(
    17,
    1,
    FleetMissionType.MOVE,
    new Destination(0, 0, 1),
    new Destination(0, 0, 0),
    'Fallback Base',
    'Forward Orbit',
    sourceFleetShips,
    new ResourcesPack(options.sourceMetal ?? 0, 0, options.sourceDeuterium),
    options.sourceTransporters * 600,
    (options.sourceMetal ?? 0) + options.sourceDeuterium,
    1,
    1,
    1,
    FleetState.ORBITING,
    9,
    undefined,
    FleetOrbitActivity.IDLE
  );

  const player = new Player(
    1,
    'Alpha',
    [originPlanet, targetPlanet],
    new Map([
      [TechnologyType.COMPUTER_TECHNOLOGY, 4],
      [TechnologyType.FUSION_DRIVE, 2],
      [TechnologyType.HYPERSPACE_DRIVE, 1]
    ]),
    [sourceFleet],
    PlayerType.PLAYER
  );

  const stars = [[system]];
  const galaxy = new Galaxy('Remote Origin Galaxy', [player], stars, 9, [sourceFleet], 18);

  return {
    galaxy,
    sourceFleet
  };
}

function createOwnedJumpGateGalaxy() {
  const system = new SolarSystem('Jump Cost Test', 2, false, false, { x: 0, y: 0 }, new Set<number>(), new Map());
  const [origin, target] = system.planets;

  origin.basicInfo.name = 'Origin';
  origin.info.ownerId = 1;
  origin.rBDSFTQ.resources = new ResourcesPack(0, 0, 100);
  origin.rBDSFTQ.ships = ManyShips.empty();
  origin.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
  origin.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
  origin.setBuildingLevel(BuildingType.JUMP_GATE, 3);

  target.basicInfo.name = 'Target';
  target.info.ownerId = 1;
  target.setBuildingLevel(BuildingType.JUMP_GATE, 2);

  const player = new Player(
    1,
    'Alpha',
    [origin, target],
    new Map([
      [TechnologyType.COMPUTER_TECHNOLOGY, 4],
      [TechnologyType.HYPERSPACE_TECHNOLOGY, 3],
      [TechnologyType.HYPERSPACE_DRIVE, 4]
    ]),
    [],
    PlayerType.PLAYER
  );

  const galaxy = new Galaxy('Jump Gate Cost Galaxy', [player], [[system]], 9, [], 1);
  return { galaxy, origin, target };
}
