import { describe, expect, it } from 'vitest';
import { PlayerType } from '../../src/app/models/enums/player-type.js';
import { Player } from '../../src/app/models/player.js';
import { Galaxy } from '../../src/app/models/planets/galaxy.js';
import {
  reconcileOfflineBotControlledSeats
} from './offline-bot-control.js';

describe('offline-bot-control', () => {
  it('converts opted-in absent multiplayer members to temporary bots', () => {
    const { galaxy, alpha, beta } = createGalaxy();

    const result = reconcileOfflineBotControlledSeats(
      galaxy,
      'game-1',
      [
        { accountId: 1, playerName: 'Alpha', isActive: true },
        { accountId: 2, playerName: 'Beta', isActive: true }
      ],
      [
        { id: 1, replaceWithBotOnLogout: false, logoutBotProfileId: null },
        { id: 2, replaceWithBotOnLogout: true, logoutBotProfileId: 'TURTLE' }
      ],
      [
        { accountId: 1, currentGameId: 'game-1' }
      ],
      new Set()
    );

    expect(result.changed).toBe(true);
    expect(result.offlineBotControlledPlayerIds.has(beta.playerId)).toBe(true);
    expect(beta.type).toBe(PlayerType.BOT);
    expect(beta.botProfileId).toBe('TURTLE');
    expect(alpha.type).toBe(PlayerType.PLAYER);
    expect(galaxy.botPlayerMap.get(beta.playerId)).toBe(beta);
    expect(galaxy.playerNameMap.get('Beta')).toBe(beta.playerId);
  });

  it('restores a temporary bot-controlled seat when the player is active in that game again', () => {
    const { galaxy, beta } = createGalaxy();
    beta.type = PlayerType.BOT;
    beta.botProfileId = 'TURTLE';

    const result = reconcileOfflineBotControlledSeats(
      galaxy,
      'game-1',
      [
        { accountId: 2, playerName: 'Beta', isActive: true }
      ],
      [
        { id: 2, replaceWithBotOnLogout: true, logoutBotProfileId: 'TURTLE' }
      ],
      [
        { accountId: 2, currentGameId: 'game-1' }
      ],
      new Set([beta.playerId])
    );

    expect(result.changed).toBe(true);
    expect(result.offlineBotControlledPlayerIds.has(beta.playerId)).toBe(false);
    expect(beta.type).toBe(PlayerType.PLAYER);
    expect(galaxy.humanPlayerMap.get(beta.playerId)).toBe(beta);
  });

  it('keeps opted-out absent members as human seats that still require rejoin', () => {
    const { galaxy, alpha } = createGalaxy();

    const result = reconcileOfflineBotControlledSeats(
      galaxy,
      'game-1',
      [
        { accountId: 1, playerName: 'Alpha', isActive: true }
      ],
      [
        { id: 1, replaceWithBotOnLogout: false, logoutBotProfileId: null }
      ],
      [],
      new Set()
    );

    expect(result.changed).toBe(false);
    expect(result.offlineBotControlledPlayerIds.size).toBe(0);
    expect(alpha.type).toBe(PlayerType.PLAYER);
  });
});

function createGalaxy() {
  const alpha = new Player(1, 'Alpha', [], new Map(), [], PlayerType.PLAYER);
  const beta = new Player(2, 'Beta', [], new Map(), [], PlayerType.PLAYER);
  const neutral = new Player(3, 'Neutral', [], new Map(), [], PlayerType.NEUTRAL);
  const galaxy = new Galaxy(
    'Runtime',
    [alpha, beta, neutral],
    [],
    4,
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

  return { galaxy, alpha, beta, neutral };
}
