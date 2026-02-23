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
  private static readonly defaultImagePath = 'images/technologies/Energy_Technology.webp';
  private static readonly technologyImageMap: Record<string, string> = {
    ENERGY_TECHNOLOGY: 'images/technologies/Energy_Technology.webp',
    WAVE_PARTICLE_TECHNOLOGY: 'images/technologies/Laser_Technology.webp',
    MATERIAL_TECHNOLOGY: 'images/technologies/Weapons_Technology.webp',
    HYPERSPACE_TECHNOLOGY: 'images/technologies/Hyperspace_Technology.webp',
    ESPIONAGE_TECHNOLOGY: 'images/technologies/Espionage_Technology.webp',
    COMPUTER_TECHNOLOGY: 'images/technologies/Computer_Technology.webp',
    ASTROPHYSICS_TECHNOLOGY: 'images/technologies/Astrophysics_and_Expedition_Technologies.webp',
    ADAPTIVE_TECHNOLOGY: 'images/technologies/Astrophysics_and_Expedition_Technologies.webp',
    INTERGALACTIC_RESEARCH_NETWORK: 'images/technologies/Intergalactic_Research_Network.webp',
    GRAVITON_TECHNOLOGY: 'images/technologies/Graviton_Technology.webp',
    SHIELDING_TECHNOLOGY: 'images/technologies/Shielding_Technology.webp',
    ARMOUR_TECHNOLOGY: 'images/technologies/Armour_Technology.webp',
    RAILGUNS_WEAPONS: 'images/technologies/Ion_Technology.webp',
    BEAMS_WEAPONS: 'images/technologies/Laser_Technology.webp',
    MISSILES_WEAPONS: 'images/technologies/Plasma_Technology.webp',
    FUSION_DRIVE: 'images/technologies/Combustion_Drive.webp',
    HYPERSPACE_DRIVE: 'images/technologies/Hyperspace_Drive.webp'
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
