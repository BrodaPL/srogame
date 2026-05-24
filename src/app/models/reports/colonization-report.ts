import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class ColonizationReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.COLONIZATION_REPORT, data, body);
  }

  public override copy(): ColonizationReport {
    return new ColonizationReport(
      this.copyBaseData(),
      this.body
    );
  }
}
