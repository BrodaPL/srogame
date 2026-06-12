import { describe, expect, it } from 'vitest';
import { smallResourceCostIconPath } from './resource-cost-icon-path';

describe('smallResourceCostIconPath', () => {
  it('resolves every resource from its stable key', () => {
    expect(smallResourceCostIconPath('metal')).toBe('images/icons/small/metal.png');
    expect(smallResourceCostIconPath('crystal')).toBe('images/icons/small/crystal.png');
    expect(smallResourceCostIconPath('deuterium')).toBe('images/icons/small/deuter.png');
  });
});
