import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { finalize } from 'rxjs';
import { GameApiService } from '../../core/game-api.service';
import { PlayerSessionService } from '../../core/player-session.service';
import {
  DiplomacyContactDto,
  DiplomaticProposalDto,
  DiplomacyViewResponse,
  MailRecipientDto
} from '../../models/game-api-types';
import { DiplomaticStatus } from '../../models/diplomacy/diplomatic-status';
import { PlayerType } from '../../models/enums/player-type';
import { TopMenuComponent } from '../ui/top-menu/top-menu.component';
import { MiniPlanetPreviewComponent } from '../ui/mini-planet-preview/mini-planet-preview.component';
import { MessageComposeDialogComponent } from '../ui/message-compose-dialog/message-compose-dialog.component';

@Component({
  selector: 'app-diplomacy-view',
  imports: [FormsModule, RouterLink, TopMenuComponent, MiniPlanetPreviewComponent, MessageComposeDialogComponent],
  templateUrl: './diplomacy-view.component.html',
  styleUrl: './diplomacy-view.component.css'
})
export class DiplomacyViewComponent implements OnInit {
  protected readonly playerType = PlayerType;
  protected readonly proposableStatuses = [
    DiplomaticStatus.ALLIED,
    DiplomaticStatus.PEACE,
    DiplomaticStatus.WAR
  ];

  protected isLoading = false;
  protected loadError: string | null = null;
  protected actionError: string | null = null;
  protected actionSuccess: string | null = null;
  protected contacts: DiplomacyContactDto[] = [];
  protected activeProposals: DiplomaticProposalDto[] = [];
  protected selectedPlayerId: number | null = null;
  protected currentPlayerId: number | null = null;
  protected currentTurn: number | null = null;
  protected outgoingProposalSentThisTurn = false;
  protected activeContactActionPlayerId: number | null = null;
  protected composerOpen = false;
  protected composerLockedTargetPlayerId: number | null = null;
  protected composerLockedTargetPlayerName: string | null = null;

