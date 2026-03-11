import { ReportType } from '../enums/report-type';
import { PlayerReport, type PlayerReportBaseData } from './player-report';

export abstract class TextPlayerReport extends PlayerReport {
  protected constructor(
    reportType: ReportType,
    data: PlayerReportBaseData,
    public body: string
  ) {
    super(reportType, data);
  }

  public override show(): string {
    const lines = this.buildMetadataLines();
    const normalizedBody = this.body.trim();

    if (!normalizedBody) {
      return lines.join('\n');
    }

    return `${lines.join('\n')}\n\n${normalizedBody}`;
  }
}
