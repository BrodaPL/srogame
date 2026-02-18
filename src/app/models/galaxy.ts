import { SolarSystem } from './solar-system';
import {Player} from './player';

export class Galaxy {
  constructor(
    public name: string,
    public players: Player[],
    public stars: SolarSystem[][]
  ) {}
}
