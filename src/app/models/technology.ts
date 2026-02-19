import { BuildingRequirement } from './building-requirement';
import { ResourcesPack } from './resources-pack';
import { TechRequirement } from './tech-requirement';
import { TechnologyType } from './enum/technology-type';

export class Technology {
  constructor(
    public type: TechnologyType,
    public imagePath: string,
    public basicCost: ResourcesPack,
    public energyRequired: number[],
    public researchTime: number[],
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[]
  ) {}

  getCostForLevel(levelParam: number): ResourcesPack {
    const multiplier = Math.pow(2, levelParam - 1);
    return new ResourcesPack(
      this.basicCost.metal * multiplier,
      this.basicCost.crystal * multiplier,
      this.basicCost.deuterium * multiplier
    );
  }
}

