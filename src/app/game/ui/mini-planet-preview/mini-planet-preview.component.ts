import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Router } from '@angular/router';
import { GameStateService } from '../../../core/game-state.service';
import { I18nPipe } from '../../../i18n/i18n.pipe';
import { I18nService } from '../../../i18n/i18n.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import type {
  ClientPlanetDto,
  ClientReportDataDto,
  PlayerSession,
} from '../../../models/game-api-types';
import {
  diplomacyVisualKey,
  type DiplomacyVisualKey,
} from '../../../models/diplomacy/diplomacy-display';
import { DiplomaticStatus } from '../../../models/diplomacy/diplomatic-status';
import { PlayerType } from '../../../models/enums/player-type';
import { PlanetImageHelper } from '../../../models/planets/planet-image-helper';
import { planetImageVariantToStyle } from '../../../models/planets/planet-image-variant';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';
import { SpyLaunchDialogComponent } from '../spy-launch-dialog/spy-launch-dialog.component';

type MiniPlanetTagVm = {
  label: string;
  tooltip: string;
};

@Component({
  selector: 'app-mini-planet-preview',
  imports: [SpyLaunchDialogComponent, TooltipDirective, I18nPipe],
  templateUrl: './mini-planet-preview.component.html',
})
export class MiniPlanetPreviewComponent implements OnChanges {
  @Input() planet: ClientPlanetDto | null = null;
  @Input() showDefaultActions = true;
  @Input() showSelectionActions = false;
  @Input() showSensorPhalanxAction = false;
  @Input() isSelected = false;
  @Output() chooseAsOrigin = new EventEmitter<ClientPlanetDto>();
  @Output() chooseAsTarget = new EventEmitter<ClientPlanetDto>();
  @Output() sensorPhalanxScan = new EventEmitter<ClientPlanetDto>();

  protected tags: MiniPlanetTagVm[] = [];
  protected isSpyDialogOpen = false;
  protected spyLaunchNotice: string | null = null;

  constructor(
    private readonly router: Router,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly i18n: I18nService,
  ) {}

  public ngOnChanges(): void {
    this.tags = this.buildTags();
  }

  protected planetNameLabel(): string {
    return this.planet?.basicInfo.name ?? this.i18n.t('generated.miniPlanet.unknownPlanet');
  }

  protected planetImageAlt(): string {
    return this.i18n.t('generated.miniPlanet.imageAlt', { name: this.planetNameLabel() });
  }

  protected planetImagePath(): string | null {
    if (!this.planet) {
      return null;
    }

    return PlanetImageHelper.getPlanetImage(
      this.planet.basicInfo.type,
      this.planet.basicInfo.size,
      'small',
    );
  }

  protected planetImageTransform(): string {
    if (!this.planet) {
      return '';
    }

    return planetImageVariantToStyle(this.planet.basicInfo.iv, this.planet.basicInfo.type)
      .transform;
  }

  protected planetImageFilter(): string {
    if (!this.planet) {
      return '';
    }

    return planetImageVariantToStyle(this.planet.basicInfo.iv, this.planet.basicInfo.type).filter;
  }

  protected coordinatesLabel(): string {
    if (!this.planet) {
      return '--:--:--';
    }

    return `${this.planet.coordinates.x}:${this.planet.coordinates.y}:${this.planet.coordinates.z}`;
  }

  protected copyCoordinates(): void {
    if (!this.planet || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }

    void navigator.clipboard.writeText(this.coordinatesLabel());
  }

  protected canViewPlanet(): boolean {
    return this.planet?.info.isOwnedByViewer === true;
  }

