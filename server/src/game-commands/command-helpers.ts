import { BuildingBlueprintsFactory } from '../../../src/app/factories/building-blueprints.factory.js';
import { DefenceBlueprintsFactory } from '../../../src/app/factories/defence-blueprints.factory.js';
import { ShipBlueprintsFactory } from '../../../src/app/factories/ship-blueprints.factory.js';
import { TechnologyBlueprintsFactory } from '../../../src/app/factories/technology-blueprints.factory.js';
import { BuildingQueueEntry } from '../../../src/app/models/buildings/building-queue-entry.js';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../src/app/models/enums/defence-type.js';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { DiplomacyResolver } from '../../../src/app/models/diplomacy/diplomacy-resolver.js';
import { ShipType } from '../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } from '../../../src/app/models/fleets/fleet.js';
import { ManyShips } from '../../../src/app/models/fleets/many-ships.js';
import { calculateJumpGateCapacity } from '../../../src/app/models/jump-gates/jump-gate-capacity.js';
import { createJumpGateRequest } from '../../../src/app/models/requests/jump-gate-request.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import { ResearchHelperFor } from '../../../src/app/models/tech/research-helper-for.js';
import { maxActiveFleets } from '../../../src/app/models/tech/technology-effects.js';
import { ShipyardQueueEntry } from '../../../src/app/models/fleets/shipyard-queue-entry.js';
import { TechnologyQueueEntry } from '../../../src/app/models/tech/technology-queue-entry.js';
import { countPlanetaryBombs, isPlanetaryBombDefenceType } from '../../../src/app/models/defences/planetary-bomb.js';
import type { Building } from '../../../src/app/models/buildings/building.ts';
import type { Defence } from '../../../src/app/models/defences/defence.ts';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { FleetMissionType as FleetMissionTypeType } from '../../../src/app/models/enums/fleet-mission-type.ts';
import type { Ship } from '../../../src/app/models/fleets/ship.ts';
import type { Technology } from '../../../src/app/models/tech/technology.ts';
import type { BuildingType as BuildingTypeType } from '../../../src/app/models/enums/building-type.ts';
import type { DefenceType as DefenceTypeType } from '../../../src/app/models/enums/defence-type.ts';
import type { ShipType as ShipTypeType } from '../../../src/app/models/enums/ship-type.ts';
import type { TechnologyType as TechnologyTypeType } from '../../../src/app/models/enums/technology-type.ts';
import type { ClientCoordinates } from '../../../src/app/models/game-api-types.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { ManyShips as ManyShipsType, ShipSelectionEntry as ShipSelectionEntryType } from '../../../src/app/models/fleets/many-ships.ts';
import type { JumpGateRequest } from '../../../src/app/models/requests/jump-gate-request.ts';
import type { CommandResult, GameCommandError, GameCommandErrorCode } from './command-result.ts';
import type { GameCommandContext } from './command-context.ts';

export const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();
export const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();
export const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
export const TECHNOLOGY_BLUEPRINTS = TechnologyBlueprintsFactory.fromDefaultJson();

export function commandError(
  status: GameCommandError['status'],
  code: GameCommandErrorCode,
  message: string
): GameCommandError {
  return { status, code, message };
}

export function commandOk<T>(value: T): CommandResult<T> {
  return { ok: true, value };
}

export function resolvePlayerOrError(context: GameCommandContext): CommandResult<Player> {
  const player = context.galaxy.players.find((entry) => entry.playerId === context.playerId) ?? null;
  if (!player) {
    return {
      ok: false,
      error: commandError(404, 'PLAYER_NOT_FOUND', 'Player not found in galaxy.')
    };
  }

  return commandOk(player);
}

export function resolveSystemOrError(
  galaxy: Galaxy,
  x: number,
  y: number
): CommandResult<Galaxy['stars'][number][number]> {
  const system = galaxy.stars[y]?.[x];
  if (!system) {
    return {
      ok: false,
      error: commandError(404, 'SYSTEM_NOT_FOUND', 'Star system not found.')
    };
  }

  return commandOk(system);
}

