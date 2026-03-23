import { describe, expect, it } from 'vitest';
import { DefenceBlueprintsFactory } from '../defence-blueprints.factory';
import { DefenceType } from '../../models/enums/defence-type';
import { WeaponType } from '../../models/enums/weapon-type';

describe('DefenceBlueprintsFactory', () => {
  it('loads the default defence blueprint set', () => {
    const blueprints = DefenceBlueprintsFactory.fromDefaultJson();

    expect(blueprints.defencesMap.size).toBe(11);
    expect(blueprints.get(DefenceType.LIGHT_BEAM_CANNON)?.canShootToOrbit).toBe(true);
    expect(blueprints.get(DefenceType.SAM_SITE)?.canShootToOrbit).toBe(false);
    expect(blueprints.get(DefenceType.RAIL_GUN_CANNON)?.weapons[0]?.type).toBe(WeaponType.RAIL_GUN);
    expect(blueprints.get(DefenceType.SMALL_BOMB)?.canShootToOrbit).toBe(false);
    expect(blueprints.get(DefenceType.HEAVY_BOMB)?.weapons[0]?.type).toBe(WeaponType.ORBIT_TO_SURFACE_BOMB);
  });
});
