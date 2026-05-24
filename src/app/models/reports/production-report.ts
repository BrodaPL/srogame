import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class ProductionReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.PRODUCTION_REPORT, data, body);
  }

  public override copy(): ProductionReport {
    return new ProductionReport(
      this.copyBaseData(),
      this.body
    );
  }
}
