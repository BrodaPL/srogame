import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ShipType } from '../enums/ship-type';
import { WeaponType } from '../enums/weapon-type';
import type { ManyShipsLike } from '../fleets/many-ships';
import { ManyShips } from '../fleets/many-ships';
import type { Ship } from '../fleets/ship';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export function calculateRecycleCapabilityForManyShips(ships: ManyShipsLike | null | undefined): number {
  return calculateRecycleCapabilityFromEntries(ManyShips.countByType(ships).entries());
}

export function calculateRecycleCapabilityFromEntries(shipCounts: Iterable<[ShipType, number]>): number {
  let recycleAmount = 0;

  for (const [shipType, rawAmount] of shipCounts) {
    const amount = Math.max(0, Math.floor(rawAmount));
    if (amount <= 0) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint) {
      continue;
    }

    recycleAmount += calculateShipRecycleStrength(blueprint) * amount;
  }

  return recycleAmount;
}

export function calculateShipRecycleStrength(ship: Ship): number {
  let recycleAmount = 0;

  for (const weapon of ship.weapons) {
    if (weapon.type !== WeaponType.RECYCLE_EQUIPMENT) {
      continue;
    }

    recycleAmount += Math.max(0, weapon.dmg) * Math.max(0, weapon.shots);
  }

  return recycleAmount;
}

export function hasRecycleEquipment(ship: Ship): boolean {
  return ship.weapons.some((weapon) => weapon.type === WeaponType.RECYCLE_EQUIPMENT);
}
