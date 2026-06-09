import { ChangeDetectorRef, Component, OnDestroy, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { resolveApiErrorMessage, resolveApiText } from '../i18n/api-message.utils';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';
import { GameType } from '../models/enums/game-type';
import {
  STARTING_HOMEWORLD_PRESET_VALUES,
  StartingHomeworldPreset
} from '../models/enums/starting-homeworld-preset';
import { BOT_PROFILE_IDS, type BotProfileId } from '../models/player';
import {
  type BotProfileCountMap,
  DEFAULT_NEUTRAL_PLANET_PERCENT,
  DEFAULT_SCHEDULED_TURN_HOURS,
  DEFAULT_STARTING_HOMEWORLD_PRESET,
  type GameSaveSummary,
  type GalaxySetup,
  type GameSavesResponse,
  MAX_SCHEDULED_MULTIPLAYER_HUMAN_PLAYERS,
  MAX_STANDARD_MULTIPLAYER_HUMAN_PLAYERS,
  MAX_NEUTRAL_PLANET_PERCENT,
  MAX_AUTO_SAVE_TURNS,
  MIN_SCHEDULED_TURNS_GALAXY_SIZE,
  MIN_NEUTRAL_PLANET_PERCENT,
  type MultiplayerGameBrowserResponse,
  type MultiplayerGameDetailResponse,
  type MultiplayerGameListItem,
  type MultiplayerLobbyDto,
  type MultiplayerLobbyLoadSeatDto,
  type MultiplayerRunningMemberDto,
  SCHEDULED_TURN_HOURS,
  createDefaultBotProfileCounts,
  hasExactBotProfileCountMatch,
  normalizeGalaxySetup
} from '../models/game-api-types';
import { ResourcesPack } from '../models/resources-pack';

type LobbySetupForm = {
  gameType: GameType;
  galaxyName: string;
  galaxyWidth: string;
  galaxyHeight: string;
  galaxyCenterSize: string;
  voidChance: string;
  starsAmountModifierMin: string;
  starsAmountModifierMax: string;
  botsAmount: string;
  botDifficulty: string;
  neutralBotsAmount: string;
  neutralBotsDifficulty: string;
  botsUnitedAgainstHumans: boolean;
  autoSaveTurns: string;
  scheduledTurnsEnabled: boolean;
  scheduledTurnHours: Record<number, boolean>;
  startingHomeworldPreset: StartingHomeworldPreset;
  botProfileCounts: Record<string, string>;
  createRandomPlanets: boolean;
  createStartingShips: boolean;
  skipTutorial: boolean;
  startingMetal: string;
  startingCrystal: string;
  startingDeuterium: string;
};

@Component({
  selector: 'app-multiplayer',
  imports: [FormsModule, RouterLink, TooltipDirective, I18nPipe],
  templateUrl: './multiplayer.component.html',
  styleUrl: './multiplayer.component.css'
})
export class MultiplayerComponent implements OnDestroy {
  protected readonly fixedGameType = GameType.SANDBOX;
  protected readonly gameTypes = [GameType.PVP, GameType.PVPVE, GameType.PVE, GameType.SANDBOX];
  protected readonly botProfileIds = BOT_PROFILE_IDS;
  protected readonly scheduledTurnHours = SCHEDULED_TURN_HOURS;
  protected readonly minScheduledTurnsGalaxySize = MIN_SCHEDULED_TURNS_GALAXY_SIZE;
  protected readonly startingHomeworldPresetValues = STARTING_HOMEWORLD_PRESET_VALUES;
  protected readonly session: AuthStateService['session'];
  protected browserResponse: MultiplayerGameBrowserResponse | null = null;
  protected detailResponse: MultiplayerGameDetailResponse | null = null;
  protected saveResponse: GameSavesResponse | null = null;
  protected selectedGameId: string | null = null;
  protected isLoadingBrowser = false;
  protected isLoadingDetail = false;
  protected isLoadingSaves = false;
  protected isActing = false;
  protected error: string | null = null;
  protected infoMessage: string | null = null;
  protected showOtherGames = false;
  protected showArchivedGames = false;
  protected selectedSaveId = '';
  protected setupForm: LobbySetupForm = this.createForm(this.defaultSetup());
  protected showScheduledTurnsModal = false;
  private readonly refreshHandle: number;
  private browserRequestVersion = 0;
  private detailRequestVersion = 0;
  private saveRequestVersion = 0;
  private hasUnsavedSetupChanges = false;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly gameApi: GameApiService,
    private readonly gameState: GameStateService,
    private readonly router: Router,
    private readonly i18n: I18nService
  ) {
    this.session = this.authState.session;
    effect(() => {
      const session = this.session();
      if (!session) {
        this.error = null;
        this.infoMessage = null;
      }

      this.loadBrowser();
      this.loadAvailableSaves();
    });

    this.refreshHandle = window.setInterval(() => {
      if (!this.isActing) {
        this.loadBrowser(false);
        if (this.selectedGameId) {
          this.loadSelectedGameDetail(false);
        }
      }
    }, 5000);
  }

  public ngOnDestroy(): void {
    window.clearInterval(this.refreshHandle);
  }

  protected activeDraftLobbies(): MultiplayerGameListItem[] {
    return this.browserResponse?.activeDraftLobbies ?? [];
  }

  protected activeRunningGames(): MultiplayerGameListItem[] {
    return this.browserResponse?.activeRunningGames ?? [];
  }

  protected otherMultiplayerGames(): MultiplayerGameListItem[] {
    return this.browserResponse?.otherMultiplayerGames ?? [];
  }

  protected visibleOtherMultiplayerGames(): MultiplayerGameListItem[] {
    return this.otherMultiplayerGames().filter((item) => item.status !== 'ARCHIVED');
  }

  protected archivedMultiplayerGames(): MultiplayerGameListItem[] {
    return this.otherMultiplayerGames().filter((item) => item.status === 'ARCHIVED');
  }

  protected selectedBrowserItem(): MultiplayerGameListItem | null {
    const gameId = this.selectedGameId;
    if (!gameId) {
      return null;
    }

    return [...this.activeDraftLobbies(), ...this.activeRunningGames(), ...this.otherMultiplayerGames()]
      .find((entry) => entry.gameId === gameId) ?? null;
  }

  protected selectedLobby(): MultiplayerLobbyDto | null {
    return this.detailResponse?.lobby ?? null;
  }

  protected selectedGame(): MultiplayerGameDetailResponse['game'] | null {
    return this.detailResponse?.game ?? null;
  }

  protected selectedRunningMembers(): MultiplayerRunningMemberDto[] {
    return this.detailResponse?.runningMembers ?? [];
  }

  protected availableSaves(): GameSaveSummary[] {
    return this.saveResponse?.saves ?? [];
  }

  protected hasGames(): boolean {
    return this.activeDraftLobbies().length > 0
      || this.activeRunningGames().length > 0
      || this.visibleOtherMultiplayerGames().length > 0
      || this.archivedMultiplayerGames().length > 0;
  }

  protected isSelected(item: MultiplayerGameListItem): boolean {
    return this.selectedGameId === item.gameId;
  }

  protected canCreateLobby(): boolean {
    return this.session()?.localAdmin === true && !this.isActing;
  }

  protected canManageSelectedLobby(): boolean {
    return this.selectedLobby()?.canManage === true;
  }

  protected canStartSelectedLobby(): boolean {
    return this.selectedLobby()?.canStart === true && !this.isActing;
  }

  protected canResumeSelectedLobby(): boolean {
    return this.selectedBrowserItem()?.canResumeLobby === true && !this.isActing;
  }

  protected canArchiveSelectedGame(): boolean {
    return this.selectedBrowserItem()?.canArchive === true && !this.isActing;
  }

  protected configuredBotsAmount(): number {
    return this.parseIntegerInRange(this.setupForm.botsAmount, 0, 12) ?? 0;
  }

  protected assignedBotProfilesCount(): number {
    if (this.configuredBotsAmount() === 0) {
      return 0;
    }

    return Object.values(this.buildBotProfileCounts(this.setupForm.botProfileCounts))
      .reduce((total, value) => total + value, 0);
  }

  protected botPersonalityValidationMessage(): string | null {
    const botsAmount = this.parseIntegerInRange(this.setupForm.botsAmount, 0, 12);
    if (botsAmount === null || botsAmount === 0) {
      return null;
    }

    const assigned = this.assignedBotProfilesCount();
    if (assigned === botsAmount) {
      return null;
    }

    return this.i18n.t('multiplayer.botPersonalities.validation', {
      required: botsAmount,
      assigned
    });
  }

  protected botProfileCountValue(profileId: keyof BotProfileCountMap): string {
    return this.setupForm.botProfileCounts[profileId] ?? '0';
  }

  protected setBotProfileCountValue(profileId: keyof BotProfileCountMap, value: string): void {
    this.markSetupDirty();
    this.setupForm.botProfileCounts[profileId] = value;
  }

  protected selectGame(item: MultiplayerGameListItem): void {
    if (this.selectedGameId === item.gameId && this.detailResponse?.game.gameId === item.gameId) {
      return;
    }

    this.selectedGameId = item.gameId;
    this.detailResponse = null;
    this.infoMessage = null;
    this.error = null;
    this.hasUnsavedSetupChanges = false;
    this.loadSelectedGameDetail();
  }

  protected createLobby(): void {
    const session = this.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.createMultiplayerGame(session.token).subscribe({
      next: (response) => {
        this.isActing = false;
        this.detailResponse = response;
        this.selectedGameId = response.game.gameId;
        if (response.lobby) {
          this.syncSetupForm(response.lobby.setup, true);
          this.syncSelectedSaveFromLobby(response.lobby);
        }
        this.loadBrowser(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isActing = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.createLobbyFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  protected joinSelectedLobby(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      this.router.navigate(['/login']);
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.joinMultiplayerGame(gameId, session.token),
      this.i18n.t('multiplayer.messages.joinedDraftLobby')
    );
  }

  protected joinSelectedRunningGame(item?: MultiplayerGameListItem | null): void {
    const session = this.session();
    const target = item ?? this.selectedBrowserItem();
    if (!session || !target) {
      this.router.navigate(['/login']);
      return;
    }

    if (!target.canJoin || target.status !== 'RUNNING') {
      this.error = this.i18n.t('multiplayer.errors.runningGameNotJoinable');
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.joinRunningScheduledMultiplayerGame(target.gameId, session.token).subscribe({
      next: (response) => {
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.isActing = false;
        this.cdr.markForCheck();
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.joinRunningGameFailed'));
        this.isActing = false;
        this.cdr.markForCheck();
        this.loadSelectedGameDetail(false);
        this.loadBrowser(false);
      }
    });
  }

  protected leaveSelectedLobby(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      this.router.navigate(['/login']);
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.leaveMultiplayerLobby(gameId, session.token).subscribe({
      next: () => {
        this.isActing = false;
        this.infoMessage = this.i18n.t('multiplayer.messages.leftDraftLobby');
        this.loadBrowser(false);
        this.detailResponse = null;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isActing = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.leaveDraftLobbyFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  protected leaveCurrentGame(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      this.router.navigate(['/login']);
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.leaveCurrentMultiplayerGame(gameId, session.token).subscribe({
      next: (response) => {
        this.isActing = false;
        this.authState.setSession({
          ...session,
          currentGameId: response.currentGameId
        });
        this.infoMessage = this.translateLeaveCurrentGameMessage(response.message);
        this.loadBrowser(false);
        this.loadSelectedGameDetail(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isActing = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.leaveCurrentGameFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  protected reopenSelectedResumeLobby(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      this.router.navigate(['/login']);
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.reopenMultiplayerResumeLobby(gameId, session.token),
      this.i18n.t('multiplayer.messages.reopenedResumeLobby')
    );
  }

  protected archiveSelectedGame(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      this.router.navigate(['/login']);
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.archiveMultiplayerGame(gameId, session.token).subscribe({
      next: () => {
        this.isActing = false;
        this.infoMessage = this.i18n.t('multiplayer.messages.archivedGame');
        this.detailResponse = null;
        this.loadBrowser(false);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isActing = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.archiveFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  protected setReady(ready: boolean): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.setMultiplayerGameReady(gameId, { ready }, session.token),
      ready ? this.i18n.t('multiplayer.messages.markedReady') : this.i18n.t('multiplayer.messages.markedNotReady')
    );
  }

  protected saveSetup(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    const lobby = this.selectedLobby();
    if (!session || !gameId || !lobby) {
      return;
    }

    const setup = this.buildSetup(lobby.members.length);
    if (!setup) {
      this.error = this.botPersonalityValidationMessage() ?? this.i18n.t('multiplayer.errors.lobbySetupInvalid');
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.updateMultiplayerGameSetup(gameId, { setup }, session.token),
      this.i18n.t('multiplayer.messages.lobbySetupSaved')
    );
  }

  protected bindSave(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      return;
    }

    if (!this.selectedSaveId) {
      this.error = this.i18n.t('multiplayer.messages.selectedSaveRequired');
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.bindMultiplayerGameSave(gameId, { saveId: this.selectedSaveId }, session.token),
      this.i18n.t('multiplayer.messages.saveBound')
    );
  }

  protected clearSaveBinding(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.clearMultiplayerGameSave(gameId, session.token),
      this.i18n.t('multiplayer.messages.switchedToNewGame')
    );
  }

  protected assignSeat(savedPlayerId: number, nextValue: string): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      return;
    }

    const accountId = nextValue === '' ? null : Number(nextValue);
    if (nextValue !== '' && !Number.isInteger(accountId)) {
      this.error = this.i18n.t('multiplayer.errors.invalidSeatAssignment');
      return;
    }

    this.runDetailMutation(
      () => this.gameApi.assignMultiplayerGameSeat(gameId, { savedPlayerId, accountId }, session.token),
      this.i18n.t('multiplayer.messages.seatAssignmentUpdated')
    );
  }

  protected startLobbyGame(): void {
    const session = this.session();
    const gameId = this.selectedGameId;
    if (!session || !gameId) {
      this.router.navigate(['/login']);
      return;
    }

    if (!this.canStartSelectedLobby()) {
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.startMultiplayerGame(gameId, session.token).subscribe({
      next: (response) => {
        this.authState.setSession(response.player);
        this.gameState.setGalaxy(response.galaxy);
        this.isActing = false;
        this.cdr.markForCheck();
        this.router.navigate(['/game/imperium']);
      },
      error: (error) => {
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.startMultiplayerFailed'));
        this.isActing = false;
        this.cdr.markForCheck();
        this.loadSelectedGameDetail(false);
        this.loadBrowser(false);
      }
    });
  }

  protected enterRunningGame(item?: MultiplayerGameListItem | null): void {
    const session = this.session();
    const target = item ?? this.selectedBrowserItem();
    if (!session || !target) {
      this.router.navigate(['/login']);
      return;
    }

    if (!target.canEnter) {
      this.error = this.i18n.t('multiplayer.errors.gameNotEnterable');
      return;
    }

    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    this.gameApi.selectGame(target.gameId, session.token).subscribe({
      next: (status) => {
        const nextSession = this.session();
        if (nextSession) {
          this.authState.setSession({
            ...nextSession,
            currentGameId: status.currentGameId
          });
        }
        this.isActing = false;
        if (status.canResume) {
          this.router.navigate(['/game/imperium']);
          return;
        }

        this.error = resolveApiText(this.i18n, {
          text: status.unavailableReason ?? null,
          key: status.unavailableReasonKey ?? null,
          params: status.unavailableReasonParams ?? null
        }, this.i18n.t('multiplayer.errors.enterRunningGameInactive'));
        this.loadBrowser(false);
      },
      error: (error) => {
        this.isActing = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.enterRunningGameFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  protected seatValue(seat: MultiplayerLobbyLoadSeatDto): string {
    return seat.assignedAccountId === null ? '' : String(seat.assignedAccountId);
  }

  protected canSelectSeatMember(
    seat: MultiplayerLobbyLoadSeatDto,
    accountId: number
  ): boolean {
    const lobby = this.selectedLobby();
    if (!lobby) {
      return false;
    }

    return !lobby.loadSeats.some((entry) =>
      entry.savedPlayerId !== seat.savedPlayerId && entry.assignedAccountId === accountId
    );
  }

  protected browserStatusLabel(item: MultiplayerGameListItem): string {
    const sections = [
      this.translateMultiplayerStatusLabel(item.statusLabel),
      this.memberCountLabel(item.memberCount)
    ];
    return sections.join(' / ');
  }

  protected detailedStatusLabel(): string {
    const game = this.selectedGame();
    if (!game) {
      return '';
    }

    const sections: string[] = [this.i18n.t('multiplayer.status.multiplayer'), this.translateMultiplayerStatusLabel(game.status)];
    if (game.currentTurn !== null) {
      sections.push(this.i18n.t('multiplayer.status.currentTurn', { turn: game.currentTurn }));
    }
    return sections.join(' / ');
  }

  protected inactiveReasonLabel(item?: MultiplayerGameListItem | null): string | null {
    if (!item?.inactiveReasonText) {
      return null;
    }

    switch (item.inactiveReasonText) {
      case 'Stopped because no players remained present.':
        return this.i18n.t('multiplayer.inactiveReasons.noPresentHumans');
      case 'Stopped because not enough players remained online.':
        return this.i18n.t('multiplayer.inactiveReasons.tooFewOnlinePlayers');
      default:
        return item.inactiveReasonText;
    }
  }

  protected enterButtonLabel(item?: MultiplayerGameListItem | null): string {
    const target = item ?? this.selectedBrowserItem();
    return target?.canReturnToGame
      ? this.i18n.t('multiplayer.actions.returnToGame')
      : this.i18n.t('multiplayer.actions.enterRunningGame');
  }

  protected updatedAtLabel(item: MultiplayerGameListItem): string {
    return this.i18n.formatDateTime(item.updatedAt);
  }

  protected runningMemberStatusLabel(member: MultiplayerRunningMemberDto): string {
    if (member.isAutoSkipTurn) {
      return this.i18n.t('multiplayer.status.autoSkipTurn');
    }

    if (!member.isOfflineBotControlled) {
      return this.i18n.t('multiplayer.status.onlineHumanControlled');
    }

    const profileLabel = member.offlineBotProfileId
      ? this.botProfileLabel(member.offlineBotProfileId)
      : this.i18n.t('multiplayer.status.defaultBotProfile');
    return this.i18n.t('multiplayer.status.offlineBotControlled', { profile: profileLabel });
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

  protected markSetupDirty(): void {
    this.hasUnsavedSetupChanges = true;
  }

  protected openScheduledTurnsModal(): void {
    this.showScheduledTurnsModal = true;
  }

  protected closeScheduledTurnsModal(): void {
    this.showScheduledTurnsModal = false;
  }

  protected selectedScheduledTurnCount(): number {
    return this.scheduledTurnHours.filter((hour) => this.setupForm.scheduledTurnHours[hour]).length;
  }

  protected isScheduledMapTooSmall(): boolean {
    const width = Number(this.setupForm.galaxyWidth);
    const height = Number(this.setupForm.galaxyHeight);
    return Number.isFinite(width)
      && Number.isFinite(height)
      && (width < MIN_SCHEDULED_TURNS_GALAXY_SIZE || height < MIN_SCHEDULED_TURNS_GALAXY_SIZE);
  }

  protected scheduledTurnsSummary(): string {
    const selected = this.scheduledTurnHours.filter((hour) => this.setupForm.scheduledTurnHours[hour]);
    if (!this.setupForm.scheduledTurnsEnabled) {
      return this.i18n.t('multiplayer.messages.scheduledTurnsDisabled');
    }

    return selected.length === 1
      ? this.i18n.t('multiplayer.messages.scheduledTurnsPerDayOne', { count: selected.length })
      : this.i18n.t('multiplayer.messages.scheduledTurnsPerDayMany', { count: selected.length });
  }

  protected scheduledHourLabel(hour: number): string {
    return hour === 24 ? '00:00' : `${String(hour).padStart(2, '0')}:00`;
  }

  protected setDefaultScheduledTurns(): void {
    this.setupForm.scheduledTurnHours = this.createScheduledTurnHourMap(DEFAULT_SCHEDULED_TURN_HOURS);
    this.markSetupDirty();
  }

  protected loadBrowser(resetError = true): void {
    const requestVersion = ++this.browserRequestVersion;
    this.isLoadingBrowser = true;
    if (resetError) {
      this.error = null;
    }

    const token = this.session()?.token;
    this.gameApi.getMultiplayerGames(token).subscribe({
      next: (response) => {
        if (requestVersion !== this.browserRequestVersion) {
          return;
        }

        this.browserResponse = response;
        this.isLoadingBrowser = false;
        this.syncSessionCurrentGameId(response.selectedGameId);
        const nextSelectedGameId = this.resolveNextSelectedGameId(response);
        const selectionChanged = nextSelectedGameId !== this.selectedGameId;
        this.selectedGameId = nextSelectedGameId;

        if (!this.selectedGameId) {
          this.detailResponse = null;
          this.cdr.markForCheck();
          return;
        }

        if (selectionChanged || !this.detailResponse || this.detailResponse.game.gameId !== this.selectedGameId) {
          this.loadSelectedGameDetail(false);
          return;
        }

        this.cdr.markForCheck();
      },
      error: (error) => {
        if (requestVersion !== this.browserRequestVersion) {
          return;
        }

        this.browserResponse = null;
        this.detailResponse = null;
        this.isLoadingBrowser = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.loadBrowserFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  private loadSelectedGameDetail(resetError = true): void {
    if (!this.selectedGameId) {
      this.detailResponse = null;
      this.isLoadingDetail = false;
      return;
    }

    const requestVersion = ++this.detailRequestVersion;
    this.isLoadingDetail = true;
    if (resetError) {
      this.error = null;
    }

    const token = this.session()?.token;
    this.gameApi.getMultiplayerGameDetail(this.selectedGameId, token).subscribe({
      next: (response) => {
        if (requestVersion !== this.detailRequestVersion) {
          return;
        }

        this.detailResponse = response;
        this.isLoadingDetail = false;
        if (response.lobby) {
          this.syncSetupForm(response.lobby.setup, false);
          this.syncSelectedSaveFromLobby(response.lobby);
        } else {
          this.hasUnsavedSetupChanges = false;
        }
        this.cdr.markForCheck();
      },
      error: (error) => {
        if (requestVersion !== this.detailRequestVersion) {
          return;
        }

        this.detailResponse = null;
        this.isLoadingDetail = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.loadDetailFailed'));
        this.cdr.markForCheck();
      }
    });
  }

  private loadAvailableSaves(resetError = false): void {
    const requestVersion = ++this.saveRequestVersion;
    this.isLoadingSaves = true;
    if (resetError) {
      this.error = null;
    }

    const token = this.session()?.token;
    this.gameApi.getGameSaves(token).subscribe({
      next: (response) => {
        if (requestVersion !== this.saveRequestVersion) {
          return;
        }

        this.saveResponse = response;
        this.isLoadingSaves = false;
        this.syncSelectedSaveFromLobby(this.selectedLobby());
        this.cdr.markForCheck();
      },
      error: (error) => {
        if (requestVersion !== this.saveRequestVersion) {
          return;
        }

        this.saveResponse = null;
        this.isLoadingSaves = false;
        if (resetError) {
          this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.loadSavesFailed'));
        }
        this.cdr.markForCheck();
      }
    });
  }

  private runDetailMutation(
    action: () => ReturnType<GameApiService['getMultiplayerGameDetail']>,
    successMessage: string
  ): void {
    this.isActing = true;
    this.error = null;
    this.infoMessage = null;
    action().subscribe({
      next: (response) => {
        this.isActing = false;
        this.detailResponse = response;
        if (response.lobby) {
          this.syncSetupForm(response.lobby.setup, true);
          this.syncSelectedSaveFromLobby(response.lobby);
        } else {
          this.hasUnsavedSetupChanges = false;
        }
        this.infoMessage = successMessage;
        this.loadBrowser(false);
        this.loadAvailableSaves();
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isActing = false;
        this.error = resolveApiErrorMessage(this.i18n, error, this.i18n.t('multiplayer.errors.actionFailed'));
        this.cdr.markForCheck();
        this.loadSelectedGameDetail(false);
        this.loadBrowser(false);
      }
    });
  }

  private resolveNextSelectedGameId(response: MultiplayerGameBrowserResponse): string | null {
    const gameIds = new Set([
      ...response.activeDraftLobbies.map((entry) => entry.gameId),
      ...response.activeRunningGames.map((entry) => entry.gameId),
      ...response.otherMultiplayerGames.map((entry) => entry.gameId)
    ]);

    if (this.selectedGameId && gameIds.has(this.selectedGameId)) {
      return this.selectedGameId;
    }

    if (response.selectedGameId && gameIds.has(response.selectedGameId)) {
      return response.selectedGameId;
    }

    return response.activeDraftLobbies[0]?.gameId
      ?? response.activeRunningGames[0]?.gameId
      ?? response.otherMultiplayerGames[0]?.gameId
      ?? null;
  }

  private syncSessionCurrentGameId(currentGameId: string | null): void {
    const session = this.session();
    if (!session || session.currentGameId === currentGameId) {
      return;
    }

    this.authState.setSession({
      ...session,
      currentGameId
    });
  }

  private syncSelectedSaveFromLobby(lobby: MultiplayerLobbyDto | null): void {
    if (lobby?.boundSaveId) {
      this.selectedSaveId = lobby.boundSaveId;
      return;
    }

    const saves = this.availableSaves();
    if (saves.some((save) => save.saveId === this.selectedSaveId)) {
      return;
    }

    this.selectedSaveId = saves[0]?.saveId ?? '';
  }

  private buildSetup(playerAmount: number): GalaxySetup | null {
    const width = this.parseIntegerInRange(this.setupForm.galaxyWidth, 10, 100);
    const height = this.parseIntegerInRange(this.setupForm.galaxyHeight, 10, 100);
    const centerSize = this.parseIntegerInRange(this.setupForm.galaxyCenterSize, 5, 35);
    const voidChance = this.parseIntegerInRange(this.setupForm.voidChance, 0, 35);
    const starsMin = this.parseIntegerInRange(this.setupForm.starsAmountModifierMin, -10, 0);
    const starsMax = this.parseIntegerInRange(this.setupForm.starsAmountModifierMax, 1, 9);
    const botsAmount = this.parseIntegerInRange(this.setupForm.botsAmount, 0, 12);
    const botDifficulty = this.parseIntegerInRange(this.setupForm.botDifficulty, -75, 200);
    const neutralBotsAmount = this.parseIntegerInRange(
      this.setupForm.neutralBotsAmount,
      MIN_NEUTRAL_PLANET_PERCENT,
      MAX_NEUTRAL_PLANET_PERCENT
    );
    const neutralBotsDifficulty = this.parseIntegerInRange(this.setupForm.neutralBotsDifficulty, -100, 200);
    const autoSaveTurns = this.parseIntegerInRange(this.setupForm.autoSaveTurns, 0, MAX_AUTO_SAVE_TURNS);
    const botProfileCounts = botsAmount === 0
      ? createDefaultBotProfileCounts(0)
      : this.buildBotProfileCounts(this.setupForm.botProfileCounts);
    const startingMetal = this.parseIntegerInRange(this.setupForm.startingMetal, 0, 999999);
    const startingCrystal = this.parseIntegerInRange(this.setupForm.startingCrystal, 0, 999999);
    const startingDeuterium = this.parseIntegerInRange(this.setupForm.startingDeuterium, 0, 999999);
    const galaxyName = this.setupForm.galaxyName.trim();
    const scheduledTurnHours = this.scheduledTurnHours.filter((hour) => this.setupForm.scheduledTurnHours[hour]);
    const maxHumanPlayers = this.setupForm.scheduledTurnsEnabled
      ? MAX_SCHEDULED_MULTIPLAYER_HUMAN_PLAYERS
      : MAX_STANDARD_MULTIPLAYER_HUMAN_PLAYERS;

    if (
      !this.isValidGameType(this.setupForm.gameType)
      || !galaxyName
      || width === null
      || height === null
      || centerSize === null
      || voidChance === null
      || starsMin === null
      || starsMax === null
      || botsAmount === null
      || botDifficulty === null
      || !hasExactBotProfileCountMatch(botProfileCounts, botsAmount)
      || neutralBotsAmount === null
      || neutralBotsDifficulty === null
      || autoSaveTurns === null
      || playerAmount < 1
      || playerAmount > maxHumanPlayers
      || (this.setupForm.scheduledTurnsEnabled && scheduledTurnHours.length === 0)
      || (this.setupForm.scheduledTurnsEnabled && (
        (width !== null && width < MIN_SCHEDULED_TURNS_GALAXY_SIZE) ||
        (height !== null && height < MIN_SCHEDULED_TURNS_GALAXY_SIZE)
      ))
      || startingMetal === null
      || startingCrystal === null
      || startingDeuterium === null
    ) {
      return null;
    }

    return normalizeGalaxySetup({
      gameType: this.fixedGameType,
      galaxyName,
      galaxyWidth: width,
      galaxyHeight: height,
      galaxyCenterSize: centerSize,
      voidChance,
      starsAmountModifier: [starsMin, starsMax],
      playerAmount,
      botsAmount,
      botDifficulty,
      botProfileCounts,
      neutralBotsAmount,
      neutralBotsDifficulty,
      botsUnitedAgainstHumans: this.setupForm.botsUnitedAgainstHumans,
      autoSaveTurns,
      scheduledTurns: {
        enabled: this.setupForm.scheduledTurnsEnabled,
        enabledHours: scheduledTurnHours.length > 0 ? scheduledTurnHours : [...DEFAULT_SCHEDULED_TURN_HOURS]
      },
      startingHomeworldPreset: this.setupForm.startingHomeworldPreset,
      createRandomPlanets: this.setupForm.createRandomPlanets,
      createStartingShips: this.setupForm.createStartingShips,
      skipTutorial: this.setupForm.skipTutorial,
      startingResources: new ResourcesPack(startingMetal, startingCrystal, startingDeuterium)
    });
  }

  private createForm(setup: GalaxySetup): LobbySetupForm {
    return {
      gameType: this.fixedGameType,
      galaxyName: setup.galaxyName,
      galaxyWidth: String(setup.galaxyWidth),
      galaxyHeight: String(setup.galaxyHeight),
      galaxyCenterSize: String(setup.galaxyCenterSize),
      voidChance: String(setup.voidChance),
      starsAmountModifierMin: String(setup.starsAmountModifier[0]),
      starsAmountModifierMax: String(setup.starsAmountModifier[1]),
      botsAmount: String(setup.botsAmount),
      botDifficulty: String(setup.botDifficulty),
      neutralBotsAmount: String(setup.neutralBotsAmount),
      neutralBotsDifficulty: String(setup.neutralBotsDifficulty),
      botsUnitedAgainstHumans: setup.botsUnitedAgainstHumans === true,
      autoSaveTurns: String(setup.autoSaveTurns),
      scheduledTurnsEnabled: setup.scheduledTurns.enabled,
      scheduledTurnHours: this.createScheduledTurnHourMap(setup.scheduledTurns.enabledHours),
      startingHomeworldPreset: setup.startingHomeworldPreset,
      botProfileCounts: this.formStringsFromBotProfileCounts(
        setup.botProfileCounts ?? createDefaultBotProfileCounts(setup.botsAmount)
      ),
      createRandomPlanets: setup.createRandomPlanets === true,
      createStartingShips: setup.createStartingShips === true,
      skipTutorial: setup.skipTutorial === true,
      startingMetal: String(setup.startingResources.metal),
      startingCrystal: String(setup.startingResources.crystal),
      startingDeuterium: String(setup.startingResources.deuterium)
    };
  }

  private createScheduledTurnHourMap(enabledHours: number[]): Record<number, boolean> {
    const selected = new Set(enabledHours);
    return Object.fromEntries(
      this.scheduledTurnHours.map((hour) => [hour, selected.has(hour)])
    ) as Record<number, boolean>;
  }

  private syncSetupForm(setup: GalaxySetup, force: boolean): void {
    if (this.hasUnsavedSetupChanges && !force) {
      return;
    }

    this.setupForm = this.createForm(setup);
    this.hasUnsavedSetupChanges = false;
  }

  private parseIntegerInRange(value: string, min: number, max: number): number | null {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      return null;
    }

    return parsed;
  }

  private isValidGameType(value: unknown): value is GameType {
    return (
      value === GameType.PVP
      || value === GameType.PVPVE
      || value === GameType.PVE
      || value === GameType.SANDBOX
    );
  }

  private defaultSetup(): GalaxySetup {
    return normalizeGalaxySetup({
      gameType: this.fixedGameType,
      galaxyName: 'Multiplayer Sector',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: 2,
      botsAmount: 0,
      botDifficulty: 0,
      botProfileCounts: createDefaultBotProfileCounts(0),
      neutralBotsAmount: DEFAULT_NEUTRAL_PLANET_PERCENT,
      neutralBotsDifficulty: 0,
      botsUnitedAgainstHumans: false,
      autoSaveTurns: 5,
      startingHomeworldPreset: DEFAULT_STARTING_HOMEWORLD_PRESET,
      createRandomPlanets: false,
      createStartingShips: false,
      skipTutorial: true,
      startingResources: {
        metal: 6,
        crystal: 3,
        deuterium: 1
      }
    });
  }

  private buildBotProfileCounts(values: Record<string, string>): BotProfileCountMap {
    const counts = {} as BotProfileCountMap;
    for (const profileId of BOT_PROFILE_IDS) {
      const parsed = Number.parseInt(values[profileId] ?? '0', 10);
      counts[profileId] = Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
    }

    return counts;
  }

  private formStringsFromBotProfileCounts(counts: BotProfileCountMap): Record<string, string> {
    return BOT_PROFILE_IDS.reduce((result, profileId) => {
      result[profileId] = String(counts[profileId] ?? 0);
      return result;
    }, {} as Record<string, string>);
  }

  protected gameTypeLabel(gameType: GameType): string {
    return this.i18n.t(`multiplayer.gameTypes.${gameType}`);
  }

  protected botProfileLabel(profileId: BotProfileId): string {
    return this.i18n.t(`settings.botProfiles.${profileId}`);
  }

  protected botsUnitedAgainstHumansTooltip(): string {
    return this.i18n.t('multiplayer.botDiplomacy.tooltip');
  }

  protected startingHomeworldPresetLabel(preset: StartingHomeworldPreset): string {
    return this.i18n.t(`multiplayer.startingHomeworldPreset.presets.${preset}.label`);
  }

  protected startingHomeworldPresetTooltip(preset: StartingHomeworldPreset): string {
    return this.i18n.t(`multiplayer.startingHomeworldPreset.presets.${preset}.tooltip`);
  }

  protected autoSaveLabel(turns: number): string {
    return turns === 0
      ? this.i18n.t('multiplayer.messages.autoSaveDisabled')
      : this.i18n.t('multiplayer.messages.autoSaveEveryTurns', { turns });
  }

  protected selectedGameNoticeTitle(): string {
    return this.selectedBrowserItem()?.statusLabel === 'Saved / Inactive'
      ? this.i18n.t('multiplayer.sections.savedInactive')
      : this.i18n.t('multiplayer.sections.runningMultiplayerGame');
  }

  protected selectedGameNoticeBody(): string {
    return this.selectedBrowserItem()?.statusLabel === 'Saved / Inactive'
      ? this.i18n.t('multiplayer.detail.savedInactiveBody')
      : this.i18n.t('multiplayer.detail.runningBody');
  }

  protected selectedLobbyModeLabel(): string {
    return this.selectedLobby()?.mode === 'LOAD_SAVE'
      ? this.i18n.t('multiplayer.status.modeLoadSave')
      : this.i18n.t('multiplayer.status.modeNewGame');
  }

  protected seatAssignmentDescription(seat: MultiplayerLobbyLoadSeatDto): string {
    switch (seat.assignmentMode) {
      case 'BOT':
        return this.i18n.t('multiplayer.saveBinding.seatWillBecomeBot');
      case 'ORIGINAL':
        return this.i18n.t('multiplayer.saveBinding.originalSavedPlayerMatched');
      default:
        return this.i18n.t('multiplayer.saveBinding.replacementPlayerAssigned');
    }
  }

  protected translatedStartBlockedReason(reason: string | null): string | null {
    if (!reason) {
      return null;
    }

    if (reason === 'At least two joined players are required.') {
      return this.i18n.t('multiplayer.startBlockedReasons.atLeastTwoJoinedPlayers');
    }
    if (reason === 'All non-admin players must be ready.') {
      return this.i18n.t('multiplayer.startBlockedReasons.allNonAdminReady');
    }
    if (reason === 'Bind a saved game first.') {
      return this.i18n.t('multiplayer.startBlockedReasons.bindSaveFirst');
    }
    if (reason === 'Every joined player must be assigned to a saved human seat or leave the lobby.') {
      return this.i18n.t('multiplayer.startBlockedReasons.everyJoinedPlayerAssigned');
    }
    if (reason.startsWith('Scheduled Turns games can have at most ')) {
      return this.i18n.t('multiplayer.startBlockedReasons.scheduledTurnsMaxHumans', {
        count: MAX_SCHEDULED_MULTIPLAYER_HUMAN_PLAYERS
      });
    }
    if (reason.startsWith('Standard multiplayer games can have at most ')) {
      return this.i18n.t('multiplayer.startBlockedReasons.standardMaxHumans', {
        count: MAX_STANDARD_MULTIPLAYER_HUMAN_PLAYERS
      });
    }

    return reason;
  }

  private translateMultiplayerStatusLabel(statusLabel: string): string {
    switch (statusLabel) {
      case 'DRAFT':
        return this.i18n.t('multiplayer.status.draft');
      case 'RUNNING':
        return this.i18n.t('multiplayer.status.running');
      case 'ARCHIVED':
        return this.i18n.t('multiplayer.status.archived');
      case 'Resumed lobby':
        return this.i18n.t('multiplayer.status.resumedLobby');
      case 'Saved / Inactive':
        return this.i18n.t('multiplayer.status.savedInactive');
      default:
        return statusLabel;
    }
  }

  private memberCountLabel(count: number): string {
    return count === 1
      ? this.i18n.t('multiplayer.messages.selectedMembersCountOne', { count })
      : this.i18n.t('multiplayer.messages.selectedMembersCountMany', { count });
  }

  private translateLeaveCurrentGameMessage(message: string | null): string {
    if (!message) {
      return this.i18n.t('multiplayer.messages.leftCurrentGameDefault');
    }

    if (message === 'Not enough online players, saving and stopping the game.') {
      return this.i18n.t('api.multiplayer.leaveCurrentGame.savedBecauseTooFewOnlinePlayers');
    }

    return message;
  }
}
