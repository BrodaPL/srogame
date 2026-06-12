import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetState } from '../../fleets/fleet';
import type { Ship } from '../../fleets/ship';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { encodeRuntimeText } from '../../../i18n/runtime-text.utils';
import { ShipPurpose } from '../../enums/ship-purpose';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type {
  MissionLaunchContext,
  MissionPlannerContext,
  MissionResolutionContext,
} from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';
import { ShipType } from '../../enums/ship-type';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export class BombardFleetMission extends FleetMission {
  public override isShipRelevant(_shipType: ShipType, ship: Ship): boolean {
    return ship.weapons.length > 0;
  }

  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addBombardChecks(
      checks,
      context.selectedOriginPlanet?.info.ownerId ?? null,
      context.selectedTargetPlanet?.info.ownerId ?? null,
      context.selection.ships,
      context.diplomacyResolver ?? null,
    );
    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    this.addBombardChecks(
      checks,
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.selection.ships,
      context.diplomacyResolver ?? null,
    );
    return checks;
  }

  public override resolveWithoutEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    if (!context.targetPlanet) {
      return this.failedArrival(
        encodeRuntimeText('generated.missionReports.bombard.failedTargetUnavailable'),
      );
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null,
    );
    if (targetStatus !== DiplomaticStatus.WAR) {
      return this.failedArrival(
        encodeRuntimeText('generated.missionReports.bombard.failedTargetNotHostile'),
      );
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [
        {
          kind: 'success',
          body: encodeRuntimeText('generated.missionReports.bombard.successHit', {
            targetPlanet: context.targetPlanet.basicInfo.name,
          }),
        },
      ],
    };
  }

  public override resolveAfterEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    return this.resolveWithoutEncounter(context);
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return this.failedArrival(encodeRuntimeText('generated.missionReports.bombard.failedRetreat'));
  }

  private addBombardChecks(
    checks: MissionCheck[],
    playerOwnerId: number | null,
    targetOwnerId: number | null,
    selection: MissionPlannerContext['selection']['ships'],
    diplomacyResolver: MissionPlannerContext['diplomacyResolver'] | null,
  ): void {
    const targetStatus = resolveTargetDiplomaticStatus(
      playerOwnerId,
      targetOwnerId,
      diplomacyResolver ?? null,
    );
    if (targetOwnerId === null || targetStatus !== DiplomaticStatus.WAR) {
      checks.push({
        text: 'Bombard mission target must be a hostile owned planet.',
        textKey: 'missionPlanner.checks.bombardInvalidTarget',
        severity: 'error',
      });
    }

    if (!this.hasBomberShips(selection)) {
      checks.push({
        text: 'BOMBARD requires at least one Bomber ship.',
        textKey: 'missionPlanner.checks.bombardRequiresBomber',
        severity: 'error',
      });
    }
  }

  private hasBomberShips(selection: MissionPlannerContext['selection']['ships']): boolean {
    return selection.some((entry) => {
      if (entry.undamagedAmount + entry.damagedAmount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(entry.type);
      return blueprint?.purposes.has(ShipPurpose.BOMBER) ?? false;
    });
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
