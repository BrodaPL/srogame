import '@angular/compiler';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { MainMenuComponent } from './main-menu.component';
import type { CurrentGameStatusResponse, PlayerSession } from '../models/game-api-types';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';
import { I18nService } from '../i18n/i18n.service';

describe('MainMenuComponent', () => {
  let authApi: {
    logout: ReturnType<typeof vi.fn>;
  };
  let authState: {
    session: ReturnType<typeof signal<PlayerSession | null>>['asReadonly'];
    clearSession: ReturnType<typeof vi.fn>;
    setSession: ReturnType<typeof vi.fn>;
  };
  let gameApi: {
    getCurrentGameStatus: ReturnType<typeof vi.fn>;
    selectGame: ReturnType<typeof vi.fn>;
    closeCurrentGame: ReturnType<typeof vi.fn>;
  };
  let gameState: {
    clearGalaxy: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
  };
  let i18n: {
    t: ReturnType<typeof vi.fn>;
  };
  let cdr: {
    markForCheck: ReturnType<typeof vi.fn>;
  };
  let sessionSignal: ReturnType<typeof signal<PlayerSession | null>>;

  beforeEach(() => {
    sessionSignal = signal<PlayerSession | null>(createPlayerSession());
    authApi = {
      logout: vi.fn().mockReturnValue(of(void 0))
    };
    authState = {
      session: sessionSignal.asReadonly(),
      clearSession: vi.fn(),
      setSession: vi.fn()
    };
    gameApi = {
      getCurrentGameStatus: vi.fn().mockReturnValue(of(createCurrentGameStatus())),
      selectGame: vi.fn().mockReturnValue(of(createCurrentGameStatus())),
      closeCurrentGame: vi.fn().mockReturnValue(of({
        currentGameId: null,
        game: null,
        canResume: false,
        unavailableReason: null
      } satisfies CurrentGameStatusResponse))
    };
    gameState = {
      clearGalaxy: vi.fn()
    };
    router = {
      navigate: vi.fn().mockResolvedValue(true)
    };
    i18n = {
      t: vi.fn((key: string) => translationForKey(key))
    };
    cdr = {
      markForCheck: vi.fn()
    };
  });

  it('enables resume for a running current game', () => {
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, i18n, cdr);

    component['loadCurrentGameStatus']('token');

    expect(component.canResumeCurrentGame()).toBe(true);
    expect(component.currentGameName()).toBe('The Frontier');
    expect(component.currentGameStatusLabel()).toBe('Running');
    expect(component.resumeUnavailableReason()).toBeNull();
  });

  it('shows multiplayer inactive guidance when the current game is saved and inactive', () => {
    gameApi.getCurrentGameStatus.mockReturnValue(of(createCurrentGameStatus({
      canResume: false,
      unavailableReason: 'You do not currently have access to resume this game.'
    })));
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, i18n, cdr);

    component['loadCurrentGameStatus']('token');

    expect(component.canResumeCurrentGame()).toBe(false);
    expect(component.currentGameStatusLabel()).toBe('Saved / Inactive');
    expect(component.resumeUnavailableReason()).toBe('This multiplayer game is saved and inactive. Open Multiplayer to resume it.');
    expect(component.shouldShowOpenMultiplayer()).toBe(true);
    expect(component.shouldShowCloseCurrentGame()).toBe(false);
  });

  it('shows the empty current-game state when no game is selected', () => {
    gameApi.getCurrentGameStatus.mockReturnValue(of({
      currentGameId: null,
      game: null,
      canResume: false,
      unavailableReason: null
    } satisfies CurrentGameStatusResponse));
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, i18n, cdr);

    component['loadCurrentGameStatus']('token');

    expect(component.currentGameName()).toBe('No current game selected');
    expect(component.currentGameStatusLabel()).toBe('No game selected');
    expect(component.resumeUnavailableReason()).toBe('Select or create a game first.');
    expect(component.shouldShowOpenMultiplayer()).toBe(false);
    expect(component.shouldShowCloseCurrentGame()).toBe(false);
  });

  it('shows close-current-game for resumable singleplayer and clears local state after closing', () => {
    gameApi.getCurrentGameStatus.mockReturnValue(of(createCurrentGameStatus({
      game: {
        ...createCurrentGameStatus().game!,
        kind: 'SINGLEPLAYER'
      }
    })));
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, i18n, cdr);

    component['loadCurrentGameStatus']('token');

    expect(component.shouldShowCloseCurrentGame()).toBe(true);

    component.closeCurrentGame();

    expect(gameApi.closeCurrentGame).toHaveBeenCalledWith('game-1', 'token');
    expect(authState.setSession).toHaveBeenCalledWith(expect.objectContaining({
      currentGameId: null
    }));
    expect(gameState.clearGalaxy).toHaveBeenCalled();
  });

  it('clears the stored session when current-game status returns unauthorized', () => {
    gameApi.getCurrentGameStatus.mockReturnValue(throwError(() => ({
      status: 401
    })));
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, i18n, cdr);

    component['loadCurrentGameStatus']('token');

    expect(authState.clearSession).toHaveBeenCalled();
    expect(component.currentGameStatus).toBeNull();
    expect(component.isLoadingCurrentGameStatus).toBe(false);
  });
});

