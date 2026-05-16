import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
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
      executionPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.METAL_MINE },
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

    expect(decision.pending).toHaveLength(1);
    expect(decision.rejected.find((entry) => entry.proposalId === 'new')).toMatchObject({
      proposalId: 'new',
      reason: 'already_committed'
    });
  });

  it('accepts allowlisted fleet missions and enforces available ships', () => {
    const memory = createDefaultBotMemoryV2();
    const supervisor = createSupervisor();

    const acceptedDecision = supervisor.decide(
      createSnapshot(
        { metal: 100, crystal: 100, deuterium: 100 },
        {
          activeFleetCount: 0,
          maxActiveFleetCount: 3,
          ships: { [ShipType.SPY_PROBE]: 1 }
        }
      ),
      memory,
      [createFleetProposal(FleetMissionType.SPY, ShipType.SPY_PROBE)]
    );

    expect(acceptedDecision.accepted).toHaveLength(1);
    expect(acceptedDecision.accepted[0]?.kind).toBe('FLEET_MISSION');

    const rejectedDecision = supervisor.decide(
      createSnapshot(
        { metal: 100, crystal: 100, deuterium: 100 },
        {
          activeFleetCount: 0,
          maxActiveFleetCount: 3,
          ships: {}
        }
      ),
      memory,
      [createFleetProposal(FleetMissionType.SPY, ShipType.SPY_PROBE)]
    );

    expect(rejectedDecision.rejected[0]).toMatchObject({
      proposalId: 'fleet',
      reason: 'ships_unavailable'
    });
  });

  it('prioritizes executable request decisions before normal proposals', () => {
    const decision = createSupervisor().decide(
      createSnapshot({ metal: 1000, crystal: 1000, deuterium: 1000 }),
      createDefaultBotMemoryV2(),
      [createBuildingProposal({ expectedValue: 999 }), createRequestDecisionProposal()]
    );

    expect(decision.accepted[0]?.kind).toBe('REQUEST_DECISION');
    expect(decision.accepted[0]?.proposalId).toBe('request');
  });

  it('accepts combat fleet missions in phase 3 and rejects non-war bombardment', () => {
    const supervisor = createSupervisor();
    const attackDecision = supervisor.decide(
      createSnapshot(
        { metal: 100, crystal: 100, deuterium: 100 },
        {
          activeFleetCount: 0,
          maxActiveFleetCount: 3,
          ships: { [ShipType.FIGHTER]: 1 }
        }
      ),
      createDefaultBotMemoryV2(),
      [createFleetProposal(FleetMissionType.ATTACK, ShipType.FIGHTER)]
    );

    expect(attackDecision.accepted).toHaveLength(1);

    const bombardDecision = supervisor.decide(
      createSnapshot(
        { metal: 100, crystal: 100, deuterium: 100 },
        {
          activeFleetCount: 0,
          maxActiveFleetCount: 3,
          ships: { [ShipType.ATMOSPHERIC_BOMBER]: 1 }
        }
      ),
      createDefaultBotMemoryV2(),
      [createFleetProposal(FleetMissionType.BOMBARD, ShipType.ATMOSPHERIC_BOMBER, {
        debug: { targetStatus: DiplomaticStatus.PEACE }
      })]
    );

    expect(bombardDecision.accepted).toHaveLength(0);
    expect(bombardDecision.rejected[0]).toMatchObject({
      proposalId: 'fleet',
      reason: 'bombard_siege_requires_war'
    });
  });

  it('stores exact fleet proposals as pending when missing ships complete next turn', () => {
    const memory = createDefaultBotMemoryV2();
    const decision = createSupervisor().decide(
      createSnapshot(
        { metal: 100, crystal: 100, deuterium: 100 },
        {
          activeFleetCount: 0,
          maxActiveFleetCount: 3,
          ships: {},
          shipsCompletingNextTurnByType: { [ShipType.FIGHTER]: 1 }
        }
      ),
      memory,
      [createFleetProposal(FleetMissionType.ATTACK, ShipType.FIGHTER)]
    );

    expect(decision.accepted).toHaveLength(0);
    expect(decision.pending).toHaveLength(1);
    expect(memory.supervisor.pendingCommitments[0]).toMatchObject({
      status: 'PENDING_SHIPS_NEXT_TURN',
      expiresOnTurn: 2
    });
  });

  it('retries affordable pending queue commitments and marks expired commitments', () => {
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
      executionPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.METAL_MINE },
      cancelReason: null
    }, {
      commitmentKey: 'expired',
      dedupeKey: 'expired',
      proposalId: 'expired',
      subsystemId: 'ECONOMIC',
      kind: 'BUILDING',
      targetCoordinates: { x: 0, y: 0, z: 1 },
      requestedResources: { metal: 100, crystal: 0, deuterium: 0 },
      weightedResourceValue: 100,
      score: 100,
      status: 'PENDING_RESOURCES',
      createdTurn: 1,
      updatedTurn: 1,
      expiresOnTurn: 1,
      executionPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.METAL_MINE },
      cancelReason: null
    });

    const decision = createSupervisor().decide(
      createSnapshot({ metal: 1000, crystal: 1000, deuterium: 1000 }, { turn: 5 }),
      memory,
      []
    );

    expect(decision.accepted[0]?.dedupeKey).toBe('economic:building:0:0:1:METAL_MINE');
    expect(memory.supervisor.pendingCommitments.find((entry) => entry.dedupeKey === 'expired')).toMatchObject({
      status: 'EXPIRED',
      cancelReason: 'expired'
    });
  });

  it('does not let expired commitment history block fresh proposals', () => {
    const memory = createDefaultBotMemoryV2();
    memory.supervisor.pendingCommitments.push({
      commitmentKey: 'expired',
      dedupeKey: 'economic:building:0:0:1:METAL_MINE',
      proposalId: 'expired',
      subsystemId: 'ECONOMIC',
      kind: 'BUILDING',
      targetCoordinates: { x: 0, y: 0, z: 1 },
      requestedResources: { metal: 100, crystal: 0, deuterium: 0 },
      weightedResourceValue: 100,
      score: 1000,
      status: 'EXPIRED',
      createdTurn: 1,
      updatedTurn: 5,
      expiresOnTurn: 1,
      executionPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.METAL_MINE },
      cancelReason: 'expired'
    });

    const decision = createSupervisor().decide(
      createSnapshot({ metal: 1000, crystal: 1000, deuterium: 1000 }, { turn: 5 }),
      memory,
      [createBuildingProposal({ expectedValue: 10 })]
    );

    expect(decision.accepted).toHaveLength(1);
    expect(decision.rejected.find((entry) => entry.proposalId === 'new')).toBeUndefined();
  });

  it('prefers exact same-technology overlap when competing research proposals are otherwise tied', () => {
    const decision = createSupervisor().decide(
      createSnapshot({ metal: 1000, crystal: 1000, deuterium: 1000 }),
      createDefaultBotMemoryV2(),
      [
        createResearchProposal('research-main', 'RESEARCH', TechnologyType.ENERGY_TECHNOLOGY),
        createResearchProposal('research-overlap', 'ECONOMIC', TechnologyType.ENERGY_TECHNOLOGY),
        createResearchProposal('research-other', 'STRATEGIC_DEVELOPMENT', TechnologyType.MATERIAL_TECHNOLOGY)
      ]
    );

    expect(decision.accepted).toHaveLength(1);
    expect(decision.accepted[0]?.requestPayload.technologyType).toBe(TechnologyType.ENERGY_TECHNOLOGY);
  });
});

