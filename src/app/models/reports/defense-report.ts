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
      this.body
    );
  }
}
