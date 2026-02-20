import { Building } from './building';
import { Fleet } from './fleet';
import { PlanetType } from './enum/planet-type';
import { Player } from './player';
import { ResourcesPack } from './resources-pack';
import { Ship } from './ship';
import { SolarSystem } from './solar-system';
import { Technology } from './technology';
import {ShipInstance} from './ship-instance';

export class Planet {
  public static createRandomEmpty(name: string, order: number, owner: Player): Planet {
    const type = Planet.randomPlanetType();

    return new Planet(
      name,
      type,
      Planet.randomInt(1, 10),
      order,
      owner,
      new ResourcesPack(0, 0, 0),
      [],
      new ResourcesPack(0, 0, 0),
      Planet.randomInt(90, 200),
      [],
      Planet.randomFloat(0.5, 1.5),
      Planet.randomFloat(0.5, 1.5),
      Planet.randomFloat(0.5, 1.5),
      Planet.randomFloat(0.5, 1.5),
      Planet.randomFloat(0.5, 1.5),
      Planet.randomFloat(0.5, 1.5),
      Planet.randomFloat(0.5, 1.5),
      [],
      [],
      [],
      []
    );
  }

  constructor(
    public name: string,
    public type: PlanetType,
    public colonizationDifficulty: number,
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
    public energyModifierRES: number,
    public energyModifierNuclear: number,
    public scienceModifier: number,
    public industryModifier: number,
    public technologyQueue: Technology[],
    public buildingQueue: Building[],
    public shipyardQueue: Ship[],
    public orbitShips: ShipInstance[]
  ) {}

  private static randomPlanetType(): PlanetType {
    const types = Object.values(PlanetType) as PlanetType[];
    return types[Planet.randomInt(0, types.length - 1)];
  }

  private static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private static randomFloat(min: number, max: number, decimals = 2): number {
    const value = Math.random() * (max - min) + min;
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  }
}
