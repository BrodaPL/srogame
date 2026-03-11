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
      {
        reportId: this.reportId,
        createdTurn: this.createdTurn,
        title: this.title,
        isRead: this.isRead,
        sourceCoordinates: this.sourceCoordinates ? { ...this.sourceCoordinates } : null,
        sourcePlanetName: this.sourcePlanetName,
        sourceSystemName: this.sourceSystemName,
        senderPlayerName: this.senderPlayerName
      },
      this.messageBody
    );
  }
}
