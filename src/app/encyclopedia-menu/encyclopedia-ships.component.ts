import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { ShipBlueprintsFactory } from '../factories/ship-blueprints.factory';
import { ShipPurpose } from '../models/enums/ship-purpose';
import { Ship } from '../models/fleets/ship';
import { toRawImagePath } from './encyclopedia-image-paths';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-encyclopedia-ships',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent, TooltipDirective],
  templateUrl: './encyclopedia-ships.component.html'
})
export class EncyclopediaShipsComponent {
  readonly ships = this.loadShips();
  protected readonly shipPurpose = ShipPurpose;
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;

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

  private loadShips(): Ship[] {
    const blueprints = ShipBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.shipsMap.values());
  }
}
