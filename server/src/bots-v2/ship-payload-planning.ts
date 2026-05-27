import * as buildingTypeModule from '../../../src/app/models/enums/building-type.js';
import * as shipPurposeModule from '../../../src/app/models/enums/ship-purpose.js';
import * as shipTypeModule from '../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../src/app/models/enums/technology-type.js';
import * as weaponTypeModule from '../../../src/app/models/enums/weapon-type.js';
import type { BotPlanetSnapshot } from './bot-v2-types.ts';
import { SHIP_BLUEPRINTS } from '../game-commands/command-helpers.js';
import { resolveModule } from '../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../src/app/models/enums/building-type.js');
const { ShipPurpose } = resolveModule(shipPurposeModule) as typeof import('../../../src/app/models/enums/ship-purpose.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../src/app/models/enums/technology-type.js');
const { WeaponType } = resolveModule(weaponTypeModule) as typeof import('../../../src/app/models/enums/weapon-type.js');

type BuildingTypeT = buildingTypeModule.BuildingType;
type ShipPurposeT = shipPurposeModule.ShipPurpose;
type ShipTypeT = shipTypeModule.ShipType;
type TechnologyTypeT = technologyTypeModule.TechnologyType;

export type ShipSelectionEntry = {
  type: ShipTypeT;
  undamagedAmount: number;
  damagedAmount: number;
};

export type SmallPayloadRole = 'SMALL_COMBAT' | 'SMALL_BOMBER';

export type SmallPayloadCandidate = {
  type: ShipTypeT;
  amount: number;
  size: number;
  power: number;
};

export function isMilitaryHangarShipType(shipType: ShipTypeT): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  return Boolean(
    blueprint
    && blueprint.canJump
    && blueprint.weapons.length > 0
    && blueprint.hangarCapacity > 0
    && isStrategicWarshipType(shipType)
  );
}

export function isStrategicWarshipType(shipType: ShipTypeT): boolean {
  return shipType !== ShipType.SPY_PROBE
    && shipType !== ShipType.REPAIR_DRONE
    && shipType !== ShipType.COLONIZER
    && shipType !== ShipType.TRANSPORTER
    && shipType !== ShipType.CARGO_SUPPORT
    && shipType !== ShipType.MASS_HAULER
    && shipType !== ShipType.RECYCLER;
}

export function isSmallCombatShipType(shipType: ShipTypeT): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  return Boolean(
    blueprint
    && !blueprint.canJump
    && blueprint.size > 0
    && blueprint.weapons.length > 0
    && blueprint.purposes.has(ShipPurpose.MILITARY as ShipPurposeT)
  );
}

export function isSmallBomberShipType(shipType: ShipTypeT): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  return Boolean(
    blueprint
    && isSmallCombatShipType(shipType)
    && (
      blueprint.purposes.has(ShipPurpose.BOMBER as ShipPurposeT)
      || shipTypeHasBombardmentWeapons(shipType)
    )
  );
}

export function shipTypeHasBombardmentWeapons(shipType: ShipTypeT): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  return Boolean(blueprint?.weapons.some((weapon) => weapon.type === WeaponType.BOMBARDMENT_WEAPONS));
}

export function estimateShipCombatPower(shipType: ShipTypeT): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

export function estimateShipAntiFleetPower(shipType: ShipTypeT): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const antiShipWeaponPower = blueprint.weapons
    .filter((weapon) => weapon.type !== WeaponType.BOMBARDMENT_WEAPONS)
    .reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  const survivability = (blueprint.hullPointsCapacity / 18) + (blueprint.shieldCapacity / 12) + (blueprint.armor * 2);
  return antiShipWeaponPower + survivability;
}

export function estimateShipCountsAntiFleetStrength(counts: Partial<Record<ShipTypeT, number>>): number {
  return Object.entries(counts).reduce(
    (sum, [shipType, amount]) => sum + (estimateShipAntiFleetPower(shipType as ShipTypeT) * Math.max(0, amount ?? 0)),
    0
  );
}

export function estimateSelectionAntiFleetStrength(selection: ShipSelectionEntry[]): number {
  return selection.reduce((sum, ship) =>
    sum + (estimateShipAntiFleetPower(ship.type) * (ship.undamagedAmount + ship.damagedAmount)), 0);
}