  protected ownershipLabel(): string {
    if (!this.planet) {
      return this.i18n.t('generated.miniPlanet.ownedBy', {
        owner: this.i18n.t('generated.miniPlanet.ownerNoData'),
      });
    }

    if (this.planet.info.isOwnedByViewer) {
      return this.i18n.t('generated.miniPlanet.ownedBy', {
        owner: this.ownerLabel(
          this.planet.info.ownerPlayerName ?? this.i18n.t('generated.miniPlanet.ownerYou'),
          this.diplomacyStatusForOwner(this.planet.info.ownerId),
        ),
      });
    }

    if (this.planet.info.ownerId !== null) {
      return this.i18n.t('generated.miniPlanet.ownedBy', {
        owner: this.ownerLabel(
          this.planet.info.ownerPlayerName ?? this.i18n.t('generated.miniPlanet.ownerUnknown'),
          this.diplomacyStatusForOwner(this.planet.info.ownerId),
        ),
      });
    }

    if (this.planet.info.ownerPlayerType === PlayerType.NEUTRAL) {
      return this.i18n.t('generated.miniPlanet.ownedBy', {
        owner: this.i18n.t('generated.miniPlanet.ownerNeutral'),
      });
    }

    if (this.planet.info.ownerPlayerName) {
      return this.i18n.t('generated.miniPlanet.ownedBy', {
        owner: this.planet.info.ownerPlayerName,
      });
    }

    return this.i18n.t('generated.miniPlanet.ownedBy', {
      owner: this.i18n.t(
        this.isNoDataPlanet()
          ? 'generated.miniPlanet.ownerNoData'
          : 'generated.miniPlanet.ownerFree',
      ),
    });
  }

  protected isNoDataPlanet(): boolean {
    return (
      !!this.planet &&
      !this.planet.info.isOwnedByViewer &&
      this.planet.reportData === null &&
      this.planet.info.ownerPlayerType === null
    );
  }

  protected isPlayerOwnedPlanet(): boolean {
    return this.planet?.info.isOwnedByViewer === true;
  }

  protected isNeutralOwnedPlanet(): boolean {
    return (
      !!this.planet &&
      !this.planet.info.isOwnedByViewer &&
      this.planet?.info.ownerPlayerType === PlayerType.NEUTRAL
    );
  }

  protected isHumanOwnedPlanet(): boolean {
    return (
      !!this.planet &&
      !this.planet.info.isOwnedByViewer &&
      this.planet?.info.ownerPlayerType === PlayerType.PLAYER
    );
  }

  protected isBotOwnedPlanet(): boolean {
    return (
      !!this.planet &&
      !this.planet.info.isOwnedByViewer &&
      this.planet?.info.ownerPlayerType === PlayerType.BOT
    );
  }

  protected diplomacyRelationKey(): DiplomacyVisualKey | 'none' {
    if (this.planet?.info.ownerPlayerType === PlayerType.NEUTRAL) {
      return 'none';
    }

    const status = this.diplomacyStatusForOwner(this.planet?.info.ownerId ?? null);
    return status ? diplomacyVisualKey(status) : 'none';
  }

  protected openPlanetView(): void {
    if (!this.planet || !this.canViewPlanet()) {
      return;
    }

    void this.router.navigate(['/game/planet'], {
      queryParams: {
        x: this.planet.coordinates.x,
        y: this.planet.coordinates.y,
        z: this.planet.coordinates.z,
      },
    });
  }

  protected canUseAsMissionOrigin(): boolean {
    return this.planet?.info.isOwnedByViewer === true;
  }

  protected showSpyAction(): boolean {
    return !!this.planet && !this.planet.info.isOwnedByViewer;
  }

  protected openMissionPlannerAsOrigin(): void {
    if (!this.planet || !this.canUseAsMissionOrigin()) {
      return;
    }

    void this.router.navigate(['/game/mission-planner'], {
      queryParams: {
        originX: this.planet.coordinates.x,
        originY: this.planet.coordinates.y,
        originZ: this.planet.coordinates.z,
      },
    });
  }

  protected openMissionPlannerAsTarget(): void {
    if (!this.planet) {
      return;
    }

    void this.router.navigate(['/game/mission-planner'], {
      queryParams: {
        targetX: this.planet.coordinates.x,
        targetY: this.planet.coordinates.y,
        targetZ: this.planet.coordinates.z,
      },
    });
  }

  protected openSpyDialog(): void {
    if (!this.showSpyAction()) {
      return;
    }

    this.spyLaunchNotice = null;
    this.isSpyDialogOpen = true;
  }

