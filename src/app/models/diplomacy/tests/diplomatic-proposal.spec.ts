import { describe, expect, it } from 'vitest';
import { createDiplomaticProposal, isPendingDiplomaticProposalForPair } from '../diplomatic-proposal';
import { DiplomaticProposalState } from '../diplomatic-proposal-state';
import { DiplomaticStatus } from '../diplomatic-status';

describe('DiplomaticProposal helpers', () => {
  it('creates pending proposals with normalized turn values', () => {
    const proposal = createDiplomaticProposal(7, 4, 9, DiplomaticStatus.PEACE, 3, 4);

    expect(proposal).toEqual({
      proposalId: 7,
      fromPlayerId: 4,
      toPlayerId: 9,
      requestedStatus: DiplomaticStatus.PEACE,
      createdTurn: 3,
      expiresOnTurn: 4,
      state: DiplomaticProposalState.PENDING
    });
  });

  it('matches pending proposals by normalized player pair order', () => {
    const proposal = createDiplomaticProposal(3, 11, 2, DiplomaticStatus.ALLIED, 5, 6);

    expect(isPendingDiplomaticProposalForPair(proposal, 2, 11)).toBe(true);
    expect(isPendingDiplomaticProposalForPair(proposal, 11, 2)).toBe(true);
    expect(isPendingDiplomaticProposalForPair(proposal, 11, 7)).toBe(false);
  });

  it('ignores resolved proposals when checking pair conflicts', () => {
    const proposal = createDiplomaticProposal(5, 1, 8, DiplomaticStatus.WAR, 9, 10);
    proposal.state = DiplomaticProposalState.CANCELLED;

    expect(isPendingDiplomaticProposalForPair(proposal, 1, 8)).toBe(false);
  });
});