function createSupervisor(): BotSupervisorV2 {
  return new BotSupervisorV2({
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
}

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

function createFleetProposal(
  missionType: FleetMissionType,
  shipType: ShipType,
  overrides: Partial<BotProposal> = {}
): BotProposal {
  return {
    proposalId: 'fleet',
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: 'fleet-goal',
    dedupeKey: `fleet:${missionType}`,
    summary: 'Fleet mission',
    planetId: null,
    targetCoordinates: { x: 1, y: 0, z: 1 },
    expectedValue: 100,
    urgency: 50,
    risk: 0,
    confidence: 90,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      missionType,
      origin: { x: 0, y: 0, z: 1 },
      target: { x: 1, y: 0, z: 1 },
      ships: [{ type: shipType, undamagedAmount: 1, damagedAmount: 0 }],
      carriedBombs: [],
      cargo: { metal: 0, crystal: 0, deuterium: 0 },
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: null,
    debug: {},
    ...overrides
  };
}

function createRequestDecisionProposal(): BotProposal {
  return {
    proposalId: 'request',
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'REQUEST_DECISION',
    status: 'PROPOSED',
    goalKey: 'request',
    dedupeKey: 'request',
    summary: 'Reject request',
    planetId: null,
    targetCoordinates: null,
    expectedValue: 1,
    urgency: 1,
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

function createResearchProposal(
  proposalId: string,
  subsystemId: BotProposal['subsystemId'],
  technologyType: TechnologyType
): BotProposal {
  return {
    proposalId,
    subsystemId,
    kind: 'RESEARCH',
    status: 'PROPOSED',
    goalKey: `research:${technologyType}`,
    dedupeKey: `research:${technologyType}:${proposalId}`,
    summary: `Research ${technologyType}`,
    planetId: null,
    targetCoordinates: { x: 0, y: 0, z: 1 },
    expectedValue: 25,
    urgency: 20,
    risk: 0,
    confidence: 80,
    requestedResources: { metal: 100, crystal: 100, deuterium: 0 },
    requestPayload: { x: 0, y: 0, z: 1, technologyType, helperPlanets: [] },
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}

function createSnapshot(
  resources: { metal: number; crystal: number; deuterium: number },
  options: {
    turn?: number;
    activeFleetCount?: number;
    maxActiveFleetCount?: number;
    ships?: Partial<Record<ShipType, number>>;
    shipsCompletingNextTurnByType?: Partial<Record<ShipType, number>>;
  } = {}
): BotWorldSnapshot {
  return {
    turn: options.turn ?? 1,
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
        isResearchHelper: false,
        queuedBuildingTypes: [],
        queuedDefenceTypes: [],
        queuedShipTypes: [],
        shipsCompletingNextTurnByType: options.shipsCompletingNextTurnByType ?? {},
        currentResearchType: null
      },
      defense: {} as BotWorldSnapshot['planets'][number]['defense'],
      ships: {
        undamagedCountByType: options.ships ?? {},
        damagedCountByType: {},
        installedCountByType: options.ships ?? {},
        installedValueByType: {},
        totalInstalledShipValue: 0
      },
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
      activeFleetCount: options.activeFleetCount ?? 0,
      maxActiveFleetCount: options.maxActiveFleetCount ?? 0,
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
