export type ResourceCostIconKey = 'metal' | 'crystal' | 'deuterium';

const SMALL_RESOURCE_COST_ICON_PATHS: Record<ResourceCostIconKey, string> = {
  metal: 'images/icons/small/metal.png',
  crystal: 'images/icons/small/crystal.png',
  deuterium: 'images/icons/small/deuter.png',
};

export function smallResourceCostIconPath(resource: ResourceCostIconKey): string {
  return SMALL_RESOURCE_COST_ICON_PATHS[resource];
}
