import { ResourcesPack } from '../models/resources-pack';


const level0Resources: ResourcesPack = new ResourcesPack(120, 80, 40);
export class RngResourceGenerator {
  generateSimple(level: number): ResourcesPack {
    return new ResourcesPack( level0Resources.metal*(level^1.55), level0Resources.crystal*(level^1.55), level0Resources.deuterium*(level^1.55));
  }

  //can generate resources with planetary modifiers
  generateWithModifiers(level: number, mMod:number, cMod:number, dMod:number): ResourcesPack {
    return new ResourcesPack( level0Resources.metal*(level^1.55)*mMod,
      level0Resources.crystal*(level^1.55)*cMod,
      level0Resources.deuterium*(level^1.55)*dMod);
  }

  generateWithModifiersAndRng(level: number, mMod:number, cMod:number, dMod:number, minMaxPercentRng:number): ResourcesPack {
    const minMultiplier = 1 - (minMaxPercentRng / 100);
    const maxMultiplier = 1 + (minMaxPercentRng / 100);
    const metalMultiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);
    const crystalMultiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);
    const deuteriumMultiplier = minMultiplier + Math.random() * (maxMultiplier - minMultiplier);

    return new ResourcesPack(
      level0Resources.metal * (level ^ 1.55) * mMod * metalMultiplier,
      level0Resources.crystal * (level ^ 1.55) * cMod * crystalMultiplier,
      level0Resources.deuterium * (level ^ 1.55) * dMod * deuteriumMultiplier
    );
  }

}
