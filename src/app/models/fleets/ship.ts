import { BuildingRequirement } from '../buildings/building-requirement';
import { HullClass } from '../enums/hull-class';
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
    public defense: number,
    public weapons: Weapon[],
    public cargoCapacity: number,
    public hangarCapacity: number,
    public jumpCost: number,
    public cost: ResourcesPack,
    public buildingRequirements: BuildingRequirement[],
    public techRequirements: TechRequirement[]
  ) {}
}
