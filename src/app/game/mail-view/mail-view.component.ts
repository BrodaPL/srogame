import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs';
import { AuthStateService } from '../../core/auth-state.service';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import {
  MailRecipientDto,
  MailRequestDto,
  MailViewResponse,
  PlayerMailMessageDto
} from '../../models/game-api-types';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { MessageComposeDialogComponent } from '../ui/message-compose-dialog/message-compose-dialog.component';

@Component({
  selector: 'app-mail-view',
  imports: [TopMenuComponent, MessageComposeDialogComponent],
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
  protected selectedMessageId: number | null = null;
  protected activeRequestActionId: number | null = null;
  protected activeMessageDeleteId: number | null = null;
  protected activeRequestDeleteId: number | null = null;
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
    private readonly cdr: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    this.loadMailView();
  }

  protected pendingRequests(): MailRequestDto[] {
    return this.requests.filter((request) => request.state === 'PENDING');
  }

  protected resolvedRequests(): MailRequestDto[] {
    return this.requests.filter((request) => request.state !== 'PENDING');
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
    return request.direction === 'incoming' ? 'Incoming Request' : 'Outgoing Request';
  }

  protected requestSummary(request: MailRequestDto): string {
    if (request.direction === 'incoming') {
      return `${request.counterpartyPlayerName} requested ${request.requestedStatus}.`;
    }

    return `You requested ${request.requestedStatus} with ${request.counterpartyPlayerName}.`;
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

  protected canDeleteResolvedRequest(request: MailRequestDto): boolean {
    return request.state !== 'PENDING' && !this.isDeletingRequest(request);
  }

  protected isRequestActionPending(request: MailRequestDto): boolean {
    return this.activeRequestActionId === request.requestId;
  }

  protected isDeletingRequest(request: MailRequestDto): boolean {
    return this.activeRequestDeleteId === request.requestId;
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
          this.messages = this.messages.filter((entry) => entry.messageId !== message.messageId);
          if (this.selectedMessageId === message.messageId) {
            this.selectedMessageId = this.messages[0]?.messageId ?? null;
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

    this.activeRequestDeleteId = request.requestId;
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.deleteMailRequests({ requestIds: [request.requestId] }, session.token)
      .pipe(finalize(() => {
        this.activeRequestDeleteId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: () => {
          this.requests = this.requests.filter((entry) => entry.requestId !== request.requestId);
          this.syncMailCounts();
          this.actionSuccess = 'Request deleted.';
        },
        error: () => {
          this.actionError = 'Unable to delete request.';
        }
      });
  }

  protected acceptRequest(request: MailRequestDto): void {
    this.runRequestAction(
      request,
      (token) => this.gameApi.acceptDiplomaticProposal(request.requestId, token),
      'Unable to accept request.'
    );
  }

  protected rejectRequest(request: MailRequestDto): void {
    this.runRequestAction(
      request,
      (token) => this.gameApi.rejectDiplomaticProposal(request.requestId, token),
      'Unable to reject request.'
    );
  }

  protected cancelRequest(request: MailRequestDto): void {
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
    const previousSelectedId = this.selectedMessageId;
    this.currentTurn = response.currentTurn;
    this.currentPlayerId = response.currentPlayerId;
    this.messages = [...response.messages];
    this.requests = [...response.requests];
    this.recipients = [...response.recipients];
    this.allianceRecipientCount = response.allianceRecipientCount;
    this.selectedMessageId = previousSelectedId !== null && this.messages.some((entry) => entry.messageId === previousSelectedId)
      ? previousSelectedId
      : this.messages[0]?.messageId ?? null;
    this.syncMailCounts();
  }

  private runRequestAction(
    request: MailRequestDto,
    action: (token: string) => ReturnType<GameApiService['acceptDiplomaticProposal']>,
    fallbackError: string
  ): void {
    const session = this.playerSession.load();
    if (!session || this.activeRequestActionId !== null) {
      return;
    }

    this.activeRequestActionId = request.requestId;
    this.actionError = null;
    this.actionSuccess = null;

    action(session.token)
      .pipe(finalize(() => {
        this.activeRequestActionId = null;
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
}
