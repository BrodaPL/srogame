import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize, Observable } from 'rxjs';
import { AuthStateService } from '../../core/auth-state.service';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import {
  JumpGateMailRequestDto,
  MailRecipientDto,
  MailRequestDto,
  MailViewResponse,
  MaintenanceMailRequestDto,
  MaintenanceTransferPayloadDto,
  PlayerMailMessageDto,
  SupportMailRequestDto
} from '../../models/game-api-types';
import { diplomacyStatusLabel, diplomacyVisualKey, ownerLabelWithDiplomacy } from '../../models/diplomacy/diplomacy-display';
import { DiplomaticStatus } from '../../models/diplomacy/diplomatic-status';
import { TutorialService } from '../../tutorial/tutorial.service';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { MessageComposeDialogComponent } from '../ui/message-compose-dialog/message-compose-dialog.component';

type MailFolderId = 'actionRequired' | 'waiting' | 'inbox' | 'history';

type MailFolderVm = {
  id: MailFolderId;
  label: string;
  count: number;
  tone: 'urgent' | 'normal' | 'muted';
};

type MailListItemVm = {
  key: string;
  kind: 'request' | 'message';
  title: string;
  summary: string;
  meta: string;
  badgeLabel: string;
  badgeClass: string;
  isUnread: boolean;
  request: MailRequestDto | null;
  message: PlayerMailMessageDto | null;
};

type MailDetailRowVm = {
  label: string;
  value: string;
};

