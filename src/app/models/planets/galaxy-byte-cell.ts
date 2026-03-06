import { PlanetType } from '../enums/planet-type';
import type { SolarSystem } from './solar-system';

export class GalaxyByteCell {
  public planetsAndAsteroids: Int8Array;

  constructor(planets: number, asteroids: number) {
    this.planetsAndAsteroids = new Int8Array(2);
    this.planetsAndAsteroids[0] = planets;
    this.planetsAndAsteroids[1] = asteroids;
  }

  public static fromSolarSystem(system: SolarSystem): GalaxyByteCell {
    let planets = 0;
    let asteroids = 0;

    for (const planet of system.planets) {
      if (planet.basicInfo.type === PlanetType.ASTEROIDS) {
        asteroids += 1;
      } else {
        planets += 1;
      }
    }

    if (system.isVoid) {
      planets = -1;
    } else if (system.isGalaxyCenter) {
      planets = -2;
    }

    return new GalaxyByteCell(planets, asteroids);
  }
}
