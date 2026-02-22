import { WeaponType } from '../enums/weapon-type';

export class Weapon {
  constructor(
    public type: WeaponType,
    public dmg: number,
    public shots: number
  ) {}
}

