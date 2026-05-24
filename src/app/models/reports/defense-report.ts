import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class DefenseReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.DEFENSE_REPORT, data, body);
  }

  public override copy(): DefenseReport {
    return new DefenseReport(
      this.copyBaseData(),
      this.body
    );
  }
}
