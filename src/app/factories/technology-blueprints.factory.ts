import technologyBlueprintsData from '../blueprints/technology-blueprints.json';
import { BuildingRequirement } from '../models/building-requirement';
import { BuildingType } from '../models/building-type';
import { ResourcesPack } from '../models/resources-pack';
import { TechRequirement } from '../models/tech-requirement';
import { Technology } from '../models/technology';
import { TechnologyBlueprints } from '../models/technology-blueprints';
import { TechnologyType } from '../models/technology-type';

interface TechnologyBlueprintsJson {
  technologies: TechnologyBlueprintJson[];
}

interface TechnologyBlueprintJson {
  type: string;
  cost: ResourcesPackJson[];
  energyRequired: number[];
  researchTime: number[];
  buildingRequirements: BuildingRequirementJson[];
  techRequirements: TechRequirementJson[];
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

export class TechnologyBlueprintsFactory {
  static fromDefaultJson(): TechnologyBlueprints {
    return this.fromJson(technologyBlueprintsData as TechnologyBlueprintsJson);
  }

  static fromJson(data: TechnologyBlueprintsJson): TechnologyBlueprints {
    const blueprints = new TechnologyBlueprints();

    for (const entry of data.technologies ?? []) {
      blueprints.add(this.toTechnology(entry));
    }

    return blueprints;
  }

  private static toTechnology(entry: TechnologyBlueprintJson): Technology {
    const costs = entry.cost ?? [];
    const buildingRequirements = entry.buildingRequirements ?? [];
    const techRequirements = entry.techRequirements ?? [];

    return new Technology(
      this.parseEnumKey(TechnologyType, entry.type, 'TechnologyType'),
      costs.map((cost) => new ResourcesPack(cost.metal, cost.crystal, cost.deuterium)),
      entry.energyRequired ?? [],
      entry.researchTime ?? [],
      buildingRequirements.map((requirement) => new BuildingRequirement(
        this.parseEnumKey(BuildingType, requirement.building, 'BuildingType'),
        requirement.level
      )),
      techRequirements.map((requirement) => new TechRequirement(
        this.parseEnumKey(TechnologyType, requirement.tech, 'TechnologyType'),
        requirement.level
      ))
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
