import { describe, expect, it } from 'vitest';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { DiplomaticProposalState } from '../../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { ManyShips } from '../../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../src/app/models/player.js';
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
