import { WeaponType } from './enum/weapon-type';

export class Weapon {
  constructor(
    public type: WeaponType,
    public dmg: number,
    public shots: number
  ) {}
}

