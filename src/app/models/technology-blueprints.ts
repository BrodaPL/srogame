import { Technology } from './technology';
import { TechnologyType } from './enum/technology-type';

export class TechnologyBlueprints {
  constructor(public techByType: Map<TechnologyType, Technology> = new Map()) {}

  add(tech: Technology): void {
    this.techByType.set(tech.type, tech);
  }

  get(type: TechnologyType): Technology | undefined {
    return this.techByType.get(type);
  }
}

