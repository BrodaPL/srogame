import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { PlayerSessionService } from '../core/player-session.service';
import { AuthStateService } from '../core/auth-state.service';

@Component({
  selector: 'app-game',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './game.component.html'
})
export class GameComponent implements OnInit, OnDestroy {
  protected stateTitle = '';
  protected stateError: string | null = null;
  protected stateActionLabel = 'Back to main menu';
  protected stateActionRoute = '/';
  protected isLoading = false;
  protected isGameReady = false;
  private turnStatusPollHandle: number | null = null;
  private isPollingTurnStatus = false;
  private isRefreshingAfterTurnChange = false;

  constructor(
    private readonly gameState: GameStateService,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService
  ) {}

  public ngOnInit(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.handleMissingSession();
      return;
    }

    this.isLoading = true;
    this.isGameReady = false;
    this.stateTitle = '';
    this.stateError = null;

    this.gameApi.getGameState(session.token).subscribe({
      next: (response) => {
        globalThis.setTimeout(() => {
          this.authState.setSession(response.player);
          this.gameState.setGalaxy(response.galaxy);
          this.gameState.setTurnStatus(null);
          this.stateTitle = '';
          this.stateError = null;
          this.isGameReady = true;
          this.isLoading = false;
          this.startTurnStatusPolling();
          this.refreshTurnStatus();
        });
      },
      error: (error) => {
        globalThis.setTimeout(() => {
          this.handleStateLoadError(error);
        });
      }
    });
  }

  public ngOnDestroy(): void {
    this.stopTurnStatusPolling();
  }

  protected isUiLocked(): boolean {
    return this.gameState.isProcessingTurn;
  }

  private handleMissingSession(): void {
    this.stopTurnStatusPolling();
    this.gameState.clearGalaxy();
    this.isLoading = false;
    this.isGameReady = false;
    this.stateTitle = 'Login required';
    this.stateError = 'Login to continue, then start or join a game.';
    this.stateActionLabel = 'Go to login';
    this.stateActionRoute = '/login';
  }

  private handleStateLoadError(error: { status?: number; error?: { error?: string } }): void {
    this.stopTurnStatusPolling();
    this.gameState.clearGalaxy();
    this.isLoading = false;
    this.isGameReady = false;

    if (error?.status === 401) {
      this.authState.clearSession();
      this.stateTitle = 'Login required';
      this.stateError = 'Login to continue, then start or join a game.';
      this.stateActionLabel = 'Go to login';
      this.stateActionRoute = '/login';
      return;
    }

    if (error?.status === 403 || error?.status === 404) {
      this.stateTitle = 'No active game';
      this.stateError = 'This account is not assigned to the current active game. Join or start a game from the main menu.';
      this.stateActionLabel = 'Back to main menu';
      this.stateActionRoute = '/';
      return;
    }

    this.stateTitle = 'Unable to load game';
    this.stateError = error?.error?.error ?? 'The server did not return the current game state.';
    this.stateActionLabel = 'Back to main menu';
    this.stateActionRoute = '/';
  }

  private startTurnStatusPolling(): void {
    if (this.turnStatusPollHandle !== null) {
      return;
    }

    this.turnStatusPollHandle = globalThis.setInterval(() => {
      this.refreshTurnStatus();
    }, 3000);
  }

  private stopTurnStatusPolling(): void {
    if (this.turnStatusPollHandle !== null) {
      globalThis.clearInterval(this.turnStatusPollHandle);
      this.turnStatusPollHandle = null;
    }
    this.isPollingTurnStatus = false;
    this.isRefreshingAfterTurnChange = false;
  }

  private refreshTurnStatus(): void {
    const session = this.playerSession.load();
    if (!session || !this.isGameReady || this.isLoading || this.isPollingTurnStatus || this.isRefreshingAfterTurnChange) {
      return;
    }

    this.isPollingTurnStatus = true;
    this.gameApi.getTurnStatus(session.token).subscribe({
      next: (response) => {
        this.isPollingTurnStatus = false;
        this.gameState.setTurnStatus(response);
        this.gameState.setProcessingTurn(response.isProcessing);

        const currentTurn = this.gameState.currentTurn();
        if (currentTurn !== null && response.currentTurn !== currentTurn) {
          this.refreshGameStateAfterTurnChange(session.token);
        }
      },
      error: (error) => {
        this.isPollingTurnStatus = false;
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) {
          this.handleStateLoadError(error);
        }
      }
    });
  }

  private refreshGameStateAfterTurnChange(token: string): void {
    if (this.isRefreshingAfterTurnChange) {
      return;
    }

    this.isRefreshingAfterTurnChange = true;
    this.gameApi.getGameState(token).subscribe({
      next: (response) => {
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.gameState.setProcessingTurn(false);
        this.isRefreshingAfterTurnChange = false;
        globalThis.location?.reload();
      },
      error: (error) => {
        this.isRefreshingAfterTurnChange = false;
        this.handleStateLoadError(error);
      }
    });
  }
}
