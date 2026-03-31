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
  private static readonly defaultImagePath = 'images/ships/normal/FIGHTER.jpg';
  private static readonly shipImageMap: Partial<Record<ShipType, string>> = {
    [ShipType.FIGHTER]: 'images/ships/normal/FIGHTER.jpg',
    [ShipType.ASSAULT_FIGHTER]: 'images/ships/normal/ASSAULT_FIGHTER.jpg',
    [ShipType.ATMOSPHERIC_FIGHTER]: 'images/ships/normal/ATMOSPHERIC_FIGHTER.jpg',
    [ShipType.ATMOSPHERIC_BOMBER]: 'images/ships/normal/ATMOSPHERIC_BOMBER.jpg',
    [ShipType.CORVETTE]: 'images/ships/normal/CORVETE.jpg',
    [ShipType.SPY_PROBE]: 'images/ships/normal/SPY_PROBE.jpg',
    [ShipType.REPAIR_DRONE]: 'images/ships/normal/REPAIR_DRONE.jpg',
    [ShipType.RECYCLER]: 'images/ships/normal/RECYCLER.jpg',
    [ShipType.CRUISER]: 'images/ships/normal/CRUISER.jpg',
    [ShipType.BATTLE_SHIP]: 'images/ships/normal/BATTLE_SHIP.jpg',
    [ShipType.FRIGATE]: 'images/ships/normal/FRIGATE.jpg',
    [ShipType.TRANSPORTER]: 'images/ships/normal/TRANSPORTER.jpg',
    [ShipType.BATTLE_CRUISER]: 'images/ships/normal/BATTLE_CRUISER.jpg',
    [ShipType.DESTROYER]: 'images/ships/normal/DESTROYER.jpg',
    [ShipType.DREADNOUGHT]: 'images/ships/normal/DREADNOUGHT.jpg',
    [ShipType.ORBITAL_BOMBER]: 'images/ships/normal/ORBITAL_BOMBER.jpg',
    [ShipType.CARRIER]: 'images/ships/normal/CARRIER.jpg',
    [ShipType.CARGO_SUPPORT]: 'images/ships/normal/CARGO_SUPPORT.jpg',
    [ShipType.MASS_HAULER]: 'images/ships/normal/MASS_HAULER.jpg',
    [ShipType.COLONIZER]: 'images/ships/normal/COLONIZER.jpg',
    [ShipType.TITAN]: 'images/ships/normal/TITAN.jpg',
    [ShipType.ARMAGEDDON_BOMBER]: 'images/ships/normal/ARMAGEDDON_BOMBER.jpg',
    [ShipType.BEHEMOTH]: 'images/ships/normal/BEHEMOTH.jpg',
    [ShipType.FLEET_CARRIER]: 'images/ships/normal/FLEET_CARRIER.jpg',
    [ShipType.MOTHER_SHIP]: 'images/ships/normal/MOTHER_SHIP.jpg'
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
