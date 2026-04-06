import { describe, expect, it } from 'vitest';
import type { MultiplayerLobbyResponse } from '../models/game-api-types';
import { shouldAutoEnterStartedMultiplayerGame } from './multiplayer-active-game-entry';

describe('shouldAutoEnterStartedMultiplayerGame', () => {
  it('returns true when a lobby member sees the lobby close into an active game', () => {
    const response = createLobbyResponse();
    response.lobby = null;
    response.activeGame = {
      ownerAccountId: 1,
      ownerPlayerName: 'Admin',
      galaxyName: 'Sector',
      currentTurn: 1
    };

    expect(shouldAutoEnterStartedMultiplayerGame(createLobbyResponse().lobby, response)).toBe(true);
  });

  it('returns false when the current player was not a lobby member', () => {
    const previous = createLobbyResponse();
    previous.lobby!.isMember = false;
    const response = createLobbyResponse();
    response.lobby = null;
    response.activeGame = {
      ownerAccountId: 1,
      ownerPlayerName: 'Admin',
      galaxyName: 'Sector',
      currentTurn: 1
    };

    expect(shouldAutoEnterStartedMultiplayerGame(previous.lobby, response)).toBe(false);
  });

  it('returns false while the lobby is still open', () => {
    const previous = createLobbyResponse();
    const response = createLobbyResponse();
    response.activeGame = {
      ownerAccountId: 1,
      ownerPlayerName: 'Admin',
      galaxyName: 'Sector',
      currentTurn: 1
    };

    expect(shouldAutoEnterStartedMultiplayerGame(previous.lobby, response)).toBe(false);
  });
});

function createLobbyResponse(): MultiplayerLobbyResponse {
  return {
    lobby: {
      hostAccountId: 1,
      hostPlayerName: 'Admin',
      mode: 'NEW_GAME',
      setup: {
        gameType: 'Sandbox',
        galaxyName: 'Sector',
        galaxyWidth: 25,
        galaxyHeight: 20,
        galaxyCenterSize: 10,
        voidChance: 5,
        starsAmountModifier: [-1, 4],
        playerAmount: 2,
        botsAmount: 0,
        botDifficulty: 0,
        neutralBotsAmount: 1,
        neutralBotsDifficulty: 0,
        autoSaveTurns: 5,
        startingHomeworldPreset: 'Medium',
        startingResources: {
          metal: 6,
          crystal: 3,
          deuterium: 1
        }
      },
      members: [],
      boundSaveId: null,
      boundSave: null,
      loadSeats: [],
      canManage: false,
      isMember: true,
      canJoin: false,
      canLeave: true,
      canToggleReady: false,
      canBindSave: false,
      canStart: false,
      startBlockedReason: null
    },
    activeGame: null,
    availableSaves: [],
    isLoggedIn: true,
    currentAccountId: 2,
    currentPlayerName: 'Player',
    currentPlayerIsLocalAdmin: false
  };
}
