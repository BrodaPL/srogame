import { BuildingType } from '../enums/building-type';
import { ResourcesPack } from '../resources-pack';
import { TechnologyType } from '../enums/technology-type';
import { ShipInstance } from '../fleets/ship-instance';
import { DefencesQueue } from './defences-queue';
import { DefenceBuildingInstances } from './defence-building-instances';
import { ResearchQueue } from './research-queue';
import { ShipyardQueue } from './shipyard-queue';

export class PlanetaryReportData {
  constructor(
    // contains just turn number of when report was generated
    public reportDate: number,
    // if true, then show planet modifiers values
    public planetaryParameters: boolean,
    public averageBuildingLevel: number,
    public averageTotalResources: number,
    public averageTechLevel: number,
    public totalDefencesAmount: number,
    public totalShipsAmount: number,
    public buildingsLevels: Map<BuildingType, number>,
    public resourcesAmount: ResourcesPack,
    public techLevels: Map<TechnologyType, number>,
    public defences: DefenceBuildingInstances[],
    public ships: ShipInstance[],
    public shipyardProduction: ShipyardQueue,
    public defencesProduction: DefencesQueue,
    public researchProduction: ResearchQueue
  ) {}
}
