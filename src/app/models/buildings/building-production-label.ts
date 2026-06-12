import { BuildingType } from '../enums/building-type';
import type { TranslationParams } from '../../i18n/i18n.types';

type TranslateFn = (key: string, params?: TranslationParams) => string;

function buildingProductionLabelKey(type: BuildingType): string {
  switch (type) {
    case BuildingType.METAL_MINE:
      return 'terminology.buildingProduction.metalYield';
    case BuildingType.CRYSTAL_MINE:
      return 'terminology.buildingProduction.crystalYield';
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return 'terminology.buildingProduction.deuteriumYield';
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
    case BuildingType.NUCLEAR_PLANT:
    case BuildingType.FUSION_REACTOR:
      return 'terminology.buildingProduction.energyOutput';
    case BuildingType.METAL_STORAGE:
    case BuildingType.CRYSTAL_STORAGE:
    case BuildingType.DEUTERIUM_TANK:
      return 'terminology.buildingProduction.storageCapacity';
    case BuildingType.ROBOTICS_FACTORY:
      return 'terminology.buildingProduction.industryPower';
    case BuildingType.SHIPYARD:
      return 'terminology.buildingProduction.shipyardPower';
    case BuildingType.NANITE_FACTORY:
      return 'terminology.buildingProduction.industryShipyardMultiplier';
    case BuildingType.RESEARCH_LAB:
      return 'terminology.buildingProduction.researchPower';
    case BuildingType.ALLIANCE_DEPOT:
      return 'terminology.buildingProduction.orbitRepairCapacity';
    case BuildingType.BOMB_DEPOT:
      return 'terminology.buildingProduction.bombStorageCapacity';
    case BuildingType.TERRAFORMER:
      return 'terminology.buildingProduction.planetSizeBonus';
    case BuildingType.SPACEPORT:
      return 'terminology.buildingProduction.fleetSlotCapacity';
    case BuildingType.SENSOR_PHALANX:
      return 'terminology.buildingProduction.passiveScanRange';
    case BuildingType.JUMP_GATE:
      return 'terminology.buildingProduction.jumpCapacity';
    case BuildingType.INTERSTELLAR_TRADE_PORT:
      return 'terminology.buildingProduction.tradeCapacity';
    case BuildingType.BUNKER_NETWORK:
      return 'terminology.buildingProduction.plunderProtection';
    default:
      return 'terminology.buildingProduction.output';
  }
}

function fallbackBuildingProductionLabel(type: BuildingType): string {
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

export function buildingProductionLabel(type: BuildingType, translate?: TranslateFn): string {
  const key = buildingProductionLabelKey(type);
  return translate ? translate(key) : fallbackBuildingProductionLabel(type);
}

export function contextualBuildingProductionLabel(
  type: BuildingType,
  prefix: 'Current' | 'Level 1',
  translate?: TranslateFn,
): string {
  const label = buildingProductionLabel(type, translate);
  if (!translate) {
    return `${prefix} ${label}`;
  }

  return translate(
    prefix === 'Current'
      ? 'terminology.buildingProduction.context.current'
      : 'terminology.buildingProduction.context.level1',
    { label },
  );
}
