import { DiplomaticProposalState } from '../diplomacy/diplomatic-proposal-state';
import { FleetMissionType } from '../enums/fleet-mission-type';

export type JumpGateRequest = {
  requestId: number;
  fleetId: number;
  fromPlayerId: number;
  toPlayerId: number;
  originPlanetName: string;
  originCoordinates: { x: number; y: number; z: number };
  targetPlanetName: string;
  targetCoordinates: { x: number; y: number; z: number };
  missionType: FleetMissionType;
  totalShips: number;
  createdTurn: number;
  expiresOnTurn: number;
  state: DiplomaticProposalState;
};

export function createJumpGateRequest(
  requestId: number,
  fleetId: number,
  fromPlayerId: number,
  toPlayerId: number,
  originPlanetName: string,
  originCoordinates: { x: number; y: number; z: number },
  targetPlanetName: string,
  targetCoordinates: { x: number; y: number; z: number },
  missionType: FleetMissionType,
  totalShips: number,
  createdTurn: number,
  expiresOnTurn: number
): JumpGateRequest {
  return {
    requestId,
    fleetId,
    fromPlayerId,
    toPlayerId,
    originPlanetName,
    originCoordinates: { ...originCoordinates },
    targetPlanetName,
    targetCoordinates: { ...targetCoordinates },
    missionType,
    totalShips: Math.max(0, Math.floor(totalShips)),
    createdTurn: Math.max(0, Math.floor(createdTurn)),
    expiresOnTurn: Math.max(Math.floor(createdTurn), Math.floor(expiresOnTurn)),
    state: DiplomaticProposalState.PENDING
  };
}
