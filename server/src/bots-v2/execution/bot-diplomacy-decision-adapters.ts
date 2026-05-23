import * as diplomaticStatusModule from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { BotProposal } from '../bot-v2-types.ts';
import { resolveModule } from '../../esm-module.js';

const { DiplomaticStatus } = resolveModule(diplomaticStatusModule) as typeof import('../../../../src/app/models/diplomacy/diplomatic-status.js');

const REQUESTED_DIPLOMACY_STATUSES = [
  DiplomaticStatus.PEACE,
  DiplomaticStatus.ALLIED,
  DiplomaticStatus.NEUTRAL,
  DiplomaticStatus.WAR
] as const satisfies readonly DiplomaticStatusType[];

type RequestedDiplomaticStatus = typeof REQUESTED_DIPLOMACY_STATUSES[number];

export type BotDiplomacyDecisionExecution = {
  proposalId: number;
  decision: 'ACCEPT' | 'REJECT' | 'CANCEL';
  targetPlayerId: number;
  requestedStatus: RequestedDiplomaticStatus;
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
  return REQUESTED_DIPLOMACY_STATUSES.includes(value as RequestedDiplomaticStatus)
    ? (value as RequestedDiplomaticStatus)
    : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  return Number.isFinite(value) && Math.floor(value as number) > 0 ? Math.floor(value as number) : null;
}
