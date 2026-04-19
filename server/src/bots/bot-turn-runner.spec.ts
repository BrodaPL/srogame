import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateIdleEconomyFallbackDecision, runBotTurnPhase } from './bot-turn-runner.js';
import { BOT_PROFILES } from './bot-profile.js';
import { clearBotDecisionTraces, getBotDecisionTraces, recordBotDecisionTrace } from './bot-debug-store.js';
import { pauseBot, resetBotAdminRuntimeState } from './bot-admin.js';
import { EspionageReportGenerator } from '../../../src/app/generators/espionage-report-generator.js';
import { createDiplomaticProposal } from '../../../src/app/models/diplomacy/diplomatic-proposal.js';
import { DiplomaticProposalState } from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { DiplomacyResolver } from '../../../src/app/models/diplomacy/diplomacy-resolver.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { Planet } from '../../../src/app/models/planets/planet.js';
import { Player } from '../../../src/app/models/player.js';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { Destination } from '../../../src/app/models/fleets/destination.js';
import { Fleet, FleetOrbitActivity, FleetState } from '../../../src/app/models/fleets/fleet.js';
import { ManyShips } from '../../../src/app/models/fleets/many-ships.js';
import { createJumpGateRequest } from '../../../src/app/models/requests/jump-gate-request.js';
import { createMaintenanceRequest } from '../../../src/app/models/requests/maintenance-request.js';
import { createSupportRequest } from '../../../src/app/models/requests/support-request.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../src/app/models/enums/defence-type.js';
import { PlanetType } from '../../../src/app/models/enums/planet-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { FleetReport } from '../../../src/app/models/reports/fleet-report.js';
import { createTutorialReadState } from '../../../src/app/tutorial/tutorial-types.js';

