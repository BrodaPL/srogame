import { NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { TechnologyBlueprintsFactory } from '../factories/technology-blueprints.factory';
import { Technology } from '../models/tech/technology';
import { toRawImagePath } from './encyclopedia-image-paths';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';

@Component({
  selector: 'app-encyclopedia-technologies',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent, TooltipDirective, I18nPipe],
  templateUrl: './encyclopedia-technologies.component.html'
})
export class EncyclopediaTechnologiesComponent {
  readonly technologies = this.loadTechnologies();
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;
  private readonly i18n = inject(I18nService);

  protected openImageDialog(technology: Technology): void {
    this.selectedImage = {
      title: technology.type,
      previewImagePath: technology.imagePath,
      rawImagePath: toRawImagePath(technology.imagePath)
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
      ? this.i18n.t('encyclopedia.shared.counts.technologiesOne', { count })
      : this.i18n.t('encyclopedia.shared.counts.technologiesMany', { count });
  }

  private loadTechnologies(): Technology[] {
    const blueprints = TechnologyBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.techByType.values());
  }
}
