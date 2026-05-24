import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class StarSystemEspionageReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.STAR_SYSTEM_ESPIONAGE_REPORT, data, body);
  }

  public override copy(): StarSystemEspionageReport {
    return new StarSystemEspionageReport(
      this.copyBaseData(),
      this.body
    );
  }
}
