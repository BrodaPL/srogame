import '@angular/compiler';
import { Subject, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateResponse, PlayerSession, TurnStatusResponse } from '../models/game-api-types';
import { GameComponent } from './game.component';

describe('GameComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads current game state for a logged-in player without relying on stored setup', async () => {
    const response = createGameStateResponse();
    const gameState = createGameStateMock();
    const cdr = createChangeDetectorRefMock();
    const gameApi = {
      getGameState: vi.fn().mockReturnValue(of(response)),
      getTurnStatus: vi.fn().mockReturnValue(of(createTurnStatusResponse()))
    };
    const playerSession = {
      load: vi.fn().mockReturnValue(response.player)
    };
    const authState = {
      setSession: vi.fn(),
      clearSession: vi.fn()
    };

    const component = new GameComponent(
      cdr as never,
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(gameApi.getGameState).toHaveBeenCalledWith(response.player.token, response.player.currentGameId);
    expect(gameApi.getTurnStatus).toHaveBeenCalledWith(response.player.token, response.player.currentGameId);
    expect(authState.setSession).toHaveBeenCalledWith(response.player);
    expect(gameState.setGalaxy).toHaveBeenCalledWith(response.galaxy);
    expect((component as { isGameReady: boolean }).isGameReady).toBe(true);
    expect((component as { stateError: string | null }).stateError).toBeNull();
  });

  it('renders immediately from in-memory game state and syncs the server in background', async () => {
    const response = createGameStateResponse();
    const gameState = createGameStateMock(response.galaxy);
    const cdr = createChangeDetectorRefMock();
    const gameApi = {
      getGameState: vi.fn().mockReturnValue(of(response)),
      getTurnStatus: vi.fn().mockReturnValue(of(createTurnStatusResponse()))
    };
    const playerSession = {
      load: vi.fn().mockReturnValue(response.player)
    };
    const authState = {
      setSession: vi.fn(),
      clearSession: vi.fn()
    };

    const component = new GameComponent(
      cdr as never,
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();
    await Promise.resolve();

    expect((component as { isLoading: boolean }).isLoading).toBe(false);
    expect((component as { isGameReady: boolean }).isGameReady).toBe(true);
    expect(gameApi.getGameState).toHaveBeenCalledWith(response.player.token, response.player.currentGameId);
    expect(gameApi.getTurnStatus).toHaveBeenCalledWith(response.player.token, response.player.currentGameId);
  });

  it('shows no-active-game guidance when the server denies access', async () => {
    const gameState = createGameStateMock();
    const cdr = createChangeDetectorRefMock();
    const gameApi = {
      getGameState: vi.fn().mockReturnValue(throwError(() => ({ status: 404 }))),
      getTurnStatus: vi.fn()
    };
    const playerSession = {
      load: vi.fn().mockReturnValue(createPlayerSession())
    };
    const authState = {
      setSession: vi.fn(),
      clearSession: vi.fn()
    };

    const component = new GameComponent(
      cdr as never,
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect(gameState.clearGalaxy).toHaveBeenCalled();
    expect((component as { stateTitle: string }).stateTitle).toBe('No active game');
    expect((component as { stateActionRoute: string }).stateActionRoute).toBe('/');
    expect((component as { isGameReady: boolean }).isGameReady).toBe(false);
  });

  it('can disable auto skip turn from the return notice popup', async () => {
    const response = createGameStateResponse();
    const updatedTurnStatus = createTurnStatusResponse({
      currentPlayerAutoSkipEnabled: false,
      currentPlayerPresenceState: 'ACTIVE',
      showAutoSkipReturnNotice: false
    });
    const gameState = createGameStateMock();
    const gameApi = {
      getGameState: vi.fn().mockReturnValue(of(response)),
      getTurnStatus: vi.fn().mockReturnValue(of(createTurnStatusResponse({
        currentPlayerAutoSkipEnabled: true,
        currentPlayerPresenceState: 'AUTO_SKIP_TURN',
      showAutoSkipReturnNotice: true
      }))),
      updateMultiplayerAutoSkipTurn: vi.fn().mockReturnValue(of(updatedTurnStatus))
    };
    const playerSession = {
      load: vi.fn().mockReturnValue(response.player)
    };
    const authState = {
      setSession: vi.fn(),
      clearSession: vi.fn()
    };
    const cdr = createChangeDetectorRefMock();

    const component = new GameComponent(
      cdr as never,
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();
    vi.advanceTimersByTime(0);
    await Promise.resolve();

    expect((component as { showAutoSkipReturnNotice: boolean }).showAutoSkipReturnNotice).toBe(true);

    (component as unknown as { disableAutoSkipTurn(): void }).disableAutoSkipTurn();
    await Promise.resolve();

    expect(gameApi.updateMultiplayerAutoSkipTurn).toHaveBeenCalledWith('game-1', {
      enabled: false,
      acknowledgeNotice: true
    }, 'token');
    expect(gameState.setTurnStatus).toHaveBeenLastCalledWith(updatedTurnStatus);
  });
});

function createPlayerSession(): PlayerSession {
  return {
    id: 1,
    playerName: 'Admin',
    token: 'token',
    localAdmin: true,
    language: 'en',
    tutorialRead: {},
    unreadReportCount: 0,
    unreadMailCount: 0,
    pendingRequestCount: 0,
    currentGameId: 'game-1'
  };
}

function createGameStateResponse(): GameStateResponse {
  return {
    player: createPlayerSession(),
    galaxy: {
      name: 'Sector',
      currentTurn: 1,
      diplomaticRelations: [],
      stars: []
    }
  };
}

function createGameStateMock(galaxy: GameStateResponse['galaxy'] | null = null) {
  const turnStatusChanges = new Subject<TurnStatusResponse | null>();
  const state = {
    galaxy,
    turnStatus: null as TurnStatusResponse | null,
    turnStatusChanges: turnStatusChanges.asObservable(),
    isProcessingTurn: false,
    currentTurn: vi.fn().mockReturnValue(1),
    setGalaxy: vi.fn(),
    setTurnStatus: vi.fn((turnStatus: TurnStatusResponse | null) => {
      state.turnStatus = turnStatus;
      turnStatusChanges.next(turnStatus);
    }),
    setProcessingTurn: vi.fn(),
    clearGalaxy: vi.fn()
  };

  return {
    ...state
  };
}

function createTurnStatusResponse(overrides: Partial<TurnStatusResponse> = {}): TurnStatusResponse {
  return {
    currentTurn: 1,
    requiresAllPlayersReady: false,
    onlineHumanCount: 1,
    minimumOnlineHumanCount: 1,
    progressionBlockedReason: null,
    currentPlayerPresenceState: null,
    currentPlayerAutoSkipEnabled: false,
    currentPlayerAutoSkipActivatedAt: null,
    showAutoSkipReturnNotice: false,
    isProcessing: false,
    currentPlayerReady: false,
    readyPlayerIds: [],
    readyPlayerNames: [],
    waitingForPlayerIds: [],
    waitingForPlayerNames: [],
    ...overrides
  };
}

function createChangeDetectorRefMock() {
  return {
    detectChanges: vi.fn()
  };
}
