import shipBlueprintsData from '../blueprints/ship-blueprints.json';
import { BuildingRequirement } from '../models/buildings/building-requirement';
import { BuildingType } from '../models/enums/building-type';
import { HullClass } from '../models/enums/hull-class';
import { ShipPurpose } from '../models/enums/ship-purpose';
import { ShipType } from '../models/enums/ship-type';
import { ResourcesPack } from '../models/resources-pack';
import { Ship } from '../models/fleets/ship';
import { ShipBlueprints } from '../models/fleets/ship-blueprints';
import { TechRequirement } from '../models/tech/tech-requirement';
import { TechnologyType } from '../models/enums/technology-type';
import { Weapon } from '../models/fleets/weapon';
import { WeaponType } from '../models/enums/weapon-type';

interface ShipBlueprintsJson {
  ships: ShipBlueprintJson[];
}

interface ShipBlueprintJson {
  type: string;
  imagePath?: string;
  hullClass: string;
  canJump: boolean;
  size: number;
  evasionChance: number;
  hullPointsCapacity: number;
  shieldCapacity: number;
  armor: number;
  weapons: WeaponJson[];
  cargoCapacity: number;
  hangarCapacity: number;
  purposes?: string[];
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
  private static readonly shipImageMap: Partial<Record<ShipType, string>> = {
    [ShipType.FIGHTER]: 'images/ships/Light_Fighter.webp',
    [ShipType.ASSAULT_FIGHTER]: 'images/ships/Heavy_Fighter.webp',
    [ShipType.CORVETTE]: 'images/ships/Cruiser.webp',
    [ShipType.SPY_PROBE]: 'images/ships/Espionage_Probe.webp',
    [ShipType.REPAIR_DRONE]: 'images/ships/Light_Fighter.webp',
    [ShipType.CRUISER]: 'images/ships/Cruiser.webp',
    [ShipType.BATTLE_SHIP]: 'images/ships/Battleship.webp',
    [ShipType.FRIGATE]: 'images/ships/Battlecruiser.webp',
    [ShipType.TRANSPORTER]: 'images/ships/Small_Cargo.webp',
    [ShipType.BATTLE_CRUISER]: 'images/ships/Battlecruiser.webp',
    [ShipType.DESTROYER]: 'images/ships/Destroyer.webp',
    [ShipType.DREADNOUGHT]: 'images/ships/Death_Star.webp',
    [ShipType.CARRIER]: 'images/ships/Reaper.webp',
    [ShipType.CARGO_SUPPORT]: 'images/ships/Large_Cargo.webp',
    [ShipType.MASS_HAULER]: 'images/ships/Large_Cargo.webp',
    [ShipType.COLONIZER]: 'images/ships/Colony_Ship.webp',
    [ShipType.TITAN]: 'images/ships/Death_Star.webp',
    [ShipType.BEHEMOTH]: 'images/ships/Death_Star.webp',
    [ShipType.FLEET_CARRIER]: 'images/ships/Pathfinder.webp',
    [ShipType.MOTHER_SHIP]: 'images/ships/Death_Star.webp'
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
    const type = this.parseEnumKey(ShipType, entry.type, 'ShipType');
    const imagePath = this.resolveImagePath(entry, type);

    return new Ship(
      type,
      imagePath,
      this.parseEnumKey(HullClass, entry.hullClass, 'HullClass'),
      entry.canJump,
      entry.size,
      entry.evasionChance ?? 0,
      entry.hullPointsCapacity,
      entry.shieldCapacity,
      entry.armor,
      weapons.map((weapon) => new Weapon(
        this.parseEnumKey(WeaponType, weapon.type, 'WeaponType'),
        weapon.dmg,
        weapon.shots
      )),
      entry.cargoCapacity,
      entry.hangarCapacity,
      new Set((entry.purposes ?? []).map((purpose) => this.parseEnumKey(ShipPurpose, purpose, 'ShipPurpose'))),
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

  private static resolveImagePath(entry: ShipBlueprintJson, type: ShipType): string {
    if (entry.imagePath && entry.imagePath.trim().length > 0) {
      return entry.imagePath;
    }

    return this.shipImageMap[type] ?? this.defaultImagePath;
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
