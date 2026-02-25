import { RngTechnologyGenerator } from '../rng-technology-generator';
import { TechnologyType } from '../../models/enums/technology-type';

function mapToSortedRecord(map: Map<TechnologyType, number>): Record<string, number> {
  return Object.fromEntries(
    Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  );
}

describe('RngTechnologyGenerator', () => {
  it('logs generated technology levels for sample player levels', () => {
    const generator = new RngTechnologyGenerator();
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
        const result = generator.generate(level);
        console.log(`playerLevel=${level}`, mapToSortedRecord(result));
      }
    } finally {
      Math.random = originalRandom;
    }

    expect(true).toBe(true);
  });

  it('includes all technology types in the output map', () => {
    const generator = new RngTechnologyGenerator();
    const originalRandom = Math.random;
    Math.random = () => 0.5;

    try {
      const result = generator.generate(3);
      expect(result.size).toBe(Object.values(TechnologyType).length);
    } finally {
      Math.random = originalRandom;
    }
  });
});
