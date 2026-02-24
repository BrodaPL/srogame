import { Building } from '../buildings/building';
import { ResourcesPack } from '../resources-pack';
import { Technology } from '../tech/technology';
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
    public buildingsLevels: Building[],
    public resourcesAmount: ResourcesPack,
    public techLevels: Technology[],
    public defences: DefenceBuildingInstances[],
    public ships: ShipInstance[],
    public shipyardProduction: ShipyardQueue,
    public defencesProduction: DefencesQueue,
    public researchProduction: ResearchQueue
  ) {}
}
