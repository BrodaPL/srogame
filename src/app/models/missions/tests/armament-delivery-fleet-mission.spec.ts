import { describe, expect, it } from 'vitest';
import { DiplomacyResolver } from '../../diplomacy/diplomacy-resolver';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { DefenceType } from '../../enums/defence-type';
import { FleetMissionType } from '../../enums/fleet-mission-type';
import { ShipType } from '../../enums/ship-type';
import { FleetMissionRegistry } from '../fleet-mission-registry';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
import { SolarSystem } from '../../planets/solar-system';
import { ResourcesPack } from '../../resources-pack';

const registry = FleetMissionRegistry.createDefault();

describe('ArmamentDeliveryFleetMission', () => {
  it('allows delivering to allied planets with carrier-loaded payload', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ARMAMENT_DELIVERY);

    const checks = mission.validateLaunch({
      selection: {
        ships: [
          { type: ShipType.CARRIER, undamagedAmount: 1, damagedAmount: 0 },
          { type: ShipType.FIGHTER, undamagedAmount: 2, damagedAmount: 0 }
        ],
        carriedBombs: [{ type: DefenceType.SMALL_BOMB, amount: 2 }],
        cargo: { metal: 100, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 400,
      usedCargoCapacity: 100,
      totalHangarCapacity: 15,
      usedHangarCapacity: 4,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }])
    });

    expect(checks).toEqual([]);
  });

  it('rejects peace targets', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ARMAMENT_DELIVERY);

    const checks = mission.validateLaunch({
      selection: {
        ships: [
          { type: ShipType.CARRIER, undamagedAmount: 1, damagedAmount: 0 },
          { type: ShipType.FIGHTER, undamagedAmount: 1, damagedAmount: 0 }
        ],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 400,
      usedCargoCapacity: 0,
      totalHangarCapacity: 15,
      usedHangarCapacity: 1,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.PEACE }])
    });

    expect(checks.map((check) => check.text)).toContain(
      'Armament Delivery mission target must be one of your planets or an allied planet.'
    );
  });

  it('rejects cargo-only payloads', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ARMAMENT_DELIVERY);

    const checks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.CARRIER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 100, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 400,
      usedCargoCapacity: 100,
      totalHangarCapacity: 15,
      usedHangarCapacity: 0,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }])
    });

    expect(checks.map((check) => check.text)).toContain(
      'Armament Delivery mission requires at least one PLANETARY_BOMB or one deliverable small ship.'
    );
  });

  it('rejects payloads without a carrier', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ARMAMENT_DELIVERY);

    const checks = mission.validateLaunch({
      selection: {
        ships: [{ type: ShipType.FIGHTER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 0,
      usedCargoCapacity: 0,
      totalHangarCapacity: 0,
      usedHangarCapacity: 1,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }])
    });

    expect(checks.map((check) => check.text)).toContain(
      'Armament Delivery mission requires at least one carrier ship with hangar capacity.'
    );
  });

  it('rejects payloads that exceed carrier hangar capacity', () => {
    const { originPlanet, targetPlanet } = createMissionPlan();
    const mission = registry.require(FleetMissionType.ARMAMENT_DELIVERY);

    const checks = mission.validateLaunch({
      selection: {
        ships: [
          { type: ShipType.CRUISER, undamagedAmount: 1, damagedAmount: 0 },
          { type: ShipType.ASSAULT_FIGHTER, undamagedAmount: 1, damagedAmount: 0 }
        ],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      },
      playerId: 1,
      originPlanet,
      targetPlanet,
      targetOwner: new Player(2, 'Beta', [targetPlanet], new Map(), [], PlayerType.PLAYER),
      activeFleetCount: 0,
      maxActiveFleetCount: 5,
      totalCargoCapacity: 50,
      usedCargoCapacity: 0,
      totalHangarCapacity: 1,
      usedHangarCapacity: 2,
      hasMilitaryShips: true,
      fuelCost: 1,
      diplomacyResolver: new DiplomacyResolver([{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }])
    });

    expect(checks.map((check) => check.text)).toContain(
      'Selected armament payload exceeds the fleet hangar capacity.'
    );
  });
});

function createMissionPlan() {
  const system = new SolarSystem('Armament Delivery Test', 2, false, false, { x: 1, y: 1 }, new Set<number>(), new Map());
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
