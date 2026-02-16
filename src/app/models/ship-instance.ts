import { Ship } from './ship';

export class ShipInstance {
  constructor(
    public type: Ship,
    public hull: number,
    public shield: number,
    public cargo: number,
    public hangar: ShipInstance[]
  ) {}
}
