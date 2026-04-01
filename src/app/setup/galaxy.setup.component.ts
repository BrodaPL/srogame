import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { AuthStateService } from '../core/auth-state.service';
import { NAMES_LIST } from '../models/enums/names-list';
import { GameType } from '../models/enums/game-type';
import {
  GalaxySetup,
  MAX_AUTO_SAVE_TURNS,
  normalizeGalaxySetup
} from '../models/game-api-types';
import { ResourcesPack } from '../models/resources-pack';

type GalaxySetupForm = {
  gameType: GameType;
  galaxyName: string;
  galaxyWidth: string;
  galaxyHeight: string;
  galaxyCenterSize: string;
  voidChance: string;
  starsAmountModifierMin: string;
  starsAmountModifierMax: string;
  playerAmount: string;
  botsAmount: string;
  botDifficulty: string;
  neutralBotsAmount: string;
  neutralBotsDifficulty: string;
  autoSaveTurns: string;
  createRandomPlanets: boolean;
  createStartingShips: boolean;
  skipTutorial: boolean;
  startingMetal: string;
  startingCrystal: string;
  startingDeuterium: string;
};

@Component({
  selector: 'app-galaxy-setup',
  imports: [FormsModule, RouterLink],
  templateUrl: './galaxy.setup.component.html'
})
export class GalaxySetupComponent {
  protected readonly savedConfig = signal<GalaxySetup | null>(null);
  protected readonly session: AuthStateService['session'];
  protected isStarting = false;
  protected startError: string | null = null;
  protected form: GalaxySetupForm;

  constructor(
    private readonly router: Router,
    private readonly gameState: GameStateService,
    private readonly gameApi: GameApiService,
    private readonly authState: AuthStateService
  ) {
    this.session = this.authState.session;
    this.form = this.createDefaultForm();

    const stored = localStorage.getItem('srogame:setup');
    if (!stored) {
      return;
    }

    try {
      const parsed = normalizeGalaxySetup(JSON.parse(stored) as GalaxySetup);
      if (this.isValidConfig(parsed)) {
        this.savedConfig.set(parsed);
        this.form = this.formFromConfig(parsed);
      }
    } catch {
      localStorage.removeItem('srogame:setup');
    }
  }

  protected canStart(): boolean {
    const gameTypeValid = this.isValidGameType(this.form.gameType);
    const name = this.form.galaxyName.trim();
    const width = this.parseIntegerInRange(this.form.galaxyWidth, 10, 100);
    const height = this.parseIntegerInRange(this.form.galaxyHeight, 10, 100);
    const centerSize = this.parseIntegerInRange(this.form.galaxyCenterSize, 5, 35);
    const voidChance = this.parseIntegerInRange(this.form.voidChance, 0, 35);
    const starsMin = this.parseIntegerInRange(this.form.starsAmountModifierMin, -10, 0);
    const starsMax = this.parseIntegerInRange(this.form.starsAmountModifierMax, 1, 9);
    const playerAmount = this.parseIntegerInRange(this.form.playerAmount, 1, 4);
    const botsAmount = this.parseIntegerInRange(this.form.botsAmount, 0, 12);
    const botDifficulty = this.parseIntegerInRange(this.form.botDifficulty, -75, 200);
    const neutralBotsAmount = this.parseIntegerInRange(this.form.neutralBotsAmount, 0, 10);
    const neutralBotsDifficulty = this.parseIntegerInRange(
      this.form.neutralBotsDifficulty,
      -100,
      200
    );
    const autoSaveTurns = this.parseIntegerInRange(this.form.autoSaveTurns, 0, MAX_AUTO_SAVE_TURNS);
    const metal = this.parseNonNegativeInteger(this.form.startingMetal);
    const crystal = this.parseNonNegativeInteger(this.form.startingCrystal);
    const deuterium = this.parseNonNegativeInteger(this.form.startingDeuterium);

    return (
      gameTypeValid &&
      Boolean(this.session()) &&
      Boolean(name) &&
      width !== null &&
      height !== null &&
      centerSize !== null &&
      voidChance !== null &&
      starsMin !== null &&
      starsMax !== null &&
      playerAmount !== null &&
      botsAmount !== null &&
      botDifficulty !== null &&
      neutralBotsAmount !== null &&
      neutralBotsDifficulty !== null &&
      autoSaveTurns !== null &&
      metal !== null &&
      crystal !== null &&
      deuterium !== null
    );
  }

