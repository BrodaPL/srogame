import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { GameApiService } from '../../../core/game-api.service';
import { PlayerSessionService } from '../../../core/player-session.service';
import { MailRecipientDto, MailRecipientMode } from '../../../models/game-api-types';
import { I18nPipe } from '../../../i18n/i18n.pipe';
import { I18nService } from '../../../i18n/i18n.service';

@Component({
  selector: 'app-message-compose-dialog',
  imports: [FormsModule, I18nPipe],
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
  @Input() public titleText = '';
  @Input() public submitLabel = '';
  @Input() public allowAlliance = true;

  @Output() public readonly closed = new EventEmitter<void>();
  @Output() public readonly sent = new EventEmitter<{ deliveredCount: number }>();

  protected recipientMode: MailRecipientMode = 'player';
  protected targetPlayerId: number | null = null;
  protected title = '';
  protected body = '';
  protected isSending = false;
  protected error: string | null = null;
  private readonly i18n = inject(I18nService);

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
    return target?.playerName ?? this.i18n.t('communications.compose.errors.unknownPlayer');
  }

  protected resolvedTitleText(): string {
    return this.titleText || this.i18n.t('communications.compose.defaultTitle');
  }

  protected resolvedSubmitLabel(): string {
    return this.submitLabel || this.i18n.t('communications.compose.defaultSubmit');
  }

  protected send(): void {
    if (!this.canSend()) {
      return;
    }

    const session = this.playerSession.load();
    if (!session) {
      this.error = this.i18n.t('communications.compose.errors.noSession');
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
          this.error = error?.error?.error ?? this.i18n.t('communications.compose.errors.sendFailed');
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
