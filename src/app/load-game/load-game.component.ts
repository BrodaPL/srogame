import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { resolveApiErrorMessage } from '../i18n/api-message.utils';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';
import { GameSaveGroup, GameSaveSummary, GameSavesResponse, RecommendedReopenSave } from '../models/game-api-types';

@Component({
  selector: 'app-load-game',
  imports: [FormsModule, RouterLink, I18nPipe],
  templateUrl: './load-game.component.html',
  styleUrl: './load-game.component.css'
})
export class LoadGameComponent {
  protected readonly session: AuthStateService['session'];
  protected response: GameSavesResponse | null = null;
  protected isSummaryLoading = false;
  protected pendingAction: 'load' | 'delete' | null = null;
  protected pendingSaveId: string | null = null;
  protected summaryError: string | null = null;
  protected actionError: string | null = null;
  protected confirmReplaceActiveGame = false;
  protected selectedGameId: string | null = null;

  constructor(
    private readonly router: Router,
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly cdr: ChangeDetectorRef,
    private readonly i18n: I18nService
  ) {
    this.session = this.authState.session;
    this.loadSaves();
  }

  protected loadSaves(): void {
    this.isSummaryLoading = true;
    this.summaryError = null;

    const hadStoredSession = this.session() !== null;
    const token = this.session()?.token;
    this.selectedGameId = this.session()?.currentGameId ?? null;
    this.gameApi.getGameSaves(token).subscribe({
      next: (response) => {
        if (hadStoredSession && response.isLoggedIn !== true) {
          this.authState.clearSession();
          this.response = response;
          this.selectedGameId = null;
          this.summaryError = this.i18n.t('loadGame.messages.sessionExpired');
          this.isSummaryLoading = false;
          this.confirmReplaceActiveGame = false;
          this.cdr.markForCheck();
          return;
        }

        this.response = response;
        this.selectedGameId = response.currentSelectedGameId;
        this.isSummaryLoading = false;
        if (!response.activeGame) {
          this.confirmReplaceActiveGame = false;
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        if (error?.status === 401) {
          this.authState.clearSession();
          this.selectedGameId = null;
          this.summaryError = this.i18n.t('loadGame.messages.sessionExpired');
          this.isSummaryLoading = false;
          this.cdr.markForCheck();
          return;
        }

        this.response = null;
        this.summaryError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('loadGame.errors.loadSummary'));
        this.isSummaryLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  protected canManageSaves(): boolean {
    return this.response?.canManage === true;
  }

  protected selectedGameLabel(): string {
    return this.response?.currentSelectedGameName
      ? this.i18n.t('loadGame.messages.currentSelection', { gameName: this.response.currentSelectedGameName })
      : this.i18n.t('loadGame.messages.showingAllServerSaves');
  }

  protected recommendedReopen(): RecommendedReopenSave | null {
    return this.response?.recommendedReopen ?? null;
  }

  protected saveGroups(): GameSaveGroup[] {
    return this.response?.saveGroups ?? [];
  }

  protected canLoadGame(save: GameSaveSummary): boolean {
    return !!save
      && this.canManageSaves()
      && (!this.response?.activeGame || this.confirmReplaceActiveGame)
      && this.pendingAction === null;
  }

  protected canDeleteGame(save: GameSaveSummary): boolean {
    return !!save && this.canManageSaves() && this.pendingAction === null;
  }

  protected loadGame(save: GameSaveSummary): void {
    const session = this.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    if (!this.canLoadGame(save)) {
      return;
    }

    this.pendingAction = 'load';
    this.pendingSaveId = save.saveId;
    this.actionError = null;

    this.gameApi.loadGame(save.saveId, session.token).subscribe({
      next: (response) => {
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.pendingAction = null;
        this.pendingSaveId = null;
        this.cdr.markForCheck();
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.actionError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('loadGame.errors.loadSavedGame'));
        this.pendingAction = null;
        this.pendingSaveId = null;
        this.cdr.markForCheck();
        this.loadSaves();
      }
    });
  }

  protected deleteSave(save: GameSaveSummary): void {
    const session = this.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    if (!this.canDeleteGame(save)) {
      return;
    }

    this.pendingAction = 'delete';
    this.pendingSaveId = save.saveId;
    this.actionError = null;

    this.gameApi.deleteGameSave(save.saveId, session.token).subscribe({
      next: () => {
        this.pendingAction = null;
        this.pendingSaveId = null;
        this.cdr.markForCheck();
        this.loadSaves();
      },
      error: (error) => {
        this.actionError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('loadGame.errors.deleteSavedGame'));
        this.pendingAction = null;
        this.pendingSaveId = null;
        this.cdr.markForCheck();
        this.loadSaves();
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
        this.gameState.clearGalaxy();
        this.router.navigate(['/']);
      },
      error: () => {
        this.authState.clearSession();
        this.gameState.clearGalaxy();
        this.router.navigate(['/']);
      }
    });
  }

  protected isPendingLoad(save: GameSaveSummary): boolean {
    return this.pendingAction === 'load' && this.pendingSaveId === save.saveId;
  }

  protected isPendingDelete(save: GameSaveSummary): boolean {
    return this.pendingAction === 'delete' && this.pendingSaveId === save.saveId;
  }

  protected groupSubtitle(group: GameSaveGroup): string {
    const kindLabel = group.gameKind === 'MULTIPLAYER'
      ? this.i18n.t('loadGame.status.kindMultiplayer')
      : group.gameKind === 'SINGLEPLAYER'
        ? this.i18n.t('loadGame.status.kindSingleplayer')
        : this.i18n.t('loadGame.status.kindUntracked');
    const badges: string[] = [kindLabel, this.translatedGroupStatusLabel(group.statusLabel)];
    if (group.isCurrentGame) {
      badges.push(this.i18n.t('loadGame.status.currentSelectedGame'));
    } else if (group.isLastClosedGame) {
      badges.push(this.i18n.t('loadGame.status.recentlyClosedSingleplayerGame'));
    }

    return badges.join(' / ');
  }

  protected translatedGroupStatusLabel(statusLabel: string): string {
    switch (statusLabel) {
      case 'Current selected game':
        return this.i18n.t('loadGame.status.currentSelectedGame');
      case 'Recently closed single-player game':
        return this.i18n.t('loadGame.status.recentlyClosedSingleplayerGame');
      case 'Tracked saves':
        return this.i18n.t('loadGame.status.trackedSaves');
      case 'Untracked saves':
        return this.i18n.t('loadGame.status.untrackedSaves');
      case 'Active runtime':
        return this.i18n.t('loadGame.status.activeRuntime');
      case 'Saved / Inactive':
        return this.i18n.t('loadGame.status.savedInactive');
      case 'Archived':
        return this.i18n.t('loadGame.status.archived');
      case 'Singleplayer saves':
        return this.i18n.t('loadGame.status.singleplayerSaves');
      case 'Multiplayer saves':
        return this.i18n.t('loadGame.status.multiplayerSaves');
      default:
        return statusLabel;
    }
  }

  protected translatedCanManageReason(reason: string | null | undefined): string | null {
    switch (reason) {
      case 'Local admin privileges are required to manage saves.':
        return this.i18n.t('api.game.saves.requiresLocalAdmin');
      case 'Login required to manage saves.':
        return this.i18n.t('api.game.saves.loginRequiredToManage');
      default:
        return reason ?? null;
    }
  }

  protected autoSaveLabel(turns: number): string {
    return turns === 0
      ? this.i18n.t('loadGame.labels.disabled')
      : this.i18n.t('loadGame.labels.everyTurns', { turns });
  }

  protected saveCountLabel(count: number): string {
    return count === 1
      ? this.i18n.t('loadGame.labels.saveCountOne', { count })
      : this.i18n.t('loadGame.labels.saveCountMany', { count });
  }
}
