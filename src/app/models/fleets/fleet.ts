import { Destination } from './destination';
import { PlayerID } from '../player-id';
import { ShipInstance } from './ship-instance';
import { ShipGroup } from './ship-group';

export class Fleet {
  constructor(
    public owner: PlayerID,
    public destination: Destination,
    public groups: ShipGroup[]
  ) {}
}
