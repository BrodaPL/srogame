import { ClientPlanet } from './client-planet';
import type { Galaxy } from './galaxy';
import { GalaxyByteCell } from './galaxy-byte-cell';
import { OwnershipByteCell } from './ownership-byte-cell';
import { PlayerType } from '../enums/player-type';
import { FleetOrbitActivity, FleetReturnReason, FleetState } from '../fleets/fleet';
import { ManyShips } from '../fleets/many-ships';
import { ManyDefences } from '../defences/many-defences';
import type { FleetMissionType } from '../enums/fleet-mission-type';
import type { StarSystemNote } from './star-system-note';
import { calculateRepairCapabilityForManyShips } from '../repairs/ship-repair-capability';
import { calculateRecycleCapabilityForManyShips } from '../recycling/recycling-capability';
import type { ShipType } from '../enums/ship-type';
import type { DefenceType } from '../enums/defence-type';

export type FleetRouteKind = 'OUTBOUND' | 'RETURNING';

export type FleetMovementSummary = {
  fleetId: number;
  missionType: FleetMissionType;
  state: FleetState;
  orbitActivity: FleetOrbitActivity;
  returnReason: FleetReturnReason;
  routeKind: FleetRouteKind;
  originSystemCoordinates: { x: number; y: number };
  targetSystemCoordinates: { x: number; y: number };
  originCoordinates: { x: number; y: number; z: number };
  targetCoordinates: { x: number; y: number; z: number };
  currentSystemCoordinates: { x: number; y: number } | null;
  shipCount: number;
  undamagedShips: Array<{ type: ShipType; amount: number }>;
  damagedShips: Array<{ type: ShipType; amount: number; totalMissingHull: number; averageDamagePercent: number }>;
  carriedBombs: Array<{ type: DefenceType; amount: number }>;
  cargo: { metal: number; crystal: number; deuterium: number };
  usedCargoCapacity: number;
  totalCargoCapacity: number;
  fuelCost: number;
  remainingFuelReserve: number;
  travelTurns: number;
  returnTurns: number;
  createdAtTurn: number;
  etaTurns: number | null;
  originPlanetName: string;
  targetPlanetName: string;
  usesJumpGate: boolean;
  pendingJumpGateRequestId: number | null;
  maintenanceRequestAvailable: boolean;
  pendingMaintenanceRequestId: number | null;
  lastMaintenanceRequestTurn: number | null;
  repairCapability: {
    shipRepair: number;
    industryRepair: number;
    droneRepair: number;
    nonDroneShipRepair: number;
    droneEquipmentCount: number;
    nonDroneEquipmentCount: number;
  };
  recycleCapability: number;
  isRemoteOrigin: boolean;
  remoteOriginSourceFleetId: number | null;
};

export class GalaxyPresentationData {
  constructor(
    public galaxyBytes: GalaxyByteCell[][],
    public ownershipBytes: Array<Array<OwnershipByteCell | null>>,
    public ownedPlanets: ClientPlanet[],
    public ownFleetMovements: FleetMovementSummary[] = [],
    public starSystemNotes: StarSystemNote[] = []
  ) {}

