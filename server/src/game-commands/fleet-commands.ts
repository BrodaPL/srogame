import * as diplomacyResolverModule from '../../../src/app/models/diplomacy/diplomacy-resolver.js';
import * as fleetMissionRegistryModule from '../../../src/app/models/missions/fleet-mission-registry.js';
import * as destinationModule from '../../../src/app/models/fleets/destination.js';
import * as fleetModelModule from '../../../src/app/models/fleets/fleet.js';
import * as manyShipsModule from '../../../src/app/models/fleets/many-ships.js';
import * as manyDefencesModule from '../../../src/app/models/defences/many-defences.js';
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
import type { ManyDefences as ManyDefencesType } from '../../../src/app/models/defences/many-defences.ts';
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
const { ManyDefences } = resolveModule(manyDefencesModule) as typeof import('../../../src/app/models/defences/many-defences.js');
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
  originFleetId?: number | null;
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

  const targetPlanet = targetPlanetResult.value;
  const player = resolvePlayerById(context.galaxy, context.playerId);
  if (!player) {
    return {
      ok: false,
      error: commandError(404, 'PLAYER_NOT_FOUND', 'Player not found.')
    };
  }

  const remoteOrigin = command.originFleetId !== null && command.originFleetId !== undefined
    ? resolveRemoteOriginContext(context, command.originFleetId)
    : null;
  if (remoteOrigin && !remoteOrigin.ok) {
    return {
      ok: false,
      error: remoteOrigin.error
    };
  }

  const remoteOriginContext = remoteOrigin?.ok ? remoteOrigin.value : null;
  const originPlanet = remoteOriginContext?.originPlanet ?? resolveOwnedOriginPlanetOrError(context, command.origin);
  if ('error' in originPlanet) {
    return {
      ok: false,
      error: originPlanet.error
    };
  }

  const originCoordinates = remoteOriginContext
    ? toClientCoordinates(remoteOriginContext.originPlanet)
    : command.origin;
  const playerActiveFleetCount = context.galaxy.activeFleets.filter((fleet) => fleet.ownerId === context.playerId).length;
  const playerMaxActiveFleets = calculatePlayerMaxActiveFleets(player);

  if (remoteOriginContext && command.useJumpGate) {
    return {
      ok: false,
      error: commandError(400, 'JUMP_GATE_INVALID', 'Remote-origin launches cannot use Jump Gate travel yet.')
    };
  }

  if (command.ships.length === 0) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Select at least one ship.')
    };
  }

  const availableUndamagedShipsByType = remoteOriginContext
    ? ManyShips.undamagedCountByType(remoteOriginContext.fleet.ships)
    : countPlanetUndamagedShipsByType(originPlanet);
  const availableDamagedShipsByType = remoteOriginContext
    ? ManyShips.damagedCountByType(remoteOriginContext.fleet.ships)
    : countPlanetDamagedShipsByType(originPlanet);
  for (const ship of command.ships) {
    const availableUndamagedAmount = availableUndamagedShipsByType.get(ship.type) ?? 0;
    if (availableUndamagedAmount < ship.undamagedAmount) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', `${ship.type}: not enough ready ships on origin.`)
      };
    }

    const availableDamagedAmount = availableDamagedShipsByType.get(ship.type) ?? 0;
    if (availableDamagedAmount < ship.damagedAmount) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', `${ship.type}: not enough damaged ships on origin.`)
      };
    }
  }

  const availableBombsByType = remoteOriginContext
    ? ManyDefences.countByType(remoteOriginContext.fleet.carriedBombs)
    : countPlanetBombsByType(originPlanet);
  for (const bomb of command.carriedBombs) {
    const availableAmount = availableBombsByType.get(bomb.type) ?? 0;
    if (availableAmount < bomb.amount) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', `${bomb.type}: not enough carried bombs on origin.`)
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

  const travelDistance = calculateTravelDistance(originCoordinates, command.target);
  const travelTurns = command.useJumpGate ? 1 : calculateFleetTravelTurns(travelDistance, player, totalShipAmounts);
  const fuelCost = calculatePlayerFuelCost(totalShipAmounts, travelDistance, mission.minimumFuelReserves, player);
  const wholeRemoteFleetLaunch = remoteOriginContext
    ? isWholeRemoteFleetSelection(remoteOriginContext.fleet, command.ships, command.carriedBombs)
    : false;
  const createsNewFleet = !remoteOriginContext || !wholeRemoteFleetLaunch;
  if (createsNewFleet && playerActiveFleetCount >= playerMaxActiveFleets) {
    return {
      ok: false,
      error: commandError(
        400,
        'ACTIVE_FLEET_LIMIT',
        'Active fleet limit reached. Upgrade COMPUTER_TECHNOLOGY to control more fleets.'
      )
    };
  }

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
    activeFleetCount: createsNewFleet ? playerActiveFleetCount : Math.max(0, playerActiveFleetCount - 1),
    maxActiveFleetCount: playerMaxActiveFleets,
    totalCargoCapacity,
    usedCargoCapacity,
    totalHangarCapacity,
    usedHangarCapacity,
    hasMilitaryShips,
    fuelCost,
    availableDeuterium: remoteOriginContext ? remoteOriginContext.fleet.cargo.deuterium : originPlanet.rBDSFTQ.resources.deuterium,
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
  const availableLaunchResources = remoteOriginContext ? remoteOriginContext.fleet.cargo : originPlanet.rBDSFTQ.resources;
  if (!availableLaunchResources.isSufficient(totalRequiredResources)) {
    return {
      ok: false,
      error: commandError(400, 'INSUFFICIENT_RESOURCES', remoteOriginContext
        ? 'Insufficient fleet cargo resources for selected cargo and fuel.'
        : 'Insufficient resources for cargo and fuel.')
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

  if (remoteOriginContext && wholeRemoteFleetLaunch) {
    remoteOriginContext.fleet.cargo.subtractResourcePack(totalRequiredResources);
    remoteOriginContext.fleet.cargo.addResourcePack(new ResourcesPack(
      command.cargo.metal,
      command.cargo.crystal,
      command.cargo.deuterium
    ));
    remoteOriginContext.fleet.usedCargoCapacity = remoteOriginContext.fleet.cargo.metal
      + remoteOriginContext.fleet.cargo.crystal
      + remoteOriginContext.fleet.cargo.deuterium;
    remoteOriginContext.fleet.missionType = command.missionType;
    remoteOriginContext.fleet.origin = new Destination(originCoordinates.x, originCoordinates.y, originCoordinates.z);
    remoteOriginContext.fleet.target = new Destination(command.target.x, command.target.y, command.target.z);
    remoteOriginContext.fleet.originPlanetName = originPlanet.basicInfo.name;
    remoteOriginContext.fleet.targetPlanetName = targetPlanet.basicInfo.name;
    remoteOriginContext.fleet.fuelCost = fuelCost;
    remoteOriginContext.fleet.totalCargoCapacity = totalCargoCapacity;
    remoteOriginContext.fleet.travelTurns = travelTurns;
    remoteOriginContext.fleet.returnTurns = travelTurns;
    remoteOriginContext.fleet.state = FleetState.MOVING_TO_TARGET;
    remoteOriginContext.fleet.orbitActivity = FleetOrbitActivity.IDLE;
    remoteOriginContext.fleet.suspendedMissionType = null;
    remoteOriginContext.fleet.returnReason = FleetReturnReason.NORMAL;
    remoteOriginContext.fleet.usesJumpGate = false;
    remoteOriginContext.fleet.pendingJumpGateRequestId = null;
    remoteOriginContext.fleet.bombardmentPriorities = command.bombardmentPriorities;
    remoteOriginContext.fleet.remainingFuelReserve = fuelCost;
    remoteOriginContext.fleet.isRemoteOrigin = true;
    remoteOriginContext.fleet.remoteOriginSourceFleetId = remoteOriginContext.fleet.fleetId;

    return commandOk({
      fleet: remoteOriginContext.fleet,
      mode: 'LAUNCHED',
      message: 'Remote-origin fleet is en route.',
      originPlanet,
      targetPlanet
    });
  }

  const parentRemoteFleetAfterDetach = remoteOriginContext
    ? validateRemoteDetachRemainder(remoteOriginContext.fleet, command.ships, command.carriedBombs, totalRequiredResources)
    : null;
  if (parentRemoteFleetAfterDetach && !parentRemoteFleetAfterDetach.ok) {
    return {
      ok: false,
      error: parentRemoteFleetAfterDetach.error
    };
  }

  let fleetShips: ManyShipsType;
  try {
    fleetShips = remoteOriginContext
      ? remoteOriginContext.fleet.ships.extractSelectedShips(command.ships)
      : originPlanet.rBDSFTQ.ships.extractSelectedShips(command.ships);
  } catch {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Requested ship selection is no longer available on origin.')
    };
  }

  const fleetBombs = remoteOriginContext
    ? remoteOriginContext.fleet.carriedBombs.extractAnyDefencesByType(command.carriedBombs)
    : originPlanet.rBDSFTQ.defences.extractAnyDefencesByType(command.carriedBombs);
  availableLaunchResources.subtractResourcePack(totalRequiredResources);
  if (remoteOriginContext) {
    remoteOriginContext.fleet.usedCargoCapacity = remoteOriginContext.fleet.cargo.metal
      + remoteOriginContext.fleet.cargo.crystal
      + remoteOriginContext.fleet.cargo.deuterium;
    remoteOriginContext.fleet.totalCargoCapacity = ManyShips.totalCargoCapacity(remoteOriginContext.fleet.ships);
  }

  const fleet = new Fleet(
    context.galaxy.nextFleetId,
    context.playerId,
    command.missionType,
    new Destination(originCoordinates.x, originCoordinates.y, originCoordinates.z),
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
    fuelCost,
    remoteOriginContext !== null,
    remoteOriginContext?.fleet.fleetId ?? null
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

function resolveOwnedOriginPlanetOrError(
  context: GameCommandContext,
  origin: ClientCoordinates
): Planet | { error: ReturnType<typeof commandError> } {
  const originPlanetResult = resolvePlanetOrError(context.galaxy, origin);
  if (!originPlanetResult.ok) {
    return {
      error: {
        ...originPlanetResult.error,
        message: originPlanetResult.error.code === 'SYSTEM_NOT_FOUND'
          ? 'Origin planet not found.'
          : originPlanetResult.error.message
      }
    };
  }

  const originPlanet = originPlanetResult.value;
  if (originPlanet.info.ownerId !== context.playerId) {
    return {
      error: commandError(403, 'FORBIDDEN', 'Origin planet must be owned by you.')
    };
  }

  return originPlanet;
}

function resolveRemoteOriginContext(
  context: GameCommandContext,
  originFleetId: number
): CommandResult<{ fleet: FleetType; originPlanet: Planet }> {
  if (!Number.isInteger(originFleetId) || originFleetId <= 0) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Invalid origin fleet id.')
    };
  }

  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === originFleetId && entry.ownerId === context.playerId
  ) ?? null;
  if (!fleet) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Origin fleet not found.')
    };
  }

  if (fleet.state !== FleetState.ORBITING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Remote origin requires an orbiting fleet.')
    };
  }

  if (fleet.pendingMaintenanceRequestId !== null) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Remote origin fleet has a pending maintenance request.')
    };
  }

  const originPlanetResult = resolvePlanetOrError(context.galaxy, {
    x: fleet.target.x,
    y: fleet.target.y,
    z: fleet.target.z
  });
  if (!originPlanetResult.ok) {
    return {
      ok: false,
      error: commandError(404, 'PLANET_NOT_FOUND', 'Remote origin planet not found.')
    };
  }

  const originPlanet = originPlanetResult.value;
  return commandOk({ fleet, originPlanet });
}

