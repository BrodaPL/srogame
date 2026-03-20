import missionBlueprintsData from '../blueprints/mission-blueprints.json';
import { DiplomaticStatus } from '../models/diplomacy/diplomatic-status';
import { FleetMissionType } from '../models/enums/fleet-mission-type';
import { ShipType } from '../models/enums/ship-type';
import type {
  FleetMissionBlueprint,
  MissionEncounterLocationKind
} from '../models/missions/fleet-mission-blueprint';
import { FleetMissionBlueprints } from '../models/missions/fleet-mission-blueprint';

type MissionBlueprintsJson = {
  missions: MissionBlueprintJson[];
};

type MissionBlueprintJson = {
  type: string;
  name: string;
  description: string;
  battleRoundsModifier: number;
  minimumFuelReserves: number;
  encounterLocationKinds?: string[];
  targetRules?: {
    allowedDiplomaticStatuses?: string[];
    allowUnowned?: boolean;
  };
  shipRules?: {
    requiredShipTypes?: string[];
    exclusiveShipTypes?: string[];
    allowCargo?: boolean;
    requiresCargo?: boolean;
  };
};

export class MissionBlueprintsFactory {
  public static fromDefaultJson(): FleetMissionBlueprints {
    return this.fromJson(missionBlueprintsData as MissionBlueprintsJson);
  }

  public static fromJson(data: MissionBlueprintsJson): FleetMissionBlueprints {
    const blueprints = new FleetMissionBlueprints();

    for (const entry of data.missions ?? []) {
      blueprints.add(this.toBlueprint(entry));
    }

    return blueprints;
  }

  private static toBlueprint(entry: MissionBlueprintJson): FleetMissionBlueprint {
    const targetRules = entry.targetRules ?? {};
    const shipRules = entry.shipRules ?? {};

    return {
      type: this.parseEnumKey(FleetMissionType, entry.type, 'FleetMissionType'),
      name: entry.name,
      description: entry.description,
      battleRoundsModifier: entry.battleRoundsModifier ?? 0,
      minimumFuelReserves: Math.max(0, entry.minimumFuelReserves ?? 0),
      encounterLocationKinds: (entry.encounterLocationKinds ?? []).map((kind) =>
        this.parseEncounterLocationKind(kind)
      ),
      targetRules: {
        allowedDiplomaticStatuses: (targetRules.allowedDiplomaticStatuses ?? []).map((status) =>
          this.parseEnumKey(DiplomaticStatus, status, 'DiplomaticStatus')
        ),
        allowUnowned: targetRules.allowUnowned ?? false
      },
      shipRules: {
        requiredShipTypes: (shipRules.requiredShipTypes ?? []).map((type) =>
          this.parseEnumKey(ShipType, type, 'ShipType')
        ),
        exclusiveShipTypes: (shipRules.exclusiveShipTypes ?? []).map((type) =>
          this.parseEnumKey(ShipType, type, 'ShipType')
        ),
        allowCargo: shipRules.allowCargo ?? true,
        requiresCargo: shipRules.requiresCargo ?? false
      }
    };
  }

  private static parseEncounterLocationKind(value: string): MissionEncounterLocationKind {
    if (value === 'planetOrbit' || value === 'starSystem') {
      return value;
    }

    throw new Error(`Unknown MissionEncounterLocationKind: ${value}`);
  }

  private static parseEnumKey<T extends string>(
    enumObject: Record<string, T>,
    key: string,
    label: string
  ): T {
    if (key in enumObject) {
      return enumObject[key];
    }

    throw new Error(`Unknown ${label} key: ${key}`);
  }
}
