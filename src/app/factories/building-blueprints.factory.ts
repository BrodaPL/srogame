import buildingBlueprintsData from '../blueprints/building-blueprints.json';
import { Building } from '../models/building';
import { BuildingBlueprints } from '../models/building-blueprints';
import { BuildingRequirement } from '../models/building-requirement';
import { BuildingType } from '../models/building-type';
import { ResourcesPack } from '../models/resources-pack';
import { TechRequirement } from '../models/tech-requirement';
import { TechnologyType } from '../models/technology-type';

interface BuildingBlueprintsJson {
  buildings: BuildingBlueprintJson[];
}

interface BuildingBlueprintJson {
  type: string;
  description: string;
  cost: ResourcesPackJson[];
  level: number;
  currentPowerConsumption: number;
  powerConsumption: number[];
  buildingRequirements: BuildingRequirementJson[];
  techRequirements: TechRequirementJson[];
  production1: number[];
  production2: number[];
  production3: number[];
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
    const costs = entry.cost ?? [];
    const buildingRequirements = entry.buildingRequirements ?? [];
    const techRequirements = entry.techRequirements ?? [];

    return new Building(
      this.parseEnumKey(BuildingType, entry.type, 'BuildingType'),
      entry.description,
      costs.map((cost) => new ResourcesPack(cost.metal, cost.crystal, cost.deuterium)),
      entry.level,
      entry.currentPowerConsumption,
      entry.powerConsumption ?? [],
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
      entry.production3 ?? []
    );
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
