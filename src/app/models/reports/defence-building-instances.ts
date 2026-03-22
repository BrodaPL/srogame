import { DefenceType } from '../enums/defence-type';

export class DefenceBuildingInstances {
  constructor(
    public type: DefenceType,
    public amount: number
  ) {}

  copy(): DefenceBuildingInstances {
    return new DefenceBuildingInstances(this.type, this.amount);
  }
}
