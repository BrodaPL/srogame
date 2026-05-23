import * as diplomaticProposalStateModule from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import * as diplomaticStatusEnumModule from '../../../src/app/models/diplomacy/diplomatic-status.js';
import * as fleetMissionTypeEnumModule from '../../../src/app/models/enums/fleet-mission-type.js';
import * as playerMessageModule from '../../../src/app/models/mail/player-message.js';
import * as supportRequestModule from '../../../src/app/models/requests/support-request.js';
import type { BombardmentPriorities } from '../../../src/app/models/bombardment/bombardment-priority.ts';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { FleetMissionType as FleetMissionTypeType } from '../../../src/app/models/enums/fleet-mission-type.ts';
import type { ShipType as ShipTypeType } from '../../../src/app/models/enums/ship-type.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { SupportRequest, SupportRequestType } from '../../../src/app/models/requests/support-request.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  commandError,
  commandOk,
  resolveDiplomaticStatus,
  resolvePlanetAtCoordinates,
  resolvePlayerById
} from './command-helpers.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { DiplomaticProposalState } = resolveModule(diplomaticProposalStateModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-state.js');
const { DiplomaticStatus } = resolveModule(diplomaticStatusEnumModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-status.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeEnumModule) as typeof import('../../../src/app/models/enums/fleet-mission-type.js');
const { PlayerMessage } = resolveModule(playerMessageModule) as typeof import('../../../src/app/models/mail/player-message.js');
const {
  createSupportRequest,
  normalizeSupportResources,
  supportResourcesHasAnyValue
} = resolveModule(supportRequestModule) as typeof import('../../../src/app/models/requests/support-request.js');

export type CreateSupportRequestCommand = {
  targetPlayerId: number;
  supportType: SupportRequestType;
  targetCoordinates: { x: number; y: number; z: number };
  requestedResources: Partial<ResourcesPackType> | null;
  missionType: FleetMissionTypeType | null;
  minimumShips: Array<{ type: ShipTypeType; amount: number }>;
  bombardmentPriorities: BombardmentPriorities | null;
};

export type CreateSupportRequestResult = {
  request: SupportRequest;
};

export type ResolveSupportRequestResult = {
  request: SupportRequest;
};

export function createSupportRequestCommand(
  context: GameCommandContext,
  command: CreateSupportRequestCommand
): CommandResult<CreateSupportRequestResult> {
  const requestedResources = normalizeSupportResources(command.requestedResources);
  const normalizedMinimumShips = normalizeSupportShipAmounts(command.minimumShips);
  if (context.playerId === command.targetPlayerId) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Support requests cannot target yourself.')
    };
  }

  const targetPlayer = resolvePlayerById(context.galaxy, command.targetPlayerId);
  if (!targetPlayer || targetPlayer.type === 'NEUTRAL') {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Support target not found.')
    };
  }

  const status = resolveDiplomaticStatus(context.galaxy, context.playerId, command.targetPlayerId);
  if (!isSupportRequestAllowedForStatus(command.supportType, status)) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Current diplomacy status does not allow this support request.')
    };
  }

  const targetPlanet = resolvePlanetAtCoordinates(context.galaxy, command.targetCoordinates);
  if (!targetPlanet) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Support target planet not found.')
    };
  }

  if (command.supportType === 'RESOURCE_SUPPORT' || command.supportType === 'PLANET_REPAIR' || command.supportType === 'PLANET_DEFENSE') {
    if (targetPlanet.info.ownerId !== context.playerId) {
      return {
        ok: false,
        error: commandError(409, 'CONFLICT', 'Support requests must target one of your own planets.')
      };
    }
  } else {
    if (!isKnownHostileSupportTarget(context.galaxy, context.playerId, targetPlanet, command.supportType)) {
      return {
        ok: false,
        error: commandError(409, 'CONFLICT', 'Offensive support requests require a known hostile target planet.')
      };
    }

    if (!isOffensiveSupportMissionTypeValid(command.supportType, command.missionType)) {
      return {
        ok: false,
        error: commandError(400, 'INVALID_INPUT', 'Offensive support request mission type is invalid.')
      };
    }

    if (!supportShipAmountsHaveAnyValue(normalizedMinimumShips)) {
      return {
        ok: false,
        error: commandError(400, 'INVALID_INPUT', 'Select at least one minimum ship requirement.')
      };
    }

    if (command.supportType === 'ATTACK_TARGET' && command.bombardmentPriorities !== null) {
      return {
        ok: false,
        error: commandError(400, 'INVALID_INPUT', 'Bombardment priorities are valid only for bombard and siege support requests.')
      };
    }

    const targetOwnerId = targetPlanet.info.ownerId;
    if (targetOwnerId === null || !isSupportMissionLegalForProvider(context.galaxy, command.targetPlayerId, targetOwnerId, command.supportType)) {
      return {
        ok: false,
        error: commandError(409, 'CONFLICT', 'Requested offensive target is not currently valid for the selected ally.')
      };
    }
  }

  if (command.supportType === 'RESOURCE_SUPPORT' && !supportResourcesHasAnyValue(requestedResources)) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Select at least one requested resource amount.')
    };
  }

  const duplicatePending = context.galaxy.supportRequests.some((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.fromPlayerId === context.playerId
    && request.toPlayerId === command.targetPlayerId
    && request.supportType === command.supportType
    && sameCoordinates(request.targetCoordinates, command.targetCoordinates)
  );
  if (duplicatePending) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'A matching support request is already pending for this planet.')
    };
  }

  const request = createSupportRequest(
    context.galaxy.nextSupportRequestId,
    context.playerId,
    command.targetPlayerId,
    command.supportType,
    targetPlanet.basicInfo.name,
    command.targetCoordinates,
    context.galaxy.currentTurn,
    context.galaxy.currentTurn + 2,
    command.supportType === 'RESOURCE_SUPPORT' ? requestedResources : null,
    isOffensiveSupportRequestType(command.supportType)
      ? {
        missionType: command.missionType,
        minimumShips: normalizedMinimumShips,
        bombardmentPriorities: command.bombardmentPriorities,
        targetOwnerPlayerId: targetPlanet.info.ownerId,
        targetOwnerPlayerName: targetPlanet.info.ownerId !== null
          ? resolvePlayerById(context.galaxy, targetPlanet.info.ownerId)?.playerName ?? null
          : null
      }
      : undefined
  );
  context.galaxy.nextSupportRequestId += 1;
  context.galaxy.supportRequests.push(request);
  return commandOk({ request });
}

