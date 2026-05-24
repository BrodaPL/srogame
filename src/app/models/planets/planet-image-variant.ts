import { PlanetType } from '../enums/planet-type';

export type PlanetImageVariant = [
  scaleStep: number,
  rotationStep: number,
  mirror: 0 | 1,
  brightnessStep: number,
  contrastStep: number,
  saturationStep: number,
  hueStep: number
];

export type PlanetImageVariantStyle = {
  transform: string;
  filter: string;
};

export const DEFAULT_PLANET_IMAGE_VARIANT: PlanetImageVariant = [10, 0, 0, 0, 0, 0, 0];
export const PLANET_IMAGE_MIN_BASE_SIZE = 100;
export const PLANET_IMAGE_MAX_BASE_SIZE = 220;

export function createRandomPlanetImageVariant(
  planetType: PlanetType,
  planetBaseSize: number,
  randomFloat: () => number = Math.random
): PlanetImageVariant {
  return [
    calculatePlanetImageScaleStep(planetBaseSize),
    planetType === PlanetType.ASTEROIDS ? 0 : randomInt(0, 3, randomFloat),
    randomInt(0, 1, randomFloat) as 0 | 1,
    randomInt(-5, 5, randomFloat),
    randomInt(-5, 5, randomFloat),
    randomInt(-5, 5, randomFloat),
    randomInt(-2, 2, randomFloat)
  ];
}

export function createDeterministicPlanetImageVariant(
  seed: string,
  planetType: PlanetType,
  planetBaseSize: number
): PlanetImageVariant {
  let state = hashSeed(seed);
  const nextFloat = (): number => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };

  return createRandomPlanetImageVariant(planetType, planetBaseSize, nextFloat);
}

export function calculatePlanetImageScaleStep(planetBaseSize: number): number {
  const parsed = Number(planetBaseSize);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PLANET_IMAGE_VARIANT[0];
  }

  const ratio = (parsed - PLANET_IMAGE_MIN_BASE_SIZE)
    / (PLANET_IMAGE_MAX_BASE_SIZE - PLANET_IMAGE_MIN_BASE_SIZE);
  return Math.max(0, Math.min(10, Math.round(ratio * 10)));
}

export function normalizePlanetImageVariant(
  value: unknown,
  planetType: PlanetType
): PlanetImageVariant {
  if (!Array.isArray(value)) {
    return [...DEFAULT_PLANET_IMAGE_VARIANT];
  }

  return [
    clampInt(value[0], 0, 10, DEFAULT_PLANET_IMAGE_VARIANT[0]),
    planetType === PlanetType.ASTEROIDS
      ? 0
      : clampInt(value[1], 0, 3, DEFAULT_PLANET_IMAGE_VARIANT[1]),
    clampInt(value[2], 0, 1, DEFAULT_PLANET_IMAGE_VARIANT[2]) as 0 | 1,
    clampInt(value[3], -5, 5, DEFAULT_PLANET_IMAGE_VARIANT[3]),
    clampInt(value[4], -5, 5, DEFAULT_PLANET_IMAGE_VARIANT[4]),
    clampInt(value[5], -5, 5, DEFAULT_PLANET_IMAGE_VARIANT[5]),
    clampInt(value[6], -2, 2, DEFAULT_PLANET_IMAGE_VARIANT[6])
  ];
}

export function planetImageVariantToStyle(
  variant: PlanetImageVariant | null | undefined,
  planetType: PlanetType = PlanetType.BARREN
): PlanetImageVariantStyle {
  const normalized = normalizePlanetImageVariant(variant, planetType);
  const scale = (50 + (normalized[0] * 5)) / 100;
  const rotation = normalized[1] * 90;
  const mirror = normalized[2] === 1 ? ' scaleX(-1)' : '';
  const brightness = 100 + (normalized[3] * 5);
  const contrast = 100 + (normalized[4] * 5);
  const saturation = 100 + (normalized[5] * 5);
  const hue = normalized[6] * 5;

  return {
    transform: `scale(${scale}) rotate(${rotation}deg)${mirror}`,
    filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%) hue-rotate(${hue}deg)`
  };
}

function randomInt(min: number, max: number, randomFloat: () => number): number {
  const raw = randomFloat();
  const normalized = Number.isFinite(raw) ? Math.min(0.999999999999, Math.max(0, raw)) : 0;
  return min + Math.floor(normalized * ((max - min) + 1));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
