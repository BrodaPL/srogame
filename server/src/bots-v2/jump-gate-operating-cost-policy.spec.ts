import { describe, expect, it } from 'vitest';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import {
  estimateJumpGateOperatingCost,
  evaluateJumpGateOperatingCostPolicy
} from './jump-gate-operating-cost-policy.js';

describe('jump gate operating cost policy', () => {
  it('allows jump gate use while no operating cost model exists', () => {
    const decision = evaluateJumpGateOperatingCostPolicy({
      missionType: FleetMissionType.MOVE,
      selectedShipCount: 4,
      normalTravelTurns: 1,
      jumpGateTravelTurns: 1,
      fuelCost: 0
    });

    expect(estimateJumpGateOperatingCost().active).toBe(false);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('NO_OPERATING_COST');
  });

  it('rejects paid jump gate use when it saves no travel time', () => {
    const decision = evaluateJumpGateOperatingCostPolicy({
      missionType: FleetMissionType.TRANSPORT,
      selectedShipCount: 2,
      normalTravelTurns: 1,
      jumpGateTravelTurns: 1,
      fuelCost: 20,
      costQuote: {
        active: true,
        payer: 'REQUESTER',
        resources: { metal: 100, crystal: 0, deuterium: 0 },
        weightedResourceValue: 100,
        reason: 'TEST_COST'
      }
    });

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('NO_TRAVEL_TIME_SAVED');
  });

  it('allows paid jump gate use when saved travel value covers the cost', () => {
    const decision = evaluateJumpGateOperatingCostPolicy({
      missionType: FleetMissionType.DEFEND,
      selectedShipCount: 10,
      normalTravelTurns: 5,
      jumpGateTravelTurns: 1,
      fuelCost: 100,
      costQuote: {
        active: true,
        payer: 'REQUESTER',
        resources: { metal: 100, crystal: 0, deuterium: 0 },
        weightedResourceValue: 100,
        reason: 'TEST_COST'
      }
    });

    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe('OPERATING_COST_ACCEPTABLE');
  });
});
