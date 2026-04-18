import { DiplomaticProposalState } from '../diplomacy/diplomatic-proposal-state';
import type { BombardmentPriorities } from '../bombardment/bombardment-priority';
import type { FleetMissionType } from '../enums/fleet-mission-type';
import type { ShipType } from '../enums/ship-type';
import { ResourcesPack } from '../resources-pack';

export type SupportRequestType =
  | 'RESOURCE_SUPPORT'
  | 'PLANET_REPAIR'
  | 'PLANET_DEFENSE'
  | 'ATTACK_TARGET'
  | 'BOMBARD_TARGET'
  | 'SIEGE_TARGET';

export type SupportShipAmount = {
  type: ShipType;
  amount: number;
};

export type SupportRequestBase = {
  requestId: number;
  supportType: SupportRequestType;
  fromPlayerId: number;
  toPlayerId: number;
  targetPlanetName: string;
  targetCoordinates: { x: number; y: number; z: number };
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
  acceptedTurn: number | null;
  executionDueTurn: number | null;
  executionExpiresOnTurn: number | null;
  fulfilledTurn: number | null;
  resolutionNote: string | null;
};

export type ResourceSupportRequest = SupportRequestBase & {
  supportType: 'RESOURCE_SUPPORT';
  requestedResources: ResourcesPack;
  approvedResources: ResourcesPack | null;
  reservedSourcePlanetName: string | null;
  reservedSourceCoordinates: { x: number; y: number; z: number } | null;
};

export type PlanetRepairSupportRequest = SupportRequestBase & {
  supportType: 'PLANET_REPAIR';
};

export type PlanetDefenseSupportRequest = SupportRequestBase & {
  supportType: 'PLANET_DEFENSE';
};

export type OffensiveSupportRequest = SupportRequestBase & {
  supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET';
  missionType: FleetMissionType;
  minimumShips: SupportShipAmount[];
  bombardmentPriorities: BombardmentPriorities | null;
  targetOwnerPlayerId: number | null;
  targetOwnerPlayerName: string | null;
  launchedFleetId: number | null;
  launchOriginPlanetName: string | null;
  launchOriginCoordinates: { x: number; y: number; z: number } | null;
};

export type SupportRequest =
  | ResourceSupportRequest
  | PlanetRepairSupportRequest
  | PlanetDefenseSupportRequest
  | OffensiveSupportRequest;

export function createSupportRequest(
  requestId: number,
  fromPlayerId: number,
  toPlayerId: number,
  supportType: SupportRequestType,
  targetPlanetName: string,
  targetCoordinates: { x: number; y: number; z: number },
  createdTurn: number,
  expiresOnTurn: number,
  requestedResources?: ResourcesPack | null,
  options?: {
    missionType?: FleetMissionType | null;
    minimumShips?: SupportShipAmount[] | null;
    bombardmentPriorities?: BombardmentPriorities | null;
    targetOwnerPlayerId?: number | null;
    targetOwnerPlayerName?: string | null;
  }
): SupportRequest {
  const base: SupportRequestBase = {
    requestId,
    supportType,
    fromPlayerId,
    toPlayerId,
    targetPlanetName,
    targetCoordinates: { ...targetCoordinates },
    createdTurn: Math.max(0, Math.floor(createdTurn)),
    expiresOnTurn: Math.max(Math.floor(createdTurn), Math.floor(expiresOnTurn)),
    state: DiplomaticProposalState.PENDING,
    acceptedTurn: null,
    executionDueTurn: null,
    executionExpiresOnTurn: null,
    fulfilledTurn: null,
    resolutionNote: null
  };

  if (supportType === 'RESOURCE_SUPPORT') {
    return {
      ...base,
      supportType,
      requestedResources: normalizeSupportResources(requestedResources),
      approvedResources: null,
      reservedSourcePlanetName: null,
      reservedSourceCoordinates: null
    };
  }

  if (supportType === 'ATTACK_TARGET' || supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET') {
    return {
      ...base,
      supportType,
      missionType: options?.missionType ?? inferMissionTypeForSupportRequest(supportType),
      minimumShips: normalizeSupportShipAmounts(options?.minimumShips ?? []),
      bombardmentPriorities: options?.bombardmentPriorities ?? null,
      targetOwnerPlayerId: options?.targetOwnerPlayerId ?? null,
      targetOwnerPlayerName: options?.targetOwnerPlayerName ?? null,
      launchedFleetId: null,
      launchOriginPlanetName: null,
      launchOriginCoordinates: null
    };
  }

  return {
    ...base,
    supportType
  };
}

export function normalizeSupportResources(
  value: ResourcesPack | { metal?: number; crystal?: number; deuterium?: number } | null | undefined
): ResourcesPack {
  return new ResourcesPack(
    normalizeResourceAmount(value?.metal),
    normalizeResourceAmount(value?.crystal),
    normalizeResourceAmount(value?.deuterium)
  );
}

export function supportResourcesHasAnyValue(value: ResourcesPack | null | undefined): boolean {
  return (value?.metal ?? 0) > 0 || (value?.crystal ?? 0) > 0 || (value?.deuterium ?? 0) > 0;
}

export function clampSupportResourcesToRequested(
  requestedApproval: ResourcesPack | { metal?: number; crystal?: number; deuterium?: number } | null | undefined,
  requested: ResourcesPack
): ResourcesPack {
  const normalizedApproval = normalizeSupportResources(requestedApproval);
  return new ResourcesPack(
    Math.min(normalizedApproval.metal, requested.metal),
    Math.min(normalizedApproval.crystal, requested.crystal),
    Math.min(normalizedApproval.deuterium, requested.deuterium)
  );
}

export function normalizeSupportShipAmounts(
  entries: SupportShipAmount[] | null | undefined
): SupportShipAmount[] {
  return (entries ?? [])
    .map((entry) => ({
      type: entry.type,
      amount: normalizeResourceAmount(entry.amount)
    }))
    .filter((entry) => entry.amount > 0);
}

export function supportShipAmountsHaveAnyValue(entries: SupportShipAmount[] | null | undefined): boolean {
  return normalizeSupportShipAmounts(entries).length > 0;
}

function inferMissionTypeForSupportRequest(
  supportType: OffensiveSupportRequest['supportType']
): FleetMissionType {
  switch (supportType) {
    case 'ATTACK_TARGET':
      return 'ATTACK' as FleetMissionType;
    case 'BOMBARD_TARGET':
      return 'BOMBARD' as FleetMissionType;
    case 'SIEGE_TARGET':
      return 'SIEGE' as FleetMissionType;
  }
}

function normalizeResourceAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}
