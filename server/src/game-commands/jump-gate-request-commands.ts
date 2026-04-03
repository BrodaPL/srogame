import { DiplomaticProposalState } from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import type { JumpGateRequest } from '../../../src/app/models/requests/jump-gate-request.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  commandError,
  commandOk,
  dispatchJumpGateFleet,
  resolvePlanetAtCoordinates,
  resolvePlayerById,
  restorePendingJumpGateFleetToOrigin,
  validateJumpGateLaunchAccess
} from './command-helpers.ts';

export type ResolveJumpGateRequestResult = {
  request: JumpGateRequest;
};

export function approveJumpGateRequestCommand(
  context: GameCommandContext,
  requestId: number
): CommandResult<ResolveJumpGateRequestResult> {
  const request = context.galaxy.jumpGateRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Jump Gate request not found.')
    };
  }
  if (request.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'You cannot approve this Jump Gate request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Jump Gate request is no longer pending.')
    };
  }

  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId
  ) ?? null;
  if (!fleet) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Requesting fleet is no longer available.')
    };
  }
  if (fleet.state !== 'PENDING_JUMP_GATE') {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Fleet is no longer waiting for Jump Gate approval.')
    };
  }

  const originPlanet = resolvePlanetAtCoordinates(context.galaxy, request.originCoordinates);
  const targetPlanet = resolvePlanetAtCoordinates(context.galaxy, request.targetCoordinates);
  if (!originPlanet || originPlanet.info.ownerId !== request.fromPlayerId) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Origin planet is no longer valid for this Jump Gate request.')
    };
  }
  if (!targetPlanet || targetPlanet.info.ownerId !== request.toPlayerId) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Target planet is no longer valid for this Jump Gate request.')
    };
  }

  const access = validateJumpGateLaunchAccess(
    context.galaxy,
    request.fromPlayerId,
    fleet.missionType,
    originPlanet,
    targetPlanet,
    request.totalShips
  );
  if ('error' in access) {
    return {
      ok: false,
      error: commandError(access.status as 400 | 409, 'JUMP_GATE_INVALID', access.error)
    };
  }

  request.state = DiplomaticProposalState.ACCEPTED;
  dispatchJumpGateFleet(context.galaxy, fleet);
  return commandOk({ request });
}

export function rejectJumpGateRequestCommand(
  context: GameCommandContext,
  requestId: number
): CommandResult<ResolveJumpGateRequestResult> {
  const request = context.galaxy.jumpGateRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Jump Gate request not found.')
    };
  }
  if (request.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'You cannot reject this Jump Gate request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Jump Gate request is no longer pending.')
    };
  }

  request.state = DiplomaticProposalState.REJECTED;
  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId
  ) ?? null;
  if (fleet) {
    restorePendingJumpGateFleetToOrigin(context.galaxy, fleet, true);
  }
  return commandOk({ request });
}

export function cancelJumpGateRequestCommand(
  context: GameCommandContext,
  requestId: number
): CommandResult<ResolveJumpGateRequestResult> {
  const request = context.galaxy.jumpGateRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Jump Gate request not found.')
    };
  }
  if (request.fromPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the requesting player can cancel this Jump Gate request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Jump Gate request is no longer pending.')
    };
  }

  request.state = DiplomaticProposalState.CANCELLED;
  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId
  ) ?? null;
  if (fleet) {
    restorePendingJumpGateFleetToOrigin(context.galaxy, fleet, true);
  }
  return commandOk({ request });
}
