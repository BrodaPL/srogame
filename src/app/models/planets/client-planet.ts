import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from './planet';
import { EspionageReportData } from '../reports/espionage-report-data';
import { PlayerType } from '../enums/player-type';

export class ClientPlanet extends Planet {
  public isOwnedByViewer: boolean;
  public reportData: EspionageReportData | null;
  public ownerPlayerType: PlayerType | null;
  public ownerPlayerName: string | null;

  constructor(
    basicInfo: PlanetBasicInfo,
    info: PlanetInfo,
    rBDSFTQ: rBDSFTQ,
    isOwnedByViewer: boolean,
    ownerPlayerType: PlayerType | null,
    ownerPlayerName: string | null,
    reportData: EspionageReportData | null,
    lastReportData: Map<number, EspionageReportData> = new Map()
  ) {
    super(basicInfo, info, rBDSFTQ, lastReportData);
    this.isOwnedByViewer = isOwnedByViewer;
    this.ownerPlayerType = ownerPlayerType;
    this.ownerPlayerName = ownerPlayerName;
    this.reportData = reportData;
  }
}

