import { BuildingRequirement } from './building-requirement';
import { ResourcesPack } from './resources-pack';
import { TechRequirement } from './tech-requirement';
import { TechnologyType } from './technology-type';

export class Technology {
  constructor(
    public type: TechnologyType,
    public cost: ResourcesPack[],
    public energyRequired: number[],
    public researchTime: number[],
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[]
  ) {}
}
