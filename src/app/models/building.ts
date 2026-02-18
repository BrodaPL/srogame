import { ResourcesPack } from './resources-pack';
import {BuildingRequirement} from './building-requirement';
import {TechRequirement} from './tech-requirement';
import {BuildingType} from './enum/building-type';
import {Logger} from '../core/logger';

export class Building {
  constructor(
    public type: BuildingType,
    public description: string,
    public basicCost: ResourcesPack,
    public level: number,
    public currentPowerConsumption: number,
    public powerConsumption: number,
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[],
    public production1: number[],
    public production2: number[],
    public production3: number[]
  ) {}

  getCostForLevel(levelParam: number): ResourcesPack {
    if(levelParam < 1) {
      Logger.error('levelParam is less then 1 !');
    }

    const multiplier = Math.pow(2, levelParam - 1);
    return new ResourcesPack(
      this.basicCost.metal * multiplier,
      this.basicCost.crystal * multiplier,
      this.basicCost.deuterium * multiplier
    );
  }
}

