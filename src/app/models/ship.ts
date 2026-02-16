import { BuildingRequirement } from './building-requirement';
import { HullClass } from './hull-class';
import { ResourcesPack } from './resources-pack';
import { TechRequirement } from './tech-requirement';
import { Weapon } from './weapon';

export class Ship {
  constructor(
    public name: string,
    public hullClass: HullClass,
    public canJump: boolean,
    public size: number,
    public evasionChance: number[],
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
