import { ReportType } from '../enums/report-type';
import { TextPlayerReport } from './text-player-report';
import type { PlayerReportBaseData } from './player-report';

export class MessageReport extends TextPlayerReport {
  constructor(
    data: PlayerReportBaseData,
    messageBody: string
  ) {
    super(ReportType.MESSAGE, data, messageBody);
  }

  public get messageBody(): string {
    return this.body;
  }

  public set messageBody(value: string) {
    this.body = value;
  }

  public override copy(): MessageReport {
    return new MessageReport(
      this.copyBaseData(),
      this.messageBody
    );
  }
}
