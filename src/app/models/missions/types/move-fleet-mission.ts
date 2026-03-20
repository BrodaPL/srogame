import { FleetState } from '../../fleets/fleet';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionPlannerContext, MissionLaunchContext, MissionResolutionContext } from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';

export class MoveFleetMission extends FleetMission {
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
      targetStatus !== null
      && targetStatus !== DiplomaticStatus.SELF
      && targetStatus !== DiplomaticStatus.ALLIED
      && targetStatus !== DiplomaticStatus.PEACE
    ) {
      checks.push({ text: 'Move mission target must be your planet, a friendly orbit, or an unowned planet.', severity: 'error' });
    }

    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    const targetOwnerId = context.targetPlanet.info.ownerId;
    const targetStatus = resolveTargetDiplomaticStatus(
      context.playerId,
      targetOwnerId,
      context.diplomacyResolver ?? null
    );
    if (
      targetOwnerId !== null
      && targetStatus !== DiplomaticStatus.SELF
      && targetStatus !== DiplomaticStatus.ALLIED
      && targetStatus !== DiplomaticStatus.PEACE
    ) {
      checks.push({ text: 'Move mission target must be your planet, a friendly orbit, or an unowned planet.', severity: 'error' });
    }

    return checks;
  }

  public override resolveWithoutEncounter(context: MissionResolutionContext): MissionResolutionResult {
    if (!context.targetPlanet) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: []
      };
    }


    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );

    if (targetStatus === DiplomaticStatus.SELF) {
      return {
        fleetOutcome: 'remove',
        effects: [
          { type: 'mergeFleetToPlanet', planetRef: 'target' },
          { type: 'transferFleetCargoToPlanet', planetRef: 'target' }
        ],
        reports: [{
          kind: 'success',
          body: `${context.fleet.missionType} mission completed successfully at ${context.targetPlanet.basicInfo.name}.`
        }]
      };
    }

    if (
      context.targetPlanet.info.ownerId === null
      || targetStatus === DiplomaticStatus.ALLIED
      || targetStatus === DiplomaticStatus.PEACE
    ) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.IDLE,
        resetCreatedAtTurn: true,
        effects: [{ type: 'setFleetIdleAtTarget' }],
        reports: targetStatus === DiplomaticStatus.ALLIED || targetStatus === DiplomaticStatus.PEACE
          ? [{
            kind: 'success',
            body: `Move mission entered friendly orbit over ${context.targetPlanet.basicInfo.name}.`
          }]
          : []
      };
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{
        kind: 'failure',
        body: 'Move mission failed because the destination became owned by another player before arrival.'
      }]
    };
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{
        kind: 'failure',
        body: 'Move mission encountered hostile ships and was forced to retreat after the battle.'
      }]
    };
  }
}
