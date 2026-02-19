import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BuildingBlueprintsFactory } from '../factories/building-blueprints.factory';
import { Building } from '../models/building';

@Component({
  selector: 'app-encyclopedia-buildings',
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './encyclopedia-buildings.component.html'
})
export class EncyclopediaBuildingsComponent {
  readonly buildings = this.loadBuildings();

  private loadBuildings(): Building[] {
    const blueprints = BuildingBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.buildingsMap.values());
  }
}
