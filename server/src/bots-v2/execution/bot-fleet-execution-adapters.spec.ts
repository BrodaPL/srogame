import { describe, expect, it } from 'vitest';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import type { BotProposal } from '../bot-v2-types.ts';
import { normalizeFleetExecutionProposal } from './bot-fleet-execution-adapters.js';

describe('bot fleet execution adapters', () => {
  it('normalizes allowlisted fleet mission payloads', () => {
    const result = normalizeFleetExecutionProposal(createFleetProposal({
      missionType: FleetMissionType.SPY,
      ships: [{ type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }]
    }));

    expect(result).toEqual({
      ok: true,
      value: {
        missionType: FleetMissionType.SPY,
        origin: { x: 0, y: 0, z: 1 },
        target: { x: 1, y: 0, z: 1 },
        ships: [{ type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: {
          main: null,
          secondary: null,
          tertiary: null
        }
      }
    });
  });

  it('normalizes combat and guard missions for phase 3', () => {
    const result = normalizeFleetExecutionProposal(createFleetProposal({
      missionType: FleetMissionType.ATTACK,
      ships: [{ type: ShipType.FIGHTER, undamagedAmount: 1, damagedAmount: 0 }]
    }));

    expect(result).toMatchObject({
      ok: true,
      value: {
        missionType: FleetMissionType.ATTACK,
        ships: [{ type: ShipType.FIGHTER, undamagedAmount: 1, damagedAmount: 0 }]
      }
    });

    const guardResult = normalizeFleetExecutionProposal(createFleetProposal({
      missionType: FleetMissionType.DEFEND,
      ships: [{ type: ShipType.FIGHTER, undamagedAmount: 1, damagedAmount: 0 }]
    }));

    expect(guardResult).toMatchObject({
      ok: true,
      value: {
        missionType: FleetMissionType.DEFEND
      }
    });
  });

  it('normalizes recycle missions once a subsystem emits them deliberately', () => {
    const result = normalizeFleetExecutionProposal(createFleetProposal({
      missionType: FleetMissionType.RECYCLE,
      ships: [{ type: ShipType.RECYCLER, undamagedAmount: 1, damagedAmount: 0 }]
    }));

    expect(result).toMatchObject({
      ok: true,
      value: {
        missionType: FleetMissionType.RECYCLE,
        ships: [{ type: ShipType.RECYCLER, undamagedAmount: 1, damagedAmount: 0 }]
      }
    });
  });

  it('rejects proposals without exact ships', () => {
    const result = normalizeFleetExecutionProposal(createFleetProposal({
      missionType: FleetMissionType.SPY,
      ships: []
    }));

    expect(result).toEqual({
      ok: false,
      reason: 'missing_or_invalid_ships'
    });
  });
});

function createFleetProposal(input: {
  missionType: FleetMissionType;
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>;
}): BotProposal {
  return {
    proposalId: 'fleet-proposal',
    subsystemId: 'STRATEGIC_DEVELOPMENT',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: 'goal',
    dedupeKey: 'dedupe',
    summary: 'fleet',
    planetId: null,
    targetCoordinates: { x: 1, y: 0, z: 1 },
    expectedValue: 10,
    urgency: 10,
    risk: 0,
    confidence: 10,
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      missionType: input.missionType,
      origin: { x: 0, y: 0, z: 1 },
      target: { x: 1, y: 0, z: 1 },
      ships: input.ships,
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
