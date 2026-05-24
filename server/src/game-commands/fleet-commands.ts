import * as diplomacyResolverModule from '../../../src/app/models/diplomacy/diplomacy-resolver.js';
import * as fleetMissionRegistryModule from '../../../src/app/models/missions/fleet-mission-registry.js';
import * as destinationModule from '../../../src/app/models/fleets/destination.js';
import * as fleetModelModule from '../../../src/app/models/fleets/fleet.js';
import * as manyShipsModule from '../../../src/app/models/fleets/many-ships.js';
import * as resourcesPackModule from '../../../src/app/models/resources-pack.js';
import * as fleetMissionTypeEnumModule from '../../../src/app/models/enums/fleet-mission-type.js';
import type {
  CreateFleetBombSelectionEntry,
  CreateFleetShipSelectionEntry,
  ClientCoordinates,
  ResourcesPackDto
} from '../../../src/app/models/game-api-types.ts';
import type { BombardmentPriorities } from '../../../src/app/models/bombardment/bombardment-priority.ts';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { FleetMissionType as FleetMissionTypeType } from '../../../src/app/models/enums/fleet-mission-type.ts';
import type { MissionLaunchContext } from '../../../src/app/models/missions/mission-context.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { Fleet as FleetType } from '../../../src/app/models/fleets/fleet.ts';
import type { ManyShips as ManyShipsType } from '../../../src/app/models/fleets/many-ships.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  SHIP_BLUEPRINTS,
  calculateBombHangarUsage,
  calculateFleetCargoCapacity,
  calculateFleetTravelTurns,
  calculatePlayerFuelCost,
  calculatePlayerMaxActiveFleets,
  calculateTravelDistance,
  commandError,
  commandOk,
  countPlanetBombsByType,
  countPlanetDamagedShipsByType,
  countPlanetUndamagedShipsByType,
  createJumpGatePendingRequest,
  dispatchJumpGateFleet,
  isJumpGateAutoApprovedStatus,
  resolvePlanetOrError,
  resolvePlayerById,
  toManyShipsFromShipAmounts,
  toShipAmountEntriesFromSelections,
  validateJumpGateLaunchAccess
} from './command-helpers.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { DiplomacyResolver } = resolveModule(diplomacyResolverModule) as typeof import('../../../src/app/models/diplomacy/diplomacy-resolver.js');
const { FleetMissionRegistry } = resolveModule(fleetMissionRegistryModule) as typeof import('../../../src/app/models/missions/fleet-mission-registry.js');
const { Destination } = resolveModule(destinationModule) as typeof import('../../../src/app/models/fleets/destination.js');
const { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } = resolveModule(fleetModelModule) as typeof import('../../../src/app/models/fleets/fleet.js');
const { ManyShips } = resolveModule(manyShipsModule) as typeof import('../../../src/app/models/fleets/many-ships.js');
const { ResourcesPack } = resolveModule(resourcesPackModule) as typeof import('../../../src/app/models/resources-pack.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeEnumModule) as typeof import('../../../src/app/models/enums/fleet-mission-type.js');

const FLEET_MISSION_REGISTRY = FleetMissionRegistry.createDefault();
const PHASE_ONE_MISSION_TYPES = new Set<FleetMissionTypeType>([
  FleetMissionType.ATTACK,
  FleetMissionType.SPY,
  FleetMissionType.MOVE,
  FleetMissionType.RECYCLE,
  FleetMissionType.DEFEND,
  FleetMissionType.TRANSPORT,
  FleetMissionType.ARMAMENT_DELIVERY,
  FleetMissionType.BOMBARD,
  FleetMissionType.SIEGE,
  FleetMissionType.REPAIR,
  FleetMissionType.COLONIZE
]);

export type CreateFleetMissionCommand = {
  missionType: FleetMissionTypeType;
  origin: ClientCoordinates;
  target: ClientCoordinates;
  ships: CreateFleetShipSelectionEntry[];
  carriedBombs: CreateFleetBombSelectionEntry[];
  cargo: ResourcesPackDto;
  useJumpGate: boolean;
  bombardmentPriorities: BombardmentPriorities | null;
};

export type CreateFleetMissionResult = {
  fleet: FleetType;
  mode: 'LAUNCHED' | 'PENDING_JUMP_GATE';
  message: string | null;
  originPlanet: Planet;
  targetPlanet: Planet;
};

export function createFleetMission(
  context: GameCommandContext,
  command: CreateFleetMissionCommand
): CommandResult<CreateFleetMissionResult> {
  if (!PHASE_ONE_MISSION_TYPES.has(command.missionType)) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Mission type is not available in phase 1.')
    };
  }

  const mission = FLEET_MISSION_REGISTRY.get(command.missionType);
  if (!mission) {
    return {
      ok: false,
      error: commandError(400, 'MISSION_INVALID', 'Mission definition not found.')
    };
  }

  const originPlanetResult = resolvePlanetOrError(context.galaxy, command.origin);
  if (!originPlanetResult.ok) {
    return {
      ok: false,
      error: {
        ...originPlanetResult.error,
        message: originPlanetResult.error.code === 'SYSTEM_NOT_FOUND'
          ? 'Origin planet not found.'
          : originPlanetResult.error.message
      }
    };
  }

  const targetPlanetResult = resolvePlanetOrError(context.galaxy, command.target);
  if (!targetPlanetResult.ok) {
    return {
      ok: false,
      error: {
        ...targetPlanetResult.error,
        message: targetPlanetResult.error.code === 'SYSTEM_NOT_FOUND'
          ? 'Target planet not found.'
          : targetPlanetResult.error.message
      }
    };
  }

  const originPlanet = originPlanetResult.value;
  const targetPlanet = targetPlanetResult.value;
  if (originPlanet.info.ownerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Origin planet must be owned by you.')
    };
  }

  const player = resolvePlayerById(context.galaxy, context.playerId);
  if (!player) {
    return {
      ok: false,
      error: commandError(404, 'PLAYER_NOT_FOUND', 'Player not found.')
    };
  }

  const playerActiveFleetCount = context.galaxy.activeFleets.filter((fleet) => fleet.ownerId === context.playerId).length;
  const playerMaxActiveFleets = calculatePlayerMaxActiveFleets(player);
  if (playerActiveFleetCount >= playerMaxActiveFleets) {
    return {
      ok: false,
      error: commandError(
        400,
        'ACTIVE_FLEET_LIMIT',
        'Active fleet limit reached. Upgrade COMPUTER_TECHNOLOGY to control more fleets.'
      )
    };
  }

  if (command.ships.length === 0) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Select at least one ship.')
    };
  }

  const availableUndamagedShipsByType = countPlanetUndamagedShipsByType(originPlanet);
  const availableDamagedShipsByType = countPlanetDamagedShipsByType(originPlanet);
  for (const ship of command.ships) {
    const availableUndamagedAmount = availableUndamagedShipsByType.get(ship.type) ?? 0;
    if (availableUndamagedAmount < ship.undamagedAmount) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', `${ship.type}: not enough ready ships on origin planet.`)
      };
    }

    const availableDamagedAmount = availableDamagedShipsByType.get(ship.type) ?? 0;
    if (availableDamagedAmount < ship.damagedAmount) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', `${ship.type}: not enough damaged ships on origin planet.`)
      };
    }
  }

  const availableBombsByType = countPlanetBombsByType(originPlanet);
  for (const bomb of command.carriedBombs) {
    const availableAmount = availableBombsByType.get(bomb.type) ?? 0;
    if (availableAmount < bomb.amount) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', `${bomb.type}: not enough bombs in BOMB_DEPOT.`)
      };
    }
  }

  const totalShipAmounts = toShipAmountEntriesFromSelections(command.ships);
  const selectedFleetShips = toManyShipsFromShipAmounts(totalShipAmounts);
  const totalHangarCapacity = ManyShips.totalTravelHangarCapacity(selectedFleetShips);
  const totalBomberHangarCapacity = ManyShips.totalBomberHangarCapacity(selectedFleetShips);
  const usedBombHangarCapacity = calculateBombHangarUsage(command.carriedBombs);
  const usedHangarCapacity = ManyShips.totalRequiredHangarCapacity(selectedFleetShips) + usedBombHangarCapacity;
  if (usedHangarCapacity > totalHangarCapacity) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Insufficient hangar space for carried ships and bombs.')
    };
  }

  if (usedBombHangarCapacity > totalBomberHangarCapacity) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Insufficient bomber hangar space for carried bombs.')
    };
  }

  const totalCargoCapacity = calculateFleetCargoCapacity(totalShipAmounts);
  const usedCargoCapacity = command.cargo.metal + command.cargo.crystal + command.cargo.deuterium;
  if (usedCargoCapacity > totalCargoCapacity) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Insufficient cargo space.')
    };
  }

  const travelDistance = calculateTravelDistance(command.origin, command.target);
  const travelTurns = command.useJumpGate ? 1 : calculateFleetTravelTurns(travelDistance, player, totalShipAmounts);
  const fuelCost = calculatePlayerFuelCost(totalShipAmounts, travelDistance, mission.minimumFuelReserves, player);

  const hasMilitaryShips = totalShipAmounts.some((entry) => {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(entry.type);
    return blueprint ? blueprint.weapons.length > 0 : false;
  });
  const missionLaunchContext: MissionLaunchContext = {
    selection: {
      ships: command.ships,
      carriedBombs: command.carriedBombs,
      cargo: command.cargo
    },
    playerId: context.playerId,
    owner: player,
    originPlanet,
    targetPlanet,
    targetOwner: targetPlanet.info.ownerId === null
      ? null
      : resolvePlayerById(context.galaxy, targetPlanet.info.ownerId),
    activeFleetCount: playerActiveFleetCount,
    maxActiveFleetCount: playerMaxActiveFleets,
    totalCargoCapacity,
    usedCargoCapacity,
    totalHangarCapacity,
    usedHangarCapacity,
    hasMilitaryShips,
    fuelCost,
    diplomacyResolver: new DiplomacyResolver(context.galaxy.diplomaticRelations)
  };
  const missionErrors = mission.validateLaunch(missionLaunchContext);
  if (missionErrors.length > 0) {
    return {
      ok: false,
      error: commandError(400, 'MISSION_INVALID', missionErrors[0].text)
    };
  }

  const totalRequiredResources = new ResourcesPack(
    command.cargo.metal,
    command.cargo.crystal,
    command.cargo.deuterium + fuelCost
  );
  if (!originPlanet.rBDSFTQ.resources.isSufficient(totalRequiredResources)) {
    return {
      ok: false,
      error: commandError(400, 'INSUFFICIENT_RESOURCES', 'Insufficient resources for cargo and fuel.')
    };
  }

  let jumpGateTargetOwner: Player | null = null;
  let jumpGateLaunchStatus: DiplomaticStatusType | null = null;
  if (command.useJumpGate) {
    const jumpGateAccess = validateJumpGateLaunchAccess(
      context.galaxy,
      context.playerId,
      command.missionType,
      originPlanet,
      targetPlanet,
      selectedFleetShips.totalShipsCount()
    );
    if ('error' in jumpGateAccess) {
      return {
        ok: false,
        error: commandError(jumpGateAccess.status as 400 | 409, 'JUMP_GATE_INVALID', jumpGateAccess.error)
      };
    }

    if (targetPlanet.info.ownerId === null) {
      return {
        ok: false,
        error: commandError(409, 'JUMP_GATE_INVALID', 'Jump Gate requires an owned target planet.')
      };
    }

    jumpGateLaunchStatus = jumpGateAccess.status;
    jumpGateTargetOwner = jumpGateAccess.targetOwner;
  }

  let fleetShips: ManyShipsType;
  try {
    fleetShips = originPlanet.rBDSFTQ.ships.extractSelectedShips(command.ships);
  } catch {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Requested ship selection is no longer available on origin planet.')
    };
  }

  const fleetBombs = originPlanet.rBDSFTQ.defences.extractAnyDefencesByType(command.carriedBombs);
  originPlanet.rBDSFTQ.resources.subtractResourcePack(totalRequiredResources);

  const fleet = new Fleet(
    context.galaxy.nextFleetId,
    context.playerId,
    command.missionType,
    new Destination(command.origin.x, command.origin.y, command.origin.z),
    new Destination(command.target.x, command.target.y, command.target.z),
    originPlanet.basicInfo.name,
    targetPlanet.basicInfo.name,
    fleetShips,
    new ResourcesPack(command.cargo.metal, command.cargo.crystal, command.cargo.deuterium),
    fuelCost,
    totalCargoCapacity,
    usedCargoCapacity,
    travelTurns,
    travelTurns,
    command.useJumpGate && jumpGateLaunchStatus !== null && jumpGateTargetOwner && !isJumpGateAutoApprovedStatus(jumpGateLaunchStatus)
      ? FleetState.PENDING_JUMP_GATE
      : FleetState.MOVING_TO_TARGET,
    context.galaxy.currentTurn,
    fleetBombs,
    FleetOrbitActivity.IDLE,
    null,
    FleetReturnReason.NORMAL,
    false,
    null,
    command.useJumpGate,
    null,
    null,
    command.bombardmentPriorities,
    fuelCost
  );

  context.galaxy.nextFleetId += 1;
  context.galaxy.activeFleets.push(fleet);

  let responseMode: CreateFleetMissionResult['mode'] = 'LAUNCHED';
  let responseMessage: string | null = null;
  if (command.useJumpGate) {
    if (jumpGateLaunchStatus !== null && jumpGateTargetOwner && !isJumpGateAutoApprovedStatus(jumpGateLaunchStatus)) {
      createJumpGatePendingRequest(
        context.galaxy,
        fleet,
        jumpGateTargetOwner,
        selectedFleetShips.totalShipsCount()
      );
      responseMode = 'PENDING_JUMP_GATE';
      responseMessage = 'Jump Gate request sent. Fleet is waiting at the origin planet.';
    } else {
      dispatchJumpGateFleet(context.galaxy, fleet);
      responseMessage = 'Jump Gate launch approved. Fleet is en route.';
    }
  }

  return commandOk({
    fleet,
    mode: responseMode,
    message: responseMessage,
    originPlanet,
    targetPlanet
  });
}
