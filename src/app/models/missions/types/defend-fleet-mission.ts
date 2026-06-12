import { FleetOrbitActivity, FleetState } from '../../fleets/fleet';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { encodeRuntimeText } from '../../../i18n/runtime-text.utils';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type {
  MissionLaunchContext,
  MissionPlannerContext,
  MissionResolutionContext,
} from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';
import { FleetMissionType } from '../../enums/fleet-mission-type';

export class DefendFleetMission extends FleetMission {
  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addGuardChecks(checks, {
      hasMilitaryShips: context.hasMilitaryShips,
      playerOwnerId: context.selectedOriginPlanet?.info.ownerId ?? null,
      targetOwnerId: context.selectedTargetPlanet?.info.ownerId ?? null,
      diplomacyResolver: context.diplomacyResolver ?? null,
    });
    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    this.addGuardChecks(checks, {
      hasMilitaryShips: context.hasMilitaryShips,
      playerOwnerId: context.playerId,
      targetOwnerId: context.targetPlanet.info.ownerId,
      diplomacyResolver: context.diplomacyResolver ?? null,
    });
    return checks;
  }

  public override resolveWithoutEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    if (!context.targetPlanet) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [],
      };
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null,
    );

    if (
      context.targetPlanet.info.ownerId === null ||
      targetStatus === DiplomaticStatus.SELF ||
      targetStatus === DiplomaticStatus.ALLIED ||
      targetStatus === DiplomaticStatus.PEACE
    ) {
      return {
        fleetOutcome: 'keep',
        resetCreatedAtTurn: true,
        effects: [
          {
            type: 'setFleetOrbitState',
            state: FleetState.ORBITING,
            orbitActivity: FleetOrbitActivity.GUARDING,
            missionType: FleetMissionType.DEFEND,
            suspendedMissionType: null,
          },
        ],
        reports: [
          {
            kind: 'success',
            body: encodeRuntimeText('generated.missionReports.defend.successOrbit', {
              targetPlanet: context.targetPlanet.basicInfo.name,
            }),
          },
        ],
      };
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [
        {
          kind: 'failure',
          body: encodeRuntimeText('generated.missionReports.defend.failedTargetHostile'),
        },
      ],
    };
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [
        {
          kind: 'failure',
          body: encodeRuntimeText('generated.missionReports.defend.failedRetreat'),
        },
      ],
    };
  }

  private addGuardChecks(
    checks: MissionCheck[],
    context: {
      hasMilitaryShips: boolean;
      playerOwnerId: number | null;
      targetOwnerId: number | null;
      diplomacyResolver:
        | MissionPlannerContext['diplomacyResolver']
        | MissionLaunchContext['diplomacyResolver'];
    },
  ): void {
    const targetStatus = resolveTargetDiplomaticStatus(
      context.playerOwnerId,
      context.targetOwnerId,
      context.diplomacyResolver ?? null,
    );

    if (
      targetStatus !== null &&
      targetStatus !== DiplomaticStatus.SELF &&
      targetStatus !== DiplomaticStatus.ALLIED &&
      targetStatus !== DiplomaticStatus.PEACE
    ) {
      checks.push({
        text: 'Guard mission target must be your planet, a non-hostile orbit, or an unowned planet.',
        textKey: 'missionPlanner.checks.defendInvalidTarget',
        severity: 'error',
      });
    }

    if (!context.hasMilitaryShips) {
      checks.push({
        text: 'Guard requires at least one military ship.',
        textKey: 'missionPlanner.checks.defendRequiresMilitaryShip',
        severity: 'error',
      });
    }
  }
}
