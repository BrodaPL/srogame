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
import { encodeRuntimeText } from '../../i18n/runtime-text.utils';

// Note: STAR_SYSTEM_ESPIONAGE requires X Spy Probes, where X is the number of planets in the target StarSystem.
// Each probe generates EspionageReportData for each planet.
export class EspionageReportData extends PlayerReport {
  constructor(
    data: PlayerReportBaseData,
    public diff: number,
    public hasTotalDefencesIntel: boolean,
    public hasTotalShipsIntel: boolean,
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
    public buildingProduction: BuildingQueue,
  ) {
    super(ReportType.ESPIONAGE_REPORT, data);
  }

  public override show(): string {
    const lines = this.buildMetadataLines();
    lines.push(
      encodeRuntimeText('generated.reports.espionageAverageBuildingLevel', {
        value: this.averageBuildingLevel,
      }),
    );
    lines.push(
      encodeRuntimeText('generated.reports.espionageAverageTotalResources', {
        value: this.averageTotalResources,
      }),
    );
    lines.push(
      encodeRuntimeText('generated.reports.espionageAverageTechnologyLevel', {
        value: this.averageTechLevel,
      }),
    );
    lines.push(
      encodeRuntimeText('generated.reports.espionageTotalDefencesAmount', {
        value: this.totalDefencesAmount,
      }),
    );
    lines.push(
      encodeRuntimeText('generated.reports.espionageTotalShipsAmount', {
        value: this.totalShipsAmount,
      }),
    );
    lines.push(
      encodeRuntimeText('generated.reports.espionageResources', {
        metal: this.resourcesAmount.metal,
        crystal: this.resourcesAmount.crystal,
        deuterium: this.resourcesAmount.deuterium,
      }),
    );
    lines.push(
      encodeRuntimeText('generated.reports.espionageDebris', {
        metal: this.spaceDebrisAmount.metal,
        crystal: this.spaceDebrisAmount.crystal,
        deuterium: this.spaceDebrisAmount.deuterium,
      }),
    );

    if (this.buildingsLevels.size > 0) {
      lines.push(
        encodeRuntimeText('generated.reports.espionageBuildings', {
          summary: this.formatMapEntries(this.buildingsLevels),
        }),
      );
    }

    if (this.techLevels.size > 0) {
      lines.push(
        encodeRuntimeText('generated.reports.espionageTechnologies', {
          summary: this.formatMapEntries(this.techLevels),
        }),
      );
    }

    if (this.ships.size > 0) {
      lines.push(
        encodeRuntimeText('generated.reports.espionageShips', {
          summary: this.formatMapEntries(this.ships),
        }),
      );
    }

    return lines.join('\n');
  }

  public override copy(): EspionageReportData {
    return new EspionageReportData(
      this.copyBaseData(),
      this.diff,
      this.hasTotalDefencesIntel,
      this.hasTotalShipsIntel,
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
        this.resourcesAmount.deuterium,
      ),
      new ResourcesPack(
        this.spaceDebrisAmount.metal,
        this.spaceDebrisAmount.crystal,
        this.spaceDebrisAmount.deuterium,
      ),
      new Map(this.techLevels),
      this.defences.map((entry) => entry.copy()),
      new Map(this.ships),
      new ShipyardQueue(),
      new DefencesQueue(),
      new ResearchQueue(),
      new BuildingQueue(),
    );
  }

  private formatMapEntries<T>(entries: Map<T, number>): string {
    return Array.from(entries.entries())
      .map(([key, value]) => `${String(key)} ${value}`)
      .join(', ');
  }
}
