import { TechnologyType } from './technology-type';

export class TechRequirement {
  constructor(
    public tech: TechnologyType,
    public level: number
  ) {}
}