  protected closeSpyDialog(): void {
    this.isSpyDialogOpen = false;
  }

  protected handleSpyMissionLaunched(event: { message: string }): void {
    this.spyLaunchNotice = event.message;
    this.isSpyDialogOpen = false;
  }

  protected emitChooseAsOrigin(): void {
    if (!this.planet) {
      return;
    }

    this.chooseAsOrigin.emit(this.planet);
  }

  protected emitChooseAsTarget(): void {
    if (!this.planet) {
      return;
    }

    this.chooseAsTarget.emit(this.planet);
  }

  protected emitSensorPhalanxScan(): void {
    if (!this.planet || !this.showSensorPhalanxAction) {
      return;
    }

    this.sensorPhalanxScan.emit(this.planet);
  }

  private buildTags(): MiniPlanetTagVm[] {
    if (!this.planet) {
      return [];
    }

    const tags: MiniPlanetTagVm[] = [
      {
        label: this.i18n.t('generated.miniPlanet.tags.basicInfo'),
        tooltip: this.buildBasicInfoTooltip(this.planet),
      },
    ];

    const report = this.planet.reportData;
    if (!report) {
      return tags;
    }

    tags.push({
      label: this.i18n.t('generated.miniPlanet.tags.planetParameters'),
      tooltip: this.buildPlanetParametersTooltip(report),
    });

    const resourcesTag = this.buildResourcesTag(report);
    if (resourcesTag) {
      tags.push(resourcesTag);
    }

    const debrisTag = this.buildDebrisTag(report);
    if (debrisTag) {
      tags.push(debrisTag);
    }

    const defencesTag = this.buildDefencesTag(report);
    if (defencesTag) {
      tags.push(defencesTag);
    }

    const shipsTag = this.buildShipsTag(report);
    if (shipsTag) {
      tags.push(shipsTag);
    }

    const buildingsTag = this.buildBuildingsTag(report);
    if (buildingsTag) {
      tags.push(buildingsTag);
    }

    const technologyTag = this.buildTechnologyTag(report);
    if (technologyTag) {
      tags.push(technologyTag);
    }

    const queuesTag = this.buildQueuesTag(report);
    if (queuesTag) {
      tags.push(queuesTag);
    }

    return tags;
  }

  private diplomacyStatusForOwner(ownerId: number | null): DiplomaticStatus | null {
    if (ownerId === null) {
      return null;
    }

    const viewerId = this.viewerPlayerId(this.playerSession.load());
    if (viewerId === null) {
      return null;
    }

    return this.gameState.diplomacyResolver().getStatus(viewerId, ownerId);
  }

  private viewerPlayerId(session: PlayerSession | null): number | null {
    if (!session) {
      return this.planet?.info.isOwnedByViewer === true ? this.planet.info.ownerId : null;
    }

    if (Number.isInteger(session.playerId)) {
      return session.playerId ?? null;
    }

    if (this.planet?.info.isOwnedByViewer === true) {
      return this.planet.info.ownerId;
    }

    return session.id;
  }

  private buildBasicInfoTooltip(planet: ClientPlanetDto): string {
    return [
      `${this.i18n.t('generated.miniPlanet.rows.name')}: ${planet.basicInfo.name}`,
      `${this.i18n.t('generated.miniPlanet.rows.order')}: ${planet.basicInfo.order}`,
      `${this.i18n.t('generated.miniPlanet.rows.type')}: ${planet.basicInfo.type}`,
      `${this.i18n.t('generated.miniPlanet.rows.size')}: ${planet.basicInfo.size}`,
      `${this.i18n.t('generated.miniPlanet.rows.colonizationDifficulty')}: ${planet.basicInfo.colonizationDifficulty}`,
    ].join('\n');
  }

