import { describe, expect, it } from 'vitest';
import {
  industryPowerMultiplier,
  maxActiveFleets,
  researchPowerMultiplier
} from '../technology-effects';

describe('technology effects', () => {
  it('calculates the active fleet cap from Computer Technology', () => {
    expect(maxActiveFleets(0)).toBe(2);
    expect(maxActiveFleets(1)).toBe(4);
    expect(maxActiveFleets(4)).toBe(10);
  });

  it('calculates the industry multiplier from Adaptive Technology', () => {
    expect(industryPowerMultiplier(0)).toBe(1);
    expect(industryPowerMultiplier(3)).toBe(1.03);
  });

  it('combines research bonuses on the base value', () => {
    expect(researchPowerMultiplier(0, 0, 0)).toBe(1);
    expect(researchPowerMultiplier(2, 1, 3)).toBe(1.17);
    expect(researchPowerMultiplier(4, 0, 2)).toBe(1.24);
  });
});
