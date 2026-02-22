import { Planet } from './planets/planet';
import { Technology } from './tech/technology';
import { Fleet } from './fleets/fleet';
import { PlayerType } from './enums/player-type';
import { PlayerID } from './player-id';

export class Player {
  constructor(
    public playerId: PlayerID,
    public planets: Planet[],
    public tech: Technology[],
    public fleets: Fleet[],
    public type: PlayerType
  ) {}
}
