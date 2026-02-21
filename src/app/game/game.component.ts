import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type GalaxySetup = {
  galaxyName: string;
  galaxyWidth: number;
  galaxyHeight: number;
  galaxyCenterSize: number;
  voidChance: number;
  starsAmountModifier: [number, number];
  playerAmount: number;
  botsAmount: number;
  botDifficulty: number;
  neutralBotsAmount: number;
  neutralBotsDifficulty: number;
  startingResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
};

@Component({
  selector: 'app-game',
  imports: [RouterLink],
  templateUrl: './game.component.html'
})
export class GameComponent {
  protected readonly config = this.loadConfig();

  private loadConfig(): GalaxySetup | null {
    const stored = localStorage.getItem('srogame:setup');
    if (!stored) {
      return null;
    }

    try {
      const parsed = JSON.parse(stored) as GalaxySetup;
      if (this.isValidConfig(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }

    return null;
  }

  private isValidConfig(config: GalaxySetup): boolean {
    return (
      typeof config.galaxyName === 'string' &&
      config.galaxyName.trim().length > 0 &&
      Number.isInteger(config.galaxyWidth) &&
      config.galaxyWidth >= 10 &&
      config.galaxyWidth <= 100 &&
      Number.isInteger(config.galaxyHeight) &&
      config.galaxyHeight >= 10 &&
      config.galaxyHeight <= 100 &&
      Number.isInteger(config.galaxyCenterSize) &&
      config.galaxyCenterSize >= 5 &&
      config.galaxyCenterSize <= 35 &&
      Number.isInteger(config.voidChance) &&
      config.voidChance >= 0 &&
      config.voidChance <= 35 &&
      Array.isArray(config.starsAmountModifier) &&
      config.starsAmountModifier.length === 2 &&
      Number.isInteger(config.starsAmountModifier[0]) &&
      config.starsAmountModifier[0] >= -10 &&
      config.starsAmountModifier[0] <= 0 &&
      Number.isInteger(config.starsAmountModifier[1]) &&
      config.starsAmountModifier[1] >= 1 &&
      config.starsAmountModifier[1] <= 9 &&
      Number.isInteger(config.playerAmount) &&
      config.playerAmount >= 1 &&
      config.playerAmount <= 4 &&
      Number.isInteger(config.botsAmount) &&
      config.botsAmount >= 0 &&
      config.botsAmount <= 12 &&
      Number.isInteger(config.botDifficulty) &&
      config.botDifficulty >= -75 &&
      config.botDifficulty <= 200 &&
      Number.isInteger(config.neutralBotsAmount) &&
      config.neutralBotsAmount >= 0 &&
      config.neutralBotsAmount <= 10 &&
      Number.isInteger(config.neutralBotsDifficulty) &&
      config.neutralBotsDifficulty >= -100 &&
      config.neutralBotsDifficulty <= 200 &&
      Number.isFinite(config.startingResources?.metal) &&
      config.startingResources.metal >= 0 &&
      Number.isFinite(config.startingResources?.crystal) &&
      config.startingResources.crystal >= 0 &&
      Number.isFinite(config.startingResources?.deuterium) &&
      config.startingResources.deuterium >= 0
    );
  }
}
