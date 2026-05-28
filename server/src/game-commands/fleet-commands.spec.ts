import { describe, expect, it } from 'vitest';
import { Fleet, FleetOrbitActivity, FleetState } from '../../../src/app/models/fleets/fleet.js';
import { Destination } from '../../../src/app/models/fleets/destination.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
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
