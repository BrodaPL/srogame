import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { ClientPlanetDto } from '../../models/game-api-types';
import { ReportType } from '../../models/enums/report-type';
import { EspionageReportData } from '../../models/reports/espionage-report-data';
import { PlayerReport } from '../../models/reports/player-report';
import { fromPlayerReportDto } from '../../models/reports/player-report-dto.mapper';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { TutorialService } from '../../tutorial/tutorial.service';
import { AuthStateService } from '../../core/auth-state.service';

type ReportDossierMetric = {
  label: string;
  value: string;
};

type ReportDossierRow = {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
};

@Component({
  selector: 'app-reports-view',
  imports: [TopMenuComponent, MiniPlanetPreviewComponent],
  templateUrl: './reports-view.component.html'
})
export class ReportsViewComponent implements OnInit {
  protected readonly reportTypes = Object.values(ReportType).filter((reportType) => reportType !== ReportType.MESSAGE);
  protected readonly allTab = 'All';
  protected activeTab: ReportType | 'All' = 'All';
  protected isLoading = false;
  protected isDeleting = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected reports: PlayerReport[] = [];
  protected selectedReportId: number | null = null;
  protected selectedReportIds = new Set<number>();
  protected previewPlanet: ClientPlanetDto | null = null;
  protected previewLoading = false;
  protected previewError: string | null = null;

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService,
    private readonly authState: AuthStateService
  ) {}

  public ngOnInit(): void {
    this.loadReports();
  }

  protected visibleReports(): PlayerReport[] {
    const reports = this.activeTab === this.allTab
      ? this.reports
      : this.reports.filter((report) => report.reportType === this.activeTab);

    return [...reports].sort((left, right) => right.createdTurn - left.createdTurn || right.reportId - left.reportId);
  }

  protected reportTypeCount(reportType: ReportType | 'All'): number {
    if (reportType === this.allTab) {
      return this.reports.length;
    }

    return this.reports.filter((report) => report.reportType === reportType).length;
  }

  protected selectedReport(): PlayerReport | null {
    if (this.selectedReportId === null) {
      return null;
    }

    return this.reports.find((report) => report.reportId === this.selectedReportId) ?? null;
  }

  protected asEspionageReport(report: PlayerReport | null): EspionageReportData | null {
    return report instanceof EspionageReportData ? report : null;
  }

  protected setActiveTab(reportType: ReportType | 'All'): void {
    this.activeTab = reportType;
    this.actionError = null;

    const selectedReport = this.selectedReport();
    if (selectedReport && !this.isReportVisible(selectedReport)) {
      this.selectedReportId = null;
    }
  }

  protected isTabActive(reportType: ReportType | 'All'): boolean {
    return this.activeTab === reportType;
  }

  protected isSelected(reportId: number): boolean {
    return this.selectedReportIds.has(reportId);
  }

  protected toggleReportSelection(reportId: number, checked: boolean): void {
    if (checked) {
      this.selectedReportIds.add(reportId);
    } else {
      this.selectedReportIds.delete(reportId);
    }
  }

  protected selectAllVisible(): void {
    const visibleReports = this.visibleReports();
    const shouldSelectAll = visibleReports.some((report) => !this.selectedReportIds.has(report.reportId));

    if (!shouldSelectAll) {
      for (const report of visibleReports) {
        this.selectedReportIds.delete(report.reportId);
      }
      return;
    }

    for (const report of visibleReports) {
      this.selectedReportIds.add(report.reportId);
    }
  }

  protected openReport(report: PlayerReport): void {
    this.selectReport(report);
    this.markReportAsRead(report);
  }

  private selectReport(report: PlayerReport): void {
    this.selectedReportId = report.reportId;
    this.actionError = null;
    this.resetPreview();
  }

  private markReportAsRead(report: PlayerReport): void {
    if (report.isRead) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    this.gameApi.markPlayerReportAsRead({ reportId: report.reportId }, session.token)
      .subscribe({
        next: () => {
          report.markAsRead();
          this.syncUnreadReportCount();
          this.cdr.markForCheck();
        },
        error: () => {
          this.actionError = 'Unable to mark report as read.';
          this.cdr.markForCheck();
        }
      });
  }

  protected canPreviewLocation(report: PlayerReport | null): boolean {
    return !!report?.sourceCoordinates && report.sourceCoordinates.z >= 0;
  }

  protected previewLocation(report: PlayerReport | null): void {
    if (!report) {
      return;
    }

    if (!this.canPreviewLocation(report)) {
      this.previewError = 'Planet preview is unavailable for this report.';
      this.previewPlanet = null;
      return;
    }

    const coordinates = report.sourceCoordinates;
    if (!coordinates) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.previewError = 'No player session found.';
      return;
    }

    this.previewLoading = true;
    this.previewError = null;
    this.previewPlanet = null;

    this.gameApi.getClientPlanet(coordinates.x, coordinates.y, coordinates.z, session.token)
      .pipe(finalize(() => {
        this.previewLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (planet) => {
          this.previewPlanet = planet;
        },
        error: () => {
          this.previewError = 'Unable to load the planet preview.';
        }
      });
  }

  protected deleteSelectedReports(): void {
    if (this.selectedReportIds.size === 0 || this.isDeleting) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    this.isDeleting = true;
    this.actionError = null;
    const reportIds = Array.from(this.selectedReportIds.values());

    this.gameApi.deletePlayerReports({ reportIds }, session.token)
      .pipe(finalize(() => {
        this.isDeleting = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          const deletedUnreadCount = this.reports.filter((report) =>
            this.selectedReportIds.has(report.reportId) && !report.isRead
          ).length;
          this.reports = this.reports.filter((report) => !this.selectedReportIds.has(report.reportId));
          if (this.selectedReportId !== null && !this.reports.some((report) => report.reportId === this.selectedReportId)) {
            this.selectedReportId = null;
          }
          this.selectedReportIds.clear();
          if (deletedUnreadCount > 0) {
            this.syncUnreadReportCount();
          }
        },
        error: () => {
          this.actionError = 'Unable to delete selected reports.';
        }
      });
  }

  protected coordinatesLabel(report: PlayerReport): string {
    return report.coordinatesLabel() ?? 'No coordinates';
  }

  protected sourceLabel(report: PlayerReport): string {
    const sourceParts = [report.sourceSystemName, report.sourcePlanetName].filter((entry): entry is string => !!entry);
    if (sourceParts.length > 0) {
      return sourceParts.join(' | ');
    }

    return report.senderPlayerName ?? 'No source metadata';
  }

  protected espionageSummaryMetrics(report: EspionageReportData): ReportDossierMetric[] {
    return [
      { label: 'Avg building', value: this.formatMetricValue(report.averageBuildingLevel) },
      { label: 'Avg tech', value: this.formatMetricValue(report.averageTechLevel) },
      { label: 'Avg resources', value: this.formatMetricValue(report.averageTotalResources) },
      { label: 'Total ships', value: this.formatMetricValue(report.totalShipsAmount) },
      { label: 'Total defences', value: this.formatMetricValue(report.totalDefencesAmount) },
      { label: 'Known structures', value: this.formatMetricValue(report.buildingsLevels.size) }
    ];
  }

  protected espionageResourceRows(report: EspionageReportData): ReportDossierRow[] {
    const rows: ReportDossierRow[] = [
      { label: 'Metal', value: this.formatMetricValue(report.resourcesAmount.metal) },
      { label: 'Crystal', value: this.formatMetricValue(report.resourcesAmount.crystal) },
      { label: 'Deuterium', value: this.formatMetricValue(report.resourcesAmount.deuterium) }
    ];

    if (report.spaceDebrisAmount.getTotalResourceAmount() > 0) {
      rows.push(
        { label: 'Debris Metal', value: this.formatMetricValue(report.spaceDebrisAmount.metal) },
        { label: 'Debris Crystal', value: this.formatMetricValue(report.spaceDebrisAmount.crystal) },
        { label: 'Debris Deuterium', value: this.formatMetricValue(report.spaceDebrisAmount.deuterium) }
      );
    }

    return rows;
  }

  protected espionageBuildingRows(report: EspionageReportData): ReportDossierRow[] {
    return this.mapEntriesToRows(report.buildingsLevels, 'asc');
  }

  protected espionageTechnologyRows(report: EspionageReportData): ReportDossierRow[] {
    return this.mapEntriesToRows(report.techLevels, 'asc');
  }

  protected espionageShipRows(report: EspionageReportData): ReportDossierRow[] {
    return this.mapEntriesToRows(report.ships, 'desc');
  }

  protected espionageDefenceRows(report: EspionageReportData): ReportDossierRow[] {
    return report.defences.map((entry) => ({
      label: entry.type,
      value: this.formatMetricValue(entry.amount)
    }));
  }

  protected espionageParameterRows(report: EspionageReportData): ReportDossierRow[] {
    const parameters = report.planetaryParameters;

    return [
      { label: 'Size', value: this.formatMetricValue(report.size) },
      { label: 'Diff.', value: this.formatMetricValue(report.diff) },
      { label: 'Metal modifier', value: this.formatPlanetaryParameterPercent(parameters.metalModifier), tone: this.parameterTone(parameters.metalModifier) },
      { label: 'Crystal modifier', value: this.formatPlanetaryParameterPercent(parameters.crystalModifier), tone: this.parameterTone(parameters.crystalModifier) },
      { label: 'Deuterium modifier', value: this.formatPlanetaryParameterPercent(parameters.deuteriumModifier), tone: this.parameterTone(parameters.deuteriumModifier) },
      { label: 'Energy modifier RES', value: this.formatPlanetaryParameterPercent(parameters.energyModifierRES), tone: this.parameterTone(parameters.energyModifierRES) },
      { label: 'Energy modifier Nuclear', value: this.formatPlanetaryParameterPercent(parameters.energyModifierNuclear), tone: this.parameterTone(parameters.energyModifierNuclear) },
      { label: 'Science modifier', value: this.formatPlanetaryParameterPercent(parameters.scienceModifier), tone: this.parameterTone(parameters.scienceModifier) },
      { label: 'Industry modifier', value: this.formatPlanetaryParameterPercent(parameters.industryModifier), tone: this.parameterTone(parameters.industryModifier) },
      { label: 'Anomalies and Noise', value: this.formatPlanetaryParameterPercent(parameters.anomaliesAndNoise), tone: this.parameterTone(parameters.anomaliesAndNoise) },
      { label: 'Hyperspace parameters', value: this.formatPlanetaryParameterPercent(parameters.hyperspaceParameters), tone: this.parameterTone(parameters.hyperspaceParameters) }
    ];
  }

  protected dossierCopy(report: EspionageReportData): string {
    return `Scanner capture for ${this.sourceLabel(report)}. Known assets and planetary modifiers are organized below.`;
  }

  protected trackDossierRow(_: number, row: ReportDossierRow): string {
    return row.label;
  }

  private isReportVisible(report: PlayerReport): boolean {
    return this.activeTab === this.allTab || report.reportType === this.activeTab;
  }

  private mapEntriesToRows<T>(entries: Map<T, number>, order: 'asc' | 'desc'): ReportDossierRow[] {
    return Array.from(entries.entries())
      .sort((left, right) => {
        if (order === 'desc' && left[1] !== right[1]) {
          return right[1] - left[1];
        }

        return String(left[0]).localeCompare(String(right[0]));
      })
      .map(([label, value]) => ({
        label: String(label),
        value: this.formatMetricValue(value)
      }));
  }

  private formatMetricValue(value: number): string {
    if (!Number.isFinite(value)) {
      return 'No data.';
    }

    if (Number.isInteger(value)) {
      return value.toLocaleString('en-US');
    }

    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    });
  }

  private formatPlanetaryParameterPercent(value: number): string {
    const normalized = Number.isFinite(value) ? value : 0;
    return `${Math.round(normalized * 100)}%`;
  }

  private parameterTone(value: number): 'positive' | 'negative' | 'neutral' {
    if (!Number.isFinite(value)) {
      return 'neutral';
    }

    if (value > 1.02) {
      return 'positive';
    }

    if (value < 0.98) {
      return 'negative';
    }

    return 'neutral';
  }

  private resetPreview(): void {
    this.previewPlanet = null;
    this.previewLoading = false;
    this.previewError = null;
  }

  private loadReports(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.actionError = null;

    this.gameApi.getPlayerReports(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (reports) => {
          this.reports = reports.map((report) => fromPlayerReportDto(report));
          this.syncUnreadReportCount();
          this.selectedReportIds.clear();
          this.selectedReportId = this.visibleReports()[0]?.reportId ?? null;
          this.resetPreview();
          this.tutorialService.autoOpenTutorial('reportsView');
        },
        error: () => {
          this.loadError = 'Unable to load reports.';
        }
      });
  }

  private syncUnreadReportCount(): void {
    const session = this.authState.session();
    if (!session) {
      return;
    }

    this.authState.setSession({
      ...session,
      unreadReportCount: this.reports.filter((report) => !report.isRead).length
    });
  }
}
