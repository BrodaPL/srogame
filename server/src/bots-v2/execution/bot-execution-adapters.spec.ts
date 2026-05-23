import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../src/app/models/enums/building-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../src/app/models/enums/technology-type.js';
import type { BotProposal } from '../bot-v2-types.ts';
import { normalizeQueueExecutionProposal } from './bot-execution-adapters.js';

describe('bot execution adapters', () => {
  it('normalizes building proposals with direct coordinates', () => {
    const result = normalizeQueueExecutionProposal(createProposal({
      kind: 'BUILDING',
      requestPayload: { x: 1, y: 2, z: 3, buildingType: BuildingType.METAL_MINE }
    }));

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'BUILDING',
        command: { x: 1, y: 2, z: 3, buildingType: BuildingType.METAL_MINE }
      }
    });
  });

  it('normalizes research proposals with targetCoordinates', () => {
    const result = normalizeQueueExecutionProposal(createProposal({
      kind: 'RESEARCH',
      requestPayload: {
        targetCoordinates: { x: 1, y: 2, z: 3 },
        technologyType: TechnologyType.ENERGY_TECHNOLOGY
      }
    }));

    expect(result).toEqual({
      ok: true,
      value: {
        kind: 'RESEARCH',
        command: {
          x: 1,
          y: 2,
          z: 3,
          technologyType: TechnologyType.ENERGY_TECHNOLOGY,
          helperPlanets: []
        }
      }
    });
  });

  it('rejects demand-only ship needs as non-executable pressure', () => {
    const result = normalizeQueueExecutionProposal(createProposal({
      kind: 'SHIPYARD',
      requestPayload: {
        x: 1,
        y: 2,
        z: 3,
        demandOnly: true,
        itemKind: 'ship',
        shipType: ShipType.TRANSPORTER,
        amount: 1
      }
    }));

    expect(result).toEqual({
      ok: false,
      reason: 'ship_need_pressure_only'
    });
  });
});

function createProposal(input: {
  kind: BotProposal['kind'];
  requestPayload: Record<string, unknown>;
}): BotProposal {
  return {
    proposalId: 'proposal',
    subsystemId: 'ECONOMIC',
    kind: input.kind,
    status: 'PROPOSED',
    goalKey: 'goal',
    dedupeKey: 'dedupe',
    summary: 'summary',
    planetId: null,
    targetCoordinates: null,
    expectedValue: 10,
    urgency: 10,
    risk: 0,
    confidence: 10,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: input.requestPayload,
    blockers: [],
    expiresOnTurn: null,
    debug: {}
  };
}
