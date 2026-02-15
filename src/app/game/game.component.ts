import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type GameSetup = {
  playerName: string;
  startingMetal: number;
  startingCrystal: number;
  startingDeuterium: number;
};

@Component({
  selector: 'app-game',
  imports: [RouterLink],
  templateUrl: './game.component.html'
})
export class GameComponent {
  protected readonly config = this.loadConfig();

  private loadConfig(): GameSetup | null {
    const stored = localStorage.getItem('srogame:setup');
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored) as GameSetup;
      if (
        typeof parsed.playerName === 'string' &&
        parsed.playerName.trim().length > 0 &&
        Number.isFinite(parsed.startingMetal) &&
        Number.isFinite(parsed.startingCrystal) &&
        Number.isFinite(parsed.startingDeuterium)
      ) {
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
  }
}
