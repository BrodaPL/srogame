import { NgFor, NgIf } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { ShipBlueprintsFactory } from '../factories/ship-blueprints.factory';
import { ShipPurpose } from '../models/enums/ship-purpose';
import { Ship } from '../models/fleets/ship';
import { toRawImagePath } from './encyclopedia-image-paths';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';

@Component({
  selector: 'app-encyclopedia-ships',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent, TooltipDirective, I18nPipe],
  templateUrl: './encyclopedia-ships.component.html'
})
export class EncyclopediaShipsComponent {
  readonly ships = this.loadShips();
  protected readonly shipPurpose = ShipPurpose;
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;
  private readonly i18n = inject(I18nService);

  protected purposeLabels(ship: Ship): ShipPurpose[] {
    return Array.from(ship.purposes.values());
  }

  protected openImageDialog(ship: Ship): void {
    this.selectedImage = {
      title: ship.getName(),
      previewImagePath: ship.imagePath,
      rawImagePath: toRawImagePath(ship.imagePath)
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
      ? this.i18n.t('encyclopedia.shared.counts.shipsOne', { count })
      : this.i18n.t('encyclopedia.shared.counts.shipsMany', { count });
  }

  private loadShips(): Ship[] {
    const blueprints = ShipBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.shipsMap.values());
  }
}
