import { FleetOrbitActivity, FleetState } from '../fleets/fleet';
import { FleetMissionType } from '../enums/fleet-mission-type';

export type MissionPlanetReference = 'origin' | 'target';

export type MissionEffect =
  | {
    type: 'colonizeTargetPlanet';
  }
  | {
    type: 'mergeFleetToPlanet';
    planetRef: MissionPlanetReference;
  }
  | {
    type: 'transferFleetCargoToPlanet';
    planetRef: MissionPlanetReference;
  }
  | {
    type: 'transferFleetBombsToPlanet';
    planetRef: MissionPlanetReference;
  }
  | {
    type: 'transferArmamentDeliveryShipsToPlanet';
    planetRef: MissionPlanetReference;
  }
  | {
    type: 'clearFleetCargo';
  }
  | {
    type: 'setFleetOrbitState';
    state: FleetState;
    orbitActivity: FleetOrbitActivity;
    missionType?: FleetMissionType;
    suspendedMissionType?: FleetMissionType | null;
  }
  | {
    type: 'generateEspionageReport';
  }
  | {
    type: 'collectPlanetDebrisToFleetCargo';
    resources: {
      metal: number;
      crystal: number;
      deuterium: number;
    };
  };

export type MissionReportKind = 'success' | 'failure' | 'draw';

export type MissionReportRequest = {
  kind: MissionReportKind;
  body: string;
};

export type MissionResolutionResult = {
  fleetOutcome: 'remove' | 'keep';
  nextState?: FleetState;
  resetCreatedAtTurn?: boolean;
  effects: MissionEffect[];
  reports: MissionReportRequest[];
};
