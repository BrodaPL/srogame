import { Planet } from './planet';

export class SolarSystem {
  constructor(
    public name: string,
    public planets: Planet[]
  ) {}
}
