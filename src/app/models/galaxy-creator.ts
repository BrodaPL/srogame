import { Galaxy } from './galaxy';
import { SolarSystem } from './solar-system';
import { ResourcesPack } from './resources-pack';

export class GalaxyCreator {
  public readonly galaxyCenterRadius: number;
  public readonly galaxyRadius: number;
  public readonly galaxyWidth: number;
  public readonly galaxyHeight: number;

  constructor(private readonly setup: GalaxySetup) {
    this.galaxyWidth = setup.galaxyWidth + 2;
    this.galaxyHeight = setup.galaxyHeight + 2;
    this.galaxyCenterRadius = Math.ceil(
      ((this.galaxyWidth - 2) / 2) * (setup.galaxyCenterSize / 100)
    );
    this.galaxyRadius = (this.galaxyWidth - 2) / 2;
  }

  public createEmptyGalaxy(): Galaxy {
    const stars = this.buildVoidStars();
    return new Galaxy(this.setup.galaxyName, [], stars);
  }

  public createGalaxy(): Galaxy {
    const galaxy = this.createEmptyGalaxy();
    const namePool = Galaxy.buildSolarSystemNamePool(true);
    let nameIndex = 0;

    for (let y = 0; y < this.galaxyHeight; y += 1) {
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        if (this.distanceFromCenter(x, y) <= this.galaxyRadius) {
          const name = namePool[nameIndex % namePool.length];
          nameIndex += 1;
          const planetNumber = this.randomInt(
            this.setup.starsAmountModifier[0],
            this.setup.starsAmountModifier[1]
          );
          galaxy.stars[y][x] = new SolarSystem(
            name,
            planetNumber,
            false,
            false,
            { x, y }
          );
        }
      }
    }

    return galaxy;
  }

  public buildVoidStars(): SolarSystem[][] {
    const stars: SolarSystem[][] = [];

    for (let y = 0; y < this.galaxyHeight; y += 1) {
      const row: SolarSystem[] = [];
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        row.push(SolarSystem.createVoid({ x, y }));
      }
      stars.push(row);
    }

    return stars;
  }

  public distanceFromCenter(x: number, y: number): number {
    const centerX = (this.galaxyWidth - 1) / 2;
    const centerY = (this.galaxyHeight - 1) / 2;
    return Math.hypot(x - centerX, y - centerY);
  }

  private randomInt(min: number, max: number): number {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }
}

type GalaxySetup = {
  galaxyName: string;
  galaxyWidth: number;
  galaxyHeight: number;
  galaxyCenterSize: number;
  voidChance: number;
  starsAmountModifier: [number, number];
  playerAmount: number;
  botsAmount: number;
  botDifficulty: number;
  neutralBotsAmount: number;
  neutralBotsDifficulty: number;
  startingResources: ResourcesPack;
};
