import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { GameStateService } from '../../core/game-state.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { resolveApiErrorMessage } from '../../i18n/api-message.utils';
import { I18nPipe } from '../../i18n/i18n.pipe';
import { I18nService } from '../../i18n/i18n.service';
import { ClientPlanetDto } from '../../models/game-api-types';
import { diplomacyVisualKey, type DiplomacyVisualKey } from '../../models/diplomacy/diplomacy-display';
import { DiplomaticStatus } from '../../models/diplomacy/diplomatic-status';
import { ReportType } from '../../models/enums/report-type';
import { EspionageReportData } from '../../models/reports/espionage-report-data';
import { PlayerReport } from '../../models/reports/player-report';
import { fromPlayerReportDto } from '../../models/reports/player-report-dto.mapper';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { TutorialService } from '../../tutorial/tutorial.service';
import { AuthStateService } from '../../core/auth-state.service';
import { TooltipDirective } from '../../shared/tooltip/tooltip.directive';

type ReportDossierMetric = {
  label: string;
  value: string;
};

type ReportDossierRow = {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
};

type PlainReportView = {
  metadataRows: ReportDossierRow[];
  bodySections: PlainReportSection[];
};

type PlainReportSection = {
  title: string;
  rows: ReportDossierRow[];
  notes: string[];
};

@Component({
  selector: 'app-reports-view',
  imports: [TopMenuComponent, MiniPlanetPreviewComponent, TooltipDirective, I18nPipe],
  templateUrl: './reports-view.component.html'
})
export class ReportsViewComponent implements OnInit {
  protected readonly reportTypes = Object.values(ReportType).filter((reportType) => reportType !== ReportType.MESSAGE);
  protected readonly allTab = 'All';
  protected activeTab: ReportType | 'All' = 'All';
  protected isLoading = false;
  protected isDeleting = false;
  protected favouriteUpdatingReportId: number | null = null;
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
    private readonly authState: AuthStateService,
    private readonly router: Router,
    private readonly gameState: GameStateService,
    private readonly i18n: I18nService
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

  protected reportTabLabel(reportType: ReportType | 'All'): string {
    if (reportType === this.allTab) {
      return this.i18n.t('communications.reports.tabs.all');
    }

    return this.reportTypeLabel(reportType);
  }

  protected visibleReportCountLabel(): string {
    const count = this.visibleReports().length;
    const key = count === 1
      ? 'communications.reports.inbox.visibleCountOne'
      : 'communications.reports.inbox.visibleCountMany';
    return this.i18n.t(key, { count });
  }

  protected selectedCountLabel(): string {
    return this.i18n.t('communications.reports.inbox.selectedCount', { count: this.selectedReportIds.size });
  }

  protected favouriteTooltip(isFavourite: boolean): string {
    return this.i18n.t(isFavourite
      ? 'communications.reports.tooltips.favouriteOn'
      : 'communications.reports.tooltips.favouriteOff');
  }

  protected favouriteAriaLabel(isFavourite: boolean): string {
    return this.favouriteTooltip(isFavourite);
  }

  protected reportStatusLabel(isRead: boolean): string {
    return this.i18n.t(isRead
      ? 'communications.reports.badges.read'
      : 'communications.reports.badges.unread');
  }

  protected ownerLabelWithStatus(ownerName: string, status: DiplomaticStatus | null): string {
    return status ? `${ownerName} (${this.localizedDiplomaticStatus(status)})` : ownerName;
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
    const report = this.reports.find((entry) => entry.reportId === reportId) ?? null;
    if (report?.isFavourite) {
      this.selectedReportIds.delete(reportId);
      return;
    }

    if (checked) {
      this.selectedReportIds.add(reportId);
    } else {
      this.selectedReportIds.delete(reportId);
    }
  }

