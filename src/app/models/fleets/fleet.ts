import { Destination } from './destination';
import { FleetMissionType } from '../enums/fleet-mission-type';
import { ManyShips } from './many-ships';
import { ResourcesPack } from '../resources-pack';
import { ManyDefences } from '../defences/many-defences';

export enum FleetState {
  MOVING_TO_TARGET = 'MOVING_TO_TARGET',
  IDLE = 'IDLE',
  RETURNING = 'RETURNING',
  MISSION_FAILURE_RETURNING = 'MISSION_FAILURE_RETURNING',
  MISSION_FAILURE_IDLE = 'MISSION_FAILURE_IDLE'
}

export class Fleet {
  constructor(
    public fleetId: number,
    public ownerId: number,
    public missionType: FleetMissionType,
    public origin: Destination,
    public target: Destination,
    public originPlanetName: string,
    public targetPlanetName: string,
    public ships: ManyShips,
    public cargo: ResourcesPack,
    public fuelCost: number,
    public totalCargoCapacity: number,
    public usedCargoCapacity: number,
    public travelTurns: number,
    public returnTurns: number,
    public state: FleetState,
    public createdAtTurn: number,
    public carriedBombs: ManyDefences = ManyDefences.empty()
  ) {}
}
