import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetState } from '../../fleets/fleet';
import { encodeRuntimeText } from '../../../i18n/runtime-text.utils';
import { FleetMission } from '../fleet-mission';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type {
  MissionLaunchContext,
  MissionPlannerContext,
  MissionResolutionContext,
} from '../mission-context';
import type { MissionCheck } from '../mission-check';
import type { MissionResolutionResult } from '../mission-effect';

export class AttackFleetMission extends FleetMission {
  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addAttackChecks(
      checks,
      context.selectedOriginPlanet?.info.ownerId ?? null,
      context.selectedTargetPlanet?.info.ownerId ?? null,
      context.diplomacyResolver ?? null,
    );
    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    this.addAttackChecks(
      checks,
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null,
    );
    return checks;
  }

  public override resolveWithoutEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    if (!context.targetPlanet) {
      return this.failedArrival(
        encodeRuntimeText('generated.missionReports.attack.failedTargetUnavailable'),
      );
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null,
    );
    if (
      targetStatus !== DiplomaticStatus.WAR &&
      targetStatus !== DiplomaticStatus.NEUTRAL &&
      targetStatus !== DiplomaticStatus.PASSIVE
    ) {
      return this.failedArrival(
        encodeRuntimeText('generated.missionReports.attack.failedTargetNotAttackable'),
      );
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [],
    };
  }

  public override resolveAfterEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    return this.resolveWithoutEncounter(context);
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return this.failedArrival(encodeRuntimeText('generated.missionReports.attack.failedRetreat'));
  }

  private addAttackChecks(
    checks: MissionCheck[],
    playerOwnerId: number | null,
    targetOwnerId: number | null,
    diplomacyResolver:
      | MissionPlannerContext['diplomacyResolver']
      | MissionLaunchContext['diplomacyResolver'],
  ): void {
    const targetStatus = resolveTargetDiplomaticStatus(
      playerOwnerId,
      targetOwnerId,
      diplomacyResolver ?? null,
    );
    if (
      targetOwnerId === null ||
      (targetStatus !== DiplomaticStatus.WAR &&
        targetStatus !== DiplomaticStatus.NEUTRAL &&
        targetStatus !== DiplomaticStatus.PASSIVE)
    ) {
      checks.push({
        text: 'Attack mission target must be a WAR, NEUTRAL, or PASSIVE owned planet.',
        textKey: 'missionPlanner.checks.attackInvalidTarget',
        severity: 'error',
      });
    }
  }

  private failedArrival(body: string): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{ kind: 'failure', body }],
    };
  }
}
