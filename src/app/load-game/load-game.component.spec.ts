import '@angular/compiler';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { LoadGameComponent } from './load-game.component';
import type { GameSavesResponse, PlayerSession } from '../models/game-api-types';
import { AuthApiService } from '../core/auth-api.service';
import { AuthStateService } from '../core/auth-state.service';
import { GameApiService } from '../core/game-api.service';
import { GameStateService } from '../core/game-state.service';

describe('LoadGameComponent', () => {
  let authApi: {
    logout: ReturnType<typeof vi.fn>;
  };
  let authState: {
    session: ReturnType<typeof signal<PlayerSession | null>>['asReadonly'];
    clearSession: ReturnType<typeof vi.fn>;
  };
  let gameApi: {
    getGameSaves: ReturnType<typeof vi.fn>;
    loadGame: ReturnType<typeof vi.fn>;
    deleteGameSave: ReturnType<typeof vi.fn>;
  };
  let gameState: {
    setGalaxy: ReturnType<typeof vi.fn>;
    clearGalaxy: ReturnType<typeof vi.fn>;
  };
  let router: {
    navigate: ReturnType<typeof vi.fn>;
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
      clearSession: vi.fn()
    };
    gameApi = {
      getGameSaves: vi.fn().mockReturnValue(of(createGameSavesResponse())),
      loadGame: vi.fn(),
      deleteGameSave: vi.fn()
    };
    gameState = {
      setGalaxy: vi.fn(),
      clearGalaxy: vi.fn()
    };
    router = {
      navigate: vi.fn().mockResolvedValue(true)
    };
    cdr = {
      markForCheck: vi.fn()
    };
  });

  it('clears the stored session when save summary reports logged-out state for a stored token', () => {
    gameApi.getGameSaves.mockReturnValue(of(createGameSavesResponse({
      isLoggedIn: false,
      currentSelectedGameId: null,
      currentSelectedGameName: null,
      canManage: false,
      canManageReason: 'Login required to manage saves.'
    })));
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, cdr);

    component.loadSaves();

    expect(authState.clearSession).toHaveBeenCalled();
    expect(component.summaryError).toBe('Session expired. Please log in again.');
    expect(component.isSummaryLoading).toBe(false);
    expect(component.selectedGameId).toBeNull();
  });

  it('clears the stored session when save summary request returns unauthorized', () => {
    gameApi.getGameSaves.mockReturnValue(throwError(() => ({
      status: 401
    })));
    const component = createBareComponent(authApi, authState, gameApi, gameState, router, cdr);

    component.loadSaves();

    expect(authState.clearSession).toHaveBeenCalled();
    expect(component.summaryError).toBe('Session expired. Please log in again.');
    expect(component.isSummaryLoading).toBe(false);
  });
});

function createBareComponent(
  authApi: Pick<AuthApiService, 'logout'>,
  authState: Pick<AuthStateService, 'session' | 'clearSession'>,
  gameApi: Pick<GameApiService, 'getGameSaves' | 'loadGame' | 'deleteGameSave'>,
  gameState: Pick<GameStateService, 'setGalaxy' | 'clearGalaxy'>,
  router: { navigate: (commands: string[]) => Promise<boolean> },
  cdr: { markForCheck: () => void }
): LoadGameComponent & {
  response: GameSavesResponse | null;
  isSummaryLoading: boolean;
  pendingAction: 'load' | 'delete' | null;
  pendingSaveId: string | null;
  summaryError: string | null;
  actionError: string | null;
  confirmReplaceActiveGame: boolean;
  selectedGameId: string | null;
  session: () => PlayerSession | null;
  loadSaves(): void;
} {
  const component = Object.create(LoadGameComponent.prototype) as LoadGameComponent & {
    response: GameSavesResponse | null;
    isSummaryLoading: boolean;
    pendingAction: 'load' | 'delete' | null;
    pendingSaveId: string | null;
    summaryError: string | null;
    actionError: string | null;
    confirmReplaceActiveGame: boolean;
    selectedGameId: string | null;
    session: () => PlayerSession | null;
    loadSaves(): void;
  };

  (component as never as { authApi: typeof authApi }).authApi = authApi;
  (component as never as { authState: typeof authState }).authState = authState;
  (component as never as { gameApi: typeof gameApi }).gameApi = gameApi;
  (component as never as { gameState: typeof gameState }).gameState = gameState;
  (component as never as { router: typeof router }).router = router;
  (component as never as { cdr: typeof cdr }).cdr = cdr;
  component.session = authState.session;
  component.response = null;
  component.isSummaryLoading = false;
  component.pendingAction = null;
  component.pendingSaveId = null;
  component.summaryError = null;
  component.actionError = null;
  component.confirmReplaceActiveGame = false;
  component.selectedGameId = null;

  return component;
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

function createGameSavesResponse(overrides: Partial<GameSavesResponse> = {}): GameSavesResponse {
  return {
    saves: [],
    saveGroups: [],
    recommendedReopen: null,
    activeGame: null,
    currentSelectedGameId: 'game-1',
    currentSelectedGameName: 'Commander Save',
    isLoggedIn: true,
    currentAccountId: 1,
    currentPlayerIsLocalAdmin: true,
    canManage: true,
    canManageReason: null,
    ...overrides
  };
}