  protected selectAllVisible(): void {
    const visibleReports = this.visibleReports().filter((report) => !report.isFavourite);
    if (visibleReports.length === 0) {
      return;
    }

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

  protected toggleReportFavourite(report: PlayerReport, event?: Event): void {
    event?.stopPropagation();
    if (this.favouriteUpdatingReportId !== null) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = this.i18n.t('communications.reports.errors.noSession');
      return;
    }

    this.favouriteUpdatingReportId = report.reportId;
    this.actionError = null;

    this.gameApi.setPlayerReportFavourite(
      {
        reportId: report.reportId,
        isFavourite: !report.isFavourite
      },
      session.token
    )
      .pipe(finalize(() => {
        this.favouriteUpdatingReportId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (updatedReport) => {
          const mappedReport = fromPlayerReportDto(updatedReport);
          const existingReport = this.reports.find((entry) => entry.reportId === mappedReport.reportId) ?? null;
          if (!existingReport) {
            return;
          }

          existingReport.setFavourite(mappedReport.isFavourite);
          if (existingReport.isFavourite) {
            this.selectedReportIds.delete(existingReport.reportId);
          }
        },
        error: (error) => {
          this.actionError = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('communications.reports.errors.favouriteUpdate')
          );
        }
      });
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
      this.actionError = this.i18n.t('communications.reports.errors.noSession');
      return;
    }