export function resolveOriginSmallPayloadCandidates(
  originPlanet: BotPlanetSnapshot,
  role: SmallPayloadRole
): SmallPayloadCandidate[] {
  return Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => ({
      type: type as ShipTypeT,
      amount: amount ?? 0,
      blueprint: SHIP_BLUEPRINTS.get(type as ShipTypeT) ?? null
    }))
    .filter((entry) =>
      entry.amount > 0
      && entry.blueprint !== null
      && isSmallCombatShipType(entry.type)
      && (role === 'SMALL_COMBAT' || isSmallBomberShipType(entry.type))
    )
    .map((entry) => ({
      type: entry.type,
      amount: entry.amount,
      size: Math.max(1, entry.blueprint?.size ?? 1),
      power: estimateShipCombatPower(entry.type)
    }))
    .sort((left, right) =>
      resolveSmallPayloadPriority(right.type, role) - resolveSmallPayloadPriority(left.type, role)
      || right.power - left.power
      || left.size - right.size
      || left.type.localeCompare(right.type)
    );
}

export function resolveSelectionHangarCapacity(selection: ShipSelectionEntry[]): number {
  return selection.reduce((sum, ship) => {
    const blueprint = SHIP_BLUEPRINTS.get(ship.type);
    if (!blueprint || blueprint.hangarCapacity <= 0) {
      return sum;
    }
    return sum + (blueprint.hangarCapacity * (ship.undamagedAmount + ship.damagedAmount));
  }, 0);
}

export function resolveSelectionPayloadSize(selection: ShipSelectionEntry[]): number {
  return selection.reduce((sum, ship) => {
    const blueprint = SHIP_BLUEPRINTS.get(ship.type);
    if (!blueprint || blueprint.canJump || blueprint.size <= 0) {
      return sum;
    }
    return sum + (blueprint.size * (ship.undamagedAmount + ship.damagedAmount));
  }, 0);
}

export function resolveMilitaryHangarCapacity(originPlanet: BotPlanetSnapshot): number {
  return Object.entries(originPlanet.ships.undamagedCountByType).reduce((sum, [shipType, amount]) => {
    const blueprint = SHIP_BLUEPRINTS.get(shipType as ShipTypeT);
    if (!blueprint || !isMilitaryHangarShipType(shipType as ShipTypeT)) {
      return sum;
    }
    return sum + (blueprint.hangarCapacity * (amount ?? 0));
  }, 0);
}

export function resolveLargestMilitaryHangarCapacity(originPlanet: BotPlanetSnapshot): number {
  return Object.entries(originPlanet.ships.undamagedCountByType).reduce((largest, [shipType, amount]) => {
    const blueprint = SHIP_BLUEPRINTS.get(shipType as ShipTypeT);
    if (!blueprint || !isMilitaryHangarShipType(shipType as ShipTypeT) || (amount ?? 0) <= 0) {
      return largest;
    }
    return Math.max(largest, blueprint.hangarCapacity);
  }, 0);
}

export function resolveSmallPayloadStock(originPlanet: BotPlanetSnapshot): {
  totalSize: number;
  bomberSize: number;
  generalSize: number;
} {
  let totalSize = 0;
  let bomberSize = 0;
  let generalSize = 0;

  for (const [shipType, amount] of Object.entries(originPlanet.ships.undamagedCountByType)) {
    const typedShipType = shipType as ShipTypeT;
    const blueprint = SHIP_BLUEPRINTS.get(typedShipType);
    if (!blueprint || !isSmallCombatShipType(typedShipType)) {
      continue;
    }

    const size = blueprint.size * (amount ?? 0);
    totalSize += size;
    if (isSmallBomberShipType(typedShipType)) {
      bomberSize += size;
    } else {
      generalSize += size;
    }
  }

  return { totalSize, bomberSize, generalSize };
}

