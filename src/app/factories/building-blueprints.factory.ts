import buildingBlueprintsData from '../blueprints/building-blueprints.json';
import { Building } from '../models/buildings/building';
import { BuildingBlueprints } from '../models/buildings/building-blueprints';
import { BuildingRequirement } from '../models/buildings/building-requirement';
import { BuildingType } from '../models/enums/building-type';
import { ResourcesPack } from '../models/resources-pack';
import { TechRequirement } from '../models/tech/tech-requirement';
import { TechnologyType } from '../models/enums/technology-type';

interface BuildingBlueprintsJson {
  buildings: BuildingBlueprintJson[];
}

interface BuildingBlueprintJson {
  type: string;
  description: string;
  imagePath?: string;
  basicCost: ResourcesPackJson;
  level: number;
  currentPowerConsumption: number;
  powerConsumption: number;
  isFacility: boolean;
  buildingRequirements: BuildingRequirementJson[];
  techRequirements: TechRequirementJson[];
  production1: number[];
  production2: number[];
  production3: number[];
  armor?: number;
  damageMultiplier?: number;
}

interface ResourcesPackJson {
  metal: number;
  crystal: number;
  deuterium: number;
}

interface BuildingRequirementJson {
  building: string;
  level: number;
}

interface TechRequirementJson {
  tech: string;
  level: number;
}

export class BuildingBlueprintsFactory {
  private static readonly defaultImagePath = 'images/buildings/Metal_Mine.webp';
  private static readonly buildingImageMap: Record<string, string> = {
    METAL_MINE: 'images/buildings/Metal_Mine.webp',
    CRYSTAL_MINE: 'images/buildings/CrystalMine.webp',
    DEUTERIUM_SYNTHESIZER: 'images/buildings/Deuterium_Synthesizer.webp',
    SOLAR_WIND_GEOTHERMAL: 'images/buildings/Solar_Plant.webp',
    NUCLEAR_PLANT: 'images/buildings/Fusion_Reactor.webp',
    FUSION_REACTOR: 'images/buildings/Fusion_Reactor.webp',
    METAL_STORAGE: 'images/buildings/Metal_Storage.webp',
    CRYSTAL_STORAGE: 'images/buildings/Crystal_Storage.webp',
    DEUTERIUM_TANK: 'images/buildings/Deuterium_Tank.webp',
    ROBOTICS_FACTORY: 'images/buildings/Robotics_Factory.webp',
    SHIPYARD: 'images/buildings/Shipyard.webp',
    RESEARCH_LAB: 'images/buildings/Research_Lab.webp',
    ALLIANCE_DEPOT: 'images/buildings/Alliance_Depot.webp',
    MISSILE_SILO: 'images/buildings/Missile_Silo.webp',
    NANITE_FACTORY: 'images/buildings/Nanite_Factory.webp',
    TERRAFORMER: 'images/buildings/Terraformer.webp',
    SPACEPORT: 'images/buildings/Space_Dock.webp',
    SENSOR_PHALANX: 'images/buildings/Sensor_Phalanx.webp',
    JUMP_GATE: 'images/buildings/Jump_Gate.webp',
    INTERSTELLAR_TRADE_PORT: 'images/buildings/Shipyard.webp',
    BUNKER_NETWORK: 'images/buildings/Metal_Storage.webp'
  };

  static fromDefaultJson(): BuildingBlueprints {
    return this.fromJson(buildingBlueprintsData as BuildingBlueprintsJson);
  }

  static fromJson(data: BuildingBlueprintsJson): BuildingBlueprints {
    const blueprints = new BuildingBlueprints();

    for (const entry of data.buildings ?? []) {
      blueprints.add(this.toBuilding(entry));
    }

    return blueprints;
  }

  private static toBuilding(entry: BuildingBlueprintJson): Building {
    const cost = entry.basicCost ?? { metal: 0, crystal: 0, deuterium: 0 };
    const buildingRequirements = entry.buildingRequirements ?? [];
    const techRequirements = entry.techRequirements ?? [];
    const imagePath = this.resolveImagePath(entry);

    return new Building(
      this.parseEnumKey(BuildingType, entry.type, 'BuildingType'),
      entry.description,
      imagePath,
      new ResourcesPack(cost.metal, cost.crystal, cost.deuterium),
      entry.level,
      entry.currentPowerConsumption,
      entry.powerConsumption ?? 0,
      entry.isFacility ?? false,
      buildingRequirements.map((requirement) => new BuildingRequirement(
        this.parseEnumKey(BuildingType, requirement.building, 'BuildingType'),
        requirement.level
      )),
      techRequirements.map((requirement) => new TechRequirement(
        this.parseEnumKey(TechnologyType, requirement.tech, 'TechnologyType'),
        requirement.level
      )),
      entry.production1 ?? [],
      entry.production2 ?? [],
      entry.production3 ?? [],
      entry.armor ?? 0,
      entry.damageMultiplier ?? 1
    );
  }

  private static resolveImagePath(entry: BuildingBlueprintJson): string {
    if (entry.imagePath && entry.imagePath.trim().length > 0) {
      return entry.imagePath;
    }

    return this.buildingImageMap[entry.type] ?? this.defaultImagePath;
  }

  private static parseEnumKey<T extends string>(
    enumObject: Record<string, T>,
    key: string,
    label: string
  ): T {
    if (key in enumObject) {
      return enumObject[key];
    }

    throw new Error(`Unknown ${label} key: ${key}`);
  }
}
