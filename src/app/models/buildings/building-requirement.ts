import { BuildingType } from '../enums/building-type';

export class BuildingRequirement {
  constructor(
    public building: BuildingType,
    public level: number
  ) {}
}

