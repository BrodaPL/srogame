import { Planet } from './planet';

export type SolarSystemCoordinates = {
  x: number;
  y: number;
};

export class SolarSystem {
  constructor(
    public name: string,
    public isGalaxyCenter: boolean,
    public isVoid: boolean,
    public readonly coordinates: SolarSystemCoordinates,
    public planets: Planet[]
  ) {}
}
