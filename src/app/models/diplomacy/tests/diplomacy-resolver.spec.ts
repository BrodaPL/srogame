import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../diplomatic-status';
import { DiplomacyResolver } from '../diplomacy-resolver';

describe('DiplomacyResolver', () => {
  it('treats same owner as SELF and missing relations as NEUTRAL', () => {
    const resolver = new DiplomacyResolver();

    expect(resolver.getStatus(3, 3)).toBe(DiplomaticStatus.SELF);
    expect(resolver.getStatus(1, 2)).toBe(DiplomaticStatus.NEUTRAL);
    expect(resolver.getStatus(1, null)).toBe(DiplomaticStatus.NEUTRAL);
  });

  it('stores normalized allied and peace relations', () => {
    const resolver = new DiplomacyResolver([
      { playerAId: 5, playerBId: 2, status: DiplomaticStatus.ALLIED }
    ]);

    resolver.setStatus(9, 4, DiplomaticStatus.PASSIVE);

    expect(resolver.getStatus(2, 5)).toBe(DiplomaticStatus.ALLIED);
    expect(resolver.getStatus(4, 9)).toBe(DiplomaticStatus.PASSIVE);
    expect(resolver.toRelations()).toEqual([
      { playerAId: 2, playerBId: 5, status: DiplomaticStatus.ALLIED },
      { playerAId: 4, playerBId: 9, status: DiplomaticStatus.PASSIVE }
    ]);
  });

  it('stores explicit WAR relations and drops explicit relations when set back to NEUTRAL', () => {
    const resolver = new DiplomacyResolver([
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.ALLIED }
    ]);

    resolver.setStatus(2, 1, DiplomaticStatus.WAR);
    expect(resolver.getStatus(1, 2)).toBe(DiplomaticStatus.WAR);
    expect(resolver.toRelations()).toEqual([
      { playerAId: 1, playerBId: 2, status: DiplomaticStatus.WAR }
    ]);

    resolver.setStatus(2, 1, DiplomaticStatus.NEUTRAL);
    expect(resolver.getStatus(1, 2)).toBe(DiplomaticStatus.NEUTRAL);
    expect(resolver.toRelations()).toEqual([]);
  });
});
