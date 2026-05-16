import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { BotProposal } from '../bot-v2-types.ts';

export type BotDiplomacyDecisionExecution = {
  proposalId: number;
  decision: 'ACCEPT' | 'REJECT' | 'CANCEL';
  targetPlayerId: number;
  requestedStatus: Extract<DiplomaticStatusType, DiplomaticStatus.PEACE | DiplomaticStatus.ALLIED>;
};

export type BotDiplomacyDecisionAdapterResult =
  | { ok: true; value: BotDiplomacyDecisionExecution }
  | { ok: false; reason: string };

export function normalizeDiplomacyDecisionProposal(proposal: BotProposal): BotDiplomacyDecisionAdapterResult {
  if (proposal.kind !== 'DIPLOMACY_DECISION') {
    return { ok: false, reason: 'not_diplomacy_decision' };
  }

  const proposalId = normalizePositiveInteger(proposal.requestPayload.proposalId);
  if (proposalId === null) {
    return { ok: false, reason: 'invalid_diplomacy_proposal_id' };
  }

  const decision = normalizeDecision(proposal.requestPayload.decision);
  if (!decision) {
    return { ok: false, reason: 'invalid_diplomacy_decision' };
  }

  const targetPlayerId = normalizePositiveInteger(proposal.requestPayload.targetPlayerId);
  if (targetPlayerId === null) {
    return { ok: false, reason: 'invalid_target_player_id' };
  }

  const requestedStatus = normalizeRequestedStatus(proposal.requestPayload.requestedStatus);
  if (!requestedStatus) {
    return { ok: false, reason: 'invalid_requested_status' };
  }

  return {
    ok: true,
    value: {
      proposalId,
      decision,
      targetPlayerId,
      requestedStatus
    }
  };
}

function normalizeDecision(value: unknown): BotDiplomacyDecisionExecution['decision'] | null {
  return value === 'ACCEPT' || value === 'REJECT' || value === 'CANCEL' ? value : null;
}

function normalizeRequestedStatus(value: unknown): BotDiplomacyDecisionExecution['requestedStatus'] | null {
  return value === DiplomaticStatus.PEACE || value === DiplomaticStatus.ALLIED ? value : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  return Number.isFinite(value) && Math.floor(value as number) > 0 ? Math.floor(value as number) : null;
}
