import { BuildingRequirement } from '../buildings/building-requirement';
import { HullClass } from '../enums/hull-class';
import { DefenceType } from '../enums/defence-type';
import { Weapon } from '../fleets/weapon';
import { ResourcesPack } from '../resources-pack';
import { TechRequirement } from '../tech/tech-requirement';

export class Defence {
  constructor(
    public type: DefenceType,
    public imagePath: string,
    public hullClass: HullClass,
    public canShootToOrbit: boolean,
    public size: number,
    public hullPointsCapacity: number,
    public criticalThreshold: number,
    public shieldCapacity: number,
    public armor: number,
    public weapons: Weapon[],
    public cost: ResourcesPack,
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[]
  ) {}

  getName(): string {
    return this.type;
  }
}
