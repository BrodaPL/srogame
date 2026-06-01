import type { FleetMissionType } from '../enums/fleet-mission-type';

export type FleetOperationOutcomeType =
  | 'ATTACK'
  | 'BOMBARD'
  | 'SIEGE'
  | 'TRANSPORT'
  | 'ARMAMENT_DELIVERY'
  | 'COLONIZE'
  | 'RECYCLE'
  | 'REPAIR'
  | 'RETURN'
  | 'FAILURE'
  | 'DESTROYED';

export type FleetOperationHistoryEntry = {
  fleetId: number;
  ownerId: number;
  missionType: FleetMissionType;
  origin: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  originPlanetName?: string | null;
  targetPlanetName?: string | null;
  createdAtTurn: number;
  resolvedTurn: number;
  outcomeType: FleetOperationOutcomeType;
  launchSummary: string;
  resultSummary: string;
  payload?: Record<string, unknown>;
  deltas?: Record<string, unknown>;
  terminal?: boolean;
};
