import { RngShipsGenerator } from '../rng-ships-generator';
import { RngResourceGenerator } from '../rng-resource-generator';
import { ShipType } from '../../models/enums/ship-type';
import { LevelMappings } from '../level-mappings';

function summarizeShips(ships: { type: { type: ShipType } }[]): Record<string, number> {
  const counts = new Map<ShipType, number>();
  for (const ship of ships) {
    const shipType = ship.type.type;
    counts.set(shipType, (counts.get(shipType) ?? 0) + 1);
  }

  return Object.fromEntries(
    Array.from(counts.entries()).sort(([a], [b]) => a.localeCompare(b))
  );
}

function allShipsAvailableFor(level: number, ships: { type: { type: ShipType } }[]): boolean {
  return ships.every((ship) => {
    const meta = LevelMappings.getShipMeta(ship.type.type);
    return meta.availableFromLevel <= level;
  });
}

describe('RngShipsGenerator', () => {
  it('logs generated ships for sample player levels', () => {
    const generator = new RngShipsGenerator();
    const resourceGenerator = new RngResourceGenerator();
    const levelsToTry = [1, 2, 3, 5, 7, 10];
    const originalRandom = Math.random;
    const sequence = [0, 0.25, 0.5, 0.75, 0.999];
    let index = 0;

    Math.random = () => {
      const value = sequence[index % sequence.length];
      index += 1;
      return value;
    };

    try {
      for (const level of levelsToTry) {
        const targetShipsValue = resourceGenerator
          .generateSimple(level)
          .getTotalValuedResourceAmount();
        const ships = generator.generate(level, targetShipsValue);
        console.log(`playerLevel=${level}`, summarizeShips(ships));
      }
    } finally {
      Math.random = originalRandom;
    }

    expect(true).toBe(true);
  });

  it('only generates ships available for the current level', () => {
    const generator = new RngShipsGenerator();
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
      const level = 2;
      const ships = generator.generate(level, 3000);
      console.log(`playerLevel=${level}`, summarizeShips(ships));
      expect(allShipsAvailableFor(level, ships)).toBe(true);
    } finally {
      Math.random = originalRandom;
    }
  });
});
