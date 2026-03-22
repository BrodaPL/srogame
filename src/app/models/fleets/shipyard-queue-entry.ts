import { ShipType } from '../enums/ship-type';
import { DefenceType } from '../enums/defence-type';

export type ShipyardQueueItemKind = 'ship' | 'defence';

export class ShipyardQueueEntry {
  public itemKind: ShipyardQueueItemKind;
  public shipType: ShipType | null;
  public defenceType: DefenceType | null;
  constructor(
    itemKindOrShipType: ShipyardQueueItemKind | ShipType,
    itemTypeOrAmount: ShipType | DefenceType | number,
    amountOrInvestedShipyardPower: number,
    investedShipyardPower?: number
  ) {
    if (investedShipyardPower === undefined) {
      this.itemKind = 'ship';
      this.shipType = itemKindOrShipType as ShipType;
      this.defenceType = null;
      this.amount = itemTypeOrAmount as number;
      this.investedShipyardPower = amountOrInvestedShipyardPower;
      return;
    }

    this.itemKind = itemKindOrShipType as ShipyardQueueItemKind;
    this.shipType = this.itemKind === 'ship' ? itemTypeOrAmount as ShipType : null;
    this.defenceType = this.itemKind === 'defence' ? itemTypeOrAmount as DefenceType : null;
    this.amount = amountOrInvestedShipyardPower;
    this.investedShipyardPower = investedShipyardPower;
  }

  public amount: number;
  public investedShipyardPower: number;

  public static ship(shipType: ShipType, amount: number, investedShipyardPower: number): ShipyardQueueEntry {
    return new ShipyardQueueEntry('ship', shipType, amount, investedShipyardPower);
  }

  public static defence(defenceType: DefenceType, amount: number, investedShipyardPower: number): ShipyardQueueEntry {
    return new ShipyardQueueEntry('defence', defenceType, amount, investedShipyardPower);
  }
}
