import { Destination } from './destination';
import { FleetMissionType } from '../enums/fleet-mission-type';
import { ManyShips } from './many-ships';
import { ResourcesPack } from '../resources-pack';
import { ManyDefences } from '../defences/many-defences';
import type { BombardmentPriorities } from '../bombardment/bombardment-priority';

export enum FleetState {
  PENDING_JUMP_GATE = 'PENDING_JUMP_GATE',
  MOVING_TO_TARGET = 'MOVING_TO_TARGET',
  ORBITING = 'ORBITING',
  RETURNING = 'RETURNING',
  MISSION_FAILURE_RETURNING = 'MISSION_FAILURE_RETURNING'
}

export enum FleetOrbitActivity {
  IDLE = 'IDLE',
  MISSION_IN_PROGRESS = 'MISSION_IN_PROGRESS',
  PASSIVE_HOLD = 'PASSIVE_HOLD',
  GUARDING = 'GUARDING'
}

export enum FleetReturnReason {
  NORMAL = 'NORMAL',
  MANUAL_RECALL = 'MANUAL_RECALL',
  MISSION_FAILURE = 'MISSION_FAILURE'
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
    public carriedBombs: ManyDefences = ManyDefences.empty(),
    public orbitActivity: FleetOrbitActivity = FleetOrbitActivity.IDLE,
    public suspendedMissionType: FleetMissionType | null = null,
    public returnReason: FleetReturnReason = FleetReturnReason.NORMAL,
    public maintenanceRequestAvailable: boolean = false,
    public pendingMaintenanceRequestId: number | null = null,
    public usesJumpGate: boolean = false,
    public pendingJumpGateRequestId: number | null = null,
    public lastMaintenanceRequestTurn: number | null = null,
    public bombardmentPriorities: BombardmentPriorities | null = null,
    public remainingFuelReserve: number = fuelCost
  ) {}
}
