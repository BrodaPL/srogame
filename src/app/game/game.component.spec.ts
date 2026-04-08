import '@angular/compiler';
import { of, throwError } from 'rxjs';
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

  it('loads current game state for a logged-in player without relying on stored setup', () => {
    const response = createGameStateResponse();
    const gameState = createGameStateMock();
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
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();
    vi.advanceTimersByTime(0);

    expect(gameApi.getGameState).toHaveBeenCalledWith(response.player.token);
    expect(gameApi.getTurnStatus).toHaveBeenCalledWith(response.player.token);
    expect(authState.setSession).toHaveBeenCalledWith(response.player);
    expect(gameState.setGalaxy).toHaveBeenCalledWith(response.galaxy);
    expect((component as { isGameReady: boolean }).isGameReady).toBe(true);
    expect((component as { stateError: string | null }).stateError).toBeNull();
  });

  it('renders immediately from in-memory game state and syncs the server in background', () => {
    const response = createGameStateResponse();
    const gameState = createGameStateMock(response.galaxy);
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
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();

    expect((component as { isLoading: boolean }).isLoading).toBe(false);
    expect((component as { isGameReady: boolean }).isGameReady).toBe(true);
    expect(gameApi.getGameState).toHaveBeenCalledWith(response.player.token);
    expect(gameApi.getTurnStatus).toHaveBeenCalledWith(response.player.token);
  });

  it('shows no-active-game guidance when the server denies access', () => {
    const gameState = createGameStateMock();
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
      gameState as never,
      gameApi as never,
      playerSession as never,
      authState as never
    );

    component.ngOnInit();
    vi.advanceTimersByTime(0);

    expect(gameState.clearGalaxy).toHaveBeenCalled();
    expect((component as { stateTitle: string }).stateTitle).toBe('No active game');
    expect((component as { stateActionRoute: string }).stateActionRoute).toBe('/');
    expect((component as { isGameReady: boolean }).isGameReady).toBe(false);
  });
});

function createPlayerSession(): PlayerSession {
  return {
    id: 1,
    playerName: 'Admin',
    token: 'token',
    localAdmin: true,
    tutorialRead: {},
    unreadReportCount: 0,
    unreadMailCount: 0,
    pendingRequestCount: 0
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
  return {
    galaxy,
    turnStatus: null,
    isProcessingTurn: false,
    currentTurn: vi.fn().mockReturnValue(1),
    setGalaxy: vi.fn(),
    setTurnStatus: vi.fn(),
    setProcessingTurn: vi.fn(),
    clearGalaxy: vi.fn()
  };
}

function createTurnStatusResponse(): TurnStatusResponse {
  return {
    currentTurn: 1,
    requiresAllPlayersReady: false,
    isProcessing: false,
    currentPlayerReady: false,
    readyPlayerIds: [],
    readyPlayerNames: [],
    waitingForPlayerIds: [],
    waitingForPlayerNames: []
  };
}
