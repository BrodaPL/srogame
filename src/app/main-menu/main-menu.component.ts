import { Component, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import type { CurrentGameStatusResponse } from '../models/game-api-types';

@Component({
  selector: 'app-main-menu',
  imports: [RouterLink],
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.css'
})
export class MainMenuComponent {
  protected readonly session: AuthStateService['session'];
  protected currentGameStatus: CurrentGameStatusResponse | null = null;
  protected isLoadingCurrentGameStatus = false;
  protected resumeError: string | null = null;

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
        this.isLoadingCurrentGameStatus = false;
        this.resumeError = null;
        return;
      }

      this.loadCurrentGameStatus(session.token);
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

  protected showCurrentGameCard(): boolean {
    return !!this.session();
  }

  protected currentGameName(): string {
    return this.currentGameStatus?.game?.name ?? 'No current game selected';
  }

  protected currentGameStatusLabel(): string {
    const game = this.currentGameStatus?.game;
    if (!game) {
      return this.isLoadingCurrentGameStatus ? 'Checking current game' : 'No game selected';
    }

    if (this.currentGameStatus?.canResume) {
      return 'Running';
    }

    if (game.kind === 'MULTIPLAYER' && game.status === 'RUNNING') {
      return 'Saved / Inactive';
    }

    return game.status;
  }

  protected resumeUnavailableReason(): string | null {
    if (this.resumeError) {
      return this.resumeError;
    }

    const game = this.currentGameStatus?.game;
    if (!game) {
      return 'Select or create a game first.';
    }

    if (this.currentGameStatus?.canResume) {
      return null;
    }

    if (game.kind === 'MULTIPLAYER' && game.status === 'RUNNING') {
      return 'This multiplayer game is saved and inactive. Open Multiplayer to resume it.';
    }

    return this.currentGameStatus?.unavailableReason ?? 'This game is not currently available.';
  }

  protected currentGameHint(): string | null {
    const game = this.currentGameStatus?.game;
    if (!game) {
      return null;
    }

    if (this.currentGameStatus?.canResume) {
      return game.kind === 'MULTIPLAYER'
        ? 'Resume directly into the current running multiplayer game.'
        : 'Resume directly into your current game.';
    }

    return this.resumeUnavailableReason();
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
}