export function approveSupportRequestCommand(
  context: GameCommandContext,
  requestId: number,
  requestedApproval: Partial<ResourcesPackType> | null
): CommandResult<ResolveSupportRequestResult> {
  const request = context.galaxy.supportRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Support request not found.')
    };
  }
  if (request.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the target player can approve this request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Support request is no longer pending.')
    };
  }

  const approval = normalizeSupportResources(requestedApproval);
  const result = approveSupportRequest(context.galaxy, request, approval);
  if ('error' in result) {
    return {
      ok: false,
      error: commandError(result.status as 400 | 403 | 404 | 409, result.status === 400 ? 'INVALID_INPUT' : 'CONFLICT', result.error)
    };
  }

  return commandOk({ request });
}

export function rejectSupportRequestCommand(
  context: GameCommandContext,
  requestId: number
): CommandResult<ResolveSupportRequestResult> {
  const request = context.galaxy.supportRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Support request not found.')
    };
  }
  if (request.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the target player can reject this request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Support request is no longer pending.')
    };
  }

  rejectSupportRequest(
    context.galaxy,
    request,
    'Support request rejected.',
    'You rejected the support request.'
  );
  return commandOk({ request });
}

function approveSupportRequest(
  galaxy: Galaxy,
  request: SupportRequest,
  requestedApproval: ResourcesPackType
): { ok: true } | { status: number; error: string } {
  if (request.supportType === 'RESOURCE_SUPPORT') {
    const approval = supportResourcesHasAnyValue(requestedApproval)
      ? clampSupportResourcesToRequested(requestedApproval, request.requestedResources)
      : request.requestedResources;
    if (!supportResourcesHasAnyValue(approval)) {
      return { status: 400, error: 'Approved support must include at least one resource.' };
    }

    const sourcePlanet = resolveBestResourceSupportSourcePlanet(galaxy, request.toPlayerId, approval);
    if (!sourcePlanet) {
      return { status: 409, error: 'No owned planet currently has enough resources to reserve this support.' };
    }

    sourcePlanet.rBDSFTQ.resources.subtractResourcePack(approval);
    request.approvedResources = approval;
    request.reservedSourcePlanetName = sourcePlanet.basicInfo.name;
    request.reservedSourceCoordinates = toPlanetCoordinates(sourcePlanet);
    request.acceptedTurn = galaxy.currentTurn;
    request.executionDueTurn = galaxy.currentTurn + 1;
    request.executionExpiresOnTurn = galaxy.currentTurn + 1;
    request.state = DiplomaticProposalState.ACCEPTED;
    request.resolutionNote = `Reserved on ${sourcePlanet.basicInfo.name}. Delivery scheduled for turn ${request.executionDueTurn}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Resource support accepted',
      `${resolvePlayerById(galaxy, request.toPlayerId)?.playerName ?? 'Support provider'} reserved ${formatResourcesPackInline(approval)} for ${request.targetPlanetName}. Delivery is scheduled for turn ${request.executionDueTurn}.`,
      `You reserved ${formatResourcesPackInline(approval)} for delivery to ${request.targetPlanetName} on turn ${request.executionDueTurn}.`
    );
    return { ok: true };
  }

  if (isOffensiveSupportRequest(request)) {
    if (!isOffensiveSupportTargetStillValid(galaxy, request)) {
      return { status: 409, error: 'Offensive support target is no longer valid.' };
    }

    request.acceptedTurn = galaxy.currentTurn;
    request.executionDueTurn = galaxy.currentTurn + 1;
    request.executionExpiresOnTurn = galaxy.currentTurn + 5;
    request.state = DiplomaticProposalState.ACCEPTED;
    request.resolutionNote = `Offensive support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`;
    addSupportRequestMessages(
      galaxy,
      request,
      'Offensive support accepted',
      `${resolvePlayerById(galaxy, request.toPlayerId)?.playerName ?? 'Support provider'} accepted the ${request.missionType} support request for ${request.targetPlanetName}. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`,
      `You accepted the ${request.missionType} support request for ${request.targetPlanetName}. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`
    );
    return { ok: true };
  }

  request.acceptedTurn = galaxy.currentTurn;
  request.executionDueTurn = galaxy.currentTurn + 1;
  request.executionExpiresOnTurn = galaxy.currentTurn + 5;
  request.state = DiplomaticProposalState.ACCEPTED;
  request.resolutionNote = request.supportType === 'PLANET_REPAIR'
    ? `Repair support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`
    : `Defense support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`;
  addSupportRequestMessages(
    galaxy,
    request,
    'Support request accepted',
    request.resolutionNote,
    request.resolutionNote
  );
  return { ok: true };
}

function rejectSupportRequest(
  galaxy: Galaxy,
  request: SupportRequest,
  requesterBody: string,
  ownerBody: string
): void {
  request.state = DiplomaticProposalState.REJECTED;
  request.resolutionNote = requesterBody;
  addSupportRequestMessages(galaxy, request, 'Support request rejected', requesterBody, ownerBody);
}

function isOffensiveSupportRequestType(
  supportType: SupportRequestType
): supportType is Extract<SupportRequestType, 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET'> {
  return supportType === 'ATTACK_TARGET' || supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET';
}

function isOffensiveSupportRequest(
  request: SupportRequest
): request is Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }> {
  return isOffensiveSupportRequestType(request.supportType);
}

function isOffensiveSupportMissionTypeValid(
  supportType: Extract<SupportRequestType, 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET'>,
  missionType: FleetMissionTypeType | null
): boolean {
  switch (supportType) {
    case 'ATTACK_TARGET':
      return missionType === FleetMissionType.ATTACK;
    case 'BOMBARD_TARGET':
      return missionType === FleetMissionType.BOMBARD;
    case 'SIEGE_TARGET':
      return missionType === FleetMissionType.SIEGE;
  }
}

function isKnownHostileSupportTarget(
  galaxy: Galaxy,
  viewerPlayerId: number,
  targetPlanet: Planet | null,
  supportType: SupportRequestType
): boolean {
  if (!targetPlanet || targetPlanet.info.ownerId === null || targetPlanet.info.ownerId === viewerPlayerId) {
    return false;
  }

  if (!targetPlanet.lastReportData.has(viewerPlayerId)) {
    return false;
  }

  return isSupportMissionLegalForProvider(galaxy, viewerPlayerId, targetPlanet.info.ownerId, supportType);
}

function isOffensiveSupportTargetStillValid(
  galaxy: Galaxy,
  request: Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }>
): boolean {
  const targetPlanet = resolvePlanetAtCoordinates(galaxy, request.targetCoordinates);
  if (!targetPlanet || targetPlanet.info.ownerId === null) {
    return false;
  }

  return isSupportMissionLegalForProvider(galaxy, request.toPlayerId, targetPlanet.info.ownerId, request.supportType);
}

function isSupportMissionLegalForProvider(
  galaxy: Galaxy,
  providerPlayerId: number,
  targetOwnerPlayerId: number,
  supportType: SupportRequestType
): boolean {
  const status = resolveDiplomaticStatus(galaxy, providerPlayerId, targetOwnerPlayerId);
  if (supportType === 'ATTACK_TARGET') {
    return status === DiplomaticStatus.WAR
      || status === DiplomaticStatus.NEUTRAL
      || status === DiplomaticStatus.PASSIVE;
  }

  if (supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET') {
    return status === DiplomaticStatus.WAR;
  }

  return isSupportRequestAllowedForStatus(supportType, status);
}

function isSupportRequestAllowedForStatus(
  supportType: SupportRequestType,
  status: DiplomaticStatusType
): boolean {
  if (
    supportType === 'RESOURCE_SUPPORT'
    || supportType === 'ATTACK_TARGET'
    || supportType === 'BOMBARD_TARGET'
    || supportType === 'SIEGE_TARGET'
  ) {
    return status === DiplomaticStatus.ALLIED;
  }

  return status === DiplomaticStatus.ALLIED || status === DiplomaticStatus.PEACE;
}

function resolveBestResourceSupportSourcePlanet(
  galaxy: Galaxy,
  ownerPlayerId: number,
  requiredResources: ResourcesPackType
): Planet | null {
  let bestPlanet: Planet | null = null;

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId !== ownerPlayerId) {
          continue;
        }

        if (!planet.rBDSFTQ.resources.isSufficient(requiredResources)) {
          continue;
        }

        if (!bestPlanet) {
          bestPlanet = planet;
          continue;
        }

        const currentValue = planet.rBDSFTQ.resources.getTotalValuedResourceAmount();
        const bestValue = bestPlanet.rBDSFTQ.resources.getTotalValuedResourceAmount();
        if (
          currentValue > bestValue
          || (currentValue === bestValue && comparePlanetCoordinates(planet, bestPlanet) < 0)
        ) {
          bestPlanet = planet;
        }
      }
    }
  }

  return bestPlanet;
}

function clampSupportResourcesToRequested(
  approved: ResourcesPackType,
  requested: ResourcesPackType
): ResourcesPackType {
  return normalizeSupportResources({
    metal: Math.min(Math.max(0, Math.floor(approved.metal)), Math.max(0, Math.floor(requested.metal))),
    crystal: Math.min(Math.max(0, Math.floor(approved.crystal)), Math.max(0, Math.floor(requested.crystal))),
    deuterium: Math.min(Math.max(0, Math.floor(approved.deuterium)), Math.max(0, Math.floor(requested.deuterium)))
  });
}

function normalizeSupportShipAmounts(
  entries: Array<{ type: ShipTypeType; amount: number }>
): Array<{ type: ShipTypeType; amount: number }> {
  return entries
    .map((entry) => ({
      type: entry.type,
      amount: Math.max(0, Math.floor(entry.amount))
    }))
    .filter((entry) => entry.amount > 0);
}

function supportShipAmountsHaveAnyValue(entries: Array<{ type: ShipTypeType; amount: number }>): boolean {
  return entries.some((entry) => entry.amount > 0);
}

function sameCoordinates(
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number }
): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function addSupportRequestMessages(
  galaxy: Galaxy,
  request: SupportRequest,
  title: string,
  requesterBody: string,
  providerBody: string
): void {
  const requester = resolvePlayerById(galaxy, request.fromPlayerId);
  const provider = resolvePlayerById(galaxy, request.toPlayerId);
  if (requester) {
    addPlayerMessage(
      requester,
      galaxy.currentTurn,
      title,
      requesterBody,
      request.toPlayerId,
      provider?.playerName ?? null
    );
  }
  if (provider) {
    addPlayerMessage(
      provider,
      galaxy.currentTurn,
      title,
      providerBody,
      request.fromPlayerId,
      requester?.playerName ?? null
    );
  }
}

function addPlayerMessage(
  recipient: Player,
  createdTurn: number,
  title: string,
  body: string,
  senderPlayerId: number | null,
  senderPlayerName: string | null
): void {
  recipient.addMessage(new PlayerMessage({
    messageId: recipient.createMessageId(),
    createdTurn,
    title,
    body,
    senderPlayerId,
    senderPlayerName
  }));
}

function formatResourcesPackInline(pack: ResourcesPackType): string {
  const entries = [
    pack.metal > 0 ? `${pack.metal} metal` : null,
    pack.crystal > 0 ? `${pack.crystal} crystal` : null,
    pack.deuterium > 0 ? `${pack.deuterium} deuterium` : null
  ].filter((entry): entry is string => !!entry);
  return entries.length > 0 ? entries.join(', ') : 'no resources';
}

function toPlanetCoordinates(planet: Planet): { x: number; y: number; z: number } {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: planet.basicInfo.order
  };
}

function comparePlanetCoordinates(left: Planet, right: Planet): number {
  return left.basicInfo.solarSystem.coordinates.x - right.basicInfo.solarSystem.coordinates.x
    || left.basicInfo.solarSystem.coordinates.y - right.basicInfo.solarSystem.coordinates.y
    || left.basicInfo.order - right.basicInfo.order;
}