export function resolvePlanetOrError(
  galaxy: Galaxy,
  coordinates: ClientCoordinates
): CommandResult<Planet> {
  const systemResult = resolveSystemOrError(galaxy, coordinates.x, coordinates.y);
  if (!systemResult.ok) {
    return systemResult;
  }

  const planet = systemResult.value.planets[coordinates.z];
  if (!planet) {
    return {
      ok: false,
      error: commandError(404, 'PLANET_NOT_FOUND', 'Planet not found.')
    };
  }

  return commandOk(planet);
}

export function resolvePlanetAtCoordinates(
  galaxy: Galaxy,
  coordinates: ClientCoordinates
): Planet | null {
  return galaxy.stars[coordinates.y]?.[coordinates.x]?.planets[coordinates.z] ?? null;
}

export function resolveOwnedPlanetOrError(
  context: GameCommandContext,
  coordinates: ClientCoordinates
): CommandResult<Planet> {
  const planetResult = resolvePlanetOrError(context.galaxy, coordinates);
  if (!planetResult.ok) {
    return planetResult;
  }

  if (planetResult.value.info.ownerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only your own planets can be modified.')
    };
  }

  return planetResult;
}

export function calculateMaxBuildingQueueLength(planet: Planet, player: Player): number {
  const roboticsFactoryLevel = planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY as BuildingTypeType);
  const computerTechnologyLevel = player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY as TechnologyTypeType);
  const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechnologyLevel + roboticsFactoryLevel));
  return Math.max(1, Math.floor(rawLimit));
}

export function calculateMaxShipyardQueueLength(planet: Planet, player: Player): number {
  const shipyardLevel = planet.getBuildingLevel(BuildingType.SHIPYARD as BuildingTypeType);
  const computerTechnologyLevel = player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY as TechnologyTypeType);
  const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechnologyLevel + shipyardLevel));
  return Math.max(1, Math.floor(rawLimit));
}

export function calculateMaxLabsPerTechnology(player: Player): number {
  const irnLevel = player.getTechLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK as TechnologyTypeType);
  const rawLimit = Math.floor((1.5 * Math.sqrt(Math.max(0, irnLevel))) + 1);
  return Math.max(1, rawLimit);
}

