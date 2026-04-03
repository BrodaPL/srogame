import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, forkJoin } from 'rxjs';
import { AuthStateService } from '../../core/auth-state.service';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import { BOT_PROFILE_IDS, BotProfileId } from '../../models/player';
import { BotAdminStateDto, BotDecisionTraceDto } from '../../models/game-api-types';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';

@Component({
  selector: 'app-bot-debug-view',
  imports: [TopMenuComponent, FormsModule],
  templateUrl: './bot-debug-view.component.html',
  styleUrl: './bot-debug-view.component.css'
})
export class BotDebugViewComponent implements OnInit {
  protected isLoading = false;
  protected isApplyingAction = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected traces: BotDecisionTraceDto[] = [];
  protected botStates: BotAdminStateDto[] = [];
  protected botOptionList: Array<{ playerId: number; playerName: string }> = [];
  protected visibleTraceList: BotDecisionTraceDto[] = [];
  protected selectedBotNameLabel = 'All bots';
  protected selectedPlayerId: number | null = null;
  protected selectedProfileId: BotProfileId | null = null;
  protected currentTurn: number | null = null;

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService,
    private readonly changeDetectorRef: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    this.loadTraces();
  }

  protected canInspectBots(): boolean {
    return this.authState.session()?.localAdmin === true;
  }

  protected setSelectedPlayer(playerId: number | null): void {
    this.selectedPlayerId = playerId;
    this.selectedProfileId = this.selectedBotState()?.profileId ?? null;
    this.syncDerivedState();
  }

  protected refresh(): void {
    this.loadTraces();
  }

  protected selectedBotState(): BotAdminStateDto | null {
    if (this.selectedPlayerId === null) {
      return null;
    }

    return this.botStates.find((entry) => entry.playerId === this.selectedPlayerId) ?? null;
  }

  protected profileOptions(): BotProfileId[] {
    return BOT_PROFILE_IDS;
  }

  protected applySelectedProfile(): void {
    const state = this.selectedBotState();
    const token = this.sessionToken();
    if (!state || !this.selectedProfileId || !token) {
      return;
    }

    this.isApplyingAction = true;
    this.actionError = null;
    this.gameApi.setBotProfile(state.playerId, { profileId: this.selectedProfileId }, token)
      .pipe(finalize(() => {
        this.isApplyingAction = false;
      }))
      .subscribe({
        next: () => this.loadTraces(),
        error: (error) => {
          this.actionError = error?.error?.error ?? 'Unable to update bot profile.';
        }
      });
  }

  protected pauseSelectedBot(): void {
    this.runBotAction((playerId, token) => this.gameApi.pauseBot(playerId, token), 'Unable to pause bot.');
  }

  protected resumeSelectedBot(): void {
    this.runBotAction((playerId, token) => this.gameApi.resumeBot(playerId, token), 'Unable to resume bot.');
  }

  protected clearSelectedBotMemory(): void {
    this.runBotAction((playerId, token) => this.gameApi.clearBotMemory(playerId, token), 'Unable to clear bot memory.');
  }

  protected stopReasonLabel(stopReason: BotDecisionTraceDto['actionBudget']['stopReason']): string {
    switch (stopReason) {
      case 'action_cap':
        return 'Action cap reached';
      case 'below_threshold':
        return 'Stopped below utility threshold';
      case 'no_candidates':
        return 'No valid candidates remained';
      default:
        return 'Still active';
    }
  }

  private loadTraces(): void {
    if (!this.canInspectBots()) {
      this.loadError = 'Bot traces are only available to local admin/controller sessions.';
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;

    forkJoin({
      traces: this.gameApi.getBotDecisionTraces(session.token),
      botStates: this.gameApi.getBotAdminStates(session.token)
    })
      .pipe(finalize(() => {
        this.isLoading = false;
        this.changeDetectorRef.detectChanges();
      }))
      .subscribe({
        next: (response) => {
          this.currentTurn = response.traces.turn;
          this.traces = response.traces.traces;
          this.botStates = response.botStates.bots;
          if (
            this.selectedPlayerId !== null
            && !this.botStates.some((bot) => bot.playerId === this.selectedPlayerId)
            && !this.traces.some((trace) => trace.playerId === this.selectedPlayerId)
          ) {
            this.selectedPlayerId = null;
          }
          this.selectedProfileId = this.selectedBotState()?.profileId ?? null;
          this.syncDerivedState();
          this.changeDetectorRef.detectChanges();
        },
        error: (error) => {
          this.loadError = error?.error?.error ?? 'Unable to load bot traces.';
          this.changeDetectorRef.detectChanges();
        }
      });
  }

  private syncDerivedState(): void {
    const options = new Map<number, string>();
    for (const bot of this.botStates) {
      options.set(bot.playerId, bot.playerName);
    }
    for (const trace of this.traces) {
      options.set(trace.playerId, trace.playerName);
    }

    this.botOptionList = [...options.entries()]
      .map(([playerId, playerName]) => ({ playerId, playerName }))
      .sort((left, right) => left.playerId - right.playerId);

    const traces = this.selectedPlayerId === null
      ? this.traces
      : this.traces.filter((trace) => trace.playerId === this.selectedPlayerId);
    this.visibleTraceList = [...traces].sort((left, right) =>
      right.turn - left.turn || right.playerId - left.playerId
    );

    this.selectedBotNameLabel = this.selectedPlayerId === null
      ? 'All bots'
      : this.botOptionList.find((option) => option.playerId === this.selectedPlayerId)?.playerName
        ?? `Bot ${this.selectedPlayerId}`;
  }

  private sessionToken(): string | null {
    return this.playerSession.load()?.token ?? null;
  }

  private runBotAction(
    action: (playerId: number, token: string) => ReturnType<GameApiService['pauseBot']>,
    fallbackError: string
  ): void {
    const state = this.selectedBotState();
    const token = this.sessionToken();
    if (!state || !token) {
      return;
    }

    this.isApplyingAction = true;
    this.actionError = null;
    action(state.playerId, token)
      .pipe(finalize(() => {
        this.isApplyingAction = false;
        this.changeDetectorRef.detectChanges();
      }))
      .subscribe({
        next: () => this.loadTraces(),
        error: (error) => {
          this.actionError = error?.error?.error ?? fallbackError;
          this.changeDetectorRef.detectChanges();
        }
      });
  }
}
