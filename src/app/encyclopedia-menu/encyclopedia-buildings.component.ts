import { NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { BuildingBlueprintsFactory } from '../factories/building-blueprints.factory';
import { Building } from '../models/buildings/building';
import { buildingProductionLabel } from '../models/buildings/building-production-label';
import { toRawImagePath } from './encyclopedia-image-paths';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';

@Component({
  selector: 'app-encyclopedia-buildings',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent, TooltipDirective, I18nPipe],
  templateUrl: './encyclopedia-buildings.component.html'
})
export class EncyclopediaBuildingsComponent {
  readonly buildings = this.loadBuildings();
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;
  private readonly i18n = inject(I18nService);

  protected openImageDialog(building: Building): void {
    this.selectedImage = {
      title: building.type,
      previewImagePath: building.imagePath,
      rawImagePath: toRawImagePath(building.imagePath)
    };
  }

  protected closeImageDialog(): void {
    this.selectedImage = null;
  }

  protected buildingProductionLabel(building: Building): string {
    return buildingProductionLabel(building.type);
  }

  protected largeImageTooltip(title: string): string {
    return this.i18n.t('encyclopedia.shared.tooltips.openLargeImage', { title });
  }

  protected itemCountLabel(count: number): string {
    return count === 1
      ? this.i18n.t('encyclopedia.shared.counts.buildingsOne', { count })
      : this.i18n.t('encyclopedia.shared.counts.buildingsMany', { count });
  }

  private loadBuildings(): Building[] {
    const blueprints = BuildingBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.buildingsMap.values());
  }
}