  public static fromGalaxy(galaxy: Galaxy, playerId: number): GalaxyPresentationData {
    const galaxyBytes: GalaxyByteCell[][] = [];
    const ownershipBytes: Array<Array<OwnershipByteCell | null>> = [];
    const ownedPlanets: ClientPlanet[] = [];
    const playerTypeById = new Map<number, PlayerType>();

    for (const player of galaxy.players) {
      playerTypeById.set(player.playerId, player.type);
    }

    for (const row of galaxy.stars) {
      const byteRow: GalaxyByteCell[] = [];
      const ownershipRow: Array<OwnershipByteCell | null> = [];
      for (const system of row) {
        byteRow.push(GalaxyByteCell.fromSolarSystem(system));
        ownershipRow.push(OwnershipByteCell.fromSolarSystem(system, playerId, playerTypeById));
        for (let index = 0; index < system.planets.length; index += 1) {
          const planet = system.planets[index];
          if (planet.info.ownerId === playerId) {
            ownedPlanets.push(galaxy.createClientPlanet(planet, playerId));
          }
        }
      }
      galaxyBytes.push(byteRow);
      ownershipBytes.push(ownershipRow);
    }

    const ownFleetMovements = galaxy.activeFleets
      .filter((fleet) => fleet.ownerId === playerId)
      .map((fleet) => {
        const isReturning = fleet.state === FleetState.RETURNING
          || fleet.state === FleetState.MISSION_FAILURE_RETURNING;
        const currentSystemCoordinates = fleet.state === FleetState.PENDING_JUMP_GATE
          || fleet.state === FleetState.MOVING_TO_TARGET
          ? { x: fleet.origin.x, y: fleet.origin.y }
          : fleet.state === FleetState.ORBITING
            ? { x: fleet.target.x, y: fleet.target.y }
            : null;
        const etaTurns = fleet.state === FleetState.PENDING_JUMP_GATE
          ? fleet.travelTurns
          : fleet.state === FleetState.MOVING_TO_TARGET
            ? fleet.travelTurns
            : fleet.state === FleetState.RETURNING || fleet.state === FleetState.MISSION_FAILURE_RETURNING
              ? fleet.returnTurns
              : null;

        return {
          fleetId: fleet.fleetId,
          missionType: fleet.missionType,
          state: fleet.state,
          routeKind: isReturning ? 'RETURNING' : 'OUTBOUND',
          originSystemCoordinates: { x: fleet.origin.x, y: fleet.origin.y },
          targetSystemCoordinates: { x: fleet.target.x, y: fleet.target.y },
          originCoordinates: { x: fleet.origin.x, y: fleet.origin.y, z: fleet.origin.z },
          targetCoordinates: { x: fleet.target.x, y: fleet.target.y, z: fleet.target.z },
          currentSystemCoordinates,
          shipCount: ManyShips.totalShipsCount(fleet.ships),
          undamagedShips: ManyShips.groupedUndamagedEntries(fleet.ships),
          damagedShips: ManyShips.groupedDamagedEntries(fleet.ships),
          carriedBombs: ManyDefences.groupedUndamagedEntries(fleet.carriedBombs),
          cargo: {
            metal: fleet.cargo.metal,
            crystal: fleet.cargo.crystal,
            deuterium: fleet.cargo.deuterium
          },
          usedCargoCapacity: fleet.usedCargoCapacity,
          totalCargoCapacity: fleet.totalCargoCapacity,
          fuelCost: fleet.fuelCost,
          remainingFuelReserve: fleet.remainingFuelReserve,
          travelTurns: fleet.travelTurns,
          returnTurns: fleet.returnTurns,
          createdAtTurn: fleet.createdAtTurn,
          etaTurns,
          originPlanetName: fleet.originPlanetName,
          targetPlanetName: fleet.targetPlanetName,
          orbitActivity: fleet.orbitActivity,
          returnReason: fleet.returnReason,
          usesJumpGate: fleet.usesJumpGate,
          pendingJumpGateRequestId: fleet.pendingJumpGateRequestId,
          maintenanceRequestAvailable: fleet.maintenanceRequestAvailable,
          pendingMaintenanceRequestId: fleet.pendingMaintenanceRequestId,
          lastMaintenanceRequestTurn: fleet.lastMaintenanceRequestTurn,
          repairCapability: calculateRepairCapabilityForManyShips(fleet.ships),
          recycleCapability: calculateRecycleCapabilityForManyShips(fleet.ships),
          isRemoteOrigin: fleet.isRemoteOrigin,
          remoteOriginSourceFleetId: fleet.remoteOriginSourceFleetId
        } satisfies FleetMovementSummary;
      });

    return new GalaxyPresentationData(galaxyBytes, ownershipBytes, ownedPlanets, ownFleetMovements, []);
  }

  public static collectStarSystemNotes(galaxy: Galaxy, playerId: number): StarSystemNote[] {
    const starSystemNotes: StarSystemNote[] = [];

    for (const row of galaxy.stars) {
      for (const system of row) {
        const note = system.starSystemNotes.get(playerId);
        if (!note) {
          continue;
        }

        starSystemNotes.push(note);
      }
    }

    return starSystemNotes;
  }
}
