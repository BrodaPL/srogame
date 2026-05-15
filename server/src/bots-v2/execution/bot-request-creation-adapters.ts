import type { BombardmentPriorities } from '../../../../src/app/models/bombardment/bombardment-priority.ts';
import type { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.ts';
import type { ShipType } from '../../../../src/app/models/enums/ship-type.ts';
import type { SupportRequestType } from '../../../../src/app/models/requests/support-request.ts';
import type { BotProposal } from '../bot-v2-types.ts';

export type BotRequestCreationExecution = {
  requestType: 'SUPPORT';
  targetPlayerId: number;
  supportType: SupportRequestType;
  targetCoordinates: { x: number; y: number; z: number };
  requestedResources: { metal: number; crystal: number; deuterium: number };
  missionType: FleetMissionType | null;
  minimumShips: Array<{ type: ShipType; amount: number }>;
  bombardmentPriorities: BombardmentPriorities | null;
};

export type BotRequestCreationAdapterResult =
  | { ok: true; value: BotRequestCreationExecution }
  | { ok: false; reason: string };

export function normalizeRequestCreationProposal(proposal: BotProposal): BotRequestCreationAdapterResult {
  if (proposal.kind !== 'REQUEST_CREATION') {
    return { ok: false, reason: 'not_request_creation' };
  }

  if (proposal.requestPayload.requestType !== 'SUPPORT') {
    return { ok: false, reason: 'unsupported_request_creation_type' };
  }

  const targetPlayerId = normalizePositiveInteger(proposal.requestPayload.targetPlayerId);
  if (targetPlayerId === null) {
    return { ok: false, reason: 'invalid_target_player_id' };
  }

  const supportType = normalizeSupportType(proposal.requestPayload.supportType);
  if (!supportType) {
    return { ok: false, reason: 'invalid_support_type' };
  }

  const targetCoordinates = normalizeCoordinates(proposal.requestPayload.targetCoordinates);
  if (!targetCoordinates) {
    return { ok: false, reason: 'invalid_target_coordinates' };
  }

  const minimumShips = normalizeShipAmounts(proposal.requestPayload.minimumShips);
  const missionType = typeof proposal.requestPayload.missionType === 'string'
    ? proposal.requestPayload.missionType as FleetMissionType
    : null;

  return {
    ok: true,
    value: {
      requestType: 'SUPPORT',
      targetPlayerId,
      supportType,
      targetCoordinates,
      requestedResources: normalizeResources(proposal.requestPayload.requestedResources),
      missionType,
      minimumShips,
      bombardmentPriorities: normalizeBombardmentPriorities(proposal.requestPayload.bombardmentPriorities)
    }
  };
}

function normalizeSupportType(value: unknown): SupportRequestType | null {
  return value === 'RESOURCE_SUPPORT'
    || value === 'PLANET_REPAIR'
    || value === 'PLANET_DEFENSE'
    || value === 'ATTACK_TARGET'
    || value === 'BOMBARD_TARGET'
    || value === 'SIEGE_TARGET'
    ? value
    : null;
}

function normalizeCoordinates(value: unknown): { x: number; y: number; z: number } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const x = normalizeInteger(record.x);
  const y = normalizeInteger(record.y);
  const z = normalizeInteger(record.z);
  return x === null || y === null || z === null ? null : { x, y, z };
}

function normalizeResources(value: unknown): { metal: number; crystal: number; deuterium: number } {
  if (!value || typeof value !== 'object') {
    return { metal: 0, crystal: 0, deuterium: 0 };
  }
  const record = value as Record<string, unknown>;
  return {
    metal: normalizeAmount(record.metal),
    crystal: normalizeAmount(record.crystal),
    deuterium: normalizeAmount(record.deuterium)
  };
}

function normalizeShipAmounts(value: unknown): Array<{ type: ShipType; amount: number }> {
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
      return amount > 0 ? { type: record.type as ShipType, amount } : null;
    })
    .filter((entry): entry is { type: ShipType; amount: number } => entry !== null);
}

function normalizeBombardmentPriorities(value: unknown): BombardmentPriorities | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as BombardmentPriorities;
}

function normalizePositiveInteger(value: unknown): number | null {
  const normalized = normalizeInteger(value);
  return normalized !== null && normalized > 0 ? normalized : null;
}

function normalizeInteger(value: unknown): number | null {
  return Number.isFinite(value) ? Math.floor(value as number) : null;
}

function normalizeAmount(value: unknown): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value as number)) : 0;
}
