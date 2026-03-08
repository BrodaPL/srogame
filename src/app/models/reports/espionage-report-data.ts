import { BuildingType } from '../enums/building-type';
import { ResourcesPack } from '../resources-pack';
import { TechnologyType } from '../enums/technology-type';
import { ShipType } from '../enums/ship-type';
import { DefencesQueue } from './defences-queue';
import { DefenceBuildingInstances } from './defence-building-instances';
import { ResearchQueue } from './research-queue';
import { ShipyardQueue } from './shipyard-queue';
import { PlanetaryParameters } from '../planets/planetary-parameters';
import { BuildingQueue } from './building-queue';

// Note: STAR_SYSTEM_ESPIONAGE requires X Spy Probes, where X is the number of planets in the target StarSystem.
// Each probe generates EspionageReportData for each planet.
export class EspionageReportData {
  constructor(
    // contains just turn number of when a report was generated
    public reportDate: number,
    public planetaryParameters: PlanetaryParameters,
    public averageBuildingLevel: number,
    public averageTotalResources: number,
    public averageTechLevel: number,
    public totalDefencesAmount: number,
    public totalShipsAmount: number,
    public buildingsLevels: Map<BuildingType, number>,
    public resourcesAmount: ResourcesPack,
    public techLevels: Map<TechnologyType, number>,
    public defences: DefenceBuildingInstances[],
    public ships: Map<ShipType, number>,
    public shipyardProduction: ShipyardQueue,
    public defencesProduction: DefencesQueue,
    public researchProduction: ResearchQueue,
    public buildingProduction: BuildingQueue
  ) {}
}
