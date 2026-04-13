import { ChangeDetectorRef, Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { GameSaveGroup, GameSaveSummary, GameSavesResponse, RecommendedReopenSave } from '../models/game-api-types';

@Component({
  selector: 'app-load-game',
  imports: [FormsModule, RouterLink],
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
    private readonly cdr: ChangeDetectorRef
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
          this.summaryError = 'Session expired. Please log in again.';
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
          this.summaryError = 'Session expired. Please log in again.';
          this.isSummaryLoading = false;
          this.cdr.markForCheck();
          return;
        }

        this.response = null;
        this.summaryError = error?.error?.error ?? 'Unable to load save summary.';
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
      ? `Current selection: ${this.response.currentSelectedGameName}`
      : 'Showing all server saves.';
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
        this.actionError = error?.error?.error ?? 'Unable to load saved game.';
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
        this.actionError = error?.error?.error ?? 'Unable to delete saved game.';
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
      ? 'Multiplayer'
      : group.gameKind === 'SINGLEPLAYER'
        ? 'Singleplayer'
        : 'Untracked';
    const badges: string[] = [kindLabel, group.statusLabel];
    if (group.isCurrentGame) {
      badges.push('Current selection');
    } else if (group.isLastClosedGame) {
      badges.push('Recently closed');
    }

    return badges.join(' / ');
  }
}
