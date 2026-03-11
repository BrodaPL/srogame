import { NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipBlueprintsFactory } from '../factories/ship-blueprints.factory';
import { ShipPurpose } from '../models/enums/ship-purpose';
import { Ship } from '../models/fleets/ship';

@Component({
  selector: 'app-encyclopedia-ships',
  imports: [NgFor, NgIf, RouterLink],
  templateUrl: './encyclopedia-ships.component.html'
})
export class EncyclopediaShipsComponent {
  readonly ships = this.loadShips();
  protected readonly shipPurpose = ShipPurpose;

  protected purposeLabels(ship: Ship): ShipPurpose[] {
    return Array.from(ship.purposes.values());
  }

  private loadShips(): Ship[] {
    const blueprints = ShipBlueprintsFactory.fromDefaultJson();
    return Array.from(blueprints.shipsMap.values());
  }
}
