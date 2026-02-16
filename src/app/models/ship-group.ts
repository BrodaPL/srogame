import { HullClass } from './hull-class';
import { ShipInstance } from './ship-instance';

export class ShipGroup {
  constructor(
    public id: number,
    public priority: HullClass[],
    public ships: ShipInstance[]
  ) {}
}
