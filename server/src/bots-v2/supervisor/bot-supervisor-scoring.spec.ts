import { describe, expect, it } from 'vitest';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
import { createDefaultBotMemoryV2 } from '../bot-v2-memory.js';
import type { BotProposal, BotWorldSnapshot } from '../bot-v2-types.ts';
import {
  calculateRawProposalScore,
  calculateWeightedResourceValue,
  resolveTargetShares,
  scoreSupervisorProposal
} from './bot-supervisor-scoring.js';

describe('bot supervisor scoring', () => {
  it('uses the selected weighted resource valuation', () => {
    expect(calculateWeightedResourceValue({
      metal: 100,
      crystal: 100,
      deuterium: 100
    })).toBe(540);
  });

  it('keeps the existing raw score formula', () => {
    expect(calculateRawProposalScore(createProposal({
      expectedValue: 100,
      urgency: 20,
      confidence: 40,
      risk: 20
    }))).toBe(115);
  });

  it('normalizes weights into target shares', () => {
    const shares = resolveTargetShares({
      ECONOMIC: 100,
      DEFENSIVE: 100,
      WARFARE: 100,
      RESEARCH: 100,
      STRATEGIC_DEVELOPMENT: 100,
      STRATEGIC_MILITARY: 100,
      STRATEGIC_DIPLOMATIC: 100
    });

    expect(shares.ECONOMIC).toBeCloseTo(1 / 7, 4);
    expect(shares.DEFENSIVE).toBeCloseTo(1 / 7, 4);
  });

  it('scores Critical outside normal weight competition', () => {
    const memory = createDefaultBotMemoryV2();
    const normal = scoreSupervisorProposal({
      proposal: createProposal({ subsystemId: 'ECONOMIC' }),
      snapshot: createSnapshot(),
      memory,
      shipNeedPressure: 0,
      criticalAccepted: false
    });
    const critical = scoreSupervisorProposal({
      proposal: createProposal({ subsystemId: 'CRITICAL' }),
      snapshot: createSnapshot(),
      memory,
      shipNeedPressure: 0,
      criticalAccepted: false
    });

    expect(critical).toBeGreaterThan(normal * 10);
  });

  it('can score Research as a normal weighted subsystem', () => {
    const memory = createDefaultBotMemoryV2();
    memory.weightManager.researchWeight = 80;

    const research = scoreSupervisorProposal({
      proposal: createProposal({
        subsystemId: 'RESEARCH',
        kind: 'RESEARCH',
        requestPayload: { x: 0, y: 0, z: 1, technologyType: TechnologyType.ENERGY_TECHNOLOGY }
      }),
      snapshot: createSnapshot(),
      memory,
      shipNeedPressure: 0,
      criticalAccepted: false
    });

    expect(research).toBeGreaterThan(0);
  });

  it('treats zero local subsystem weight as zero score', () => {
    const memory = createDefaultBotMemoryV2();
    memory.weightManager.planets = [{
      coordinates: { x: 0, y: 0, z: 1 },
      economicWeight: 80,
      defensiveWeight: 20,
      warfareWeight: 0,
      avgIndustry: 2,
      avgMilitary: 0,
      avgDefence: 0,
      avgDevelopment: 0,
      selectedFocus: null,
      immaturePlanet: true,
      maturePlanet: false,
      industryFocused: true,
      defenceFocused: false,
      militaryFocused: false,
      developmentFocused: false,
      industryHubPlanet: false,
      damagedPlanet: false,
      inDangerPlanet: false,
      constantlyAttackedPlanet: false,
      veryHeavilyAttackedPlanet: false,
      knownByWarFaction: false,
      recentHostileAttackCountLast20Turns: 0
    }];

    const warfare = scoreSupervisorProposal({
      proposal: createProposal({
        subsystemId: 'WARFARE',
        kind: 'SHIPYARD',
        requestPayload: { x: 0, y: 0, z: 1, itemKind: 'ship', shipType: ShipType.FIGHTER, amount: 1 }
      }),
      snapshot: createSnapshot([{
        coordinates: { x: 0, y: 0, z: 1 }
      }]),
      memory,
      shipNeedPressure: 0,
      criticalAccepted: false
    });

    expect(warfare).toBe(0);
  });
});

function createProposal(overrides: Partial<BotProposal> = {}): BotProposal {
  return {
    proposalId: 'proposal',
    subsystemId: 'ECONOMIC',
    kind: 'BUILDING',
    status: 'PROPOSED',
    goalKey: 'goal',
    dedupeKey: 'dedupe',
    summary: 'summary',
    planetId: null,
    targetCoordinates: { x: 0, y: 0, z: 1 },
    expectedValue: 10,
    urgency: 10,
    risk: 0,
    confidence: 10,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: { x: 0, y: 0, z: 1 },
    blockers: [],
    expiresOnTurn: null,
    debug: {},
    ...overrides
  };
}

function createSnapshot(planets: Array<Partial<BotWorldSnapshot['planets'][number]>> = []): BotWorldSnapshot {
  return {
    turn: 1,
    playerId: 1,
    playerName: 'Bot',
    profileId: 'BALANCED',
    planets: planets.map((planet) => ({
      coordinates: { x: 0, y: 0, z: 1 },
      ...planet
    })) as BotWorldSnapshot['planets'],
    empire: {
      ownedPlanetCount: 0,
      computerTechnologyLevel: 0,
      imperiumFleetCap: 0,
      activeFleetCount: 0,
      maxActiveFleetCount: 0,
      activeColonizeFleetCount: 0,
      totalResources: { metal: 0, crystal: 0, deuterium: 0 },
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
