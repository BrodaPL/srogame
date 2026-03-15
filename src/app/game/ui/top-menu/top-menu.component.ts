import { Location } from '@angular/common';
import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthStateService } from '../../../core/auth-state.service';
import { GameApiService } from '../../../core/game-api.service';
import { GameStateService } from '../../../core/game-state.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { TutorialOverlayComponent } from '../../../tutorial/tutorial-overlay.component';
import { TutorialService } from '../../../tutorial/tutorial.service';

@Component({
  selector: 'app-top-menu',
  imports: [RouterLink, RouterLinkActive, TutorialOverlayComponent],
  templateUrl: './top-menu.component.html'
})
export class TopMenuComponent {
  protected endTurnError: string | null = null;

  constructor(
    private readonly location: Location,
    private readonly router: Router,
    private readonly tutorialService: TutorialService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService
  ) {}

  public goBack(): void {
    this.location.back();
  }

  protected hasCurrentTutorial(): boolean {
    return this.tutorialService.hasTutorial(this.currentTutorialKey());
  }

  protected openCurrentTutorial(): void {
    const viewKey = this.currentTutorialKey();
    if (!viewKey) {
      return;
    }

    this.tutorialService.openTutorial(viewKey);
  }

  protected currentTurnLabel(): string {
    const currentTurn = this.gameState.currentTurn();
    return currentTurn === null ? 'Turn --' : `Turn ${currentTurn}`;
  }

  protected isProcessingTurn(): boolean {
    return this.gameState.isProcessingTurn;
  }

  protected endTurn(): void {
    if (this.gameState.isProcessingTurn) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.endTurnError = 'No player session found.';
      return;
    }

    this.endTurnError = null;
    this.gameState.setProcessingTurn(true);

    this.gameApi.endTurn(session.token)
      .pipe(finalize(() => {
        if (!this.gameState.isProcessingTurn) {
          return;
        }

        this.gameState.setProcessingTurn(false);
      }))
      .subscribe({
        next: (response) => {
          this.authState.setSession(response.player);
          this.gameState.setGalaxy(response.galaxy);
          window.location.reload();
        },
        error: (error) => {
          this.endTurnError = error?.error?.error ?? 'Unable to process turn.';
          this.gameState.setProcessingTurn(false);
        }
      });
  }

  private currentTutorialKey() {
    return this.tutorialService.currentViewKeyFromUrl(this.router.url);
  }
}
