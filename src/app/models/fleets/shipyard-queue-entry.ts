import { ShipType } from '../enums/ship-type';

export class ShipyardQueueEntry {
  constructor(
    public shipType: ShipType,
    public amount: number,
    public investedShipyardPower: number
  ) {}
}
