import { DiplomaticProposalState } from '../diplomacy/diplomatic-proposal-state';
import { DefenceType } from '../enums/defence-type';
import { ShipType } from '../enums/ship-type';

export type MaintenanceShipAmount = {
  type: ShipType;
  amount: number;
};

export type MaintenanceBombAmount = {
  type: DefenceType;
  amount: number;
};

export type MaintenanceTransferPayload = {
  fuel: number;
  ships: MaintenanceShipAmount[];
  bombs: MaintenanceBombAmount[];
};

export type MaintenanceRequest = {
  requestId: number;
  fleetId: number;
  fromPlayerId: number;
  toPlayerId: number;
  targetPlanetName: string;
  targetCoordinates: { x: number; y: number; z: number };
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
  requested: MaintenanceTransferPayload;
  approved: MaintenanceTransferPayload | null;
};

export function createMaintenanceRequest(
  requestId: number,
  fleetId: number,
  fromPlayerId: number,
  toPlayerId: number,
  targetPlanetName: string,
  targetCoordinates: { x: number; y: number; z: number },
  createdTurn: number,
  expiresOnTurn: number,
  requested: MaintenanceTransferPayload
): MaintenanceRequest {
  return {
    requestId,
    fleetId,
    fromPlayerId,
    toPlayerId,
    targetPlanetName,
    targetCoordinates: { ...targetCoordinates },
    createdTurn: Math.max(0, Math.floor(createdTurn)),
    expiresOnTurn: Math.max(Math.floor(createdTurn), Math.floor(expiresOnTurn)),
    state: DiplomaticProposalState.PENDING,
    requested: normalizeMaintenanceTransferPayload(requested),
    approved: null
  };
}

export function normalizeMaintenanceTransferPayload(
  payload: MaintenanceTransferPayload | null | undefined
): MaintenanceTransferPayload {
  return {
    fuel: Math.max(0, Math.floor(payload?.fuel ?? 0)),
    ships: normalizeShipAmounts(payload?.ships ?? []),
    bombs: normalizeBombAmounts(payload?.bombs ?? [])
  };
}

function normalizeShipAmounts(entries: MaintenanceShipAmount[]): MaintenanceShipAmount[] {
  return entries
    .map((entry) => ({
      type: entry.type,
      amount: Math.max(0, Math.floor(entry.amount))
    }))
    .filter((entry) => entry.amount > 0);
}

function normalizeBombAmounts(entries: MaintenanceBombAmount[]): MaintenanceBombAmount[] {
  return entries
    .map((entry) => ({
      type: entry.type,
      amount: Math.max(0, Math.floor(entry.amount))
    }))
    .filter((entry) => entry.amount > 0);
}
