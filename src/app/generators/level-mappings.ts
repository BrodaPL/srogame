import { BuildingType } from '../models/enums/building-type';
import { ShipType } from '../models/enums/ship-type';
import { TechnologyType } from '../models/enums/technology-type';

export type LevelMapping = {
  availableFromLevel: number;
  weight: number;
};

export class LevelMappings {
  static readonly SHIP_META: Record<ShipType, LevelMapping> = {
    [ShipType.FIGHTER]: { availableFromLevel: 1, weight: 1 },
    [ShipType.ASSAULT_FIGHTER]: { availableFromLevel: 1, weight: 1 },
    [ShipType.CORVETTE]: { availableFromLevel: 2, weight: 2 },
    [ShipType.SPY_PROBE]: { availableFromLevel: 1, weight: 0.2 },
    [ShipType.REPAIR_DRONE]: { availableFromLevel: 2, weight: 0.5 },
    [ShipType.CRUISER]: { availableFromLevel: 3, weight: 3 },
    [ShipType.BATTLE_SHIP]: { availableFromLevel: 4, weight: 4 },
    [ShipType.FRIGATE]: { availableFromLevel: 4, weight: 4 },
    [ShipType.TRANSPORTER]: { availableFromLevel: 3, weight: 2 },
    [ShipType.BATTLE_CRUISER]: { availableFromLevel: 6, weight: 6 },
    [ShipType.DESTROYER]: { availableFromLevel: 6, weight: 6 },
    [ShipType.DREADNOUGHT]: { availableFromLevel: 6, weight: 6 },
    [ShipType.CARRIER]: { availableFromLevel: 6, weight: 5 },
    [ShipType.CARGO_SUPPORT]: { availableFromLevel: 5, weight: 4 },
    [ShipType.MASS_HAULER]: { availableFromLevel: 5, weight: 4 },
    [ShipType.COLONIZER]: { availableFromLevel: 4, weight: 5 },
    [ShipType.TITAN]: { availableFromLevel: 7, weight: 10 },
    [ShipType.BEHEMOTH]: { availableFromLevel: 7, weight: 10 },
    [ShipType.FLEET_CARRIER]: { availableFromLevel: 8, weight: 12 },
    [ShipType.MOTHER_SHIP]: { availableFromLevel: 10, weight: 100 },
  } as const;

  static readonly BUILDING_META: Record<BuildingType, LevelMapping> = {
    [BuildingType.METAL_MINE]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.CRYSTAL_MINE]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.DEUTERIUM_SYNTHESIZER]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.SOLAR_WIND_GEOTHERMAL]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.NUCLEAR_PLANT]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.FUSION_REACTOR]: { availableFromLevel: 2, weight: 1.25 },
    [BuildingType.METAL_STORAGE]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.CRYSTAL_STORAGE]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.DEUTERIUM_TANK]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.ROBOTICS_FACTORY]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.SHIPYARD]: { availableFromLevel: 2, weight: 1.25 },
    [BuildingType.RESEARCH_LAB]: { availableFromLevel: 1, weight: 1 },
    [BuildingType.ALLIANCE_DEPOT]: { availableFromLevel: 5, weight: 1.5 },
    [BuildingType.MISSILE_SILO]: { availableFromLevel: 3, weight: 1 },
    [BuildingType.NANITE_FACTORY]: { availableFromLevel: 6, weight: 2 },
    [BuildingType.TERRAFORMER]: { availableFromLevel: 6, weight: 2 },
    [BuildingType.SPACEPORT]: { availableFromLevel: 3, weight: 1 },
    [BuildingType.SENSOR_PHALANX]: { availableFromLevel: 5, weight: 2 },
    [BuildingType.JUMP_GATE]: { availableFromLevel: 7, weight: 2.5 },
    [BuildingType.INTERSTELLAR_TRADE_PORT]: { availableFromLevel: 7, weight: 2.5 },
    [BuildingType.BUNKER_NETWORK]: { availableFromLevel: 2, weight: 1 }
  } as const;

  static readonly TECH_META: Record<TechnologyType, LevelMapping> = {
    [TechnologyType.ENERGY_TECHNOLOGY]: { availableFromLevel: 1, weight: 1 },
    [TechnologyType.MATERIAL_TECHNOLOGY]: { availableFromLevel: 1, weight: 1 },
    [TechnologyType.HYPERSPACE_TECHNOLOGY]: { availableFromLevel: 2, weight: 1 },
    [TechnologyType.ESPIONAGE_TECHNOLOGY]: { availableFromLevel: 1, weight: 1 },
    [TechnologyType.COMPUTER_TECHNOLOGY]: { availableFromLevel: 1, weight: 1 },
    [TechnologyType.ASTROPHYSICS_TECHNOLOGY]: { availableFromLevel: 3, weight: 1.5 },
    [TechnologyType.ADAPTIVE_TECHNOLOGY]: { availableFromLevel: 2, weight: 1.25 },
    [TechnologyType.INTERGALACTIC_RESEARCH_NETWORK]: { availableFromLevel: 4, weight: 2 },
    [TechnologyType.GRAVITON_TECHNOLOGY]: { availableFromLevel: 7, weight: 3 },
    [TechnologyType.SHIELDING_TECHNOLOGY]: { availableFromLevel: 2, weight: 1 },
    [TechnologyType.ARMOUR_TECHNOLOGY]: { availableFromLevel: 2, weight: 1 },
    [TechnologyType.RAILGUNS_WEAPONS]: { availableFromLevel: 2, weight: 1 },
    [TechnologyType.BEAMS_WEAPONS]: { availableFromLevel: 2, weight: 1 },
    [TechnologyType.MISSILES_WEAPONS]: { availableFromLevel: 2, weight: 1 },
    [TechnologyType.FUSION_DRIVE]: { availableFromLevel: 1, weight: 1.25 },
    [TechnologyType.HYPERSPACE_DRIVE]: { availableFromLevel: 2, weight: 2 }
  } as const;

  static getShipMeta(type: ShipType): LevelMapping {
    return LevelMappings.SHIP_META[type];
  }

  static getBuildingMeta(type: BuildingType): LevelMapping {
    return LevelMappings.BUILDING_META[type];
  }

  static getTechMeta(type: TechnologyType): LevelMapping {
    return LevelMappings.TECH_META[type];
  }
}
