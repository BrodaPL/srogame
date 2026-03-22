import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetState } from '../../fleets/fleet';
import { ShipType } from '../../enums/ship-type';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionLaunchContext, MissionPlannerContext, MissionResolutionContext } from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';

export class RepairFleetMission extends FleetMission {
  public override participatesInEncounter(): boolean {
    return false;
  }

  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addRepairChecks(
      checks,
      context.selectedOriginPlanet?.info.ownerId ?? null,
      context.selectedTargetPlanet?.info.ownerId ?? null,
      context.selection.ships,
      context.diplomacyResolver ?? null
    );
    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    this.addRepairChecks(
      checks,
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.selection.ships,
      context.diplomacyResolver ?? null
    );
    return checks;
  }

  public override resolveWithoutEncounter(context: MissionResolutionContext): MissionResolutionResult {
    if (!context.targetPlanet) {
      return this.failedArrival('Repair mission failed because the target was no longer available on arrival.');
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    if (targetStatus === DiplomaticStatus.WAR) {
      return this.failedArrival('Repair mission failed because the target was hostile on arrival.');
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.IDLE,
      resetCreatedAtTurn: true,
      effects: [{ type: 'setFleetIdleAtTarget' }],
      reports: [{
        kind: 'success',
        body: `Repair mission established orbit over ${context.targetPlanet.basicInfo.name}.`
      }]
    };
  }

  private addRepairChecks(
    checks: MissionCheck[],
    playerOwnerId: number | null,
    targetOwnerId: number | null,
    selection: MissionPlannerContext['selection']['ships'],
    diplomacyResolver: MissionPlannerContext['diplomacyResolver'] | null
  ): void {
    const targetStatus = resolveTargetDiplomaticStatus(
      playerOwnerId,
      targetOwnerId,
      diplomacyResolver ?? null
    );
    if (targetOwnerId !== null && targetStatus === DiplomaticStatus.WAR) {
      checks.push({ text: 'Repair mission target cannot be hostile.', severity: 'error' });
    }

    const repairDroneAmount = selection.reduce((total, entry) => (
      entry.type === ShipType.REPAIR_DRONE
        ? total + entry.undamagedAmount + entry.damagedAmount
        : total
    ), 0);
    if (repairDroneAmount <= 0) {
      checks.push({ text: 'Select at least one Repair Drone.', severity: 'error' });
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