    this.gameApi.markPlayerReportAsRead({ reportId: report.reportId }, session.token)
      .subscribe({
        next: () => {
          report.markAsRead();
          this.syncUnreadReportCount();
          this.cdr.markForCheck();
        },
        error: (error) => {
          this.actionError = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('communications.reports.errors.markRead')
          );
          this.cdr.markForCheck();
        }
      });
  }

  protected canPreviewLocation(report: PlayerReport | null): boolean {
    return !!report?.sourceCoordinates && report.sourceCoordinates.z >= 0;
  }

  protected canOpenInGalaxy(report: PlayerReport | null): boolean {
    return !!report?.sourceCoordinates
      && report.sourceCoordinates.x >= 0
      && report.sourceCoordinates.y >= 0;
  }

  protected canOpenOriginInGalaxy(report: PlayerReport | null): boolean {
    return !!report?.originCoordinates
      && report.originCoordinates.x >= 0
      && report.originCoordinates.y >= 0;
  }

  protected openInGalaxy(report: PlayerReport | null, event?: Event): void {
    event?.stopPropagation();
    if (!report || !this.canOpenInGalaxy(report) || !report.sourceCoordinates) {
      return;
    }

    void this.router.navigate(
      ['/game/galactic'],
      {
        queryParams: {
          x: report.sourceCoordinates.x,
          y: report.sourceCoordinates.y,
          z: report.sourceCoordinates.z
        }
      }
    );
  }

  protected openOriginInGalaxy(report: PlayerReport | null, event?: Event): void {
    event?.stopPropagation();
    if (!report || !this.canOpenOriginInGalaxy(report) || !report.originCoordinates) {
      return;
    }

    void this.router.navigate(
      ['/game/galactic'],
      {
        queryParams: {
          x: report.originCoordinates.x,
          y: report.originCoordinates.y,
          z: report.originCoordinates.z
        }
      }
    );
  }

  protected previewLocation(report: PlayerReport | null): void {
    if (!report) {
      return;
    }

    if (!this.canPreviewLocation(report)) {
      this.previewError = this.i18n.t('communications.reports.preview.unavailable');
      this.previewPlanet = null;
      return;
    }

    const coordinates = report.sourceCoordinates;
    if (!coordinates) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.previewError = this.i18n.t('communications.reports.errors.noSession');
      return;
    }

    this.previewLoading = true;
    this.previewError = null;
    this.previewPlanet = null;

    const previewCoordinates = this.toPreviewClientCoordinates(coordinates);
    this.gameApi.getClientPlanet(previewCoordinates.x, previewCoordinates.y, previewCoordinates.z, session.token)
      .pipe(finalize(() => {
        this.previewLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (planet) => {
          this.previewPlanet = planet;
        },
        error: (error) => {
          this.previewError = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('communications.reports.preview.failed')
          );
        }
      });
  }

  private toPreviewClientCoordinates(coordinates: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    return {
      x: coordinates.x,
      y: coordinates.y,
      z: Math.max(0, coordinates.z - 1)
    };
  }

  protected deleteSelectedReports(): void {
    if (this.selectedReportIds.size === 0 || this.isDeleting) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = this.i18n.t('communications.reports.errors.noSession');
      return;
    }

    this.isDeleting = true;
    this.actionError = null;
    const reportIds = Array.from(this.selectedReportIds.values())
      .filter((reportId) => !this.reports.find((report) => report.reportId === reportId)?.isFavourite);
    if (reportIds.length === 0) {
      this.isDeleting = false;
      this.selectedReportIds.clear();
      return;
    }

    this.gameApi.deletePlayerReports({ reportIds }, session.token)
      .pipe(finalize(() => {
        this.isDeleting = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          const deletedUnreadCount = this.reports.filter((report) =>
            reportIds.includes(report.reportId) && !report.isRead
          ).length;
          this.reports = this.reports.filter((report) => !reportIds.includes(report.reportId));
          if (this.selectedReportId !== null && !this.reports.some((report) => report.reportId === this.selectedReportId)) {
            this.selectedReportId = null;
          }
          this.selectedReportIds.clear();
          if (deletedUnreadCount > 0) {
            this.syncUnreadReportCount();
          }
        },
        error: (error) => {
          this.actionError = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('communications.reports.errors.deleteSelected')
          );
        }
      });
  }

  protected coordinatesLabel(report: PlayerReport): string {
    return report.coordinatesLabel() ?? this.i18n.t('communications.reports.errors.noCoordinates');
  }

  protected originCoordinatesLabel(report: PlayerReport): string {
    return report.originCoordinatesLabel() ?? this.i18n.t('communications.reports.errors.noOriginCoordinates');
  }

  protected originLabel(report: PlayerReport): string {
    const originParts = [report.originSystemName, report.originPlanetName].filter((entry): entry is string => !!entry);
    if (originParts.length > 0) {
      return `${originParts.join(' | ')} (${this.originCoordinatesLabel(report)})`;
    }

    if (report.originPlanetName) {
      return `${report.originPlanetName} (${this.originCoordinatesLabel(report)})`;
    }

    return this.originCoordinatesLabel(report);
  }

  protected sourceLabel(report: PlayerReport): string {
    const sourceParts = [report.sourceSystemName, report.sourcePlanetName].filter((entry): entry is string => !!entry);
    if (sourceParts.length > 0) {
      return sourceParts.join(' | ');
    }

    return report.senderPlayerName ?? this.i18n.t('communications.reports.errors.noSourceMetadata');
  }

  protected previewOwnerLabel(): string | null {
    if (this.previewPlanet?.info.ownerId === null || this.previewPlanet?.info.ownerId === undefined || !this.previewPlanet.info.ownerPlayerName) {
      return null;
    }

    return this.ownerLabelWithStatus(this.previewPlanet.info.ownerPlayerName, this.previewOwnerStatus());
  }

  protected previewOwnerRelationKey(): DiplomacyVisualKey | 'none' {
    const status = this.previewOwnerStatus();
    return status ? diplomacyVisualKey(status) : 'none';
  }

  protected espionageSummaryMetrics(report: EspionageReportData): ReportDossierMetric[] {
    return [
      { label: this.i18n.t('communications.reports.rowLabels.avgBuilding'), value: this.formatMetricValue(report.averageBuildingLevel) },
      { label: this.i18n.t('communications.reports.rowLabels.avgTech'), value: this.formatMetricValue(report.averageTechLevel) },
      { label: this.i18n.t('communications.reports.rowLabels.avgResources'), value: this.formatMetricValue(report.averageTotalResources) },
      { label: this.i18n.t('communications.reports.rowLabels.totalShips'), value: this.formatMetricValue(report.totalShipsAmount) },
      { label: this.i18n.t('communications.reports.rowLabels.totalDefences'), value: this.formatMetricValue(report.totalDefencesAmount) },
      { label: this.i18n.t('communications.reports.rowLabels.knownStructures'), value: this.formatMetricValue(report.buildingsLevels.size) }
    ];
  }

  protected espionageResourceRows(report: EspionageReportData): ReportDossierRow[] {
    const rows: ReportDossierRow[] = [
      { label: this.i18n.t('communications.reports.rowLabels.metal'), value: this.formatMetricValue(report.resourcesAmount.metal) },
      { label: this.i18n.t('communications.reports.rowLabels.crystal'), value: this.formatMetricValue(report.resourcesAmount.crystal) },
      { label: this.i18n.t('communications.reports.rowLabels.deuterium'), value: this.formatMetricValue(report.resourcesAmount.deuterium) }
    ];

    if (report.spaceDebrisAmount.getTotalResourceAmount() > 0) {
      rows.push(
        { label: this.i18n.t('communications.reports.rowLabels.debrisMetal'), value: this.formatMetricValue(report.spaceDebrisAmount.metal) },
        { label: this.i18n.t('communications.reports.rowLabels.debrisCrystal'), value: this.formatMetricValue(report.spaceDebrisAmount.crystal) },
        { label: this.i18n.t('communications.reports.rowLabels.debrisDeuterium'), value: this.formatMetricValue(report.spaceDebrisAmount.deuterium) }
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
      { label: this.i18n.t('communications.reports.rowLabels.size'), value: this.formatMetricValue(report.size) },
      { label: this.i18n.t('communications.reports.rowLabels.diff'), value: this.formatMetricValue(report.diff) },
      { label: this.i18n.t('communications.reports.rowLabels.metalModifier'), value: this.formatPlanetaryParameterPercent(parameters.metalModifier), tone: this.parameterTone(parameters.metalModifier) },
      { label: this.i18n.t('communications.reports.rowLabels.crystalModifier'), value: this.formatPlanetaryParameterPercent(parameters.crystalModifier), tone: this.parameterTone(parameters.crystalModifier) },
      { label: this.i18n.t('communications.reports.rowLabels.deuteriumModifier'), value: this.formatPlanetaryParameterPercent(parameters.deuteriumModifier), tone: this.parameterTone(parameters.deuteriumModifier) },
      { label: this.i18n.t('communications.reports.rowLabels.energyModifierRes'), value: this.formatPlanetaryParameterPercent(parameters.energyModifierRES), tone: this.parameterTone(parameters.energyModifierRES) },
      { label: this.i18n.t('communications.reports.rowLabels.energyModifierNuclear'), value: this.formatPlanetaryParameterPercent(parameters.energyModifierNuclear), tone: this.parameterTone(parameters.energyModifierNuclear) },
      { label: this.i18n.t('communications.reports.rowLabels.scienceModifier'), value: this.formatPlanetaryParameterPercent(parameters.scienceModifier), tone: this.parameterTone(parameters.scienceModifier) },
      { label: this.i18n.t('communications.reports.rowLabels.industryModifier'), value: this.formatPlanetaryParameterPercent(parameters.industryModifier), tone: this.parameterTone(parameters.industryModifier) },
      { label: this.i18n.t('communications.reports.rowLabels.anomaliesAndNoise'), value: this.formatPlanetaryParameterPercent(parameters.anomaliesAndNoise), tone: this.parameterTone(parameters.anomaliesAndNoise) },
      { label: this.i18n.t('communications.reports.rowLabels.hyperspaceParameters'), value: this.formatPlanetaryParameterPercent(parameters.hyperspaceParameters), tone: this.parameterTone(parameters.hyperspaceParameters) }
    ];
  }

  protected dossierCopy(report: EspionageReportData): string {
    return this.i18n.t('communications.reports.dossier.copy', {
      source: this.sourceLabel(report)
    });
  }

  protected plainReportView(report: PlayerReport): PlainReportView {
    const [metadataBlock, ...bodyBlocks] = report.show().split(/\n\s*\n/);
    const metadataRows = this.parsePlainReportRows(metadataBlock.split('\n'));
    const bodyLines = bodyBlocks.join('\n\n').split('\n');
    return {
      metadataRows,
      bodySections: this.parsePlainReportBodySections(bodyLines)
    };
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

  private parsePlainReportBodySections(lines: string[]): PlainReportSection[] {
    const sections: PlainReportSection[] = [];
    let currentSection = this.createPlainReportSection(
      this.i18n?.t('communications.reports.plain.sections.defaultTitle') ?? 'Report Details'
    );

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      if (this.isPlainReportSectionHeading(line)) {
        if (currentSection.rows.length > 0 || currentSection.notes.length > 0) {
          sections.push(currentSection);
        }
        currentSection = this.createPlainReportSection(line.replace(/:$/, ''));
        continue;
      }

      const row = this.parsePlainReportRow(line);
      if (row) {
        currentSection.rows.push(row);
      } else {
        currentSection.notes.push(line);
      }
    }

    if (currentSection.rows.length > 0 || currentSection.notes.length > 0) {
      sections.push(currentSection);
    }

    return sections;
  }

  private parsePlainReportRows(lines: string[]): ReportDossierRow[] {
    return lines
      .map((line) => this.parsePlainReportRow(line.trim()))
      .filter((row): row is ReportDossierRow => row !== null);
  }

  private parsePlainReportRow(line: string): ReportDossierRow | null {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      return null;
    }

    const label = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!label || !value) {
      return null;
    }

    return {
      label,
      value,
      tone: this.plainReportTone(label, value)
    };
  }

  private isPlainReportSectionHeading(line: string): boolean {
    if (!line.endsWith(':')) {
      return false;
    }

    return line.length <= 48 && !line.includes(',') && !line.includes('|');
  }

  private createPlainReportSection(title: string): PlainReportSection {
    return {
      title,
      rows: [],
      notes: []
    };
  }

  private plainReportTone(label: string, value: string): 'positive' | 'negative' | 'neutral' {
    const text = `${label} ${value}`.toLowerCase();
    if (
      text.includes('success')
      || text.includes('survived')
      || text.includes('stolen')
      || text.includes('repaired')
      || text.includes('delivered')
      || text.includes('created')
    ) {
      return 'positive';
    }

    if (
      text.includes('failure')
      || text.includes('lost')
      || text.includes('losses')
      || text.includes('destroyed')
      || text.includes('damage')
      || text.includes('blocked')
      || text.includes('none')
    ) {
      return 'negative';
    }

    return 'neutral';
  }

  private formatMetricValue(value: number): string {
    if (!Number.isFinite(value)) {
      return this.i18n?.t('communications.shared.labels.noData') ?? 'No data.';
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

  private previewOwnerStatus(): DiplomaticStatus | null {
    if (this.previewPlanet?.info.ownerId === null || this.previewPlanet?.info.ownerId === undefined) {
      return null;
    }

    const session = this.playerSession.load();
    const viewerId = session?.playerId ?? (this.previewPlanet.info.isOwnedByViewer ? this.previewPlanet.info.ownerId : null);
    if (viewerId === null || viewerId === undefined) {
      return null;
    }

    return this.gameState.diplomacyResolver().getStatus(viewerId, this.previewPlanet.info.ownerId);
  }

  private loadReports(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = this.i18n.t('communications.reports.errors.noSession');
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
        error: (error) => {
          this.loadError = resolveApiErrorMessage(
            this.i18n,
            error,
            this.i18n.t('communications.reports.errors.load')
          );
        }
      });
  }

  protected reportTypeLabel(reportType: ReportType): string {
    return this.i18n.t(`communications.reports.reportTypes.${reportType}`);
  }

  private localizedDiplomaticStatus(status: DiplomaticStatus): string {
    return this.i18n.t(`communications.shared.diplomaticStatuses.${status === DiplomaticStatus.PASSIVE ? DiplomaticStatus.NEUTRAL : status}`);
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
