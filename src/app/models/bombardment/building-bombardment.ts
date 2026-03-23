import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { ManyDefences, type ManyDefencesLike } from '../defences/many-defences';
import { DefenceInstance } from '../defences/defence-instance';
import { splitPlanetaryBombDefences, totalOrbitToSurfaceBombPayload } from '../defences/planetary-bomb';
import { DefenceType } from '../enums/defence-type';
import { WeaponType } from '../enums/weapon-type';
import { ManyShips, type ManyShipsLike } from '../fleets/many-ships';
import { Planet } from '../planets/planet';
import { BuildingType } from '../enums/building-type';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export type BuildingBombardmentSummary = {
  shots: number;
  hits: number;
  totalDamage: number;
  bombsLaunched: number;
  bombsActivated: number;
  bombsIntercepted: number;
  bombsLost: number;
  buildingTargetCount: number;
  defenceTargetCount: number;
  remainingBombs: ManyDefences;
  buildingTargets: Array<{
    type: BuildingType;
    damage: number;
    remainingStructuralPoints: number;
    reducedToZero: boolean;
    structuralUtilization: number;
    minimumStructuralUtilization: number;
  }>;
  defenceTargets: Array<{
    type: DefenceType;
    damage: number;
    hullBefore: number;
    hullAfter: number;
    destroyed: boolean;
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

export function hasBombardmentCapability(
  ships: ManyShipsLike | null | undefined,
  carriedBombs: ManyDefencesLike | null | undefined = null
): boolean {
  return hasBombardmentWeapons(ships) || ManyDefences.totalDefencesCount(carriedBombs) > 0;
}

export function applyBuildingBombardment(
  ships: ManyShipsLike | null | undefined,
  planet: Planet,
  carriedBombs: ManyDefencesLike | null | undefined = null
): BuildingBombardmentSummary {
  const availableBuildingTargets = bombardableBuildingTypes(planet);
  const { activeDefences, planetaryBombs } = splitPlanetaryBombDefences(planet.rBDSFTQ.defences);
  const defenceInstances = ManyDefences.toDefenceInstances(activeDefences);
  const bombInstances = ManyDefences.toDefenceInstances(carriedBombs);
  if (availableBuildingTargets.length <= 0 && defenceInstances.length <= 0) {
    return {
      shots: 0,
      hits: 0,
      totalDamage: 0,
      bombsLaunched: 0,
      bombsActivated: 0,
      bombsIntercepted: 0,
      bombsLost: 0,
      buildingTargetCount: 0,
      defenceTargetCount: 0,
      remainingBombs: ManyDefences.fromDefenceInstances(bombInstances),
      buildingTargets: [],
      defenceTargets: []
    };
  }

  let shots = 0;
  let hits = 0;
  let totalDamage = 0;
  let bombsLaunched = 0;
  let bombsActivated = 0;
  let bombsIntercepted = 0;
  const buildingTargets: BuildingBombardmentSummary['buildingTargets'] = [];
  const defenceTargets: BuildingBombardmentSummary['defenceTargets'] = [];

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
        const canHitBuildings = targetTypes.length > 0;
        const canHitDefences = defenceInstances.some((instance) => instance.hull > 0);
        if (!canHitBuildings && !canHitDefences) {
          break;
        }

        const targetCategory = selectGroundTargetCategory(canHitBuildings, canHitDefences);
        if (targetCategory === 'defence') {
          const targetIndex = selectRandomAliveDefenceIndex(defenceInstances);
          if (targetIndex < 0) {
            continue;
          }

          const target = defenceInstances[targetIndex];
          const targetResult = applyBombardmentDamageToDefence(target, weapon.dmg);
          if (targetResult.damage <= 0) {
            continue;
          }

          hits += 1;
          totalDamage += targetResult.damage;
          defenceTargets.push({
            type: target.type.type,
            damage: targetResult.damage,
            hullBefore: targetResult.hullBefore,
            hullAfter: targetResult.hullAfter,
            destroyed: targetResult.destroyed
          });

          if (targetResult.destroyed) {
            defenceInstances.splice(targetIndex, 1);
          }
          continue;
        }

        const targetType = targetTypes[Math.floor(Math.random() * targetTypes.length)];
        const structuralPointsBefore = planet.getCurrentBuildingStructuralPoints(targetType);
        const appliedDamage = planet.applyBuildingStructuralDamage(targetType, weapon.dmg);
        if (appliedDamage <= 0) {
          continue;
        }

        hits += 1;
        totalDamage += appliedDamage;
        buildingTargets.push({
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

  for (const bomb of bombInstances) {
    if (bomb.hull <= 0) {
      continue;
    }

    const targetTypes = bombardableBuildingTypes(planet);
    const preferredCategory = bomb.type.size === 1 ? 'defence' : 'building';
    const targetCategory = selectPreferredGroundTargetCategory(
      targetTypes.length > 0,
      defenceInstances.some((instance) => instance.hull > 0),
      preferredCategory
    );
    if (!targetCategory) {
      break;
    }

    bombsLaunched += 1;
    shots += 1;
    if (Math.random() < 0.5) {
      continue;
    }

    const bombPayload = totalOrbitToSurfaceBombPayload(bomb);
    if (bombPayload <= 0) {
      continue;
    }

    bombsActivated += 1;
    if (targetCategory === 'defence') {
      const targetIndex = selectRandomAliveDefenceIndex(defenceInstances);
      if (targetIndex >= 0) {
        const target = defenceInstances[targetIndex];
        const targetResult = applyBombardmentDamageToDefence(target, bombPayload);
        if (targetResult.damage > 0) {
          hits += 1;
          totalDamage += targetResult.damage;
          defenceTargets.push({
            type: target.type.type,
            damage: targetResult.damage,
            hullBefore: targetResult.hullBefore,
            hullAfter: targetResult.hullAfter,
            destroyed: targetResult.destroyed
          });
          if (targetResult.destroyed) {
            defenceInstances.splice(targetIndex, 1);
          }
        }
      }
    } else {
      const targetType = targetTypes[Math.floor(Math.random() * targetTypes.length)];
      const structuralPointsBefore = planet.getCurrentBuildingStructuralPoints(targetType);
      const appliedDamage = planet.applyBuildingStructuralDamage(targetType, bombPayload);
      if (appliedDamage > 0) {
        hits += 1;
        totalDamage += appliedDamage;
        buildingTargets.push({
          type: targetType,
          damage: appliedDamage,
          remainingStructuralPoints: planet.getCurrentBuildingStructuralPoints(targetType),
          reducedToZero: structuralPointsBefore > 0 && planet.getCurrentBuildingStructuralPoints(targetType) <= 0,
          structuralUtilization: planet.getBuildingStructuralUtilization(targetType),
          minimumStructuralUtilization: planet.getBuildingMinimumStructuralUtilization(targetType)
        });
      }
    }

    bomb.hull = 0;
    bomb.shield = 0;
  }

  const aliveDefenceInterceptors = defenceInstances.filter((instance) => instance.hull > 0);
  for (const interceptor of aliveDefenceInterceptors) {
    for (const weapon of interceptor.type.weapons) {
      if (
        weapon.type !== WeaponType.BEAM
        && weapon.type !== WeaponType.MISSILE
        && weapon.type !== WeaponType.RAIL_GUN
      ) {
        continue;
      }

      const shotsToFire = Math.max(0, Math.floor(weapon.shots));
      for (let shotIndex = 0; shotIndex < shotsToFire; shotIndex += 1) {
        const bombTargetIndex = selectRandomAliveDefenceIndex(bombInstances);
        if (bombTargetIndex < 0) {
          break;
        }

        const bombTarget = bombInstances[bombTargetIndex];
        const interceptResult = applyWeaponDamageToBomb(bombTarget, weapon.type, weapon.dmg);
        if (interceptResult.damage <= 0) {
          continue;
        }

        bombsIntercepted += 1;
      }
    }
  }

  planet.rBDSFTQ.defences = ManyDefences.fromDefenceInstances(defenceInstances);
  planet.rBDSFTQ.defences.addManyDefences(planetaryBombs);
  const remainingBombs = ManyDefences.fromDefenceInstances(bombInstances);

  return {
    shots,
    hits,
    totalDamage,
    bombsLaunched,
    bombsActivated,
    bombsIntercepted,
    bombsLost: bombInstances.filter((bomb) => bomb.hull <= 0).length,
    buildingTargetCount: availableBuildingTargets.length,
    defenceTargetCount: defenceInstances.filter((instance) => instance.hull > 0).length,
    remainingBombs,
    buildingTargets,
    defenceTargets
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

function selectGroundTargetCategory(
  canHitBuildings: boolean,
  canHitDefences: boolean
): 'building' | 'defence' {
  if (canHitBuildings && canHitDefences) {
    return Math.random() < 0.5 ? 'building' : 'defence';
  }

  return canHitDefences ? 'defence' : 'building';
}

function selectPreferredGroundTargetCategory(
  canHitBuildings: boolean,
  canHitDefences: boolean,
  preferredCategory: 'building' | 'defence'
): 'building' | 'defence' | null {
  if (!canHitBuildings && !canHitDefences) {
    return null;
  }

  if (preferredCategory === 'defence') {
    return canHitDefences ? 'defence' : 'building';
  }

  return canHitBuildings ? 'building' : 'defence';
}

function selectRandomAliveDefenceIndex(defences: DefenceInstance[]): number {
  const candidates = defences
    .map((defence, index) => ({ defence, index }))
    .filter(({ defence }) => defence.hull > 0);
  if (candidates.length <= 0) {
    return -1;
  }

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  return selected?.index ?? -1;
}

export function applyBombardmentDamageToDefence(
  target: DefenceInstance,
  weaponDamage: number
): { damage: number; hullBefore: number; hullAfter: number; destroyed: boolean } {
  const hullBefore = target.hull;
  const shieldBefore = target.shield;
  const shieldDamage = Math.min(Math.max(0, shieldBefore), Math.max(0, weaponDamage));
  const spilloverDamage = Math.max(0, weaponDamage - shieldDamage) / 2;
  const hullDamage = Math.max(0, Math.floor(spilloverDamage - target.type.armor));
  if (hullDamage <= 0) {
    target.shield = Math.max(0, shieldBefore - shieldDamage);
    return {
      damage: 0,
      hullBefore,
      hullAfter: target.hull,
      destroyed: false
    };
  }

  target.shield = Math.max(0, shieldBefore - shieldDamage);
  target.hull = Math.max(0, target.hull - hullDamage);
  const destroyed = target.hull <= 0 || rollCriticalDestruction(target);
  if (destroyed) {
    target.hull = 0;
    target.shield = 0;
  }

  return {
    damage: hullBefore - target.hull,
    hullBefore,
    hullAfter: target.hull,
    destroyed
  };
}

function applyWeaponDamageToBomb(
  target: DefenceInstance,
  weaponType: WeaponType,
  weaponDamage: number
): { damage: number; hullBefore: number; hullAfter: number; destroyed: boolean } {
  const hullBefore = target.hull;
  const shieldBefore = target.shield;
  let shieldDamage = 0;
  let hullDamage = 0;

  if (weaponType === WeaponType.RAIL_GUN) {
    hullDamage = Math.max(0, weaponDamage);
  } else {
    shieldDamage = Math.min(Math.max(0, shieldBefore), Math.max(0, weaponDamage));
    const spilloverDamage = Math.max(0, weaponDamage - shieldDamage) / 2;
    const armourPenalty = target.type.armor * (weaponType === WeaponType.MISSILE ? 2 : 1);
    hullDamage = Math.max(0, spilloverDamage - armourPenalty);
    target.shield = Math.max(0, shieldBefore - shieldDamage);
  }

  target.hull = Math.max(0, target.hull - hullDamage);
  if (weaponType === WeaponType.RAIL_GUN) {
    target.shield = shieldBefore;
  }

  return {
    damage: Math.max(0, hullBefore - target.hull),
    hullBefore,
    hullAfter: target.hull,
    destroyed: target.hull <= 0
  };
}

function rollCriticalDestruction(target: DefenceInstance): boolean {
  const criticalHullThreshold = target.type.hullPointsCapacity * (target.type.criticalThreshold / 100);
  if (criticalHullThreshold <= 0 || target.hull > criticalHullThreshold) {
    return false;
  }

  const destructionChancePercent = ((criticalHullThreshold - target.hull) / criticalHullThreshold) * 100;
  if (destructionChancePercent >= 100) {
    return true;
  }

  return Math.random() < (destructionChancePercent / 100);
}
