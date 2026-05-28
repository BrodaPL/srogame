import { describe, expect, it } from 'vitest';
import {
  fleetFuelConsumptionMultiplier,
  fleetFuelCostForDistance,
  fleetTravelTurnsForDistance,
  fleetTravelWorstShipModifier,
  industryPowerMultiplier,
  maxActiveFleets,
  maxOwnedPlanets,
  researchPowerMultiplier
} from '../technology-effects';
import { ShipType } from '../../enums/ship-type';

describe('technology effects', () => {
  it('calculates the active fleet cap from Computer Technology', () => {
    expect(maxActiveFleets(0)).toBe(2);
    expect(maxActiveFleets(1)).toBe(4);
    expect(maxActiveFleets(4)).toBe(10);
  });

  it('calculates the owned planet cap from Adaptive Technology', () => {
    expect(maxOwnedPlanets(0)).toBe(1);
    expect(maxOwnedPlanets(1)).toBe(2);
    expect(maxOwnedPlanets(2)).toBe(3);
    expect(maxOwnedPlanets(8)).toBe(5);
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

  it('uses hull-class travel modifiers', () => {
    expect(fleetTravelWorstShipModifier([{ type: ShipType.FIGHTER, amount: 1 }])).toBe(-0.4);
    expect(fleetTravelWorstShipModifier([{ type: ShipType.CRUISER, amount: 1 }])).toBe(-0.25);
    expect(fleetTravelWorstShipModifier([{ type: ShipType.BATTLE_CRUISER, amount: 1 }])).toBe(0);
    expect(fleetTravelWorstShipModifier([{ type: ShipType.TITAN, amount: 1 }])).toBe(0.35);
    expect(fleetTravelWorstShipModifier([{ type: ShipType.MOTHER_SHIP, amount: 1 }])).toBe(1);
    expect(fleetTravelWorstShipModifier([{ type: ShipType.SPY_PROBE, amount: 1 }])).toBe(-0.4);
    expect(fleetTravelWorstShipModifier([
      { type: ShipType.SPY_PROBE, amount: 1 },
      { type: ShipType.CRUISER, amount: 1 }
    ])).toBe(-0.25);
  });

  it('uses the base ETA formula with hull-class speed modifiers', () => {
    expect(fleetTravelTurnsForDistance(8, 4, 10, 2, [{ type: ShipType.BATTLE_CRUISER, amount: 1 }])).toBe(3);
    expect(fleetTravelTurnsForDistance(8, 4, 10, 2, [{ type: ShipType.FIGHTER, amount: 1 }])).toBe(2);
    expect(fleetTravelTurnsForDistance(8, 4, 10, 2, [{ type: ShipType.TITAN, amount: 1 }])).toBe(4);
    expect(fleetTravelTurnsForDistance(8, 4, 10, 2, [{ type: ShipType.SPY_PROBE, amount: 1 }])).toBe(2);
    expect(fleetTravelTurnsForDistance(8, 4, 10, 2, [
      { type: ShipType.SPY_PROBE, amount: 1 },
      { type: ShipType.CRUISER, amount: 1 }
    ])).toBe(3);
  });

  it('reduces total fleet fuel cost from Fusion Drive, Hyperspace Technology, and Hyperspace Drive', () => {
    expect(fleetFuelConsumptionMultiplier(3, 4, 5)).toBe(0.84);
    expect(fleetFuelCostForDistance(10, [{ type: ShipType.COLONIZER, amount: 1 }], 2, 3, 4, 5)).toBe(135);
  });

  it('ignores ships without hyperspace drive when calculating fleet fuel cost', () => {
    expect(fleetFuelCostForDistance(5, [
      { type: ShipType.FIGHTER, amount: 20 },
      { type: ShipType.TRANSPORTER, amount: 2 }
    ])).toBe(10);
  });
});
