import { BuildingType } from '../enums/building-type';

export class BuildingQueueEntry {
  constructor(
    public buildingType: BuildingType,
    public nextLevel: number,
    public investedIndustryPower: number
  ) {}
}

