import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

type GameSetup = {
  playerName: string;
  startingMetal: number;
  startingCrystal: number;
  startingDeuterium: number;
};

type GameSetupForm = {
  playerName: string;
  startingMetal: string;
  startingCrystal: string;
  startingDeuterium: string;
};

@Component({
  selector: 'app-setup',
  imports: [FormsModule],
  templateUrl: './setup.component.html',
  styleUrl: './setup.component.css'
})
export class SetupComponent {
  protected readonly savedConfig = signal<GameSetup | null>(null);
  protected form: GameSetupForm = {
    playerName: '',
    startingMetal: '',
    startingCrystal: '',
    startingDeuterium: ''
  };

  constructor(private readonly router: Router) {
    const stored = localStorage.getItem('srogame:setup');
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored) as GameSetup;
      if (this.isValidConfig(parsed)) {
        this.savedConfig.set(parsed);
        this.form = {
          playerName: parsed.playerName,
          startingMetal: String(parsed.startingMetal),
          startingCrystal: String(parsed.startingCrystal),
          startingDeuterium: String(parsed.startingDeuterium)
        };
      }
    } catch {
      localStorage.removeItem('srogame:setup');
    }
  }

  protected canStart(): boolean {
    const name = this.form.playerName.trim();
    const metal = this.parseResource(this.form.startingMetal);
    const crystal = this.parseResource(this.form.startingCrystal);
    const deuterium = this.parseResource(this.form.startingDeuterium);

    return Boolean(name) && metal !== null && crystal !== null && deuterium !== null;
  }

  protected startGame(): void {
    if (!this.canStart()) {
      return;
    }

    const config: GameSetup = {
      playerName: this.form.playerName.trim(),
      startingMetal: Number(this.form.startingMetal),
      startingCrystal: Number(this.form.startingCrystal),
      startingDeuterium: Number(this.form.startingDeuterium)
    };

    localStorage.setItem('srogame:setup', JSON.stringify(config));
    this.savedConfig.set(config);
    this.router.navigate(['/game']);
  }

  private parseResource(value: string): number | null {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }

    return parsed;
  }

  private isValidConfig(config: GameSetup): boolean {
    return (
      typeof config.playerName === 'string' &&
      config.playerName.trim().length > 0 &&
      Number.isFinite(config.startingMetal) &&
      config.startingMetal >= 0 &&
      Number.isFinite(config.startingCrystal) &&
      config.startingCrystal >= 0 &&
      Number.isFinite(config.startingDeuterium) &&
      config.startingDeuterium >= 0
    );
  }
}
