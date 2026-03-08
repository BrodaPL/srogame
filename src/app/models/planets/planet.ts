import { Building } from '../buildings/building';
import { BuildingType } from '../enums/building-type';
import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { Fleet } from '../fleets/fleet';
import { PlanetType } from '../enums/planet-type';
import { ResourcesPack } from '../resources-pack';
import { Ship } from '../fleets/ship';
import { SolarSystem } from './solar-system';
import { Technology } from '../tech/technology';
import { ShipInstance } from '../fleets/ship-instance';
import { PlanetaryParameters } from './planetary-parameters';
import { PlanetImageHelper } from './planet-image-helper';
import { DefenceBuildingInstances } from '../reports/defence-building-instances';
import { EspionageReportData } from '../reports/espionage-report-data';

type ModifierKey = keyof PlanetaryParameters;

type ModifierRange = {
  min: number;
  max: number;
};

export class PlanetBasicInfo {
  constructor(
    public name: string,
    public type: PlanetType,
    public colonizationDifficulty: number,
    public order: number,
    public solarSystem: SolarSystem,
    public image: string,
    public size: number
  ) {}
}

export class PlanetInfo {
  constructor(
    public ownerId: number | null,
    public planetaryParameters: PlanetaryParameters
  ) {}
}

// rBDSFTQ stands for Resources, Buildings, Defences, Ships, Fleets, Technology, Queues.
export class rBDSFTQ {
  constructor(
    public resources: ResourcesPack,
    public buildingsLevels: Map<BuildingType, number>,
    public buildingsCurrentPowerConsumption: Map<BuildingType, number>,
    public defences: DefenceBuildingInstances[],
    public ships: ShipInstance[],
    public technologyQueue: Technology[],
    public buildingQueue: Building[],
    public shipyardQueue: Ship[],
    public orbitShips: ShipInstance[],
    public fleets: Fleet[],
    public spaceDebris: ResourcesPack
  ) {}
}

export class Planet {
  private static buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson();

  public static createStartingPlanet(
    name: string,
    order: number,
    solarSystem: SolarSystem,
    ownerId: number | null = null
  ): Planet {
    const type = Planet.randomStartingPlanetType();
    const colonizationRange = Planet.colonizationDifficultyRangeFor(type);
    const size = 160;

    return new Planet(
      new PlanetBasicInfo(
        name,
        type,
        Planet.randomInt(colonizationRange.min, colonizationRange.max),
        order,
        solarSystem,
        PlanetImageHelper.getPlanetImage(type, size),
        size
      ),
      new PlanetInfo(
        ownerId,
        new PlanetaryParameters(
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1,
          1
        )
      ),
      new rBDSFTQ(
        new ResourcesPack(0, 0, 0),
        new Map<BuildingType, number>(),
        new Map<BuildingType, number>(),
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        new ResourcesPack(0, 0, 0)
      ),
      new Map<number, EspionageReportData>()
    );
  }

  public static createRandomEmpty(
    name: string,
    order: number,
    solarSystem: SolarSystem,
    ownerId: number | null = null,
    forcedType?: PlanetType
  ): Planet {
    const type = forcedType ?? Planet.randomPlanetType();
    // Pick modifier ranges based on planet type, then roll actual values within those ranges.
    const modifierRanges = Planet.modifierRangesFor(type);
    const colonizationRange = Planet.colonizationDifficultyRangeFor(type);
    const size = Planet.randomInt(90, 200);

    return new Planet(
      new PlanetBasicInfo(
        name,
        type,
        Planet.randomInt(colonizationRange.min, colonizationRange.max),
        order,
        solarSystem,
        PlanetImageHelper.getPlanetImage(type, size),
        size
      ),
      new PlanetInfo(
        ownerId,
        new PlanetaryParameters(
          Planet.randomFloat(modifierRanges.metalModifier.min, modifierRanges.metalModifier.max),
          Planet.randomFloat(modifierRanges.crystalModifier.min, modifierRanges.crystalModifier.max),
          Planet.randomFloat(modifierRanges.deuteriumModifier.min, modifierRanges.deuteriumModifier.max),
          Planet.randomFloat(modifierRanges.energyModifierRES.min, modifierRanges.energyModifierRES.max),
          Planet.randomFloat(modifierRanges.energyModifierNuclear.min, modifierRanges.energyModifierNuclear.max),
          Planet.randomFloat(modifierRanges.scienceModifier.min, modifierRanges.scienceModifier.max),
          Planet.randomFloat(modifierRanges.industryModifier.min, modifierRanges.industryModifier.max),
          Planet.randomSteppedFloat(modifierRanges.anomaliesAndNoise.min, modifierRanges.anomaliesAndNoise.max, 0.05),
          Planet.randomSteppedFloat(modifierRanges.hyperspaceParameters.min, modifierRanges.hyperspaceParameters.max, 0.05)
        )
      ),
      new rBDSFTQ(
        new ResourcesPack(0, 0, 0),
        new Map<BuildingType, number>(),
        new Map<BuildingType, number>(),
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        new ResourcesPack(0, 0, 0)
      ),
      new Map<number, EspionageReportData>()
    );
  }

