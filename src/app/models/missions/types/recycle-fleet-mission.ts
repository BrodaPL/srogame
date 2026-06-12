import { FleetOrbitActivity, FleetState } from '../../fleets/fleet';
import type { Ship } from '../../fleets/ship';
import { encodeRuntimeText } from '../../../i18n/runtime-text.utils';
import type { MissionCheck } from '../mission-check';
import type {
  MissionLaunchContext,
  MissionPlannerContext,
  MissionResolutionContext,
} from '../mission-context';
import type { MissionResolutionResult } from '../mission-effect';
import { FleetMission } from '../fleet-mission';
import { ShipType } from '../../enums/ship-type';
import {
  calculateRecycleCapabilityForManyShips,
  calculateRecycleCapabilityFromEntries,
  hasRecycleEquipment,
} from '../../recycling/recycling-capability';

export class RecycleFleetMission extends FleetMission {
  public override isShipRelevant(_shipType: ShipType, ship: Ship): boolean {
    return ship.cargoCapacity > 0 || hasRecycleEquipment(ship) || ship.weapons.length > 0;
  }

  public override getPlannerChecks(context: MissionPlannerContext): MissionCheck[] {
    const checks = super.getPlannerChecks(context);
    this.addRecycleChecks(
      checks,
      context.selection.ships.map(
        (entry) => [entry.type, entry.undamagedAmount + entry.damagedAmount] as [ShipType, number],
      ),
      context.totalCargoCapacity,
    );

    if (
      context.selectedTargetPlanet &&
      context.selectedTargetPlanet.objects.spaceDebris.metal +
        context.selectedTargetPlanet.objects.spaceDebris.crystal +
        context.selectedTargetPlanet.objects.spaceDebris.deuterium <=
        0
    ) {
      checks.push({
        text: 'No debris detected at target. The fleet will return immediately on arrival.',
        textKey: 'missionPlanner.checks.recycleNoDebris',
        severity: 'note',
      });
    }

    return checks;
  }

  public override validateLaunch(context: MissionLaunchContext): MissionCheck[] {
    const checks = super.validateLaunch(context);
    this.addRecycleChecks(
      checks,
      context.selection.ships.map(
        (entry) => [entry.type, entry.undamagedAmount + entry.damagedAmount] as [ShipType, number],
      ),
      context.totalCargoCapacity,
    );
    return checks;
  }

