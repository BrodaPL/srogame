import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class SensorPhalanxReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    body: string
  ) {
    super(ReportType.SENSOR_PHALANX_REPORT, data, body);
  }

  public override copy(): SensorPhalanxReport {
    return new SensorPhalanxReport(
      this.copyBaseData(),
      this.body
    );
  }
}
