import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { WeaponType } from '../enums/weapon-type';
import { ManyShips, type ManyShipsLike } from '../fleets/many-ships';
import { Planet } from '../planets/planet';
import { BuildingType } from '../enums/building-type';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export type BuildingBombardmentSummary = {
  shots: number;
  hits: number;
  totalDamage: number;
  targetCount: number;
  targets: Array<{
    type: BuildingType;
    damage: number;
    remainingStructuralPoints: number;
    reducedToZero: boolean;
    structuralUtilization: number;
    minimumStructuralUtilization: number;
  }>;
};

export function hasBombardmentWeapons(ships: ManyShipsLike | null | undefined): boolean {
  for (const [shipType, amount] of ManyShips.countByType(ships).entries()) {
    if (amount <= 0) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint) {
      continue;
    }

    if (blueprint.weapons.some((weapon) => weapon.type === WeaponType.BOMBARDMENT_WEAPONS)) {
      return true;
    }
  }

  return false;
}

export function applyBuildingBombardment(
  ships: ManyShipsLike | null | undefined,
  planet: Planet
): BuildingBombardmentSummary {
  const availableTargets = bombardableBuildingTypes(planet);
  if (availableTargets.length <= 0) {
    return {
      shots: 0,
      hits: 0,
      totalDamage: 0,
      targetCount: 0,
      targets: []
    };
  }

  let shots = 0;
  let hits = 0;
  let totalDamage = 0;
  const targets: BuildingBombardmentSummary['targets'] = [];

  for (const [shipType, amount] of ManyShips.countByType(ships).entries()) {
    const normalizedAmount = Math.max(0, Math.floor(amount));
    if (normalizedAmount <= 0) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (!blueprint) {
      continue;
    }

    for (const weapon of blueprint.weapons) {
      if (weapon.type !== WeaponType.BOMBARDMENT_WEAPONS) {
        continue;
      }

      const totalShots = Math.max(0, Math.floor(weapon.shots)) * normalizedAmount;
      for (let shotIndex = 0; shotIndex < totalShots; shotIndex += 1) {
        shots += 1;
        if (Math.random() < 0.5) {
          continue;
        }

        const targetTypes = bombardableBuildingTypes(planet);
        if (targetTypes.length <= 0) {
          break;
        }

        const targetType = targetTypes[Math.floor(Math.random() * targetTypes.length)];
        const structuralPointsBefore = planet.getCurrentBuildingStructuralPoints(targetType);
        const appliedDamage = planet.applyBuildingStructuralDamage(targetType, weapon.dmg);
        hits += 1;
        totalDamage += appliedDamage;
        targets.push({
          type: targetType,
          damage: appliedDamage,
          remainingStructuralPoints: planet.getCurrentBuildingStructuralPoints(targetType),
          reducedToZero: structuralPointsBefore > 0 && planet.getCurrentBuildingStructuralPoints(targetType) <= 0,
          structuralUtilization: planet.getBuildingStructuralUtilization(targetType),
          minimumStructuralUtilization: planet.getBuildingMinimumStructuralUtilization(targetType)
        });
      }
    }
  }

  return {
    shots,
    hits,
    totalDamage,
    targetCount: availableTargets.length,
    targets
  };
}

export function hasDamagedBuildings(planet: Planet): boolean {
  return bombardableBuildingTypes(planet).some((type) =>
    planet.getCurrentBuildingStructuralPoints(type) < planet.getMaxBuildingStructuralPoints(type)
  );
}

export function bombardableBuildingTypes(planet: Planet): BuildingType[] {
  const entries = [...planet.rBDSFTQ.buildingsLevels.entries()]
    .filter(([, level]) => level > 0)
    .map(([type]) => type);
  return entries;
}
