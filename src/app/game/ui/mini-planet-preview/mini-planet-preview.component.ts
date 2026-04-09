import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Router } from '@angular/router';
import type { ClientPlanetDto, ClientReportDataDto } from '../../../models/game-api-types';
import { PlayerType } from '../../../models/enums/player-type';
import { PlanetImageHelper } from '../../../models/planets/planet-image-helper';
import { SpyLaunchDialogComponent } from '../spy-launch-dialog/spy-launch-dialog.component';

type MiniPlanetTagVm = {
  label: string;
  tooltip: string;
};

@Component({
  selector: 'app-mini-planet-preview',
  imports: [SpyLaunchDialogComponent],
  templateUrl: './mini-planet-preview.component.html'
})
export class MiniPlanetPreviewComponent implements OnChanges {
  @Input() planet: ClientPlanetDto | null = null;
  @Input() showDefaultActions = true;
  @Input() showSelectionActions = false;
  @Input() isSelected = false;
  @Output() chooseAsOrigin = new EventEmitter<ClientPlanetDto>();
  @Output() chooseAsTarget = new EventEmitter<ClientPlanetDto>();

  protected tags: MiniPlanetTagVm[] = [];
  protected isSpyDialogOpen = false;
  protected spyLaunchNotice: string | null = null;

  constructor(private readonly router: Router) {}

  public ngOnChanges(): void {
    this.tags = this.buildTags();
  }

  protected planetNameLabel(): string {
    return this.planet?.basicInfo.name ?? 'Unknown planet';
  }

  protected planetImagePath(): string | null {
    if (!this.planet) {
      return null;
    }

    return PlanetImageHelper.getPlanetImage(
      this.planet.basicInfo.type,
      this.planet.basicInfo.size,
      'small'
    );
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
    return this.planet?.reportData !== null;
  }

  protected ownershipLabel(): string {
    if (!this.planet || this.planet.reportData === null) {
      return 'Owned by: NO DATA';
    }

    if (this.planet.info.ownerId !== null) {
      return `Owned by: ${this.planet.info.ownerPlayerName ?? 'UNKNOWN'}`;
    }

    if (this.planet.info.ownerPlayerType === PlayerType.NEUTRAL) {
      return 'Owned by: NEUTRAL';
    }

    if (this.planet.info.ownerPlayerName) {
      return `Owned by: ${this.planet.info.ownerPlayerName}`;
    }

    return 'Owned by: FREE';
  }

  protected isNoDataPlanet(): boolean {
    return this.planet?.reportData === null;
  }

  protected isPlayerOwnedPlanet(): boolean {
    return !this.isNoDataPlanet() && this.planet?.info.ownerId !== null;
  }

  protected isNeutralOwnedPlanet(): boolean {
    return !this.isNoDataPlanet()
      && this.planet?.info.ownerId === null
      && this.planet?.info.ownerPlayerType === PlayerType.NEUTRAL;
  }

  protected isHumanOwnedPlanet(): boolean {
    return !this.isNoDataPlanet()
      && this.planet?.info.ownerId === null
      && this.planet?.info.ownerPlayerType === PlayerType.PLAYER;
  }

  protected isBotOwnedPlanet(): boolean {
    return !this.isNoDataPlanet()
      && this.planet?.info.ownerId === null
      && this.planet?.info.ownerPlayerType === PlayerType.BOT;
  }

  protected openPlanetView(): void {
    if (!this.planet || !this.canViewPlanet()) {
      return;
    }

    void this.router.navigate(
      ['/game/planet'],
      {
        queryParams: {
          x: this.planet.coordinates.x,
          y: this.planet.coordinates.y,
          z: this.planet.coordinates.z
        }
      }
    );
  }

  protected canUseAsMissionOrigin(): boolean {
    return this.planet?.info.ownerId !== null;
  }

  protected showSpyAction(): boolean {
    return !!this.planet && this.planet.info.ownerId === null;
  }

  protected openMissionPlannerAsOrigin(): void {
    if (!this.planet || !this.canUseAsMissionOrigin()) {
      return;
    }

    void this.router.navigate(
      ['/game/mission-planner'],
      {
        queryParams: {
          originX: this.planet.coordinates.x,
          originY: this.planet.coordinates.y,
          originZ: this.planet.coordinates.z
        }
      }
    );
  }

