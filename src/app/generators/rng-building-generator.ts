import { BuildingType } from '../models/enums/building-type';
import { LevelMappings } from './level-mappings';

// Generates building levels based on player level, availability, and weight mapping.
export class RngBuildingGenerator {
  generate(level: number): Map<BuildingType, number> {
    const levels = new Map<BuildingType, number>();

    for (const [key, meta] of Object.entries(LevelMappings.BUILDING_META)) {
      const type = key as BuildingType;
      const buildingLevel = this.generateBuildingLevel(level, meta.availableFromLevel, meta.weight);
      levels.set(type, buildingLevel);
    }

    return levels;
  }

  private generateBuildingLevel(
    playerLevel: number,
    availableFromLevel: number,
    weight: number
  ): number {
    // Unavailable buildings stay at level 0.
    if (availableFromLevel > playerLevel) {
      return 0;
    }

    const maxBuildingLevel = Math.floor((playerLevel - availableFromLevel + 1) / weight);
    const minBuildingLevel = maxBuildingLevel - Math.ceil((maxBuildingLevel * 0.25) - 0.25);

    return this.randomInt(minBuildingLevel, maxBuildingLevel);
  }

  private randomInt(min: number, max: number): number {
    const clampedMin = Math.max(0, Math.floor(min));
    const clampedMax = Math.max(clampedMin, Math.floor(max));
    return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
  }
}
