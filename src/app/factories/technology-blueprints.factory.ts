import technologyBlueprintsData from '../blueprints/technology-blueprints.json';
import { BuildingRequirement } from '../models/buildings/building-requirement';
import { BuildingType } from '../models/enums/building-type';
import { ResourcesPack } from '../models/resources-pack';
import { TechRequirement } from '../models/tech/tech-requirement';
import { Technology } from '../models/tech/technology';
import { TechnologyBlueprints } from '../models/tech/technology-blueprints';
import { TechnologyType } from '../models/enums/technology-type';

interface TechnologyBlueprintsJson {
  technologies: TechnologyBlueprintJson[];
}

interface TechnologyBlueprintJson {
  type: string;
  imagePath?: string;
  description?: string;
  basicCost: ResourcesPackJson;
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
  private static readonly defaultImagePath = 'images/technologies/normal/ENERGY_TECHNOLOGY.jpg';
  private static readonly technologyImageMap: Record<string, string> = {
    ENERGY_TECHNOLOGY: 'images/technologies/normal/ENERGY_TECHNOLOGY.jpg',
    WAVE_PARTICLE_TECHNOLOGY: 'images/technologies/normal/BEAMS_WEAPONS.jpg',
    MATERIAL_TECHNOLOGY: 'images/technologies/normal/MATERIAL_TECHNOLOGY.jpg',
    HYPERSPACE_TECHNOLOGY: 'images/technologies/normal/HYPERSPACE_TECHNOLOGY.jpg',
    ESPIONAGE_TECHNOLOGY: 'images/technologies/normal/ESPIONAGE_TECHNOLOGY.jpg',
    COMPUTER_TECHNOLOGY: 'images/technologies/normal/COMPUTER_TECHNOLOGY.jpg',
    ASTROPHYSICS_TECHNOLOGY: 'images/technologies/normal/ASTROPHYSICS_TECHNOLOGY.jpg',
    ADAPTIVE_TECHNOLOGY: 'images/technologies/normal/ADAPTIVE_TECHNOLOGY.jpg',
    INTERGALACTIC_RESEARCH_NETWORK: 'images/technologies/normal/INTERGALACTIC_RESEARCH_NETWORK.jpg',
    GRAVITON_TECHNOLOGY: 'images/technologies/normal/GRAVITON_TECHNOLOGY.jpg',
    SHIELDING_TECHNOLOGY: 'images/technologies/normal/SHIELDING_TECHNOLOGY.jpg',
    ARMOUR_TECHNOLOGY: 'images/technologies/normal/ARMOUR_TECHNOLOGY.jpg',
    RAILGUNS_WEAPONS: 'images/technologies/normal/RAILGUNS_WEAPONS.jpg',
    BEAMS_WEAPONS: 'images/technologies/normal/BEAMS_WEAPONS.jpg',
    MISSILES_WEAPONS: 'images/technologies/normal/MISSILES_WEAPONS.jpg',
    FUSION_DRIVE: 'images/technologies/normal/FUSION_DRIVE.jpg',
    HYPERSPACE_DRIVE: 'images/technologies/normal/HYPERSPACE_DRIVE.jpg'
  };

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
    const cost = entry.basicCost ?? { metal: 0, crystal: 0, deuterium: 0 };
    const buildingRequirements = entry.buildingRequirements ?? [];
    const techRequirements = entry.techRequirements ?? [];
    const imagePath = this.resolveImagePath(entry);

    return new Technology(
      this.parseEnumKey(TechnologyType, entry.type, 'TechnologyType'),
      imagePath,
      entry.description ?? '',
      new ResourcesPack(cost.metal, cost.crystal, cost.deuterium),
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

  private static resolveImagePath(entry: TechnologyBlueprintJson): string {
    if (entry.imagePath && entry.imagePath.trim().length > 0) {
      return entry.imagePath;
    }

    return this.technologyImageMap[entry.type] ?? this.defaultImagePath;
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
