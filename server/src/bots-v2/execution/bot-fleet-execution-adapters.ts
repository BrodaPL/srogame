import { DefenceType } from '../../../../src/app/models/enums/defence-type.js';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../src/app/models/enums/ship-type.js';
import { normalizeBombardmentPriorities } from '../../../../src/app/models/bombardment/bombardment-priority.js';
import type {
  ClientCoordinates,
  CreateFleetBombSelectionEntry,
  CreateFleetShipSelectionEntry,
  ResourcesPackDto
} from '../../../../src/app/models/game-api-types.ts';
import type { CreateFleetMissionCommand } from '../../game-commands/fleet-commands.ts';
import type { BotProposal } from '../bot-v2-types.ts';
import { readV2ProposalCoordinates } from './bot-coordinate-adapters.js';

export const SUPERVISOR_ALLOWED_FLEET_MISSIONS = new Set<FleetMissionType>([
  FleetMissionType.SPY,
  FleetMissionType.TRANSPORT,
  FleetMissionType.ARMAMENT_DELIVERY,
  FleetMissionType.REPAIR,
  FleetMissionType.RECYCLE,
  FleetMissionType.COLONIZE,
  FleetMissionType.MOVE,
  FleetMissionType.DEFEND,
  FleetMissionType.ATTACK,
  FleetMissionType.BOMBARD,
  FleetMissionType.SIEGE
]);

export type BotFleetExecutionAdapterResult =
  | {
    ok: true;
    value: CreateFleetMissionCommand;
  }
  | {
    ok: false;
    reason: string;
  };

export function normalizeFleetExecutionProposal(proposal: BotProposal): BotFleetExecutionAdapterResult {
  if (proposal.kind !== 'FLEET_MISSION') {
    return { ok: false, reason: 'unsupported_execution_kind' };
  }

  const missionType = proposal.requestPayload.missionType;
  if (!isFleetMissionType(missionType)) {
    return { ok: false, reason: 'missing_or_invalid_mission_type' };
  }
  if (!SUPERVISOR_ALLOWED_FLEET_MISSIONS.has(missionType)) {
    return { ok: false, reason: 'fleet_mission_not_allowed_in_current_supervisor_phase' };
  }

  const origin = readCoordinates(proposal.requestPayload.origin);
  const target = readCoordinates(proposal.requestPayload.target);
  if (!origin || !target) {
    return { ok: false, reason: 'missing_coordinates' };
  }

  const ships = readShips(proposal.requestPayload.ships);
  if (!ships || ships.length === 0) {
    return { ok: false, reason: 'missing_or_invalid_ships' };
  }

  const carriedBombs = readCarriedBombs(proposal.requestPayload.carriedBombs);
  if (!carriedBombs) {
    return { ok: false, reason: 'missing_or_invalid_carried_bombs' };
  }

  const cargo = readResources(proposal.requestPayload.cargo);
  if (!cargo) {
    return { ok: false, reason: 'missing_or_invalid_cargo' };
  }

  return {
    ok: true,
    value: {
      missionType,
      origin,
      target,
      ships,
      carriedBombs,
      cargo,
      useJumpGate: proposal.requestPayload.useJumpGate === true,
      bombardmentPriorities: normalizeBombardmentPriorities(
        readRecordOrNull(proposal.requestPayload.bombardmentPriorities)
      )
    }
  };
}

function readRecordOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readCoordinates(value: unknown): ClientCoordinates | null {
  return readV2ProposalCoordinates(value);
}

function readShips(value: unknown): CreateFleetShipSelectionEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const ships: CreateFleetShipSelectionEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (!isShipType(record.type)) {
      return null;
    }
    const undamagedAmount = Number(record.undamagedAmount);
    const damagedAmount = Number(record.damagedAmount);
    if (
      !Number.isFinite(undamagedAmount)
      || !Number.isFinite(damagedAmount)
      || undamagedAmount < 0
      || damagedAmount < 0
    ) {
      return null;
    }
    const normalized = {
      type: record.type,
      undamagedAmount: Math.floor(undamagedAmount),
      damagedAmount: Math.floor(damagedAmount)
    };
    if (normalized.undamagedAmount + normalized.damagedAmount > 0) {
      ships.push(normalized);
    }
  }
  return ships;
}

function readCarriedBombs(value: unknown): CreateFleetBombSelectionEntry[] | null {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const bombs: CreateFleetBombSelectionEntry[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (!isDefenceType(record.type)) {
      return null;
    }
    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return null;
    }
    const normalized = {
      type: record.type,
      amount: Math.floor(amount)
    };
    if (normalized.amount > 0) {
      bombs.push(normalized);
    }
  }
  return bombs;
}

function readResources(value: unknown): ResourcesPackDto | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const metal = Number(record.metal);
  const crystal = Number(record.crystal);
  const deuterium = Number(record.deuterium);
  if (
    !Number.isFinite(metal)
    || !Number.isFinite(crystal)
    || !Number.isFinite(deuterium)
    || metal < 0
    || crystal < 0
    || deuterium < 0
  ) {
    return null;
  }
  return {
    metal: Math.floor(metal),
    crystal: Math.floor(crystal),
    deuterium: Math.floor(deuterium)
  };
}

function isFleetMissionType(value: unknown): value is FleetMissionType {
  return typeof value === 'string' && Object.values(FleetMissionType).includes(value as FleetMissionType);
}

function isShipType(value: unknown): value is ShipType {
  return typeof value === 'string' && Object.values(ShipType).includes(value as ShipType);
}

function isDefenceType(value: unknown): value is DefenceType {
  return typeof value === 'string' && Object.values(DefenceType).includes(value as DefenceType);
}
