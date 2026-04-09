import { Component, effect } from '@angular/core';
import { Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import type { CurrentGameStatusResponse, GameListResponse, GameSummary } from '../models/game-api-types';

@Component({
  selector: 'app-main-menu',
  imports: [RouterLink],
  templateUrl: './main-menu.component.html'
})
export class MainMenuComponent {
  protected readonly session: AuthStateService['session'];
  protected currentGameStatus: CurrentGameStatusResponse | null = null;
  protected gameListResponse: GameListResponse | null = null;
  protected isLoadingCurrentGameStatus = false;
  protected isLoadingGames = false;
  protected resumeError: string | null = null;
  protected gameListError: string | null = null;
  protected pendingGameActionId: string | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService,
    private readonly router: Router
  ) {
    this.session = this.authState.session;
    effect(() => {
      const session = this.session();
      if (!session) {
        this.currentGameStatus = null;
        this.gameListResponse = null;
        this.isLoadingCurrentGameStatus = false;
        this.isLoadingGames = false;
        this.resumeError = null;
        this.gameListError = null;
        return;
      }

      this.loadCurrentGameStatus(session.token);
      this.loadGames(session.token);
    });
  }

  protected canManageSingleplayer(): boolean {
    return this.session()?.localAdmin === true;
  }

  protected canLoadGame(): boolean {
    return this.session()?.localAdmin === true;
  }

  protected canResumeCurrentGame(): boolean {
    return this.currentGameStatus?.canResume === true;
  }

  protected shouldShowResumeCurrentGame(): boolean {
    return !!this.session() && !!this.currentGameStatus?.game;
  }

  protected resumeUnavailableReason(): string | null {
    return this.currentGameStatus?.unavailableReason ?? null;
  }

  protected availableGames(): GameSummary[] {
    return this.gameListResponse?.games ?? [];
  }

  protected hasVisibleGames(): boolean {
    return this.availableGames().length > 0;
  }

  protected isCurrentGame(game: GameSummary): boolean {
    return this.session()?.currentGameId === game.gameId;
  }

  protected canEnterGame(game: GameSummary): boolean {
    return game.status === 'RUNNING';
  }

  protected gameStatusLabel(game: GameSummary): string {
    return `${game.kind} · ${game.status}${game.currentTurn === null ? '' : ` · Turn ${game.currentTurn}`}`;
  }

  protected resumeCurrentGame(): void {
    const session = this.session();
    const gameId = this.currentGameStatus?.currentGameId;
    if (!session || !gameId || this.currentGameStatus?.canResume !== true) {
      return;
    }

    this.resumeError = null;
    this.gameApi.selectGame(gameId, session.token).subscribe({
      next: (status) => {
        this.currentGameStatus = status;
        const nextSession = this.session();
        if (!nextSession) {
          return;
        }

        this.authState.setSession({
          ...nextSession,
          currentGameId: status.currentGameId
        });
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.resumeError = error?.error?.error ?? 'Unable to resume the selected game.';
        this.loadCurrentGameStatus(session.token);
      }
    });
  }

  protected selectGame(game: GameSummary): void {
    const session = this.session();
    if (!session || this.pendingGameActionId) {
      return;
    }

    this.pendingGameActionId = game.gameId;
    this.gameListError = null;
    this.gameApi.selectGame(game.gameId, session.token).subscribe({
      next: (status) => {
        const nextSession = this.session();
        if (nextSession) {
          this.authState.setSession({
            ...nextSession,
            currentGameId: status.currentGameId
          });
        }
        this.currentGameStatus = status;
        this.pendingGameActionId = null;
        this.loadGames(session.token);
      },
      error: (error) => {
        this.pendingGameActionId = null;
        this.gameListError = error?.error?.error ?? 'Unable to select the game.';
      }
    });
  }

  protected enterGame(game: GameSummary): void {
    const session = this.session();
    if (!session || this.pendingGameActionId) {
      return;
    }

    if (!this.canEnterGame(game)) {
      this.gameListError = 'This game is not currently active. Ask localAdmin to resume it.';
      return;
    }

    this.pendingGameActionId = game.gameId;
    this.gameListError = null;
    this.gameApi.selectGame(game.gameId, session.token).subscribe({
      next: (status) => {
        const nextSession = this.session();
        if (nextSession) {
          this.authState.setSession({
            ...nextSession,
            currentGameId: status.currentGameId
          });
        }
        this.currentGameStatus = status;
        this.pendingGameActionId = null;
        if (status.canResume) {
          this.router.navigate(['/game/imperium']);
          return;
        }

        this.resumeError = status.unavailableReason ?? 'This game is not currently active.';
        this.loadGames(session.token);
      },
      error: (error) => {
        this.pendingGameActionId = null;
        this.gameListError = error?.error?.error ?? 'Unable to enter the selected game.';
      }
    });
  }

  protected isPendingGameAction(game: GameSummary): boolean {
    return this.pendingGameActionId === game.gameId;
  }

  protected logout(): void {
    const session = this.session();
    if (!session) {
      return;
    }

    this.authApi.logout(session.token).subscribe({
      next: () => {
        this.authState.clearSession();
      },
      error: () => {
        this.authState.clearSession();
      }
    });
  }

  private loadCurrentGameStatus(token: string): void {
    this.isLoadingCurrentGameStatus = true;
    this.gameApi.getCurrentGameStatus(token).subscribe({
      next: (status) => {
        this.currentGameStatus = status;
        this.isLoadingCurrentGameStatus = false;
        this.resumeError = null;
      },
      error: () => {
        this.currentGameStatus = null;
        this.isLoadingCurrentGameStatus = false;
      }
    });
  }

  private loadGames(token: string): void {
    this.isLoadingGames = true;
    this.gameApi.getGames(token).subscribe({
      next: (response) => {
        this.gameListResponse = response;
        this.isLoadingGames = false;
        this.gameListError = null;
      },
      error: () => {
        this.gameListResponse = null;
        this.isLoadingGames = false;
        this.gameListError = 'Unable to load games list.';
      }
    });
  }
}
