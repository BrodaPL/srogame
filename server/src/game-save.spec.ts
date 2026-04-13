import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { BuildingBlueprintsFactory } from '../../src/app/factories/building-blueprints.factory.js';
import { BuildingQueueEntry } from '../../src/app/models/buildings/building-queue-entry.js';
import { BuildingType } from '../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../src/app/models/enums/defence-type.js';
import { FleetMissionType } from '../../src/app/models/enums/fleet-mission-type.js';
import { FleetOrbitActivity, FleetState } from '../../src/app/models/fleets/fleet.js';
import { GameType } from '../../src/app/models/enums/game-type.js';
import { StartingHomeworldPreset } from '../../src/app/models/enums/starting-homeworld-preset.js';
import { DEFAULT_AUTO_SAVE_TURNS, normalizeGalaxySetup } from '../../src/app/models/game-api-types.js';
import { NoteBorderColor } from '../../src/app/models/enums/note-border-color.js';
import { PlayerType } from '../../src/app/models/enums/player-type.js';
import { ShipType } from '../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../src/app/models/enums/technology-type.js';
import { DiplomaticProposalState } from '../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { DiplomaticStatus } from '../../src/app/models/diplomacy/diplomatic-status.js';
import { Fleet } from '../../src/app/models/fleets/fleet.js';
import { ManyDefences } from '../../src/app/models/defences/many-defences.js';
import { ManyShips } from '../../src/app/models/fleets/many-ships.js';
import { Destination } from '../../src/app/models/fleets/destination.js';
import { PlayerMessage } from '../../src/app/models/mail/player-message.js';
import { Player } from '../../src/app/models/player.js';
import { Galaxy } from '../../src/app/models/planets/galaxy.js';
import { PlanetaryParameters } from '../../src/app/models/planets/planetary-parameters.js';
import { SolarSystem } from '../../src/app/models/planets/solar-system.js';
import { ResearchHelperFor } from '../../src/app/models/tech/research-helper-for.js';
import { TechnologyQueueEntry } from '../../src/app/models/tech/technology-queue-entry.js';
import { ShipyardQueueEntry } from '../../src/app/models/fleets/shipyard-queue-entry.js';
import { ResourcesPack } from '../../src/app/models/resources-pack.js';
import { DefenceBuildingInstances } from '../../src/app/models/reports/defence-building-instances.js';
import { EspionageReportData } from '../../src/app/models/reports/espionage-report-data.js';
import { FleetReport } from '../../src/app/models/reports/fleet-report.js';
import { StarSystemNote } from '../../src/app/models/planets/star-system-note.js';
import {
  buildGameSaveSummary,
  createGameSave,
  hydrateGameSave,
  listGameSaveSummaries,
  listGameSaveSummariesForGame,
  readGameSaveById,
  readGameSaveSummary,
  resolveGameSaveLoadAccess,
  saveGameFile,
  shouldAutoSaveAfterTurn,
  writeRotatingAutoSave
} from './game-save.js';

