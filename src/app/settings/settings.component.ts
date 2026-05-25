import { ChangeDetectorRef, Component, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { resolveApiErrorMessage, resolveApiMessage, resolveApiText } from '../i18n/api-message.utils';
import { I18nPipe } from '../i18n/i18n.pipe';
import { I18nService } from '../i18n/i18n.service';
import type { LanguagePreference } from '../models/game-api-types';
import { BOT_PROFILE_IDS, type BotProfileId } from '../models/player';
import type { AccountSettingsResponse, PlayerSession } from '../models/game-api-types';
import { TooltipDirective } from '../shared/tooltip/tooltip.directive';

type LanguageOption = {
  id: LanguagePreference;
  shortLabelKey: string;
  fullLabelKey: string;
  iconSrc: string;
};

@Component({
  selector: 'app-settings',
  imports: [FormsModule, RouterLink, I18nPipe, TooltipDirective],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent {
  protected readonly session: AuthStateService['session'];
  protected readonly botProfileIds = BOT_PROFILE_IDS;
  protected readonly languageOptions: LanguageOption[] = [
    {
      id: 'en',
      shortLabelKey: 'settings.interface.languageEnglishShort',
      fullLabelKey: 'settings.interface.languageEnglishFull',
      iconSrc: '/images/icons/ENG_ICON.png'
    },
    {
      id: 'pl',
      shortLabelKey: 'settings.interface.languagePolishShort',
      fullLabelKey: 'settings.interface.languagePolishFull',
      iconSrc: '/images/icons/PL_ICON.png'
    }
  ];
  protected settings: AccountSettingsResponse | null = null;
  protected replaceWithBotOnLogout = false;
  protected logoutBotProfileId: BotProfileId | null = 'BALANCED';
  protected selectedLanguage: LanguagePreference = 'en';
  protected isLoading = false;
  protected isSaving = false;
  protected isResettingTutorials = false;
  protected loadError: string | null = null;
  protected saveError: string | null = null;
  protected saveInfo: string | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly i18n: I18nService,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef
  ) {
    this.session = this.authState.session;

    effect(() => {
      const session = this.session();
      if (!session) {
        this.settings = null;
        this.router.navigate(['/login']);
        return;
      }

      this.loadSettings(session.token);
    });
  }

  protected canSavePreferences(): boolean {
    return !this.isSaving && !this.isLoading && !!this.settings;
  }

  protected onReplaceWithBotChange(value: boolean): void {
    this.replaceWithBotOnLogout = value;
    if (value && !this.logoutBotProfileId) {
      this.logoutBotProfileId = 'BALANCED';
    }
  }

  protected savePreferences(): void {
    const session = this.session();
    if (!session || !this.settings || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.saveError = null;
    this.saveInfo = null;
    this.authApi.updateAccountPreferences({
      replaceWithBotOnLogout: this.replaceWithBotOnLogout,
      logoutBotProfileId: this.replaceWithBotOnLogout ? this.logoutBotProfileId : null,
      language: this.selectedLanguage
    }, session.token).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isSaving = false;
        this.saveInfo = this.i18n.t('settings.info.preferencesUpdated');
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isSaving = false;
        this.saveError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('settings.errors.update'));
        this.cdr.markForCheck();
      }
    });
  }

  protected onLanguageChange(language: LanguagePreference): void {
    this.selectedLanguage = language;
    this.i18n.setLanguage(language);
  }

  protected accountCreatedAtLabel(): string {
    return this.settings?.accountCreatedAt
      ? this.i18n.formatDateTime(this.settings.accountCreatedAt)
      : '';
  }

  protected emailConfirmationLabel(): string {
    return this.settings?.emailConfirmed
      ? this.i18n.t('common.status.confirmed')
      : this.i18n.t('common.status.pendingConfirmation');
  }

  protected accountStatusLabel(): string {
    switch (this.settings?.accountStatus) {
      case 'ACTIVE':
        return this.i18n.t('settings.account.accountStatusActive');
      case 'PENDING_CONFIRMATION':
        return this.i18n.t('settings.account.accountStatusPendingConfirmation');
      default:
        return this.settings?.accountStatus ?? '';
    }
  }

  protected privilegesLabel(): string {
    return this.settings?.localAdmin
      ? this.i18n.t('common.status.localAdmin')
      : this.i18n.t('common.status.regularPlayer');
  }

  protected botProfileLabel(profileId: BotProfileId): string {
    return this.i18n.t(`settings.botProfiles.${profileId}`);
  }

  protected languageAccessibleLabel(language: LanguagePreference): string {
    return this.i18n.t(
      language === 'pl'
        ? 'settings.interface.languagePolishFull'
        : 'settings.interface.languageEnglishFull'
    );
  }

  protected forgotPasswordInfoLabel(): string | null {
    return resolveApiText(this.i18n, {
      text: this.settings?.forgotPasswordInfo ?? null,
      key: this.settings?.forgotPasswordInfoKey ?? null,
      params: this.settings?.forgotPasswordInfoParams ?? null
    }, this.i18n.t('settings.security.resetPasswordUnavailableTitle'));
  }

  protected resetTutorials(): void {
    const session = this.session();
    if (!session || this.isResettingTutorials) {
      return;
    }

    this.isResettingTutorials = true;
    this.saveError = null;
    this.saveInfo = null;
    this.authApi.resetAccountTutorials(session.token).subscribe({
      next: (response) => {
        this.settings = response.settings;
        this.authState.setSession(response.player);
        this.isResettingTutorials = false;
        this.saveInfo = resolveApiMessage(this.i18n, response, response.message);
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.isResettingTutorials = false;
        this.saveError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('settings.errors.resetTutorials'));
        this.cdr.markForCheck();
      }
    });
  }

  private loadSettings(token: string): void {
    this.isLoading = true;
    this.loadError = null;
    this.authApi.getAccountSettings(token).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isLoading = false;
        this.cdr.markForCheck();
      },
      error: (error) => {
        this.settings = null;
        this.isLoading = false;
        this.loadError = resolveApiErrorMessage(this.i18n, error, this.i18n.t('settings.errors.load'));
        this.cdr.markForCheck();
      }
    });
  }

  private applySettings(settings: AccountSettingsResponse): void {
    this.settings = settings;
    this.replaceWithBotOnLogout = settings.replaceWithBotOnLogout;
    this.logoutBotProfileId = settings.logoutBotProfileId ?? 'BALANCED';
    this.selectedLanguage = settings.language ?? this.i18n.language();
    this.i18n.setLanguage(this.selectedLanguage);
    this.syncSessionLanguage(settings.language, this.session());
  }

  private syncSessionLanguage(
    language: LanguagePreference | null,
    session: PlayerSession | null
  ): void {
    if (!session || session.language === language) {
      return;
    }

    this.authState.setSession({
      ...session,
      language
    });
  }
}