export function hasBuildingRequirements(
  planet: Planet,
  building: Building,
  nextLevel: number
): boolean {
  for (const requirement of building.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasTechnologyRequirements(player: Player, building: Building, nextLevel: number): boolean {
  for (const requirement of building.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasResearchBuildingRequirements(
  planet: Planet,
  technology: Technology,
  nextLevel: number
): boolean {
  for (const requirement of technology.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasResearchTechnologyRequirements(
  player: Player,
  technology: Technology,
  nextLevel: number
): boolean {
  for (const requirement of technology.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasShipBuildingRequirements(planet: Planet, ship: Ship): boolean {
  for (const requirement of ship.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasShipTechnologyRequirements(player: Player, ship: Ship): boolean {
  for (const requirement of ship.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasDefenceBuildingRequirements(planet: Planet, defence: Defence): boolean {
  for (const requirement of defence.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function hasDefenceTechnologyRequirements(player: Player, defence: Defence): boolean {
  for (const requirement of defence.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

export function sameCoordinates(left: ClientCoordinates, right: ClientCoordinates): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

export function toCoordinatesId(coordinates: ClientCoordinates): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

export function multiplyResourcePack(base: ResourcesPackType, amount: number): ResourcesPack {
  return new ResourcesPack(
    base.metal * amount,
    base.crystal * amount,
    base.deuterium * amount
  );
}

export function resolvePlayerById(galaxy: Galaxy, playerId: number): Player | null {
  return galaxy.players.find((player) => player.playerId === playerId) ?? null;
}

export function calculatePlayerMaxActiveFleets(player: Player): number {
  return maxActiveFleets(player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY as TechnologyTypeType));
}

export function countPlanetUndamagedShipsByType(planet: Planet): Map<ShipTypeType, number> {
  return ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
}

export function countPlanetDamagedShipsByType(planet: Planet): Map<ShipTypeType, number> {
  return ManyShips.damagedCountByType(planet.rBDSFTQ.ships);
}

export function countPlanetBombsByType(planet: Planet): Map<DefenceTypeType, number> {
  const counts = new Map<DefenceTypeType, number>();
  for (const [type, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
    if (!isPlanetaryBombDefenceType(type)) {
      continue;
    }

    counts.set(type, amount);
  }

  return counts;
}

export function toShipAmountEntriesFromSelections(
  ships: Array<Pick<ShipSelectionEntryType, 'type' | 'undamagedAmount' | 'damagedAmount'>>
): Array<{ type: ShipTypeType; amount: number }> {
  return ships.map((ship) => ({
    type: ship.type,
    amount: ship.undamagedAmount + ship.damagedAmount
  }));
}

export function toManyShipsFromShipAmounts(
  ships: Array<{ type: ShipTypeType; amount: number }>
): ManyShipsType {
  const manyShips = ManyShips.empty();
  for (const ship of ships) {
    manyShips.addUndamaged(ship.type, ship.amount);
  }

  return manyShips;
}

export function calculateBombHangarUsage(bombs: Array<{ type: DefenceTypeType; amount: number }>): number {
  let total = 0;
  for (const bomb of bombs) {
    const blueprint = DEFENCE_BLUEPRINTS.defencesMap.get(bomb.type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.size) * Math.max(0, bomb.amount);
  }

  return total;
}

export function calculateFleetCargoCapacity(ships: Array<{ type: ShipTypeType; amount: number }>): number {
  let capacity = 0;
  for (const ship of ships) {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(ship.type);
    if (!blueprint) {
      continue;
    }

    capacity += blueprint.cargoCapacity * ship.amount;
  }

  return capacity;
}

export function calculateTravelDistance(origin: ClientCoordinates, target: ClientCoordinates): number {
  return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
}

export function calculateFuelCost(
  ships: Array<{ type: ShipTypeType; amount: number }>,
  distance: number,
  multiplier = 1
): number {
  let totalFuel = 0;
  for (const ship of ships) {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(ship.type);
    if (!blueprint || !blueprint.canJump) {
      continue;
    }

    totalFuel += blueprint.jumpCost * Math.max(1, distance) * ship.amount;
  }

  return Math.max(0, totalFuel * Math.max(1, multiplier));
}

export function resolveDiplomaticStatus(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number
): DiplomaticStatusType {
  return new DiplomacyResolver(galaxy.diplomaticRelations).getStatus(leftPlayerId, rightPlayerId);
}

export function isJumpGateMissionAllowed(missionType: FleetMissionTypeType): boolean {
  return missionType === FleetMissionType.MOVE
    || missionType === FleetMissionType.DEFEND
    || missionType === FleetMissionType.TRANSPORT;
}

export function isJumpGateAutoApprovedStatus(status: DiplomaticStatusType): boolean {
  return status === DiplomaticStatus.SELF || status === DiplomaticStatus.PASSIVE;
}

export function resolveJumpGateCapacityForPlanet(planet: Planet, owner: Player | null): number {
  const hyperspaceTechnologyLevel = owner?.getTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY as TechnologyTypeType) ?? 0;
  return calculateJumpGateCapacity(
    planet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType),
    planet.info.planetaryParameters.hyperspaceParameters,
    hyperspaceTechnologyLevel,
    planet.getBuildingEffectiveness(BuildingType.JUMP_GATE as BuildingTypeType)
  );
}

export function knownJumpGateLevelForViewer(planet: Planet, viewerPlayerId: number): number {
  if (planet.info.ownerId === viewerPlayerId) {
    return planet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType);
  }

  const report = planet.lastReportData.get(viewerPlayerId);
  return report?.buildingsLevels.get(BuildingType.JUMP_GATE as BuildingTypeType) ?? 0;
}

export function validateJumpGateLaunchAccess(
  galaxy: Galaxy,
  playerId: number,
  missionType: FleetMissionTypeType,
  originPlanet: Planet,
  targetPlanet: Planet,
  totalSelectedShips: number
): { status: DiplomaticStatusType; targetOwner: Player | null } | { status: number; error: string } {
  if (!isJumpGateMissionAllowed(missionType)) {
    return { status: 400, error: 'Jump Gate is available only for Move, Guard, and Transport.' };
  }

  if (totalSelectedShips <= 0) {
    return { status: 400, error: 'Select at least one ship for Jump Gate travel.' };
  }

  if (originPlanet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType) <= 0) {
    return { status: 409, error: 'Origin planet has no Jump Gate.' };
  }

  const knownTargetJumpGateLevel = knownJumpGateLevelForViewer(targetPlanet, playerId);
  if (knownTargetJumpGateLevel <= 0) {
    return { status: 409, error: 'Target Jump Gate is not known or not available.' };
  }

  if (targetPlanet.getBuildingLevel(BuildingType.JUMP_GATE as BuildingTypeType) <= 0) {
    return { status: 409, error: 'Target Jump Gate is not operational.' };
  }

  const originOwner = resolvePlayerById(galaxy, originPlanet.info.ownerId ?? playerId);
  const originCapacity = resolveJumpGateCapacityForPlanet(originPlanet, originOwner);
  if (originCapacity < totalSelectedShips) {
    return { status: 409, error: `Origin Jump Gate capacity is too low for ${totalSelectedShips} ships.` };
  }

  const targetOwner = targetPlanet.info.ownerId === null
    ? null
    : resolvePlayerById(galaxy, targetPlanet.info.ownerId);
  const targetStatus = targetOwner
    ? resolveDiplomaticStatus(galaxy, playerId, targetOwner.playerId)
    : DiplomaticStatus.SELF;
  const targetCapacity = resolveJumpGateCapacityForPlanet(targetPlanet, targetOwner);
  if (targetCapacity < totalSelectedShips) {
    return { status: 409, error: `Target Jump Gate capacity is too low for ${totalSelectedShips} ships.` };
  }

  return {
    status: targetStatus,
    targetOwner
  };
}

export function createJumpGatePendingRequest(
  galaxy: Galaxy,
  fleet: Fleet,
  targetOwner: Player,
  totalShips: number
): JumpGateRequest {
  const request = createJumpGateRequest(
    galaxy.nextJumpGateRequestId,
    fleet.fleetId,
    fleet.ownerId,
    targetOwner.playerId,
    fleet.originPlanetName,
    fleet.origin,
    fleet.targetPlanetName,
    fleet.target,
    fleet.missionType,
    totalShips,
    galaxy.currentTurn,
    galaxy.currentTurn
  );
  galaxy.nextJumpGateRequestId += 1;
  galaxy.jumpGateRequests.push(request);
  fleet.pendingJumpGateRequestId = request.requestId;
  return request;
}

export function dispatchJumpGateFleet(galaxy: Galaxy, fleet: Fleet): void {
  fleet.state = FleetState.MOVING_TO_TARGET;
  fleet.createdAtTurn = galaxy.currentTurn;
  fleet.travelTurns = 1;
  fleet.returnTurns = 1;
  fleet.pendingJumpGateRequestId = null;
  fleet.usesJumpGate = true;
}

export function restorePendingJumpGateFleetToOrigin(
  galaxy: Galaxy,
  fleet: Fleet,
  restoreFuelReserve: boolean
): void {
  fleet.pendingJumpGateRequestId = null;
  fleet.usesJumpGate = false;

  const originPlanet = resolvePlanetAtCoordinates(galaxy, fleet.origin);
  if (!originPlanet || originPlanet.info.ownerId !== fleet.ownerId) {
    fleet.state = FleetState.ORBITING;
    fleet.missionType = FleetMissionType.HOLD;
    fleet.orbitActivity = FleetOrbitActivity.PASSIVE_HOLD;
    fleet.suspendedMissionType = null;
    fleet.target = fleet.origin;
    fleet.targetPlanetName = fleet.originPlanetName;
    fleet.createdAtTurn = galaxy.currentTurn;
    fleet.returnReason = FleetReturnReason.NORMAL;
    return;
  }

  originPlanet.rBDSFTQ.ships.addManyShips(fleet.ships);
  originPlanet.rBDSFTQ.defences.addManyDefences(fleet.carriedBombs);
  originPlanet.rBDSFTQ.resources.addResourcePack(new ResourcesPack(
    fleet.cargo.metal,
    fleet.cargo.crystal,
    fleet.cargo.deuterium + (restoreFuelReserve ? fleet.fuelCost : 0)
  ));
  galaxy.activeFleets = galaxy.activeFleets.filter((entry) => entry.fleetId !== fleet.fleetId);
}

export {
  BuildingQueueEntry,
  ResearchHelperFor,
  ShipyardQueueEntry,
  TechnologyQueueEntry,
  countPlanetaryBombs,
  isPlanetaryBombDefenceType
};
