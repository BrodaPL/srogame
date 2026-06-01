import { describe, expect, it } from 'vitest';
import {
  calculateJumpGateTravelCost,
  countJumpGateChargedShips,
  jumpGateTravelCostMultiplier
} from '../jump-gate-travel-cost';
import { ShipType } from '../../enums/ship-type';

describe('jump gate travel cost', () => {
  it('charges 10 deuterium per jump-capable non-spy ship', () => {
    expect(calculateJumpGateTravelCost([
      { type: ShipType.CRUISER, amount: 2 },
      { type: ShipType.TRANSPORTER, amount: 3 },
      { type: ShipType.SPY_PROBE, amount: 5 },
      { type: ShipType.FIGHTER, amount: 4 }
    ], 0, 0, 1)).toBe(50);
  });

  it('counts only jump-capable non-spy ships', () => {
    expect(countJumpGateChargedShips([
      { type: ShipType.CRUISER, amount: 1 },
      { type: ShipType.SPY_PROBE, amount: 4 },
      { type: ShipType.FIGHTER, amount: 3 }
    ])).toBe(1);
  });

  it('applies hyperspace and jump gate level reductions', () => {
    expect(jumpGateTravelCostMultiplier(3, 4, 3)).toBeCloseTo(0.8, 8);
    expect(calculateJumpGateTravelCost([
      { type: ShipType.CRUISER, amount: 5 }
    ], 3, 4, 3)).toBe(40);
  });
});
