import { ResourcesPack } from './resources-pack';
import {BuildingRequirement} from './building-requirement';
import {TechRequirement} from './tech-requirement';
import {BuildingType} from './building-type';

export class Building {
  constructor(
    public type: BuildingType,
    public description: string,
    public cost: ResourcesPack[],
    public level: number,
    public currentPowerConsumption: number,
    public powerConsumption: number[],
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[],
    public production1: number[],
    public production2: number[],
    public production3: number[]
  ) {}
}
