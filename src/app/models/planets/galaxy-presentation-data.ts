import { ClientPlanet } from './client-planet';
import type { Galaxy } from './galaxy';
import { GalaxyByteCell } from './galaxy-byte-cell';
import { OwnershipByteCell } from './ownership-byte-cell';
import { PlayerType } from '../enums/player-type';
import { FleetState } from '../fleets/fleet';
import { ManyShips } from '../fleets/many-ships';
import type { FleetMissionType } from '../enums/fleet-mission-type';
import type { StarSystemNote } from './star-system-note';

export type FleetRouteKind = 'OUTBOUND' | 'RETURNING';

export type FleetMovementSummary = {
  fleetId: number;
  missionType: FleetMissionType;
  state: FleetState;
  routeKind: FleetRouteKind;
  originSystemCoordinates: { x: number; y: number };
  targetSystemCoordinates: { x: number; y: number };
  currentSystemCoordinates: { x: number; y: number } | null;
  shipCount: number;
  etaTurns: number | null;
  originPlanetName: string;
  targetPlanetName: string;
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
          currentSystemCoordinates,
          shipCount: ManyShips.totalShipsCount(fleet.ships),
          etaTurns,
          originPlanetName: fleet.originPlanetName,
          targetPlanetName: fleet.targetPlanetName
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
