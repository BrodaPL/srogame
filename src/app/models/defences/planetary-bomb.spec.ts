import { describe, expect, it } from 'vitest';
import { DefenceType } from '../enums/defence-type';
import { ManyDefences } from './many-defences';
import { countPlanetaryBombs, totalPlanetaryBombSize } from './planetary-bomb';

describe('planetary bomb helpers', () => {
  it('counts bombs by amount and storage by summed size', () => {
    const defences = ManyDefences.empty();
    defences.addUndamaged(DefenceType.SMALL_BOMB, 2);
    defences.addUndamaged(DefenceType.MEDIUM_BOMB, 1);
    defences.addUndamaged(DefenceType.HEAVY_BOMB, 1);

    expect(countPlanetaryBombs(defences)).toBe(4);
    expect(totalPlanetaryBombSize(defences)).toBe(7);
  });
});