  protected openMissionPlannerAsTarget(): void {
    if (!this.planet) {
      return;
    }

    void this.router.navigate(
      ['/game/mission-planner'],
      {
        queryParams: {
          targetX: this.planet.coordinates.x,
          targetY: this.planet.coordinates.y,
          targetZ: this.planet.coordinates.z
        }
      }
    );
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

  private buildTags(): MiniPlanetTagVm[] {
    if (!this.planet) {
      return [];
    }

    const tags: MiniPlanetTagVm[] = [
      {
        label: 'Basic Info',
        tooltip: this.buildBasicInfoTooltip(this.planet)
      }
    ];

    const report = this.planet.reportData;
    if (!report) {
      return tags;
    }

    tags.push({
      label: 'Planet Parameters',
      tooltip: this.buildPlanetParametersTooltip(report)
    });

    const resourcesTag = this.buildResourcesTag(report);
    if (resourcesTag) {
      tags.push(resourcesTag);
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

  private buildBasicInfoTooltip(planet: ClientPlanetDto): string {
    return [
      `Name: ${planet.basicInfo.name}`,
      `Order: ${planet.basicInfo.order}`,
      `Type: ${planet.basicInfo.type}`,
      `Size: ${planet.basicInfo.size}`,
      `Colonization difficulty: ${planet.basicInfo.colonizationDifficulty}`
    ].join('\n');
  }

  private buildPlanetParametersTooltip(report: ClientReportDataDto): string {
    const parameters = report.planetaryParameters;
    return [
      `Metal: ${parameters.metalModifier}`,
      `Crystal: ${parameters.crystalModifier}`,
      `Deuterium: ${parameters.deuteriumModifier}`,
      `Energy (RES): ${parameters.energyModifierRES}`,
      `Energy (Nuclear): ${parameters.energyModifierNuclear}`,
      `Science: ${parameters.scienceModifier}`,
      `Industry: ${parameters.industryModifier}`,
      `Anomalies/Noise: ${parameters.anomaliesAndNoise}`,
      `Hyperspace: ${parameters.hyperspaceParameters}`
    ].join('\n');
  }

  private buildResourcesTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const resources = report.resourcesAmount;
    const hasDetailedResources = resources.metal > 0 || resources.crystal > 0 || resources.deuterium > 0;
    const hasAverageResources = report.averageTotalResources > 0;

    if (!hasDetailedResources && !hasAverageResources) {
      return null;
    }

    const tooltip = hasDetailedResources
      ? `Metal: ${resources.metal}, Crystal: ${resources.crystal}, Deuterium: ${resources.deuterium}`
      : `Average total resources: ${report.averageTotalResources}`;

    return {
      label: 'Resources',
      tooltip
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
        label: 'Buildings',
        tooltip: `Average building Level: ${report.averageBuildingLevel}`
      };
    }

    const details = report.buildingsLevels
      .map((entry) => `${entry.type}: ${entry.level}`)
      .join('\n');

    const tooltip = hasAverageBuildings
      ? `Average building Level: ${report.averageBuildingLevel}\n${details}`
      : details;

    return {
      label: 'Buildings',
      tooltip
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
        label: 'Technology',
        tooltip: `Average technology Level: ${report.averageTechLevel}`
      };
    }

    const details = report.techLevels
      .map((entry) => `${entry.type}: ${entry.level}`)
      .join('\n');

    const tooltip = hasAverageTech
      ? `Average technology Level: ${report.averageTechLevel}\n${details}`
      : details;

    return {
      label: 'Technology',
      tooltip
    };
  }

  private buildDefencesTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasDetailedDefences = report.defences.length > 0;
    const hasTotalDefences = report.totalDefencesAmount > 0;
    if (!hasDetailedDefences && !hasTotalDefences) {
      return null;
    }

    const tooltip = hasTotalDefences
      ? `Total defences: ${report.totalDefencesAmount}`
      : `Defence entries: ${report.defences.length}`;

    return {
      label: 'Defences',
      tooltip
    };
  }

  private buildShipsTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasDetailedShips = report.ships.length > 0;
    const hasTotalShips = report.totalShipsAmount > 0;
    if (!hasDetailedShips && !hasTotalShips) {
      return null;
    }

    let tooltip = hasTotalShips
      ? `Total ships: ${report.totalShipsAmount}`
      : `Ship entries: ${report.ships.length}`;

    if (hasDetailedShips) {
      const sortedDetails = [...report.ships]
        .sort((left, right) => right.amount - left.amount || left.type.localeCompare(right.type))
        .map((entry) => `${entry.type}: ${entry.amount}`)
        .join('\n');
      const totalFromDetails = report.ships.reduce((sum, entry) => sum + entry.amount, 0);
      const totalLabel = hasTotalShips ? report.totalShipsAmount : totalFromDetails;

      tooltip = `Total ships: ${totalLabel}\n${sortedDetails}`;
    }

    return {
      label: 'Ships',
      tooltip
    };
  }

  private buildQueuesTag(report: ClientReportDataDto): MiniPlanetTagVm | null {
    const hasAnyQueueData = this.hasQueueData(report.shipyardProduction)
      || this.hasQueueData(report.defencesProduction)
      || this.hasQueueData(report.researchProduction)
      || this.hasQueueData(report.buildingProduction);

    if (!hasAnyQueueData) {
      return null;
    }

    return {
      label: 'Queues',
      tooltip: [
        `Shipyard: ${this.formatQueue(report.shipyardProduction)}`,
        `Defences: ${this.formatQueue(report.defencesProduction)}`,
        `Research: ${this.formatQueue(report.researchProduction)}`,
        `Buildings: ${this.formatQueue(report.buildingProduction)}`
      ].join('\n')
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
      return 'Empty';
    }

    const keys = Object.keys(queue);
    if (keys.length === 0) {
      return 'Empty';
    }

    return JSON.stringify(queue);
  }
}
