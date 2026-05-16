import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { DiplomaticProposalState } from '../../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { createDiplomaticRelation } from '../../../../src/app/models/diplomacy/diplomatic-relation.js';
import { createDiplomaticProposal } from '../../../../src/app/models/diplomacy/diplomatic-proposal.js';
import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import { Fleet, FleetState } from '../../../../src/app/models/fleets/fleet.js';
import { Destination } from '../../../../src/app/models/fleets/destination.js';
import { ManyShips } from '../../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../src/app/models/player.js';
import { EspionageReportGenerator } from '../../../../src/app/generators/espionage-report-generator.js';
import { createSupportRequest } from '../../../../src/app/models/requests/support-request.js';
import { ResourcesPack } from '../../../../src/app/models/resources-pack.js';
import { createTutorialReadState } from '../../../../src/app/tutorial/tutorial-types.js';
import type { BotProposal } from '../bot-v2-types.ts';
import { LiveQueueBotExecutor } from './bot-executor.js';

describe('bot executor', () => {
  it('splits fleet cargo spending from fuel spending', () => {
    const { galaxy, origin } = createFleetGalaxy();
    const executor = new LiveQueueBotExecutor(galaxy, 1);

    const [outcome] = executor.executeAcceptedTasks([createMoveProposal()]);

    expect(outcome).toMatchObject({
      proposalId: 'fleet',
      executed: true,
      success: true,
      spent: { metal: 0, crystal: 0, deuterium: 0 },
      fleetSlotsUsed: 1,
      missionType: FleetMissionType.MOVE,
      originCoordinates: { x: 0, y: 0, z: 1 },
      targetCoordinates: { x: 0, y: 0, z: 2 }
    });
    expect(outcome?.fleetId).toBe(1);
    expect(outcome?.fuelSpent).toBeGreaterThan(0);
    expect(origin.rBDSFTQ.ships.undamagedCountByType().get(ShipType.TRANSPORTER) ?? 0).toBe(0);
  });

  it('executes accepted support request rejection decisions', () => {
    const { galaxy } = createFleetGalaxy();
    const requesterPlanet = galaxy.players[1]?.planets[0]!;
    galaxy.supportRequests.push(createSupportRequest(
      1,
      2,
      1,
      'PLANET_DEFENSE',
      requesterPlanet.basicInfo.name,
      {
        x: requesterPlanet.basicInfo.solarSystem.coordinates.x,
        y: requesterPlanet.basicInfo.solarSystem.coordinates.y,
        z: requesterPlanet.basicInfo.order
      },
      galaxy.currentTurn,
      galaxy.currentTurn + 1
    ));
    const executor = new LiveQueueBotExecutor(galaxy, 1);

    const [outcome] = executor.executeAcceptedTasks([createRequestDecisionProposal()]);

    expect(outcome).toMatchObject({
      proposalId: 'request',
      executed: true,
      success: true,
      requestType: 'SUPPORT',
      requestId: 1,
      requestDecision: 'REJECT'
    });
    expect(galaxy.supportRequests[0]?.state).toBe(DiplomaticProposalState.REJECTED);
  });

  it('executes accepted outgoing support request creation proposals', () => {
    const { galaxy, origin } = createFleetGalaxy();
    galaxy.diplomaticRelations.push(createDiplomaticRelation(1, 2, DiplomaticStatus.PEACE));
    const executor = new LiveQueueBotExecutor(galaxy, 1);

    const [outcome] = executor.executeAcceptedTasks([createSupportRequestCreationProposal(origin)]);

    expect(outcome).toMatchObject({
      proposalId: 'request-create',
      executed: true,
      success: true,
      requestType: 'SUPPORT',
      requestId: 1,
      supportType: 'PLANET_REPAIR',
      targetPlayerId: 2,
      targetCoordinates: { x: 0, y: 0, z: 1 }
    });
    expect(galaxy.supportRequests).toHaveLength(1);
    expect(galaxy.supportRequests[0]).toMatchObject({
      fromPlayerId: 1,
      toPlayerId: 2,
      supportType: 'PLANET_REPAIR',
      state: DiplomaticProposalState.PENDING
    });
  });

  it('executes accepted diplomacy decisions before recalling invalid offensive fleets', () => {
    const { galaxy, origin, target } = createRecallGalaxy();
    galaxy.diplomaticProposals.push(createDiplomaticProposal(
      1,
      2,
      1,
      DiplomaticStatus.PEACE,
      galaxy.currentTurn,
      galaxy.currentTurn + 1
    ));
    galaxy.activeFleets.push(createAttackFleet(origin, target));
    const executor = new LiveQueueBotExecutor(galaxy, 1);

    const outcomes = executor.executeAcceptedTasks([createDiplomacyDecisionProposal()]);

    expect(outcomes[0]).toMatchObject({
      proposalId: 'diplomacy',
      executed: true,
      success: true,
      diplomacyProposalId: 1,
      diplomacyDecision: 'ACCEPT',
      targetPlayerId: 2,
      requestedStatus: DiplomaticStatus.PEACE
    });
    expect(outcomes[1]).toMatchObject({
      lifecycleAction: 'FLEET_RECALL',
      fleetId: 1,
      missionType: FleetMissionType.ATTACK,
      targetPlayerId: 2,
      currentStatus: DiplomaticStatus.PEACE,
      success: true
    });
    expect(galaxy.activeFleets[0]?.state).toBe(FleetState.RETURNING);
  });

  it('recalls outbound spy fleets when target relation is neutral', () => {
    const { galaxy, origin, target } = createRecallGalaxy();
    galaxy.activeFleets.push(createAttackFleet(origin, target, FleetMissionType.SPY));
    const executor = new LiveQueueBotExecutor(galaxy, 1);

    const outcomes = executor.executeAcceptedTasks([]);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({
      lifecycleAction: 'FLEET_RECALL',
      fleetId: 1,
      missionType: FleetMissionType.SPY,
      currentStatus: DiplomaticStatus.NEUTRAL,
      success: true
    });
    expect(galaxy.activeFleets[0]?.state).toBe(FleetState.RETURNING);
  });

  it('preserves proposal-owned Jump Gate intent and creates pending foreign Jump Gate requests', () => {
    const { galaxy, origin, target, bot, ally } = createJumpGateGalaxy();
    const executor = new LiveQueueBotExecutor(galaxy, 1);

    const [outcome] = executor.executeAcceptedTasks([createForeignJumpGateTransportProposal()]);

    expect(outcome).toMatchObject({
      proposalId: 'jump-gate-fleet',
      executed: true,
      success: true,
      missionType: FleetMissionType.TRANSPORT,
      originCoordinates: { x: 0, y: 0, z: 1 },
      targetCoordinates: { x: 0, y: 0, z: 2 }
    });
    expect(origin.rBDSFTQ.ships.undamagedCountByType().get(ShipType.TRANSPORTER) ?? 0).toBe(0);
    expect(target.info.ownerId).toBe(ally.playerId);
    expect(bot.playerId).toBe(1);
    expect(galaxy.activeFleets[0]?.state).toBe(FleetState.PENDING_JUMP_GATE);
    expect(galaxy.activeFleets[0]?.usesJumpGate).toBe(true);
    expect(galaxy.jumpGateRequests).toHaveLength(1);
    expect(galaxy.jumpGateRequests[0]).toMatchObject({
      fromPlayerId: 1,
      toPlayerId: 2,
      missionType: FleetMissionType.TRANSPORT,
      state: DiplomaticProposalState.PENDING
    });
  });
});