  constructor(
    public basicInfo: PlanetBasicInfo,
    public info: PlanetInfo,
    public rBDSFTQ: rBDSFTQ,
    lastReportData: Map<number, EspionageReportData>
  ) {
    this._lastReportData = lastReportData;
  }

  private _lastReportData: Map<number, EspionageReportData>;

  public get lastReportData(): Map<number, EspionageReportData> {
    return this._lastReportData;
  }

  public set lastReportData(value: Map<number, EspionageReportData>) {
    this._lastReportData = value;
  }

  public getBuildingLevel(type: BuildingType): number {
    return this.rBDSFTQ.buildingsLevels.get(type) ?? 0;
  }

  public setBuildingLevel(type: BuildingType, level: number): void {
    const normalized = Math.max(0, Math.floor(level));
    if (normalized === 0) {
      this.rBDSFTQ.buildingsLevels.delete(type);
      this.rBDSFTQ.buildingsCurrentPowerConsumption.delete(type);
      return;
    }

    this.rBDSFTQ.buildingsLevels.set(type, normalized);
    this.normalizeCurrentPowerConsumption(type);
  }

  public addBuildingLevel(type: BuildingType, delta = 1): number {
    const next = this.getBuildingLevel(type) + delta;
    this.setBuildingLevel(type, next);
    return this.getBuildingLevel(type);
  }

  public getCurrentBuildingPowerConsumption(type: BuildingType): number {
    const max = this.getMaxBuildingPowerConsumption(type);
    if (max <= 0) {
      return 0;
    }

    const stored = this.rBDSFTQ.buildingsCurrentPowerConsumption.get(type);
    if (stored === undefined || !Number.isFinite(stored)) {
      return max;
    }

    return Math.min(max, Math.max(0, stored));
  }

  public setCurrentBuildingPowerConsumption(type: BuildingType, value: number): number {
    const max = this.getMaxBuildingPowerConsumption(type);
    if (max <= 0) {
      this.rBDSFTQ.buildingsCurrentPowerConsumption.delete(type);
      return 0;
    }

    const normalizedValue = Number.isFinite(value) ? value : max;
    const clamped = Math.min(max, Math.max(0, normalizedValue));
    this.rBDSFTQ.buildingsCurrentPowerConsumption.set(type, clamped);
    return clamped;
  }

  public getMaxBuildingPowerConsumption(type: BuildingType): number {
    const level = this.getBuildingLevel(type);
    if (level <= 0) {
      return 0;
    }

    const blueprint = Planet.buildingBlueprints.get(type);
    if (!blueprint) {
      return 0;
    }

    const powerPerLevel = blueprint.powerConsumption ?? 0;
    if (powerPerLevel <= 0) {
      return 0;
    }

    return level * powerPerLevel;
  }

  public getBuildingProductionValue1(type: BuildingType): number {
    const level = this.getBuildingLevel(type);
    if (level <= 0) {
      return 0;
    }

    const blueprint = Planet.buildingBlueprints.get(type);
    if (!blueprint) {
      return 0;
    }

    const value = blueprint.production1[level];
    return Number.isFinite(value) ? value : 0;
  }

  public getMetalGain(adaptiveTechnologyLevel: number): number {
    return this.getBuildingProductionValue1(BuildingType.METAL_MINE)
      * Planet.adaptiveTechnologyMultiplier(adaptiveTechnologyLevel)
      * this.info.planetaryParameters.metalModifier;
  }

