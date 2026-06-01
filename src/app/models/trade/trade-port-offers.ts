import type { TradePortOffer } from './trade-port-offer';
import { copyTradePortOffer } from './trade-port-offer';
import type { TradeResourceType } from './trade-resource-type';
import { TRADE_RESOURCE_TYPES } from './trade-resource-type';

const AMOUNT_STEPS = [0.2, 0.4, 0.6, 0.8, 1];
const RESOURCE_VALUE_BY_TYPE: Record<TradeResourceType, number> = {
  metal: 1,
  crystal: 1.5,
  deuterium: 3
};

type TradePortOfferSyncInput = {
  existingOffers: TradePortOffer[];
  currentTurn: number;
  tradePortLevel: number;
  jumpGateLevel: number;
  tradePortCapacity: number;
  randomSource?: () => number;
};

type TradePortOfferSyncResult = {
  offers: TradePortOffer[];
  changed: boolean;
};

export function synchronizeTradePortOffers(
  input: TradePortOfferSyncInput
): TradePortOfferSyncResult {
  const normalizedLevel = Math.max(0, Math.floor(input.tradePortLevel));
  if (normalizedLevel <= 0) {
    return {
      offers: [],
      changed: input.existingOffers.length > 0
    };
  }

  const currentTurnOffers = input.existingOffers
    .filter((offer) => offer.turn === input.currentTurn)
    .map((offer) => copyTradePortOffer(offer));

  if (currentTurnOffers.length === normalizedLevel) {
    return {
      offers: currentTurnOffers,
      changed: input.existingOffers.length !== currentTurnOffers.length
    };
  }

  if (currentTurnOffers.length > normalizedLevel) {
    return {
      offers: currentTurnOffers.slice(0, normalizedLevel),
      changed: true
    };
  }

  if (Math.max(0, Math.floor(input.tradePortCapacity)) <= 0) {
    return {
      offers: currentTurnOffers,
      changed: input.existingOffers.length !== currentTurnOffers.length
    };
  }

  const offers = [...currentTurnOffers];
  let nextOfferId = offers.reduce((maxId, offer) => Math.max(maxId, offer.offerId), 0) + 1;
  while (offers.length < normalizedLevel) {
    offers.push(createTradePortOffer({
      offerId: nextOfferId,
      turn: input.currentTurn,
      tradePortLevel: normalizedLevel,
      jumpGateLevel: input.jumpGateLevel,
      tradePortCapacity: input.tradePortCapacity,
      randomSource: input.randomSource
    }));
    nextOfferId += 1;
  }

  return {
    offers,
    changed: true
  };
}

type CreateTradePortOfferInput = {
  offerId: number;
  turn: number;
  tradePortLevel: number;
  jumpGateLevel: number;
  tradePortCapacity: number;
  randomSource?: () => number;
};

export function createTradePortOffer(input: CreateTradePortOfferInput): TradePortOffer {
  const randomSource = input.randomSource ?? Math.random;
  const getResourceType = pickResourceType(randomSource);
  const costResourceType = pickDifferentResourceType(getResourceType, randomSource);
  const amountStep = pickAmountStep(randomSource);
  const getAmount = Math.max(1, Math.floor(Math.max(0, input.tradePortCapacity) * amountStep));
  const baseCost = calculateBaseCost(getResourceType, costResourceType, getAmount);
  const rolledModifierPercent = 5 + Math.floor(nextRandom(randomSource) * 36);
  const levelDiscountPercent = Math.floor(
    (
      Math.max(0, Math.floor(input.tradePortLevel))
      + Math.max(0, Math.floor(input.jumpGateLevel))
    ) * 1.5
  );
  const costModifierPercent = rolledModifierPercent - levelDiscountPercent;
  const totalCost = Math.max(0, Math.ceil(baseCost * (1 + (costModifierPercent / 100))));

  return {
    offerId: input.offerId,
    turn: input.turn,
    getResourceType,
    getAmount,
    costResourceType,
    baseCost,
    totalCost,
    rolledModifierPercent,
    levelDiscountPercent,
    costModifierPercent,
    used: false
  };
}

export function calculateBaseCost(
  getResourceType: TradeResourceType,
  costResourceType: TradeResourceType,
  getAmount: number
): number {
  const normalizedGetAmount = Math.max(0, Math.floor(getAmount));
  if (normalizedGetAmount <= 0) {
    return 0;
  }

  const getValue = normalizedGetAmount * RESOURCE_VALUE_BY_TYPE[getResourceType];
  const costValue = RESOURCE_VALUE_BY_TYPE[costResourceType];
  if (!Number.isFinite(costValue) || costValue <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(getValue / costValue));
}

function pickResourceType(randomSource: () => number): TradeResourceType {
  const index = Math.min(
    TRADE_RESOURCE_TYPES.length - 1,
    Math.floor(nextRandom(randomSource) * TRADE_RESOURCE_TYPES.length)
  );
  return TRADE_RESOURCE_TYPES[index] ?? 'metal';
}

function pickDifferentResourceType(
  excludedType: TradeResourceType,
  randomSource: () => number
): TradeResourceType {
  const candidates = TRADE_RESOURCE_TYPES.filter((resourceType) => resourceType !== excludedType);
  const index = Math.min(candidates.length - 1, Math.floor(nextRandom(randomSource) * candidates.length));
  return candidates[index] ?? (excludedType === 'metal' ? 'crystal' : 'metal');
}

function pickAmountStep(randomSource: () => number): number {
  const index = Math.min(AMOUNT_STEPS.length - 1, Math.floor(nextRandom(randomSource) * AMOUNT_STEPS.length));
  return AMOUNT_STEPS[index] ?? 0.2;
}

function nextRandom(randomSource: () => number): number {
  const raw = randomSource();
  if (!Number.isFinite(raw)) {
    return 0;
  }

  return Math.min(0.999999, Math.max(0, raw));
}
