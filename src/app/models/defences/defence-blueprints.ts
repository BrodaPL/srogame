import { DefenceType } from '../enums/defence-type';
import { Defence } from './defence';

export class DefenceBlueprints {
  constructor(public defencesMap: Map<DefenceType, Defence> = new Map()) {}

  add(defence: Defence): void {
    this.defencesMap.set(defence.type, defence);
  }

  get(type: DefenceType): Defence | undefined {
    return this.defencesMap.get(type);
  }
}
