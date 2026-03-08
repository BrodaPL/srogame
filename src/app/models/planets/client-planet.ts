import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from './planet';
import { EspionageReportData } from '../reports/espionage-report-data';
import { PlayerType } from '../enums/player-type';

export class ClientPlanet extends Planet {
  public reportData: EspionageReportData | null;
  public ownerPlayerType: PlayerType | null;
  public ownerPlayerName: string | null;

  constructor(
    basicInfo: PlanetBasicInfo,
    info: PlanetInfo,
    rBDSFTQ: rBDSFTQ,
    ownerPlayerType: PlayerType | null,
    ownerPlayerName: string | null,
    reportData: EspionageReportData | null,
    lastReportData: Map<number, EspionageReportData> = new Map()
  ) {
    super(basicInfo, info, rBDSFTQ, lastReportData);
    this.ownerPlayerType = ownerPlayerType;
    this.ownerPlayerName = ownerPlayerName;
    this.reportData = reportData;
  }
}

