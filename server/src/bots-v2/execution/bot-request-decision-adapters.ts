import type { DefenceType } from '../../../../src/app/models/enums/defence-type.ts';
import type { ShipType } from '../../../../src/app/models/enums/ship-type.ts';
import type { BotProposal } from '../bot-v2-types.ts';

export type BotRequestDecisionExecution = {
  requestType: 'JUMP_GATE' | 'MAINTENANCE' | 'SUPPORT';
  requestId: number;
  decision: 'APPROVE' | 'REJECT' | 'PARTIAL_APPROVE';
  approvedResources: { metal: number; crystal: number; deuterium: number } | null;
  maintenanceApproval: {
    fuel: number;
    ships: Array<{ type: ShipType; amount: number }>;
    bombs: Array<{ type: DefenceType; amount: number }>;
  } | null;
};

export type BotRequestDecisionAdapterResult =
  | { ok: true; value: BotRequestDecisionExecution }
  | { ok: false; reason: string };

export function normalizeRequestDecisionProposal(proposal: BotProposal): BotRequestDecisionAdapterResult {
  if (proposal.kind !== 'REQUEST_DECISION') {
    return { ok: false, reason: 'not_request_decision' };
  }

  const requestType = normalizeRequestType(proposal.requestPayload.requestType);
  if (!requestType) {
    return { ok: false, reason: 'invalid_request_type' };
  }

  const requestId = normalizePositiveInteger(proposal.requestPayload.requestId);
  if (requestId === null) {
    return { ok: false, reason: 'invalid_request_id' };
  }

  const decision = normalizeDecision(proposal.requestPayload.decision);
  if (!decision) {
    return { ok: false, reason: 'invalid_request_decision' };
  }

  const approvedResources = normalizeResources(proposal.requestPayload.approvedResources);
  const maintenanceApproval = normalizeMaintenanceApproval(proposal.requestPayload.maintenanceApproval);
  if (proposal.requestPayload.maintenanceApproval !== null && proposal.requestPayload.maintenanceApproval !== undefined && !maintenanceApproval) {
    return { ok: false, reason: 'invalid_maintenance_approval' };
  }

  return {
    ok: true,
    value: {
      requestType,
      requestId,
      decision,
      approvedResources,
      maintenanceApproval
    }
  };
}

function normalizeRequestType(value: unknown): BotRequestDecisionExecution['requestType'] | null {
  return value === 'JUMP_GATE' || value === 'MAINTENANCE' || value === 'SUPPORT' ? value : null;
}

function normalizeDecision(value: unknown): BotRequestDecisionExecution['decision'] | null {
  return value === 'APPROVE' || value === 'REJECT' || value === 'PARTIAL_APPROVE' ? value : null;
}

function normalizePositiveInteger(value: unknown): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value as number);
  return normalized > 0 ? normalized : null;
}

function normalizeResources(value: unknown): BotRequestDecisionExecution['approvedResources'] {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    metal: normalizeAmount(record.metal),
    crystal: normalizeAmount(record.crystal),
    deuterium: normalizeAmount(record.deuterium)
  };
}

function normalizeMaintenanceApproval(value: unknown): BotRequestDecisionExecution['maintenanceApproval'] {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  return {
    fuel: normalizeAmount(record.fuel),
    ships: normalizeAmountEntries(record.ships) as Array<{ type: ShipType; amount: number }>,
    bombs: normalizeAmountEntries(record.bombs) as Array<{ type: DefenceType; amount: number }>
  };
}

function normalizeAmountEntries(value: unknown): Array<{ type: string; amount: number }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }
      const record = entry as Record<string, unknown>;
      if (typeof record.type !== 'string') {
        return null;
      }
      const amount = normalizeAmount(record.amount);
      return amount > 0 ? { type: record.type, amount } : null;
    })
    .filter((entry): entry is { type: string; amount: number } => entry !== null);
}

function normalizeAmount(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}
