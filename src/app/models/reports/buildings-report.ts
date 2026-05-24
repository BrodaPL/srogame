import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class BuildingsReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.BUILDINGS_REPORT, data, body);
  }

  public override copy(): BuildingsReport {
    return new BuildingsReport(
      this.copyBaseData(),
      this.body
    );
  }
}
