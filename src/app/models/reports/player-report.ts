import { ReportType } from '../enums/report-type';
import type { ReportCoordinates } from './report-coordinates';

export type PlayerReportBaseData = {
  reportId: number;
  createdTurn: number;
  title: string;
  isRead?: boolean;
  isFavourite?: boolean;
  sourceCoordinates?: ReportCoordinates | null;
  sourcePlanetName?: string | null;
  sourceSystemName?: string | null;
  originCoordinates?: ReportCoordinates | null;
  originPlanetName?: string | null;
  originSystemName?: string | null;
  senderPlayerName?: string | null;
};

export abstract class PlayerReport {
  public reportId: number;
  public createdTurn: number;
  public title: string;
  public isRead: boolean;
  public isFavourite: boolean;
  public sourceCoordinates: ReportCoordinates | null;
  public sourcePlanetName: string | null;
  public sourceSystemName: string | null;
  public originCoordinates: ReportCoordinates | null;
  public originPlanetName: string | null;
  public originSystemName: string | null;
  public senderPlayerName: string | null;

  protected constructor(
    public reportType: ReportType,
    data: PlayerReportBaseData
  ) {
    this.reportId = data.reportId;
    this.createdTurn = data.createdTurn;
    this.title = data.title;
    this.isRead = data.isRead ?? false;
    this.isFavourite = data.isFavourite ?? false;
    this.sourceCoordinates = data.sourceCoordinates ?? null;
    this.sourcePlanetName = data.sourcePlanetName ?? null;
    this.sourceSystemName = data.sourceSystemName ?? null;
    this.originCoordinates = data.originCoordinates ?? null;
    this.originPlanetName = data.originPlanetName ?? null;
    this.originSystemName = data.originSystemName ?? null;
    this.senderPlayerName = data.senderPlayerName ?? null;
  }

  public markAsRead(): void {
    this.isRead = true;
  }

  public setFavourite(isFavourite: boolean): void {
    this.isFavourite = isFavourite;
  }

  protected copyBaseData(): PlayerReportBaseData {
    return {
      reportId: this.reportId,
      createdTurn: this.createdTurn,
      title: this.title,
      isRead: this.isRead,
      isFavourite: this.isFavourite,
      sourceCoordinates: this.sourceCoordinates ? { ...this.sourceCoordinates } : null,
      sourcePlanetName: this.sourcePlanetName,
      sourceSystemName: this.sourceSystemName,
      originCoordinates: this.originCoordinates ? { ...this.originCoordinates } : null,
      originPlanetName: this.originPlanetName,
      originSystemName: this.originSystemName,
      senderPlayerName: this.senderPlayerName
    };
  }

  public coordinatesLabel(): string | null {
    if (!this.sourceCoordinates) {
      return null;
    }

    return `${this.sourceCoordinates.x}:${this.sourceCoordinates.y}:${this.sourceCoordinates.z}`;
  }

  public originCoordinatesLabel(): string | null {
    if (!this.originCoordinates) {
      return null;
    }

    return `${this.originCoordinates.x}:${this.originCoordinates.y}:${this.originCoordinates.z}`;
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
