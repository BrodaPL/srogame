export type TradeResourceType = 'metal' | 'crystal' | 'deuterium';

export const TRADE_RESOURCE_TYPES: TradeResourceType[] = ['metal', 'crystal', 'deuterium'];

export function tradeResourceLabel(resourceType: TradeResourceType): string {
  switch (resourceType) {
    case 'metal':
      return 'Metal';
    case 'crystal':
      return 'Crystal';
    case 'deuterium':
      return 'Deuterium';
    default:
      return resourceType;
  }
}
