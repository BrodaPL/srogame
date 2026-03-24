import { DiplomaticStatus } from '../../diplomacy/diplomatic-status';
import { FleetState } from '../../fleets/fleet';
import { PlayerType } from '../../enums/player-type';
import { FleetMission } from '../fleet-mission';
import type { MissionCheck } from '../mission-check';
import { resolveTargetDiplomaticStatus } from '../mission-context';
import type { MissionLaunchContext, MissionPlannerContext, MissionResolutionContext } from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';

export class ColonizeFleetMission extends FleetMission {
  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    const targetPlanet = context.selectedTargetPlanet;
    if (!targetPlanet) {
      return checks;
    }

    if (
      targetPlanet.info.ownerPlayerType !== null
      && targetPlanet.info.ownerPlayerType !== PlayerType.NEUTRAL
    ) {
      checks.push({ text: 'Colonize mission can target only unowned planets or passive neutral planets.', severity: 'error' });
    }

    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    const targetOwner = context.targetOwner ?? null;
    const targetStatus = resolveTargetDiplomaticStatus(
      context.playerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    const canColonizePassiveNeutral = targetOwner?.type === PlayerType.NEUTRAL && targetStatus === DiplomaticStatus.PASSIVE;
    if (context.targetPlanet.info.ownerId !== null && !canColonizePassiveNeutral) {
      checks.push({ text: 'Colonize mission can target only unowned planets or passive neutral planets.', severity: 'error' });
    }

    return checks;
  }

  public override resolveWithoutEncounter(context: MissionResolutionContext): MissionResolutionResult {
    if (!context.owner || !context.targetPlanet) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [{
          kind: 'failure',
          body: 'Colonize mission failed because the target was no longer available.'
        }]
      };
    }

    const targetStatus = resolveTargetDiplomaticStatus(
      context.owner.playerId,
      context.targetPlanet.info.ownerId,
      context.diplomacyResolver ?? null
    );
    const canColonizePassiveNeutral = context.targetOwner?.type === PlayerType.NEUTRAL
      && targetStatus === DiplomaticStatus.PASSIVE;
    if (context.targetPlanet.info.ownerId !== null && !canColonizePassiveNeutral) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.MISSION_FAILURE_RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [{
          kind: 'failure',
          body: 'Colonize mission failed because the target became occupied before arrival.'
        }]
      };
    }

    return {
      fleetOutcome: 'remove',
      effects: [
        { type: 'colonizeTargetPlanet' },
        { type: 'mergeFleetToPlanet', planetRef: 'target' },
        { type: 'transferFleetCargoToPlanet', planetRef: 'target' }
      ],
      reports: [{
        kind: 'success',
        body: `Colonize mission established a new colony on ${context.targetPlanet.basicInfo.name}.`
      }]
    };
  }
}
