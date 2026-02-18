import { TechnologyType } from './enum/technology-type';

export class TechRequirement {
  constructor(
    public tech: TechnologyType,
    public level: number
  ) {}
}

