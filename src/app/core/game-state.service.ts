import { Injectable } from '@angular/core';
import { GalaxySnapshot } from '../models/game-api-types';

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  public galaxy: GalaxySnapshot | null = null;

  public setGalaxy(galaxy: GalaxySnapshot): void {
    this.galaxy = galaxy;
  }

  public clearGalaxy(): void {
    this.galaxy = null;
  }
}
