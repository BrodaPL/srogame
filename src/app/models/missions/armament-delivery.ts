import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ShipType } from '../enums/ship-type';
import type { ManyShipsLike } from '../fleets/many-ships';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export const ARMAMENT_DELIVERY_SHIP_TYPES: readonly ShipType[] = [
  ShipType.FIGHTER,
  ShipType.ASSAULT_FIGHTER,
  ShipType.ATMOSPHERIC_FIGHTER,
  ShipType.ATMOSPHERIC_BOMBER,
  ShipType.CORVETTE,
  ShipType.REPAIR_DRONE
];

const ARMAMENT_DELIVERY_SHIP_TYPE_SET = new Set<ShipType>(ARMAMENT_DELIVERY_SHIP_TYPES);

export function isArmamentDeliveryShipType(type: ShipType): boolean {
  return ARMAMENT_DELIVERY_SHIP_TYPE_SET.has(type);
}

export function countArmamentDeliveryShips(
  entries: Array<{ type: ShipType; amount: number }>
): number {
  return entries.reduce((total, entry) =>
    total + (isArmamentDeliveryShipType(entry.type) ? Math.max(0, Math.floor(entry.amount)) : 0), 0);
}

export function calculateArmamentDeliveryShipHangarUsage(
  entries: Array<{ type: ShipType; amount: number }>
): number {
  let total = 0;
  for (const entry of entries) {
    if (!isArmamentDeliveryShipType(entry.type)) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(entry.type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.size) * Math.max(0, Math.floor(entry.amount));
  }

  return total;
}

export function armamentDeliveryShipAmountRequestsFromManyShips(
  ships: ManyShipsLike | null | undefined
): Array<{ type: ShipType; amount: number }> {
  const requests: Array<{ type: ShipType; amount: number }> = [];
  if (!ships) {
    return requests;
  }

  for (const [type, amount] of Object.entries(ships.undamagedShipsCount ?? {}) as Array<[ShipType, number]>) {
    if (isArmamentDeliveryShipType(type) && amount > 0) {
      requests.push({ type, amount: Math.max(0, Math.floor(amount)) });
    }
  }

  const damagedCounts = new Map<ShipType, number>();
  for (const damaged of ships.damagedShips ?? []) {
    if (!isArmamentDeliveryShipType(damaged.type)) {
      continue;
    }

    damagedCounts.set(damaged.type, (damagedCounts.get(damaged.type) ?? 0) + 1);
  }

  for (const [type, amount] of damagedCounts.entries()) {
    const existing = requests.find((entry) => entry.type === type);
    if (existing) {
      existing.amount += amount;
    } else {
      requests.push({ type, amount });
    }
  }

  return requests;
}
