import { Building } from './building';
import { BuildingType } from './enum/building-type';

export class BuildingBlueprints {
  constructor(public buildingsMap: Map<BuildingType, Building> = new Map()) {}

  add(building: Building): void {
    this.buildingsMap.set(building.type, building);
  }

  get(type: BuildingType): Building | undefined {
    return this.buildingsMap.get(type);
  }
}