function createFleetGalaxy(): { galaxy: Galaxy; origin: Planet } {
  const system = new SolarSystem('BotSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const origin = Planet.createStartingPlanet('Origin', 1, system, 1);
  const target = Planet.createStartingPlanet('Target', 2, system, 1);
  system.planets[1] = origin;
  system.planets[2] = target;
  origin.rBDSFTQ.resources = new ResourcesPack(5000, 5000, 5000);
  origin.rBDSFTQ.ships = new ManyShips({ [ShipType.TRANSPORTER]: 1 }, []);

  const bot = new Player(
    1,
    'Bot-1',
    [origin, target],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const requester = new Player(
    2,
    'Requester-2',
    [target],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );

  const galaxy = new Galaxy(
    'Fleet Test',
    [bot, requester],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[1, bot], [2, requester]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId], [requester.playerName, requester.playerId]])
  );

  return { galaxy, origin };
}

function createJumpGateGalaxy(): { galaxy: Galaxy; origin: Planet; target: Planet; bot: Player; ally: Player } {
  const system = new SolarSystem('GateSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const origin = Planet.createStartingPlanet('Origin', 1, system, 1);
  const target = Planet.createStartingPlanet('AllyTarget', 2, system, 2);
  system.planets[1] = origin;
  system.planets[2] = target;
  origin.rBDSFTQ.resources = new ResourcesPack(5000, 5000, 5000);
  origin.rBDSFTQ.ships = new ManyShips({ [ShipType.TRANSPORTER]: 1 }, []);
  origin.setBuildingLevel(BuildingType.JUMP_GATE, 1);
  target.setBuildingLevel(BuildingType.JUMP_GATE, 1);

  const bot = new Player(
    1,
    'Bot-1',
    [origin],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const ally = new Player(
    2,
    'Ally-2',
    [target],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const report = new EspionageReportGenerator().createEspionageReport(bot, ally, target, 6, {
    createdTurn: 1,
    forcedReportLevel: 12
  });
  target.lastReportData.set(bot.playerId, report);

  const galaxy = new Galaxy(
    'Jump Gate Test',
    [bot, ally],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[1, bot], [2, ally]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId], [ally.playerName, ally.playerId]]),
    [createDiplomaticRelation(bot.playerId, ally.playerId, DiplomaticStatus.ALLIED)]
  );

  return { galaxy, origin, target, bot, ally };
}

