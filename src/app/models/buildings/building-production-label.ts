import { BuildingType } from '../enums/building-type';

export function buildingProductionLabel(type: BuildingType): string {
  switch (type) {
    case BuildingType.METAL_MINE:
      return 'Metal yield';
    case BuildingType.CRYSTAL_MINE:
      return 'Crystal yield';
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return 'Deuterium yield';
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
    case BuildingType.NUCLEAR_PLANT:
    case BuildingType.FUSION_REACTOR:
      return 'Energy output';
    case BuildingType.METAL_STORAGE:
    case BuildingType.CRYSTAL_STORAGE:
    case BuildingType.DEUTERIUM_TANK:
      return 'Storage capacity';
    case BuildingType.ROBOTICS_FACTORY:
      return 'Industry power';
    case BuildingType.SHIPYARD:
      return 'Shipyard power';
    case BuildingType.NANITE_FACTORY:
      return 'Industry & Shipyard multiplier';
    case BuildingType.RESEARCH_LAB:
      return 'Research power';
    case BuildingType.ALLIANCE_DEPOT:
      return 'Orbit repair capacity';
    case BuildingType.BOMB_DEPOT:
      return 'Bomb storage capacity';
    case BuildingType.TERRAFORMER:
      return 'Planet size bonus';
    case BuildingType.SPACEPORT:
      return 'Fleet slot capacity';
    case BuildingType.SENSOR_PHALANX:
      return 'Passive scan range';
    case BuildingType.JUMP_GATE:
      return 'Jump capacity';
    case BuildingType.INTERSTELLAR_TRADE_PORT:
      return 'Trade capacity';
    case BuildingType.BUNKER_NETWORK:
      return 'Plunder protection';
    default:
      return 'Output';
  }
}

export function contextualBuildingProductionLabel(
  type: BuildingType,
  prefix: 'Current' | 'Level 1'
): string {
  const label = buildingProductionLabel(type);
  return `${prefix} ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}
