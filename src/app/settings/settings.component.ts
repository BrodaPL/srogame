import { DatePipe } from '@angular/common';
import { Component, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { BOT_PROFILE_IDS, BOT_PROFILE_LABELS, type BotProfileId } from '../models/player';
import type { AccountSettingsResponse } from '../models/game-api-types';

@Component({
  selector: 'app-settings',
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.css'
})
export class SettingsComponent {
  protected readonly session: AuthStateService['session'];
  protected readonly botProfileIds = BOT_PROFILE_IDS;
  protected readonly botProfileLabels = BOT_PROFILE_LABELS;
  protected settings: AccountSettingsResponse | null = null;
  protected replaceWithBotOnLogout = false;
  protected logoutBotProfileId: BotProfileId | null = 'BALANCED';
  protected isLoading = false;
  protected isSaving = false;
  protected isResettingTutorials = false;
  protected loadError: string | null = null;
  protected saveError: string | null = null;
  protected saveInfo: string | null = null;

  constructor(
    private readonly authApi: AuthApiService,
    private readonly authState: AuthStateService,
    private readonly router: Router
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
      language: this.settings.language
    }, session.token).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isSaving = false;
        this.saveInfo = 'Preferences updated.';
      },
      error: (error) => {
        this.isSaving = false;
        this.saveError = error?.error?.error ?? 'Unable to update preferences.';
      }
    });
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
        this.saveInfo = response.message;
      },
      error: (error) => {
        this.isResettingTutorials = false;
        this.saveError = error?.error?.error ?? 'Unable to reset tutorials.';
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
      },
      error: (error) => {
        this.settings = null;
        this.isLoading = false;
        this.loadError = error?.error?.error ?? 'Unable to load settings.';
      }
    });
  }

  private applySettings(settings: AccountSettingsResponse): void {
    this.settings = settings;
    this.replaceWithBotOnLogout = settings.replaceWithBotOnLogout;
    this.logoutBotProfileId = settings.logoutBotProfileId ?? 'BALANCED';
  }
}
