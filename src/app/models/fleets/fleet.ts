import { Destination } from './destination';
import { FleetMissionType } from '../enums/fleet-mission-type';
import { ShipType } from '../enums/ship-type';
import { ResourcesPack } from '../resources-pack';

export type FleetShipStack = {
  type: ShipType;
  amount: number;
};

export type FleetStatus = 'Outbound';

export class Fleet {
  constructor(
    public fleetId: number,
    public ownerId: number,
    public missionType: FleetMissionType,
    public origin: Destination,
    public target: Destination,
    public originPlanetName: string,
    public targetPlanetName: string,
    public ships: FleetShipStack[],
    public cargo: ResourcesPack,
    public fuelCost: number,
    public totalCargoCapacity: number,
    public usedCargoCapacity: number,
    public travelTurns: number,
    public returnTurns: number,
    public status: FleetStatus,
    public createdAtTurn: number
  ) {}
}