function createBareComponent(
  authApi: Pick<AuthApiService, 'logout'>,
  authState: Pick<AuthStateService, 'session' | 'clearSession' | 'setSession'>,
  gameApi: Pick<GameApiService, 'getCurrentGameStatus' | 'selectGame' | 'closeCurrentGame'>,
  gameState: Pick<GameStateService, 'clearGalaxy'>,
  router: { navigate: (commands: string[]) => Promise<boolean> },
  i18n: Pick<I18nService, 't'>,
  cdr: { markForCheck: () => void }
): MainMenuComponent & {
  currentGameStatus: CurrentGameStatusResponse | null;
  isLoadingCurrentGameStatus: boolean;
  isClosingCurrentGame: boolean;
  resumeError: string | null;
  closeError: string | null;
  session: () => PlayerSession | null;
  canResumeCurrentGame(): boolean;
  shouldShowOpenMultiplayer(): boolean;
  shouldShowCloseCurrentGame(): boolean;
  currentGameName(): string;
  currentGameStatusLabel(): string;
  resumeUnavailableReason(): string | null;
  closeCurrentGame(): void;
} {
  const component = Object.create(MainMenuComponent.prototype) as MainMenuComponent & {
    currentGameStatus: CurrentGameStatusResponse | null;
    isLoadingCurrentGameStatus: boolean;
    isClosingCurrentGame: boolean;
    resumeError: string | null;
    closeError: string | null;
    session: () => PlayerSession | null;
    canResumeCurrentGame(): boolean;
    shouldShowOpenMultiplayer(): boolean;
    shouldShowCloseCurrentGame(): boolean;
    currentGameName(): string;
    currentGameStatusLabel(): string;
    resumeUnavailableReason(): string | null;
    closeCurrentGame(): void;
  };

  (component as never as { authApi: typeof authApi }).authApi = authApi;
  (component as never as { authState: typeof authState }).authState = authState;
  (component as never as { gameApi: typeof gameApi }).gameApi = gameApi;
  (component as never as { gameState: typeof gameState }).gameState = gameState;
  (component as never as { router: typeof router }).router = router;
  (component as never as { i18n: typeof i18n }).i18n = i18n;
  (component as never as { cdr: typeof cdr }).cdr = cdr;
  component.session = authState.session;
  component.currentGameStatus = null;
  component.isLoadingCurrentGameStatus = false;
  component.isClosingCurrentGame = false;
  component.resumeError = null;
  component.closeError = null;

  return component;
}

function translationForKey(key: string): string {
  return {
    'mainMenu.currentGame.noCurrentGameSelected': 'No current game selected',
    'mainMenu.currentGame.checkingCurrentGame': 'Checking current game',
    'mainMenu.currentGame.noGameSelected': 'No game selected',
    'mainMenu.currentGame.running': 'Running',
    'mainMenu.currentGame.savedInactive': 'Saved / Inactive',
    'mainMenu.currentGame.draft': 'Draft',
    'mainMenu.currentGame.offline': 'Offline',
    'mainMenu.currentGame.archived': 'Archived',
    'mainMenu.currentGame.selectOrCreateFirst': 'Select or create a game first.',
    'mainMenu.currentGame.multiplayerSavedInactiveHint': 'This multiplayer game is saved and inactive. Open Multiplayer to resume it.',
    'mainMenu.currentGame.unavailable': 'This game is not currently available.',
    'mainMenu.currentGame.resumeMultiplayerHint': 'Resume directly into the current running multiplayer game.',
    'mainMenu.currentGame.resumeHint': 'Resume directly into your current game.',
    'mainMenu.currentGame.closeUnavailable': 'Unable to close the current game.',
    'mainMenu.currentGame.resumeUnavailable': 'Unable to resume the selected game.'
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

function createCurrentGameStatus(overrides: Partial<CurrentGameStatusResponse> = {}): CurrentGameStatusResponse {
  return {
    currentGameId: 'game-1',
    game: {
      gameId: 'game-1',
      kind: 'MULTIPLAYER',
      status: 'RUNNING',
      name: 'The Frontier',
      ownerAccountId: 1,
      ownerPlayerName: 'Commander',
      hostAccountId: 1,
      hostPlayerName: 'Commander',
      currentTurn: 7,
      updatedAt: '2026-04-10T08:00:00.000Z',
      isCurrentGame: true,
      canResume: true,
      canJoin: true,
      canManage: true
    },
    canResume: true,
    unavailableReason: null,
    ...overrides
  };
}
