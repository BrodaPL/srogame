import { Building } from './building';
import { Fleet } from './fleet';
import { PlanetType } from './planet-type';
import { Player } from './player';
import { ResourcesPack } from './resources-pack';
import { Ship } from './ship';
import { SolarSystem } from './solar-system';
import { Technology } from './technology';

export class Planet {
  constructor(
    public name: string,
    public type: PlanetType,
    public order: number,
    public owner: Player,
    public resources: ResourcesPack,
    public fleets: Fleet[],
    public spaceDebris: ResourcesPack,
    public size: number,
    public buildings: Building[],
    public metalModifier: number,
    public crystalModifier: number,
    public deuteriumModifier: number,
    public energyModifier: number,
    public scienceModifier: number,
    public industryModifier: number,
    public technologyQueue: Technology[],
    public buildingQueue: Building[],
    public shipyardQueue: Ship[]
  ) {}
}
