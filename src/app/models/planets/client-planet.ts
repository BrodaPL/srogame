import { Planet, PlanetBasicInfo, PlanetInfo, PlanetObjects } from './planet';
import { EspionageReportData } from '../reports/espionage-report-data';

export class ClientPlanet extends Planet {
  public reportData: EspionageReportData | null;

  constructor(
    basicInfo: PlanetBasicInfo,
    info: PlanetInfo,
    objects: PlanetObjects,
    reportData: EspionageReportData | null,
    lastReportData: Map<number, EspionageReportData> = new Map()
  ) {
    super(basicInfo, info, objects, lastReportData);
    this.reportData = reportData;
  }
}
