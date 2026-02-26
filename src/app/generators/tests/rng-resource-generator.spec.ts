import { RngResourceGenerator } from '../rng-resource-generator';
import { RESOURCE_LEVEL_GROWTH } from '../resource-scaling';

describe('RngResourceGenerator', () => {
  it('generates resources using the base scaling formula', () => {
    const generator = new RngResourceGenerator();
    const level = 2;
    const result = generator.generateSimple(level);
    const multiplier = RESOURCE_LEVEL_GROWTH ** level;

    console.log('generateSimple', { level, result });

    expect(result.metal).toBeCloseTo(240 * multiplier, 8);
    expect(result.crystal).toBeCloseTo(160 * multiplier, 8);
    expect(result.deuterium).toBeCloseTo(80 * multiplier, 8);
  });

  it('applies resource modifiers correctly', () => {
    const generator = new RngResourceGenerator();
    const level = 2;
    const multiplier = RESOURCE_LEVEL_GROWTH ** level;
    const result = generator.generateWithModifiers(level, 1.5, 2, 0.5);

    console.log('generateWithModifiers', { level, result });

    expect(result.metal).toBeCloseTo(240 * multiplier * 1.5, 8);
    expect(result.crystal).toBeCloseTo(160 * multiplier * 2, 8);
    expect(result.deuterium).toBeCloseTo(80 * multiplier * 0.5, 8);
  });

  it('uses rng multipliers within the provided percent range', () => {
    const generator = new RngResourceGenerator();
    const level = 2;
    const multiplier = RESOURCE_LEVEL_GROWTH ** level;
    const originalRandom = Math.random;
    const sequence = [0, 0.5, 0.999];
    let index = 0;

    Math.random = () => {
      const value = sequence[index % sequence.length];
      index += 1;
      return value;
    };

    try {
      const result = generator.generateWithModifiersAndRng(level, 1, 1, 1, 10);
      const minMultiplier = 0.9;
      const maxMultiplier = 1.1;
      const metalMultiplier = minMultiplier + sequence[0] * (maxMultiplier - minMultiplier);
      const crystalMultiplier = minMultiplier + sequence[1] * (maxMultiplier - minMultiplier);
      const deuteriumMultiplier = minMultiplier + sequence[2] * (maxMultiplier - minMultiplier);

      console.log('generateWithModifiersAndRng', { level, result });

      expect(result.metal).toBeCloseTo(240 * multiplier * metalMultiplier, 8);
      expect(result.crystal).toBeCloseTo(160 * multiplier * crystalMultiplier, 8);
      expect(result.deuterium).toBeCloseTo(80 * multiplier * deuteriumMultiplier, 8);
    } finally {
      Math.random = originalRandom;
    }
  });

  it('logs generateSimple results for levels 1 through 20', () => {
    const generator = new RngResourceGenerator();

    for (let level = 1; level <= 20; level += 1) {
      const result = generator.generateSimple(level);
      console.log('generateSimple', { level, result });
    }

    expect(true).toBe(true);
  });
});