  private buildPlanetParametersTooltip(report: ClientReportDataDto): string {
    const parameters = report.planetaryParameters;
    return [
      `${this.i18n.t('generated.miniPlanet.rows.metal')}: ${parameters.metalModifier}`,
      `${this.i18n.t('generated.miniPlanet.rows.crystal')}: ${parameters.crystalModifier}`,
      `${this.i18n.t('generated.miniPlanet.rows.deuterium')}: ${parameters.deuteriumModifier}`,
      `${this.i18n.t('generated.miniPlanet.rows.energyRes')}: ${parameters.energyModifierRES}`,
      `${this.i18n.t('generated.miniPlanet.rows.energyNuclear')}: ${parameters.energyModifierNuclear}`,
      `${this.i18n.t('generated.miniPlanet.rows.science')}: ${parameters.scienceModifier}`,
      `${this.i18n.t('generated.miniPlanet.rows.industry')}: ${parameters.industryModifier}`,
      `${this.i18n.t('generated.miniPlanet.rows.anomaliesAndNoise')}: ${parameters.anomaliesAndNoise}`,
      `${this.i18n.t('generated.miniPlanet.rows.hyperspace')}: ${parameters.hyperspaceParameters}`,
    ].join('\n');
  }

  private buildResourcesTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const resources = report.resourcesAmount;
    const hasDetailedResources =
      resources.metal > 0 || resources.crystal > 0 || resources.deuterium > 0;
    const hasAverageResources = report.averageTotalResources > 0;

    if (!hasDetailedResources && !hasAverageResources) {
      return null;
    }

    const tooltip = hasDetailedResources
      ? `${this.i18n.t('generated.miniPlanet.rows.metal')}: ${resources.metal}, ` +
        `${this.i18n.t('generated.miniPlanet.rows.crystal')}: ${resources.crystal}, ` +
        `${this.i18n.t('generated.miniPlanet.rows.deuterium')}: ${resources.deuterium}`
      : `${this.i18n.t('generated.miniPlanet.rows.averageTotalResources')}: ${report.averageTotalResources}`;

