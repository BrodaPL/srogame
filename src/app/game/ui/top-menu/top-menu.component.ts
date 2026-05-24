import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthStateService } from '../../../core/auth-state.service';
import { GameApiService } from '../../../core/game-api.service';
import { GameStateService } from '../../../core/game-state.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { resolveApiErrorMessage, resolveApiText } from '../../../i18n/api-message.utils';
import { I18nService } from '../../../i18n/i18n.service';
import { TutorialOverlayComponent } from '../../../tutorial/tutorial-overlay.component';
import { TutorialService } from '../../../tutorial/tutorial.service';
import { formatDurationLabel, getMultiplayerAutoSkipIdleMs } from '../../multiplayer-test-timing';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-top-menu',
  imports: [RouterLink, RouterLinkActive, TutorialOverlayComponent, TooltipDirective],
  templateUrl: './top-menu.component.html',
  styleUrl: './top-menu.component.css'
})
export class TopMenuComponent {
  protected endTurnError: string | null = null;

  constructor(
    private readonly router: Router,
    private readonly tutorialService: TutorialService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService,
    private readonly i18n: I18nService
  ) {}

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

  protected endTurnLabel(): string {
    const currentTurn = this.gameState.currentTurn();
    return currentTurn === null ? 'End Turn --' : `End Turn ${currentTurn}`;
  }

  protected unreadReportsCount(): number {
    return this.authState.session()?.unreadReportCount ?? 0;
  }

  protected unreadMailCount(): number {
    return this.authState.session()?.unreadMailCount ?? 0;
  }

  protected pendingRequestCount(): number {
    return this.authState.session()?.pendingRequestCount ?? 0;
  }

  protected mailAttentionCount(): number {
    return this.unreadMailCount() + this.pendingRequestCount();
  }

  protected isEndTurnBlockedByMail(): boolean {
    return this.unreadMailCount() > 0 || this.pendingRequestCount() > 0;
  }

  protected endTurnBlockedMessage(): string {
    const parts: string[] = [];
    if (this.pendingRequestCount() > 0) {
      parts.push(`resolve ${this.pendingRequestCount()} pending request${this.pendingRequestCount() === 1 ? '' : 's'}`);
    }
    if (this.unreadMailCount() > 0) {
      parts.push(`read ${this.unreadMailCount()} unread message${this.unreadMailCount() === 1 ? '' : 's'}`);
    }

    return `Open Mail and ${parts.join(' and ')} before ending the turn.`;
  }

  protected isMailRoute(): boolean {
    return this.router.url.includes('/game/mail');
  }

  protected showStickyMailButton(): boolean {
    return this.isEndTurnBlockedByMail() && !this.isMailRoute();
  }

  protected canInspectBots(): boolean {
    return this.authState.session()?.localAdmin === true;
  }

  protected isProcessingTurn(): boolean {
    return this.gameState.isProcessingTurn;
  }

  protected isWaitingForOtherPlayers(): boolean {
    const turnStatus = this.gameState.turnStatus;
    return !!turnStatus
      && turnStatus.requiresAllPlayersReady
      && !turnStatus.progressionBlockedReason
      && turnStatus.currentPlayerReady
      && turnStatus.waitingForPlayerIds.length > 0
      && !turnStatus.isProcessing;
  }

  protected isEndTurnBlockedByOnlineRequirement(): boolean {
    return !!this.gameState.turnStatus?.progressionBlockedReason;
  }

  protected showAutoSkipTurnControl(): boolean {
    return (this.gameState.turnStatus?.minimumOnlineHumanCount ?? 1) > 1;
  }

  protected isAutoSkipTurnEnabled(): boolean {
    return this.gameState.turnStatus?.currentPlayerAutoSkipEnabled === true;
  }

  protected autoSkipTurnTooltip(): string {
    return `Auto skip turn while AFK. After ${formatDurationLabel(getMultiplayerAutoSkipIdleMs())} of inactivity in this multiplayer game, your turns are skipped automatically. After 30 minutes of inactivity, you are removed from active multiplayer presence.`;
  }

  protected waitingForPlayersMessage(): string {
    const turnStatus = this.gameState.turnStatus;
    if (!turnStatus || turnStatus.waitingForPlayerNames.length === 0) {
      return 'Ready. Waiting for other players.';
    }

    return `Ready. Waiting for: ${turnStatus.waitingForPlayerNames.join(', ')}.`;
  }

  protected onlineRequirementMessage(): string {
    const turnStatus = this.gameState.turnStatus;
    return resolveApiText(this.i18n, {
      text: turnStatus?.progressionBlockedReason ?? null,
      key: turnStatus?.progressionBlockedReasonKey ?? null,
      params: turnStatus?.progressionBlockedReasonParams ?? null
    }, 'At least 2 human players must be online to progress this multiplayer game.')
      ?? 'At least 2 human players must be online to progress this multiplayer game.';
  }

  protected toggleAutoSkipTurn(): void {
    if (this.gameState.isProcessingTurn) {
      return;
    }

    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      this.endTurnError = 'Select a running multiplayer game first.';
      return;
    }

    this.gameApi.updateMultiplayerAutoSkipTurn(session.currentGameId, {
      enabled: !this.isAutoSkipTurnEnabled()
    }, session.token).subscribe({
      next: (turnStatus) => {
        this.endTurnError = null;
        this.gameState.setTurnStatus(turnStatus);
      },
      error: (error) => {
        this.endTurnError = resolveApiErrorMessage(this.i18n, error, 'Unable to update auto skip turn.');
      }
    });
  }

  protected endTurn(): void {
    if (
      this.gameState.isProcessingTurn
      || this.isEndTurnBlockedByMail()
      || this.isEndTurnBlockedByOnlineRequirement()
      || this.isWaitingForOtherPlayers()
    ) {
      if (this.isEndTurnBlockedByMail()) {
        this.endTurnError = this.endTurnBlockedMessage();
      } else if (this.isEndTurnBlockedByOnlineRequirement()) {
        this.endTurnError = this.onlineRequirementMessage();
      }
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.endTurnError = 'No player session found.';
      return;
    }

    this.endTurnError = null;
    this.gameState.setProcessingTurn(true);

    this.gameApi.endTurn(session.token, session.currentGameId)
      .pipe(finalize(() => {
        if (!this.gameState.isProcessingTurn) {
          return;
        }

        this.gameState.setProcessingTurn(false);
      }))
      .subscribe({
        next: (response) => {
          this.authState.setSession(response.player);
          this.gameState.setTurnStatus(response.turnStatus);
          this.gameState.setGalaxy(response.galaxy);
          if (response.resolution === 'WAITING') {
            this.gameState.setProcessingTurn(false);
            this.endTurnError = null;
            return;
          }

          window.location.reload();
        },
        error: (error) => {
          this.endTurnError = resolveApiErrorMessage(this.i18n, error, 'Unable to process turn.');
          this.gameState.setProcessingTurn(false);
        }
      });
  }

  private currentTutorialKey() {
    return this.tutorialService.currentViewKeyFromUrl(this.router.url);
  }
}