export function addSmallPayloadFromCandidates(
  selection: ShipSelectionEntry[],
  candidates: SmallPayloadCandidate[],
  availableHangar: number,
  desiredPayloadSize: number
): { addedStrength: number; addedSize: number } {
  let remainingHangar = availableHangar;
  let remainingDesiredSize = Math.max(1, desiredPayloadSize);
  let addedStrength = 0;
  let addedSize = 0;

  for (const candidate of candidates) {
    if (candidate.amount <= 0 || candidate.size <= 0 || remainingHangar < candidate.size || remainingDesiredSize <= 0) {
      continue;
    }

    const amountToAdd = Math.min(
      candidate.amount,
      Math.floor(remainingHangar / candidate.size),
      Math.max(1, Math.ceil(remainingDesiredSize / candidate.size))
    );
    if (amountToAdd <= 0) {
      continue;
    }

    const existing = selection.find((ship) => ship.type === candidate.type);
    if (existing) {
      existing.undamagedAmount += amountToAdd;
    } else {
      selection.push({
        type: candidate.type,
        undamagedAmount: amountToAdd,
        damagedAmount: 0
      });
    }

    const usedSize = amountToAdd * candidate.size;
    remainingHangar -= usedSize;
    remainingDesiredSize -= usedSize;
    addedSize += usedSize;
    addedStrength += candidate.power * amountToAdd;
  }

  return { addedStrength, addedSize };
}

export function resolveBestProducibleSmallShipType(
  planets: BotPlanetSnapshot[],
  role: SmallPayloadRole,
  preferredOrigin: BotPlanetSnapshot | null
): ShipTypeT | null {
  const candidates = new Map<ShipTypeT, number>();
  const maxMilitaryHangarCapacity = Math.max(
    0,
    ...planets.map((planet) => resolveLargestMilitaryHangarCapacity(planet))
  );

  for (const planet of planets) {
    for (const [shipType, blueprint] of SHIP_BLUEPRINTS.shipsMap.entries()) {
      if (!snapshotCanProduceShip(planet, shipType)) {
        continue;
      }
      if (!isShipTypeEligibleForSmallRole(shipType, role, maxMilitaryHangarCapacity)) {
        continue;
      }

      const localOriginBonus = preferredOrigin
        && planet.coordinates.x === preferredOrigin.coordinates.x
        && planet.coordinates.y === preferredOrigin.coordinates.y
        && planet.coordinates.z === preferredOrigin.coordinates.z
        ? 250
        : 0;
      const score = localOriginBonus
        + resolveSmallPayloadPriority(shipType, role)
        + estimateShipCombatPower(shipType)
        - ((blueprint.cost.metal + blueprint.cost.crystal + blueprint.cost.deuterium) / 100);
      const previous = candidates.get(shipType) ?? -1;
      if (score > previous) {
        candidates.set(shipType, score);
      }
    }
  }

  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

export function resolveSmallPayloadPriority(shipType: ShipTypeT, role: SmallPayloadRole): number {
  if (role === 'SMALL_BOMBER') {
    if (shipType === ShipType.ATMOSPHERIC_BOMBER) {
      return 10_000;
    }
    if (shipType === ShipType.ATMOSPHERIC_FIGHTER) {
      return 9_000;
    }
  }

  if (shipType === ShipType.ASSAULT_FIGHTER) {
    return 8_000;
  }
  if (shipType === ShipType.FIGHTER) {
    return 7_000;
  }
  if (shipType === ShipType.CORVETTE) {
    return 6_000;
  }
  return 1_000 + estimateShipCombatPower(shipType);
}

export function snapshotCanProduceShip(planet: BotPlanetSnapshot, shipType: ShipTypeT): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return false;
  }

  for (const requirement of blueprint.buildingRequirements) {
    if (getBuildingLevel(planet, requirement.building) < Math.ceil(requirement.level)) {
      return false;
    }
  }
  for (const requirement of blueprint.techRequirements) {
    if (getTechnologyLevel(planet, requirement.tech) < Math.ceil(requirement.level)) {
      return false;
    }
  }
  return true;
}

function isShipTypeEligibleForSmallRole(
  shipType: ShipTypeT,
  role: SmallPayloadRole,
  maxMilitaryHangarCapacity: number
): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint || !isSmallCombatShipType(shipType)) {
    return false;
  }
  if (shipType === ShipType.CORVETTE && maxMilitaryHangarCapacity <= 1) {
    return false;
  }
  if (blueprint.size > Math.max(1, maxMilitaryHangarCapacity)) {
    return false;
  }
  return role === 'SMALL_COMBAT' || isSmallBomberShipType(shipType);
}

