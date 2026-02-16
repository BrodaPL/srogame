import { Planet } from './planet';
import { Technology } from './technology';
import {Fleet} from './fleet';

export class Player {
  constructor(
    public name: string,
    public planets: Planet[],
    public tech: Technology[],
    public fleets: Fleet[]
  ) {}
}
