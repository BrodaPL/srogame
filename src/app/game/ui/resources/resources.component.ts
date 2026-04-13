import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type ResourceDisplay = {
  current?: number | null;
  productionPerTurn?: number | null;
  capacityPercent?: number | null;
  used?: number | null;
  available?: number | null;
};

export type PlanetPowersDisplay = {
  industryPower: number;
  droneIndustryPower?: number | null;
  totalIndustryPower?: number | null;
  shipyardPower: number;
  researchPower: number;
  industryPowerLimited: boolean;
  shipyardPowerLimited: boolean;
  researchPowerLimited: boolean;
  shipRepair?: number | null;
  industryRepair?: number | null;
  droneRepair?: number | null;
};

export type ResourceHeaderIndicator = {
  label: string;
  isCurrent: boolean;
  tone: 'safe' | 'neutral' | 'danger';
  queryParams: Record<string, string | number | boolean>;
  title?: string;
};

export type ResourceTitleLink = {
  label: string;
  routerLink: string;
  queryParams?: Record<string, string | number | boolean>;
  title?: string;
};

@Component({
  selector: 'app-resources',
  imports: [RouterLink],
  templateUrl: './resources.component.html'
})
export class ResourcesComponent {
  protected readonly resourceIcons = {
    metal: 'images/icons/normal/metal_big.png',
    crystal: 'images/icons/normal/crystal_big.png',
    deuterium: 'images/icons/normal/deuter_big.png',
    energy: 'images/icons/normal/energy_big.png',
    powers: 'images/icons/normal/industry_big.png'
  } as const;

  @Input() viewName = '';
  @Input() titlePrefix = '';
  @Input() titleLink: ResourceTitleLink | null = null;
  @Input() titleSuffix = '';
  @Input() headerIndicators: ResourceHeaderIndicator[] = [];
  @Input() metal: ResourceDisplay | null = null;
  @Input() crystal: ResourceDisplay | null = null;
  @Input() deuterium: ResourceDisplay | null = null;
  @Input() energy: ResourceDisplay | null = null;
  @Input() energyTooltip: string | null = null;
  @Input() powers: PlanetPowersDisplay | null = null;

  protected formatResource(resource: ResourceDisplay | null): string {
    if (!resource) {
      return '--';
    }

    if (resource.used !== null && resource.used !== undefined
      && resource.available !== null && resource.available !== undefined) {
      return `${resource.used}/${resource.available}`;
    }

    if (resource.current !== null && resource.current !== undefined) {
      return `${resource.current}`;
    }

    if (resource.productionPerTurn !== null && resource.productionPerTurn !== undefined) {
      const sign = resource.productionPerTurn >= 0 ? '+' : '';
      return `${sign}${resource.productionPerTurn} / turn`;
    }

    return '--';
  }

  protected formatCapacitySuffix(resource: ResourceDisplay | null): string {
    if (!resource || resource.capacityPercent === null || resource.capacityPercent === undefined) {
      return '';
    }

    return ` [${resource.capacityPercent}%]`;
  }

  protected formatCapacityIndicator(resource: ResourceDisplay | null): string | null {
    if (!resource || resource.capacityPercent === null || resource.capacityPercent === undefined) {
      return null;
    }

    return `[${resource.capacityPercent}%]`;
  }

  protected formatIncome(resource: ResourceDisplay | null): string | null {
    if (!resource || resource.productionPerTurn === null || resource.productionPerTurn === undefined) {
      return null;
    }

    const sign = resource.productionPerTurn >= 0 ? '+' : '';
    return `${sign}${resource.productionPerTurn} / turn`;
  }

  protected isEnergyOverloaded(resource: ResourceDisplay | null): boolean {
    const usagePercent = this.energyUsagePercent(resource);
    return usagePercent !== null && usagePercent > 100;
  }

  protected isEnergyAtHundred(resource: ResourceDisplay | null): boolean {
    const usagePercent = this.energyUsagePercent(resource);
    if (usagePercent === null || usagePercent > 100) {
      return false;
    }

    return Math.abs(usagePercent - 100) < 0.0001;
  }

  protected isEnergyNearLimit(resource: ResourceDisplay | null): boolean {
    const usagePercent = this.energyUsagePercent(resource);
    if (usagePercent === null || usagePercent > 100) {
      return false;
    }

    return usagePercent >= 90 && !this.isEnergyAtHundred(resource);
  }

  protected isEnergySafe(resource: ResourceDisplay | null): boolean {
    const usagePercent = this.energyUsagePercent(resource);
    if (usagePercent === null) {
      return false;
    }

    return usagePercent < 90;
  }

  protected energyOverloadLabel(resource: ResourceDisplay | null): string {
    return this.isEnergyOverloaded(resource) ? ' ! ' : '';
  }

  protected isStorageOverLimit(resource: ResourceDisplay | null): boolean {
    const percent = resource?.capacityPercent;
    return percent !== null && percent !== undefined && percent > 100;
  }

  protected isStorageNearLimit(resource: ResourceDisplay | null): boolean {
    const percent = resource?.capacityPercent;
    return percent !== null && percent !== undefined && percent > 75 && percent <= 100;
  }

  protected isStorageNormal(resource: ResourceDisplay | null): boolean {
    const percent = resource?.capacityPercent;
    return percent !== null && percent !== undefined && percent <= 75;
  }

  protected formatPower(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '--';
    }

    return `${Math.floor(value)}`;
  }

  private energyUsagePercent(resource: ResourceDisplay | null): number | null {
    if (!resource) {
      return null;
    }

    if (resource.used === null || resource.used === undefined) {
      return null;
    }

    if (resource.available === null || resource.available === undefined) {
      return null;
    }

    if (resource.available <= 0) {
      return resource.used > 0 ? Number.POSITIVE_INFINITY : 0;
    }

    return (resource.used / resource.available) * 100;
  }
}
