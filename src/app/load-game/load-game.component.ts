import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { GameSaveSummaryResponse } from '../models/game-api-types';

@Component({
  selector: 'app-load-game',
  imports: [FormsModule, RouterLink],
  templateUrl: './load-game.component.html'
})
export class LoadGameComponent {
  protected readonly session: AuthStateService['session'];
  protected summary: GameSaveSummaryResponse | null = null;
  protected isSummaryLoading = false;
  protected isLoadAction = false;
  protected summaryError: string | null = null;
  protected loadError: string | null = null;
  protected confirmReplaceActiveGame = false;

  constructor(
    private readonly router: Router,
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService
  ) {
    this.session = this.authState.session;
    this.loadSummary();
  }

  protected loadSummary(): void {
    this.isSummaryLoading = true;
    this.summaryError = null;

    const token = this.session()?.token;
    this.gameApi.getGameSaveSummary(token).subscribe({
      next: (summary) => {
        this.summary = summary;
        this.isSummaryLoading = false;
        if (!summary.activeGame) {
          this.confirmReplaceActiveGame = false;
        }
      },
      error: (error) => {
        this.summary = null;
        this.summaryError = error?.error?.error ?? 'Unable to load save summary.';
        this.isSummaryLoading = false;
      }
    });
  }

  protected canLoadGame(): boolean {
    return !!this.summary?.save
      && this.summary.canLoad
      && (!this.summary.activeGame || this.confirmReplaceActiveGame)
      && !this.isLoadAction;
  }

  protected loadGame(): void {
    const session = this.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    if (!this.canLoadGame()) {
      return;
    }

    this.isLoadAction = true;
    this.loadError = null;

    this.gameApi.loadGame(session.token).subscribe({
      next: (response) => {
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.isLoadAction = false;
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.loadError = error?.error?.error ?? 'Unable to load saved game.';
        this.isLoadAction = false;
        this.loadSummary();
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
}
