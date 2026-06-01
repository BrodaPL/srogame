import { describe, expect, it } from 'vitest';
import {
  calculateBaseCost,
  createTradePortOffer,
  synchronizeTradePortOffers
} from '../trade-port-offers';

describe('trade-port-offers', () => {
  it('uses the 3:2:1 valuation when converting base cost between resources', () => {
    expect(calculateBaseCost('metal', 'deuterium', 1000)).toBe(333);
    expect(calculateBaseCost('crystal', 'metal', 200)).toBe(300);
    expect(calculateBaseCost('deuterium', 'crystal', 100)).toBe(200);
  });

  it('creates offers with deterministic resource rolls, amount steps, and modifier discount', () => {
    const randomSequence = [0, 0.8, 0.4, 0];
    let randomIndex = 0;
    const offer = createTradePortOffer({
      offerId: 7,
      turn: 3,
      tradePortLevel: 10,
      jumpGateLevel: 3,
      tradePortCapacity: 1000,
      randomSource: () => randomSequence[randomIndex++] ?? 0
    });

    expect(offer.offerId).toBe(7);
    expect(offer.turn).toBe(3);
    expect(offer.getResourceType).toBe('metal');
    expect(offer.costResourceType).toBe('deuterium');
    expect(offer.getAmount).toBe(600);
    expect(offer.baseCost).toBe(200);
    expect(offer.rolledModifierPercent).toBe(5);
    expect(offer.levelDiscountPercent).toBe(19);
    expect(offer.costModifierPercent).toBe(-14);
    expect(offer.totalCost).toBe(172);
    expect(offer.used).toBe(false);
  });

  it('floors total cost at zero when trade port and jump gate discounts exceed the rolled surcharge', () => {
    const randomSequence = [0, 0.8, 0.4, 0];
    let randomIndex = 0;
    const offer = createTradePortOffer({
      offerId: 8,
      turn: 5,
      tradePortLevel: 40,
      jumpGateLevel: 80,
      tradePortCapacity: 1000,
      randomSource: () => randomSequence[randomIndex++] ?? 0
    });

    expect(offer.rolledModifierPercent).toBe(5);
    expect(offer.levelDiscountPercent).toBe(180);
    expect(offer.costModifierPercent).toBe(-175);
    expect(offer.totalCost).toBe(0);
  });

  it('floors the combined 1.5 percent Trade Port and Jump Gate discount', () => {
    const offer = createTradePortOffer({
      offerId: 9,
      turn: 5,
      tradePortLevel: 1,
      jumpGateLevel: 2,
      tradePortCapacity: 1000,
      randomSource: () => 0
    });

    expect(offer.levelDiscountPercent).toBe(4);
  });

  it('refreshes offers on a new turn and keeps same-turn offers fixed', () => {
    const turnOne = synchronizeTradePortOffers({
      existingOffers: [],
      currentTurn: 1,
      tradePortLevel: 2,
      jumpGateLevel: 0,
      tradePortCapacity: 1000,
      randomSource: () => 0
    });

    expect(turnOne.changed).toBe(true);
    expect(turnOne.offers).toHaveLength(2);
    expect(turnOne.offers[0]?.getAmount).toBe(200);
    expect(turnOne.offers[1]?.offerId).toBe(2);

    const sameTurn = synchronizeTradePortOffers({
      existingOffers: turnOne.offers,
      currentTurn: 1,
      tradePortLevel: 2,
      jumpGateLevel: 0,
      tradePortCapacity: 3000,
      randomSource: () => 0.9
    });

    expect(sameTurn.changed).toBe(false);
    expect(sameTurn.offers).toEqual(turnOne.offers);

    const nextTurn = synchronizeTradePortOffers({
      existingOffers: turnOne.offers,
      currentTurn: 2,
      tradePortLevel: 2,
      jumpGateLevel: 0,
      tradePortCapacity: 1000,
      randomSource: () => 0
    });

    expect(nextTurn.changed).toBe(true);
    expect(nextTurn.offers).toHaveLength(2);
    expect(nextTurn.offers.every((offer) => offer.turn === 2)).toBe(true);
    expect(nextTurn.offers.every((offer) => offer.used === false)).toBe(true);
  });

  it('adds only the new same-turn offer when the trade port level increases mid-turn', () => {
    const existing = synchronizeTradePortOffers({
      existingOffers: [],
      currentTurn: 4,
      tradePortLevel: 1,
      jumpGateLevel: 0,
      tradePortCapacity: 1000,
      randomSource: () => 0
    }).offers;
    existing[0]!.used = true;

    const upgraded = synchronizeTradePortOffers({
      existingOffers: existing,
      currentTurn: 4,
      tradePortLevel: 2,
      jumpGateLevel: 0,
      tradePortCapacity: 1000,
      randomSource: () => 0.9
    });

    expect(upgraded.changed).toBe(true);
    expect(upgraded.offers).toHaveLength(2);
    expect(upgraded.offers[0]?.offerId).toBe(1);
    expect(upgraded.offers[0]?.used).toBe(true);
    expect(upgraded.offers[1]?.offerId).toBe(2);
    expect(upgraded.offers[1]?.used).toBe(false);
  });
});
