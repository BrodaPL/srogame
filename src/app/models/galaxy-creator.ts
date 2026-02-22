import { Galaxy } from './galaxy';
import { SolarSystem } from './solar-system';
import type { GalaxySetup } from './game-api-types';


export class GalaxyCreator {
  public readonly galaxyCenterRadius: number;

  /**
   * All methods in this class should use internal galaxyWidth and galaxyHeight
   * GalaxySetup galaxyWidth galaxyHeight should be avoided (except in constructor).
   */
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
    //1. Start with a void-filled galaxy grid sized for the configured width/height.
    const galaxy = this.createEmptyGalaxy();
    //1.1 Build a shuffled pool of system names to assign deterministically as we fill.
    const namePool = Galaxy.buildSolarSystemNamePool(true);
    let nameIndex = 0;

    //2. create actual StarSystems with planets in the circle field.
    for (let y = 0; y < this.galaxyHeight; y += 1) {
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        // Only place systems inside the circular galaxy radius; leave the rest as void.
        if (this.distanceFromCenter(x, y) <= this.galaxyRadius) {
          const name = namePool[nameIndex % namePool.length]; //this is clever!
          nameIndex++;
          // Pick a planet count within the configured stars amount modifier range.
          const planetNumber = this.randomInt(
            this.setup.starsAmountModifier[0],
            this.setup.starsAmountModifier[1]
          );
          // Replace the void tile with a generated SolarSystem at these coordinates.
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

    //3. Create galaxyCenter systems in the radius of the of this.galaxyCenterRadius
    for (let y = 0; y < this.galaxyHeight; y += 1) {
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        if (this.distanceFromCenter(x, y) <= this.galaxyCenterRadius) {
          galaxy.stars[y][x] = SolarSystem.createGalaxyCenter({ x, y });
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
