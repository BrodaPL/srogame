import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { PlayerSessionService } from '../core/player-session.service';
import { AuthStateService } from '../core/auth-state.service';
import type { GameStateResponse, TurnStatusResponse } from '../models/game-api-types';

@Component({
  selector: 'app-game',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './game.component.html'
})
export class GameComponent implements OnInit, OnDestroy {
  private static readonly AUTO_SKIP_IDLE_MS = 5 * 60 * 1000;
  private static readonly PRESENCE_SYNC_THROTTLE_MS = 30 * 1000;

  protected stateTitle = '';
  protected stateError: string | null = null;
  protected stateActionLabel = 'Back to main menu';
  protected stateActionRoute = '/';
  protected isLoading = false;
  protected isGameReady = false;
  protected showAutoSkipReturnNotice = false;
  protected showPresenceRemovedReturnNotice = false;
  private turnStatusPollHandle: number | null = null;
  private autoSkipInactivityHandle: number | null = null;
  private isPollingTurnStatus = false;
  private isRefreshingAfterTurnChange = false;
  private lastPresenceSyncAt = 0;
  private turnStatusSubscription: Subscription | null = null;
  private readonly activityListener = () => this.handlePlayerActivity();
  private readonly visibilityListener = () => {
    if (document.visibilityState === 'visible') {
      this.handlePlayerActivity(true);
    }
  };

  constructor(
    private readonly gameState: GameStateService,
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService
  ) {}

  public ngOnInit(): void {
    this.turnStatusSubscription = this.gameState.turnStatusChanges.subscribe((turnStatus) => {
      this.handleTurnStatusUpdated(turnStatus);
    });
    this.bindActivityListeners();
    const session = this.playerSession.load();
    if (!session) {
      this.handleMissingSession();
      return;
    }

    this.stateTitle = '';
    this.stateError = null;

    if (this.gameState.galaxy) {
      this.gameState.setTurnStatus(null);
      this.isGameReady = true;
      this.isLoading = false;
      this.startTurnStatusPolling();
      this.refreshTurnStatus();
      this.syncGameStateInBackground(session.token);
      return;
    }

    this.isLoading = true;
    this.isGameReady = false;
    this.loadGameState(session.token);
  }

  public ngOnDestroy(): void {
    this.stopTurnStatusPolling();
    this.clearAutoSkipTimer();
    this.unbindActivityListeners();
    this.turnStatusSubscription?.unsubscribe();
    this.turnStatusSubscription = null;
  }

  protected isUiLocked(): boolean {
    return this.gameState.isProcessingTurn;
  }

  private handleMissingSession(): void {
    this.stopTurnStatusPolling();
    this.clearAutoSkipTimer();
    this.gameState.clearGalaxy();
    this.isLoading = false;
    this.isGameReady = false;
    this.showAutoSkipReturnNotice = false;
    this.showPresenceRemovedReturnNotice = false;
    this.stateTitle = 'Login required';
    this.stateError = 'Login to continue, then start or join a game.';
    this.stateActionLabel = 'Go to login';
    this.stateActionRoute = '/login';
  }

