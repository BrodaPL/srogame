import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameApiService } from '../../../core/game-api.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { MailRecipientDto, MailRecipientMode } from '../../../models/game-api-types';

@Component({
  selector: 'app-message-compose-dialog',
  imports: [FormsModule],
  templateUrl: './message-compose-dialog.component.html',
  styleUrl: './message-compose-dialog.component.css'
})
export class MessageComposeDialogComponent implements OnChanges {
  @Input() public isOpen = false;
  @Input() public recipients: MailRecipientDto[] = [];
  @Input() public allianceRecipientCount = 0;
  @Input() public lockedTargetPlayerId: number | null = null;
  @Input() public lockedTargetPlayerName: string | null = null;
  @Input() public initialTitle = '';
  @Input() public initialBody = '';
  @Input() public titleText = 'Compose Mail';
  @Input() public submitLabel = 'Send message';
  @Input() public allowAlliance = true;

  @Output() public readonly closed = new EventEmitter<void>();
  @Output() public readonly sent = new EventEmitter<{ deliveredCount: number }>();

  protected recipientMode: MailRecipientMode = 'player';
  protected targetPlayerId: number | null = null;
  protected title = '';
  protected body = '';
  protected isSending = false;
  protected error: string | null = null;

  constructor(
    private readonly gameApi: GameApiService,
    private readonly playerSession: PlayerSessionService
  ) {}

  public ngOnChanges(changes: SimpleChanges): void {
    if (!changes['isOpen'] || !this.isOpen) {
      return;
    }

    this.recipientMode = this.lockedTargetPlayerId !== null ? 'player' : this.defaultRecipientMode();
    this.targetPlayerId = this.lockedTargetPlayerId ?? this.recipients[0]?.playerId ?? null;
    this.title = this.initialTitle;
    this.body = this.initialBody;
    this.error = null;
    this.isSending = false;
  }

  protected close(): void {
    if (this.isSending) {
      return;
    }

    this.closed.emit();
  }

  protected canSend(): boolean {
    if (this.isSending || this.title.trim().length === 0 || this.body.trim().length === 0) {
      return false;
    }

    if (this.title.trim().length > 50 || this.body.trim().length > 1000) {
      return false;
    }

    if (this.recipientMode === 'player') {
      return this.activeTargetPlayerId() !== null;
    }

    return this.allowAlliance && this.allianceRecipientCount > 0;
  }

  protected activeTargetPlayerId(): number | null {
    return this.lockedTargetPlayerId ?? this.targetPlayerId;
  }

  protected titleCharactersRemaining(): number {
    return 50 - this.title.length;
  }

  protected bodyCharactersRemaining(): number {
    return 1000 - this.body.length;
  }

  protected showAllianceOption(): boolean {
    return this.allowAlliance && this.lockedTargetPlayerId === null;
  }

  protected lockedTargetLabel(): string {
    if (this.lockedTargetPlayerName) {
      return this.lockedTargetPlayerName;
    }

    const target = this.recipients.find((entry) => entry.playerId === this.lockedTargetPlayerId);
    return target?.playerName ?? 'Unknown player';
  }

  protected send(): void {
    if (!this.canSend()) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.error = 'No player session found.';
      return;
    }

    this.isSending = true;
    this.error = null;

    this.gameApi.sendMailMessage(
      {
        recipientMode: this.recipientMode,
        targetPlayerId: this.recipientMode === 'player' ? this.activeTargetPlayerId() : null,
        title: this.title.trim(),
        body: this.body.trim()
      },
      session.token
    )
      .pipe(finalize(() => {
        this.isSending = false;
      }))
      .subscribe({
        next: (response) => {
          this.sent.emit({ deliveredCount: response.deliveredCount });
          this.closed.emit();
        },
        error: (error) => {
          this.error = error?.error?.error ?? 'Unable to send message.';
        }
      });
  }

  private defaultRecipientMode(): MailRecipientMode {
    if (this.allowAlliance && this.allianceRecipientCount > 0) {
      return 'player';
    }

    return 'player';
  }
}
