import { ReportType } from '../enums/report-type';
import type { ReportCoordinates } from './report-coordinates';

export type PlayerReportBaseData = {
  reportId: number;
  createdTurn: number;
  title: string;
  isRead?: boolean;
  sourceCoordinates?: ReportCoordinates | null;
  sourcePlanetName?: string | null;
  sourceSystemName?: string | null;
  senderPlayerName?: string | null;
};

export abstract class PlayerReport {
  public reportId: number;
  public createdTurn: number;
  public title: string;
  public isRead: boolean;
  public sourceCoordinates: ReportCoordinates | null;
  public sourcePlanetName: string | null;
  public sourceSystemName: string | null;
  public senderPlayerName: string | null;

  protected constructor(
    public reportType: ReportType,
    data: PlayerReportBaseData
  ) {
    this.reportId = data.reportId;
    this.createdTurn = data.createdTurn;
    this.title = data.title;
    this.isRead = data.isRead ?? false;
    this.sourceCoordinates = data.sourceCoordinates ?? null;
    this.sourcePlanetName = data.sourcePlanetName ?? null;
    this.sourceSystemName = data.sourceSystemName ?? null;
    this.senderPlayerName = data.senderPlayerName ?? null;
  }

  public markAsRead(): void {
    this.isRead = true;
  }

  public coordinatesLabel(): string | null {
    if (!this.sourceCoordinates) {
      return null;
    }

    return `${this.sourceCoordinates.x}:${this.sourceCoordinates.y}:${this.sourceCoordinates.z}`;
  }

  protected buildMetadataLines(): string[] {
    const lines = [
      `Title: ${this.title}`,
      `Type: ${this.reportType}`,
      `Turn: ${this.createdTurn}`
    ];

    if (this.senderPlayerName) {
      lines.push(`Sender: ${this.senderPlayerName}`);
    }

    if (this.sourceSystemName) {
      lines.push(`System: ${this.sourceSystemName}`);
    }

    if (this.sourcePlanetName) {
      lines.push(`Planet: ${this.sourcePlanetName}`);
    }

    const coordinates = this.coordinatesLabel();
    if (coordinates) {
      lines.push(`Coordinates: ${coordinates}`);
    }

    return lines;
  }

  public abstract show(): string;

  public abstract copy(): PlayerReport;
}