function toClientCoordinates(planet: Planet): ClientCoordinates {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: Math.max(0, planet.basicInfo.order - 1)
  };
}

function isWholeRemoteFleetSelection(
  fleet: FleetType,
  ships: CreateFleetShipSelectionEntry[],
  bombs: CreateFleetBombSelectionEntry[]
): boolean {
  return selectionsMatchShips(fleet.ships, ships) && selectionsMatchBombs(fleet.carriedBombs, bombs);
}

function selectionsMatchShips(source: ManyShipsType, ships: CreateFleetShipSelectionEntry[]): boolean {
  const sourceUndamaged = ManyShips.undamagedCountByType(source);
  const sourceDamaged = ManyShips.damagedCountByType(source);
  const selectedUndamaged = new Map<string, number>();
  const selectedDamaged = new Map<string, number>();
  for (const ship of ships) {
    selectedUndamaged.set(ship.type, (selectedUndamaged.get(ship.type) ?? 0) + Math.max(0, Math.floor(ship.undamagedAmount)));
    selectedDamaged.set(ship.type, (selectedDamaged.get(ship.type) ?? 0) + Math.max(0, Math.floor(ship.damagedAmount)));
  }

  return mapsMatchCounts(sourceUndamaged, selectedUndamaged) && mapsMatchCounts(sourceDamaged, selectedDamaged);
}

