import { describe, expect, it } from 'vitest';
import { Player } from '../../src/app/models/player.js';
import { PlayerType } from '../../src/app/models/enums/player-type.js';
import { SolarSystem } from '../../src/app/models/planets/solar-system.js';
import { Galaxy } from '../../src/app/models/planets/galaxy.js';
import { activeHumanPlayers, areAllHumanPlayersReady, buildTurnStatusResponse, requiresAllPlayersReady } from './active-game-turn.js';

describe('active-game-turn', () => {
  it('requires all human players to ready only when more than one human is active', () => {
    const single = createGalaxy(['Alpha']);
    const multiplayer = createGalaxy(['Alpha', 'Beta']);

    expect(requiresAllPlayersReady(single)).toBe(false);
    expect(requiresAllPlayersReady(multiplayer)).toBe(true);
    expect(activeHumanPlayers(multiplayer).map((player: Player) => player.playerName)).toEqual(['Alpha', 'Beta']);
  });

  it('tracks ready and waiting human players for the current turn', () => {
    const galaxy = createGalaxy(['Alpha', 'Beta', 'Gamma']);
    const readyPlayerIds = new Set([1, 3]);

    expect(areAllHumanPlayersReady(galaxy, readyPlayerIds)).toBe(false);

    expect(buildTurnStatusResponse(galaxy, readyPlayerIds, 1, false)).toEqual({
      currentTurn: 1,
      requiresAllPlayersReady: true,
      onlineHumanCount: 3,
      minimumOnlineHumanCount: 1,
      progressionBlockedReason: null,
      currentPlayerPresenceState: null,
      currentPlayerAutoSkipEnabled: false,
      currentPlayerAutoSkipActivatedAt: null,
      showAutoSkipReturnNotice: false,
      showPresenceRemovedReturnNotice: false,
      isProcessing: false,
      currentPlayerReady: true,
      readyPlayerIds: [1, 3],
      readyPlayerNames: ['Alpha', 'Gamma'],
      waitingForPlayerIds: [2],
      waitingForPlayerNames: ['Beta']
    });
  });

  it('considers all human players ready only when every active human is marked ready', () => {
    const galaxy = createGalaxy(['Alpha', 'Beta']);

    expect(areAllHumanPlayersReady(galaxy, new Set([1]))).toBe(false);
    expect(areAllHumanPlayersReady(galaxy, new Set([1, 2]))).toBe(true);
  });

  it('excludes auto-skip players from waiting lists when blocking ids are provided', () => {
    const galaxy = createGalaxy(['Alpha', 'Beta']);

    expect(buildTurnStatusResponse(galaxy, new Set<number>(), 1, false, {
      onlineHumanCount: 2,
      minimumOnlineHumanCount: 2,
      blockingPlayerIds: new Set([1])
    })).toEqual({
      currentTurn: 1,
      requiresAllPlayersReady: true,
      onlineHumanCount: 2,
      minimumOnlineHumanCount: 2,
      progressionBlockedReason: null,
      currentPlayerPresenceState: null,
      currentPlayerAutoSkipEnabled: false,
      currentPlayerAutoSkipActivatedAt: null,
      showAutoSkipReturnNotice: false,
      showPresenceRemovedReturnNotice: false,
      isProcessing: false,
      currentPlayerReady: false,
      readyPlayerIds: [],
      readyPlayerNames: [],
      waitingForPlayerIds: [1],
      waitingForPlayerNames: ['Alpha']
    });
  });
});

function createGalaxy(playerNames: string[]): Galaxy {
  const systems = playerNames.map((name, index) =>
    new SolarSystem(`${name}-System`, 1, false, false, { x: index, y: 0 }, new Set(), new Map())
  );
  const players = systems.map((system, index) => {
    const planet = system.planets[0]!;
    const playerId = index + 1;
    planet.info.ownerId = playerId;
    return new Player(playerId, playerNames[index]!, [planet], new Map(), [], PlayerType.PLAYER);
  });

  return new Galaxy('Test', players, [systems]);
}
