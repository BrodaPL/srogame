import { Component, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { GameType } from '../models/enums/game-type';
import {
  GalaxySetup,
  MAX_AUTO_SAVE_TURNS,
  MultiplayerLobbyDto,
  MultiplayerLobbyLoadSeatDto,
  MultiplayerLobbyResponse,
  normalizeGalaxySetup
} from '../models/game-api-types';
import { ResourcesPack } from '../models/resources-pack';

type LobbySetupForm = {
  gameType: GameType;
  galaxyName: string;
  galaxyWidth: string;
  galaxyHeight: string;
  galaxyCenterSize: string;
  voidChance: string;
  starsAmountModifierMin: string;
  starsAmountModifierMax: string;
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
  selector: 'app-multiplayer',
  imports: [FormsModule, RouterLink],
  templateUrl: './multiplayer.component.html'
})
export class MultiplayerComponent implements OnDestroy {
  protected readonly session: AuthStateService['session'];
  protected response: MultiplayerLobbyResponse | null = null;
  protected isLoading = false;
  protected isActing = false;
  protected error: string | null = null;
  protected confirmReplaceActiveGame = false;
  protected setupForm: LobbySetupForm = this.createForm(this.defaultSetup());
  private readonly refreshHandle: number;

  constructor(
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly router: Router
  ) {
    this.session = this.authState.session;
    this.loadLobby();
    this.refreshHandle = window.setInterval(() => {
      if (!this.isActing) {
        this.loadLobby(false);
      }
    }, 5000);
  }

  public ngOnDestroy(): void {
    window.clearInterval(this.refreshHandle);
  }

  protected loadLobby(resetError = true): void {
    this.isLoading = true;
    if (resetError) {
      this.error = null;
    }

    const token = this.session()?.token;
    this.gameApi.getMultiplayerLobby(token).subscribe({
      next: (response) => {
        this.response = response;
        this.isLoading = false;
        if (response.lobby) {
          this.setupForm = this.createForm(response.lobby.setup);
        }
        if (!response.activeGame) {
          this.confirmReplaceActiveGame = false;
        }
      },
      error: (error) => {
        this.error = error?.error?.error ?? 'Unable to load multiplayer lobby.';
        this.response = null;
        this.isLoading = false;
      }
    });
  }

  protected openLobby(): void {
    this.runLobbyMutation((token) => this.gameApi.openMultiplayerLobby(token));
  }

  protected joinLobby(): void {
    this.runLobbyMutation((token) => this.gameApi.joinMultiplayerLobby(token));
  }

  protected leaveLobby(): void {
    this.runLobbyMutation((token) => this.gameApi.leaveMultiplayerLobby(token));
  }

  protected setReady(ready: boolean): void {
    this.runLobbyMutation((token) => this.gameApi.toggleMultiplayerLobbyReady({ ready }, token));
  }

  protected saveSetup(): void {
    const lobby = this.response?.lobby;
    if (!lobby) {
      return;
    }

    const setup = this.buildSetup(lobby.members.length);
    if (!setup) {
      this.error = 'Lobby setup is incomplete or invalid.';
      return;
    }

    this.runLobbyMutation((token) => this.gameApi.updateMultiplayerLobbySetup({ setup }, token));
  }

  protected bindSave(): void {
    this.runLobbyMutation((token) => this.gameApi.bindMultiplayerLobbySave(token));
  }

  protected clearSaveBinding(): void {
    this.runLobbyMutation((token) => this.gameApi.clearMultiplayerLobbySave(token));
  }

  protected assignSeat(savedPlayerId: number, nextValue: string): void {
    const accountId = nextValue === '' ? null : Number(nextValue);
    if (nextValue !== '' && !Number.isInteger(accountId)) {
      this.error = 'Invalid seat assignment.';
      return;
    }

    this.runLobbyMutation((token) => this.gameApi.assignMultiplayerLobbySeat({
      savedPlayerId,
      accountId
    }, token));
  }

  protected startLobbyGame(): void {
    const session = this.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    if (!this.canStartLobbyGame()) {
      return;
    }

    this.isActing = true;
    this.error = null;
    this.gameApi.startMultiplayerLobbyGame(session.token).subscribe({
      next: (response) => {
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.isActing = false;
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.error = error?.error?.error ?? 'Unable to start the multiplayer game.';
        this.isActing = false;
        this.loadLobby(false);
      }
    });
  }

  protected canStartLobbyGame(): boolean {
    const lobby = this.response?.lobby;
    return !!lobby
      && lobby.canStart
      && (!this.response?.activeGame || this.confirmReplaceActiveGame)
      && !this.isActing;
  }

  protected getLobby(): MultiplayerLobbyDto | null {
    return this.response?.lobby ?? null;
  }

  protected seatValue(seat: MultiplayerLobbyLoadSeatDto): string {
    return seat.assignedAccountId === null ? '' : String(seat.assignedAccountId);
  }

  protected canSelectSeatMember(
    seat: MultiplayerLobbyLoadSeatDto,
    accountId: number
  ): boolean {
    const lobby = this.response?.lobby;
    if (!lobby) {
      return false;
    }

    return !lobby.loadSeats.some((entry) =>
      entry.savedPlayerId !== seat.savedPlayerId && entry.assignedAccountId === accountId
    );
  }

