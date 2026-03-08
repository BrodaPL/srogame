import { Component, Input } from '@angular/core';
import type { Planet } from '../../../models/planets/planet';
import type { EspionageReportData } from '../../../models/reports/espionage-report-data';
import type { PlanetaryParameters } from '../../../models/planets/planetary-parameters';
import type { ResourcesPack } from '../../../models/resources-pack';

@Component({
  selector: 'app-planet-data',
  templateUrl: './planet-data.component.html'
})
export class PlanetDataComponent {
  @Input() planet: Planet | null = null;
  @Input() report: EspionageReportData | null = null;
  @Input() ownerName: string | null = null;
  @Input() planetImagePath: string | null = null;

  protected ownerLabel(): string {
    return this.ownerName ?? 'Unknown owner';
  }

  protected planetNameLabel(): string {
    return this.planet?.basicInfo.name ?? 'Unknown planet';
  }

  protected planetSizeLabel(): string {
    if (!this.planet) {
      return 'Size: --';
    }

    return `Size: ${this.planet.basicInfo.size}`;
  }

  protected planetTypeLabel(): string {
    return `Type: ${this.planet?.basicInfo.type ?? '--'}`;
  }

  protected planetaryParametersTooltip(): string {
    const parameters = this.report?.planetaryParameters ?? this.planet?.info.planetaryParameters;
    if (!parameters) {
      return 'No planetary parameters data.';
    }

    return this.formatPlanetaryParameters(parameters);
  }

  protected resourcesTooltip(): string {
    if (this.report) {
      const pieces: string[] = [];
      if (Number.isFinite(this.report.averageTotalResources)) {
        pieces.push(`Average total: ${this.report.averageTotalResources}`);
      }
      pieces.push(this.formatResourcesPack(this.report.resourcesAmount));
      return pieces.join('\n');
    }

    if (this.planet) {
      return this.formatResourcesPack(this.planet.rBDSFTQ.resources);
    }

    return 'No resources data.';
  }

  protected buildingsTooltip(): string {
    if (this.report) {
      const parts: string[] = [];
      if (Number.isFinite(this.report.averageBuildingLevel)) {
        parts.push(`Average level: ${this.report.averageBuildingLevel}`);
      }
      if (this.report.buildingsLevels?.size) {
        parts.push(this.formatLevelMap(this.report.buildingsLevels));
      }
      return parts.length ? parts.join('\n') : 'No building data.';
    }

    if (this.planet?.rBDSFTQ.buildingsLevels?.size) {
      return this.formatLevelMap(this.planet.rBDSFTQ.buildingsLevels);
    }

    return 'No building data.';
  }

  protected technologiesTooltip(): string {
    if (this.report) {
      const parts: string[] = [];
      if (Number.isFinite(this.report.averageTechLevel)) {
        parts.push(`Average level: ${this.report.averageTechLevel}`);
      }
      if (this.report.techLevels?.size) {
        parts.push(this.formatLevelMap(this.report.techLevels));
      }
      return parts.length ? parts.join('\n') : 'No technology data.';
    }

    return 'No technology data.';
  }

  protected defencesTooltip(): string {
    if (this.report) {
      if (Number.isFinite(this.report.totalDefencesAmount)) {
        return `Total defences: ${this.report.totalDefencesAmount}`;
      }
      if (this.report.defences?.length) {
        return `Defence entries: ${this.report.defences.length}`;
      }
    }

    return 'No defence data.';
  }

  protected shipsTooltip(): string {
    if (this.report) {
      if (Number.isFinite(this.report.totalShipsAmount)) {
        if (this.report.ships?.size) {
          return `Total ships: ${this.report.totalShipsAmount}\n${this.formatShipAmountMap(this.report.ships)}`;
        }

        return `Total ships: ${this.report.totalShipsAmount}`;
      }

      if (this.report.ships?.size) {
        return this.formatShipAmountMap(this.report.ships);
      }
    }

    return 'No ship data.';
  }

  protected queuesTooltip(): string {
    if (!this.report) {
      return 'No queue data.';
    }

    const parts = [
      `Shipyard: ${this.formatQueue(this.report.shipyardProduction)}`,
      `Defences: ${this.formatQueue(this.report.defencesProduction)}`,
      `Research: ${this.formatQueue(this.report.researchProduction)}`,
      `Buildings: ${this.formatQueue(this.report.buildingProduction)}`
    ];

    return parts.join('\n');
  }

  private formatPlanetaryParameters(parameters: PlanetaryParameters): string {
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

  private formatResourcesPack(pack: ResourcesPack | null | undefined): string {
    if (!pack) {
      return 'No resources data.';
    }

    return `Metal: ${pack.metal}, Crystal: ${pack.crystal}, Deuterium: ${pack.deuterium}`;
  }

  private formatLevelMap(levels: Map<unknown, number>): string {
    if (!levels || levels.size === 0) {
      return 'No levels available.';
    }

    const rows: string[] = [];
    for (const [key, value] of levels.entries()) {
      rows.push(`${String(key)}: ${value}`);
    }

    return rows.join('\n');
  }

  private formatShipAmountMap(shipAmounts: Map<unknown, number>): string {
    if (!shipAmounts || shipAmounts.size === 0) {
      return 'No ship data.';
    }

    const rows: Array<{ type: string; amount: number }> = [];
    for (const [type, amount] of shipAmounts.entries()) {
      rows.push({ type: String(type), amount });
    }

    rows.sort((left, right) => right.amount - left.amount || left.type.localeCompare(right.type));
    return rows.map((row) => `${row.type}: ${row.amount}`).join('\n');
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


