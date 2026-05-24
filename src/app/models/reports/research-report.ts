import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class ResearchReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.RESEARCH_REPORT, data, body);
  }

  public override copy(): ResearchReport {
    return new ResearchReport(
      this.copyBaseData(),
      this.body
    );
  }
}
