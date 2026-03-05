import { Planet } from './planet';
import { EspionageReportData } from '../reports/espionage-report-data';

export class ClientPlanet extends Planet {
  public reportData: EspionageReportData | null;

  constructor(planet: Planet, reportData: EspionageReportData | null = null) {
    super(planet.BasicInfo, planet.Info, planet.Objects, planet.lastReportData);
    this.reportData = reportData;
  }
}
