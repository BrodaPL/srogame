import type { TranslationParams } from '../../i18n/i18n.types';

export type TradeResourceType = 'metal' | 'crystal' | 'deuterium';

export const TRADE_RESOURCE_TYPES: TradeResourceType[] = ['metal', 'crystal', 'deuterium'];

type TranslateFn = (key: string, params?: TranslationParams) => string;

export function tradeResourceLabel(
  resourceType: TradeResourceType,
  translate?: TranslateFn,
): string {
  const key = `terminology.resources.${resourceType}`;
  if (translate) {
    return translate(key);
  }

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
