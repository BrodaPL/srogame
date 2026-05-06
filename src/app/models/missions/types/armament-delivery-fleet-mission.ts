import { FleetState } from '../../fleets/fleet';
import { ShipPurpose } from '../../enums/ship-purpose';
import { ShipType } from '../../enums/ship-type';
import type { Ship } from '../../fleets/ship';
import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { DefenceBlueprintsFactory } from '../../../factories/defence-blueprints.factory';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionPlannerContext, MissionLaunchContext, MissionResolutionContext } from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';
import {
  calculateArmamentDeliveryShipHangarUsage,
  countArmamentDeliveryShips,
  isArmamentDeliveryShipType
} from '../armament-delivery';

const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();

function countSelectedArmamentDeliveryShips(
  selection: MissionPlannerContext['selection'] | MissionLaunchContext['selection']
): number {
  return countArmamentDeliveryShips(selection.ships.map((entry) => ({
    type: entry.type,
    amount: entry.undamagedAmount + entry.damagedAmount
  })));
}

function calculateSelectedArmamentDeliveryHangarUsage(
  selection: MissionPlannerContext['selection'] | MissionLaunchContext['selection']
): number {
  return calculateArmamentDeliveryShipHangarUsage(selection.ships.map((entry) => ({
    type: entry.type,
    amount: entry.undamagedAmount + entry.damagedAmount
  })));
}

export class ArmamentDeliveryFleetMission extends FleetMission {
  public override isShipRelevant(shipType: ShipType, ship: Ship): boolean {
    return ship.cargoCapacity > 0
      || ship.purposes.has(ShipPurpose.CARGO)
      || ship.hangarCapacity > 0
      || isArmamentDeliveryShipType(shipType);
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

    if (targetOwnerId !== null && targetStatus !== DiplomaticStatus.SELF && targetStatus !== DiplomaticStatus.ALLIED) {
      checks.push({
        text: 'Armament Delivery mission target must be one of your planets or an allied planet.',
        severity: 'error'
      });
    }

    this.pushArmamentDeliveryChecks(checks, context.selection, context.totalHangarCapacity);
    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    const targetStatus = resolveTargetDiplomaticStatus(
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    if (context.targetPlanet.info.ownerId === null || (targetStatus !== DiplomaticStatus.SELF && targetStatus !== DiplomaticStatus.ALLIED)) {
      checks.push({
        text: 'Armament Delivery mission target must be one of your planets or an allied planet.',
        severity: 'error'
      });
    }

    this.pushArmamentDeliveryChecks(checks, context.selection, context.totalHangarCapacity);
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
        body: 'Armament Delivery mission encountered hostile ships, kept its undelivered cargo and armaments, and was forced to retreat after the battle.'
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
          body: 'Armament Delivery mission failed because the target was no longer available on arrival.'
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
      || (targetStatus !== DiplomaticStatus.SELF && targetStatus !== DiplomaticStatus.ALLIED)
    ) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [{
          kind: 'failure',
          body: 'Armament Delivery mission failed because the target was no longer valid on arrival.'
        }]
      };
    }

    return {
      fleetOutcome: 'keep',
      nextState: FleetState.RETURNING,
      resetCreatedAtTurn: true,
      effects: [
        { type: 'transferFleetCargoToPlanet', planetRef: 'target' },
        { type: 'clearFleetCargo' },
        { type: 'transferArmamentDeliveryShipsToPlanet', planetRef: 'target' },
        { type: 'transferFleetBombsToPlanet', planetRef: 'target' }
      ],
      reports: [{
        kind: 'success',
        body: `${context.fleet.missionType} mission delivered resources and armaments to ${context.targetPlanet.basicInfo.name}.`
      }]
    };
  }

  private pushArmamentDeliveryChecks(
    checks: MissionCheck[],
    selection: MissionPlannerContext['selection'] | MissionLaunchContext['selection'],
    totalHangarCapacity: number
  ): void {
    const selectedBombCount = selection.carriedBombs.reduce((total, entry) => total + Math.max(0, Math.floor(entry.amount)), 0);
    const selectedPayloadShipCount = countSelectedArmamentDeliveryShips(selection);
    const payloadCount = selectedBombCount + selectedPayloadShipCount;

    if (payloadCount <= 0) {
      checks.push({
        text: 'Armament Delivery mission requires at least one PLANETARY_BOMB or one deliverable small ship.',
        severity: 'error'
      });
    }

    if (totalHangarCapacity <= 0) {
      checks.push({
        text: 'Armament Delivery mission requires at least one carrier ship with hangar capacity.',
        severity: 'error'
      });
    }

    const payloadShipHangarUsage = calculateSelectedArmamentDeliveryHangarUsage(selection);
    const bombHangarUsage = selection.carriedBombs.reduce((total, entry) => {
      const blueprint = DEFENCE_BLUEPRINTS.get(entry.type);
      return total + ((blueprint?.size ?? 0) * Math.max(0, Math.floor(entry.amount)));
    }, 0);
    if (payloadShipHangarUsage + bombHangarUsage > totalHangarCapacity) {
      checks.push({
        text: 'Selected armament payload exceeds the fleet hangar capacity.',
        severity: 'error'
      });
    }
  }
}
