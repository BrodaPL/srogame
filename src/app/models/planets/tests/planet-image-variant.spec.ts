import { describe, expect, it } from 'vitest';
import { PlanetType } from '../../enums/planet-type';
import {
  calculatePlanetImageScaleStep,
  createDeterministicPlanetImageVariant,
  createRandomPlanetImageVariant,
  normalizePlanetImageVariant,
  planetImageVariantToStyle
} from '../planet-image-variant';

describe('planet image variants', () => {
  it('clamps compact variant values to the supported display ranges', () => {
    expect(normalizePlanetImageVariant([99, 9, 7, -99, 99, 12, -9], PlanetType.BARREN)).toEqual([
      10,
      3,
      1,
      -5,
      5,
      5,
      -2
    ]);
  });

  it('forces asteroid rotation to zero', () => {
    expect(normalizePlanetImageVariant([8, 3, 1, 0, 0, 0, 0], PlanetType.ASTEROIDS)).toEqual([
      8,
      0,
      1,
      0,
      0,
      0,
      0
    ]);
  });

  it('decodes compact values into transform and filter styles', () => {
    expect(planetImageVariantToStyle([8, 2, 1, -2, 1, 3, -1], PlanetType.TERRESTRIAL)).toEqual({
      transform: 'scale(0.9) rotate(180deg) scaleX(-1)',
      filter: 'brightness(90%) contrast(105%) saturate(115%) hue-rotate(-5deg)'
    });
  });

  it('ties image scale step to base planet size', () => {
    expect(calculatePlanetImageScaleStep(100)).toBe(0);
    expect(calculatePlanetImageScaleStep(160)).toBe(5);
    expect(calculatePlanetImageScaleStep(220)).toBe(10);
    expect(calculatePlanetImageScaleStep(40)).toBe(0);
    expect(calculatePlanetImageScaleStep(300)).toBe(10);
  });

  it('uses base planet size for generated variant scale', () => {
    const small = createRandomPlanetImageVariant(PlanetType.BARREN, 100, () => 0.9);
    const large = createRandomPlanetImageVariant(PlanetType.BARREN, 220, () => 0.1);

    expect(small[0]).toBe(0);
    expect(large[0]).toBe(10);
  });

  it('creates stable deterministic variants from the same seed', () => {
    const first = createDeterministicPlanetImageVariant('1:2:3:Jungle', PlanetType.JUNGLE, 175);
    const second = createDeterministicPlanetImageVariant('1:2:3:Jungle', PlanetType.JUNGLE, 175);

    expect(first).toEqual(second);
  });
});
