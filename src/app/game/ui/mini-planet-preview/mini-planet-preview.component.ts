import { Component, Input, OnChanges } from '@angular/core';
import type { ClientPlanetDto, ClientReportDataDto } from '../../../models/game-api-types';

type MiniPlanetTagVm = {
  label: string;
  tooltip: string;
};

@Component({
  selector: 'app-mini-planet-preview',
  templateUrl: './mini-planet-preview.component.html'
})
export class MiniPlanetPreviewComponent implements OnChanges {
  @Input() planet: ClientPlanetDto | null = null;

  protected tags: MiniPlanetTagVm[] = [];

  public ngOnChanges(): void {
    this.tags = this.buildTags();
  }

  protected planetNameLabel(): string {
    return this.planet?.basicInfo.name ?? 'Unknown planet';
  }

  protected planetImagePath(): string | null {
    const imagePath = this.planet?.basicInfo.image?.trim() ?? '';
    return imagePath ? imagePath : null;
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

    const tooltip = hasTotalShips
      ? `Total ships: ${report.totalShipsAmount}`
      : `Ship entries: ${report.ships.length}`;

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