    return {
      label: this.i18n.t('generated.miniPlanet.tags.resources'),
      tooltip,
    };
  }

  private buildDebrisTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const debris = report.spaceDebrisAmount;
    const hasDebris = debris.metal > 0 || debris.crystal > 0 || debris.deuterium > 0;
    if (!hasDebris) {
      return null;
    }

    return {
      label: this.i18n.t('generated.miniPlanet.tags.debris'),
      tooltip:
        `${this.i18n.t('generated.miniPlanet.rows.metal')}: ${debris.metal}, ` +
        `${this.i18n.t('generated.miniPlanet.rows.crystal')}: ${debris.crystal}, ` +
        `${this.i18n.t('generated.miniPlanet.rows.deuterium')}: ${debris.deuterium}`,
    };
  }

  private buildBuildingsTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasDetailedBuildings = report.buildingsLevels.length > 0;
    const hasAverageBuildings = report.averageBuildingLevel > 0;
    if (!hasDetailedBuildings && !hasAverageBuildings) {
      return null;
    }

    if (!hasDetailedBuildings) {
      return {
        label: this.i18n.t('generated.miniPlanet.tags.buildings'),
        tooltip: `${this.i18n.t('generated.miniPlanet.rows.averageBuildingLevel')}: ${report.averageBuildingLevel}`,
      };
    }

    const details = report.buildingsLevels
      .map((entry) => `${entry.type}: ${entry.level}`)
      .join('\n');

    const tooltip = hasAverageBuildings
      ? `${this.i18n.t('generated.miniPlanet.rows.averageBuildingLevel')}: ${report.averageBuildingLevel}\n${details}`
      : details;

    return {
      label: this.i18n.t('generated.miniPlanet.tags.buildings'),
      tooltip,
    };
  }

  private buildTechnologyTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasDetailedTech = report.techLevels.length > 0;
    const hasAverageTech = report.averageTechLevel > 0;
    if (!hasDetailedTech && !hasAverageTech) {
      return null;
    }

    if (!hasDetailedTech) {
      return {
        label: this.i18n.t('generated.miniPlanet.tags.technology'),
        tooltip: `${this.i18n.t('generated.miniPlanet.rows.averageTechnologyLevel')}: ${report.averageTechLevel}`,
      };
    }

    const details = report.techLevels.map((entry) => `${entry.type}: ${entry.level}`).join('\n');

    const tooltip = hasAverageTech
      ? `${this.i18n.t('generated.miniPlanet.rows.averageTechnologyLevel')}: ${report.averageTechLevel}\n${details}`
      : details;

    return {
      label: this.i18n.t('generated.miniPlanet.tags.technology'),
      tooltip,
    };
  }

  private buildDefencesTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasDetailedDefences = report.defences.length > 0;
    const hasTotalDefences = report.totalDefencesAmount > 0;
    if (!hasDetailedDefences && !hasTotalDefences) {
      return null;
    }

    const tooltip = hasTotalDefences
      ? `${this.i18n.t('generated.miniPlanet.rows.totalDefences')}: ${report.totalDefencesAmount}`
      : `${this.i18n.t('generated.miniPlanet.rows.defenceEntries')}: ${report.defences.length}`;

    return {
      label: this.i18n.t('generated.miniPlanet.tags.defences'),
      tooltip,
    };
  }

  private buildShipsTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasDetailedShips = report.ships.length > 0;
    const hasTotalShips = report.totalShipsAmount > 0;
    if (!hasDetailedShips && !hasTotalShips) {
      return null;
    }

    let tooltip = hasTotalShips
      ? `${this.i18n.t('generated.miniPlanet.rows.totalShips')}: ${report.totalShipsAmount}`
      : `${this.i18n.t('generated.miniPlanet.rows.shipEntries')}: ${report.ships.length}`;

    if (hasDetailedShips) {
      const sortedDetails = [...report.ships]
        .sort((left, right) => right.amount - left.amount || left.type.localeCompare(right.type))
        .map((entry) => `${entry.type}: ${entry.amount}`)
        .join('\n');
      const totalFromDetails = report.ships.reduce((sum, entry) => sum + entry.amount, 0);
      const totalLabel = hasTotalShips ? report.totalShipsAmount : totalFromDetails;

      tooltip = `${this.i18n.t('generated.miniPlanet.rows.totalShips')}: ${totalLabel}\n${sortedDetails}`;
    }

    return {
      label: this.i18n.t('generated.miniPlanet.tags.ships'),
      tooltip,
    };
  }

  private buildQueuesTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasAnyQueueData =
      this.hasQueueData(report.shipyardProduction) ||
      this.hasQueueData(report.defencesProduction) ||
      this.hasQueueData(report.researchProduction) ||
      this.hasQueueData(report.buildingProduction);

    if (!hasAnyQueueData) {
      return null;
    }

    return {
      label: this.i18n.t('generated.miniPlanet.tags.queues'),
      tooltip: [
        `${this.i18n.t('generated.miniPlanet.rows.shipyard')}: ${this.formatQueue(report.shipyardProduction)}`,
        `${this.i18n.t('generated.miniPlanet.rows.defencesQueue')}: ${this.formatQueue(report.defencesProduction)}`,
        `${this.i18n.t('generated.miniPlanet.rows.research')}: ${this.formatQueue(report.researchProduction)}`,
        `${this.i18n.t('generated.miniPlanet.rows.buildingsQueue')}: ${this.formatQueue(report.buildingProduction)}`,
      ].join('\n'),
    };
  }

  private hasQueueData(queue: object | null | undefined): boolean {
    if (!queue) {
      return false;
    }

    return Object.keys(queue).length > 0;
  }

  private formatQueue(queue: object | null | undefined): string {
    if (!queue) {
      return this.i18n.t('generated.miniPlanet.rows.empty');
    }

    const keys = Object.keys(queue);
    if (keys.length === 0) {
      return this.i18n.t('generated.miniPlanet.rows.empty');
    }

    return JSON.stringify(queue);
  }

  private localizedDiplomaticStatus(status: DiplomaticStatus): string {
    return this.i18n.t(`communications.shared.diplomaticStatuses.${status}`);
  }

  private ownerLabel(ownerName: string, status: DiplomaticStatus | null): string {
    return status ? `${ownerName} (${this.localizedDiplomaticStatus(status)})` : ownerName;
  }
}
