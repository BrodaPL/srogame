import { DefenceBlueprintsFactory } from '../../factories/defence-blueprints.factory';
import { DefenceType } from '../enums/defence-type';
import { HullClass } from '../enums/hull-class';
import { WeaponType } from '../enums/weapon-type';
import { Defence } from './defence';
import { DefenceInstance } from './defence-instance';
import { ManyDefences, type ManyDefencesLike } from './many-defences';

const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();

export function isPlanetaryBombDefenceType(type: DefenceType | null | undefined): boolean {
  if (!type) {
    return false;
  }

  return DEFENCE_BLUEPRINTS.get(type)?.hullClass === HullClass.PLANETARY_BOMB;
}

export function countPlanetaryBombs(defences: ManyDefencesLike | null | undefined): number {
  let total = 0;
  for (const [type, amount] of ManyDefences.countByType(defences).entries()) {
    if (isPlanetaryBombDefenceType(type)) {
      total += amount;
    }
  }

  return total;
}

export function splitPlanetaryBombDefences(
  defences: ManyDefencesLike | null | undefined
): { activeDefences: ManyDefences; planetaryBombs: ManyDefences } {
  const normalized = ManyDefences.fromData(defences);
  const activeDefences = ManyDefences.empty();
  const planetaryBombs = ManyDefences.empty();

  for (const [type, amount] of Object.entries(normalized.undamagedDefencesCount) as Array<[DefenceType, number]>) {
    if (isPlanetaryBombDefenceType(type)) {
      planetaryBombs.addUndamaged(type, amount);
    } else {
      activeDefences.addUndamaged(type, amount);
    }
  }

  for (const entry of normalized.damagedDefences) {
    if (isPlanetaryBombDefenceType(entry.type)) {
      planetaryBombs.addDamaged(entry.type, entry.hull);
    } else {
      activeDefences.addDamaged(entry.type, entry.hull);
    }
  }

  return { activeDefences, planetaryBombs };
}

export function totalOrbitToSurfaceBombPayload(defence: Defence | DefenceInstance): number {
  const blueprint = defence instanceof DefenceInstance ? defence.type : defence;
  return blueprint.weapons
    .filter((weapon) => weapon.type === WeaponType.ORBIT_TO_SURFACE_BOMB)
    .reduce((sum, weapon) => sum + (Math.max(0, weapon.dmg) * Math.max(0, Math.floor(weapon.shots))), 0);
}
