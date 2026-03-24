import type {
  ClientPlanetDto,
  CreateFleetBombSelectionEntry,
  CreateFleetShipSelectionEntry,
  ResourcesPackDto
} from '../game-api-types';
import { DiplomaticStatus } from '../diplomacy/diplomatic-status';
import type { DiplomacyResolver } from '../diplomacy/diplomacy-resolver';
import type { Ship } from '../fleets/ship';
import type { Fleet } from '../fleets/fleet';
import type { Planet } from '../planets/planet';
import type { Player } from '../player';

export type MissionSelection = {
  ships: CreateFleetShipSelectionEntry[];
  carriedBombs: CreateFleetBombSelectionEntry[];
  cargo: ResourcesPackDto;
};

export type MissionSelectionContext = {
  selection: MissionSelection;
};

export type MissionPlannerContext = MissionSelectionContext & {
  selectedOriginPlanet: ClientPlanetDto | null;
  selectedTargetPlanet: ClientPlanetDto | null;
  activeFleetCount: number;
  maxActiveFleetCount: number;
  totalSelectedShips: number;
  totalCargoCapacity: number;
  usedCargoCapacity: number;
  totalHangarCapacity: number;
  usedHangarCapacity: number;
  hasMilitaryShips: boolean;
  availableDeuterium: number | null;
  fuelCost: number;
  diplomacyResolver?: DiplomacyResolver | null;
};

export type MissionLaunchContext = MissionSelectionContext & {
  playerId: number;
  originPlanet: Planet;
  targetPlanet: Planet;
  targetOwner?: Player | null;
  activeFleetCount: number;
  maxActiveFleetCount: number;
  totalCargoCapacity: number;
  usedCargoCapacity: number;
  totalHangarCapacity: number;
  usedHangarCapacity: number;
  hasMilitaryShips: boolean;
  fuelCost: number;
  diplomacyResolver?: DiplomacyResolver | null;
};

export type MissionReportContext = {
  fleet: Fleet;
  resolvedTurnNumber: number;
  player: Player;
};

export type MissionResolutionContext = {
  fleet: Fleet;
  owner: Player | null;
  targetOwner: Player | null;
  originPlanet: Planet | null;
  targetPlanet: Planet | null;
  resolvedTurnNumber: number;
  diplomacyResolver?: DiplomacyResolver | null;
};

export type MissionShipSelectionRowContext = {
  shipType: string;
  ship: Ship;
};

export function cargoAmount(cargo: ResourcesPackDto): number {
  return cargo.metal + cargo.crystal + cargo.deuterium;
}

export function resolveTargetDiplomaticStatus(
  playerOwnerId: number | null,
  targetOwnerId: number | null,
  diplomacyResolver?: DiplomacyResolver | null
): DiplomaticStatus | null {
  if (targetOwnerId === null) {
    return null;
  }

  if (diplomacyResolver) {
    return diplomacyResolver.getStatus(playerOwnerId, targetOwnerId);
  }

  if (playerOwnerId !== null && playerOwnerId === targetOwnerId) {
    return DiplomaticStatus.SELF;
  }

  return DiplomaticStatus.WAR;
}
