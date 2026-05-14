import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { createDefaultBotMemoryV2 } from '../bot-v2-memory.js';
import type { BotProposal, BotWorldSnapshot } from '../bot-v2-types.ts';
import { BotSupervisorV2 } from './bot-supervisor.js';

describe('bot supervisor commitments', () => {
  it('stores unaffordable queue proposals as pending commitments', () => {
    const memory = createDefaultBotMemoryV2();
    const supervisor = new BotSupervisorV2({
      mode: 'LIVE',
      enabledSubsystems: {
        economic: true,
        defensive: true,
        warfare: true,
        critical: true,
        strategicDevelopment: true,
        strategicMilitary: true,
        strategicDiplomatic: true,
        weightManager: true
      }
    });

    const decision = supervisor.decide(
      createSnapshot({ metal: 0, crystal: 0, deuterium: 0 }),
      memory,
      [createBuildingProposal()]
    );

    expect(decision.accepted).toHaveLength(0);
    expect(decision.pending).toHaveLength(1);
    expect(memory.supervisor.pendingCommitments[0]).toMatchObject({
      dedupeKey: 'economic:building:0:0:1:METAL_MINE',
      status: 'PENDING_RESOURCES',
      expiresOnTurn: 6
    });
  });

  it('rejects duplicate pending proposals unless clearly better', () => {
    const memory = createDefaultBotMemoryV2();
    memory.supervisor.pendingCommitments.push({
      commitmentKey: 'commitment',
      dedupeKey: 'economic:building:0:0:1:METAL_MINE',
      proposalId: 'old',
      subsystemId: 'ECONOMIC',
      kind: 'BUILDING',
      targetCoordinates: { x: 0, y: 0, z: 1 },
      requestedResources: { metal: 100, crystal: 0, deuterium: 0 },
      weightedResourceValue: 100,
      score: 100,
      status: 'PENDING_RESOURCES',
      createdTurn: 1,
      updatedTurn: 1,
      expiresOnTurn: 6,
      executionPayload: {},
      cancelReason: null
    });
    const supervisor = new BotSupervisorV2({
      mode: 'LIVE',
      enabledSubsystems: {
        economic: true,
        defensive: true,
        warfare: true,
        critical: true,
        strategicDevelopment: true,
        strategicMilitary: true,
        strategicDiplomatic: true,
        weightManager: true
      }
    });

    const decision = supervisor.decide(
      createSnapshot({ metal: 0, crystal: 0, deuterium: 0 }),
      memory,
      [createBuildingProposal({ expectedValue: 10 })]
    );

    expect(decision.pending).toHaveLength(0);
    expect(decision.rejected[0]).toMatchObject({
      proposalId: 'new',
      reason: 'already_committed'
    });
  });
});

function createBuildingProposal(overrides: Partial<BotProposal> = {}): BotProposal {
  return {
    proposalId: 'new',
    subsystemId: 'ECONOMIC',
    kind: 'BUILDING',
    status: 'PROPOSED',
    goalKey: 'goal',
    dedupeKey: 'economic:building:0:0:1:METAL_MINE',
    summary: 'Build metal mine',
    planetId: null,
    targetCoordinates: { x: 0, y: 0, z: 1 },
    expectedValue: 10,
    urgency: 10,
    risk: 0,
    confidence: 10,
    requestedResources: { metal: 100, crystal: 0, deuterium: 0 },
    requestPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.METAL_MINE },
    blockers: [],
    expiresOnTurn: null,
    debug: {},
    ...overrides
  };
}

function createSnapshot(resources: { metal: number; crystal: number; deuterium: number }): BotWorldSnapshot {
  return {
    turn: 1,
    playerId: 1,
    playerName: 'Bot',
    profileId: 'BALANCED',
    planets: [{
      planetId: 1,
      name: 'Home',
      coordinates: { x: 0, y: 0, z: 1 },
      maturityStage: 'BOOTSTRAP',
      tech: {} as BotWorldSnapshot['planets'][number]['tech'],
      economy: {} as BotWorldSnapshot['planets'][number]['economy'],
      modifiers: {} as BotWorldSnapshot['planets'][number]['modifiers'],
      power: {
        industryPower: 1,
        researchPower: 1,
        buildingQueueRemainingEtc: 0,
        researchQueueRemainingEtc: 0,
        maxBuildingQueueLength: 1,
        shipyardPower: 1,
        shipyardQueueRemainingEtc: 0,
        maxShipyardQueueLength: 1
      },
      queues: {
        buildingQueueLength: 0,
        shipyardQueueLength: 0,
        hasActiveResearch: false,
        queuedBuildingTypes: [],
        queuedDefenceTypes: [],
        queuedShipTypes: [],
        currentResearchType: null
      },
      defense: {} as BotWorldSnapshot['planets'][number]['defense'],
      ships: {} as BotWorldSnapshot['planets'][number]['ships'],
      infrastructure: {} as BotWorldSnapshot['planets'][number]['infrastructure'],
      localResources: resources,
      blockers: {
        energyStarved: false,
        storageBlocked: false,
        queueSaturated: false,
        missingRoboticsForGrowth: false
      }
    }],
    empire: {
      ownedPlanetCount: 1,
      computerTechnologyLevel: 0,
      imperiumFleetCap: 0,
      activeFleetCount: 0,
      maxActiveFleetCount: 0,
      activeColonizeFleetCount: 0,
      totalResources: resources,
      atWar: false,
      hasCriticalEnergyProblem: false,
      hasCriticalStorageProblem: false,
      intelCandidates: [],
      strategicMilitaryTargets: [],
      strategicDiplomaticFactions: []
    },
    flags: {
      shadowMode: false,
      currentBotStillExecutes: false,
      mode: 'LIVE'
    }
  };
}
