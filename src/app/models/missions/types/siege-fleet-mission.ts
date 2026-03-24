import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetOrbitActivity, FleetState } from '../../fleets/fleet';
import type { Ship } from '../../fleets/ship';
import { ShipBlueprintsFactory } from '../../../factories/ship-blueprints.factory';
import { ShipPurpose } from '../../enums/ship-purpose';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionLaunchContext, MissionPlannerContext, MissionResolutionContext } from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';
import { ShipType } from '../../enums/ship-type';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

export class SiegeFleetMission extends FleetMission {
  public override isShipRelevant(_shipType: ShipType, ship: Ship): boolean {
    return ship.weapons.length > 0;
  }

  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addSiegeChecks(
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
    this.addSiegeChecks(
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
      return this.failedArrival('Siege mission failed because the target was no longer available on arrival.');
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.fleet.ownerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    if (targetStatus !== DiplomaticStatus.WAR) {
      return this.failedArrival('Siege mission failed because the target was no longer hostile on arrival.');
    }

    return {
      fleetOutcome: 'keep',
      resetCreatedAtTurn: true,
      effects: [{
        type: 'setFleetOrbitState',
        state: FleetState.ORBITING,
        orbitActivity: FleetOrbitActivity.MISSION_IN_PROGRESS
      }],
      reports: [{
        kind: 'success',
        body: `Siege mission established orbit over ${context.targetPlanet.basicInfo.name}.`
      }]
    };
  }

  public override resolveAfterEncounter(context: MissionResolutionContext): MissionResolutionResult {
    return this.resolveWithoutEncounter(context);
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return this.failedArrival('Siege mission encountered hostile resistance and was forced to retreat.');
  }

  private addSiegeChecks(
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
    if (targetOwnerId === null || targetStatus !== DiplomaticStatus.WAR) {
      checks.push({ text: 'Siege mission target must be a hostile owned planet.', severity: 'error' });
    }

    if (!this.hasBomberShips(selection)) {
      checks.push({ text: 'SIEGE requires at least one Bomber ship.', severity: 'error' });
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
      reports: [{ kind: 'failure', body }]
    };
  }
}