  public override resolveWithoutEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    return this.resolveArrival(context);
  }

  public override resolveAfterEncounter(
    context: MissionResolutionContext,
  ): MissionResolutionResult {
    return this.resolveArrival(context);
  }

  public override resolveIdleTurn(
    context: MissionResolutionContext,
  ): MissionResolutionResult | null {
    if (!context.targetPlanet) {
      return this.failedReturn(
        encodeRuntimeText('generated.missionReports.recycle.failedTargetUnavailable'),
      );
    }

    const recycleStrength = calculateRecycleCapabilityForManyShips(context.fleet.ships);
    if (recycleStrength <= 0) {
      return this.failedReturn(
        encodeRuntimeText('generated.missionReports.recycle.failedNoEquipment'),
      );
    }

    const availableCargoCapacity = Math.max(
      0,
      context.fleet.totalCargoCapacity - context.fleet.usedCargoCapacity,
    );
    if (availableCargoCapacity <= 0) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [
          {
            kind: 'success',
            body: encodeRuntimeText('generated.missionReports.recycle.successCargoFull', {
              targetPlanet: context.targetPlanet.basicInfo.name,
            }),
          },
        ],
      };
    }

    const debris = context.targetPlanet.rBDSFTQ.spaceDebris;
    const debrisAmount = debris.getTotalResourceAmount();
    if (debrisAmount <= 0) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [
          {
            kind: 'success',
            body: encodeRuntimeText('generated.missionReports.recycle.successDebrisCleared', {
              targetPlanet: context.targetPlanet.basicInfo.name,
            }),
          },
        ],
      };
    }

    const collectedResources = this.collectDebrisInProportion(
      debris.metal,
      debris.crystal,
      debris.deuterium,
      Math.min(recycleStrength, availableCargoCapacity, debrisAmount),
    );
    const collectedAmount =
      collectedResources.metal + collectedResources.crystal + collectedResources.deuterium;
    if (collectedAmount <= 0) {
      return null;
    }

    const remainingDebris = debrisAmount - collectedAmount;
    const remainingCargoCapacity = availableCargoCapacity - collectedAmount;
    const missionFinished = remainingDebris <= 0 || remainingCargoCapacity <= 0;

    return {
      fleetOutcome: 'keep',
      nextState: missionFinished ? FleetState.RETURNING : FleetState.ORBITING,
      resetCreatedAtTurn: missionFinished,
      effects: [
        {
          type: 'collectPlanetDebrisToFleetCargo',
          resources: collectedResources,
        },
      ],
      reports: missionFinished
        ? [
            {
              kind: 'success',
              body:
                remainingDebris <= 0
                  ? encodeRuntimeText('generated.missionReports.recycle.successDebrisExhausted', {
                      targetPlanet: context.targetPlanet.basicInfo.name,
                    })
                  : encodeRuntimeText('generated.missionReports.recycle.successCargoFull', {
                      targetPlanet: context.targetPlanet.basicInfo.name,
                    }),
            },
          ]
        : [],
    };
  }

  public override onBattleRetreat(_context: MissionResolutionContext): MissionResolutionResult {
    return this.failedReturn(encodeRuntimeText('generated.missionReports.recycle.failedRetreat'));
  }

  private resolveArrival(context: MissionResolutionContext): MissionResolutionResult {
    if (!context.targetPlanet) {
      return this.failedReturn(
        encodeRuntimeText('generated.missionReports.recycle.failedTargetUnavailableArrival'),
      );
    }

    if (calculateRecycleCapabilityForManyShips(context.fleet.ships) <= 0) {
      return this.failedReturn(
        encodeRuntimeText('generated.missionReports.recycle.failedNoEquipmentArrival'),
      );
    }

    if (context.targetPlanet.rBDSFTQ.spaceDebris.getTotalResourceAmount() <= 0) {
      return {
        fleetOutcome: 'keep',
        nextState: FleetState.RETURNING,
        resetCreatedAtTurn: true,
        effects: [],
        reports: [
          {
            kind: 'success',
            body: encodeRuntimeText('generated.missionReports.recycle.successNoDebris', {
              targetPlanet: context.targetPlanet.basicInfo.name,
            }),
          },
        ],
      };
    }

    return {
      fleetOutcome: 'keep',
      resetCreatedAtTurn: true,
      effects: [
        {
          type: 'setFleetOrbitState',
          state: FleetState.ORBITING,
          orbitActivity: FleetOrbitActivity.MISSION_IN_PROGRESS,
        },
      ],
      reports: [
        {
          kind: 'success',
          body: encodeRuntimeText('generated.missionReports.recycle.successSalvageOrbit', {
            targetPlanet: context.targetPlanet.basicInfo.name,
          }),
        },
      ],
    };
  }

  private addRecycleChecks(
    checks: MissionCheck[],
    shipCounts: Array<[ShipType, number]>,
    totalCargoCapacity: number,
  ): void {
    const recycleStrength = calculateRecycleCapabilityFromEntries(shipCounts);
    if (recycleStrength <= 0) {
      checks.push({
        text: 'Select at least one ship with Recycle equipment.',
        textKey: 'missionPlanner.checks.recycleRequiresEquipment',
        severity: 'error',
      });
    }

    if (Math.max(0, totalCargoCapacity) <= 0) {
      checks.push({
        text: 'Recycle mission requires cargo space to store recovered debris.',
        textKey: 'missionPlanner.checks.recycleRequiresCargo',
        severity: 'error',
      });
    }
  }

  private collectDebrisInProportion(
    metal: number,
    crystal: number,
    deuterium: number,
    requestedAmount: number,
  ): { metal: number; crystal: number; deuterium: number } {
    const pools = [
      { key: 'metal' as const, amount: Math.max(0, Math.floor(metal)) },
      { key: 'crystal' as const, amount: Math.max(0, Math.floor(crystal)) },
      { key: 'deuterium' as const, amount: Math.max(0, Math.floor(deuterium)) },
    ];
    const totalAmount = pools.reduce((total, entry) => total + entry.amount, 0);
    const normalizedRequest = Math.max(0, Math.floor(requestedAmount));
    if (totalAmount <= 0 || normalizedRequest <= 0) {
      return { metal: 0, crystal: 0, deuterium: 0 };
    }

    if (normalizedRequest >= totalAmount) {
      return { metal: pools[0].amount, crystal: pools[1].amount, deuterium: pools[2].amount };
    }

    const allocations = pools.map((entry, index) => {
      const exactShare = (entry.amount / totalAmount) * normalizedRequest;
      const baseAmount = Math.min(entry.amount, Math.floor(exactShare));
      return {
        key: entry.key,
        index,
        amount: entry.amount,
        allocated: baseAmount,
        remainder: exactShare - baseAmount,
      };
    });

    let allocatedAmount = allocations.reduce((total, entry) => total + entry.allocated, 0);
    const remainderCandidates = [...allocations].sort(
      (left, right) =>
        right.remainder - left.remainder || right.amount - left.amount || left.index - right.index,
    );

    while (allocatedAmount < normalizedRequest) {
      let awarded = false;
      for (const candidate of remainderCandidates) {
        const target = allocations[candidate.index];
        if (target.allocated >= target.amount) {
          continue;
        }

        target.allocated += 1;
        allocatedAmount += 1;
        awarded = true;
        if (allocatedAmount >= normalizedRequest) {
          break;
        }
      }

      if (!awarded) {
        break;
      }
    }

    return {
      metal: allocations.find((entry) => entry.key === 'metal')?.allocated ?? 0,
      crystal: allocations.find((entry) => entry.key === 'crystal')?.allocated ?? 0,
      deuterium: allocations.find((entry) => entry.key === 'deuterium')?.allocated ?? 0,
    };
  }

  private failedReturn(body: string): MissionResolutionResult {
    return {
      fleetOutcome: 'keep',
      nextState: FleetState.MISSION_FAILURE_RETURNING,
      resetCreatedAtTurn: true,
      effects: [],
      reports: [{ kind: 'failure', body }],
    };
  }
}
