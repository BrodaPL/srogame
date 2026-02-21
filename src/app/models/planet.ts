import { Building } from './building';
import { Fleet } from './fleet';
import { PlanetType } from './enum/planet-type';
import { Player } from './player';
import { ResourcesPack } from './resources-pack';
import { Ship } from './ship';
import { SolarSystem } from './solar-system';
import { Technology } from './technology';
import { ShipInstance } from './ship-instance';

type ModifierKey =
  | 'metalModifier'
  | 'crystalModifier'
  | 'deuteriumModifier'
  | 'energyModifierRES'
  | 'energyModifierNuclear'
  | 'scienceModifier'
  | 'industryModifier';

type ModifierRange = {
  min: number;
  max: number;
};

export class Planet {
  public static createStartingPlanet(
    name: string,
    order: number,
    solarSystem: SolarSystem,
    owner: Player | null = null
  ): Planet {
    const type = Planet.randomStartingPlanetType();
    const colonizationRange = Planet.colonizationDifficultyRangeFor(type);

    return new Planet(
      name,
      type,
      Planet.randomInt(colonizationRange.min, colonizationRange.max),
      order,
      solarSystem,
      owner,
      new ResourcesPack(0, 0, 0),
      [],
      new ResourcesPack(0, 0, 0),
      160,
      [],
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      [],
      [],
      [],
      []
    );
  }

  public static createRandomEmpty(
    name: string,
    order: number,
    solarSystem: SolarSystem,
    owner: Player | null = null,
    forcedType?: PlanetType
  ): Planet {
    const type = forcedType ?? Planet.randomPlanetType();
    // Pick modifier ranges based on planet type, then roll actual values within those ranges.
    const modifierRanges = Planet.modifierRangesFor(type);
    const colonizationRange = Planet.colonizationDifficultyRangeFor(type);

    return new Planet(
      name,
      type,
      Planet.randomInt(colonizationRange.min, colonizationRange.max),
      order,
      solarSystem,
      owner,
      new ResourcesPack(0, 0, 0),
      [],
      new ResourcesPack(0, 0, 0),
      Planet.randomInt(90, 200),
      [],
      Planet.randomFloat(modifierRanges.metalModifier.min, modifierRanges.metalModifier.max),
      Planet.randomFloat(modifierRanges.crystalModifier.min, modifierRanges.crystalModifier.max),
      Planet.randomFloat(modifierRanges.deuteriumModifier.min, modifierRanges.deuteriumModifier.max),
      Planet.randomFloat(modifierRanges.energyModifierRES.min, modifierRanges.energyModifierRES.max),
      Planet.randomFloat(modifierRanges.energyModifierNuclear.min, modifierRanges.energyModifierNuclear.max),
      Planet.randomFloat(modifierRanges.scienceModifier.min, modifierRanges.scienceModifier.max),
      Planet.randomFloat(modifierRanges.industryModifier.min, modifierRanges.industryModifier.max),
      [],
      [],
      [],
      []
    );
  }

  constructor(
    public name: string,
    public type: PlanetType,
    public colonizationDifficulty: number,
    public order: number,
    public solarSystem: SolarSystem,
    public owner: Player | null,
    public resources: ResourcesPack,
    public fleets: Fleet[],
    public spaceDebris: ResourcesPack,
    public size: number,
    public buildings: Building[],
    public metalModifier: number,
    public crystalModifier: number,
    public deuteriumModifier: number,
    public energyModifierRES: number,
    public energyModifierNuclear: number,
    public scienceModifier: number,
    public industryModifier: number,
    public technologyQueue: Technology[],
    public buildingQueue: Building[],
    public shipyardQueue: Ship[],
    public orbitShips: ShipInstance[]
  ) {}

