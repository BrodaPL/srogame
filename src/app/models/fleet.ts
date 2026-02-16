import { Destination } from './destination';
import { Player } from './player';
import { ShipInstance } from './ship-instance';
import {ShipGroup} from './ship-group';

export class Fleet {
  constructor(
    public owner: Player,
    public destination: Destination,
    public groups: ShipGroup[]
  ) {}
}