  public getCrystalGain(adaptiveTechnologyLevel: number): number {
    return this.getBuildingProductionValue1(BuildingType.CRYSTAL_MINE)
      * Planet.adaptiveTechnologyMultiplier(adaptiveTechnologyLevel)
      * this.info.planetaryParameters.crystalModifier;
  }

  public getDeuteriumGain(adaptiveTechnologyLevel: number): number {
    return this.getBuildingProductionValue1(BuildingType.DEUTERIUM_SYNTHESIZER)
      * Planet.adaptiveTechnologyMultiplier(adaptiveTechnologyLevel)
      * this.info.planetaryParameters.deuteriumModifier;
  }

  private static adaptiveTechnologyMultiplier(adaptiveTechnologyLevel: number): number {
    const normalized = Number.isFinite(adaptiveTechnologyLevel)
      ? adaptiveTechnologyLevel
      : 0;
    return (normalized / 100) + 1;
  }

  private normalizeCurrentPowerConsumption(type: BuildingType): void {
    const max = this.getMaxBuildingPowerConsumption(type);
    if (max <= 0) {
      this.rBDSFTQ.buildingsCurrentPowerConsumption.delete(type);
      return;
    }

    const existing = this.rBDSFTQ.buildingsCurrentPowerConsumption.get(type);
    if (existing === undefined || !Number.isFinite(existing)) {
      this.rBDSFTQ.buildingsCurrentPowerConsumption.set(type, max);
      return;
    }

    this.rBDSFTQ.buildingsCurrentPowerConsumption.set(type, Math.min(max, Math.max(0, existing)));
  }

  public static buildingLevelsFromRecord(
    record: Record<string, number> | null | undefined
  ): Map<BuildingType, number> {
    const map = new Map<BuildingType, number>();
    if (!record) {
      return map;
    }

    for (const [key, value] of Object.entries(record)) {
      if (!Number.isFinite(value)) {
        continue;
      }

      const normalized = Math.max(0, Math.floor(value));
      if (normalized === 0) {
        continue;
      }

      map.set(key as BuildingType, normalized);
    }

    return map;
  }

