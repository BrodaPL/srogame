import { Planet } from './planets/planet';
import { TechnologyType } from './enums/technology-type';
import { Fleet } from './fleets/fleet';
import { PlayerType } from './enums/player-type';
import { PlayerReport } from './reports/player-report';
import {
  TutorialReadState,
  TutorialViewKey,
  createTutorialReadState,
  normalizeTutorialReadState
} from '../tutorial/tutorial-types';

export class Player {
  constructor(
    public playerId: number,
    public playerName: string,
    public planets: Planet[],
    public tech: Map<TechnologyType, number>,
    public fleets: Fleet[],
    public type: PlayerType,
    public tutorialRead: TutorialReadState = createTutorialReadState(false),
    public reports: PlayerReport[] = [],
    public nextReportId = 1
  ) {}

  public getTechLevel(type: TechnologyType): number {
    return this.tech.get(type) ?? 0;
  }

  public setTechLevel(type: TechnologyType, level: number): void {
    const normalized = Math.max(0, Math.floor(level));
    if (normalized === 0) {
      this.tech.delete(type);
      return;
    }

    this.tech.set(type, normalized);
  }

  public addTechLevel(type: TechnologyType, delta = 1): number {
    const next = this.getTechLevel(type) + delta;
    this.setTechLevel(type, next);
    return this.getTechLevel(type);
  }

  public createReportId(): number {
    const reportId = this.nextReportId;
    this.nextReportId += 1;
    return reportId;
  }

  public addReport(report: PlayerReport): void {
    this.reports.push(report);
    if (report.reportId >= this.nextReportId) {
      this.nextReportId = report.reportId + 1;
    }
  }

  public markReportAsRead(reportId: number): boolean {
    const report = this.reports.find((entry) => entry.reportId === reportId);
    if (!report) {
      return false;
    }

    report.markAsRead();
    return true;
  }

  public deleteReports(reportIds: number[]): number {
    const selected = new Set(reportIds);
    if (selected.size === 0) {
      return 0;
    }

    const before = this.reports.length;
    this.reports = this.reports.filter((report) => !selected.has(report.reportId));
    return before - this.reports.length;
  }

  public isTutorialRead(viewKey: TutorialViewKey): boolean {
    return this.tutorialRead[viewKey];
  }

  public markTutorialRead(viewKey: TutorialViewKey): void {
    this.tutorialRead[viewKey] = true;
  }

  public markAllTutorialsRead(): void {
    this.tutorialRead = createTutorialReadState(true);
  }

  public static techLevelsFromRecord(
    record: Record<string, number> | null | undefined
  ): Map<TechnologyType, number> {
    const map = new Map<TechnologyType, number>();
    if (!record) {
      return map;
    }

    for (const [key, value] of Object.entries(record)) {
      if (!Number.isFinite(value)) {
        continue;
      }

      const normalized = Math.max(0, Math.floor(value));
      if (normalized === 0) {
        continue;
      }

      map.set(key as TechnologyType, normalized);
    }

    return map;
  }

  public static techLevelsToRecord(
    map: Map<TechnologyType, number>
  ): Record<string, number> {
    const record: Record<string, number> = {};
    for (const [type, level] of map.entries()) {
      if (!Number.isFinite(level)) {
        continue;
      }

      const normalized = Math.max(0, Math.floor(level));
      if (normalized === 0) {
        continue;
      }

      record[type] = normalized;
    }

    return record;
  }

  public static tutorialReadStateFromRecord(
    record: Partial<Record<string, unknown>> | null | undefined,
    fallback = false
  ): TutorialReadState {
    return normalizeTutorialReadState(record, fallback);
  }
}
