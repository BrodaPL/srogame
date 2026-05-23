import { describe, expect, it } from 'vitest';
import { StartingHomeworldPreset } from '../enums/starting-homeworld-preset';
import {
  createDefaultBotProfileCounts,
  DEFAULT_STARTING_HOMEWORLD_PRESET,
  expandBotProfileCounts,
  hasExactBotProfileCountMatch,
  normalizeBotProfileCounts,
  normalizeGalaxySetup,
  sumBotProfileCounts
} from '../game-api-types';

describe('game-api-types bot profile counts', () => {
  it('defaults all configured bots to BALANCED when counts are missing', () => {
    const setup = normalizeGalaxySetup({
      gameType: 'PvE',
      galaxyName: 'Profiles',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: 1,
      botsAmount: 3,
      botDifficulty: 0,
      neutralBotsAmount: 1,
      neutralBotsDifficulty: 0,
      startingResources: {
        metal: 6,
        crystal: 3,
        deuterium: 1
      }
    });

    expect(setup.botProfileCounts).toEqual({
      BALANCED: 3,
      AGGRESSOR: 0,
      TURTLE: 0,
      MINER: 0,
      AVOIDER: 0,
      BUNKERER: 0
    });
    expect(setup.startingHomeworldPreset).toBe(DEFAULT_STARTING_HOMEWORLD_PRESET);
    expect(setup.enablePlayerActionLogging).toBe(false);
  });

  it('normalizes invalid values to zero and preserves exact totals', () => {
    const counts = normalizeBotProfileCounts({
      BALANCED: '2',
      AGGRESSOR: 1,
      TURTLE: -5,
      MINER: 'x',
      AVOIDER: 0,
      BUNKERER: 0
    }, 3);

    expect(counts).toEqual({
      BALANCED: 2,
      AGGRESSOR: 1,
      TURTLE: 0,
      MINER: 0,
      AVOIDER: 0,
      BUNKERER: 0
    });
    expect(sumBotProfileCounts(counts)).toBe(3);
    expect(hasExactBotProfileCountMatch(counts, 3)).toBe(true);
  });

  it('expands deterministic profile order from counts', () => {
    const counts = createDefaultBotProfileCounts(0);
    counts.AGGRESSOR = 2;
    counts.MINER = 1;
    counts.BALANCED = 1;

    expect(expandBotProfileCounts(counts)).toEqual([
      'BALANCED',
      'AGGRESSOR',
      'AGGRESSOR',
      'MINER'
    ]);
  });

  it('falls back to MEDIUM when the homeworld preset is missing or invalid', () => {
    const missingPreset = normalizeGalaxySetup({
      gameType: 'PvE',
      galaxyName: 'Missing Preset',
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
      startingResources: {
        metal: 6,
        crystal: 3,
        deuterium: 1
      }
    });
    const invalidPreset = normalizeGalaxySetup({
      ...missingPreset,
      startingHomeworldPreset: 'Broken' as StartingHomeworldPreset
    });

    expect(missingPreset.startingHomeworldPreset).toBe(StartingHomeworldPreset.MEDIUM);
    expect(invalidPreset.startingHomeworldPreset).toBe(StartingHomeworldPreset.MEDIUM);
  });

  it('normalizes player action logging flag to a strict boolean', () => {
    const disabled = normalizeGalaxySetup({
      gameType: 'PvE',
      galaxyName: 'Logging Disabled',
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
      enablePlayerActionLogging: false,
      startingResources: {
        metal: 6,
        crystal: 3,
        deuterium: 1
      }
    });
    const enabled = normalizeGalaxySetup({
      ...disabled,
      enablePlayerActionLogging: true
    });

    expect(disabled.enablePlayerActionLogging).toBe(false);
    expect(enabled.enablePlayerActionLogging).toBe(true);
  });
});