  protected startGame(): void {
    if (!this.canStart() || this.isStarting) {
      return;
    }

    const session = this.session();
    if (!session) {
      this.startError = 'Login required to start a game.';
      return;
    }

    const config: GalaxySetup = {
      gameType: this.form.gameType,
      galaxyName: this.form.galaxyName.trim(),
      galaxyWidth: Number(this.form.galaxyWidth),
      galaxyHeight: Number(this.form.galaxyHeight),
      galaxyCenterSize: Number(this.form.galaxyCenterSize),
      voidChance: Number(this.form.voidChance),
      starsAmountModifier: [
        Number(this.form.starsAmountModifierMin),
        Number(this.form.starsAmountModifierMax)
      ],
      playerAmount: Number(this.form.playerAmount),
      botsAmount: Number(this.form.botsAmount),
      botDifficulty: Number(this.form.botDifficulty),
      neutralBotsAmount: Number(this.form.neutralBotsAmount),
      neutralBotsDifficulty: Number(this.form.neutralBotsDifficulty),
      autoSaveTurns: Number(this.form.autoSaveTurns),
      createRandomPlanets: this.form.createRandomPlanets,
      createStartingShips: this.form.createStartingShips,
      skipTutorial: this.form.skipTutorial,
      startingResources: new ResourcesPack(
        Number(this.form.startingMetal),
        Number(this.form.startingCrystal),
        Number(this.form.startingDeuterium)
      )
    };

    this.isStarting = true;
    this.startError = null;

    this.gameApi.startGame({ setup: config }, session.token).subscribe({
      next: (response) => {
        localStorage.setItem('srogame:setup', JSON.stringify(config));
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.savedConfig.set(config);
        this.isStarting = false;
        this.router.navigate(['/game/galactic']);
      },
      error: () => {
        this.startError = 'Unable to reach the game server.';
        this.isStarting = false;
      }
    });
  }

  private createDefaultForm(): GalaxySetupForm {
    return {
      gameType: GameType.PVE,
      galaxyName: this.randomGalaxyName(),
      galaxyWidth: '25',
      galaxyHeight: '20',
      galaxyCenterSize: '10',
      voidChance: '5',
      starsAmountModifierMin: '-1',
      starsAmountModifierMax: '4',
      playerAmount: '1',
      botsAmount: '0',
      botDifficulty: '0',
      neutralBotsAmount: '1',
      neutralBotsDifficulty: '0',
      autoSaveTurns: '5',
      createRandomPlanets: false,
      createStartingShips: false,
      skipTutorial: true,
      startingMetal: '6',
      startingCrystal: '3',
      startingDeuterium: '1'
    };
  }

  private formFromConfig(config: GalaxySetup): GalaxySetupForm {
    return {
      gameType: this.normalizeGameType(config.gameType),
      galaxyName: config.galaxyName,
      galaxyWidth: String(config.galaxyWidth),
      galaxyHeight: String(config.galaxyHeight),
      galaxyCenterSize: String(config.galaxyCenterSize),
      voidChance: String(config.voidChance),
      starsAmountModifierMin: String(config.starsAmountModifier[0]),
      starsAmountModifierMax: String(config.starsAmountModifier[1]),
      playerAmount: String(config.playerAmount),
      botsAmount: String(config.botsAmount),
      botDifficulty: String(config.botDifficulty),
      neutralBotsAmount: String(config.neutralBotsAmount),
      neutralBotsDifficulty: String(config.neutralBotsDifficulty),
      autoSaveTurns: String(config.autoSaveTurns),
      createRandomPlanets: config.createRandomPlanets === true,
      createStartingShips: config.createStartingShips === true,
      skipTutorial: config.skipTutorial === true,
      startingMetal: String(config.startingResources.metal),
      startingCrystal: String(config.startingResources.crystal),
      startingDeuterium: String(config.startingResources.deuterium)
    };
  }

  private randomGalaxyName(): string {
    if (NAMES_LIST.length === 0) {
      return 'Unnamed';
    }

    const index = Math.floor(Math.random() * NAMES_LIST.length);
    return NAMES_LIST[index];
  }

  private parseIntegerInRange(value: string, min: number, max: number): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return null;
    }

    return parsed;
  }

  private parseNonNegativeInteger(value: string): number | null {
    return this.parseIntegerInRange(value, 0, 999999);
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
      Number.isInteger(config.autoSaveTurns) &&
      config.autoSaveTurns >= 0 &&
      config.autoSaveTurns <= MAX_AUTO_SAVE_TURNS &&
      (config.createRandomPlanets === undefined || typeof config.createRandomPlanets === 'boolean') &&
      (config.createStartingShips === undefined || typeof config.createStartingShips === 'boolean') &&
      (config.skipTutorial === undefined || typeof config.skipTutorial === 'boolean') &&
      Number.isFinite(config.startingResources?.metal) &&
      config.startingResources.metal >= 0 &&
      config.startingResources.metal <= 999999 &&
      Number.isFinite(config.startingResources?.crystal) &&
      config.startingResources.crystal >= 0 &&
      config.startingResources.crystal <= 999999 &&
      Number.isFinite(config.startingResources?.deuterium) &&
      config.startingResources.deuterium >= 0 &&
      config.startingResources.deuterium <= 999999
    );
  }

  private normalizeGameType(value: unknown): GameType {
    return this.isValidGameType(value) ? value : GameType.PVE;
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
