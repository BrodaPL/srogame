import { DiplomaticStatus } from './diplomatic-status';
import { DiplomaticProposalState } from './diplomatic-proposal-state';
import { normalizeDiplomaticPair } from './diplomatic-relation';

export type DiplomaticProposal = {
  proposalId: number;
  fromPlayerId: number;
  toPlayerId: number;
  requestedStatus: DiplomaticStatus;
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
};

export function createDiplomaticProposal(
  proposalId: number,
  fromPlayerId: number,
  toPlayerId: number,
  requestedStatus: DiplomaticStatus,
  createdTurn: number,
  expiresOnTurn: number
): DiplomaticProposal {
  return {
    proposalId,
    fromPlayerId,
    toPlayerId,
    requestedStatus,
    createdTurn: Math.max(0, Math.floor(createdTurn)),
    expiresOnTurn: Math.max(Math.floor(createdTurn), Math.floor(expiresOnTurn)),
    state: DiplomaticProposalState.PENDING
  };
}

export function isDiplomaticProposalResolved(proposal: DiplomaticProposal): boolean {
  return proposal.state !== DiplomaticProposalState.PENDING;
}

export function isPendingDiplomaticProposalForPair(
  proposal: DiplomaticProposal,
  leftPlayerId: number,
  rightPlayerId: number
): boolean {
  if (proposal.state !== DiplomaticProposalState.PENDING) {
    return false;
  }

  const pair = normalizeDiplomaticPair(leftPlayerId, rightPlayerId);
  const proposalPair = normalizeDiplomaticPair(proposal.fromPlayerId, proposal.toPlayerId);
  return pair.playerAId === proposalPair.playerAId
    && pair.playerBId === proposalPair.playerBId;
}
