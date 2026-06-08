import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { finalize } from 'rxjs';
import { AuthStateService } from '../../../core/auth-state.service';
import { GameApiService } from '../../../core/game-api.service';
import { GameStateService } from '../../../core/game-state.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { resolveApiErrorMessage, resolveApiText } from '../../../i18n/api-message.utils';
import { I18nPipe } from '../../../i18n/i18n.pipe';
import { I18nService } from '../../../i18n/i18n.service';
import { TutorialOverlayComponent } from '../../../tutorial/tutorial-overlay.component';
import { TutorialService } from '../../../tutorial/tutorial.service';
import { formatDurationLabel, getMultiplayerAutoSkipIdleMs } from '../../multiplayer-test-timing';
import { TooltipDirective } from '../../../shared/tooltip/tooltip.directive';

@Component({
  selector: 'app-top-menu',
  imports: [RouterLink, RouterLinkActive, TutorialOverlayComponent, TooltipDirective, I18nPipe],
  templateUrl: './top-menu.component.html',
  styleUrl: './top-menu.component.css'
})
export class TopMenuComponent {
  protected endTurnError: string | null = null;
  private nowMs = Date.now();
  private readonly countdownHandle: number;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly router: Router,
    private readonly tutorialService: TutorialService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService,
    private readonly i18n: I18nService
  ) {
    this.countdownHandle = window.setInterval(() => {
      this.nowMs = Date.now();
      this.cdr.markForCheck();
    }, 1000);
  }

  public ngOnDestroy(): void {
    window.clearInterval(this.countdownHandle);
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

  protected endTurnLabel(): string {
    if (this.isScheduledTurnsEnabled()) {
      return this.i18n.t('topMenu.actions.scheduledTurns');
    }
    const currentTurn = this.gameState.currentTurn();
    return currentTurn === null
      ? `${this.i18n.t('topMenu.actions.endTurn', { turn: '--' })}`
      : this.i18n.t('topMenu.actions.endTurn', { turn: currentTurn });
  }

  protected scheduledTurnsCountdownLabel(): string {
    const nextTurnAt = this.gameState.turnStatus?.scheduledTurnsNextTurnAt ?? null;
    if (!nextTurnAt) {
      return this.i18n.t('topMenu.status.nextScheduledTurnUnknown');
    }

    const nextMs = Date.parse(nextTurnAt);
    if (Number.isNaN(nextMs)) {
      return this.i18n.t('topMenu.status.nextScheduledTurnUnknown');
    }

    const remainingSeconds = Math.max(0, Math.ceil((nextMs - this.nowMs) / 1000));
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    const seconds = remainingSeconds % 60;
    const parts = hours > 0
      ? [hours, minutes, seconds]
      : [minutes, seconds];
    const time = parts.map((part) => String(part).padStart(2, '0')).join(':');
    return this.i18n.t('topMenu.status.nextScheduledTurnIn', { time });
  }

  protected isScheduledTurnsEnabled(): boolean {
    return this.gameState.turnStatus?.scheduledTurnsEnabled === true;
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
    if (this.isScheduledTurnsEnabled()) {
      return false;
    }
    return this.unreadMailCount() > 0 || this.pendingRequestCount() > 0;
  }

  protected endTurnBlockedMessage(): string {
    return this.i18n.t('api.gameplay.endTurn.mailBlocked', {
      pendingRequestCount: this.pendingRequestCount(),
      unreadMailCount: this.unreadMailCount()
    });
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
    return this.isScheduledTurnsEnabled() || (this.gameState.turnStatus?.minimumOnlineHumanCount ?? 1) > 1;
  }

  protected isAutoSkipTurnEnabled(): boolean {
    return this.gameState.turnStatus?.currentPlayerAutoSkipEnabled === true;
  }

  protected autoSkipTurnTooltip(): string {
    return this.i18n.t('topMenu.hints.autoSkipTooltip', {
      idleDuration: formatDurationLabel(getMultiplayerAutoSkipIdleMs())
    });
  }

  protected waitingForPlayersMessage(): string {
    const turnStatus = this.gameState.turnStatus;
    if (!turnStatus || turnStatus.waitingForPlayerNames.length === 0) {
      return this.i18n.t('topMenu.status.readyWaiting');
    }

    return this.i18n.t('topMenu.status.readyWaitingFor', {
      players: turnStatus.waitingForPlayerNames.join(', ')
    });
  }

  protected onlineRequirementMessage(): string {
    const turnStatus = this.gameState.turnStatus;
    return resolveApiText(this.i18n, {
      text: turnStatus?.progressionBlockedReason ?? null,
      key: turnStatus?.progressionBlockedReasonKey ?? null,
      params: turnStatus?.progressionBlockedReasonParams ?? null
    }, this.i18n.t('api.gameplay.endTurn.notEnoughOnlineHumans'))
      ?? this.i18n.t('api.gameplay.endTurn.notEnoughOnlineHumans');
  }

  protected reportsLabel(): string {
    return this.appendCount(this.i18n.t('topMenu.nav.reports'), this.unreadReportsCount());
  }

  protected mailLabel(): string {
    return this.appendCount(this.i18n.t('topMenu.nav.mail'), this.mailAttentionCount());
  }

  protected stickyMailButtonLabel(): string {
    return this.i18n.t('topMenu.notices.mailRequiresAttention', {
      count: this.mailAttentionCount()
    });
  }

  protected toggleAutoSkipTurn(): void {
    if (this.gameState.isProcessingTurn) {
      return;
    }

    const session = this.playerSession.load();
    if (!session?.currentGameId) {
      this.endTurnError = this.i18n.t('topMenu.errors.selectRunningMultiplayerFirst');
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
        this.endTurnError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('topMenu.errors.updateAutoSkipFailed'));
      }
    });
  }

  protected endTurn(): void {
    if (
      this.gameState.isProcessingTurn
      || this.isScheduledTurnsEnabled()
      || this.isEndTurnBlockedByMail()
      || this.isEndTurnBlockedByOnlineRequirement()
      || this.isWaitingForOtherPlayers()
    ) {
      if (this.isScheduledTurnsEnabled()) {
        this.endTurnError = this.scheduledTurnsCountdownLabel();
      } else if (this.isEndTurnBlockedByMail()) {
        this.endTurnError = this.endTurnBlockedMessage();
      } else if (this.isEndTurnBlockedByOnlineRequirement()) {
        this.endTurnError = this.onlineRequirementMessage();
      }
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.endTurnError = this.i18n.t('topMenu.errors.noPlayerSession');
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
          this.endTurnError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('topMenu.errors.processTurnFailed'));
          this.gameState.setProcessingTurn(false);
        }
      });
  }

  private appendCount(label: string, count: number): string {
    return count > 0 ? `${label} (${count})` : label;
  }

  private currentTutorialKey() {
    return this.tutorialService.currentViewKeyFromUrl(this.router.url);
  }
}
