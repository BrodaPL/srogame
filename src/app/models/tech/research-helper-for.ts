import { TechnologyType } from '../enums/technology-type';
import { ResearchLabCoordinates } from './technology-queue-entry';

export class ResearchHelperFor {
  constructor(
    public mainResearchCoordinates: ResearchLabCoordinates,
    public technologyType: TechnologyType
  ) {}
}
