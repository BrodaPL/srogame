import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { BuildingBlueprintsFactory } from '../factories/building-blueprints.factory';
import { Building } from '../models/buildings/building';
import { toRawImagePath } from './encyclopedia-image-paths';

@Component({
  selector: 'app-encyclopedia-buildings',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent],
  templateUrl: './encyclopedia-buildings.component.html'
})
export class EncyclopediaBuildingsComponent {
  readonly buildings = this.loadBuildings();
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;

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

  private loadBuildings(): Building[] {
    const blueprints = BuildingBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.buildingsMap.values());
  }
}