  private handleStateLoadError(error: { status?: number; error?: { error?: string } }): void {
    this.stopTurnStatusPolling();
    this.clearAutoSkipTimer();
    this.gameState.clearGalaxy();
    this.isLoading = false;
    this.isGameReady = false;
    this.showAutoSkipReturnNotice = false;
    this.showPresenceRemovedReturnNotice = false;

    if (error?.status === 401) {
      this.authState.clearSession();
      this.stateTitle = 'Login required';
      this.stateError = 'Login to continue, then start or join a game.';
      this.stateActionLabel = 'Go to login';
      this.stateActionRoute = '/login';
      return;
    }

    if (error?.status === 403 || error?.status === 404 || error?.status === 409) {
      this.stateTitle = 'No active game';
      this.stateError = error?.error?.error
        ?? 'This account is not assigned to the current selected game. Join, resume, or start a game from the main menu.';
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
    this.gameApi.getTurnStatus(session.token, session.currentGameId).subscribe({
      next: (response) => {
        this.isPollingTurnStatus = false;
        this.applyTurnStatus(response);
        this.gameState.setProcessingTurn(response.isProcessing);

        const currentTurn = this.gameState.currentTurn();
        if (currentTurn !== null && response.currentTurn !== currentTurn) {
          this.refreshGameStateAfterTurnChange(session.token);
        }
      },
      error: (error) => {
        this.isPollingTurnStatus = false;
        if (error?.status === 401 || error?.status === 403 || error?.status === 404 || error?.status === 409) {
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
    this.gameApi.getGameState(token, this.playerSession.load()?.currentGameId ?? null).subscribe({
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

  private loadGameState(token: string): void {
    this.gameApi.getGameState(token, this.playerSession.load()?.currentGameId ?? null).subscribe({
      next: (response) => {
        this.applyGameStateResponse(response);
      },
      error: (error) => {
        this.handleStateLoadError(error);
      }
    });
  }

  private syncGameStateInBackground(token: string): void {
    this.gameApi.getGameState(token, this.playerSession.load()?.currentGameId ?? null).subscribe({
      next: (response) => {
        this.applyGameStateResponse(response);
      },
      error: (error) => {
        if (error?.status === 401 || error?.status === 403 || error?.status === 404 || error?.status === 409) {
          this.handleStateLoadError(error);
        }
      }
    });
  }

  private applyGameStateResponse(response: GameStateResponse): void {
    this.authState.setSession(response.player);
    this.gameState.setGalaxy(response.galaxy);
    this.applyTurnStatus(null);
    this.stateTitle = '';
    this.stateError = null;
    this.isGameReady = true;
    this.isLoading = false;
    this.startTurnStatusPolling();
    this.refreshTurnStatus();
  }

  protected keepAutoSkipTurnEnabled(): void {
    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      this.showAutoSkipReturnNotice = false;
      this.showPresenceRemovedReturnNotice = false;
      return;
    }

    this.gameApi.updateMultiplayerGamePresence(session.currentGameId, {
      acknowledgeNotice: true
    }, session.token).subscribe({
      next: (turnStatus) => {
        this.applyTurnStatus(turnStatus);
        this.showAutoSkipReturnNotice = false;
        this.showPresenceRemovedReturnNotice = false;
      },
      error: () => {
        this.showAutoSkipReturnNotice = false;
        this.showPresenceRemovedReturnNotice = false;
      }
    });
  }

  protected disableAutoSkipTurn(): void {
    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      this.showAutoSkipReturnNotice = false;
      this.showPresenceRemovedReturnNotice = false;
      return;
    }

    this.gameApi.updateMultiplayerAutoSkipTurn(session.currentGameId, {
      enabled: false,
      acknowledgeNotice: true
    }, session.token).subscribe({
      next: (turnStatus) => {
        this.applyTurnStatus(turnStatus);
        this.showAutoSkipReturnNotice = false;
        this.showPresenceRemovedReturnNotice = false;
      },
      error: () => {
        this.showAutoSkipReturnNotice = false;
        this.showPresenceRemovedReturnNotice = false;
      }
    });
  }

  protected acknowledgePresenceRemovedNotice(): void {
    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      this.showPresenceRemovedReturnNotice = false;
      return;
    }

    this.gameApi.updateMultiplayerGamePresence(session.currentGameId, {
      acknowledgePresenceRemovedNotice: true
    }, session.token).subscribe({
      next: (turnStatus) => {
        this.applyTurnStatus(turnStatus);
        this.showPresenceRemovedReturnNotice = false;
      },
      error: () => {
        this.showPresenceRemovedReturnNotice = false;
      }
    });
  }

  private applyTurnStatus(turnStatus: TurnStatusResponse | null): void {
    this.gameState.setTurnStatus(turnStatus);
  }

  private handleTurnStatusUpdated(turnStatus: TurnStatusResponse | null): void {
    this.showAutoSkipReturnNotice = turnStatus?.showAutoSkipReturnNotice === true;
    this.showPresenceRemovedReturnNotice = turnStatus?.showPresenceRemovedReturnNotice === true;
    this.resetAutoSkipTimer();
  }

  private bindActivityListeners(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.addEventListener('pointerdown', this.activityListener, true);
    document.addEventListener('keydown', this.activityListener, true);
    document.addEventListener('touchstart', this.activityListener, true);
    document.addEventListener('visibilitychange', this.visibilityListener, true);
  }

  private unbindActivityListeners(): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.removeEventListener('pointerdown', this.activityListener, true);
    document.removeEventListener('keydown', this.activityListener, true);
    document.removeEventListener('touchstart', this.activityListener, true);
    document.removeEventListener('visibilitychange', this.visibilityListener, true);
  }

  private handlePlayerActivity(forceSync = false): void {
    if (!this.shouldManageMultiplayerPresence()) {
      return;
    }

    this.resetAutoSkipTimer();
    const now = Date.now();
    if (!forceSync && now - this.lastPresenceSyncAt < GameComponent.PRESENCE_SYNC_THROTTLE_MS) {
      return;
    }

    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      return;
    }

    this.lastPresenceSyncAt = now;
    this.gameApi.updateMultiplayerGamePresence(session.currentGameId, {}, session.token).subscribe({
      next: (turnStatus) => {
        this.applyTurnStatus(turnStatus);
      },
      error: () => {
        // Ignore transient presence sync failures; regular turn-status polling remains authoritative.
      }
    });
  }

  private shouldManageMultiplayerPresence(): boolean {
    return this.isGameReady
      && !this.isLoading
      && (this.gameState.turnStatus?.minimumOnlineHumanCount ?? 1) > 1;
  }

  private resetAutoSkipTimer(): void {
    this.clearAutoSkipTimer();
    const turnStatus = this.gameState.turnStatus;
    if (!this.shouldManageMultiplayerPresence() || !turnStatus?.currentPlayerAutoSkipEnabled || turnStatus.currentPlayerPresenceState === 'AUTO_SKIP_TURN') {
      return;
    }

    this.autoSkipInactivityHandle = globalThis.setTimeout(() => {
      this.activateAutoSkipTurn();
    }, GameComponent.AUTO_SKIP_IDLE_MS);
  }

  private clearAutoSkipTimer(): void {
    if (this.autoSkipInactivityHandle !== null) {
      globalThis.clearTimeout(this.autoSkipInactivityHandle);
      this.autoSkipInactivityHandle = null;
    }
  }

  private activateAutoSkipTurn(): void {
    if (!this.shouldManageMultiplayerPresence()) {
      return;
    }

    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      return;
    }

    this.gameApi.updateMultiplayerAutoSkipTurn(session.currentGameId, {
      enabled: true,
      activateNow: true
    }, session.token).subscribe({
      next: (turnStatus) => {
        this.applyTurnStatus(turnStatus);
      },
      error: () => {
        // Ignore transient failures; the player can still toggle manually.
      }
    });
  }
}
