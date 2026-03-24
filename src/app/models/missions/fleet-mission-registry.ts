import { MissionBlueprintsFactory } from '../../factories/mission-blueprints.factory';
import { FleetMissionType } from '../enums/fleet-mission-type';
import type { FleetMissionBlueprints } from './fleet-mission-blueprint';
import { FleetMission } from './fleet-mission';
import { BombardFleetMission } from './types/bombard-fleet-mission';
import { ColonizeFleetMission } from './types/colonize-fleet-mission';
import { HoldFleetMission } from './types/hold-fleet-mission';
import { MoveFleetMission } from './types/move-fleet-mission';
import { RecycleFleetMission } from './types/recycle-fleet-mission';
import { RepairFleetMission } from './types/repair-fleet-mission';
import { SiegeFleetMission } from './types/siege-fleet-mission';
import { SpyFleetMission } from './types/spy-fleet-mission';
import { TransportFleetMission } from './types/transport-fleet-mission';

export class FleetMissionRegistry {
  private static readonly defaultBlueprints = MissionBlueprintsFactory.fromDefaultJson();
  private static readonly defaultRegistry = new FleetMissionRegistry(this.defaultBlueprints);

  private readonly missionByType = new Map<FleetMissionType, FleetMission>();

  constructor(private readonly blueprints: FleetMissionBlueprints) {
    this.registerReferenceMissions();
  }

  public static createDefault(): FleetMissionRegistry {
    return this.defaultRegistry;
  }

  public get(type: FleetMissionType): FleetMission | undefined {
    return this.missionByType.get(type);
  }

  public require(type: FleetMissionType): FleetMission {
    const mission = this.get(type);
    if (!mission) {
      throw new Error(`Missing mission registry entry for ${type}`);
    }

    return mission;
  }

  public supportedMissions(types: FleetMissionType[]): FleetMission[] {
    return types
      .map((type) => this.get(type))
      .filter((mission): mission is FleetMission => mission !== undefined);
  }

  private registerReferenceMissions(): void {
    const move = this.blueprints.get(FleetMissionType.MOVE);
    const transport = this.blueprints.get(FleetMissionType.TRANSPORT);
    const spy = this.blueprints.get(FleetMissionType.SPY);
    const bombard = this.blueprints.get(FleetMissionType.BOMBARD);
    const siege = this.blueprints.get(FleetMissionType.SIEGE);
    const recycle = this.blueprints.get(FleetMissionType.RECYCLE);
    const repair = this.blueprints.get(FleetMissionType.REPAIR);
    const colonize = this.blueprints.get(FleetMissionType.COLONIZE);
    const hold = this.blueprints.get(FleetMissionType.HOLD);

    if (move) {
      this.missionByType.set(move.type, new MoveFleetMission(move));
    }

    if (transport) {
      this.missionByType.set(transport.type, new TransportFleetMission(transport));
    }

    if (spy) {
      this.missionByType.set(spy.type, new SpyFleetMission(spy));
    }

    if (bombard) {
      this.missionByType.set(bombard.type, new BombardFleetMission(bombard));
    }

    if (siege) {
      this.missionByType.set(siege.type, new SiegeFleetMission(siege));
    }

    if (recycle) {
      this.missionByType.set(recycle.type, new RecycleFleetMission(recycle));
    }

    if (repair) {
      this.missionByType.set(repair.type, new RepairFleetMission(repair));
    }

    if (colonize) {
      this.missionByType.set(colonize.type, new ColonizeFleetMission(colonize));
    }

    if (hold) {
      this.missionByType.set(hold.type, new HoldFleetMission(hold));
    }
  }
}
