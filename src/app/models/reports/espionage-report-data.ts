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
import { ReportType } from '../enums/report-type';
import { PlayerReport, type PlayerReportBaseData } from './player-report';

// Note: STAR_SYSTEM_ESPIONAGE requires X Spy Probes, where X is the number of planets in the target StarSystem.
// Each probe generates EspionageReportData for each planet.
export class EspionageReportData extends PlayerReport {
  constructor(
    data: PlayerReportBaseData,
    public diff: number,
    public size: number,
    public planetaryParameters: PlanetaryParameters,
    public averageBuildingLevel: number,
    public averageTotalResources: number,
    public averageTechLevel: number,
    public totalDefencesAmount: number,
    public totalShipsAmount: number,
    public buildingsLevels: Map<BuildingType, number>,
    public resourcesAmount: ResourcesPack,
    public spaceDebrisAmount: ResourcesPack,
    public techLevels: Map<TechnologyType, number>,
    public defences: DefenceBuildingInstances[],
    public ships: Map<ShipType, number>,
    public shipyardProduction: ShipyardQueue,
    public defencesProduction: DefencesQueue,
    public researchProduction: ResearchQueue,
    public buildingProduction: BuildingQueue
  ) {
    super(ReportType.ESPIONAGE_REPORT, data);
  }

  public override show(): string {
    const lines = this.buildMetadataLines();
    lines.push(`Average building level: ${this.averageBuildingLevel}`);
    lines.push(`Average total resources: ${this.averageTotalResources}`);
    lines.push(`Average technology level: ${this.averageTechLevel}`);
    lines.push(`Total defences amount: ${this.totalDefencesAmount}`);
    lines.push(`Total ships amount: ${this.totalShipsAmount}`);
    lines.push(
      `Resources: M ${this.resourcesAmount.metal}, C ${this.resourcesAmount.crystal}, D ${this.resourcesAmount.deuterium}`
    );
    lines.push(
      `Debris: M ${this.spaceDebrisAmount.metal}, C ${this.spaceDebrisAmount.crystal}, D ${this.spaceDebrisAmount.deuterium}`
    );

    if (this.buildingsLevels.size > 0) {
      lines.push(`Buildings: ${this.formatMapEntries(this.buildingsLevels)}`);
    }

    if (this.techLevels.size > 0) {
      lines.push(`Technologies: ${this.formatMapEntries(this.techLevels)}`);
    }

    if (this.ships.size > 0) {
      lines.push(`Ships: ${this.formatMapEntries(this.ships)}`);
    }

    return lines.join('\n');
  }

  public override copy(): EspionageReportData {
    return new EspionageReportData(
      {
        reportId: this.reportId,
        createdTurn: this.createdTurn,
        title: this.title,
        isRead: this.isRead,
        sourceCoordinates: this.sourceCoordinates ? { ...this.sourceCoordinates } : null,
        sourcePlanetName: this.sourcePlanetName,
        sourceSystemName: this.sourceSystemName,
        senderPlayerName: this.senderPlayerName
      },
      this.diff,
      this.size,
      this.planetaryParameters.copy(),
      this.averageBuildingLevel,
      this.averageTotalResources,
      this.averageTechLevel,
      this.totalDefencesAmount,
      this.totalShipsAmount,
      new Map(this.buildingsLevels),
      new ResourcesPack(
        this.resourcesAmount.metal,
        this.resourcesAmount.crystal,
        this.resourcesAmount.deuterium
      ),
      new ResourcesPack(
        this.spaceDebrisAmount.metal,
        this.spaceDebrisAmount.crystal,
        this.spaceDebrisAmount.deuterium
      ),
      new Map(this.techLevels),
      this.defences.map((entry) => entry.copy()),
      new Map(this.ships),
      new ShipyardQueue(),
      new DefencesQueue(),
      new ResearchQueue(),
      new BuildingQueue()
    );
  }

  private formatMapEntries<T>(entries: Map<T, number>): string {
    return Array.from(entries.entries())
      .map(([key, value]) => `${String(key)} ${value}`)
      .join(', ');
  }
}
