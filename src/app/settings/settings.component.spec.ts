import '@angular/compiler';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { I18nService } from '../i18n/i18n.service';
import type {
  AccountSettingsResponse,
  PlayerSession,
  ResetAccountTutorialsResponse
} from '../models/game-api-types';
import { SettingsComponent } from './settings.component';

describe('SettingsComponent', () => {
  let authApi: {
    getAccountSettings: ReturnType<typeof vi.fn>;
    updateAccountPreferences: ReturnType<typeof vi.fn>;
    resetAccountTutorials: ReturnType<typeof vi.fn>;
  };
  let authState: {
    session: ReturnType<typeof signal<PlayerSession | null>>['asReadonly'];
    setSession: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let i18n: {
    t: ReturnType<typeof vi.fn>;
    setLanguage: ReturnType<typeof vi.fn>;
    formatDateTime: ReturnType<typeof vi.fn>;
    language: ReturnType<typeof vi.fn>;
  };
  let cdr: {
    markForCheck: ReturnType<typeof vi.fn>;
  };
  let sessionSignal: ReturnType<typeof signal<PlayerSession | null>>;

  beforeEach(() => {
    sessionSignal = signal<PlayerSession | null>(createPlayerSession());
    authApi = {
      getAccountSettings: vi.fn().mockReturnValue(of(createAccountSettings())),
      updateAccountPreferences: vi.fn().mockReturnValue(of(createAccountSettings())),
      resetAccountTutorials: vi.fn().mockReturnValue(of(createTutorialResetResponse()))
    };
    authState = {
      session: sessionSignal.asReadonly(),
      setSession: vi.fn()
    };
    router = {
      navigate: vi.fn().mockResolvedValue(true)
    };
    i18n = {
      t: vi.fn((key: string) => settingsTranslationForKey(key)),
      setLanguage: vi.fn(),
      formatDateTime: vi.fn((value: string) => value),
      language: vi.fn().mockReturnValue('en')
    };
    cdr = {
      markForCheck: vi.fn()
    };
  });

  it('loads settings into component state', () => {
    const component = createBareComponent(authApi, authState, router, i18n, cdr);

    component.loadSettings('token');

    expect(authApi.getAccountSettings).toHaveBeenCalledWith('token');
    expect(component.settings).toEqual(createAccountSettings());
    expect(component.isLoading).toBe(false);
    expect(component.loadError).toBeNull();
  });

  it('stores a readable error when loading settings fails', () => {
    authApi.getAccountSettings.mockReturnValue(throwError(() => ({
      error: { error: 'Settings are unavailable.' }
    })));
    const component = createBareComponent(authApi, authState, router, i18n, cdr);

    component.loadSettings('token');

    expect(component.settings).toBeNull();
    expect(component.isLoading).toBe(false);
    expect(component.loadError).toBe('Settings are unavailable.');
  });

  it('saves gameplay preferences and clears the bot profile when replacement is disabled', () => {
    authApi.updateAccountPreferences.mockReturnValue(of(createAccountSettings({
      replaceWithBotOnLogout: false,
      logoutBotProfileId: null
    })));
    const component = createBareComponent(authApi, authState, router, i18n, cdr);
    component.settings = createAccountSettings();
    component.replaceWithBotOnLogout = false;
    component.logoutBotProfileId = 'TURTLE';

    component.savePreferences();

    expect(authApi.updateAccountPreferences).toHaveBeenCalledWith({
      replaceWithBotOnLogout: false,
      logoutBotProfileId: null,
      language: 'en'
    }, 'token');
    expect(component.saveInfo).toBe('Preferences updated.');
  });

  it('resets tutorials and refreshes the stored player session', () => {
    const response = createTutorialResetResponse();
    authApi.resetAccountTutorials.mockReturnValue(of(response));
    const component = createBareComponent(authApi, authState, router, i18n, cdr);

    component.resetTutorials();

    expect(authApi.resetAccountTutorials).toHaveBeenCalledWith('token');
    expect(authState.setSession).toHaveBeenCalledWith(response.player);
    expect(component.settings).toEqual(response.settings);
    expect(component.saveInfo).toBe(response.message);
  });

  it('normalizes a missing bot profile to BALANCED when bot replacement is enabled', () => {
    const component = createBareComponent(authApi, authState, router, i18n, cdr);
    component.logoutBotProfileId = null;

    component.onReplaceWithBotChange(true);

    expect(component.replaceWithBotOnLogout).toBe(true);
    expect(component.logoutBotProfileId).toBe('BALANCED');
  });
});

function createBareComponent(
  authApi: Pick<AuthApiService, 'getAccountSettings' | 'updateAccountPreferences' | 'resetAccountTutorials'>,
  authState: Pick<AuthStateService, 'session' | 'setSession'>,
  router: { navigate: (commands: string[]) => Promise<boolean> },
  i18n: Pick<I18nService, 't' | 'setLanguage' | 'formatDateTime' | 'language'>,
  cdr: { markForCheck: () => void }
): SettingsComponent & {
  settings: AccountSettingsResponse | null;
  replaceWithBotOnLogout: boolean;
  logoutBotProfileId: 'BALANCED' | 'TURTLE' | null;
  selectedLanguage: 'en' | 'pl';
  isLoading: boolean;
  isSaving: boolean;
  isResettingTutorials: boolean;
  loadError: string | null;
  saveError: string | null;
  saveInfo: string | null;
  session: () => PlayerSession | null;
  loadSettings(token: string): void;
  savePreferences(): void;
  resetTutorials(): void;
  onReplaceWithBotChange(value: boolean): void;
} {
  const component = Object.create(SettingsComponent.prototype) as SettingsComponent & {
    settings: AccountSettingsResponse | null;
    replaceWithBotOnLogout: boolean;
    logoutBotProfileId: 'BALANCED' | 'TURTLE' | null;
    selectedLanguage: 'en' | 'pl';
    isLoading: boolean;
    isSaving: boolean;
    isResettingTutorials: boolean;
    loadError: string | null;
    saveError: string | null;
    saveInfo: string | null;
    session: () => PlayerSession | null;
    loadSettings(token: string): void;
    savePreferences(): void;
    resetTutorials(): void;
    onReplaceWithBotChange(value: boolean): void;
  };

  (component as never as { authApi: typeof authApi }).authApi = authApi;
  (component as never as { authState: typeof authState }).authState = authState;
  (component as never as { i18n: typeof i18n }).i18n = i18n;
  (component as never as { router: typeof router }).router = router;
  (component as never as { cdr: typeof cdr }).cdr = cdr;
  component.session = authState.session;
  component.settings = null;
  component.replaceWithBotOnLogout = false;
  component.logoutBotProfileId = 'BALANCED';
  component.selectedLanguage = 'en';
  component.isLoading = false;
  component.isSaving = false;
  component.isResettingTutorials = false;
  component.loadError = null;
  component.saveError = null;
  component.saveInfo = null;

  return component;
}

function settingsTranslationForKey(key: string): string {
  return {
    'settings.info.preferencesUpdated': 'Preferences updated.',
    'settings.errors.update': 'Unable to update preferences.',
    'settings.errors.resetTutorials': 'Unable to reset tutorials.',
    'settings.errors.load': 'Unable to load settings.',
    'common.status.confirmed': 'Confirmed',
    'common.status.pendingConfirmation': 'Pending confirmation',
    'common.status.localAdmin': 'Local Admin',
    'common.status.regularPlayer': 'Regular player',
    'settings.account.accountStatusActive': 'Active',
    'settings.account.accountStatusPendingConfirmation': 'Pending confirmation',
    'settings.botProfiles.BALANCED': 'Balanced',
    'settings.botProfiles.TURTLE': 'Turtle'
  }[key] ?? key;
}

function createPlayerSession(overrides: Partial<PlayerSession> = {}): PlayerSession {
  return {
    id: 1,
    playerName: 'Commander',
    token: 'token',
    localAdmin: true,
    language: 'en',
    tutorialRead: {},
    unreadReportCount: 0,
    unreadMailCount: 0,
    pendingRequestCount: 0,
    currentGameId: 'game-1',
    ...overrides
  };
}

function createAccountSettings(overrides: Partial<AccountSettingsResponse> = {}): AccountSettingsResponse {
  return {
    playerName: 'Commander',
    email: 'commander@example.com',
    accountStatus: 'ACTIVE',
    emailConfirmed: true,
    emailConfirmedAt: '2026-04-09T10:00:00.000Z',
    accountCreatedAt: '2026-04-09T09:00:00.000Z',
    localAdmin: true,
    currentGameId: 'game-1',
    currentGameName: 'The Frontier',
    replaceWithBotOnLogout: true,
    logoutBotProfileId: 'BALANCED',
    language: 'en',
    forgotPasswordEnabled: false,
    forgotPasswordAvailableAt: null,
    forgotPasswordInfo: 'Password reset by email is not available yet.',
    ...overrides
  };
}

function createTutorialResetResponse(overrides: Partial<ResetAccountTutorialsResponse> = {}): ResetAccountTutorialsResponse {
  return {
    settings: createAccountSettings(),
    player: createPlayerSession({
      tutorialRead: {}
    }),
    message: 'Tutorial progress was reset for your current session.',
    ...overrides
  };
}
