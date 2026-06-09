import { NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { DefenceBlueprintsFactory } from '../factories/defence-blueprints.factory';
import { Defence } from '../models/defences/defence';
import { HullClass } from '../models/enums/hull-class';
import { toRawImagePath } from './encyclopedia-image-paths';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';

@Component({
  selector: 'app-encyclopedia-defences',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent, TooltipDirective, I18nPipe],
  templateUrl: './encyclopedia-defences.component.html'
})
export class EncyclopediaDefencesComponent {
  readonly HullClass = HullClass;
  readonly defences = this.loadDefences();
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;
  private readonly i18n = inject(I18nService);

  protected openImageDialog(defence: Defence): void {
    this.selectedImage = {
      title: defence.getName(),
      previewImagePath: defence.imagePath,
      rawImagePath: toRawImagePath(defence.imagePath)
    };
  }

  protected closeImageDialog(): void {
    this.selectedImage = null;
  }

  protected largeImageTooltip(title: string): string {
    return this.i18n.t('encyclopedia.shared.tooltips.openLargeImage', { title });
  }

  protected itemCountLabel(count: number): string {
    return count === 1
      ? this.i18n.t('encyclopedia.shared.counts.defencesOne', { count })
      : this.i18n.t('encyclopedia.shared.counts.defencesMany', { count });
  }

  protected defenceSubtitle(defence: Defence): string {
    if (defence.hullClass === HullClass.PLANETARY_BOMB) {
      return this.i18n.t('encyclopedia.defences.descriptions.planetaryBomb');
    }

    return defence.canShootToOrbit
      ? this.i18n.t('encyclopedia.defences.descriptions.orbitCapable')
      : this.i18n.t('encyclopedia.defences.descriptions.atmosphereOnly');
  }

  protected orbitFireLabel(defence: Defence): string {
    if (defence.hullClass === HullClass.PLANETARY_BOMB) {
      return this.i18n.t('encyclopedia.shared.labels.noInactive');
    }

    return defence.canShootToOrbit
      ? this.i18n.t('encyclopedia.shared.labels.yes')
      : this.i18n.t('encyclopedia.shared.labels.no');
  }

  private loadDefences(): Defence[] {
    const blueprints = DefenceBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.defencesMap.values());
  }
}
