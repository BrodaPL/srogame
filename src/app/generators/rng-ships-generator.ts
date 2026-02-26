import { ShipBlueprintsFactory } from '../factories/ship-blueprints.factory';
import { ShipInstance } from '../models/fleets/ship-instance';
import { ShipType } from '../models/enums/ship-type';
import { LevelMappings } from './level-mappings';

// Generates ship instances based on player level and a target resource value budget.
export class RngShipsGenerator {
  generate(level: number, targetShipsValue: number): ShipInstance[] {
    if (!Number.isFinite(level) || level <= 0 || targetShipsValue <= 0) {
      return [];
    }

    // Filter to ships that are unlocked at the current level.
    const eligibleShips = Object.entries(LevelMappings.SHIP_META)
      .filter(([, meta]) => meta.availableFromLevel <= level)
      .map(([key, meta]) => [key as ShipType, meta] as const);

    if (eligibleShips.length === 0) {
      return [];
    }

    const blueprints = ShipBlueprintsFactory.fromDefaultJson();
    const ships: ShipInstance[] = [];
    let totalValue = 0;

    // Keep adding ships until we meet or exceed the target value.
    while (totalValue < targetShipsValue) {
      const [shipType, meta] = this.pickRandom(eligibleShips);
      const ship = blueprints.get(shipType);
      if (!ship) {
        continue;
      }

      const randomNumber = this.randomFloat(0.33, Math.max(0.33, level / 2));
      const rawCount = level * (1 / meta.weight) * Math.ceil(randomNumber);
      const count = Math.max(1, Math.floor(rawCount));

      for (let i = 0; i < count; i += 1) {
        ships.push(new ShipInstance(
          ship,
          ship.hullPointsCapacity,
          ship.shieldCapacity,
          ship.cargoCapacity,
          []
        ));
      }

      totalValue += ship.cost.getTotalValuedResourceAmount() * count;
    }

    return ships;
  }

  private pickRandom<T>(items: readonly T[]): T {
    return items[Math.floor(Math.random() * items.length)];
  }

  private randomFloat(min: number, max: number): number {
    if (max <= min) {
      return min;
    }

    return min + Math.random() * (max - min);
  }
}
