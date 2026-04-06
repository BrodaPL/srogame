import { Component, OnInit } from '@angular/core';
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
export class GameComponent implements OnInit {
  protected stateTitle = '';
  protected stateError: string | null = null;
  protected stateActionLabel = 'Back to main menu';
  protected stateActionRoute = '/';
  protected isLoading = false;
  protected isGameReady = false;

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
          this.stateTitle = '';
          this.stateError = null;
          this.isGameReady = true;
          this.isLoading = false;
        });
      },
      error: (error) => {
        globalThis.setTimeout(() => {
          this.handleStateLoadError(error);
        });
      }
    });
  }

  protected isUiLocked(): boolean {
    return this.gameState.isProcessingTurn;
  }

  private handleMissingSession(): void {
    this.gameState.clearGalaxy();
    this.isLoading = false;
    this.isGameReady = false;
    this.stateTitle = 'Login required';
    this.stateError = 'Login to continue, then start or join a game.';
    this.stateActionLabel = 'Go to login';
    this.stateActionRoute = '/login';
  }

  private handleStateLoadError(error: { status?: number; error?: { error?: string } }): void {
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
}
