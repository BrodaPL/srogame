import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EncyclopediaImageDialogComponent } from './encyclopedia-image-dialog.component';
import { TechnologyBlueprintsFactory } from '../factories/technology-blueprints.factory';
import { Technology } from '../models/tech/technology';
import { toRawImagePath } from './encyclopedia-image-paths';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-encyclopedia-technologies',
  imports: [NgFor, NgIf, RouterLink, EncyclopediaImageDialogComponent, TooltipDirective],
  templateUrl: './encyclopedia-technologies.component.html'
})
export class EncyclopediaTechnologiesComponent {
  readonly technologies = this.loadTechnologies();
  protected selectedImage: { title: string; previewImagePath: string; rawImagePath: string } | null = null;

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

  private loadTechnologies(): Technology[] {
    const blueprints = TechnologyBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.techByType.values());
  }
}
