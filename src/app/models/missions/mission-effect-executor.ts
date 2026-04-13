import { EspionageReportGenerator } from '../../generators/espionage-report-generator';
import { BuildingType } from '../enums/building-type';
import { ShipType } from '../enums/ship-type';
import { ManyShips } from '../fleets/many-ships';
import { ResourcesPack } from '../resources-pack';
import type { Galaxy } from '../planets/galaxy';
import { claimPlanetForPlayer } from '../planets/planet-ownership';
import type { Planet } from '../planets/planet';
import type { Player } from '../player';
import type { Fleet } from '../fleets/fleet';
import type { MissionEffect, MissionResolutionResult } from './mission-effect';

export type MissionEffectExecutionContext = {
  galaxy: Galaxy;
  fleet: Fleet;
  owner: Player | null;
  targetOwner: Player | null;
  originPlanet: Planet | null;
  targetPlanet: Planet | null;
  resolvedTurnNumber: number;
  espionageReportGenerator: EspionageReportGenerator;
};

export class MissionEffectExecutor {
  private static readonly COLONY_STARTING_BUILDING_LEVELS: ReadonlyArray<{
    type: BuildingType;
    level: number;
  }> = [
    { type: BuildingType.NUCLEAR_PLANT, level: 1 },
    { type: BuildingType.SOLAR_WIND_GEOTHERMAL, level: 1 },
    { type: BuildingType.ROBOTICS_FACTORY, level: 1 },
    { type: BuildingType.METAL_STORAGE, level: 1 },
    { type: BuildingType.CRYSTAL_STORAGE, level: 1 },
    { type: BuildingType.DEUTERIUM_TANK, level: 1 },
    { type: BuildingType.METAL_MINE, level: 1 },
    { type: BuildingType.CRYSTAL_MINE, level: 1 }
  ];

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
      case 'colonizeTargetPlanet':
        if (context.owner && context.targetPlanet) {
          claimPlanetForPlayer(context.galaxy, context.targetPlanet, context.owner);
          this.applyColonyStartingBuildings(context.targetPlanet);
        }
        break;
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
      case 'setFleetOrbitState':
        context.fleet.state = effect.state;
        context.fleet.orbitActivity = effect.orbitActivity;
        if (effect.missionType) {
          context.fleet.missionType = effect.missionType;
        }
        if (effect.suspendedMissionType !== undefined) {
          context.fleet.suspendedMissionType = effect.suspendedMissionType;
        }
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

  private applyColonyStartingBuildings(planet: Planet): void {
    for (const entry of MissionEffectExecutor.COLONY_STARTING_BUILDING_LEVELS) {
      if (planet.getBuildingLevel(entry.type) >= entry.level) {
        continue;
      }

      planet.setBuildingLevel(entry.type, entry.level);
    }
  }
}
