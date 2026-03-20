import { FleetState } from '../../fleets/fleet';
import { ShipPurpose } from '../../enums/ship-purpose';
import { ShipType } from '../../enums/ship-type';
import type { Ship } from '../../fleets/ship';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionPlannerContext, MissionLaunchContext, MissionResolutionContext } from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';

export class TransportFleetMission extends FleetMission {
  public override isShipRelevant(_shipType: ShipType, ship: Ship): boolean {
    return ship.cargoCapacity > 0 || ship.purposes.has(ShipPurpose.CARGO);
  }

  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    const targetOwnerId = context.selectedTargetPlanet?.info.ownerId ?? null;
    const playerOwnerId = context.selectedOriginPlanet?.info.ownerId ?? null;
    const targetStatus = resolveTargetDiplomaticStatus(
      playerOwnerId,
      targetOwnerId,
      context.diplomacyResolver ?? null
    );

    if (
      targetOwnerId !== null
      && targetStatus !== DiplomaticStatus.SELF
      && targetStatus !== DiplomaticStatus.ALLIED
      && targetStatus !== DiplomaticStatus.PEACE
    ) {
      checks.push({ text: 'Transport mission target must be one of your planets or a friendly planet.', severity: 'error' });
    }

    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    const targetStatus = resolveTargetDiplomaticStatus(
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    if (
      context.targetPlanet.info.ownerId === null
      || (
        targetStatus !== DiplomaticStatus.SELF
        && targetStatus !== DiplomaticStatus.ALLIED
        && targetStatus !== DiplomaticStatus.PEACE
      )
    ) {
      checks.push({ text: 'Transport mission target must be one of your planets or a friendly planet.', severity: 'error' });
    }

    return checks;
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{
        kind: 'failure',
        body: 'Transport mission encountered hostile ships, kept its undelivered cargo, and was forced to retreat after the battle.'
      }]
    };
  }

  public override resolveWithoutEncounter(context: MissionResolutionContext): MissionResolutionResult {
    if (!context.targetPlanet) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [{
          kind: 'failure',
          body: 'Transport mission failed because the target was no longer available on arrival.'
        }]
      };
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    if (
      context.targetPlanet.info.ownerId === null
      || (
        targetStatus !== DiplomaticStatus.SELF
        && targetStatus !== DiplomaticStatus.ALLIED
        && targetStatus !== DiplomaticStatus.PEACE
      )
    ) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [{
          kind: 'failure',
          body: 'Transport mission failed because the target was no longer friendly on arrival.'
        }]
      };
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.RETURNING,
      resetCreatedAtTurn: true,
      effects: [
        { type: 'transferFleetCargoToPlanet', planetRef: 'target' },
        { type: 'clearFleetCargo' }
      ],
      reports: [{
        kind: 'success',
        body: `${context.fleet.missionType} mission completed successfully at ${context.targetPlanet.basicInfo.name}.`
      }]
    };
  }
}
