import { TechnologyType } from '../enums/technology-type';

export type ResearchLabCoordinates = {
  x: number;
  y: number;
  z: number;
};

export class TechnologyQueueEntry {
  constructor(
    public technologyType: TechnologyType,
    public nextLevel: number,
    public investedResearchPower: number,
    public helperLabs: ResearchLabCoordinates[]
  ) {}
}
