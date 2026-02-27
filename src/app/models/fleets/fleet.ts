import { Destination } from './destination';
import { ShipInstance } from './ship-instance';
import { ShipGroup } from './ship-group';

export class Fleet {
  constructor(
    public ownerId: number,
    public destination: Destination,
    public groups: ShipGroup[]
  ) {}
}
