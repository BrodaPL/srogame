import { ShipType } from '../../enums/ship-type';
import type { Ship } from '../../fleets/ship';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import type {
  MissionPlannerContext,
  MissionLaunchContext,
  MissionResolutionContext,
  MissionSelection,
  MissionSelectionContext
} from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';

export class SpyFleetMission extends FleetMission {
  public override participatesInEncounter(): boolean {
    return false;
  }

  public override normalizeSelection(context: MissionSelectionContext): MissionSelection {
    return {
      ships: context.selection.ships
        .filter((entry) => entry.type === ShipType.SPY_PROBE)
        .map((entry) => ({ ...entry })),
      carriedBombs: [],
      cargo: {
        metal: 0,
        crystal: 0,
        deuterium: 0
      }
    };
  }

  public override isShipRelevant(shipType: ShipType, _ship: Ship): boolean {
    return shipType === ShipType.SPY_PROBE;
  }

  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);

    if (context.selectedTargetPlanet && context.selectedTargetPlanet.info.ownerId === context.selectedOriginPlanet?.info.ownerId) {
      checks.push({ text: 'Target is your own planet.', severity: 'error' });
    }

    if (context.selection.ships.every((entry) => entry.type !== ShipType.SPY_PROBE)) {
      checks.push({ text: 'No espionage probes selected.', severity: 'error' });
    }

    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);

    if (context.targetPlanet.info.ownerId === context.playerId) {
      checks.push({ text: 'Target is your own planet.', severity: 'error' });
    }

    if (context.selection.ships.every((entry) => entry.type !== ShipType.SPY_PROBE)) {
      checks.push({ text: 'No espionage probes selected.', severity: 'error' });
    }

    return checks;
  }

  public override resolveWithoutEncounter(_context: MissionResolutionContext): MissionResolutionResult {
    return {
      fleetOutcome: 'remove',
      effects: [{ type: 'generateEspionageReport' }],
      reports: []
    };
  }
}
