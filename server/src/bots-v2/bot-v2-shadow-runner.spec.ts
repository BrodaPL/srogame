import { beforeEach, describe, expect, it } from 'vitest';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { createDiplomaticRelation } from '../../../src/app/models/diplomacy/diplomatic-relation.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { EspionageReportGenerator } from '../../../src/app/generators/espionage-report-generator.js';
import { ManyShips } from '../../../src/app/models/fleets/many-ships.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import { Player } from '../../../src/app/models/player.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { createTutorialReadState } from '../../../src/app/tutorial/tutorial-types.js';
import { runBotTurnPhaseV2, runBotTurnPhaseV2Shadow } from './bot-v2-shadow-runner.js';
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
      mode: 'SHADOW',
      enabledSubsystems: {
        economic: true,
        defensive: false,
        warfare: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      },
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

  it('executes queue actions in live mode without running V1', () => {
    const { galaxy, bot, planet } = createEconomicGalaxy();

    runBotTurnPhaseV2(galaxy, {
      mode: 'LIVE',
      enabledSubsystems: {
        economic: true,
        defensive: false,
        warfare: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      }
    });

    const traces = getBotDecisionTracesV2(bot.playerId);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.supervisorDecision.mode).toBe('LIVE');
    expect(traces[0]?.supervisorDecision.acceptedProposalIds.length).toBeGreaterThan(0);
    expect(traces[0]?.executionOutcomes.some((outcome) => outcome.success)).toBe(true);
    expect(planet.rBDSFTQ.buildingQueue.length).toBeGreaterThan(0);
    expect(bot.botMemoryV2?.supervisor.spendingHistory.length).toBeGreaterThan(0);
  });

  it('adds hostility pressure to the foreign bot after successful neutral recycle execution', () => {
    const { galaxy, bot, foreignBot, homePlanet, foreignPlanet } = createRecycleGalaxy();
    homePlanet.rBDSFTQ.ships = new ManyShips({ [ShipType.RECYCLER]: 10, [ShipType.CRUISER]: 1 }, []);
    foreignPlanet.rBDSFTQ.spaceDebris = new ResourcesPack(6000, 4000, 2000);
    const report = new EspionageReportGenerator().createEspionageReport(bot, foreignBot, foreignPlanet, 5, {
      createdTurn: galaxy.currentTurn,
      forcedReportLevel: 12
    });
    foreignPlanet.lastReportData.set(bot.playerId, report);

    runBotTurnPhaseV2(galaxy, {
      mode: 'LIVE',
      enabledSubsystems: {
        economic: false,
        defensive: false,
        warfare: true,
        research: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      }
    });

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.RECYCLE)).toBe(true);
    expect(foreignBot.botMemoryV2?.strategicDiplomatic.factionLedger.some((entry) =>
      entry.playerId === bot.playerId && entry.hostilityScore >= 1
    )).toBe(true);
  });
});

function createEconomicGalaxy(): { galaxy: Galaxy; bot: Player; planet: Planet } {
  const system = new SolarSystem('BotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const planet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  system.planets[1] = planet;
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

  return { galaxy, bot, planet };
}

function createRecycleGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  foreignBot: Player;
  homePlanet: Planet;
  foreignPlanet: Planet;
} {
  const system = new SolarSystem('RecycleSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('RecycleSys I', 1, system, 1);
  const foreignPlanet = Planet.createStartingPlanet('RecycleSys II', 2, system, null);
  system.planets[1] = homePlanet;
  system.planets[2] = foreignPlanet;
  homePlanet.setBuildingLevel(BuildingType.METAL_MINE, 6);
  homePlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 6);
  homePlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 6);
  homePlanet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
  homePlanet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
  homePlanet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
  homePlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
  homePlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 4);
  homePlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 4);
  homePlanet.setBuildingLevel(BuildingType.SHIPYARD, 5);
  homePlanet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);
  homePlanet.rBDSFTQ.resources = new ResourcesPack(50000, 50000, 50000);

  const bot = new Player(
    1,
    'Bot-1',
    [homePlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const foreignBot = new Player(
    2,
    'Foreign-2',
    [foreignPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  foreignPlanet.info.ownerId = foreignBot.playerId;

  const galaxy = new Galaxy(
    'Recycle Test',
    [bot, foreignBot],
    [[system]],
    20,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot], [foreignBot.playerId, foreignBot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId], [foreignBot.playerName, foreignBot.playerId]]),
    [createDiplomaticRelation(bot.playerId, foreignBot.playerId, DiplomaticStatus.NEUTRAL)]
  );

  return { galaxy, bot, foreignBot, homePlanet, foreignPlanet };
}
