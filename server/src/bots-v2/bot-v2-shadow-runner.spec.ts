import { beforeEach, describe, expect, it } from 'vitest';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import { Player } from '../../../src/app/models/player.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { createTutorialReadState } from '../../../src/app/tutorial/tutorial-types.js';
import { runBotTurnPhaseV2Shadow } from './bot-v2-shadow-runner.js';
import { clearBotDecisionTracesV2, getBotDecisionTracesV2 } from './bot-v2-trace.js';

describe('bot-v2-shadow-runner', () => {
  beforeEach(() => {
    clearBotDecisionTracesV2();
  });

  it('builds economic proposals in shadow mode without mutating live queues or resources', () => {
    const system = new SolarSystem('BotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
    system.planets[0] = planet;
    planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.rBDSFTQ.resources = new ResourcesPack(5000, 5000, 5000);

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );
    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      1,
      [],
      1,
      new Map(),
      new Map([[1, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    runBotTurnPhaseV2Shadow(galaxy, {
      enabled: true,
      shadowMode: true,
      enabledSubsystems: {
        economic: true,
        defensive: false,
        warfare: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false
      },
      allowSupervisorAcceptance: false,
      allowExecution: false
    });

    const traces = getBotDecisionTracesV2(bot.playerId);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.snapshotSummary.planetCount).toBe(1);
    expect(traces[0]?.proposals.length).toBeGreaterThan(0);
    expect(traces[0]?.subsystemResults[0]?.subsystemId).toBe('ECONOMIC');
    expect(bot.botMemoryV2?.version).toBe(1);
    expect(planet.rBDSFTQ.buildingQueue).toHaveLength(0);
    expect(planet.rBDSFTQ.resources).toMatchObject({
      metal: 5000,
      crystal: 5000,
      deuterium: 5000
    });
  });
});
