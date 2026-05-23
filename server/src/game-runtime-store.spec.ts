import { describe, expect, it } from 'vitest';
import type { GalaxySetup } from '../../src/app/models/game-api-types.ts';
import { clearGameRuntimes, getGameRuntime, setGameRuntime, updateGameRuntime } from './game-runtime-store.js';

describe('game-runtime-store', () => {
  it('stores and updates runtime state by gameId', () => {
    const setup = {
      gameType: 'PVE',
      galaxyName: 'Runtime Test',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: 1,
      botsAmount: 0,
      botDifficulty: 0,
      neutralBotsAmount: 1,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 5,
      startingHomeworldPreset: 'MEDIUM',
      startingResources: { metal: 6, crystal: 3, deuterium: 1 }
    } as unknown as GalaxySetup;

    try {
      setGameRuntime({
        gameId: 'game-a',
        galaxy: { name: 'Galaxy A' } as never,
        setup,
        presentationByPlayer: new Map(),
        loadedAt: '2026-04-09T10:00:00.000Z',
        lastTouchedAt: '2026-04-09T10:00:00.000Z',
        isDirty: false,
        trackedPlayerActionFleetIds: new Set<number>(),
        currentTurnReadyPlayerIds: new Set([1]),
        isTurnProcessing: false,
        offlineBotControlledPlayerIds: new Set<number>(),
        emptyPresenceUnloadAt: null
      });

      updateGameRuntime('game-a', {
        isDirty: true,
        currentTurnReadyPlayerIds: new Set([1, 2]),
        isTurnProcessing: true,
        emptyPresenceUnloadAt: '2026-04-09T10:03:00.000Z'
      });

      const runtime = getGameRuntime('game-a');
      expect(runtime?.isDirty).toBe(true);
      expect([...((runtime?.currentTurnReadyPlayerIds ?? new Set<number>()).values())]).toEqual([1, 2]);
      expect(runtime?.isTurnProcessing).toBe(true);
      expect(runtime?.emptyPresenceUnloadAt).toBe('2026-04-09T10:03:00.000Z');
    } finally {
      clearGameRuntimes();
    }
  });
});
