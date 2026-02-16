import { SolarSystem } from './solar-system';

export class Galaxy {
  constructor(
    public name: string,
    public stars: SolarSystem[][]
  ) {}
}
