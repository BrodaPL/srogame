import defenceBlueprintsData from '../blueprints/defence-blueprints.json';
import { BuildingRequirement } from '../models/buildings/building-requirement';
import { DefenceBlueprints } from '../models/defences/defence-blueprints';
import { Defence } from '../models/defences/defence';
import { BuildingType } from '../models/enums/building-type';
import { DefenceType } from '../models/enums/defence-type';
import { HullClass } from '../models/enums/hull-class';
import { WeaponType } from '../models/enums/weapon-type';
import { Weapon } from '../models/fleets/weapon';
import { ResourcesPack } from '../models/resources-pack';
import { TechnologyType } from '../models/enums/technology-type';
import { TechRequirement } from '../models/tech/tech-requirement';

interface DefenceBlueprintsJson {
  defences: DefenceBlueprintJson[];
}

interface DefenceBlueprintJson {
  type: string;
  imagePath?: string;
  hullClass: string;
  canShootToOrbit: boolean;
  size: number;
  hullPointsCapacity: number;
  criticalThreshold: number;
  shieldCapacity: number;
  armor: number;
  weapons: WeaponJson[];
  cost: ResourcesPackJson;
  buildingRequirements: BuildingRequirementJson[];
  techRequirements: TechRequirementJson[];
}

interface WeaponJson {
  type: string;
  dmg: number;
  shots: number;
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

export class DefenceBlueprintsFactory {
  private static readonly defaultImagePath = 'images/ships/Destroyer.webp';
  private static readonly defenceImageMap: Partial<Record<DefenceType, string>> = {
    [DefenceType.LIGHT_BEAM_CANNON]: 'images/ships/Destroyer.webp',
    [DefenceType.BEAM_CANNON]: 'images/ships/Destroyer.webp',
    [DefenceType.HEAVY_BEAM_CANNON]: 'images/ships/Battleship.webp',
    [DefenceType.SAM_SITE]: 'images/ships/Heavy_Fighter.webp',
    [DefenceType.ORBITAL_MISSILE_LAUNCHER]: 'images/ships/Destroyer.webp',
    [DefenceType.HEAVY_ORBITAL_MISSILE_LAUNCHER]: 'images/ships/Battleship.webp',
    [DefenceType.RAIL_GUN_CANNON]: 'images/ships/Death_Star.webp',
    [DefenceType.SMALL_BOMB]: 'images/ships/Bomber.webp',
    [DefenceType.CLUSTER_BOMB]: 'images/ships/Bomber.webp',
    [DefenceType.MEDIUM_BOMB]: 'images/ships/Bomber (1).webp',
    [DefenceType.HEAVY_BOMB]: 'images/ships/Bomber (1).webp'
  };

  static fromDefaultJson(): DefenceBlueprints {
    return this.fromJson(defenceBlueprintsData as DefenceBlueprintsJson);
  }

  static fromJson(data: DefenceBlueprintsJson): DefenceBlueprints {
    const blueprints = new DefenceBlueprints();

    for (const entry of data.defences ?? []) {
      blueprints.add(this.toDefence(entry));
    }

    return blueprints;
  }

  private static toDefence(entry: DefenceBlueprintJson): Defence {
    const type = this.parseEnumKey(DefenceType, entry.type, 'DefenceType');

    return new Defence(
      type,
      this.resolveImagePath(entry, type),
      this.parseEnumKey(HullClass, entry.hullClass, 'HullClass'),
      !!entry.canShootToOrbit,
      entry.size,
      entry.hullPointsCapacity,
      entry.criticalThreshold,
      entry.shieldCapacity,
      entry.armor,
      (entry.weapons ?? []).map((weapon) => new Weapon(
        this.parseEnumKey(WeaponType, weapon.type, 'WeaponType'),
        weapon.dmg,
        weapon.shots
      )),
      new ResourcesPack(entry.cost.metal, entry.cost.crystal, entry.cost.deuterium),
      (entry.buildingRequirements ?? []).map((requirement) => new BuildingRequirement(
        this.parseEnumKey(BuildingType, requirement.building, 'BuildingType'),
        requirement.level
      )),
      (entry.techRequirements ?? []).map((requirement) => new TechRequirement(
        this.parseEnumKey(TechnologyType, requirement.tech, 'TechnologyType'),
        requirement.level
      ))
    );
  }

  private static resolveImagePath(entry: DefenceBlueprintJson, type: DefenceType): string {
    if (entry.imagePath && entry.imagePath.trim().length > 0) {
      return entry.imagePath;
    }

    return this.defenceImageMap[type] ?? this.defaultImagePath;
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
