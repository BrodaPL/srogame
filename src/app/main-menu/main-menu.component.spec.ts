import '@angular/compiler';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { MainMenuComponent } from './main-menu.component';
import type { CurrentGameStatusResponse, PlayerSession } from '../models/game-api-types';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';

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
  });

  it('enables resume for a running current game', () => {
    const component = createBareComponent(authApi, authState, gameApi, gameState, router);

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
    const component = createBareComponent(authApi, authState, gameApi, gameState, router);

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
    const component = createBareComponent(authApi, authState, gameApi, gameState, router);

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
    const component = createBareComponent(authApi, authState, gameApi, gameState, router);

    component['loadCurrentGameStatus']('token');

    expect(component.shouldShowCloseCurrentGame()).toBe(true);

    component.closeCurrentGame();

    expect(gameApi.closeCurrentGame).toHaveBeenCalledWith('game-1', 'token');
    expect(authState.setSession).toHaveBeenCalledWith(expect.objectContaining({
      currentGameId: null
    }));
    expect(gameState.clearGalaxy).toHaveBeenCalled();
  });
});

function createBareComponent(
  authApi: Pick<AuthApiService, 'logout'>,
  authState: Pick<AuthStateService, 'session' | 'clearSession' | 'setSession'>,
  gameApi: Pick<GameApiService, 'getCurrentGameStatus' | 'selectGame' | 'closeCurrentGame'>,
  gameState: Pick<GameStateService, 'clearGalaxy'>,
  router: { navigate: (commands: string[]) => Promise<boolean> }
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
  component.session = authState.session;
  component.currentGameStatus = null;
  component.isLoadingCurrentGameStatus = false;
  component.isClosingCurrentGame = false;
  component.resumeError = null;
  component.closeError = null;

  return component;
}

function createPlayerSession(overrides: Partial<PlayerSession> = {}): PlayerSession {
  return {
    id: 1,
    playerName: 'Commander',
    token: 'token',
    localAdmin: true,
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
