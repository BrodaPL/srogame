import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { PlayerSessionService } from '../core/player-session.service';
import { GameType } from '../models/enums/game-type';
import { GalaxySetup } from '../models/game-api-types';

@Component({
  selector: 'app-game',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './game.component.html'
})
export class GameComponent implements OnInit {
  protected readonly config = this.loadConfig();
  protected stateError: string | null = null;
  protected isLoading = false;

  constructor(
    private readonly gameState: GameStateService,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService
  ) {}

  public ngOnInit(): void {
    if (!this.config) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.stateError = 'No player session found. Start a new game.';
      return;
    }

    this.isLoading = true;
    this.stateError = null;

    this.gameApi.getGameState(session.token).subscribe({
      next: (response) => {
        this.gameState.setGalaxy(response.galaxy);
        this.isLoading = false;
      },
      error: () => {
        this.stateError = 'Unable to load galaxy from server.';
        this.isLoading = false;
      }
    });
  }

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
    const gameTypeValue = (config as { gameType?: unknown }).gameType;
    const gameTypeValid = gameTypeValue === undefined || this.isValidGameType(gameTypeValue);

    return (
      gameTypeValid &&
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

  private isValidGameType(value: unknown): value is GameType {
    return (
      value === GameType.PVP ||
      value === GameType.PVPVE ||
      value === GameType.PVE ||
      value === GameType.SANDBOX
    );
  }
}
