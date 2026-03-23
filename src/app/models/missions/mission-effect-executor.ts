import { EspionageReportGenerator } from '../../generators/espionage-report-generator';
import { FleetState } from '../fleets/fleet';
import { ShipType } from '../enums/ship-type';
import { ManyShips } from '../fleets/many-ships';
import { ResourcesPack } from '../resources-pack';
import type { Planet } from '../planets/planet';
import type { Player } from '../player';
import type { Fleet } from '../fleets/fleet';
import type { MissionEffect, MissionResolutionResult } from './mission-effect';

export type MissionEffectExecutionContext = {
  fleet: Fleet;
  owner: Player | null;
  targetOwner: Player | null;
  originPlanet: Planet | null;
  targetPlanet: Planet | null;
  resolvedTurnNumber: number;
  espionageReportGenerator: EspionageReportGenerator;
};

export class MissionEffectExecutor {
  public execute(
    context: MissionEffectExecutionContext,
    resolution: MissionResolutionResult
  ): void {
    for (const effect of resolution.effects) {
      this.applyEffect(context, effect);
    }

    if (resolution.nextState) {
      context.fleet.state = resolution.nextState;
    }

    if (resolution.resetCreatedAtTurn) {
      context.fleet.createdAtTurn = context.resolvedTurnNumber;
    }
  }

  private applyEffect(
    context: MissionEffectExecutionContext,
    effect: MissionEffect
  ): void {
    switch (effect.type) {
      case 'mergeFleetToPlanet':
        this.resolvePlanet(effect.planetRef, context)?.rBDSFTQ.ships.addManyShips(context.fleet.ships);
        this.resolvePlanet(effect.planetRef, context)?.rBDSFTQ.defences.addManyDefences(context.fleet.carriedBombs);
        break;
      case 'transferFleetCargoToPlanet':
        this.resolvePlanet(effect.planetRef, context)?.rBDSFTQ.resources.addResourcePack(new ResourcesPack(
          context.fleet.cargo.metal,
          context.fleet.cargo.crystal,
          context.fleet.cargo.deuterium
        ));
        break;
      case 'clearFleetCargo':
        context.fleet.cargo = new ResourcesPack(0, 0, 0);
        context.fleet.usedCargoCapacity = 0;
        break;
      case 'setFleetIdleAtTarget':
        context.fleet.state = FleetState.IDLE;
        break;
      case 'generateEspionageReport':
        this.generateEspionageReport(context);
        break;
      case 'collectPlanetDebrisToFleetCargo':
        this.collectPlanetDebrisToFleetCargo(context, effect.resources);
        break;
      default:
        break;
    }
  }

  private resolvePlanet(
    planetRef: 'origin' | 'target',
    context: MissionEffectExecutionContext
  ): Planet | null {
    return planetRef === 'origin' ? context.originPlanet : context.targetPlanet;
  }

  private generateEspionageReport(context: MissionEffectExecutionContext): void {
    if (!context.owner || !context.targetPlanet) {
      return;
    }

    const probeAmount = ManyShips.countByType(context.fleet.ships).get(ShipType.SPY_PROBE) ?? 0;
    if (probeAmount <= 0) {
      return;
    }

    const report = context.espionageReportGenerator.createEspionageReport(
      context.owner,
      context.targetOwner,
      context.targetPlanet,
      probeAmount,
      {
        reportId: context.owner.createReportId(),
        createdTurn: context.resolvedTurnNumber
      }
    );
    context.owner.addReport(report.copy());
    context.targetPlanet.lastReportData.set(context.owner.playerId, report.copy());
  }

  private collectPlanetDebrisToFleetCargo(
    context: MissionEffectExecutionContext,
    resources: {
      metal: number;
      crystal: number;
      deuterium: number;
    }
  ): void {
    if (!context.targetPlanet) {
      return;
    }

    const collected = new ResourcesPack(
      Math.max(0, Math.floor(resources.metal)),
      Math.max(0, Math.floor(resources.crystal)),
      Math.max(0, Math.floor(resources.deuterium))
    );
    if (collected.getTotalResourceAmount() <= 0) {
      return;
    }

    context.targetPlanet.rBDSFTQ.spaceDebris.subtractResourcePack(collected);
    context.fleet.cargo.addResourcePack(collected);
    context.fleet.usedCargoCapacity = Math.min(
      context.fleet.totalCargoCapacity,
      context.fleet.usedCargoCapacity + collected.getTotalResourceAmount()
    );
  }
}
