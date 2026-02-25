import { TechnologyType } from '../models/enums/technology-type';
import { LevelMappings } from './level-mappings';

export class RngTechnologyGenerator {
  generate(level: number): Map<TechnologyType, number> {
    const levels = new Map<TechnologyType, number>();

    for (const [key, meta] of Object.entries(LevelMappings.TECH_META)) {
      const type = key as TechnologyType;
      const techLevel = this.generateTechLevel(level, meta.availableFromLevel, meta.weight);
      levels.set(type, techLevel);
    }

    return levels;
  }

  private generateTechLevel(
    playerLevel: number,
    availableFromLevel: number,
    weight: number
  ): number {
    if (availableFromLevel > playerLevel) {
      return 0;
    }

    const maxTechLevel = Math.floor((playerLevel - availableFromLevel + 1) / weight);
    const minTechLevel = maxTechLevel - Math.ceil((maxTechLevel * 0.25) - 0.25);

    return this.randomInt(minTechLevel, maxTechLevel);
  }

  private randomInt(min: number, max: number): number {
    const clampedMin = Math.max(0, Math.floor(min));
    const clampedMax = Math.max(clampedMin, Math.floor(max));
    return Math.floor(Math.random() * (clampedMax - clampedMin + 1)) + clampedMin;
  }
}