function createRecallGalaxy(): { galaxy: Galaxy; origin: Planet; target: Planet; bot: Player; targetPlayer: Player } {
  const system = new SolarSystem('RecallSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const origin = Planet.createStartingPlanet('Origin', 1, system, 1);
  const target = Planet.createStartingPlanet('Target', 2, system, 2);
  system.planets[1] = origin;
  system.planets[2] = target;
  origin.rBDSFTQ.resources = new ResourcesPack(5000, 5000, 5000);
  origin.rBDSFTQ.ships = new ManyShips({ [ShipType.FIGHTER]: 1, [ShipType.SPY_PROBE]: 1 }, []);

  const bot = new Player(
    1,
    'Bot-1',
    [origin],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const targetPlayer = new Player(
    2,
    'Target-2',
    [target],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );

  const galaxy = new Galaxy(
    'Recall Test',
    [bot, targetPlayer],
    [[system]],
    3,
    [],
    2,
    new Map(),
    new Map([[1, bot], [2, targetPlayer]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId], [targetPlayer.playerName, targetPlayer.playerId]])
  );

  return { galaxy, origin, target, bot, targetPlayer };
}

function createAttackFleet(
  origin: Planet,
  target: Planet,
  missionType: FleetMissionType = FleetMissionType.ATTACK
): Fleet {
  const shipType = missionType === FleetMissionType.SPY ? ShipType.SPY_PROBE : ShipType.FIGHTER;
  return new Fleet(
    1,
    1,
    missionType,
    new Destination(origin.basicInfo.solarSystem.coordinates.x, origin.basicInfo.solarSystem.coordinates.y, origin.basicInfo.order),
    new Destination(target.basicInfo.solarSystem.coordinates.x, target.basicInfo.solarSystem.coordinates.y, target.basicInfo.order),
    origin.basicInfo.name,
    target.basicInfo.name,
    new ManyShips({ [shipType]: 1 }, []),
    new ResourcesPack(0, 0, 0),
    0,
    0,
    0,
    4,
    4,
    FleetState.MOVING_TO_TARGET,
    1
  );
}

function createRequestDecisionProposal(): BotProposal {
  return {
    proposalId: 'request',
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'REQUEST_DECISION',
    status: 'ACCEPTED',
    goalKey: 'request',
    dedupeKey: 'request',
    summary: 'Reject support request',
    planetId: null,
    targetCoordinates: null,
    expectedValue: 100,
    urgency: 90,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      actionType: 'REQUEST_DECISION',
      requestType: 'SUPPORT',
      requestId: 1,
      decision: 'REJECT',
      approvedResources: null,
      maintenanceApproval: null
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}

function createSupportRequestCreationProposal(origin: Planet): BotProposal {
  return {
    proposalId: 'request-create',
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'REQUEST_CREATION',
    status: 'ACCEPTED',
    goalKey: 'request-create',
    dedupeKey: 'request-create',
    summary: 'Request repair support',
    planetId: null,
    targetCoordinates: {
      x: origin.basicInfo.solarSystem.coordinates.x,
      y: origin.basicInfo.solarSystem.coordinates.y,
      z: origin.basicInfo.order
    },
    expectedValue: 100,
    urgency: 50,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      actionType: 'REQUEST_CREATION',
      requestType: 'SUPPORT',
      targetPlayerId: 2,
      supportType: 'PLANET_REPAIR',
      targetCoordinates: {
        x: origin.basicInfo.solarSystem.coordinates.x,
        y: origin.basicInfo.solarSystem.coordinates.y,
        z: origin.basicInfo.order
      },
      requestedResources: null,
      missionType: null,
      minimumShips: [],
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}

function createDiplomacyDecisionProposal(): BotProposal {
  return {
    proposalId: 'diplomacy',
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'DIPLOMACY_DECISION',
    status: 'ACCEPTED',
    goalKey: 'diplomacy',
    dedupeKey: 'diplomacy',
    summary: 'Accept peace proposal',
    planetId: null,
    targetCoordinates: null,
    expectedValue: 100,
    urgency: 90,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      actionType: 'DIPLOMACY_DECISION',
      proposalId: 1,
      decision: 'ACCEPT',
      targetPlayerId: 2,
      requestedStatus: DiplomaticStatus.PEACE
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}

function createForeignJumpGateTransportProposal(): BotProposal {
  return {
    proposalId: 'jump-gate-fleet',
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'ACCEPTED',
    goalKey: 'jump-gate-fleet',
    dedupeKey: 'jump-gate-fleet',
    summary: 'Transport through allied Jump Gate',
    planetId: null,
    targetCoordinates: { x: 0, y: 0, z: 2 },
    expectedValue: 100,
    urgency: 50,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      missionType: FleetMissionType.TRANSPORT,
      origin: { x: 0, y: 0, z: 1 },
      target: { x: 0, y: 0, z: 2 },
      ships: [{ type: ShipType.TRANSPORTER, undamagedAmount: 1, damagedAmount: 0 }],
      carriedBombs: [],
      cargo: { metal: 1, crystal: 0, deuterium: 0 },
      useJumpGate: true,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}

function createMoveProposal(): BotProposal {
  return {
    proposalId: 'fleet',
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    kind: 'FLEET_MISSION',
    status: 'ACCEPTED',
    goalKey: 'move',
    dedupeKey: 'move',
    summary: 'Move fleet',
    planetId: null,
    targetCoordinates: { x: 0, y: 0, z: 2 },
    expectedValue: 100,
    urgency: 50,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      missionType: FleetMissionType.MOVE,
      origin: { x: 0, y: 0, z: 1 },
      target: { x: 0, y: 0, z: 2 },
      ships: [{ type: ShipType.TRANSPORTER, undamagedAmount: 1, damagedAmount: 0 }],
      carriedBombs: [],
      cargo: { metal: 0, crystal: 0, deuterium: 0 },
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}
