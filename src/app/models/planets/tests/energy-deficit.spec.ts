import { describe, expect, it } from 'vitest';
import {
  energyDeficitEfficiencyMultiplier,
  energyDeficitPenaltyPercent
} from '../energy-deficit';

describe('energy deficit penalty', () => {
  it('returns no penalty when available energy covers demand', () => {
    expect(energyDeficitPenaltyPercent(100, 100)).toBe(0);
    expect(energyDeficitPenaltyPercent(120, 100)).toBe(0);
    expect(energyDeficitEfficiencyMultiplier(120, 100)).toBe(1);
  });

  it('applies the configured linear penalty factor', () => {
    expect(energyDeficitPenaltyPercent(100, 110)).toBe(15);
    expect(energyDeficitEfficiencyMultiplier(100, 110)).toBe(0.85);
  });

  it('caps the maximum penalty at 95 percent', () => {
    expect(energyDeficitPenaltyPercent(10, 100)).toBe(95);
    expect(energyDeficitEfficiencyMultiplier(10, 100)).toBeCloseTo(0.05, 10);
    expect(energyDeficitPenaltyPercent(0, 50)).toBe(95);
  });
});