function selectionsMatchBombs(source: ManyDefencesType, bombs: CreateFleetBombSelectionEntry[]): boolean {
  const sourceCounts = ManyDefences.countByType(source);
  const selectedCounts = new Map<string, number>();
  for (const bomb of bombs) {
    selectedCounts.set(bomb.type, (selectedCounts.get(bomb.type) ?? 0) + Math.max(0, Math.floor(bomb.amount)));
  }

  return mapsMatchCounts(sourceCounts, selectedCounts);
}

function mapsMatchCounts(left: Map<unknown, number>, right: Map<unknown, number>): boolean {
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    if ((left.get(key) ?? 0) !== (right.get(key) ?? 0)) {
      return false;
    }
  }

  return true;
}

function validateRemoteDetachRemainder(
  fleet: FleetType,
  ships: CreateFleetShipSelectionEntry[],
  bombs: CreateFleetBombSelectionEntry[],
  spentResources: InstanceType<typeof ResourcesPack>
): CommandResult<null> {
  const remainingShips = ManyShips.fromData(fleet.ships);
  const remainingBombs = ManyDefences.fromData(fleet.carriedBombs);
  try {
    remainingShips.extractSelectedShips(ships);
    remainingBombs.extractAnyDefencesByType(bombs);
  } catch {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Remote origin selection is no longer available.')
    };
  }

  const remainingCargo = new ResourcesPack(fleet.cargo.metal, fleet.cargo.crystal, fleet.cargo.deuterium);
  remainingCargo.subtractResourcePack(spentResources);
  const remainingCargoAmount = remainingCargo.metal + remainingCargo.crystal + remainingCargo.deuterium;
  if (remainingCargoAmount > ManyShips.totalCargoCapacity(remainingShips)) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Detached fleet would leave too much cargo on the remote parent fleet.')
    };
  }

  const remainingBombEntries = [...ManyDefences.countByType(remainingBombs).entries()]
    .map(([type, amount]) => ({ type, amount }));
  const remainingBombHangarUsage = calculateBombHangarUsage(remainingBombEntries);
  if (ManyShips.totalRequiredHangarCapacity(remainingShips) + remainingBombHangarUsage > ManyShips.totalTravelHangarCapacity(remainingShips)) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Detached fleet would leave non-jump ships or bombs without carrier capacity.')
    };
  }

  if (remainingBombHangarUsage > ManyShips.totalBomberHangarCapacity(remainingShips)) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Detached fleet would leave bombs without bomber hangar capacity.')
    };
  }

  return commandOk(null);
}
