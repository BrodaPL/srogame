import type { TradeResourceType } from './trade-resource-type';

export type TradePortOffer = {
  offerId: number;
  turn: number;
  getResourceType: TradeResourceType;
  getAmount: number;
  costResourceType: TradeResourceType;
  baseCost: number;
  totalCost: number;
  rolledModifierPercent: number;
  levelDiscountPercent: number;
  costModifierPercent: number;
  used: boolean;
};

export function copyTradePortOffer(offer: TradePortOffer): TradePortOffer {
  return {
    offerId: offer.offerId,
    turn: offer.turn,
    getResourceType: offer.getResourceType,
    getAmount: offer.getAmount,
    costResourceType: offer.costResourceType,
    baseCost: offer.baseCost,
    totalCost: offer.totalCost,
    rolledModifierPercent: offer.rolledModifierPercent,
    levelDiscountPercent: offer.levelDiscountPercent,
    costModifierPercent: offer.costModifierPercent,
    used: offer.used
  };
}
