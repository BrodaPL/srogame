import { describe, expect, it } from 'vitest';
import { calculateJumpGateCapacity, jumpGateBaseCapacityForLevel } from '../jump-gate-capacity';

describe('jump gate capacity', () => {
  it('uses the blueprint production1 value as the level base capacity', () => {
    expect(jumpGateBaseCapacityForLevel(1)).toBe(10);
    expect(jumpGateBaseCapacityForLevel(2)).toBe(25);
    expect(jumpGateBaseCapacityForLevel(4)).toBe(100);
  });

  it('scales capacity with building effectiveness, hyperspace parameters, and hyperspace technology', () => {
    expect(calculateJumpGateCapacity(4, 1.2, 3, 0.5)).toBe(69);
  });

  it('returns 0 when the gate level is missing or conditions collapse the capacity', () => {
    expect(calculateJumpGateCapacity(0, 1.2, 3, 1)).toBe(0);
    expect(calculateJumpGateCapacity(4, 0, 3, 1)).toBe(0);
    expect(calculateJumpGateCapacity(4, 1.2, 3, 0)).toBe(0);
  });
});
