import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { DefenceBlueprintsFactory } from '../factories/defence-blueprints.factory';
import { Defence } from '../models/defences/defence';
import { HullClass } from '../models/enums/hull-class';
import { toRawImagePath } from './encyclopedia-image-paths';

@Component({
  selector: 'app-encyclopedia-defences',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent],
  templateUrl: './encyclopedia-defences.component.html'
})
export class EncyclopediaDefencesComponent {
  readonly HullClass = HullClass;
  readonly defences = this.loadDefences();
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;

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

  private loadDefences(): Defence[] {
    const blueprints = DefenceBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.defencesMap.values());
  }
}