  private proposalSelectionByPlayerId = new Map<number, DiplomaticStatus>();

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService,
    private readonly cdr: ChangeDetectorRef
  ) {}

  public ngOnInit(): void {
    this.loadDiplomacyView();
  }

  protected selectedContact(): DiplomacyContactDto | null {
    if (this.selectedPlayerId === null) {
      return null;
    }

    return this.contacts.find((contact) => contact.playerId === this.selectedPlayerId) ?? null;
  }

  protected selectContact(contact: DiplomacyContactDto): void {
    this.selectedPlayerId = contact.playerId;
    this.actionSuccess = null;
  }

  protected selectedProposalStatus(contact: DiplomacyContactDto): DiplomaticStatus {
    const stored = this.proposalSelectionByPlayerId.get(contact.playerId);
    if (stored && this.availableProposalStatuses(contact).includes(stored)) {
      return stored;
    }

    const fallback = this.availableProposalStatuses(contact)[0] ?? DiplomaticStatus.PEACE;
    this.proposalSelectionByPlayerId.set(contact.playerId, fallback);
    return fallback;
  }

  protected setSelectedProposalStatus(contact: DiplomacyContactDto, status: string): void {
    if (!this.proposableStatuses.includes(status as DiplomaticStatus)) {
      return;
    }

    this.proposalSelectionByPlayerId.set(contact.playerId, status as DiplomaticStatus);
  }

  protected availableProposalStatuses(contact: DiplomacyContactDto): DiplomaticStatus[] {
    return this.proposableStatuses.filter((status) => status !== contact.currentStatus);
  }

  protected proposalAvailabilityCopy(contact: DiplomacyContactDto): string {
    if (contact.canSendProposal) {
      return 'Send one treaty proposal to this player this turn. It applies immediately if they accept.';
    }

    return contact.proposalBlockedReason ?? 'Treaty proposals are unavailable for this contact.';
  }

  protected mailRecipients(): MailRecipientDto[] {
    return this.contacts
      .filter((contact) => contact.canSendMessage)
      .map((contact) => ({
        playerId: contact.playerId,
        playerName: contact.playerName,
        playerType: contact.playerType,
        currentStatus: contact.currentStatus,
        isAllianceMember: contact.currentStatus === DiplomaticStatus.ALLIED
      }));
  }

  protected contactStatusLabel(contact: DiplomacyContactDto): string {
    return `${contact.playerType} | ${contact.currentStatus}`;
  }

  protected contactMetaLabel(contact: DiplomacyContactDto): string {
    return `${contact.knownPlanets.length} known planet(s)`;
  }

  protected proposalCounterpartyLabel(proposal: DiplomaticProposalDto): string {
    return proposal.direction === 'incoming'
      ? `From ${proposal.fromPlayerName}`
      : `To ${proposal.toPlayerName}`;
  }

  protected isContactActionPending(contact: DiplomacyContactDto): boolean {
    return this.activeContactActionPlayerId === contact.playerId;
  }

  protected proposalMailActionLabel(proposal: DiplomaticProposalDto): string {
    return proposal.direction === 'incoming'
      ? 'Open Mail to answer'
      : 'Open Mail to review';
  }

  protected sendProposal(contact: DiplomacyContactDto): void {
    if (!contact.canSendProposal || this.activeContactActionPlayerId !== null) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.actionError = 'No player session found.';
      return;
    }

    const requestedStatus = this.selectedProposalStatus(contact);
    this.activeContactActionPlayerId = contact.playerId;
    this.actionError = null;
    this.actionSuccess = null;

    this.gameApi.createDiplomaticProposal(
      {
        targetPlayerId: contact.playerId,
        requestedStatus
      },
      session.token
    )
      .pipe(finalize(() => {
        this.activeContactActionPlayerId = null;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.applyViewResponse(response);
        },
        error: (error) => {
          this.actionError = error?.error?.error ?? 'Unable to send diplomacy proposal.';
        }
      });
  }

  protected openMessageComposer(contact: DiplomacyContactDto | null): void {
    if (!contact?.canSendMessage) {
      return;
    }

    this.actionError = null;
    this.actionSuccess = null;
    this.composerLockedTargetPlayerId = contact.playerId;
    this.composerLockedTargetPlayerName = contact.playerName;
    this.composerOpen = true;
  }

  protected closeComposer(): void {
    this.composerOpen = false;
  }

  protected handleComposerSent(event: { deliveredCount: number }): void {
    this.actionSuccess = event.deliveredCount === 1
      ? `Message sent to ${this.composerLockedTargetPlayerName ?? 'recipient'}.`
      : `Message sent to ${event.deliveredCount} recipients.`;
  }

  private loadDiplomacyView(): void {
    const session = this.playerSession.load();
    if (!session) {
      this.loadError = 'No player session found.';
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.actionError = null;

    this.gameApi.getDiplomacyView(session.token)
      .pipe(finalize(() => {
        this.isLoading = false;
        this.cdr.markForCheck();
      }))
      .subscribe({
        next: (response) => {
          this.applyViewResponse(response);
        },
        error: (error) => {
          this.loadError = error?.error?.error ?? 'Unable to load diplomacy data.';
        }
      });
  }

  private applyViewResponse(response: DiplomacyViewResponse): void {
    const previousSelectedPlayerId = this.selectedPlayerId;
    this.contacts = [...response.contacts];
    this.activeProposals = [...response.activeProposals];
    this.currentPlayerId = response.currentPlayerId;
    this.currentTurn = response.currentTurn;
    this.outgoingProposalSentThisTurn = response.outgoingProposalSentThisTurn;
    this.syncProposalSelections();

    if (previousSelectedPlayerId !== null && this.contacts.some((contact) => contact.playerId === previousSelectedPlayerId)) {
      this.selectedPlayerId = previousSelectedPlayerId;
      return;
    }

    this.selectedPlayerId = this.contacts[0]?.playerId ?? null;
  }

  private syncProposalSelections(): void {
    const validPlayerIds = new Set(this.contacts.map((contact) => contact.playerId));
    for (const playerId of [...this.proposalSelectionByPlayerId.keys()]) {
      if (!validPlayerIds.has(playerId)) {
        this.proposalSelectionByPlayerId.delete(playerId);
      }
    }

    for (const contact of this.contacts) {
      const current = this.proposalSelectionByPlayerId.get(contact.playerId);
      if (current && this.availableProposalStatuses(contact).includes(current)) {
        continue;
      }

      const fallback = this.availableProposalStatuses(contact)[0];
      if (fallback) {
        this.proposalSelectionByPlayerId.set(contact.playerId, fallback);
      } else {
        this.proposalSelectionByPlayerId.delete(contact.playerId);
      }
    }
  }

}
