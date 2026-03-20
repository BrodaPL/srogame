import { FleetMissionType } from '../enums/fleet-mission-type';
import { ShipType } from '../enums/ship-type';
import { DiplomaticStatus } from '../diplomacy/diplomatic-status';

export type MissionEncounterLocationKind = 'planetOrbit' | 'starSystem';

export type MissionTargetRules = {
  allowedDiplomaticStatuses: DiplomaticStatus[];
  allowUnowned: boolean;
};

export type MissionShipRules = {
  requiredShipTypes: ShipType[];
  exclusiveShipTypes: ShipType[];
  allowCargo: boolean;
  requiresCargo: boolean;
};

export type FleetMissionBlueprint = {
  type: FleetMissionType;
  name: string;
  description: string;
  battleRoundsModifier: number;
  minimumFuelReserves: number;
  encounterLocationKinds: MissionEncounterLocationKind[];
  targetRules: MissionTargetRules;
  shipRules: MissionShipRules;
};

export class FleetMissionBlueprints {
  constructor(
    public readonly missionByType: Map<FleetMissionType, FleetMissionBlueprint> = new Map()
  ) {}

  public add(blueprint: FleetMissionBlueprint): void {
    this.missionByType.set(blueprint.type, blueprint);
  }

  public get(type: FleetMissionType): FleetMissionBlueprint | undefined {
    return this.missionByType.get(type);
  }
}
