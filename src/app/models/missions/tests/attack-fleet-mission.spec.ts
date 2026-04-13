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

describe('AttackFleetMission', () => {
  it('allows attacking neutral planets', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ATTACK);

    const checks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.CRUISER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'N-2', [targetPlanet], new Map(), [], PlayerType.NEUTRAL),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 0,
      usedCargoCapacity: 0,
      totalHangarCapacity: 0,
      usedHangarCapacity: 0,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([])
    });

    expect(checks).toEqual([]);
  });

  it('still allows attacking passive planets', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ATTACK);

    const checks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.CRUISER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'N-2', [targetPlanet], new Map(), [], PlayerType.NEUTRAL),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 0,
      usedCargoCapacity: 0,
      totalHangarCapacity: 0,
      usedHangarCapacity: 0,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.PASSIVE }])
    });

    expect(checks).toEqual([]);
  });
});

function createMissionPlan() {
  const system = new SolarSystem('Attack Test', 2, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
  const originPlanet = system.planets[0]!;
  const targetPlanet = system.planets[1]!;
  originPlanet.info.ownerId = 1;
  targetPlanet.info.ownerId = 2;
  originPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 10);

  return {
    originPlanet,
    targetPlanet
  };
}