  private runLobbyMutation(
    action: (token: string) => ReturnType<GameApiService['getMultiplayerLobby']>
  ): void {
    const session = this.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    this.isActing = true;
    this.error = null;
    action(session.token).subscribe({
      next: (response) => {
        this.response = response;
        this.isActing = false;
        if (response.lobby) {
          this.setupForm = this.createForm(response.lobby.setup);
        }
        if (!response.activeGame) {
          this.confirmReplaceActiveGame = false;
        }
      },
      error: (error) => {
        this.error = error?.error?.error ?? 'Lobby action failed.';
        this.isActing = false;
        this.loadLobby(false);
      }
    });
  }

  private buildSetup(playerAmount: number): GalaxySetup | null {
    const width = this.parseIntegerInRange(this.setupForm.galaxyWidth, 10, 100);
    const height = this.parseIntegerInRange(this.setupForm.galaxyHeight, 10, 100);
    const centerSize = this.parseIntegerInRange(this.setupForm.galaxyCenterSize, 5, 35);
    const voidChance = this.parseIntegerInRange(this.setupForm.voidChance, 0, 35);
    const starsMin = this.parseIntegerInRange(this.setupForm.starsAmountModifierMin, -10, 0);
    const starsMax = this.parseIntegerInRange(this.setupForm.starsAmountModifierMax, 1, 9);
    const botsAmount = this.parseIntegerInRange(this.setupForm.botsAmount, 0, 12);
    const botDifficulty = this.parseIntegerInRange(this.setupForm.botDifficulty, -75, 200);
    const neutralBotsAmount = this.parseIntegerInRange(this.setupForm.neutralBotsAmount, 0, 10);
    const neutralBotsDifficulty = this.parseIntegerInRange(this.setupForm.neutralBotsDifficulty, -100, 200);
    const autoSaveTurns = this.parseIntegerInRange(this.setupForm.autoSaveTurns, 0, MAX_AUTO_SAVE_TURNS);
    const startingMetal = this.parseIntegerInRange(this.setupForm.startingMetal, 0, 999999);
    const startingCrystal = this.parseIntegerInRange(this.setupForm.startingCrystal, 0, 999999);
    const startingDeuterium = this.parseIntegerInRange(this.setupForm.startingDeuterium, 0, 999999);
    const galaxyName = this.setupForm.galaxyName.trim();

    if (
      !this.isValidGameType(this.setupForm.gameType)
      || !galaxyName
      || width === null
      || height === null
      || centerSize === null
      || voidChance === null
      || starsMin === null
      || starsMax === null
      || botsAmount === null
      || botDifficulty === null
      || neutralBotsAmount === null
      || neutralBotsDifficulty === null
      || autoSaveTurns === null
      || startingMetal === null
      || startingCrystal === null
      || startingDeuterium === null
    ) {
      return null;
    }

    return normalizeGalaxySetup({
      gameType: this.setupForm.gameType,
      galaxyName,
      galaxyWidth: width,
      galaxyHeight: height,
      galaxyCenterSize: centerSize,
      voidChance,
      starsAmountModifier: [starsMin, starsMax],
      playerAmount,
      botsAmount,
      botDifficulty,
      neutralBotsAmount,
      neutralBotsDifficulty,
      autoSaveTurns,
      createRandomPlanets: this.setupForm.createRandomPlanets,
      createStartingShips: this.setupForm.createStartingShips,
      skipTutorial: this.setupForm.skipTutorial,
      startingResources: new ResourcesPack(startingMetal, startingCrystal, startingDeuterium)
    });
  }

  private createForm(setup: GalaxySetup): LobbySetupForm {
    return {
      gameType: setup.gameType,
      galaxyName: setup.galaxyName,
      galaxyWidth: String(setup.galaxyWidth),
      galaxyHeight: String(setup.galaxyHeight),
      galaxyCenterSize: String(setup.galaxyCenterSize),
      voidChance: String(setup.voidChance),
      starsAmountModifierMin: String(setup.starsAmountModifier[0]),
      starsAmountModifierMax: String(setup.starsAmountModifier[1]),
      botsAmount: String(setup.botsAmount),
      botDifficulty: String(setup.botDifficulty),
      neutralBotsAmount: String(setup.neutralBotsAmount),
      neutralBotsDifficulty: String(setup.neutralBotsDifficulty),
      autoSaveTurns: String(setup.autoSaveTurns),
      createRandomPlanets: setup.createRandomPlanets === true,
      createStartingShips: setup.createStartingShips === true,
      skipTutorial: setup.skipTutorial === true,
      startingMetal: String(setup.startingResources.metal),
      startingCrystal: String(setup.startingResources.crystal),
      startingDeuterium: String(setup.startingResources.deuterium)
    };
  }

  private parseIntegerInRange(value: string, min: number, max: number): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return null;
    }

    return parsed;
  }

  private isValidGameType(value: unknown): value is GameType {
    return (
      value === GameType.PVP
      || value === GameType.PVPVE
      || value === GameType.PVE
      || value === GameType.SANDBOX
    );
  }

  private defaultSetup(): GalaxySetup {
    return normalizeGalaxySetup({
      gameType: GameType.PVP,
      galaxyName: 'Multiplayer Sector',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: 2,
      botsAmount: 0,
      botDifficulty: 0,
      neutralBotsAmount: 1,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 5,
      createRandomPlanets: false,
      createStartingShips: false,
      skipTutorial: true,
      startingResources: {
        metal: 6,
        crystal: 3,
        deuterium: 1
      }
    });
  }
}