function getBuildingLevel(planet: BotPlanetSnapshot, buildingType: BuildingTypeT): number {
  switch (buildingType) {
    case BuildingType.METAL_MINE:
      return planet.economy.metalMineLevel;
    case BuildingType.CRYSTAL_MINE:
      return planet.economy.crystalMineLevel;
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return planet.economy.deuteriumSynthesizerLevel;
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
      return planet.economy.solarLevel;
    case BuildingType.NUCLEAR_PLANT:
      return planet.economy.nuclearLevel;
    case BuildingType.FUSION_REACTOR:
      return planet.economy.fusionLevel;
    case BuildingType.ROBOTICS_FACTORY:
      return planet.economy.roboticsLevel;
    case BuildingType.NANITE_FACTORY:
      return planet.economy.naniteLevel;
    case BuildingType.SHIPYARD:
      return planet.economy.shipyardLevel;
    case BuildingType.RESEARCH_LAB:
      return planet.economy.researchLabLevel;
    case BuildingType.SENSOR_PHALANX:
      return planet.economy.sensorPhalanxLevel;
    case BuildingType.JUMP_GATE:
      return planet.economy.jumpGateLevel;
    case BuildingType.ALLIANCE_DEPOT:
      return planet.economy.allianceDepotLevel;
    case BuildingType.BOMB_DEPOT:
      return planet.economy.bombDepotLevel;
    case BuildingType.INTERSTELLAR_TRADE_PORT:
      return planet.economy.interstellarTradePortLevel;
    case BuildingType.METAL_STORAGE:
      return planet.economy.metalStorageLevel;
    case BuildingType.CRYSTAL_STORAGE:
      return planet.economy.crystalStorageLevel;
    case BuildingType.DEUTERIUM_TANK:
      return planet.economy.deuteriumTankLevel;
    case BuildingType.BUNKER_NETWORK:
      return planet.defense.bunkerLevel;
    default:
      return 0;
  }
}

function getTechnologyLevel(planet: BotPlanetSnapshot, technologyType: TechnologyTypeT): number {
  switch (technologyType) {
    case TechnologyType.ENERGY_TECHNOLOGY:
      return planet.tech.energyTechnologyLevel;
    case TechnologyType.MATERIAL_TECHNOLOGY:
      return planet.tech.materialTechnologyLevel;
    case TechnologyType.ADAPTIVE_TECHNOLOGY:
      return planet.tech.adaptiveTechnologyLevel;
    case TechnologyType.COMPUTER_TECHNOLOGY:
      return planet.tech.computerTechnologyLevel;
    case TechnologyType.INTERGALACTIC_RESEARCH_NETWORK:
      return planet.tech.intergalacticResearchNetworkLevel;
    case TechnologyType.SHIELDING_TECHNOLOGY:
      return planet.tech.shieldingTechnologyLevel;
    case TechnologyType.ARMOUR_TECHNOLOGY:
      return planet.tech.armourTechnologyLevel;
    case TechnologyType.RAILGUNS_WEAPONS:
      return planet.tech.railgunsWeaponsLevel;
    case TechnologyType.BEAMS_WEAPONS:
      return planet.tech.beamsWeaponsLevel;
    case TechnologyType.MISSILES_WEAPONS:
      return planet.tech.missilesWeaponsLevel;
    case TechnologyType.FUSION_DRIVE:
      return planet.tech.fusionDriveLevel;
    case TechnologyType.HYPERSPACE_DRIVE:
      return planet.tech.hyperspaceDriveLevel;
    case TechnologyType.HYPERSPACE_TECHNOLOGY:
      return planet.tech.hyperspaceTechnologyLevel;
    case TechnologyType.ESPIONAGE_TECHNOLOGY:
      return planet.tech.espionageTechnologyLevel;
    case TechnologyType.ASTROPHYSICS_TECHNOLOGY:
      return planet.tech.astrophysicsTechnologyLevel;
    case TechnologyType.GRAVITON_TECHNOLOGY:
      return planet.tech.gravitonTechnologyLevel;
    default:
      return 0;
  }
}
