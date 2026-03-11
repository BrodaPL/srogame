import { BuildingRequirement } from '../buildings/building-requirement';
import { HullClass } from '../enums/hull-class';
import { ShipPurpose } from '../enums/ship-purpose';
import { ShipType } from '../enums/ship-type';
import { ResourcesPack } from '../resources-pack';
import { TechRequirement } from '../tech/tech-requirement';
import { Weapon } from './weapon';

export class Ship {
  constructor(
    public type: ShipType,
    public imagePath: string,
    public hullClass: HullClass,
    public canJump: boolean,
    public size: number,
    public evasionChance: number,
    public hullPointsCapacity: number,
    public shieldCapacity: number,
    public armor: number,
    public weapons: Weapon[],
    public cargoCapacity: number,
    public hangarCapacity: number,
    public purposes: Set<ShipPurpose>,
    public jumpCost: number,
    public cost: ResourcesPack,
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[]
  ) {}

  getName(): string {
    return this.type;
  }
}
