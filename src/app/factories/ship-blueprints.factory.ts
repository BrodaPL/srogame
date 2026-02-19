import shipBlueprintsData from '../blueprints/ship-blueprints.json';
import { BuildingRequirement } from '../models/building-requirement';
import { BuildingType } from '../models/enum/building-type';
import { HullClass } from '../models/enum/hull-class';
import { ResourcesPack } from '../models/resources-pack';
import { Ship } from '../models/ship';
import { ShipBlueprints } from '../models/ship-blueprints';
import { TechRequirement } from '../models/tech-requirement';
import { TechnologyType } from '../models/enum/technology-type';
import { Weapon } from '../models/weapon';
import { WeaponType } from '../models/enum/weapon-type';

interface ShipBlueprintsJson {
  ships: ShipBlueprintJson[];
}

interface ShipBlueprintJson {
  name: string;
  imagePath?: string;
  hullClass: string;
  canJump: boolean;
  size: number;
  evasionChance: number;
  hullPointsCapacity: number;
  shieldCapacity: number;
  defense: number;
  weapons: WeaponJson[];
  cargoCapacity: number;
  hangarCapacity: number;
  jumpCost: number;
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

export class ShipBlueprintsFactory {
  private static readonly defaultImagePath = 'images/ships/Light_Fighter.webp';
  private static readonly shipImageMap: Record<string, string> = {
    'Fighter': 'images/ships/Light_Fighter.webp',
    'Assualt Fighter': 'images/ships/Heavy_Fighter.webp',
    'Corvet': 'images/ships/Cruiser.webp',
    'Spy Prob': 'images/ships/Espionage_Probe.webp',
    'Cruser': 'images/ships/Cruiser.webp',
    'Battle Ship': 'images/ships/Battleship.webp',
    'Frigate': 'images/ships/Battlecruiser.webp',
    'Transporter': 'images/ships/Small_Cargo.webp',
    'Battle Cruser': 'images/ships/Battlecruiser.webp',
    'Destroyer': 'images/ships/Destroyer.webp',
    'Dreadnoth': 'images/ships/Death_Star.webp',
    'Carrier': 'images/ships/Reaper.webp',
    'Cargo Support': 'images/ships/Large_Cargo.webp',
    'Mass Hauler': 'images/ships/Large_Cargo.webp',
    'Colonizer': 'images/ships/Colony_Ship.webp',
    'Titan': 'images/ships/Death_Star.webp',
    'Bechemoth': 'images/ships/Death_Star.webp',
    'Fleet Carrier': 'images/ships/Pathfinder.webp'
  };

  static fromDefaultJson(): ShipBlueprints {
    return this.fromJson(shipBlueprintsData as ShipBlueprintsJson);
  }

  static fromJson(data: ShipBlueprintsJson): ShipBlueprints {
    const blueprints = new ShipBlueprints();

    for (const entry of data.ships ?? []) {
      blueprints.add(this.toShip(entry));
    }

    return blueprints;
  }

  private static toShip(entry: ShipBlueprintJson): Ship {
    const weapons = entry.weapons ?? [];
    const buildingRequirements = entry.buildingRequirements ?? [];
    const techRequirements = entry.techRequirements ?? [];
    const imagePath = this.resolveImagePath(entry);

    return new Ship(
      entry.name,
      imagePath,
      this.parseEnumKey(HullClass, entry.hullClass, 'HullClass'),
      entry.canJump,
      entry.size,
      entry.evasionChance ?? 0,
      entry.hullPointsCapacity,
      entry.shieldCapacity,
      entry.defense,
      weapons.map((weapon) => new Weapon(
        this.parseEnumKey(WeaponType, weapon.type, 'WeaponType'),
        weapon.dmg,
        weapon.shots
      )),
      entry.cargoCapacity,
      entry.hangarCapacity,
      entry.jumpCost,
      new ResourcesPack(entry.cost.metal, entry.cost.crystal, entry.cost.deuterium),
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

  private static resolveImagePath(entry: ShipBlueprintJson): string {
    if (entry.imagePath && entry.imagePath.trim().length > 0) {
      return entry.imagePath;
    }

    return this.shipImageMap[entry.name] ?? this.defaultImagePath;
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

