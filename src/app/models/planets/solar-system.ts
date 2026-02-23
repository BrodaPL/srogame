import { Planet } from './planet';
import { PlanetType } from '../enums/planet-type';
import { PlayerID } from '../player-id';

export type SolarSystemCoordinates = {
  x: number;
  y: number;
};

export class SolarSystem {
  constructor(
    name: string,
    planetNumber: number,
    public isGalaxyCenter: boolean,
    public isVoid: boolean,
    public readonly coordinates: SolarSystemCoordinates,
    public discoveredByPlayer: Set<PlayerID>
  ) {
    this.name = isVoid ? 'Void' : name;
    this.planets = SolarSystem.buildPlanets(this, planetNumber);
  }

  public name: string;
  public planets: Planet[];

  public static createVoid(coordinates: SolarSystemCoordinates): SolarSystem {
    return new SolarSystem('Void', -1, false, true, coordinates, new Set<PlayerID>());
  }

  public static createGalaxyCenter(coordinates: SolarSystemCoordinates): SolarSystem {
    return new SolarSystem('Galaxy Center', -1, true, false, coordinates, new Set<PlayerID>());
  }

  private static buildPlanets(system: SolarSystem, planetNumber: number): Planet[] {
    const normalizedPlanetNumber = SolarSystem.clampPlanetNumber(planetNumber);
    if (normalizedPlanetNumber < -2) {
      return [];
    }

    if (normalizedPlanetNumber === 0) {
      return Math.random() < 0.5
        ? [SolarSystem.createPlanet(system, 1, PlanetType.ASTEROIDS)]
        : [];
    }
    if (normalizedPlanetNumber === -1) {
      return Math.random() < 0.25
        ? [SolarSystem.createPlanet(system, 1, PlanetType.ASTEROIDS)]
        : [];
    }
    if (normalizedPlanetNumber === -2) {
      return Math.random() < 0.10
        ? [SolarSystem.createPlanet(system, 1, PlanetType.ASTEROIDS)]
        : [];
    }

    const planets: Planet[] = [];
    for (let i = 1; i <= normalizedPlanetNumber; i += 1) {
      planets.push(SolarSystem.createPlanet(system, i));
    }

    return planets;
  }

  private static createPlanet(
    system: SolarSystem,
    index: number,
    forcedType?: PlanetType
  ): Planet {
    const planet = Planet.createRandomEmpty('', index, system, null, forcedType);
    planet.name = SolarSystem.buildPlanetName(system.name, index, planet.type);
    return planet;
  }

  private static buildPlanetName(
    systemName: string,
    index: number,
    planetType: PlanetType
  ): string {
    const typeInitial = planetType.charAt(0);
    return `${systemName} ${index}-${typeInitial}`;
  }

  private static clampPlanetNumber(planetNumber: number): number {
    return Math.max(-10, Math.min(10, planetNumber));
  }
}
