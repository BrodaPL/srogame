import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DefenceBlueprintsFactory } from '../factories/defence-blueprints.factory';
import { Defence } from '../models/defences/defence';

@Component({
  selector: 'app-encyclopedia-defences',
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './encyclopedia-defences.component.html'
})
export class EncyclopediaDefencesComponent {
  readonly defences = this.loadDefences();

  private loadDefences(): Defence[] {
    const blueprints = DefenceBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.defencesMap.values());
  }
}
