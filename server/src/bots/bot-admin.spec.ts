import { afterEach, describe, expect, it } from 'vitest';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { Planet } from '../../../src/app/models/planets/planet.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { Player, type BotMemory } from '../../../src/app/models/player.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { createTutorialReadState } from '../../../src/app/tutorial/tutorial-types.js';
import {
  clearBotMemory,
  isBotPaused,
  listBotAdminStates,
  pauseBot,
  resetBotAdminRuntimeState,
  resumeBot,
  setBotProfile
} from './bot-admin.js';

describe('bot-admin', () => {
  afterEach(() => {
    resetBotAdminRuntimeState();
  });

  it('lists live bot admin state and applies profile/memory mutations', () => {
    const system = new SolarSystem('BotAdmin', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('BotAdmin I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true),
      [],
      1,
      [],
      1,
      {
        botProfileId: 'BALANCED',
        botMemory: {
          currentGoal: 'PREPARE_SAFE_ATTACK',
          goalTarget: { x: 0, y: 0, z: 0 },
          goalExpiresTurn: 9,
          reservedResources: { metal: 10, crystal: 5, deuterium: 2 },
          lastSpyTargets: [],
          lastAttackTargets: []
        } satisfies BotMemory
      }
    );
    planet.info.ownerId = bot.playerId;

    const galaxy = new Galaxy(
      'Bot Admin Galaxy',
      [bot],
      [[system]],
      4,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    setBotProfile(bot, 'AGGRESSOR');
    pauseBot(bot.playerId);

    let states = listBotAdminStates(galaxy);
    expect(states).toHaveLength(1);
    expect(states[0]?.profileId).toBe('AGGRESSOR');
    expect(states[0]?.paused).toBe(true);
    expect(states[0]?.currentGoal).toBe('PREPARE_SAFE_ATTACK');
    expect(isBotPaused(bot.playerId)).toBe(true);

    clearBotMemory(bot);
    resumeBot(bot.playerId);
    states = listBotAdminStates(galaxy);
    expect(states[0]?.paused).toBe(false);
    expect(states[0]?.currentGoal).toBeNull();
    expect(isBotPaused(bot.playerId)).toBe(false);
  });
});
