import { FleetState } from '../fleets/fleet';

export type MissionPlanetReference = 'origin' | 'target';

export type MissionEffect =
  | {
    type: 'mergeFleetToPlanet';
    planetRef: MissionPlanetReference;
  }
  | {
    type: 'transferFleetCargoToPlanet';
    planetRef: MissionPlanetReference;
  }
  | {
    type: 'clearFleetCargo';
  }
  | {
    type: 'setFleetIdleAtTarget';
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
