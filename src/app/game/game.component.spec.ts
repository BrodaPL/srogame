import '@angular/compiler';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameStateResponse, PlayerSession } from '../models/game-api-types';
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
      getGameState: vi.fn().mockReturnValue(of(response))
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
    vi.runAllTimers();

    expect(gameApi.getGameState).toHaveBeenCalledWith(response.player.token);
    expect(authState.setSession).toHaveBeenCalledWith(response.player);
    expect(gameState.setGalaxy).toHaveBeenCalledWith(response.galaxy);
    expect((component as { isGameReady: boolean }).isGameReady).toBe(true);
    expect((component as { stateError: string | null }).stateError).toBeNull();
  });

  it('shows no-active-game guidance when the server denies access', () => {
    const gameState = createGameStateMock();
    const gameApi = {
      getGameState: vi.fn().mockReturnValue(throwError(() => ({ status: 404 })))
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
    vi.runAllTimers();

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

function createGameStateMock() {
  return {
    galaxy: null,
    isProcessingTurn: false,
    setGalaxy: vi.fn(),
    clearGalaxy: vi.fn()
  };
}
