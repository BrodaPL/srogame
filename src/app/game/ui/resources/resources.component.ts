import { Component, Input } from '@angular/core';

export type ResourceDisplay = {
  current?: number | null;
  productionPerTurn?: number | null;
  capacityPercent?: number | null;
};

@Component({
  selector: 'app-resources',
  templateUrl: './resources.component.html'
})
export class ResourcesComponent {
  @Input() viewName = '';
  @Input() metal: ResourceDisplay | null = null;
  @Input() crystal: ResourceDisplay | null = null;
  @Input() deuterium: ResourceDisplay | null = null;
  @Input() energy: ResourceDisplay | null = null;

  protected formatResource(resource: ResourceDisplay | null): string {
    if (!resource) {
      return '--';
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
}
