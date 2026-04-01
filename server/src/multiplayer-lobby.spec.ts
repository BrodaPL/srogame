import { describe, expect, it } from 'vitest';
import { GameType } from '../../src/app/models/enums/game-type.js';
import { PlayerType } from '../../src/app/models/enums/player-type.js';
import { Player } from '../../src/app/models/player.js';
import { Galaxy } from '../../src/app/models/planets/galaxy.js';
import { normalizeGalaxySetup } from '../../src/app/models/game-api-types.js';
import type { GameSaveSummary } from '../../src/app/models/game-api-types.js';
import type { SavedGameFile } from './game-save.js';
import {
  applyLobbyLoadSeatsToGalaxy,
  bindSaveToLobby,
  getMultiplayerLobbyStartBlockedReason,
  joinMultiplayerLobby,
  openMultiplayerLobby,
  setMultiplayerLobbyMemberReady
} from './multiplayer-lobby.js';

describe('multiplayer-lobby', () => {
  it('auto-assigns exact saved-name matches and allows manual replacement for missing humans', () => {
    let lobby = openMultiplayerLobby(1, 'Admin', '2026-04-02T10:00:00.000Z');
    lobby = joinMultiplayerLobby(lobby, { accountId: 2, playerName: 'Alpha', isLocalAdmin: false }, '2026-04-02T10:01:00.000Z');
    lobby = joinMultiplayerLobby(lobby, { accountId: 3, playerName: 'Gamma', isLocalAdmin: false }, '2026-04-02T10:02:00.000Z');
    lobby = setMultiplayerLobbyMemberReady(lobby, 2, true);
    lobby = setMultiplayerLobbyMemberReady(lobby, 3, true);
    lobby = bindSaveToLobby(lobby, createSavedGame(['Admin', 'Alpha', 'Beta']), createSaveSummary());

    const alphaSeat = lobby.loadSeats.find((seat) => seat.savedPlayerName === 'Alpha');
    const betaSeat = lobby.loadSeats.find((seat) => seat.savedPlayerName === 'Beta');
    const adminSeat = lobby.loadSeats.find((seat) => seat.savedPlayerName === 'Admin');

    expect(adminSeat?.assignedAccountId).toBe(1);
    expect(alphaSeat?.assignedAccountId).toBe(2);
    expect(betaSeat?.assignedAccountId).toBeNull();
    expect(getMultiplayerLobbyStartBlockedReason(lobby)).toBe(
      'Every joined player must be assigned to a saved human seat or leave the lobby.'
    );

    lobby = {
      ...lobby,
      loadSeats: lobby.loadSeats.map((seat) =>
        seat.savedPlayerName === 'Beta'
          ? { ...seat, assignedAccountId: 3 }
          : seat
      )
    };

    expect(getMultiplayerLobbyStartBlockedReason(lobby)).toBeNull();
  });

  it('blocks start until every non-admin player is ready', () => {
    let lobby = openMultiplayerLobby(1, 'Admin', '2026-04-02T10:00:00.000Z');
    lobby = joinMultiplayerLobby(lobby, { accountId: 2, playerName: 'Alpha', isLocalAdmin: false }, '2026-04-02T10:01:00.000Z');

    expect(getMultiplayerLobbyStartBlockedReason(lobby)).toBe('All non-admin players must be ready.');

    lobby = setMultiplayerLobbyMemberReady(lobby, 2, true);

    expect(getMultiplayerLobbyStartBlockedReason(lobby)).toBeNull();
  });

  it('converts unresolved saved human seats to bots and renames assigned replacements', () => {
    const alpha = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
    const beta = new Player(2, 'Beta', [], new Map(), [], PlayerType.PLAYER);
    const neutral = new Player(3, 'Neutral', [], new Map(), [], PlayerType.NEUTRAL);
    const galaxy = new Galaxy(
      'Lobby Load',
      [alpha, beta, neutral],
      [],
      3,
      [],
      1,
      new Map([[1, alpha], [2, beta]]),
      new Map(),
      new Map([[3, neutral]]),
      new Map([['Alpha', 1], ['Beta', 2], ['Neutral', 3]]),
      [],
      [],
      1,
      [],
      1,
      [],
      1
    );

    const lobby = {
      ...openMultiplayerLobby(10, 'Admin', '2026-04-02T10:00:00.000Z'),
      members: [
        { accountId: 10, playerName: 'Admin', isLocalAdmin: true, isReady: true, joinedAt: '2026-04-02T10:00:00.000Z' },
        { accountId: 11, playerName: 'Gamma', isLocalAdmin: false, isReady: true, joinedAt: '2026-04-02T10:01:00.000Z' }
      ],
      mode: 'LOAD_SAVE' as const,
      boundSave: createSaveSummary(),
      loadSeats: [
        { savedPlayerId: 1, savedPlayerName: 'Alpha', assignedAccountId: 11 },
        { savedPlayerId: 2, savedPlayerName: 'Beta', assignedAccountId: null }
      ]
    };

    applyLobbyLoadSeatsToGalaxy(galaxy, lobby);

    expect(alpha.playerName).toBe('Gamma');
    expect(alpha.type).toBe(PlayerType.PLAYER);
    expect(beta.type).toBe(PlayerType.BOT);
    expect(galaxy.playerNameMap.get('Gamma')).toBe(1);
    expect(galaxy.botPlayerMap.get(2)).toBe(beta);
  });
});

function createSavedGame(playerNames: string[]): SavedGameFile {
  return {
    version: 1,
    savedAt: '2026-04-02T09:55:00.000Z',
    ownerAccountId: 1,
    ownerPlayerName: 'Admin',
    setup: normalizeGalaxySetup({
      gameType: GameType.PVP,
      galaxyName: 'Lobby Save',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: playerNames.length,
      botsAmount: 0,
      botDifficulty: 0,
      neutralBotsAmount: 1,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 5,
      startingResources: { metal: 6, crystal: 3, deuterium: 1 }
    }),
      galaxy: {
        name: 'Lobby Save',
        currentTurn: 8,
        nextFleetId: 1,
        nextDiplomaticProposalId: 1,
        nextJumpGateRequestId: 1,
        nextMaintenanceRequestId: 1,
      players: playerNames.map((playerName, index) => ({
        playerId: index + 1,
        playerName,
        type: PlayerType.PLAYER,
        tutorialRead: {},
        nextReportId: 1,
        nextMessageId: 1,
        techLevels: {},
        planetCoordinates: [],
        fleetIds: [],
        reports: [],
        messages: []
      })),
      stars: [],
      activeFleets: [],
      diplomaticRelations: [],
      diplomaticProposals: [],
      jumpGateRequests: [],
      maintenanceRequests: []
    }
  } as unknown as SavedGameFile;
}

function createSaveSummary(): GameSaveSummary {
  return {
    savedAt: '2026-04-02T09:55:00.000Z',
    ownerAccountId: 1,
    ownerPlayerName: 'Admin',
    galaxyName: 'Lobby Save',
    currentTurn: 8,
    autoSaveTurns: 5
  };
}