describe('bot-turn-runner', () => {
  beforeEach(() => {
    clearBotDecisionTraces();
    resetBotAdminRuntimeState();
  });

  it('assigns a default profile and queues at least one economy action for a bot that can afford one', () => {
    const system = new SolarSystem('BotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
    system.planets[0] = planet;

    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.rBDSFTQ.resources = new ResourcesPack(500, 500, 200);

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

    runBotTurnPhase(galaxy);

    expect(bot.botProfileId).not.toBeNull();
    expect(
      planet.rBDSFTQ.buildingQueue.length
      + planet.rBDSFTQ.shipyardQueue.length
      + (planet.rBDSFTQ.currentResearchQueue ? 1 : 0)
    ).toBeGreaterThan(0);
  });

  it('uses an idle economy fallback when the best affordable action is slightly below threshold', () => {
    const system = new SolarSystem('StallSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('StallSys I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'MINER';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 1);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
    bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.ASTROPHYSICS_TECHNOLOGY, 3);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);

    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 3);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 2);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 2);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 2);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.rBDSFTQ.resources = new ResourcesPack(1600, 1200, 400);
    planet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      263,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    runBotTurnPhase(galaxy);

    expect(planet.rBDSFTQ.buildingQueue.length).toBeGreaterThan(0);
    const trace = getBotDecisionTraces(bot.playerId)[0];
    expect(trace?.actionBudget.used).toBeGreaterThan(0);
    expect(trace?.chosenActions[0]?.details['idleFallbackFloor']).not.toBeUndefined();
  });

  it('widens the idle economy fallback window for low-value buildings and research', () => {
    const minerBuildingFallback = evaluateIdleEconomyFallbackDecision(
      'building',
      BOT_PROFILES.MINER,
      0,
      0,
      false,
      1.33
    );
    const aggressorResearchFallback = evaluateIdleEconomyFallbackDecision(
      'research',
      BOT_PROFILES.AGGRESSOR,
      0,
      0,
      false,
      -1.08
    );

      expect(minerBuildingFallback.allowed).toBe(true);
      expect(minerBuildingFallback.used).toBe(true);
      expect(minerBuildingFallback.floor).toBe(0.25);

      expect(aggressorResearchFallback.allowed).toBe(true);
      expect(aggressorResearchFallback.used).toBe(true);
      expect(aggressorResearchFallback.floor).toBe(-1.5);

    const balancedResearchFallback = evaluateIdleEconomyFallbackDecision(
      'research',
      BOT_PROFILES.BALANCED,
      0,
      0,
      false,
      -1
    );

    expect(balancedResearchFallback.allowed).toBe(true);
    expect(balancedResearchFallback.used).toBe(true);
    expect(balancedResearchFallback.floor).toBe(-1.25);

    const minerLateGameBuildingFallback = evaluateIdleEconomyFallbackDecision(
      'building',
      BOT_PROFILES.MINER,
      0,
      0,
      false,
      0.27
    );

    expect(minerLateGameBuildingFallback.allowed).toBe(true);
    expect(minerLateGameBuildingFallback.used).toBe(true);
    expect(minerLateGameBuildingFallback.floor).toBe(0.25);

    const bunkererBuildingFallback = evaluateIdleEconomyFallbackDecision(
      'building',
      BOT_PROFILES.BUNKERER,
      0,
      0,
      false,
      0
    );

    expect(bunkererBuildingFallback.allowed).toBe(true);
    expect(bunkererBuildingFallback.used).toBe(true);
    expect(bunkererBuildingFallback.floor).toBe(0);
  });

  it('allows one narrow queued-work fallback for bootstrap deadlock recovery candidates', () => {
    const deadlockOverride = evaluateIdleEconomyFallbackDecision(
      'building',
      BOT_PROFILES.BALANCED,
      0,
      0,
      true,
      0.1,
      {
        bootstrapDeadlockActive: true,
        bootstrapRecoveryCandidate: true,
        allowQueuedWorkOverride: true,
        effectiveThreshold: 0.25
      }
    );

    expect(deadlockOverride.eligible).toBe(true);
    expect(deadlockOverride.allowed).toBe(true);
    expect(deadlockOverride.used).toBe(true);
    expect(deadlockOverride.reason).toBe('bootstrap_queue_override');
    expect(deadlockOverride.floor).toBe(0);
  });

  it('prioritizes a real energy recovery action on an underpowered economy planet', () => {
    const system = new SolarSystem('PowerSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('PowerSys I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'BALANCED';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 3);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.rBDSFTQ.resources = new ResourcesPack(1200, 900, 300);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      12,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    runBotTurnPhase(galaxy);

    const queuedBuildingType = planet.rBDSFTQ.buildingQueue[0]?.buildingType ?? null;
    const queuedResearchType = planet.rBDSFTQ.currentResearchQueue?.technologyType ?? null;
    expect(
      queuedBuildingType === BuildingType.SOLAR_WIND_GEOTHERMAL
      || queuedBuildingType === BuildingType.NUCLEAR_PLANT
      || queuedBuildingType === BuildingType.FUSION_REACTOR
      || queuedResearchType === TechnologyType.ENERGY_TECHNOLOGY
    ).toBe(true);
  });

  it('queues storage relief during throughput when capped resources block further mine growth', () => {
    const system = new SolarSystem('CapSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('CapSys I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'BALANCED';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 3);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 1);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
    bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 3);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 3);
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 1);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 4);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 0);
    planet.rBDSFTQ.resources = new ResourcesPack(400, 300, 200);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      12,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    runBotTurnPhase(galaxy);

    const queuedBuildingType = planet.rBDSFTQ.buildingQueue[0]?.buildingType ?? null;
    expect(
      queuedBuildingType === BuildingType.METAL_STORAGE
      || queuedBuildingType === BuildingType.CRYSTAL_STORAGE
      || queuedBuildingType === BuildingType.DEUTERIUM_TANK
    ).toBe(true);
  });

  it('allows throughput-stage material research to unlock blocked shipyard progression', () => {
    const system = new SolarSystem('UnlockSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('UnlockSys I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'BALANCED';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 3);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 1);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
    bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 3);
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 1);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 3);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.rBDSFTQ.resources = new ResourcesPack(100, 100, 50);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      12,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    runBotTurnPhase(galaxy);

    expect(planet.rBDSFTQ.currentResearchQueue?.technologyType).toBe(TechnologyType.MATERIAL_TECHNOLOGY);
  });

  it('uses deadlock-aware scoring to keep a stalled bootstrap economy progressing', () => {
    const system = new SolarSystem('StallRecoverSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('StallRecoverSys I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'BALANCED';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 4);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 1);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
    bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 2);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 3);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 4);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 4);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 3);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 2);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 2);
    planet.rBDSFTQ.resources = new ResourcesPack(1740, 1310, 616);
    planet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      174,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    recordBotDecisionTrace({
      playerId: bot.playerId,
      playerName: bot.playerName,
      turn: 172,
      profileId: bot.botProfileId,
      startingGoal: null,
      endingGoal: null,
      actionBudget: { max: 10, used: 0, stopReason: 'below_threshold' },
      chosenActions: [],
      rejectedActions: [{
        kind: 'building',
        reason: 'Robotics Factory upgrade on StallRecoverSys I',
        rejectionType: 'threshold',
        expectedUtility: -1.33,
        details: {}
      }]
    });
    recordBotDecisionTrace({
      playerId: bot.playerId,
      playerName: bot.playerName,
      turn: 173,
      profileId: bot.botProfileId,
      startingGoal: null,
      endingGoal: null,
      actionBudget: { max: 10, used: 0, stopReason: 'below_threshold' },
      chosenActions: [],
      rejectedActions: [{
        kind: 'building',
        reason: 'Robotics Factory upgrade on StallRecoverSys I',
        rejectionType: 'threshold',
        expectedUtility: -1.33,
        details: {}
      }]
    });

    runBotTurnPhase(galaxy);

    const trace = getBotDecisionTraces(bot.playerId).slice(-1)[0];
    const chosenBuildingType = planet.rBDSFTQ.buildingQueue[0]?.buildingType ?? null;

    expect(trace?.actionBudget.used).toBeGreaterThan(0);
    expect(trace?.chosenActions[0]?.details['bootstrapDeadlockActive']).toBe(true);
    expect(trace?.chosenActions[0]?.details['bootstrapDeadlockBonus']).not.toBeNull();
    expect(
      chosenBuildingType === BuildingType.ROBOTICS_FACTORY
      || chosenBuildingType === BuildingType.METAL_MINE
      || chosenBuildingType === BuildingType.CRYSTAL_MINE
      || chosenBuildingType === BuildingType.DEUTERIUM_SYNTHESIZER
      || chosenBuildingType === BuildingType.SHIPYARD
      || chosenBuildingType === BuildingType.METAL_STORAGE
      || chosenBuildingType === BuildingType.CRYSTAL_STORAGE
      || chosenBuildingType === BuildingType.DEUTERIUM_TANK
      || planet.rBDSFTQ.currentResearchQueue?.technologyType === TechnologyType.MATERIAL_TECHNOLOGY
      || planet.rBDSFTQ.currentResearchQueue?.technologyType === TechnologyType.ENERGY_TECHNOLOGY
    ).toBe(true);
  });

  it('recovers from a capped deuterium bootstrap stall without falling back to zero-action turns', () => {
    const system = new SolarSystem('KurvixLike', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('KurvixLike I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'BALANCED';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 4);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 1);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
    bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 2);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 4);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 4);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 4);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 2);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 2);
    planet.rBDSFTQ.resources = new ResourcesPack(5220, 2790, 1600);
    planet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      206,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    for (let turn = 202; turn <= 205; turn += 1) {
      recordBotDecisionTrace({
        playerId: bot.playerId,
        playerName: bot.playerName,
        turn,
        profileId: bot.botProfileId,
        startingGoal: null,
        endingGoal: null,
        actionBudget: { max: 10, used: 0, stopReason: 'below_threshold' },
        chosenActions: [],
        rejectedActions: [{
          kind: 'building',
          reason: 'Deuterium Tank deadlock relief on KurvixLike I',
          rejectionType: 'threshold',
          expectedUtility: -2.2,
          details: {
            bootstrapRecoveryCandidate: true
          }
        }]
      });
    }

    runBotTurnPhase(galaxy);

    const trace = getBotDecisionTraces(bot.playerId).slice(-1)[0];
    const chosenBuildingType = planet.rBDSFTQ.buildingQueue[0]?.buildingType ?? null;
    const chosenResearchType = planet.rBDSFTQ.currentResearchQueue?.technologyType ?? null;

    expect(trace?.actionBudget.used).toBeGreaterThan(0);
    expect(trace?.chosenActions[0]?.details['bootstrapRecoveryCandidate']).toBe(true);
    expect(
      chosenBuildingType === BuildingType.METAL_MINE
      || chosenBuildingType === BuildingType.CRYSTAL_MINE
      || chosenBuildingType === BuildingType.DEUTERIUM_SYNTHESIZER
      || chosenBuildingType === BuildingType.ROBOTICS_FACTORY
      || chosenBuildingType === BuildingType.RESEARCH_LAB
      || chosenBuildingType === BuildingType.SHIPYARD
      || chosenBuildingType === BuildingType.METAL_STORAGE
      || chosenBuildingType === BuildingType.CRYSTAL_STORAGE
      || chosenBuildingType === BuildingType.DEUTERIUM_TANK
      || chosenResearchType === TechnologyType.MATERIAL_TECHNOLOGY
      || chosenResearchType === TechnologyType.ENERGY_TECHNOLOGY
    ).toBe(true);
  });

  it('does not queue a fusion reactor upgrade when the projected net deuterium would go negative', () => {
    const system = new SolarSystem('FusionSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
    const planet = Planet.createStartingPlanet('FusionSys I', 1, system, 1);
    system.planets[0] = planet;

    const bot = new Player(
      1,
      'Bot-1',
      [planet],
      new Map(),
      [],
      PlayerType.BOT,
      createTutorialReadState(true)
    );

    initializePlanet(planet, bot.playerId);
    bot.botProfileId = 'BALANCED';
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 4);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 2);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 4);
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 1);
    planet.setCurrentBuildingPowerConsumption(BuildingType.FUSION_REACTOR, 1);
    planet.rBDSFTQ.resources = new ResourcesPack(1800, 1400, 400);

    const galaxy = new Galaxy(
      'Bot Test',
      [bot],
      [[system]],
      18,
      [],
      1,
      new Map(),
      new Map([[bot.playerId, bot]]),
      new Map(),
      new Map([[bot.playerName, bot.playerId]])
    );

    runBotTurnPhase(galaxy);

    expect(planet.rBDSFTQ.buildingQueue.some((entry) => entry.buildingType === BuildingType.FUSION_REACTOR)).toBe(false);
  });

  it('launches a spy mission when nearby intel is stale and a probe is available', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 20);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    galaxy.diplomaticRelations = [
      { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
    ];
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 1
      })
    );
    galaxy.currentTurn = 6;

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.SPY)).toBe(true);
  });

  it('uses star-system espionage when an entire nearby system has no intel at all', () => {
    const { galaxy, bot } = createStarSystemSpyBotGalaxy();

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.filter((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.SPY
    )).toHaveLength(2);
    const traces = getBotDecisionTraces(bot.playerId);
    expect(traces[0]?.chosenActions.some((entry) => entry.kind === 'system_spy')).toBe(true);
  });

  it('does not use star-system espionage when the system already contains fresh intel on one target', () => {
    const { galaxy, bot, enemyPlanet, enemyOwner } = createStarSystemSpyBotGalaxy();
    enemyPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, enemyOwner, enemyPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: galaxy.currentTurn
      })
    );

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.filter((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.SPY
    )).toHaveLength(1);
    const traces = getBotDecisionTraces(bot.playerId);
    expect(traces[0]?.chosenActions.some((entry) => entry.kind === 'system_spy')).toBe(false);
    expect(traces[0]?.chosenActions.some((entry) => entry.kind === 'spy')).toBe(true);
  });

  it('launches a colonize mission when a nearby colonizable planet and colonizer are available', () => {
    const { galaxy, bot, homePlanet, targetPlanet } = createTwoPlanetGalaxy(null);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 40);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    targetPlanet.info.ownerId = null;
    galaxy.currentTurn = 4;

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.COLONIZE)).toBe(true);
  });

  it('launches a conservative attack when known intel shows a very weak passive target', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    makeBotFarmReady(bot, homePlanet);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 120);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 3);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(300, 150, 50);
    galaxy.currentTurn = 6;
    galaxy.diplomaticRelations = [
      { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.PASSIVE }
    ];
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 6
      })
    );
    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK)).toBe(true);
  });

  it('does not launch farm attacks before drive and economy milestones are met', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 120);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 3);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(300, 150, 50);
    galaxy.currentTurn = 8;
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 1
      })
    );

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK)).toBe(false);
  });

  it('still farms a cleared neutral target even when the last intel is stale', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    makeBotFarmReady(bot, homePlanet);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 220);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 3);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(360, 180, 60);
    galaxy.currentTurn = 8;
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 1
      })
    );

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK)).toBe(true);
  });

  it('prefers a passive farm target over an equally weak neutral farm target', () => {
    const { galaxy, bot, passivePlanet } = createPassiveAndNeutralFarmGalaxy();

    runBotTurnPhase(galaxy);

    const attackFleet = galaxy.activeFleets.find((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK
    ) ?? null;
    expect(attackFleet).not.toBeNull();
    expect(attackFleet?.target.x).toBe(passivePlanet.basicInfo.solarSystem.coordinates.x);
    expect(attackFleet?.target.y).toBe(passivePlanet.basicInfo.solarSystem.coordinates.y);
    expect(attackFleet?.target.z).toBe(passivePlanet.basicInfo.order - 1);
  });

  it('does not refarm the same neutral target before the 10-turn cooldown expires', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    makeBotFarmReady(bot, homePlanet);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 220);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(360, 180, 60);
    galaxy.currentTurn = 12;
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 10
      })
    );
    bot.botMemory = Player.normalizeBotMemory({
      currentGoal: null,
      goalTarget: null,
      goalExpiresTurn: null,
      reservedResources: { metal: 0, crystal: 0, deuterium: 0 },
      lastSpyTargets: [],
      lastAttackTargets: [],
      recentDiplomacyTargets: [],
      farmTargets: [{
        targetCoordinates: { x: 0, y: 0, z: 1 },
        lastAttackTurn: 10,
        nextAllowedAttackTurn: 20,
        lastSentCombatStrength: 40,
        lastKnownDefenceCount: 0,
        lastKnownShipCount: 0,
        lastKnownOpened: true,
        nextForceMultiplier: 1,
        lastLossBracket: 'NONE'
      }]
    });

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK)).toBe(false);
  });

  it('uses a cargo-heavy raid composition for an opened neutral farm', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    makeBotFarmReady(bot, homePlanet);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 220);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 3);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(360, 180, 60);
    galaxy.currentTurn = 18;
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 8
      })
    );

    runBotTurnPhase(galaxy);

    const attackFleet = galaxy.activeFleets.find((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK
    ) ?? null;
    expect(attackFleet).not.toBeNull();
    const counts = attackFleet?.ships.countByType() ?? new Map();
    expect(counts.get(ShipType.TRANSPORTER) ?? 0).toBeGreaterThan(0);
    expect(counts.get(ShipType.CRUISER) ?? 0).toBeLessThanOrEqual(1);
  });

  it('updates farm retry memory from battle fleet reports', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    makeBotFarmReady(bot, homePlanet);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
    galaxy.currentTurn = 14;
    bot.botMemory = Player.normalizeBotMemory({
      currentGoal: null,
      goalTarget: null,
      goalExpiresTurn: null,
      reservedResources: { metal: 0, crystal: 0, deuterium: 0 },
      lastSpyTargets: [],
      lastAttackTargets: [],
      recentDiplomacyTargets: [],
      farmTargets: [{
        targetCoordinates: { x: 0, y: 0, z: 1 },
        lastAttackTurn: 12,
        nextAllowedAttackTurn: 22,
        lastSentCombatStrength: 30,
        lastKnownDefenceCount: 2,
        lastKnownShipCount: 1,
        lastKnownOpened: false,
        nextForceMultiplier: 1.2,
        lastLossBracket: 'NONE'
      }]
    });
    bot.addReport(new FleetReport(
      {
        reportId: 1,
        createdTurn: 13,
        title: 'Battle Report: BotSys II',
        sourceCoordinates: { x: 0, y: 0, z: 1 },
        sourcePlanetName: targetPlanet.basicInfo.name,
        sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
        senderPlayerName: targetOwner.playerName
      },
      [
        'Battle result: defender',
        'Own ships (attacker): 0/4 survived, 4 lost.',
        'Own defenses (attacker): 0/0 survived, 0 lost.',
        'Enemy ships (defender): 1/1 survived, 0 lost.',
        'Enemy defenses (defender): 2/2 survived, 0 lost.'
      ].join('\n')
    ));

    runBotTurnPhase(galaxy);

    expect(bot.botMemory?.farmTargets?.[0]).toMatchObject({
      lastKnownDefenceCount: 2,
      lastKnownShipCount: 1,
      lastKnownOpened: false,
      nextForceMultiplier: 4,
      lastLossBracket: 'DEFEAT'
    });
    expect(bot.botMemory?.lastProcessedFleetReportId).toBe(1);
  });

  it('requires a bombardment-weapon ship before attacking a defended farm target', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    makeBotFarmReady(bot, homePlanet);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 220);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(360, 180, 60);
    targetPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 1);
    galaxy.currentTurn = 8;
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 6
      })
    );

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK)).toBe(false);
  });

  it('launches a transport mission from a rich world to a poorer owned planet', () => {
    const { galaxy, bot, richPlanet, poorPlanet } = createOwnedTwoPlanetGalaxy();
    richPlanet.rBDSFTQ.resources = new ResourcesPack(1200, 700, 350);
    richPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    poorPlanet.rBDSFTQ.resources = new ResourcesPack(20, 10, 0);
    galaxy.currentTurn = 5;

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.TRANSPORT)).toBe(true);
  });

  it('launches a guard mission when a weak own planet is exposed to a nearby known threat', () => {
    const { galaxy, bot, reservePlanet, frontierPlanet, threatPlanet, threatOwner } = createGuardScenarioGalaxy();
    reservePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 160);
    reservePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 6);
    frontierPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
    threatPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, threatOwner, threatPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 5
      })
    );
    galaxy.currentTurn = 5;
    galaxy.diplomaticRelations = [
      { playerAId: bot.playerId, playerBId: threatOwner.playerId, status: DiplomaticStatus.PASSIVE }
    ];

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.DEFEND)).toBe(true);
  });

  it('launches a move mission to reinforce an under-defended strategic own planet', () => {
    const { galaxy, bot, reservePlanet, frontierPlanet } = createMoveScenarioGalaxy();
    reservePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 140);
    reservePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    frontierPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
    frontierPlanet.setBuildingLevel(BuildingType.METAL_MINE, 6);
    frontierPlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    frontierPlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    frontierPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    frontierPlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 2);
    frontierPlanet.setBuildingLevel(BuildingType.SHIPYARD, 1);

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) => fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.MOVE)).toBe(true);
  });

  it('requests auto-approved maintenance for an orbiting own fleet at a working Alliance Depot', () => {
    const { galaxy, bot, homePlanet, orbitingFleet } = createMaintenanceScenarioGalaxy();
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 180);
    homePlanet.setBuildingLevel(BuildingType.ALLIANCE_DEPOT, 3);

    runBotTurnPhase(galaxy);

    expect(orbitingFleet.cargo.deuterium).toBeGreaterThan(0);
    const traces = getBotDecisionTraces(bot.playerId);
    expect(traces[0]?.chosenActions.some((entry) => entry.kind === 'maintenance')).toBe(true);
  });

  it('approves an incoming allied Jump Gate request when the target world is safe', () => {
    const { galaxy, request, fleet } = createIncomingJumpGateRequestGalaxy();

    runBotTurnPhase(galaxy);

    expect(request.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(fleet.state).toBe(FleetState.MOVING_TO_TARGET);
    expect(fleet.pendingJumpGateRequestId).toBeNull();
  });

  it('approves an incoming allied maintenance request for a safe depot planet', () => {
    const { galaxy, request, fleet } = createIncomingMaintenanceRequestGalaxy();

    runBotTurnPhase(galaxy);

    expect(request.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(request.approved?.fuel ?? 0).toBeGreaterThan(0);
    expect(fleet.cargo.deuterium).toBeGreaterThan(0);
    expect(fleet.pendingMaintenanceRequestId).toBeNull();
  });

  it('approves an incoming allied repair support request when it can launch a real repair fleet', () => {
    const { galaxy, request } = createIncomingRepairSupportRequestGalaxy();

    runBotTurnPhase(galaxy);

    expect(request.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(request.executionExpiresOnTurn).toBe(10);
    expect(getBotDecisionTraces(2)[0]?.chosenActions.some((entry) => entry.kind === 'approve-support')).toBe(true);
  });

  it('approves an incoming allied defense support request when it can launch a real guard fleet', () => {
    const { galaxy, request } = createIncomingDefenseSupportRequestGalaxy();

    runBotTurnPhase(galaxy);

    expect(request.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(request.executionExpiresOnTurn).toBe(10);
    expect(getBotDecisionTraces(2)[0]?.chosenActions.some((entry) => entry.kind === 'approve-support')).toBe(true);
  });

  it('approves an incoming peace proposal when the bot is pressured on the border', () => {
    const { galaxy, bot, targetPlanet, targetOwner, proposal } = createIncomingPeaceProposalGalaxy();

    runBotTurnPhase(galaxy);

    expect(proposal.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(new DiplomacyResolver(galaxy.diplomaticRelations).getStatus(bot.playerId, targetOwner.playerId)).toBe(DiplomaticStatus.PEACE);
    expect(getBotDecisionTraces(bot.playerId)[0]?.chosenActions.some((entry) => entry.kind === 'approve-peace')).toBe(true);
    expect(targetPlanet.lastReportData.has(bot.playerId)).toBe(true);
  });

  it('rejects an incoming peace proposal when an aggressor bot is clearly winning', () => {
    const { galaxy, bot, targetOwner, proposal } = createAggressorPeaceRejectionGalaxy();

    runBotTurnPhase(galaxy);

    expect(proposal.state).toBe(DiplomaticProposalState.REJECTED);
    expect(new DiplomacyResolver(galaxy.diplomaticRelations).getStatus(bot.playerId, targetOwner.playerId)).toBe(DiplomaticStatus.WAR);
    expect(getBotDecisionTraces(bot.playerId)[0]?.chosenActions.some((entry) => entry.kind === 'reject-peace')).toBe(true);
  });

  it('approves an incoming alliance proposal only from an existing peace relation', () => {
    const { galaxy, bot, targetOwner, proposal } = createIncomingAllianceProposalGalaxy();

    runBotTurnPhase(galaxy);

    expect(proposal.state).toBe(DiplomaticProposalState.ACCEPTED);
    expect(new DiplomacyResolver(galaxy.diplomaticRelations).getStatus(bot.playerId, targetOwner.playerId)).toBe(DiplomaticStatus.ALLIED);
    expect(getBotDecisionTraces(bot.playerId)[0]?.chosenActions.some((entry) => entry.kind === 'approve-alliance')).toBe(true);
  });

  it('proposes peace when an avoider bot is pressured by a stronger war neighbor', () => {
    const { galaxy, bot, targetOwner } = createOutgoingPeaceProposalGalaxy();

    runBotTurnPhase(galaxy);

    const proposal = galaxy.diplomaticProposals.find((entry) =>
      entry.fromPlayerId === bot.playerId
      && entry.toPlayerId === targetOwner.playerId
      && entry.requestedStatus === DiplomaticStatus.PEACE
    );

    expect(proposal).toBeTruthy();
    expect(proposal?.createdTurn).toBe(galaxy.currentTurn);
    expect(proposal?.expiresOnTurn).toBe(galaxy.currentTurn + 2);
    expect(galaxy.diplomaticProposals.some((entry) =>
      entry.fromPlayerId === bot.playerId
      && entry.toPlayerId === targetOwner.playerId
      && entry.requestedStatus === DiplomaticStatus.PEACE
    )).toBe(true);
    expect(getBotDecisionTraces(bot.playerId)[0]?.chosenActions.some((entry) => entry.kind === 'propose-peace')).toBe(true);
  });

  it('proposes alliance from an existing peace relation when the strategic value is high', () => {
    const { galaxy, bot, targetOwner } = createOutgoingAllianceProposalGalaxy();

    runBotTurnPhase(galaxy);

    expect(galaxy.diplomaticProposals.some((proposal) =>
      proposal.fromPlayerId === bot.playerId
      && proposal.toPlayerId === targetOwner.playerId
      && proposal.requestedStatus === DiplomaticStatus.ALLIED
    )).toBe(true);
    expect(getBotDecisionTraces(bot.playerId)[0]?.chosenActions.some((entry) => entry.kind === 'propose-alliance')).toBe(true);
  });

  it('launches a recycle mission when own debris is valuable and a recycler is available', () => {
    const { galaxy, bot } = createRecycleScenarioGalaxy();

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.RECYCLE
    )).toBe(true);
  });

  it('launches a repair mission when another owned world has meaningful ship damage', () => {
    const { galaxy, bot } = createRepairScenarioGalaxy();

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.REPAIR
    )).toBe(true);
  });

  it('launches a bombard mission against a valuable hostile infrastructure target', () => {
    const { galaxy, bot } = createBombardScenarioGalaxy();

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.BOMBARD
    )).toBe(true);
  });

  it('launches a siege mission only for a very favorable hostile target', () => {
    const { galaxy, bot } = createSiegeScenarioGalaxy();

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.SIEGE
    )).toBe(true);
  });

  it('uses a Jump Gate for a long-distance owned transport route when both planets have gates', () => {
    const { galaxy, bot, richPlanet, poorPlanet } = createJumpGateTransportGalaxy();
    richPlanet.rBDSFTQ.resources = new ResourcesPack(900, 500, 260);
    richPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    poorPlanet.rBDSFTQ.resources = new ResourcesPack(100, 100, 50);

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets.some((fleet) =>
      fleet.ownerId === bot.playerId
      && fleet.missionType === FleetMissionType.TRANSPORT
      && fleet.usesJumpGate
      && fleet.travelTurns === 1
    )).toBe(true);
  });

  it('records a decision trace with chosen actions and stop reason', () => {
    const { galaxy, bot, richPlanet, poorPlanet } = createOwnedTwoPlanetGalaxy();
    richPlanet.rBDSFTQ.resources = new ResourcesPack(1200, 700, 350);
    richPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    poorPlanet.rBDSFTQ.resources = new ResourcesPack(20, 10, 0);

    runBotTurnPhase(galaxy);

    const traces = getBotDecisionTraces(bot.playerId);
    expect(traces).toHaveLength(1);
    expect(traces[0]?.playerId).toBe(bot.playerId);
    expect(traces[0]?.chosenActions.length).toBeGreaterThan(0);
    expect(traces[0]?.actionBudget.used).toBeGreaterThan(0);
    expect(traces[0]?.actionBudget.stopReason).not.toBeNull();
  });

  it('skips paused bots during the bot turn phase', () => {
    const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.NEUTRAL);
    homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 20);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    targetPlanet.lastReportData.set(
      bot.playerId,
      new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
        forcedReportLevel: 12,
        createdTurn: 1
      })
    );
    galaxy.currentTurn = 6;
    pauseBot(bot.playerId);

    runBotTurnPhase(galaxy);

    expect(galaxy.activeFleets).toHaveLength(0);
    expect(getBotDecisionTraces(bot.playerId)).toHaveLength(0);
  });

  it('prefers attacking a war target over an equally weak neutral target', () => {
    const { galaxy, bot, warPlanet } = createWarAndNeutralTargetGalaxy();

    runBotTurnPhase(galaxy);

    const attackFleet = galaxy.activeFleets.find((fleet) =>
      fleet.ownerId === bot.playerId && fleet.missionType === FleetMissionType.ATTACK
    ) ?? null;
    expect(attackFleet).not.toBeNull();
    expect(attackFleet?.target.x).toBe(warPlanet.basicInfo.solarSystem.coordinates.x);
    expect(attackFleet?.target.y).toBe(warPlanet.basicInfo.solarSystem.coordinates.y);
    expect(attackFleet?.target.z).toBe(warPlanet.basicInfo.order - 1);
  });
});

