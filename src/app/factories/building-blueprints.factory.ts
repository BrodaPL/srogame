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
  private static readonly defaultImagePath = 'images/buildings/METAL_MINE.jpg';
  private static readonly buildingImageMap: Record<string, string> = {
    METAL_MINE: 'images/buildings/METAL_MINE.jpg',
    CRYSTAL_MINE: 'images/buildings/CRYSTAL_MINE.jpg',
    DEUTERIUM_SYNTHESIZER: 'images/buildings/DEUTERIUM_SYNTHESIZER.jpg',
    SOLAR_WIND_GEOTHERMAL: 'images/buildings/SOLAR_WIND_GEOTHERMAL.jpg',
    NUCLEAR_PLANT: 'images/buildings/NUCLEAR_PLANT.jpg',
    FUSION_REACTOR: 'images/buildings/FUSION_REACTOR.jpg',
    METAL_STORAGE: 'images/buildings/METAL_STORAGE.jpg',
    CRYSTAL_STORAGE: 'images/buildings/CRYSTAL_STORAGE.jpg',
    DEUTERIUM_TANK: 'images/buildings/DEUTERIUM_TANK.jpg',
    ROBOTICS_FACTORY: 'images/buildings/ROBOTICS_FACTORY.jpg',
    SHIPYARD: 'images/buildings/SHIPYARD.jpg',
    RESEARCH_LAB: 'images/buildings/RESEARCH_LAB.jpg',
    ALLIANCE_DEPOT: 'images/buildings/ALLIANCE_DEPOT.jpg',
    BOMB_DEPOT: 'images/buildings/BOMB_DEPOT.jpg',
    NANITE_FACTORY: 'images/buildings/NANITE_FACTORY.jpg',
    TERRAFORMER: 'images/buildings/TERRAFORMER.jpg',
    SPACEPORT: 'images/buildings/SHIPYARD.jpg',
    SENSOR_PHALANX: 'images/buildings/SENSOR_PHALANX.jpg',
    JUMP_GATE: 'images/buildings/JUMP_GATE.jpg',
    INTERSTELLAR_TRADE_PORT: 'images/buildings/INTERSTELLAR_TRADE_PORT.jpg',
    BUNKER_NETWORK: 'images/buildings/BUNKER_NETWORK.jpg'
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
