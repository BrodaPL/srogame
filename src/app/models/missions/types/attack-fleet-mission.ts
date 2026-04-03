import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetState } from '../../fleets/fleet';
import { FleetMission } from '../fleet-mission';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionLaunchContext, MissionPlannerContext, MissionResolutionContext } from '../mission-context';
import type { MissionCheck } from '../mission-check';
import type { MissionResolutionResult } from '../mission-effect';

export class AttackFleetMission extends FleetMission {
  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addAttackChecks(
      checks,
      context.selectedOriginPlanet?.info.ownerId ?? null,
      context.selectedTargetPlanet?.info.ownerId ?? null,
      context.diplomacyResolver ?? null
    );
    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    this.addAttackChecks(
      checks,
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    return checks;
  }

  public override resolveWithoutEncounter(context: MissionResolutionContext): MissionResolutionResult {
    if (!context.targetPlanet) {
      return this.failedArrival('Attack mission failed because the target was no longer available on arrival.');
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    if (
      targetStatus !== DiplomaticStatus.WAR
      && targetStatus !== DiplomaticStatus.NEUTRAL
      && targetStatus !== DiplomaticStatus.PASSIVE
    ) {
      return this.failedArrival('Attack mission failed because the target was no longer attackable on arrival.');
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{
        kind: 'success',
        body: `Attack mission completed at ${context.targetPlanet.basicInfo.name} and started the return flight.`
      }]
    };
  }

  public override resolveAfterEncounter(context: MissionResolutionContext): MissionResolutionResult {
    return this.resolveWithoutEncounter(context);
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return this.failedArrival('Attack mission encountered hostile resistance and was forced to retreat.');
  }

  private addAttackChecks(
    checks: MissionCheck[],
    playerOwnerId: number | null,
    targetOwnerId: number | null,
    diplomacyResolver: MissionPlannerContext['diplomacyResolver'] | MissionLaunchContext['diplomacyResolver']
  ): void {
    const targetStatus = resolveTargetDiplomaticStatus(
      playerOwnerId,
      targetOwnerId,
      diplomacyResolver ?? null
    );
    if (
      targetOwnerId === null
      || (
        targetStatus !== DiplomaticStatus.WAR
        && targetStatus !== DiplomaticStatus.NEUTRAL
        && targetStatus !== DiplomaticStatus.PASSIVE
      )
    ) {
      checks.push({ text: 'Attack mission target must be a WAR, NEUTRAL, or PASSIVE owned planet.', severity: 'error' });
    }
  }

  private failedArrival(body: string): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{ kind: 'failure', body }]
    };
  }
}