  public static buildingLevelsToRecord(
    map: Map<BuildingType, number>
  ): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [type, level] of map.entries()) {
      if (!Number.isFinite(level)) {
        continue;
      }

      const normalized = Math.max(0, Math.floor(level));
      if (normalized === 0) {
        continue;
      }

      record[type] = normalized;
    }

    return record;
  }

  // Per-planet type ranges expressed directly as multipliers (e.g. 0.5..1.5).
  private static readonly PLANET_MODIFIER_RANGES: Record<
    PlanetType,
    Record<ModifierKey, ModifierRange>> = {
    [PlanetType.BARREN]: {
      metalModifier: Planet.percentRange(0.7, 1.5),
      crystalModifier: Planet.percentRange(0.7, 1.5),
      deuteriumModifier: Planet.percentRange(0.7, 1.5),
      energyModifierRES: Planet.percentRange(0.8, 1.5),
      energyModifierNuclear: Planet.percentRange(0.8, 1.5),
      scienceModifier: Planet.percentRange(0.9, 1.5),
      industryModifier: Planet.percentRange(0.7, 1.5),
      anomaliesAndNoise: Planet.percentRange(0.8, 1.6),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.DRY]: {
      metalModifier: Planet.percentRange(0.7, 1.5),
      crystalModifier: Planet.percentRange(0.7, 1.5),
      deuteriumModifier: Planet.percentRange(0.5, 0.8),
      energyModifierRES: Planet.percentRange(0.5, 1.3),
      energyModifierNuclear: Planet.percentRange(0.5, 1.3),
      scienceModifier: Planet.percentRange(0.5, 1.5),
      industryModifier: Planet.percentRange(0.5, 1.3),
      anomaliesAndNoise: Planet.percentRange(0.6, 1.6),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.ICE]: {
      metalModifier: Planet.percentRange(0.5, 1.5),
      crystalModifier: Planet.percentRange(0.5, 1.5),
      deuteriumModifier: Planet.percentRange(0.8, 1.5),
      energyModifierRES: Planet.percentRange(0.5, 1.1),
      energyModifierNuclear: Planet.percentRange(0.7, 1.5),
      scienceModifier: Planet.percentRange(0.5, 1.5),
      industryModifier: Planet.percentRange(0.5, 1.3),
      anomaliesAndNoise: Planet.percentRange(0.7, 1.6),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.JUNGLE]: {
      metalModifier: Planet.percentRange(0.5, 1.5),
      crystalModifier: Planet.percentRange(0.5, 1.5),
      deuteriumModifier: Planet.percentRange(0.5, 1.5),
      energyModifierRES: Planet.percentRange(0.6, 1.5),
      energyModifierNuclear: Planet.percentRange(0.5, 1.5),
      scienceModifier: Planet.percentRange(0.5, 1.4),
      industryModifier: Planet.percentRange(0.5, 1.4),
      anomaliesAndNoise: Planet.percentRange(0.4, 1.4),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.SAVANNA]: {
      metalModifier: Planet.percentRange(0.5, 1.3),
      crystalModifier: Planet.percentRange(0.5, 1.3),
      deuteriumModifier: Planet.percentRange(0.5, 1.3),
      energyModifierRES: Planet.percentRange(0.6, 1.4),
      energyModifierNuclear: Planet.percentRange(0.5, 1.5),
      scienceModifier: Planet.percentRange(0.6, 1.4),
      industryModifier: Planet.percentRange(0.7, 1.5),
      anomaliesAndNoise: Planet.percentRange(0.4, 1.4),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.OCEANIC]: {
      metalModifier: Planet.percentRange(0.5, 1.4),
      crystalModifier: Planet.percentRange(0.5, 1.4),
      deuteriumModifier: Planet.percentRange(0.9, 1.5),
      energyModifierRES: Planet.percentRange(0.6, 1.5),
      energyModifierNuclear: Planet.percentRange(0.7, 1.5),
      scienceModifier: Planet.percentRange(0.6, 1.4),
      industryModifier: Planet.percentRange(0.5, 1.2),
      anomaliesAndNoise: Planet.percentRange(0.4, 1.4),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.VOLCANIC]: {
      metalModifier: Planet.percentRange(1.1, 1.5),
      crystalModifier: Planet.percentRange(0.9, 1.5),
      deuteriumModifier: Planet.percentRange(0.7, 1.4),
      energyModifierRES: Planet.percentRange(1.1, 1.5),
      energyModifierNuclear: Planet.percentRange(1.2, 1.5),
      scienceModifier: Planet.percentRange(0.9, 1.5),
      industryModifier: Planet.percentRange(0.7, 1.4),
      anomaliesAndNoise: Planet.percentRange(0.4, 1.2),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
    [PlanetType.ASTEROIDS]: {
      metalModifier: Planet.percentRange(0.25, 1.75),
      crystalModifier: Planet.percentRange(0.25, 1.75),
      deuteriumModifier: Planet.percentRange(0.25, 1.75),
      energyModifierRES: Planet.percentRange(0, 0.2),
      energyModifierNuclear: Planet.percentRange(0.8, 1.4),
      scienceModifier: Planet.percentRange(0.4, 1.6),
      industryModifier: Planet.percentRange(0.4, 0.8),
      anomaliesAndNoise: Planet.percentRange(0.4, 1.6),
      hyperspaceParameters: Planet.percentRange(0.2, 1.5),
    },
  };

  private static readonly PLANET_COLONIZATION_DIFFICULTY_RANGES: Record<
    PlanetType,
    { min: number; max: number }
  > = {
    [PlanetType.BARREN]: { min: 6, max: 9 },
    [PlanetType.DRY]: { min: 5, max: 8 },
    [PlanetType.ICE]: { min: 4, max: 7 },
    [PlanetType.JUNGLE]: { min: 2, max: 4 },
    [PlanetType.SAVANNA]: { min: 1, max: 3 },
    [PlanetType.OCEANIC]: { min: 3, max: 6 },
    [PlanetType.VOLCANIC]: { min: 7, max: 10 },
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

  private static percentRange(minMultiplier: number, maxMultiplier: number): ModifierRange {
    const min = Number.isFinite(minMultiplier) ? minMultiplier : 1;
    const max = Number.isFinite(maxMultiplier) ? maxMultiplier : 1;
    return {
      min: Math.min(min, max),
      max: Math.max(min, max),
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

  private static randomSteppedFloat(min: number, max: number, step: number, decimals = 2): number {
    if (step <= 0) {
      return Planet.randomFloat(min, max, decimals);
    }

    const steps = Math.floor((max - min) / step);
    const value = min + step * Planet.randomInt(0, steps);
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}