  // Per-planet type ranges. Keep ranges in percent, converted to multipliers via percentRange().
  private static readonly PLANET_MODIFIER_RANGES: Record<
    PlanetType,
    Record<ModifierKey, ModifierRange>> = {
    [PlanetType.BARREN]: {
      metalModifier: Planet.percentRange(-30, 50),
      crystalModifier: Planet.percentRange(-30, 50),
      deuteriumModifier: Planet.percentRange(-30, 50),
      energyModifierRES: Planet.percentRange(-20, 50),
      energyModifierNuclear: Planet.percentRange(-20, 50),
      scienceModifier: Planet.percentRange(-10, 50),
      industryModifier: Planet.percentRange(-30, 50),
    },
    [PlanetType.DRY]: {
      metalModifier: Planet.percentRange(-30, 50),
      crystalModifier: Planet.percentRange(-30, 50),
      deuteriumModifier: Planet.percentRange(-50, -20),
      energyModifierRES: Planet.percentRange(-50, 30),
      energyModifierNuclear: Planet.percentRange(-50, 30),
      scienceModifier: Planet.percentRange(-50, 50),
      industryModifier: Planet.percentRange(-50, 30),
    },
    [PlanetType.ICE]: {
      metalModifier: Planet.percentRange(-50, 50),
      crystalModifier: Planet.percentRange(-50, 50),
      deuteriumModifier: Planet.percentRange(-20, 50),
      energyModifierRES: Planet.percentRange(-50, 10),
      energyModifierNuclear: Planet.percentRange(-30, 50),
      scienceModifier: Planet.percentRange(-50, 50),
      industryModifier: Planet.percentRange(-50, 30),
    },
    [PlanetType.JUNGLE]: {
      metalModifier: Planet.percentRange(-50, 50),
      crystalModifier: Planet.percentRange(-50, 50),
      deuteriumModifier: Planet.percentRange(-50, 50),
      energyModifierRES: Planet.percentRange(-40, 50),
      energyModifierNuclear: Planet.percentRange(-50, 50),
      scienceModifier: Planet.percentRange(-50, 40),
      industryModifier: Planet.percentRange(-50, 40),
    },
    [PlanetType.SAVANNA]: {
      metalModifier: Planet.percentRange(-50, 30),
      crystalModifier: Planet.percentRange(-50, 30),
      deuteriumModifier: Planet.percentRange(-50, 30),
      energyModifierRES: Planet.percentRange(-40, 40),
      energyModifierNuclear: Planet.percentRange(-50, 50),
      scienceModifier: Planet.percentRange(-40, 40),
      industryModifier: Planet.percentRange(-30, 50),
    },
    [PlanetType.OCEANIC]: {
      metalModifier: Planet.percentRange(-50, 40),
      crystalModifier: Planet.percentRange(-50, 40),
      deuteriumModifier: Planet.percentRange(-10, 50),
      energyModifierRES: Planet.percentRange(-40, 50),
      energyModifierNuclear: Planet.percentRange(-30, 50),
      scienceModifier: Planet.percentRange(-40, 40),
      industryModifier: Planet.percentRange(-50, 20),
    },
    [PlanetType.ASTEROIDS]: {
      metalModifier: Planet.percentRange(-75, 75),
      crystalModifier: Planet.percentRange(-75, 75),
      deuteriumModifier: Planet.percentRange(-75, 75),
      energyModifierRES: Planet.percentRange(-100, -80),
      energyModifierNuclear: Planet.percentRange(-20, 40),
      scienceModifier: Planet.percentRange(-60, 60),
      industryModifier: Planet.percentRange(-60, -20),
    },
  };

  private static readonly PLANET_COLONIZATION_DIFFICULTY_RANGES: Record<
    PlanetType,
    { min: number; max: number }
  > = {
    [PlanetType.BARREN]: { min: 7, max: 10 },
    [PlanetType.DRY]: { min: 5, max: 9 },
    [PlanetType.ICE]: { min: 4, max: 7 },
    [PlanetType.JUNGLE]: { min: 2, max: 4 },
    [PlanetType.SAVANNA]: { min: 1, max: 3 },
    [PlanetType.OCEANIC]: { min: 3, max: 6 },
    [PlanetType.ASTEROIDS]: { min: 50, max: 50 },
  };

  private static randomPlanetType(): PlanetType {
    const types = Object.values(PlanetType) as PlanetType[];
    return types[Planet.randomInt(0, types.length - 1)];
  }

  private static randomStartingPlanetType(): PlanetType {
    const types: PlanetType[] = [PlanetType.JUNGLE, PlanetType.SAVANNA, PlanetType.OCEANIC];
    return types[Planet.randomInt(0, types.length - 1)];
  }

  private static percentRange(minPercent: number, maxPercent: number): ModifierRange {
    // Convert percent deltas to multipliers. Example: -50%..+50% -> 0.5..1.5.
    return {
      min: 1 + minPercent / 100,
      max: 1 + maxPercent / 100,
    };
  }

  private static modifierRangesFor(type: PlanetType): Record<ModifierKey, ModifierRange> {
    return Planet.PLANET_MODIFIER_RANGES[type];
  }

  private static colonizationDifficultyRangeFor(type: PlanetType): { min: number; max: number } {
    return Planet.PLANET_COLONIZATION_DIFFICULTY_RANGES[type];
  }

  private static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private static randomFloat(min: number, max: number, decimals = 2): number {
    const value = Math.random() * (max - min) + min;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
