import { TechnologyType } from '../enums/technology-type';

export class TechRequirement {
  constructor(
    public tech: TechnologyType,
    public level: number
  ) {}
}

