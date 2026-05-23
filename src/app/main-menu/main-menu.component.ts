import { ChangeDetectorRef, Component, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { resolveApiErrorMessage, resolveApiText } from '../i18n/api-message.utils';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';
import type { CurrentGameStatusResponse } from '../models/game-api-types';

@Component({
  selector: 'app-main-menu',
  imports: [RouterLink, I18nPipe],
  templateUrl: './main-menu.component.html',
  styleUrl: './main-menu.component.css'
})
export class MainMenuComponent {
  protected readonly appVersion = '0.910';
  protected readonly session: AuthStateService['session'];
  protected currentGameStatus: CurrentGameStatusResponse | null = null;
  protected isLoadingCurrentGameStatus = false;
  protected isClosingCurrentGame = false;
  protected resumeError: string | null = null;
  protected closeError: string | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly i18n: I18nService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.session = this.authState.session;
    effect(() => {
      const session = this.session();
      if (!session) {
        this.currentGameStatus = null;
        this.isLoadingCurrentGameStatus = false;
        this.isClosingCurrentGame = false;
        this.resumeError = null;
        this.closeError = null;
        this.cdr.markForCheck();
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

  protected shouldShowOpenMultiplayer(): boolean {
    const game = this.currentGameStatus?.game;
    return !!game
      && game.kind === 'MULTIPLAYER'
      && game.status === 'RUNNING'
      && this.currentGameStatus?.canResume !== true;
  }

  protected shouldShowCloseCurrentGame(): boolean {
    const game = this.currentGameStatus?.game;
    return this.session()?.localAdmin === true
      && !!game
      && game.kind === 'SINGLEPLAYER'
      && game.isLoaded === true
      && this.currentGameStatus?.canResume === true;
  }

  protected showCurrentGameCard(): boolean {
    return !!this.session();
  }

  protected currentGameName(): string {
    return this.currentGameStatus?.game?.name ?? this.i18n.t('mainMenu.currentGame.noCurrentGameSelected');
  }

  protected currentGameStatusLabel(): string {
    const game = this.currentGameStatus?.game;
    if (!game) {
      return this.isLoadingCurrentGameStatus
        ? this.i18n.t('mainMenu.currentGame.checkingCurrentGame')
        : this.i18n.t('mainMenu.currentGame.noGameSelected');
    }

    if (this.currentGameStatus?.canResume) {
      return this.i18n.t('mainMenu.currentGame.running');
    }

    if (game.kind === 'MULTIPLAYER' && game.status === 'RUNNING') {
      return this.i18n.t('mainMenu.currentGame.savedInactive');
    }

    switch (game.status) {
      case 'DRAFT':
        return this.i18n.t('mainMenu.currentGame.draft');
      case 'OFFLINE':
        return this.i18n.t('mainMenu.currentGame.offline');
      case 'ARCHIVED':
        return this.i18n.t('mainMenu.currentGame.archived');
      default:
        return game.status;
    }
  }

  protected resumeUnavailableReason(): string | null {
    if (this.resumeError) {
      return this.resumeError;
    }

    const game = this.currentGameStatus?.game;
    if (!game) {
      return this.i18n.t('mainMenu.currentGame.selectOrCreateFirst');
    }

    if (this.currentGameStatus?.canResume) {
      return null;
    }

    if (game.kind === 'MULTIPLAYER' && game.status === 'RUNNING') {
      return this.i18n.t('mainMenu.currentGame.multiplayerSavedInactiveHint');
    }

    return resolveApiText(this.i18n, {
      text: this.currentGameStatus?.unavailableReason ?? null,
      key: this.currentGameStatus?.unavailableReasonKey ?? null,
      params: this.currentGameStatus?.unavailableReasonParams ?? null
    }, this.i18n.t('mainMenu.currentGame.unavailable'));
  }

  protected currentGameHint(): string | null {
    const game = this.currentGameStatus?.game;
    if (!game) {
      return null;
    }

    if (this.currentGameStatus?.canResume) {
      return game.kind === 'MULTIPLAYER'
        ? this.i18n.t('mainMenu.currentGame.resumeMultiplayerHint')
        : this.i18n.t('mainMenu.currentGame.resumeHint');
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
    this.closeError = null;
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
        this.cdr.markForCheck();
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.resumeError = resolveApiErrorMessage(
          this.i18n,
          error,
          this.i18n.t('mainMenu.currentGame.resumeUnavailable')
        );
        this.cdr.markForCheck();
        this.loadCurrentGameStatus(session.token);
      }
    });
  }

  protected closeCurrentGame(): void {
    const session = this.session();
    const gameId = this.currentGameStatus?.currentGameId;
    if (!session || !gameId || !this.shouldShowCloseCurrentGame()) {
      return;
    }

    this.isClosingCurrentGame = true;
    this.closeError = null;
    this.resumeError = null;
    this.gameApi.closeCurrentGame(gameId, session.token).subscribe({
      next: (status) => {
        this.currentGameStatus = status;
        this.isClosingCurrentGame = false;
        const nextSession = this.session();
        if (nextSession) {
          this.authState.setSession({
            ...nextSession,
            currentGameId: status.currentGameId
          });
        }
        this.gameState.clearGalaxy();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isClosingCurrentGame = false;
        this.closeError = resolveApiErrorMessage(
          this.i18n,
          error,
          this.i18n.t('mainMenu.currentGame.closeUnavailable')
        );
        this.cdr.markForCheck();
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
        this.isClosingCurrentGame = false;
        this.resumeError = null;
        this.closeError = null;
        this.cdr.markForCheck();
      },
      error: (error) => {
        if (error?.status === 401) {
          this.authState.clearSession();
        }
        this.currentGameStatus = null;
        this.isLoadingCurrentGameStatus = false;
        this.cdr.markForCheck();
      }
    });
  }
}
