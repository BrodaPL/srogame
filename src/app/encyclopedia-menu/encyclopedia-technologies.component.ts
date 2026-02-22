import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TechnologyBlueprintsFactory } from '../factories/technology-blueprints.factory';
import { Technology } from '../models/tech/technology';

@Component({
  selector: 'app-encyclopedia-technologies',
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './encyclopedia-technologies.component.html'
})
export class EncyclopediaTechnologiesComponent {
  readonly technologies = this.loadTechnologies();

  private loadTechnologies(): Technology[] {
    const blueprints = TechnologyBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.techByType.values());
  }
}
