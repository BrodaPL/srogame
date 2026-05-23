import * as diplomaticProposalStateModule from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import * as fleetModelModule from '../../../src/app/models/fleets/fleet.js';
import type { Fleet } from '../../../src/app/models/fleets/fleet.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  commandError,
  commandOk,
  restorePendingJumpGateFleetToOrigin
} from './command-helpers.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { DiplomaticProposalState } = resolveModule(diplomaticProposalStateModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-state.js');
const { FleetOrbitActivity, FleetReturnReason, FleetState } = resolveModule(fleetModelModule) as typeof import('../../../src/app/models/fleets/fleet.js');

export type ReturnActiveFleetCommand = {
  fleetId: number;
};

export type ReturnActiveFleetResult = {
  fleet: Fleet | null;
  restoredToOrigin: boolean;
};

export function returnActiveFleetCommand(
  context: GameCommandContext,
  command: ReturnActiveFleetCommand
): CommandResult<ReturnActiveFleetResult> {
  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === command.fleetId
    && entry.ownerId === context.playerId
  ) ?? null;
  if (!fleet) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Fleet not found.')
    };
  }

  if (fleet.state === FleetState.PENDING_JUMP_GATE) {
    cancelPendingJumpGateRequestForFleet(context, fleet.fleetId);
    cancelPendingMaintenanceRequestForFleet(context, fleet.fleetId);
    restorePendingJumpGateFleetToOrigin(context.galaxy, fleet, true);
    return commandOk({
      fleet: null,
      restoredToOrigin: true
    });
  }

  if (fleet.state === FleetState.RETURNING || fleet.state === FleetState.MISSION_FAILURE_RETURNING) {
    return commandOk({
      fleet,
      restoredToOrigin: false
    });
  }

  if (fleet.state !== FleetState.MOVING_TO_TARGET && fleet.state !== FleetState.ORBITING) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Fleet cannot return from its current state.')
    };
  }

  if (fleet.state === FleetState.MOVING_TO_TARGET) {
    const elapsedTravelTurns = Math.max(
      0,
      Math.min(fleet.travelTurns, context.galaxy.currentTurn - fleet.createdAtTurn)
    );
    fleet.returnTurns = Math.max(1, elapsedTravelTurns);
  }

  cancelPendingMaintenanceRequestForFleet(context, fleet.fleetId);
  fleet.state = FleetState.RETURNING;
  fleet.orbitActivity = FleetOrbitActivity.IDLE;
  fleet.suspendedMissionType = null;
  fleet.returnReason = FleetReturnReason.MANUAL_RECALL;
  fleet.createdAtTurn = context.galaxy.currentTurn;

  return commandOk({
    fleet,
    restoredToOrigin: false
  });
}

function cancelPendingJumpGateRequestForFleet(context: GameCommandContext, fleetId: number): void {
  for (const request of context.galaxy.jumpGateRequests) {
    if (
      request.fleetId === fleetId
      && request.fromPlayerId === context.playerId
      && request.state === DiplomaticProposalState.PENDING
    ) {
      request.state = DiplomaticProposalState.CANCELLED;
    }
  }
}

function cancelPendingMaintenanceRequestForFleet(context: GameCommandContext, fleetId: number): void {
  for (const request of context.galaxy.maintenanceRequests) {
    if (
      request.fleetId === fleetId
      && request.fromPlayerId === context.playerId
      && request.state === DiplomaticProposalState.PENDING
    ) {
      request.state = DiplomaticProposalState.CANCELLED;
      request.approved = null;
    }
  }
}