@Component({
  selector: 'app-mail-view',
  imports: [TopMenuComponent, MessageComposeDialogComponent, FormsModule],
  templateUrl: './mail-view.component.html',
  styleUrl: './mail-view.component.css'
})
export class MailViewComponent implements OnInit {
  protected isLoading = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected actionSuccess: string | null = null;
  protected currentTurn: number | null = null;
  protected currentPlayerId: number | null = null;
  protected messages: PlayerMailMessageDto[] = [];
  protected requests: MailRequestDto[] = [];
  protected recipients: MailRecipientDto[] = [];
  protected allianceRecipientCount = 0;
  protected activeFolderId: MailFolderId = 'actionRequired';
  protected selectedItemKey: string | null = null;
  protected selectedMessageId: number | null = null;
  protected activeRequestActionKey: string | null = null;
  protected activeMessageDeleteId: number | null = null;
  protected activeRequestDeleteKey: string | null = null;
  protected partialApprovalRequestKey: string | null = null;
  protected partialApprovalFuel = 0;
  protected partialApprovalShipAmounts: Partial<Record<string, number>> = {};
  protected partialApprovalBombAmounts: Partial<Record<string, number>> = {};
  protected partialApprovalMetal = 0;
  protected partialApprovalCrystal = 0;
  protected partialApprovalDeuterium = 0;
  protected composerOpen = false;
  protected composerLockedTargetPlayerId: number | null = null;
  protected composerLockedTargetPlayerName: string | null = null;
  protected composerInitialTitle = '';
  protected composerInitialBody = '';
  protected composerAllowAlliance = true;
  protected composerTitleText = 'Compose Mail';
  protected composerSubmitLabel = 'Send message';

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly authState: AuthStateService,
    private readonly cdr: ChangeDetectorRef,
    private readonly tutorialService: TutorialService
  ) {}

  public ngOnInit(): void {
    this.scrollViewportToTop();
    this.loadMailView();
  }

  protected pendingRequests(): MailRequestDto[] {
    return this.requests.filter((request) => request.state === 'PENDING');
  }

  protected resolvedRequests(): MailRequestDto[] {
    return this.requests.filter((request) => request.state !== 'PENDING');
  }

  protected actionRequiredRequests(): MailRequestDto[] {
    return this.sortRequests(this.requests.filter((request) =>
      request.state === 'PENDING' && request.direction === 'incoming'
    ));
  }

  protected waitingRequests(): MailRequestDto[] {
    return this.sortRequests(this.requests.filter((request) =>
      request.state === 'PENDING' && request.direction === 'outgoing'
    ));
  }

  protected unreadMessages(): PlayerMailMessageDto[] {
    return this.messages.filter((message) => !message.isRead);
  }

  protected readMessages(): PlayerMailMessageDto[] {
    return this.messages.filter((message) => message.isRead);
  }

  protected selectedMessage(): PlayerMailMessageDto | null {
    if (this.selectedMessageId === null) {
      return null;
    }

    return this.messages.find((message) => message.messageId === this.selectedMessageId) ?? null;
  }

  protected mailFolders(): MailFolderVm[] {
    return [
      {
        id: 'actionRequired',
        label: 'Action Required',
        count: this.actionRequiredRequests().length,
        tone: this.actionRequiredRequests().length > 0 ? 'urgent' : 'normal'
      },
      {
        id: 'waiting',
        label: 'Waiting',
        count: this.waitingRequests().length,
        tone: 'normal'
      },
      {
        id: 'inbox',
        label: 'Inbox',
        count: this.messages.length,
        tone: this.unreadMessages().length > 0 ? 'urgent' : 'normal'
      },
      {
        id: 'history',
        label: 'History',
        count: this.resolvedRequests().length,
        tone: 'muted'
      }
    ];
  }

  protected activeFolder(): MailFolderVm {
    return this.mailFolders().find((folder) => folder.id === this.activeFolderId)
      ?? this.mailFolders()[0];
  }

  protected visibleItems(): MailListItemVm[] {
    switch (this.activeFolderId) {
      case 'actionRequired':
        return this.actionRequiredRequests().map((request) => this.requestListItem(request));
      case 'waiting':
        return this.waitingRequests().map((request) => this.requestListItem(request));
      case 'history':
        return this.sortRequests(this.resolvedRequests()).map((request) => this.requestListItem(request));
      case 'inbox':
      default:
        return this.sortedMessages().map((message) => this.messageListItem(message));
    }
  }

  protected selectedItem(): MailListItemVm | null {
    const items = this.visibleItems();
    if (items.length === 0) {
      return null;
    }

    return items.find((item) => item.key === this.selectedItemKey) ?? items[0];
  }

  protected selectedRequest(): MailRequestDto | null {
    const item = this.selectedItem();
    return item?.kind === 'request' ? item.request : null;
  }

  protected selectFolder(folderId: MailFolderId): void {
    this.activeFolderId = folderId;
    this.closePartialApproval();
    this.syncSelectedMailItem(null);
  }

  protected selectItem(item: MailListItemVm): void {
    this.selectedItemKey = item.key;
    this.closePartialApproval();
    if (item.kind === 'message' && item.message) {
      this.openMessage(item.message);
      return;
    }

    this.selectedMessageId = null;
    this.actionError = null;
    this.actionSuccess = null;
  }

  protected isItemSelected(item: MailListItemVm): boolean {
    return this.selectedItem()?.key === item.key;
  }

  protected openMessage(message: PlayerMailMessageDto): void {
    this.selectedMessageId = message.messageId;
    this.actionError = null;
    this.actionSuccess = null;

    if (message.isRead) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    this.gameApi.markMailMessageAsRead({ messageId: message.messageId }, session.token)
      .subscribe({
        next: () => {
          message.isRead = true;
          this.syncMailCounts();
          this.cdr.markForCheck();
        },
        error: () => {
          this.actionError = 'Unable to mark message as read.';
          this.cdr.markForCheck();
        }
      });
  }

  protected canReply(message: PlayerMailMessageDto | null): boolean {
    return !!message
      && message.senderPlayerId !== null
      && this.recipients.some((recipient) => recipient.playerId === message.senderPlayerId);
  }

  protected openNewMessageComposer(): void {
    this.composerLockedTargetPlayerId = null;
    this.composerLockedTargetPlayerName = null;
    this.composerInitialTitle = '';
    this.composerInitialBody = '';
    this.composerAllowAlliance = true;
    this.composerTitleText = 'Compose Mail';
    this.composerSubmitLabel = 'Send message';
    this.composerOpen = true;
  }

  protected openReplyComposer(message: PlayerMailMessageDto | null): void {
    if (!this.canReply(message) || !message) {
      return;
    }

    this.composerLockedTargetPlayerId = message.senderPlayerId;
    this.composerLockedTargetPlayerName = message.senderPlayerName ?? null;
    this.composerInitialTitle = `Re: ${message.title}`;
    this.composerInitialBody = '';
    this.composerAllowAlliance = false;
    this.composerTitleText = 'Reply';
    this.composerSubmitLabel = 'Send reply';
    this.composerOpen = true;
  }

  protected closeComposer(): void {
    this.composerOpen = false;
  }

  protected handleComposerSent(event: { deliveredCount: number }): void {
    const targetLabel = event.deliveredCount === 1 ? '1 recipient.' : `${event.deliveredCount} recipients.`;
    this.actionSuccess = `Message delivered to ${targetLabel}`;
  }

  protected requestCardTitle(request: MailRequestDto): string {
    if (request.requestType === 'JUMP_GATE') {
      return request.direction === 'incoming' ? 'Incoming Jump Gate Request' : 'Outgoing Jump Gate Request';
    }

    if (request.requestType === 'MAINTENANCE') {
      return request.direction === 'incoming' ? 'Incoming Maintenance Request' : 'Outgoing Maintenance Request';
    }

    if (request.requestType === 'SUPPORT') {
      return request.direction === 'incoming' ? 'Incoming Support Request' : 'Outgoing Support Request';
    }

    return request.direction === 'incoming' ? 'Incoming Request' : 'Outgoing Request';
  }

  protected requestBadge(request: MailRequestDto): string {
    if (request.requestType === 'JUMP_GATE') {
      return request.state === 'PENDING' ? 'JUMP GATE' : request.state;
    }

    if (request.requestType === 'MAINTENANCE') {
      return request.state === 'PENDING' ? 'MAINTENANCE' : request.state;
    }

    if (request.requestType === 'SUPPORT') {
      return request.state === 'PENDING' ? request.supportType : request.state;
    }

    return request.state === 'PENDING' ? diplomacyStatusLabel(request.requestedStatus) : request.state;
  }

  protected requestBadgeClass(request: MailRequestDto): string {
    const status = this.requestDisplayStatus(request);
    if (!status) {
      return 'badge';
    }

    return `badge diplomacy-badge diplomacy-badge--${diplomacyVisualKey(status)}`;
  }

  protected requestSummary(request: MailRequestDto): string {
    if (request.requestType === 'JUMP_GATE') {
      if (request.direction === 'incoming') {
        return `${this.counterpartyLabel(request)} requests Jump Gate access for Fleet #${request.fleetId} to ${request.targetPlanetName}.`;
      }

      return `Fleet #${request.fleetId} is waiting for Jump Gate access from ${this.counterpartyLabel(request)}.`;
    }

    if (request.requestType === 'MAINTENANCE') {
      if (request.direction === 'incoming') {
        return `${this.counterpartyLabel(request)} requests maintenance for Fleet #${request.fleetId} at ${request.targetPlanetName}.`;
      }

      return `Fleet #${request.fleetId} requested maintenance from ${this.counterpartyLabel(request)} at ${request.targetPlanetName}.`;
    }

    if (request.requestType === 'SUPPORT') {
      if (request.direction === 'incoming') {
        return `${this.counterpartyLabel(request)} requested ${this.supportTypeLabel(request)} for ${request.targetPlanetName}.`;
      }

      return `You requested ${this.supportTypeLabel(request)} from ${this.counterpartyLabel(request)} for ${request.targetPlanetName}.`;
    }

    if (request.direction === 'incoming') {
      return `${this.counterpartyLabel(request)} requested ${diplomacyStatusLabel(request.requestedStatus)}.`;
    }

    return `You requested ${diplomacyStatusLabel(request.requestedStatus)} with ${this.counterpartyLabel(request)}.`;
  }

  protected requestDetailLine(request: MailRequestDto): string {
    if (request.requestType === 'JUMP_GATE') {
      return `Mission ${request.missionType} | ${request.originPlanetName} -> ${request.targetPlanetName} | Ships: ${request.totalShips}`;
    }

    if (request.requestType === 'MAINTENANCE') {
      const requestedSummary = this.maintenancePayloadSummary(request.requested);
      const approvedSummary = request.approved ? this.maintenancePayloadSummary(request.approved) : null;
      if (approvedSummary) {
        return `Requested: ${requestedSummary} | Approved: ${approvedSummary}`;
      }

      return `Requested: ${requestedSummary}`;
    }

    if (request.requestType === 'SUPPORT') {
      if (request.supportType === 'RESOURCE_SUPPORT') {
        const requestedSummary = request.requestedResources ? this.resourcesSummary(request.requestedResources) : 'nothing';
        const approvedSummary = request.approvedResources ? this.resourcesSummary(request.approvedResources) : null;
        const sourceSummary = request.reservedSourcePlanetName ? ` | Reserved at ${request.reservedSourcePlanetName}` : '';
        if (approvedSummary) {
          return `Requested: ${requestedSummary} | Approved: ${approvedSummary}${sourceSummary}`;
        }

        return `Requested: ${requestedSummary}${sourceSummary}`;
      }

      if (request.minimumShips && request.minimumShips.length > 0) {
        const shipsSummary = request.minimumShips.map((entry) => `${entry.type} x${entry.amount}`).join(', ');
        const targetOwnerSummary = request.targetOwnerPlayerName ? ` | Target owner: ${this.playerLabelByName(request.targetOwnerPlayerName)}` : '';
        const prioritySummary = request.bombardmentPriorities
          ? ` | Priorities: ${request.bombardmentPriorities.main ?? 'Random'} / ${request.bombardmentPriorities.secondary ?? 'Random'} / ${request.bombardmentPriorities.tertiary ?? 'Random'}`
          : '';
        const launchSummary = request.launchedFleetId !== null
          ? ` | Launched Fleet #${request.launchedFleetId}${request.launchOriginPlanetName ? ` from ${request.launchOriginPlanetName}` : ''}`
          : '';
        return `Mission ${request.missionType ?? 'Unknown'} | Minimum: ${shipsSummary}${targetOwnerSummary}${prioritySummary}${launchSummary}`;
      }

      return request.resolutionNote ?? `Target ${request.targetPlanetName}`;
    }

    return `Requested status ${diplomacyStatusLabel(request.requestedStatus)}`;
  }

  protected requestTimingLine(request: MailRequestDto): string {
    if (request.requestType === 'JUMP_GATE' && request.state === 'PENDING') {
      return `Created on turn ${request.createdTurn} | Awaiting response`;
    }

    if (request.requestType === 'SUPPORT' && request.executionDueTurn !== null) {
      const fulfilledLabel = request.fulfilledTurn !== null ? ` | Fulfilled on turn ${request.fulfilledTurn}` : '';
      const expiryLabel = request.executionExpiresOnTurn !== null ? ` | Wait until turn ${request.executionExpiresOnTurn}` : '';
      return `Created on turn ${request.createdTurn} | Due on turn ${request.executionDueTurn}${expiryLabel}${fulfilledLabel}`;
    }

    return `Created on turn ${request.createdTurn} | Expires on turn ${request.expiresOnTurn}`;
  }

  protected requestDetailRows(request: MailRequestDto): MailDetailRowVm[] {
    return [
      { label: 'Counterparty', value: this.counterpartyLabel(request) },
      { label: 'State', value: request.state },
      { label: 'Direction', value: request.direction === 'incoming' ? 'Incoming' : 'Outgoing' },
      { label: 'Timing', value: this.requestTimingLine(request) },
      { label: 'Summary', value: this.requestSummary(request) },
      { label: 'Details', value: this.requestDetailLine(request) }
    ];
  }

  protected canAccept(request: MailRequestDto): boolean {
    return request.state === 'PENDING' && request.direction === 'incoming' && !this.isRequestActionPending(request);
  }

  protected canReject(request: MailRequestDto): boolean {
    return request.state === 'PENDING' && request.direction === 'incoming' && !this.isRequestActionPending(request);
  }

  protected canCancel(request: MailRequestDto): boolean {
    return request.state === 'PENDING' && request.direction === 'outgoing' && !this.isRequestActionPending(request);
  }

  protected canPartialApprove(request: MailRequestDto): request is MaintenanceMailRequestDto | SupportMailRequestDto {
    return (request.requestType === 'MAINTENANCE'
      || (request.requestType === 'SUPPORT' && request.supportType === 'RESOURCE_SUPPORT'))
      && request.state === 'PENDING'
      && request.direction === 'incoming'
      && !this.isRequestActionPending(request);
  }

  protected canDeleteResolvedRequest(request: MailRequestDto): boolean {
    return request.state !== 'PENDING' && !this.isDeletingRequest(request);
  }

  protected isRequestActionPending(request: MailRequestDto): boolean {
    return this.activeRequestActionKey === this.requestKey(request);
  }

  protected isDeletingRequest(request: MailRequestDto): boolean {
    return this.activeRequestDeleteKey === this.requestKey(request);
  }

  protected isPartialApprovalOpen(request: MailRequestDto): request is MaintenanceMailRequestDto | SupportMailRequestDto {
    return this.canPartialApprove(request) && this.partialApprovalRequestKey === this.requestKey(request);
  }

  protected maintenanceRequest(request: MailRequestDto): MaintenanceMailRequestDto | null {
    return request.requestType === 'MAINTENANCE' ? request : null;
  }

  protected senderLabel(message: PlayerMailMessageDto): string {
    if (message.senderPlayerId === null || !message.senderPlayerName) {
      return message.senderPlayerName ?? 'Unknown sender';
    }

    return ownerLabelWithDiplomacy(message.senderPlayerName, this.playerStatus(message.senderPlayerId));
  }

  protected jumpGateRequest(request: MailRequestDto): JumpGateMailRequestDto | null {
    return request.requestType === 'JUMP_GATE' ? request : null;
  }

  protected supportRequest(request: MailRequestDto): SupportMailRequestDto | null {
    return request.requestType === 'SUPPORT' ? request : null;
  }

  protected openPartialApproval(request: MaintenanceMailRequestDto | SupportMailRequestDto): void {
    this.partialApprovalRequestKey = this.requestKey(request);
    if (request.requestType === 'MAINTENANCE') {
      this.partialApprovalFuel = request.requested.fuel;
      this.partialApprovalShipAmounts = Object.fromEntries(
        request.requested.ships.map((entry) => [entry.type, entry.amount])
      );
      this.partialApprovalBombAmounts = Object.fromEntries(
        request.requested.bombs.map((entry) => [entry.type, entry.amount])
      );
      return;
    }

    this.partialApprovalMetal = request.requestedResources?.metal ?? 0;
    this.partialApprovalCrystal = request.requestedResources?.crystal ?? 0;
    this.partialApprovalDeuterium = request.requestedResources?.deuterium ?? 0;
  }

  protected closePartialApproval(): void {
    this.partialApprovalRequestKey = null;
    this.partialApprovalFuel = 0;
    this.partialApprovalShipAmounts = {};
    this.partialApprovalBombAmounts = {};
    this.partialApprovalMetal = 0;
    this.partialApprovalCrystal = 0;
    this.partialApprovalDeuterium = 0;
  }

  protected updatePartialApprovalFuel(value: number | string): void {
    this.partialApprovalFuel = this.normalizeAmount(value);
  }

  protected updatePartialShipAmount(type: string, value: number | string): void {
    this.partialApprovalShipAmounts[type] = this.normalizeAmount(value);
  }

  protected updatePartialBombAmount(type: string, value: number | string): void {
    this.partialApprovalBombAmounts[type] = this.normalizeAmount(value);
  }

  protected updatePartialResourceMetal(value: number | string): void {
    this.partialApprovalMetal = this.normalizeAmount(value);
  }

  protected updatePartialResourceCrystal(value: number | string): void {
    this.partialApprovalCrystal = this.normalizeAmount(value);
  }

  protected updatePartialResourceDeuterium(value: number | string): void {
    this.partialApprovalDeuterium = this.normalizeAmount(value);
  }

  protected submitPartialApproval(request: MaintenanceMailRequestDto | SupportMailRequestDto): void {
    if (request.requestType === 'SUPPORT') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.approveSupportRequest(request.requestId, this.buildPartialSupportPayload(request), token),
        'Unable to partially approve request.'
      );
      return;
    }

    this.runRequestAction(
      request,
      (token) => this.gameApi.approveMaintenanceRequest(request.requestId, this.buildPartialApprovalPayload(request), token),
      'Unable to partially approve request.'
    );
  }

  protected deleteMessage(message: PlayerMailMessageDto): void {
    const session = this.playerSession.load();
    if (!session || this.activeMessageDeleteId !== null) {
      return;
    }

    this.activeMessageDeleteId = message.messageId;
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.deleteMailMessages({ messageIds: [message.messageId] }, session.token)
      .pipe(finalize(() => {
        this.activeMessageDeleteId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          const deletedItemKey = `message:${message.messageId}`;
          this.messages = this.messages.filter((entry) => entry.messageId !== message.messageId);
          if (this.selectedItemKey === deletedItemKey || this.selectedMessageId === message.messageId) {
            this.syncSelectedMailItem(null);
          }
          this.syncMailCounts();
          this.actionSuccess = 'Message deleted.';
        },
        error: () => {
          this.actionError = 'Unable to delete message.';
        }
      });
  }

  protected deleteResolvedRequest(request: MailRequestDto): void {
    const session = this.playerSession.load();
    if (!session || !this.canDeleteResolvedRequest(request)) {
      return;
    }

    this.activeRequestDeleteKey = this.requestKey(request);
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.deleteMailRequests({
      requests: [{ requestId: request.requestId, requestType: request.requestType }]
    }, session.token)
      .pipe(finalize(() => {
        this.activeRequestDeleteKey = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          const deletedItemKey = this.requestKey(request);
          this.requests = this.requests.filter((entry) => this.requestKey(entry) !== this.requestKey(request));
          if (this.selectedItemKey === deletedItemKey) {
            this.syncSelectedMailItem(null);
          }
          this.syncMailCounts();
          this.actionSuccess = 'Request deleted.';
        },
        error: () => {
          this.actionError = 'Unable to delete request.';
        }
      });
  }

  protected acceptRequest(request: MailRequestDto): void {
    if (request.requestType === 'JUMP_GATE') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.approveJumpGateRequest(request.requestId, token),
        'Unable to approve Jump Gate request.'
      );
      return;
    }

    if (request.requestType === 'MAINTENANCE') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.approveMaintenanceRequest(request.requestId, null, token),
        'Unable to approve request.'
      );
      return;
    }

    if (request.requestType === 'SUPPORT') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.approveSupportRequest(request.requestId, null, token),
        'Unable to approve request.'
      );
      return;
    }

    this.runRequestAction(
      request,
      (token) => this.gameApi.acceptDiplomaticProposal(request.requestId, token),
      'Unable to accept request.'
    );
  }

  protected rejectRequest(request: MailRequestDto): void {
    if (request.requestType === 'JUMP_GATE') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.rejectJumpGateRequest(request.requestId, token),
        'Unable to reject Jump Gate request.'
      );
      return;
    }

    if (request.requestType === 'MAINTENANCE') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.rejectMaintenanceRequest(request.requestId, token),
        'Unable to reject request.'
      );
      return;
    }

    if (request.requestType === 'SUPPORT') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.rejectSupportRequest(request.requestId, token),
        'Unable to reject request.'
      );
      return;
    }

    this.runRequestAction(
      request,
      (token) => this.gameApi.rejectDiplomaticProposal(request.requestId, token),
      'Unable to reject request.'
    );
  }

  protected cancelRequest(request: MailRequestDto): void {
    if (request.requestType === 'JUMP_GATE') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.cancelJumpGateRequest(request.requestId, token),
        'Unable to cancel Jump Gate request.'
      );
      return;
    }

    if (request.requestType === 'MAINTENANCE') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.cancelMaintenanceRequest(request.requestId, token),
        'Unable to cancel request.'
      );
      return;
    }

    if (request.requestType === 'SUPPORT') {
      this.runRequestAction(
        request,
        (token) => this.gameApi.cancelSupportRequest(request.requestId, token),
        'Unable to cancel request.'
      );
      return;
    }

    this.runRequestAction(
      request,
      (token) => this.gameApi.cancelDiplomaticProposal(request.requestId, token),
      'Unable to cancel request.'
    );
  }

  private loadMailView(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.actionError = null;

    this.gameApi.getMailView(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.applyMailResponse(response);
        },
        error: (error) => {
          this.loadError = error?.error?.error ?? 'Unable to load mail.';
        }
      });
  }

  private applyMailResponse(response: MailViewResponse): void {
    const previousSelectedItemKey = this.selectedItemKey
      ?? (this.selectedMessageId !== null ? `message:${this.selectedMessageId}` : null);
    this.currentTurn = response.currentTurn;
    this.currentPlayerId = response.currentPlayerId;
    this.messages = [...response.messages];
    this.requests = [...response.requests];
    this.recipients = [...response.recipients];
    this.allianceRecipientCount = response.allianceRecipientCount;
    this.closePartialApproval();
    this.syncSelectedMailItem(previousSelectedItemKey);
    this.syncMailCounts();
    this.openTutorialAfterRender();
  }

  private runRequestAction(
    request: MailRequestDto,
    action: (token: string) => Observable<unknown>,
    fallbackError: string
  ): void {
    const session = this.playerSession.load();
    if (!session || this.activeRequestActionKey !== null) {
      return;
    }

    this.activeRequestActionKey = this.requestKey(request);
    this.actionError = null;
    this.actionSuccess = null;

    action(session.token)
      .pipe(finalize(() => {
        this.activeRequestActionKey = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.loadMailView();
        },
        error: (error) => {
          this.actionError = error?.error?.error ?? fallbackError;
        }
      });
  }

  private syncMailCounts(): void {
    const session = this.authState.session();
    if (!session) {
      return;
    }

    this.authState.setSession({
      ...session,
      unreadMailCount: this.messages.filter((message) => !message.isRead).length,
      pendingRequestCount: this.requests.filter((request) => request.state === 'PENDING' && request.direction === 'incoming').length
    });
  }

  private requestKey(request: MailRequestDto): string {
    return `${request.requestType}:${request.requestId}`;
  }

  private requestListItem(request: MailRequestDto): MailListItemVm {
    return {
      key: this.requestKey(request),
      kind: 'request',
      title: this.requestCardTitle(request),
      summary: this.requestSummary(request),
      meta: this.requestTimingLine(request),
      badgeLabel: this.requestBadge(request),
      badgeClass: this.requestBadgeClass(request),
      isUnread: request.state === 'PENDING' && request.direction === 'incoming',
      request,
      message: null
    };
  }

  private messageListItem(message: PlayerMailMessageDto): MailListItemVm {
    return {
      key: `message:${message.messageId}`,
      kind: 'message',
      title: message.title,
      summary: this.senderLabel(message),
      meta: `Turn ${message.createdTurn}`,
      badgeLabel: message.isRead ? 'Read' : 'Unread',
      badgeClass: message.isRead ? 'badge' : 'badge badge--jump',
      isUnread: !message.isRead,
      request: null,
      message
    };
  }

  private sortedMessages(): PlayerMailMessageDto[] {
    return [...this.messages].sort((left, right) =>
      right.createdTurn - left.createdTurn || right.messageId - left.messageId
    );
  }

  private sortRequests(requests: MailRequestDto[]): MailRequestDto[] {
    return [...requests].sort((left, right) =>
      left.expiresOnTurn - right.expiresOnTurn || right.createdTurn - left.createdTurn || left.requestId - right.requestId
    );
  }

  private syncSelectedMailItem(preferredKey: string | null): void {
    const activeItems = this.visibleItems();
    const preferredActiveItem = preferredKey
      ? activeItems.find((item) => item.key === preferredKey) ?? null
      : null;

    if (preferredActiveItem) {
      this.selectedItemKey = preferredActiveItem.key;
      this.selectedMessageId = preferredActiveItem.message?.messageId ?? null;
      return;
    }

    if (activeItems.length > 0) {
      this.selectedItemKey = activeItems[0].key;
      this.selectedMessageId = activeItems[0].message?.messageId ?? null;
      return;
    }

    const fallbackFolder = this.mailFolders().find((folder) => folder.count > 0) ?? null;
    if (!fallbackFolder) {
      this.selectedItemKey = null;
      this.selectedMessageId = null;
      return;
    }

    this.activeFolderId = fallbackFolder.id;
    const fallbackItem = this.visibleItems()[0] ?? null;
    this.selectedItemKey = fallbackItem?.key ?? null;
    this.selectedMessageId = fallbackItem?.message?.messageId ?? null;
  }

  private counterpartyLabel(request: MailRequestDto): string {
    return ownerLabelWithDiplomacy(
      request.counterpartyPlayerName,
      this.playerStatus(request.counterpartyPlayerId)
    );
  }

  private requestDisplayStatus(request: MailRequestDto): DiplomaticStatus | null {
    if (request.requestType === 'DIPLOMACY_PROPOSAL' && request.state === 'PENDING') {
      return request.requestedStatus;
    }

    return this.playerStatus(request.counterpartyPlayerId);
  }

  private playerStatus(playerId: number): DiplomaticStatus | null {
    if (playerId === this.currentPlayerId) {
      return DiplomaticStatus.SELF;
    }

    return this.recipients.find((recipient) => recipient.playerId === playerId)?.currentStatus ?? null;
  }

  private playerLabelByName(playerName: string): string {
    const recipient = this.recipients.find((entry) => entry.playerName === playerName) ?? null;
    return ownerLabelWithDiplomacy(playerName, recipient?.currentStatus ?? null);
  }

  private maintenancePayloadSummary(payload: MaintenanceTransferPayloadDto): string {
    const parts: string[] = [];
    if (payload.fuel > 0) {
      parts.push(`${payload.fuel} deuterium`);
    }
    if (payload.ships.length > 0) {
      parts.push(payload.ships.map((entry) => `${entry.type} x${entry.amount}`).join(', '));
    }
    if (payload.bombs.length > 0) {
      parts.push(payload.bombs.map((entry) => `${entry.type} x${entry.amount}`).join(', '));
    }

    return parts.length > 0 ? parts.join(' | ') : 'nothing';
  }

  private buildPartialApprovalPayload(request: MaintenanceMailRequestDto): MaintenanceTransferPayloadDto {
    return {
      fuel: Math.min(this.partialApprovalFuel, request.requested.fuel),
      ships: request.requested.ships
        .map((entry) => ({
          type: entry.type,
          amount: Math.min(this.partialApprovalShipAmounts[entry.type] ?? 0, entry.amount)
        }))
        .filter((entry) => entry.amount > 0),
      bombs: request.requested.bombs
        .map((entry) => ({
          type: entry.type,
          amount: Math.min(this.partialApprovalBombAmounts[entry.type] ?? 0, entry.amount)
        }))
        .filter((entry) => entry.amount > 0)
    };
  }

  private buildPartialSupportPayload(request: SupportMailRequestDto): { approvedResources: { metal: number; crystal: number; deuterium: number } } {
    return {
      approvedResources: {
        metal: Math.min(this.partialApprovalMetal, request.requestedResources?.metal ?? 0),
        crystal: Math.min(this.partialApprovalCrystal, request.requestedResources?.crystal ?? 0),
        deuterium: Math.min(this.partialApprovalDeuterium, request.requestedResources?.deuterium ?? 0)
      }
    };
  }

  private supportTypeLabel(request: SupportMailRequestDto): string {
    switch (request.supportType) {
      case 'RESOURCE_SUPPORT':
        return 'resource support';
      case 'PLANET_REPAIR':
        return 'planet repairs';
      case 'PLANET_DEFENSE':
        return 'planet defense';
      case 'ATTACK_TARGET':
        return 'attack support';
      case 'BOMBARD_TARGET':
        return 'bombardment support';
      case 'SIEGE_TARGET':
        return 'siege support';
      default:
        return request.supportType;
    }
  }

  private resourcesSummary(payload: { metal: number; crystal: number; deuterium: number }): string {
    const parts: string[] = [];
    if (payload.metal > 0) {
      parts.push(`${payload.metal} metal`);
    }
    if (payload.crystal > 0) {
      parts.push(`${payload.crystal} crystal`);
    }
    if (payload.deuterium > 0) {
      parts.push(`${payload.deuterium} deuterium`);
    }

    return parts.length > 0 ? parts.join(' | ') : 'nothing';
  }

  private normalizeAmount(value: number | string): number {
    const numericValue = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Math.max(0, Math.floor(numericValue));
  }

  private openTutorialAfterRender(): void {
    setTimeout(() => {
      this.cdr.detectChanges();
      this.tutorialService.autoOpenTutorial('mailView');
    });
  }

  private scrollViewportToTop(): void {
    if (typeof window === 'undefined') {
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }
}
