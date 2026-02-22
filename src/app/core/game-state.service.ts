import { Injectable } from '@angular/core';
import { Galaxy } from '../models/galaxy';

@Injectable({
  providedIn: 'root'
})
export class GameStateService {
  public galaxy: Galaxy | null = null;

  public setGalaxy(galaxy: Galaxy): void {
    this.galaxy = galaxy;
  }

  public clearGalaxy(): void {
    this.galaxy = null;
  }
}
