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
  criticalThreshold: number;
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
  private static readonly defaultImagePath = 'images/ships/FIGHTER.jpg';
  private static readonly shipImageMap: Partial<Record<ShipType, string>> = {
    [ShipType.FIGHTER]: 'images/ships/FIGHTER.jpg',
    [ShipType.ASSAULT_FIGHTER]: 'images/ships/ASSAULT_FIGHTER.jpg',
    [ShipType.ATMOSPHERIC_FIGHTER]: 'images/ships/ATMOSPHERIC_FIGHTER.jpg',
    [ShipType.ATMOSPHERIC_BOMBER]: 'images/ships/ATMOSPHERIC_BOMBER.jpg',
    [ShipType.CORVETTE]: 'images/ships/CORVETE.jpg',
    [ShipType.SPY_PROBE]: 'images/ships/SPY_PROBE.jpg',
    [ShipType.REPAIR_DRONE]: 'images/ships/REPAIR_DRONE.jpg',
    [ShipType.RECYCLER]: 'images/ships/RECYCLER.jpg',
    [ShipType.CRUISER]: 'images/ships/CRUISER.jpg',
    [ShipType.BATTLE_SHIP]: 'images/ships/BATTLE_SHIP.jpg',
    [ShipType.FRIGATE]: 'images/ships/FRIGATE.jpg',
    [ShipType.TRANSPORTER]: 'images/ships/TRANSPORTER.jpg',
    [ShipType.BATTLE_CRUISER]: 'images/ships/BATTLE_CRUISER.jpg',
    [ShipType.DESTROYER]: 'images/ships/DESTROYER.jpg',
    [ShipType.DREADNOUGHT]: 'images/ships/DREADNOUGHT.jpg',
    [ShipType.ORBITAL_BOMBER]: 'images/ships/ORBITAL_BOMBER.jpg',
    [ShipType.CARRIER]: 'images/ships/CARRIER.jpg',
    [ShipType.CARGO_SUPPORT]: 'images/ships/CARGO_SUPPORT.jpg',
    [ShipType.MASS_HAULER]: 'images/ships/MASS_HAULER.jpg',
    [ShipType.COLONIZER]: 'images/ships/COLONIZER.jpg',
    [ShipType.TITAN]: 'images/ships/TITAN.jpg',
    [ShipType.ARMAGEDDON_BOMBER]: 'images/ships/ARMAGEDDON_BOMBER.jpg',
    [ShipType.BEHEMOTH]: 'images/ships/BEHEMOTH.jpg',
    [ShipType.FLEET_CARRIER]: 'images/ships/FLEET_CARRIER.jpg',
    [ShipType.MOTHER_SHIP]: 'images/ships/MOTHER_SHIP.jpg'
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
      entry.criticalThreshold,
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
