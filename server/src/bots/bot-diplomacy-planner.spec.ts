import { describe, expect, it } from 'vitest';
import { EspionageReportGenerator } from '../../../src/app/generators/espionage-report-generator.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { Player } from '../../../src/app/models/player.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { createTutorialReadState } from '../../../src/app/tutorial/tutorial-types.js';
import { BOT_PROFILES } from './bot-profile.js';
import { buildBotDiplomacyProposalCandidate } from './bot-diplomacy-planner.js';

describe('bot-diplomacy-planner', () => {
  it('builds a peace proposal candidate for a pressured avoider bot', () => {
    const galaxy = createDiplomacyPlannerGalaxy(PlayerType.PLAYER, DiplomaticStatus.WAR);
    const bot = galaxy.players[0]!;
    bot.botProfileId = 'AVOIDER';

    const candidate = buildBotDiplomacyProposalCandidate(galaxy, bot, BOT_PROFILES.AVOIDER);

    expect(candidate).not.toBeNull();
    expect(candidate?.requestedStatus).toBe(DiplomaticStatus.PEACE);
  });

  it('respects recent diplomacy cooldown memory', () => {
    const galaxy = createDiplomacyPlannerGalaxy(PlayerType.PLAYER, DiplomaticStatus.WAR);
    const bot = galaxy.players[0]!;
    bot.botProfileId = 'AVOIDER';
    bot.botMemory = {
      currentGoal: null,
      goalTarget: null,
      goalExpiresTurn: null,
      reservedResources: { metal: 0, crystal: 0, deuterium: 0 },
      lastSpyTargets: [],
      lastAttackTargets: [],
      recentDiplomacyTargets: [{ playerId: 2, requestedStatus: 'PEACE', turn: galaxy.currentTurn - 1 }]
    };

    const candidate = buildBotDiplomacyProposalCandidate(galaxy, bot, BOT_PROFILES.AVOIDER);

    expect(candidate).toBeNull();
  });
});

function createDiplomacyPlannerGalaxy(targetType: PlayerType, relation: DiplomaticStatus): Galaxy {
  const system = new SolarSystem('Diplomacy Planner', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  system.planets[0].info.ownerId = 1;
  system.planets[1].info.ownerId = 2;

  const bot = new Player(1, 'Bot-1', [system.planets[0]], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const target = new Player(2, 'Target', [system.planets[1]], new Map(), [], targetType, createTutorialReadState(true));
  system.planets[1].rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 20);
  system.planets[1].lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, target, system.planets[1], 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  return new Galaxy(
    'Diplomacy Planner',
    [bot, target],
    [[system]],
    6,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    targetType === PlayerType.BOT ? new Map([[target.playerId, target]]) : new Map(),
    new Map([[bot.playerName, bot.playerId], [target.playerName, target.playerId]]),
    [{ playerAId: bot.playerId, playerBId: target.playerId, status: relation }]
  );
}