function createTwoPlanetGalaxy(targetOwnerType: PlayerType | null): {
  galaxy: Galaxy;
  bot: Player;
  homePlanet: Planet;
  targetPlanet: Planet;
  targetOwner: Player;
} {
  const system = new SolarSystem('BotSys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  const targetPlanet = Planet.createStartingPlanet('BotSys II', 2, system, 2);
  system.planets[0] = homePlanet;
  system.planets[1] = targetPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [homePlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const targetOwner = new Player(
    2,
    'Target',
    [targetPlanet],
    new Map(),
    [],
    targetOwnerType ?? PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );

  initializePlanet(homePlanet, bot.playerId);
  initializePlanet(targetPlanet, targetOwner.playerId);
  targetPlanet.rBDSFTQ.resources = new ResourcesPack(100, 60, 30);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, targetOwner],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map([[targetOwner.playerId, targetOwner]]),
    new Map([[bot.playerName, bot.playerId], [targetOwner.playerName, targetOwner.playerId]])
  );

  return { galaxy, bot, homePlanet, targetPlanet, targetOwner };
}

function createOwnedTwoPlanetGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  richPlanet: Planet;
  poorPlanet: Planet;
} {
  const system = new SolarSystem('OwnedSys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const richPlanet = Planet.createStartingPlanet('OwnedSys I', 1, system, 1);
  const poorPlanet = Planet.createStartingPlanet('OwnedSys II', 2, system, 2);
  system.planets[0] = richPlanet;
  system.planets[1] = poorPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [richPlanet, poorPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );

  initializePlanet(richPlanet, bot.playerId);
  initializePlanet(poorPlanet, bot.playerId);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, richPlanet, poorPlanet };
}

function createGuardScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  reservePlanet: Planet;
  frontierPlanet: Planet;
  threatPlanet: Planet;
  threatOwner: Player;
} {
  const system = new SolarSystem('GuardSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const reservePlanet = Planet.createStartingPlanet('GuardSys I', 1, system, 1);
  const frontierPlanet = Planet.createStartingPlanet('GuardSys II', 2, system, 2);
  const threatPlanet = Planet.createStartingPlanet('GuardSys III', 3, system, 3);
  system.planets[0] = reservePlanet;
  system.planets[1] = frontierPlanet;
  system.planets[2] = threatPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [reservePlanet, frontierPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const threatOwner = new Player(
    2,
    'Threat',
    [threatPlanet],
    new Map(),
    [],
    PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );

  initializePlanet(reservePlanet, bot.playerId);
  initializePlanet(frontierPlanet, bot.playerId);
  initializePlanet(threatPlanet, threatOwner.playerId);
  threatPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 3);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, threatOwner],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map([[threatOwner.playerId, threatOwner]]),
    new Map([[bot.playerName, bot.playerId], [threatOwner.playerName, threatOwner.playerId]])
  );

  return { galaxy, bot, reservePlanet, frontierPlanet, threatPlanet, threatOwner };
}

function createMoveScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  reservePlanet: Planet;
  frontierPlanet: Planet;
} {
  const system = new SolarSystem('MoveSys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const reservePlanet = Planet.createStartingPlanet('MoveSys I', 1, system, 1);
  const frontierPlanet = Planet.createStartingPlanet('MoveSys II', 2, system, 2);
  system.planets[0] = reservePlanet;
  system.planets[1] = frontierPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [reservePlanet, frontierPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );

  initializePlanet(reservePlanet, bot.playerId);
  initializePlanet(frontierPlanet, bot.playerId);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, reservePlanet, frontierPlanet };
}

function createJumpGateTransportGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  richPlanet: Planet;
  poorPlanet: Planet;
} {
  const richSystem = new SolarSystem('GateAlpha', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const fillerSystemOne = new SolarSystem('Void-1', 0, false, false, { x: 1, y: 0 }, new Set(), new Map());
  const fillerSystemTwo = new SolarSystem('Void-2', 0, false, false, { x: 2, y: 0 }, new Set(), new Map());
  const poorSystem = new SolarSystem('GateBeta', 1, false, false, { x: 3, y: 0 }, new Set(), new Map());
  const richPlanet = Planet.createStartingPlanet('GateAlpha I', 1, richSystem, 1);
  const poorPlanet = Planet.createStartingPlanet('GateBeta I', 1, poorSystem, 1);
  richSystem.planets[0] = richPlanet;
  poorSystem.planets[0] = poorPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [richPlanet, poorPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );

  initializePlanet(richPlanet, bot.playerId);
  initializePlanet(poorPlanet, bot.playerId);
  richPlanet.setBuildingLevel(BuildingType.JUMP_GATE, 5);
  poorPlanet.setBuildingLevel(BuildingType.JUMP_GATE, 5);
  richPlanet.info.planetaryParameters.hyperspaceParameters = 2;
  poorPlanet.info.planetaryParameters.hyperspaceParameters = 2;
  bot.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 5);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[richSystem, fillerSystemOne, fillerSystemTwo, poorSystem]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, richPlanet, poorPlanet };
}

function createMaintenanceScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  homePlanet: Planet;
  orbitingFleet: Fleet;
} {
  const system = new SolarSystem('DepotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('DepotSys I', 1, system, 1);
  system.planets[0] = homePlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [homePlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );

  initializePlanet(homePlanet, bot.playerId);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);

  const orbitingFleetShips = ManyShips.empty();
  orbitingFleetShips.addUndamaged(ShipType.TRANSPORTER, 1);
  const orbitingFleet = new Fleet(
    1,
    bot.playerId,
    FleetMissionType.TRANSPORT,
    new Destination(0, 0, 0),
    new Destination(0, 0, 0),
    homePlanet.basicInfo.name,
    homePlanet.basicInfo.name,
    orbitingFleetShips,
    new ResourcesPack(0, 0, 0),
    40,
    orbitingFleetShips.totalCargoCapacity(),
    0,
    1,
    1,
    FleetState.ORBITING,
    1,
    undefined,
    FleetOrbitActivity.IDLE
  );
  bot.fleets.push(orbitingFleet);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    5,
    [orbitingFleet],
    2,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, homePlanet, orbitingFleet };
}

function createIncomingJumpGateRequestGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  request: ReturnType<typeof createJumpGateRequest>;
  fleet: Fleet;
} {
  const allyOriginSystem = new SolarSystem('AllyGate', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const fillerSystemOne = new SolarSystem('Void-1', 0, false, false, { x: 1, y: 0 }, new Set(), new Map());
  const fillerSystemTwo = new SolarSystem('Void-2', 0, false, false, { x: 2, y: 0 }, new Set(), new Map());
  const botTargetSystem = new SolarSystem('BotGate', 1, false, false, { x: 3, y: 0 }, new Set(), new Map());
  const allyPlanet = Planet.createStartingPlanet('AllyGate I', 1, allyOriginSystem, 1);
  const botPlanet = Planet.createStartingPlanet('BotGate I', 1, botTargetSystem, 1);
  allyOriginSystem.planets[0] = allyPlanet;
  botTargetSystem.planets[0] = botPlanet;

  const ally = new Player(1, 'Ally', [allyPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const bot = new Player(2, 'Bot-1', [botPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  initializePlanet(allyPlanet, ally.playerId);
  initializePlanet(botPlanet, bot.playerId);
  allyPlanet.setBuildingLevel(BuildingType.JUMP_GATE, 5);
  botPlanet.setBuildingLevel(BuildingType.JUMP_GATE, 5);
  allyPlanet.info.planetaryParameters.hyperspaceParameters = 2;
  botPlanet.info.planetaryParameters.hyperspaceParameters = 2;
  ally.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 5);
  bot.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 5);
  botPlanet.lastReportData.set(
    ally.playerId,
    new EspionageReportGenerator().createEspionageReport(ally, bot, botPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 5
    })
  );

  const fleetShips = ManyShips.empty();
  fleetShips.addUndamaged(ShipType.CRUISER, 2);
  const fleet = new Fleet(
    1,
    ally.playerId,
    FleetMissionType.MOVE,
    new Destination(0, 0, 0),
    new Destination(3, 0, 0),
    allyPlanet.basicInfo.name,
    botPlanet.basicInfo.name,
    fleetShips,
    new ResourcesPack(0, 0, 0),
    20,
    fleetShips.totalCargoCapacity(),
    0,
    1,
    1,
    FleetState.PENDING_JUMP_GATE,
    5,
    undefined,
    FleetOrbitActivity.IDLE,
    null,
    undefined,
    false,
    null,
    true,
    1
  );
  ally.fleets.push(fleet);

  const request = createJumpGateRequest(
    1,
    fleet.fleetId,
    ally.playerId,
    bot.playerId,
    allyPlanet.basicInfo.name,
    { x: 0, y: 0, z: 0 },
    botPlanet.basicInfo.name,
    { x: 3, y: 0, z: 0 },
    FleetMissionType.MOVE,
    2,
    5,
    5
  );
  fleet.pendingJumpGateRequestId = request.requestId;

  const galaxy = new Galaxy(
    'Bot Test',
    [ally, bot],
    [[allyOriginSystem, fillerSystemOne, fillerSystemTwo, botTargetSystem]],
    5,
    [fleet],
    2,
    new Map([[ally.playerId, ally]]),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[ally.playerName, ally.playerId], [bot.playerName, bot.playerId]]),
    [{ playerAId: ally.playerId, playerBId: bot.playerId, status: DiplomaticStatus.ALLIED }],
    [],
    1,
    [request],
    2
  );

  return { galaxy, bot, request, fleet };
}

function createIncomingMaintenanceRequestGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  request: ReturnType<typeof createMaintenanceRequest>;
  fleet: Fleet;
} {
  const system = new SolarSystem('SupportSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const botPlanet = Planet.createStartingPlanet('SupportSys I', 1, system, 1);
  system.planets[0] = botPlanet;

  const ally = new Player(1, 'Ally', [], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const bot = new Player(2, 'Bot-1', [botPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  initializePlanet(botPlanet, bot.playerId);
  botPlanet.setBuildingLevel(BuildingType.ALLIANCE_DEPOT, 4);
  botPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 260);

  const fleetShips = ManyShips.empty();
  fleetShips.addUndamaged(ShipType.TRANSPORTER, 1);
  const fleet = new Fleet(
    1,
    ally.playerId,
    FleetMissionType.TRANSPORT,
    new Destination(0, 0, 0),
    new Destination(0, 0, 0),
    botPlanet.basicInfo.name,
    botPlanet.basicInfo.name,
    fleetShips,
    new ResourcesPack(0, 0, 0),
    40,
    fleetShips.totalCargoCapacity(),
    0,
    1,
    1,
    FleetState.ORBITING,
    5,
    undefined,
    FleetOrbitActivity.IDLE
  );
  ally.fleets.push(fleet);

  const request = createMaintenanceRequest(
    1,
    fleet.fleetId,
    ally.playerId,
    bot.playerId,
    botPlanet.basicInfo.name,
    { x: 0, y: 0, z: 0 },
    5,
    6,
    { fuel: 50, ships: [], bombs: [] }
  );
  fleet.pendingMaintenanceRequestId = request.requestId;

  const galaxy = new Galaxy(
    'Bot Test',
    [ally, bot],
    [[system]],
    5,
    [fleet],
    2,
    new Map([[ally.playerId, ally]]),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[ally.playerName, ally.playerId], [bot.playerName, bot.playerId]]),
    [{ playerAId: ally.playerId, playerBId: bot.playerId, status: DiplomaticStatus.ALLIED }],
    [],
    1,
    [],
    1,
    [request],
    2
  );

  return { galaxy, bot, request, fleet };
}

function createIncomingRepairSupportRequestGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  request: ReturnType<typeof createSupportRequest>;
} {
  const allySystem = new SolarSystem('RepairAlly', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const botSystem = new SolarSystem('RepairBot', 1, false, false, { x: 1, y: 0 }, new Set(), new Map());
  const allyPlanet = Planet.createStartingPlanet('RepairAlly I', 1, allySystem, 1);
  const botPlanet = Planet.createStartingPlanet('RepairBot I', 1, botSystem, 1);
  allySystem.planets[0] = allyPlanet;
  botSystem.planets[0] = botPlanet;

  const ally = new Player(1, 'Ally', [allyPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const bot = new Player(2, 'Bot-1', [botPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  initializePlanet(allyPlanet, ally.playerId);
  initializePlanet(botPlanet, bot.playerId);
  allyPlanet.rBDSFTQ.ships.addDamaged(ShipType.CORVETTE, 4);
  botPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 140);
  botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CARRIER, 1);
  botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 1);

  const request = createSupportRequest(
    1,
    ally.playerId,
    bot.playerId,
    'PLANET_REPAIR',
    allyPlanet.basicInfo.name,
    { x: 0, y: 0, z: 0 },
    5,
    7
  );

  const galaxy = new Galaxy(
    'Bot Test',
    [ally, bot],
    [[allySystem, botSystem]],
    5,
    [],
    1,
    new Map([[ally.playerId, ally]]),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[ally.playerName, ally.playerId], [bot.playerName, bot.playerId]]),
    [{ playerAId: ally.playerId, playerBId: bot.playerId, status: DiplomaticStatus.ALLIED }],
    [],
    1,
    [],
    1,
    [],
    1,
    [request],
    2
  );

  return { galaxy, bot, request };
}

function createIncomingDefenseSupportRequestGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  request: ReturnType<typeof createSupportRequest>;
} {
  const allySystem = new SolarSystem('DefenseAlly', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const botSystem = new SolarSystem('DefenseBot', 1, false, false, { x: 1, y: 0 }, new Set(), new Map());
  const allyPlanet = Planet.createStartingPlanet('DefenseAlly I', 1, allySystem, 1);
  const botPlanet = Planet.createStartingPlanet('DefenseBot I', 1, botSystem, 1);
  allySystem.planets[0] = allyPlanet;
  botSystem.planets[0] = botPlanet;

  const ally = new Player(1, 'Ally', [allyPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const bot = new Player(2, 'Bot-1', [botPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  initializePlanet(allyPlanet, ally.playerId);
  initializePlanet(botPlanet, bot.playerId);
  botPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 180);
  botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
  botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 2);

  const request = createSupportRequest(
    1,
    ally.playerId,
    bot.playerId,
    'PLANET_DEFENSE',
    allyPlanet.basicInfo.name,
    { x: 0, y: 0, z: 0 },
    5,
    7
  );

  const galaxy = new Galaxy(
    'Bot Test',
    [ally, bot],
    [[allySystem, botSystem]],
    5,
    [],
    1,
    new Map([[ally.playerId, ally]]),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[ally.playerName, ally.playerId], [bot.playerName, bot.playerId]]),
    [{ playerAId: ally.playerId, playerBId: bot.playerId, status: DiplomaticStatus.ALLIED }],
    [],
    1,
    [],
    1,
    [],
    1,
    [request],
    2
  );

  return { galaxy, bot, request };
}

function createIncomingPeaceProposalGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  targetPlanet: Planet;
  targetOwner: Player;
  proposal: ReturnType<typeof createDiplomaticProposal>;
} {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 1);
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 7);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const proposal = createDiplomaticProposal(
    1,
    targetOwner.playerId,
    bot.playerId,
    DiplomaticStatus.PEACE,
    galaxy.currentTurn,
    galaxy.currentTurn + 1
  );
  galaxy.diplomaticProposals = [proposal];
  galaxy.nextDiplomaticProposalId = 2;

  return { galaxy, bot, targetPlanet, targetOwner, proposal };
}

function createAggressorPeaceRejectionGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  targetOwner: Player;
  proposal: ReturnType<typeof createDiplomaticProposal>;
} {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  bot.botProfileId = 'AGGRESSOR';
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 1);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const proposal = createDiplomaticProposal(
    1,
    targetOwner.playerId,
    bot.playerId,
    DiplomaticStatus.PEACE,
    galaxy.currentTurn,
    galaxy.currentTurn + 1
  );
  galaxy.diplomaticProposals = [proposal];
  galaxy.nextDiplomaticProposalId = 2;

  return { galaxy, bot, targetOwner, proposal };
}

function createIncomingAllianceProposalGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  targetOwner: Player;
  proposal: ReturnType<typeof createDiplomaticProposal>;
} {
  const { galaxy, bot, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.PEACE }
  ];
  bot.botProfileId = 'TURTLE';
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const proposal = createDiplomaticProposal(
    1,
    targetOwner.playerId,
    bot.playerId,
    DiplomaticStatus.ALLIED,
    galaxy.currentTurn,
    galaxy.currentTurn + 1
  );
  galaxy.diplomaticProposals = [proposal];
  galaxy.nextDiplomaticProposalId = 2;

  return { galaxy, bot, targetOwner, proposal };
}

function createWarAndNeutralTargetGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  warPlanet: Planet;
} {
  const system = new SolarSystem('WarNeutralSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('WarNeutralSys I', 1, system, 1);
  const warPlanet = Planet.createStartingPlanet('WarNeutralSys II', 2, system, 2);
  const neutralPlanet = Planet.createStartingPlanet('WarNeutralSys III', 3, system, 3);
  system.planets[0] = homePlanet;
  system.planets[1] = warPlanet;
  system.planets[2] = neutralPlanet;

  const bot = new Player(1, 'Bot-1', [homePlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const warOwner = new Player(2, 'WarTarget', [warPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const neutralOwner = new Player(3, 'NeutralTarget', [neutralPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));

  initializePlanet(homePlanet, bot.playerId);
  initializePlanet(warPlanet, warOwner.playerId);
  initializePlanet(neutralPlanet, neutralOwner.playerId);
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 180);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 6);
  warPlanet.rBDSFTQ.resources = new ResourcesPack(240, 100, 50);
  neutralPlanet.rBDSFTQ.resources = new ResourcesPack(240, 100, 50);
  warPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, warOwner, warPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );
  neutralPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, neutralOwner, neutralPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, warOwner, neutralOwner],
    [[system]],
    6,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map([[warOwner.playerId, warOwner], [neutralOwner.playerId, neutralOwner]]),
    new Map([[bot.playerName, bot.playerId], [warOwner.playerName, warOwner.playerId], [neutralOwner.playerName, neutralOwner.playerId]]),
    [{ playerAId: bot.playerId, playerBId: warOwner.playerId, status: DiplomaticStatus.WAR }]
  );

  return { galaxy, bot, warPlanet };
}

function createPassiveAndNeutralFarmGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  passivePlanet: Planet;
} {
  const system = new SolarSystem('FarmSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('FarmSys I', 1, system, 1);
  const passivePlanet = Planet.createStartingPlanet('FarmSys II', 2, system, 2);
  const neutralPlanet = Planet.createStartingPlanet('FarmSys III', 3, system, 3);
  system.planets[0] = homePlanet;
  system.planets[1] = passivePlanet;
  system.planets[2] = neutralPlanet;

  const bot = new Player(1, 'Bot-1', [homePlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const passiveOwner = new Player(2, 'PassiveTarget', [passivePlanet], new Map(), [], PlayerType.NEUTRAL, createTutorialReadState(true));
  const neutralOwner = new Player(3, 'NeutralTarget', [neutralPlanet], new Map(), [], PlayerType.NEUTRAL, createTutorialReadState(true));

  initializePlanet(homePlanet, bot.playerId);
  initializePlanet(passivePlanet, passiveOwner.playerId);
  initializePlanet(neutralPlanet, neutralOwner.playerId);
  makeBotFarmReady(bot, homePlanet);
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 220);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
  passivePlanet.rBDSFTQ.resources = new ResourcesPack(240, 100, 50);
  neutralPlanet.rBDSFTQ.resources = new ResourcesPack(240, 100, 50);
  passivePlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, passiveOwner, passivePlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );
  neutralPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, neutralOwner, neutralPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, passiveOwner, neutralOwner],
    [[system]],
    6,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map([[neutralOwner.playerId, neutralOwner]]),
    new Map([
      [bot.playerName, bot.playerId],
      [passiveOwner.playerName, passiveOwner.playerId],
      [neutralOwner.playerName, neutralOwner.playerId]
    ]),
    [{ playerAId: bot.playerId, playerBId: passiveOwner.playerId, status: DiplomaticStatus.PASSIVE }]
  );

  return { galaxy, bot, passivePlanet };
}

function createStarSystemSpyBotGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  enemyPlanet: Planet;
  enemyOwner: Player;
} {
  const system = new SolarSystem('SpySweep', 4, false, false, { x: 2, y: 3 }, new Set(), new Map());
  const [homePlanet, enemyPlanet, asteroidField, neutralPlanet] = system.planets;

  homePlanet.basicInfo.name = 'SpySweep I';
  homePlanet.info.ownerId = 1;
  enemyPlanet.basicInfo.name = 'SpySweep II';
  enemyPlanet.info.ownerId = 2;
  asteroidField.basicInfo.type = PlanetType.ASTEROIDS;
  asteroidField.info.ownerId = null;
  neutralPlanet.basicInfo.name = 'SpySweep IV';
  neutralPlanet.info.ownerId = 3;

  const bot = new Player(1, 'Bot-1', [homePlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const enemyOwner = new Player(2, 'Enemy', [enemyPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const neutralOwner = new Player(3, 'Neutral', [neutralPlanet], new Map(), [], PlayerType.NEUTRAL, createTutorialReadState(true));

  initializePlanet(homePlanet, bot.playerId);
  initializePlanet(enemyPlanet, enemyOwner.playerId);
  initializePlanet(neutralPlanet, neutralOwner.playerId);
  bot.botProfileId = 'BALANCED';
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 40);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 2);
  const stars = Array.from({ length: 4 }, () => Array.from({ length: 3 }, () => SolarSystem.createVoid({ x: 0, y: 0 })));
  stars[3]![2] = system;

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, enemyOwner, neutralOwner],
    stars,
    6,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map([[neutralOwner.playerId, neutralOwner]]),
    new Map([
      [bot.playerName, bot.playerId],
      [enemyOwner.playerName, enemyOwner.playerId],
      [neutralOwner.playerName, neutralOwner.playerId]
    ])
  );

  return { galaxy, bot, enemyPlanet, enemyOwner };
}

function createOutgoingPeaceProposalGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  targetOwner: Player;
} {
  const { galaxy, bot, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  bot.botProfileId = 'AVOIDER';
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  return { galaxy, bot, targetOwner };
}

function createOutgoingAllianceProposalGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  targetOwner: Player;
} {
  const { galaxy, bot, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.PEACE }
  ];
  bot.botProfileId = 'TURTLE';
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 7);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  return { galaxy, bot, targetOwner };
}

function createRecycleScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
} {
  const system = new SolarSystem('RecycleSys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const sourcePlanet = Planet.createStartingPlanet('RecycleSys I', 1, system, 1);
  const debrisPlanet = Planet.createStartingPlanet('RecycleSys II', 2, system, 2);
  system.planets[0] = sourcePlanet;
  system.planets[1] = debrisPlanet;

  const bot = new Player(1, 'Bot-1', [sourcePlanet, debrisPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  initializePlanet(sourcePlanet, bot.playerId);
  initializePlanet(debrisPlanet, bot.playerId);
  sourcePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 120);
  sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.RECYCLER, 1);
  debrisPlanet.rBDSFTQ.spaceDebris = new ResourcesPack(140, 80, 50);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    5,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot };
}

function createRepairScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
} {
  const system = new SolarSystem('RepairSys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const sourcePlanet = Planet.createStartingPlanet('RepairSys I', 1, system, 1);
  const damagedPlanet = Planet.createStartingPlanet('RepairSys II', 2, system, 2);
  system.planets[0] = sourcePlanet;
  system.planets[1] = damagedPlanet;

  const bot = new Player(1, 'Bot-1', [sourcePlanet, damagedPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  initializePlanet(sourcePlanet, bot.playerId);
  initializePlanet(damagedPlanet, bot.playerId);
  sourcePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 120);
  sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CARRIER, 1);
  sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 1);
  damagedPlanet.rBDSFTQ.ships.addDamaged(ShipType.CORVETTE, 10);

  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    5,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot };
}

function createBombardScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
} {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 220);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.ORBITAL_BOMBER, 2);
  targetPlanet.rBDSFTQ.resources = new ResourcesPack(20, 10, 0);
  targetPlanet.setBuildingLevel(BuildingType.METAL_MINE, 9);
  targetPlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 8);
  targetPlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 7);
  targetPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 5);
  targetPlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 5);
  targetPlanet.setBuildingLevel(BuildingType.SHIPYARD, 4);
  targetPlanet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 3);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 5
    })
  );
  galaxy.currentTurn = 5;

  return { galaxy, bot };
}

function createSiegeScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
} {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 320);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.ARMAGEDDON_BOMBER, 2);
  targetPlanet.rBDSFTQ.resources = new ResourcesPack(10, 10, 0);
  targetPlanet.setBuildingLevel(BuildingType.METAL_MINE, 10);
  targetPlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 10);
  targetPlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 9);
  targetPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 6);
  targetPlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 6);
  targetPlanet.setBuildingLevel(BuildingType.SHIPYARD, 6);
  targetPlanet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 4);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 5
    })
  );
  galaxy.currentTurn = 5;

  return { galaxy, bot };
}

function initializePlanet(planet: Planet, ownerId: number): void {
  planet.info.ownerId = ownerId;
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
  planet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
  planet.rBDSFTQ.ships = ManyShips.empty();
  planet.lastReportData.clear();
}

function makeBotFarmReady(bot: Player, planet: Planet): void {
  bot.botProfileId = 'BALANCED';
  bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 5);
  bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 3);
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, 3);
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 2);
  bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);

  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
  planet.setBuildingLevel(BuildingType.METAL_MINE, 6);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 6);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 6);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 12);
  planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 4);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 4);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 2);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
}
