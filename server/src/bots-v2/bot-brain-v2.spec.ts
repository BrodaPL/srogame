import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { createDefaultBotMemoryV2 } from './bot-v2-memory.js';
import type { BotExecutionOutcome, BotProposal } from './bot-v2-types.ts';
import { recordIncomingResourceReservations } from './bot-brain-v2.js';

describe('BotBrainV2 resource concentration reservations', () => {
  it('creates an incoming resource reservation after a concentration transport launches', () => {
    const memory = createDefaultBotMemoryV2();
    const proposal = createConcentrationTransportProposal();
    const outcome: BotExecutionOutcome = {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: 'Fleet launched.',
      spent: { metal: 500, crystal: 100, deuterium: 0 },
      fuelSpent: 4,
      fleetId: 42,
      travelTurns: 3,
      fleetSlotsUsed: 1,
      missionType: FleetMissionType.TRANSPORT,
      originCoordinates: { x: 0, y: 0, z: 1 },
      targetCoordinates: { x: 0, y: 0, z: 2 }
    };

    recordIncomingResourceReservations(memory, [proposal], [outcome], 10);

    expect(memory.supervisor.incomingResourceReservations).toEqual([{
      reservationKey: 'old-building:0:0:2:Metal Mine:8:42:10',
      targetKey: 'old-building:0:0:2:Metal Mine:8',
      targetKind: 'OLD_BUILDING',
      intentSubsystemId: 'STRATEGIC_DEVELOPMENT',
      fleetId: 42,
      sourceCoordinates: { x: 0, y: 0, z: 1 },
      targetCoordinates: { x: 0, y: 0, z: 2 },
      buildingType: BuildingType.METAL_MINE,
      technologyType: null,
      nextLevel: 8,
      resources: { metal: 500, crystal: 100, deuterium: 0 },
      createdTurn: 10,
      expiresOnTurn: 15,
      active: true
    }]);
  });
});

function createConcentrationTransportProposal(): BotProposal {
  return {
    proposalId: 'concentration-transport',
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    kind: 'FLEET_MISSION',
    status: 'ACCEPTED',
    goalKey: 'concentration-transport',
    dedupeKey: 'concentration-transport',
    summary: 'Transport concentrated resources.',
    planetId: null,
    targetCoordinates: { x: 0, y: 0, z: 2 },
    expectedValue: 100,
    urgency: 80,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 500, crystal: 100, deuterium: 0 },
    budgetAttribution: {
      scope: 'IMPERIUM',
      planetKey: '0:0:2',
      intentSubsystemId: 'STRATEGIC_DEVELOPMENT',
      executorSubsystemId: 'STRATEGIC_DEVELOPMENT'
    },
    requestPayload: {
      missionType: FleetMissionType.TRANSPORT,
      origin: { x: 0, y: 0, z: 1 },
      target: { x: 0, y: 0, z: 2 },
      ships: [{ type: ShipType.TRANSPORTER, undamagedAmount: 1, damagedAmount: 0 }],
      carriedBombs: [],
      cargo: { metal: 500, crystal: 100, deuterium: 0 },
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {
      resourceConcentrationTransport: true,
      resourceConcentrationTargetKey: 'old-building:0:0:2:Metal Mine:8',
      resourceConcentrationTargetKind: 'OLD_BUILDING',
      resourceConcentrationBuildingType: BuildingType.METAL_MINE,
      resourceConcentrationTechnologyType: null,
      resourceConcentrationNextLevel: 8,
      budgetIntentSubsystemId: 'STRATEGIC_DEVELOPMENT'
    }
  };
}
