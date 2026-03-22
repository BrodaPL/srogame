import { Defence } from './defence';

export class DefenceInstance {
  constructor(
    public type: Defence,
    public hull: number,
    public shield: number
  ) {}
}
