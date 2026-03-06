import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from './planet';
import { EspionageReportData } from '../reports/espionage-report-data';

export class ClientPlanet extends Planet {
  public reportData: EspionageReportData | null;

  constructor(
    basicInfo: PlanetBasicInfo,
    info: PlanetInfo,
    rBDSFTQ: rBDSFTQ,
    reportData: EspionageReportData | null,
    lastReportData: Map<number, EspionageReportData> = new Map()
  ) {
    super(basicInfo, info, rBDSFTQ, lastReportData);
    this.reportData = reportData;
  }
}

