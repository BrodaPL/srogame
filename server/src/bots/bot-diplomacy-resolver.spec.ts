import { describe, expect, it } from 'vitest';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { BOT_PROFILES } from './bot-profile.js';
import { decideIncomingDiplomaticProposalWithContext } from './bot-diplomacy-resolver.js';

describe('bot-diplomacy-resolver', () => {
  it('accepts peace for a pressured balanced bot', () => {
    const decision = decideIncomingDiplomaticProposalWithContext(
      BOT_PROFILES.BALANCED,
      DiplomaticStatus.PEACE,
      {
        otherPlayerId: 2,
        currentStatus: DiplomaticStatus.WAR,
        relativeStrengthRatio: 0.7,
        sharesBorder: true,
        borderPressure: 4.2,
        recentConflictScore: 1,
        strategicValue: 2.4
      }
    );

    expect(decision.approve).toBe(true);
    expect(decision.traceKind).toBe('approve-peace');
  });

  it('rejects alliance when the current relation is not peace', () => {
    const decision = decideIncomingDiplomaticProposalWithContext(
      BOT_PROFILES.BALANCED,
      DiplomaticStatus.ALLIED,
      {
        otherPlayerId: 2,
        currentStatus: DiplomaticStatus.NEUTRAL,
        relativeStrengthRatio: 1,
        sharesBorder: true,
        borderPressure: 1.5,
        recentConflictScore: 0,
        strategicValue: 1.5
      }
    );

    expect(decision.approve).toBe(false);
    expect(decision.traceKind).toBe('reject-alliance');
  });
});
