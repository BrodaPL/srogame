import { ResourcesPack } from '../models/resources-pack';
import { RESOURCE_LEVEL_GROWTH } from './resource-scaling';

const level0Resources: ResourcesPack = new ResourcesPack(240, 160, 80);
// Generates resource packs using the current scaling formula, modifiers, and optional RNG.
export class RngResourceGenerator {
  generateSimple(level: number): ResourcesPack {
    // Base scaling against a level 0 resource pack.
    const levelMultiplier = RESOURCE_LEVEL_GROWTH ** level;
    return new ResourcesPack(
      level0Resources.metal * levelMultiplier,
      level0Resources.crystal * levelMultiplier,
      level0Resources.deuterium * levelMultiplier
    );
  }

  //can generate resources with planetary modifiers
  generateWithModifiers(level: number, mMod:number, cMod:number, dMod:number): ResourcesPack {
    // Apply per-resource modifiers on top of the base scaling.
    const levelMultiplier = RESOURCE_LEVEL_GROWTH ** level;
    return new ResourcesPack(
      level0Resources.metal * levelMultiplier * mMod,
      level0Resources.crystal * levelMultiplier * cMod,
      level0Resources.deuterium * levelMultiplier * dMod
    );
  }

  generateWithModifiersAndRng(level: number, mMod:number, cMod:number, dMod:number, minMaxPercentRng:number): ResourcesPack {
    // Randomize each resource within the provided +/- percent range.
    const minMultiplier = 1 - (minMaxPercentRng / 100);
    const maxMultiplier = 1 + (minMaxPercentRng / 100);
    const metalMultiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);
    const crystalMultiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);
    const deuteriumMultiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);

    const levelMultiplier = RESOURCE_LEVEL_GROWTH ** level;
    return new ResourcesPack(
      level0Resources.metal * levelMultiplier * mMod * metalMultiplier,
      level0Resources.crystal * levelMultiplier * cMod * crystalMultiplier,
      level0Resources.deuterium * levelMultiplier * dMod * deuteriumMultiplier
    );
  }

}
