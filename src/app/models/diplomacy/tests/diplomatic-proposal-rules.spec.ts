import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../diplomatic-status';
import {
  allowedDiplomaticProposalStatuses,
  canCreateDiplomaticProposalForStatus,
  isDiplomaticProposalRequestedStatus
} from '../diplomatic-proposal-rules';

describe('diplomatic proposal rules', () => {
  it('allows only the intended next treaty steps', () => {
    expect(allowedDiplomaticProposalStatuses(DiplomaticStatus.NEUTRAL)).toEqual([
      DiplomaticStatus.PEACE,
      DiplomaticStatus.WAR
    ]);
    expect(allowedDiplomaticProposalStatuses(DiplomaticStatus.WAR)).toEqual([
      DiplomaticStatus.PEACE,
      DiplomaticStatus.NEUTRAL
    ]);
    expect(allowedDiplomaticProposalStatuses(DiplomaticStatus.PEACE)).toEqual([
      DiplomaticStatus.ALLIED,
      DiplomaticStatus.NEUTRAL
    ]);
    expect(allowedDiplomaticProposalStatuses(DiplomaticStatus.ALLIED)).toEqual([DiplomaticStatus.PEACE]);
    expect(allowedDiplomaticProposalStatuses(DiplomaticStatus.PASSIVE)).toEqual([]);
  });

  it('recognizes PEACE, ALLIED, NEUTRAL, and WAR as requested diplomacy statuses', () => {
    expect(isDiplomaticProposalRequestedStatus(DiplomaticStatus.PEACE)).toBe(true);
    expect(isDiplomaticProposalRequestedStatus(DiplomaticStatus.ALLIED)).toBe(true);
    expect(isDiplomaticProposalRequestedStatus(DiplomaticStatus.NEUTRAL)).toBe(true);
    expect(isDiplomaticProposalRequestedStatus(DiplomaticStatus.WAR)).toBe(true);
    expect(isDiplomaticProposalRequestedStatus(DiplomaticStatus.PASSIVE)).toBe(false);
  });

  it('rejects treaty jumps that skip the intended ladder', () => {
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.NEUTRAL, DiplomaticStatus.ALLIED)).toBe(false);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.WAR, DiplomaticStatus.ALLIED)).toBe(false);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.PEACE, DiplomaticStatus.PEACE)).toBe(false);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.NEUTRAL, DiplomaticStatus.PEACE)).toBe(true);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.NEUTRAL, DiplomaticStatus.WAR)).toBe(true);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.WAR, DiplomaticStatus.NEUTRAL)).toBe(true);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.PEACE, DiplomaticStatus.NEUTRAL)).toBe(true);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.ALLIED, DiplomaticStatus.PEACE)).toBe(true);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.ALLIED, DiplomaticStatus.NEUTRAL)).toBe(false);
    expect(canCreateDiplomaticProposalForStatus(DiplomaticStatus.PEACE, DiplomaticStatus.ALLIED)).toBe(true);
  });
});
