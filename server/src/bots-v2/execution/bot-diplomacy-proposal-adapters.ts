import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { BotProposal } from '../bot-v2-types.ts';

export type BotDiplomacyProposalExecution = {
  targetPlayerId: number;
  requestedStatus: Extract<
    DiplomaticStatusType,
    DiplomaticStatus.PEACE | DiplomaticStatus.ALLIED | DiplomaticStatus.NEUTRAL | DiplomaticStatus.WAR
  >;
};

export type BotDiplomacyProposalAdapterResult =
  | { ok: true; value: BotDiplomacyProposalExecution }
  | { ok: false; reason: string };

export function normalizeDiplomacyProposal(proposal: BotProposal): BotDiplomacyProposalAdapterResult {
  if (proposal.kind !== 'DIPLOMACY_PROPOSAL') {
    return { ok: false, reason: 'not_diplomacy_proposal' };
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
      targetPlayerId,
      requestedStatus
    }
  };
}

function normalizeRequestedStatus(value: unknown): BotDiplomacyProposalExecution['requestedStatus'] | null {
  return value === DiplomaticStatus.PEACE
    || value === DiplomaticStatus.ALLIED
    || value === DiplomaticStatus.NEUTRAL
    || value === DiplomaticStatus.WAR
    ? value
    : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  return Number.isFinite(value) && Math.floor(value as number) > 0 ? Math.floor(value as number) : null;
}