describe('game-save', () => {
  const buildingBlueprints = BuildingBlueprintsFactory.fromDefaultJson().buildingsMap;

  it('serializes the live galaxy state into a save DTO without circular references', () => {
    const save = buildTestSave();

    expect(save.version).toBe(2);
    expect(save.gameId).toBe('game-save-test');
    expect(save.ownerAccountId).toBe(42);
    expect(save.savedAt).toBe('2026-04-01T12:00:00.000Z');
    expect(save.setup.autoSaveTurns).toBe(5);
    expect(save.galaxy.players[0].planetCoordinates).toEqual([{ x: 0, y: 0, z: 0 }]);
    expect(save.galaxy.players[0].fleetIds).toEqual([7]);
    expect(save.galaxy.players[0].reports).toHaveLength(2);
    expect(save.galaxy.players[0].messages[0].title).toBe('Mail');
    expect(save.galaxy.players[0].botProfileId).toBe('BALANCED');
    expect(save.galaxy.players[0].botMemory?.currentGoal).toBe('KEY_BUILDING_UP');
    expect(save.galaxy.stars[0][0].starSystemNotes[0].text).toBe('Scout route');
    expect(save.galaxy.stars[0][0].planets[0].rBDSFTQ.fleetIds).toEqual([7]);
    expect(save.galaxy.stars[0][0].planets[0].lastReportData[0].report.reportType).toBe('Espionage Report');
    expect(save.galaxy.activeFleets[0].bombardmentPriorities?.main).toBe(BuildingType.METAL_MINE);

    const json = JSON.stringify(save);
    expect(json).toContain('"ownerAccountId":42');
    expect(json).toContain('"autoSaveTurns":5');
    expect(json).toContain('"fleetId":7');
  });

  it('builds save summary, enforces local-admin load, and reads the summary from disk', () => {
    const save = buildTestSave();
    const summary = buildGameSaveSummary(save);

    expect(summary).toMatchObject({
      gameId: 'game-save-test',
      saveId: expect.stringContaining('save-test-game-game-save-test-turn-6-20260401-120000'),
      displayName: 'Save Test - Turn 6 - 2026-04-01T12:00:00.000Z',
      saveType: 'AUTOSAVE',
      autoSaveSlot: null,
      savedAt: '2026-04-01T12:00:00.000Z',
      ownerAccountId: 42,
      ownerPlayerName: 'Alpha',
      galaxyName: 'Save Test',
      currentTurn: 6,
      autoSaveTurns: 5
    });
    expect(resolveGameSaveLoadAccess(save, null, false)).toEqual({
      canLoad: false,
      canLoadReason: 'Login required to load the saved game.'
    });
    expect(resolveGameSaveLoadAccess(save, 11, false)).toEqual({
      canLoad: false,
      canLoadReason: 'Local admin privileges are required to load the saved game.'
    });
    expect(resolveGameSaveLoadAccess(save, 11, true)).toEqual({
      canLoad: true,
      canLoadReason: null
    });

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-save-'));
    const savePath = path.join(tempDir, 'game.json');

    try {
      saveGameFile(savePath, save);
      expect(readGameSaveSummary(savePath)).toEqual(summary);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('hydrates a saved game back into runtime objects with restored links', () => {
    const save = buildTestSave();
    const hydrated = hydrateGameSave(save);

    expect(hydrated.gameId).toBe('game-save-test');
    expect(hydrated.ownerAccountId).toBe(42);
    expect(hydrated.ownerPlayerName).toBe('Alpha');
    expect(hydrated.setup.autoSaveTurns).toBe(5);
    expect(hydrated.galaxy.name).toBe('Save Test');
    expect(hydrated.galaxy.currentTurn).toBe(6);

    const player = hydrated.galaxy.players[0];
    const system = hydrated.galaxy.stars[0][0];
    const planet = system.planets[0];
    const fleet = hydrated.galaxy.activeFleets[0];

    expect(player.playerName).toBe('Alpha');
    expect(player.botProfileId).toBe('BALANCED');
    expect(player.botMemory?.currentGoal).toBe('KEY_BUILDING_UP');
    expect(player.botMemory?.reservedResources).toEqual({ metal: 40, crystal: 20, deuterium: 10 });
    expect(player.botMemory?.recentDiplomacyTargets).toEqual([{ playerId: 2, requestedStatus: 'PEACE', turn: 5 }]);
    expect(player.planets[0]).toBe(planet);
    expect(player.fleets[0]).toBe(fleet);
    expect(planet.info.ownerId).toBe(player.playerId);
    expect(planet.basicInfo.solarSystem).toBe(system);
    expect(planet.rBDSFTQ.fleets[0]).toBe(fleet);
    expect(planet.lastReportData.get(player.playerId)?.reportType).toBe('Espionage Report');
    expect(planet.rBDSFTQ.currentResearchQueue?.technologyType).toBe(TechnologyType.COMPUTER_TECHNOLOGY);
    expect(planet.rBDSFTQ.researchHelperFor?.mainResearchCoordinates).toEqual({ x: 0, y: 0, z: 0 });
    expect(fleet.origin.x).toBe(0);
    expect(fleet.pendingJumpGateRequestId).toBe(13);
    expect(fleet.bombardmentPriorities?.main).toBe(BuildingType.METAL_MINE);
  });

  it('clamps over-invested building queue progress when hydrating a saved game', () => {
    const save = buildTestSave();
    save.galaxy.stars[0][0].planets[0].rBDSFTQ.buildingQueue[0].investedIndustryPower = 9999;

    const hydrated = hydrateGameSave(save);
    const planet = hydrated.galaxy.stars[0][0].planets[0];
    const entry = planet.rBDSFTQ.buildingQueue[0];
    const expectedMax = Math.floor(
      (buildingBlueprints.get(BuildingType.CRYSTAL_MINE)?.getCostForLevel(entry!.nextLevel).getTotalResourceAmount()) ?? 0
    );

    expect(entry).toBeTruthy();
    expect(entry!.investedIndustryPower).toBe(expectedMax);
    expect(entry!.investedIndustryPower).toBeLessThanOrEqual(expectedMax);
  });

  it('calculates autosave cadence from successful end-turn count', () => {
    expect(shouldAutoSaveAfterTurn(1, 5)).toBe(false);
    expect(shouldAutoSaveAfterTurn(5, 5)).toBe(false);
    expect(shouldAutoSaveAfterTurn(6, 5)).toBe(true);
    expect(shouldAutoSaveAfterTurn(11, 5)).toBe(true);
    expect(shouldAutoSaveAfterTurn(6, 0)).toBe(false);
    expect(shouldAutoSaveAfterTurn(6, -1)).toBe(false);
    expect(shouldAutoSaveAfterTurn(2, 1)).toBe(true);
  });

  it('normalizes missing autosave setup values to the shared default', () => {
    const normalized = normalizeGalaxySetup({
      gameType: GameType.PVE,
      galaxyName: 'Setup Test',
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
      startingResources: { metal: 6, crystal: 3, deuterium: 1 }
    });

    expect(normalized.autoSaveTurns).toBe(DEFAULT_AUTO_SAVE_TURNS);
    expect(normalized.startingHomeworldPreset).toBe(StartingHomeworldPreset.MEDIUM);
  });

  it('writes rotating autosaves per game and keeps five slots for each game independently', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-saves-'));

    try {
      const save = buildTestSave();
      const otherSave = {
        ...save,
        gameId: 'other-game',
        savedAt: '2026-04-01T13:00:00.000Z'
      };
      for (let index = 0; index < 7; index += 1) {
        const nextSave = {
          ...save,
          savedAt: `2026-04-01T12:00:0${index}.000Z`,
          galaxy: {
            ...save.galaxy,
            currentTurn: 6 + index
          }
        };

        writeRotatingAutoSave(tempDir, hydrateGameSave(nextSave).galaxy, 42, nextSave.setup, {
          savedAt: nextSave.savedAt,
          rotationLimit: 5,
          maxSaveFiles: 100,
          gameId: nextSave.gameId
        });
        if (index < 3) {
          const nextOtherSave = {
            ...otherSave,
            savedAt: `2026-04-01T13:00:0${index}.000Z`,
            galaxy: {
              ...otherSave.galaxy,
              currentTurn: 20 + index
            }
          };

          writeRotatingAutoSave(tempDir, hydrateGameSave(nextOtherSave).galaxy, 42, nextOtherSave.setup, {
            savedAt: nextOtherSave.savedAt,
            rotationLimit: 5,
            maxSaveFiles: 100,
            gameId: nextOtherSave.gameId
          });
        }
      }

      const summaries = listGameSaveSummaries(tempDir);
      const mainGameSummaries = listGameSaveSummariesForGame(tempDir, 'game-save-test');
      const otherGameSummaries = listGameSaveSummariesForGame(tempDir, 'other-game');
      expect(summaries).toHaveLength(8);
      expect(mainGameSummaries).toHaveLength(5);
      expect(otherGameSummaries).toHaveLength(3);
      expect(mainGameSummaries.map((entry) => entry.autoSaveSlot).sort()).toEqual([1, 2, 3, 4, 5]);
      expect(otherGameSummaries.map((entry) => entry.autoSaveSlot).sort()).toEqual([1, 2, 3]);
      expect(mainGameSummaries[0].displayName).toContain('Save Test - Turn 12');
      expect(mainGameSummaries[0].saveId).toContain('save-test-game-game-save-test-turn-12-20260401-120006-autosave-2');
      expect(readGameSaveById(tempDir, mainGameSummaries[0].saveId)?.autoSaveSlot).toBe(mainGameSummaries[0].autoSaveSlot);
      expect(readGameSaveById(tempDir, mainGameSummaries[0].saveId)?.gameId).toBe('game-save-test');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps legacy saves loadable when gameId is missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-legacy-save-'));

    try {
      const save = buildTestSave();
      const legacySavePath = path.join(tempDir, 'legacy-save.json');
      const legacySave = {
        ...save,
        version: 1
      } as Record<string, unknown>;
      delete legacySave.gameId;

      fs.writeFileSync(legacySavePath, JSON.stringify(legacySave, null, 2), 'utf-8');

      const summary = readGameSaveSummary(legacySavePath);
      const hydrated = readGameSaveById(tempDir, 'legacy-save.json');

      expect(summary?.gameId).toBeNull();
      expect(hydrated?.gameId).toBeNull();
      expect(hydrated?.version).toBe(1);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

function buildTestSave() {
  const system = new SolarSystem(
    'Helios',
    1,
    false,
    false,
    { x: 0, y: 0 },
    new Set<number>([1]),
    new Map<number, StarSystemNote>()
  );
  system.isCenterEdge = true;
  system.starSystemNotes.set(
    1,
    new StarSystemNote({ x: 0, y: 0 }, NoteBorderColor.GREEN, 'Scout route')
  );

  const planet = system.planets[0];
  planet.basicInfo.name = 'Helios Prime';
  planet.info.ownerId = 1;
  planet.info.planetaryParameters = new PlanetaryParameters(1.2, 0.9, 1.1, 1, 1, 0.8, 1.3, 0.7, 1.4);
  planet.rBDSFTQ.resources = new ResourcesPack(123, 45, 6);
  planet.rBDSFTQ.spaceDebris = new ResourcesPack(7, 8, 9);
  planet.rBDSFTQ.buildingsLevels.set(BuildingType.METAL_MINE, 4);
  planet.rBDSFTQ.buildingsCurrentPowerConsumption.set(BuildingType.METAL_MINE, 12);
  planet.rBDSFTQ.buildingsCurrentStructuralPoints.set(BuildingType.METAL_MINE, 99);
  planet.rBDSFTQ.ships = new ManyShips({ [ShipType.FIGHTER]: 3 }, [{ type: ShipType.CRUISER, hull: 55 }]);
  planet.rBDSFTQ.defences = new ManyDefences(
    { [DefenceType.LIGHT_BEAM_CANNON]: 5 },
    [{ type: DefenceType.SMALL_BOMB, hull: 15 }]
  );
  planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
    TechnologyType.COMPUTER_TECHNOLOGY,
    2,
    33,
    [{ x: 0, y: 0, z: 0 }]
  );
  planet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(
    { x: 0, y: 0, z: 0 },
    TechnologyType.COMPUTER_TECHNOLOGY
  );
  planet.rBDSFTQ.buildingQueue = [
    new BuildingQueueEntry(BuildingType.CRYSTAL_MINE, 3, 18)
  ];
  planet.rBDSFTQ.shipyardQueue = [
    ShipyardQueueEntry.ship(ShipType.FIGHTER, 4, 21)
  ];
  planet.rBDSFTQ.tradePortOffers = [{
    offerId: 9,
    turn: 6,
    getResourceType: 'metal',
    getAmount: 100,
    costResourceType: 'crystal',
    baseCost: 50,
    totalCost: 60,
    rolledModifierPercent: 20,
    levelDiscountPercent: 5,
    costModifierPercent: 15,
    used: false
  }];
  planet.rBDSFTQ.sensorPhalanxScansUsedTurn = 6;
  planet.rBDSFTQ.sensorPhalanxScansUsed = 1;
  planet.rBDSFTQ.sensorPhalanxKnownIncomingFleetIds = [7];

  const espionageReport = new EspionageReportData(
    {
      reportId: 2,
      createdTurn: 6,
      title: 'Probe result',
      sourceCoordinates: { x: 0, y: 0, z: 0 },
      sourcePlanetName: 'Helios Prime',
      sourceSystemName: 'Helios',
      senderPlayerName: 'Scout'
    },
    new PlanetaryParameters(1, 1, 1, 1, 1, 1, 1, 1, 1),
    3,
    200,
    4,
    5,
    6,
    new Map([[BuildingType.METAL_MINE, 4]]),
    new ResourcesPack(10, 20, 30),
    new Map([[TechnologyType.COMPUTER_TECHNOLOGY, 2]]),
    [new DefenceBuildingInstances(DefenceType.LIGHT_BEAM_CANNON, 5)],
    new Map([[ShipType.FIGHTER, 3]]),
    {},
    {},
    {},
    {}
  );
  planet.lastReportData.set(1, espionageReport);

  const fleet = new Fleet(
    7,
    1,
    FleetMissionType.MOVE,
    new Destination(0, 0, 0),
    new Destination(0, 0, 0),
    'Helios Prime',
    'Helios Prime',
    new ManyShips({ [ShipType.FIGHTER]: 2 }, []),
    new ResourcesPack(11, 12, 13),
    14,
    200,
    36,
    2,
    2,
    FleetState.ORBITING,
    4,
    new ManyDefences({ [DefenceType.SMALL_BOMB]: 1 }, []),
    FleetOrbitActivity.GUARDING
  );
  fleet.maintenanceRequestAvailable = true;
  fleet.pendingMaintenanceRequestId = 12;
  fleet.usesJumpGate = true;
  fleet.pendingJumpGateRequestId = 13;
  fleet.lastMaintenanceRequestTurn = 5;
  fleet.bombardmentPriorities = {
    main: BuildingType.METAL_MINE,
    secondary: null,
    tertiary: null
  };
  fleet.remainingFuelReserve = 10;
  planet.rBDSFTQ.fleets = [fleet];

  const player = new Player(
    1,
    'Alpha',
    [planet],
    new Map([[TechnologyType.COMPUTER_TECHNOLOGY, 2]]),
    [fleet],
    PlayerType.PLAYER,
    undefined,
    [],
    1,
    [],
    1,
    {
      botProfileId: 'BALANCED',
      botMemory: {
        currentGoal: 'KEY_BUILDING_UP',
        goalTarget: { x: 0, y: 0, z: 0 },
        goalExpiresTurn: 8,
        reservedResources: { metal: 40, crystal: 20, deuterium: 10 },
        lastSpyTargets: [{ x: 1, y: 0, z: 0 }],
        lastAttackTargets: [{ x: 2, y: 1, z: 0 }],
        recentDiplomacyTargets: [{ playerId: 2, requestedStatus: 'PEACE', turn: 5 }]
      }
    }
  );
  player.nextReportId = 9;
  player.nextMessageId = 4;
  player.addReport(new FleetReport(
    {
      reportId: 1,
      createdTurn: 6,
      title: 'Fleet update',
      sourceCoordinates: { x: 0, y: 0, z: 0 },
      sourcePlanetName: 'Helios Prime',
      sourceSystemName: 'Helios',
      senderPlayerName: 'Control'
    },
    'Orbit secured.'
  ));
  player.addReport(espionageReport);
  player.addMessage(new PlayerMessage({
    messageId: 3,
    createdTurn: 6,
    title: 'Mail',
    body: 'Status green.',
    senderPlayerId: 2,
    senderPlayerName: 'Beta'
  }));

  const galaxy = new Galaxy(
    'Save Test',
    [player],
    [[system]],
    6,
    [fleet],
    8,
    new Map([[1, player]]),
    new Map(),
    new Map(),
    new Map([['Alpha', 1]]),
    [{ playerAId: 1, playerBId: 2, status: DiplomaticStatus.PEACE }],
    [{
      proposalId: 10,
      fromPlayerId: 1,
      toPlayerId: 2,
      requestedStatus: DiplomaticStatus.ALLIED,
      createdTurn: 6,
      expiresOnTurn: 7,
      state: DiplomaticProposalState.PENDING
    }],
    11,
    [{
      requestId: 13,
      fleetId: 7,
      fromPlayerId: 1,
      toPlayerId: 2,
      originPlanetName: 'Helios Prime',
      originCoordinates: { x: 0, y: 0, z: 0 },
      targetPlanetName: 'Helios Prime',
      targetCoordinates: { x: 0, y: 0, z: 0 },
      missionType: FleetMissionType.MOVE,
      totalShips: 2,
      createdTurn: 6,
      expiresOnTurn: 7,
      state: DiplomaticProposalState.PENDING
    }],
    14,
    [{
      requestId: 12,
      fleetId: 7,
      fromPlayerId: 1,
      toPlayerId: 2,
      targetPlanetName: 'Helios Prime',
      targetCoordinates: { x: 0, y: 0, z: 0 },
      createdTurn: 6,
      expiresOnTurn: 7,
      state: DiplomaticProposalState.PENDING,
      requested: {
        fuel: 3,
        ships: [{ type: ShipType.FIGHTER, amount: 1 }],
        bombs: []
      },
      approved: null
    }],
    15
  );

  return createGameSave(galaxy, 42, {
    gameType: GameType.PVE,
    galaxyName: 'Save Test',
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
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    startingHomeworldPreset: StartingHomeworldPreset.MEDIUM,
    startingResources: { metal: 6, crystal: 3, deuterium: 1 }
  }, '2026-04-01T12:00:00.000Z', null, 'game-save-test');
}
