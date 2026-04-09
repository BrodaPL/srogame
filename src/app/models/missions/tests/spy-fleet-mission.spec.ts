import { describe, expect, it } from 'vitest';
import { DiplomacyResolver } from '../../diplomacy/diplomacy-resolver';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { ShipType } from '../../enums/ship-type';
import { FleetMissionRegistry } from '../fleet-mission-registry';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
import { SolarSystem } from '../../planets/solar-system';
import { ResourcesPack } from '../../resources-pack';

const registry = FleetMissionRegistry.createDefault();

describe('SpyFleetMission', () => {
  it('allows spying neutral planets', () => {
    const { originPlanet, targetPlanet, targetOwner } = createMissionPlan();
    const mission = registry.require(FleetMissionType.SPY);

    const checks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner,
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 0,
      usedCargoCapacity: 0,
      totalHangarCapacity: 0,
      usedHangarCapacity: 0,
      hasMilitaryShips: false,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([])
    });

    expect(checks).toEqual([]);
  });

  it('allows spying passive planets but still blocks self-owned targets', () => {
    const { originPlanet, targetPlanet, targetOwner } = createMissionPlan();
    const mission = registry.require(FleetMissionType.SPY);

    const passiveChecks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner,
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 0,
      usedCargoCapacity: 0,
      totalHangarCapacity: 0,
      usedHangarCapacity: 0,
      hasMilitaryShips: false,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.PASSIVE }])
    });
    expect(passiveChecks).toEqual([]);

    const selfChecks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet: originPlanet,
      targetOwner: new Player(1, 'Alpha', [originPlanet], new Map(), [], PlayerType.PLAYER),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 0,
      usedCargoCapacity: 0,
      totalHangarCapacity: 0,
      usedHangarCapacity: 0,
      hasMilitaryShips: false,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([])
    });

    expect(selfChecks.map((check) => check.text)).toContain('Target is your own planet.');
  });
});

function createMissionPlan() {
  const system = new SolarSystem('Spy Test', 2, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
  const originPlanet = system.planets[0]!;
  const targetPlanet = system.planets[1]!;
  originPlanet.info.ownerId = 1;
  targetPlanet.info.ownerId = 2;
  originPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 10);

  return {
    originPlanet,
    targetPlanet,
    targetOwner: new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER)
  };
}
