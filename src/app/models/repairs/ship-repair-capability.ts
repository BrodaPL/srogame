import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ShipType } from '../enums/ship-type';
import { WeaponType } from '../enums/weapon-type';
import type { ManyShipsLike } from '../fleets/many-ships';
import { ManyShips } from '../fleets/many-ships';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export type RepairCapabilityBreakdown = {
  shipRepair: number;
  industryRepair: number;
  droneRepair: number;
  nonDroneShipRepair: number;
  droneEquipmentCount: number;
  nonDroneEquipmentCount: number;
};

export type RepairEquipmentBurstGroup = {
  shipType: ShipType;
  damage: number;
  shots: number;
  preferNonSmallTargets: boolean;
  isDrone: boolean;
};

export function calculateRepairCapabilityForManyShips(
  ships: ManyShipsLike | null | undefined,
  options?: {
    shipyardPower?: number;
    industryPower?: number;
  }
): RepairCapabilityBreakdown {
  return calculateRepairCapabilityFromEntries(
    ManyShips.countByType(ships).entries(),
    options
  );
}

export function calculateRepairCapabilityFromEntries(
  shipCounts: Iterable<[ShipType, number]>,
  options?: {
    shipyardPower?: number;
    industryPower?: number;
  }
): RepairCapabilityBreakdown {
  let nonDroneShipRepair = 0;
  let droneRepair = 0;
  let nonDroneEquipmentCount = 0;
  let droneEquipmentCount = 0;

  for (const [shipType, rawAmount] of shipCounts) {
    const amount = Math.max(0, Math.floor(rawAmount));
    if (amount <= 0) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint) {
      continue;
    }

    for (const weapon of blueprint.weapons) {
      if (weapon.type !== WeaponType.REPAIR_EQUIPMENT) {
        continue;
      }

      const totalRepair = Math.max(0, weapon.dmg) * Math.max(0, weapon.shots) * amount;
      const totalEquipment = Math.max(0, weapon.shots) * amount;
      if (shipType === ShipType.REPAIR_DRONE) {
        droneRepair += totalRepair;
        droneEquipmentCount += totalEquipment;
        continue;
      }

      nonDroneShipRepair += totalRepair;
      nonDroneEquipmentCount += totalEquipment;
    }
  }

  const shipyardPower = Math.max(0, Math.floor(options?.shipyardPower ?? 0));
  const industryRepair = Math.max(0, Math.floor(options?.industryPower ?? 0));

  return {
    shipRepair: shipyardPower + nonDroneShipRepair,
    industryRepair,
    droneRepair,
    nonDroneShipRepair,
    droneEquipmentCount,
    nonDroneEquipmentCount
  };
}

export function collectRepairEquipmentBurstGroupsForManyShips(
  ships: ManyShipsLike | null | undefined
): RepairEquipmentBurstGroup[] {
  return collectRepairEquipmentBurstGroups(ManyShips.countByType(ships).entries());
}

export function collectRepairEquipmentBurstGroups(
  shipCounts: Iterable<[ShipType, number]>
): RepairEquipmentBurstGroup[] {
  const groups: RepairEquipmentBurstGroup[] = [];

  for (const [shipType, rawAmount] of shipCounts) {
    const amount = Math.max(0, Math.floor(rawAmount));
    if (amount <= 0) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint) {
      continue;
    }

    for (const weapon of blueprint.weapons) {
      if (weapon.type !== WeaponType.REPAIR_EQUIPMENT) {
        continue;
      }

      const normalizedDamage = Math.max(0, Math.floor(weapon.dmg));
      const normalizedShots = Math.max(0, Math.floor(weapon.shots));
      if (normalizedDamage <= 0 || normalizedShots <= 0) {
        continue;
      }

      groups.push({
        shipType,
        damage: normalizedDamage,
        shots: normalizedShots * amount,
        preferNonSmallTargets: normalizedDamage >= 40,
        isDrone: shipType === ShipType.REPAIR_DRONE
      });
    }
  }

  return groups;
}
