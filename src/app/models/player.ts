import { Planet } from './planet';
import { Technology } from './technology';
import {Fleet} from './fleet';
import {PlayerType} from './enum/player-type';

export class Player {
  constructor(
    public name: string,
    public planets: Planet[],
    public tech: Technology[],
    public fleets: Fleet[],
    public type: PlayerType
  ) {}
}
