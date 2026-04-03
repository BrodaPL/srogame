import { FleetReport } from '../../../src/app/models/reports/fleet-report.js';
import { DiplomaticProposalState } from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetState } from '../../../src/app/models/fleets/fleet.js';
import { HullClass } from '../../../src/app/models/enums/hull-class.js';
import { ManyDefences } from '../../../src/app/models/defences/many-defences.js';
import { ManyShips } from '../../../src/app/models/fleets/many-ships.js';
import {
  createMaintenanceRequest,
  normalizeMaintenanceTransferPayload
} from '../../../src/app/models/requests/maintenance-request.js';
import type {
  FleetMaintenanceBombOptionDto,
  FleetMaintenanceOptionsDto,
  FleetMaintenanceShipOptionDto,
  MaintenanceTransferPayloadDto
} from '../../../src/app/models/game-api-types.ts';
import type { ClientCoordinates } from '../../../src/app/models/game-api-types.ts';
import type { MaintenanceRequest } from '../../../src/app/models/requests/maintenance-request.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { Fleet } from '../../../src/app/models/fleets/fleet.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  commandError,
  commandOk,
  resolvePlanetOrError,
  resolvePlayerById
} from './command-helpers.ts';
import { isPlanetaryBombDefenceType } from '../../../src/app/models/defences/planetary-bomb.js';

type MaintenanceContext = {
  fleet: Fleet;
  targetPlanet: Planet;
  targetOwner: Player;
  autoApprove: boolean;
  fuelCap: number;
  supportCap: number;
};

export type CreateFleetMaintenanceRequestCommand = MaintenanceTransferPayloadDto;

export type CreateFleetMaintenanceRequestResult = {
  mode: 'AUTO_APPROVED' | 'PENDING';
  message: string;
};

export type ResolveFleetMaintenanceRequestResult = {
  request: MaintenanceRequest;
};

export function canFleetRequestMaintenance(galaxy: Galaxy, fleet: Fleet): boolean {
  return resolveMaintenanceContextForFleet(
    { galaxy, playerId: fleet.ownerId },
    fleet.fleetId
  ).ok;
}

export function resolveFleetMaintenanceOptions(
  context: GameCommandContext,
  fleetId: number
): CommandResult<FleetMaintenanceOptionsDto> {
  const maintenanceContext = resolveMaintenanceContextForFleet(context, fleetId);
  if (!maintenanceContext.ok) {
    return maintenanceContext;
  }

  return commandOk(buildMaintenanceOptionsDto(maintenanceContext.value));
}

export function createFleetMaintenanceRequest(
  context: GameCommandContext,
  fleetId: number,
  command: CreateFleetMaintenanceRequestCommand
): CommandResult<CreateFleetMaintenanceRequestResult> {
  const maintenanceContext = resolveMaintenanceContextForFleet(context, fleetId);
  if (!maintenanceContext.ok) {
    return maintenanceContext;
  }

  const requested = normalizeMaintenanceTransferPayload(command);
  if (!maintenancePayloadHasAnySelection(requested)) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Select fuel, bombs, or small ships to request.')
    };
  }

  const requestValidationError = validateRequestedMaintenancePayload(maintenanceContext.value, requested);
  if (requestValidationError) {
    return { ok: false, error: requestValidationError };
  }

  maintenanceContext.value.fleet.lastMaintenanceRequestTurn = context.galaxy.currentTurn;

  if (maintenanceContext.value.autoApprove) {
    const approved = applyMaintenanceTransfer(
      maintenanceContext.value.fleet,
      maintenanceContext.value.targetPlanet,
      requested
    );
    const summary = summarizeMaintenanceTransfer(approved);
    addMaintenanceResolutionReports(
      context.galaxy,
      maintenanceContext.value.fleet,
      maintenanceContext.value.targetPlanet,
      maintenanceContext.value.targetOwner,
      'Maintenance delivered',
      `Alliance Depot delivered ${summary}.`,
      `Alliance Depot delivered ${summary} to Fleet #${maintenanceContext.value.fleet.fleetId}.`
    );
    return commandOk({
      mode: 'AUTO_APPROVED',
      message: `Maintenance delivered immediately: ${summary}.`
    });
  }

  const maintenanceRequest = createMaintenanceRequest(
    context.galaxy.nextMaintenanceRequestId,
    maintenanceContext.value.fleet.fleetId,
    context.playerId,
    maintenanceContext.value.targetOwner.playerId,
    maintenanceContext.value.targetPlanet.basicInfo.name,
    maintenanceContext.value.fleet.target,
    context.galaxy.currentTurn,
    context.galaxy.currentTurn + 1,
    requested
  );
  context.galaxy.nextMaintenanceRequestId += 1;
  context.galaxy.maintenanceRequests.push(maintenanceRequest);
  maintenanceContext.value.fleet.pendingMaintenanceRequestId = maintenanceRequest.requestId;

  return commandOk({
    mode: 'PENDING',
    message: 'Maintenance request sent.'
  });
}

export function approveFleetMaintenanceRequest(
  context: GameCommandContext,
  requestId: number,
  requestedApprovalOverride: MaintenanceTransferPayloadDto | null
): CommandResult<ResolveFleetMaintenanceRequestResult> {
  const request = context.galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Maintenance request not found.')
    };
  }
  if (request.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the target player can approve this request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Maintenance request is no longer pending.')
    };
  }

  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId
  ) ?? null;
  if (!fleet) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Requesting fleet is no longer available.')
    };
  }

  const targetPlanetResult = resolvePlanetOrError(context.galaxy, request.targetCoordinates);
  if (!targetPlanetResult.ok || targetPlanetResult.value.info.ownerId !== request.toPlayerId) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Maintenance target is no longer valid.')
    };
  }

  const targetPlanet = targetPlanetResult.value;
  const desiredApproval = requestedApprovalOverride
    ? clampMaintenancePayloadToRequested(requestedApprovalOverride, request.requested)
    : request.requested;
  const approved = applyMaintenanceTransfer(fleet, targetPlanet, desiredApproval);
  request.approved = approved;
  request.state = DiplomaticProposalState.ACCEPTED;
  fleet.pendingMaintenanceRequestId = null;

  const targetOwner = resolvePlayerById(context.galaxy, request.toPlayerId);
  if (targetOwner) {
    const summary = summarizeMaintenanceTransfer(approved);
    addMaintenanceResolutionReports(
      context.galaxy,
      fleet,
      targetPlanet,
      targetOwner,
      'Maintenance delivered',
      `Your maintenance request was approved: ${summary}.`,
      `You approved maintenance for Fleet #${fleet.fleetId}: ${summary}.`
    );
  }

  return commandOk({ request });
}

export function rejectFleetMaintenanceRequest(
  context: GameCommandContext,
  requestId: number
): CommandResult<ResolveFleetMaintenanceRequestResult> {
  const request = context.galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Maintenance request not found.')
    };
  }
  if (request.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the target player can reject this request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Maintenance request is no longer pending.')
    };
  }

  rejectOrCancelMaintenanceRequest(
    context.galaxy,
    request,
    DiplomaticProposalState.REJECTED,
    'Maintenance request rejected.',
    'Your maintenance request was rejected.'
  );
  return commandOk({ request });
}

export function cancelFleetMaintenanceRequest(
  context: GameCommandContext,
  requestId: number
): CommandResult<ResolveFleetMaintenanceRequestResult> {
  const request = context.galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Maintenance request not found.')
    };
  }
  if (request.fromPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the requesting player can cancel this request.')
    };
  }
  if (request.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Maintenance request is no longer pending.')
    };
  }

  rejectOrCancelMaintenanceRequest(
    context.galaxy,
    request,
    DiplomaticProposalState.CANCELLED,
    'You cancelled the maintenance request.',
    'The requesting fleet cancelled its maintenance request.'
  );
  return commandOk({ request });
}

function resolveMaintenanceContextForFleet(
  context: GameCommandContext,
  fleetId: number
): CommandResult<MaintenanceContext> {
  const fleet = context.galaxy.activeFleets.find((entry) =>
    entry.fleetId === fleetId && entry.ownerId === context.playerId
  ) ?? null;
  if (!fleet) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Fleet not found.')
    };
  }

  if (fleet.state !== FleetState.ORBITING) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Maintenance can be requested only by orbiting fleets.')
    };
  }

  if (findPendingMaintenanceRequestForFleet(context.galaxy, context.playerId, fleetId)) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'This fleet already has a pending maintenance request.')
    };
  }

  if (fleet.lastMaintenanceRequestTurn === context.galaxy.currentTurn) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'This fleet has already requested maintenance this turn.')
    };
  }

  const targetPlanetResult = resolvePlanetOrError(context.galaxy, {
    x: fleet.target.x,
    y: fleet.target.y,
    z: fleet.target.z
  });
  if (!targetPlanetResult.ok) {
    return {
      ok: false,
      error: commandError(404, 'PLANET_NOT_FOUND', 'Maintenance target planet not found.')
    };
  }

  const targetPlanet = targetPlanetResult.value;
  if (targetPlanet.info.ownerId === null) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Maintenance requires a planet owner with an Alliance Depot.')
    };
  }

  const targetOwner = resolvePlayerById(context.galaxy, targetPlanet.info.ownerId);
  if (!targetOwner) {
    return {
      ok: false,
      error: commandError(404, 'PLAYER_NOT_FOUND', 'Maintenance target owner not found.')
    };
  }

  const diplomaticStatus = resolveMaintenanceStatus(context.galaxy, context.playerId, targetOwner.playerId);
  if (!isMaintenanceStatusAllowed(diplomaticStatus)) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Maintenance is allowed only on non-hostile planets.')
    };
  }

  const fuelCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue1(BuildingType.ALLIANCE_DEPOT)));
  const supportCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue2(BuildingType.ALLIANCE_DEPOT)));
  if (fuelCap <= 0 && supportCap <= 0) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Alliance Depot is not operational on this planet.')
    };
  }

  return commandOk({
    fleet,
    targetPlanet,
    targetOwner,
    autoApprove: diplomaticStatus === DiplomaticStatus.SELF || diplomaticStatus === DiplomaticStatus.PASSIVE,
    fuelCap,
    supportCap
  });
}

function findPendingMaintenanceRequestForFleet(
  galaxy: Galaxy,
  ownerId: number,
  fleetId: number
): MaintenanceRequest | null {
  return galaxy.maintenanceRequests.find((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.fromPlayerId === ownerId
    && request.fleetId === fleetId
  ) ?? null;
}

function resolveMaintenanceStatus(
  galaxy: Galaxy,
  requesterPlayerId: number,
  targetOwnerId: number
): DiplomaticStatus {
  if (requesterPlayerId === targetOwnerId) {
    return DiplomaticStatus.SELF;
  }

  const directRelation = galaxy.diplomaticRelations.find((entry) =>
    (entry.playerAId === requesterPlayerId && entry.playerBId === targetOwnerId)
    || (entry.playerAId === targetOwnerId && entry.playerBId === requesterPlayerId)
  );
  return directRelation?.status ?? DiplomaticStatus.WAR;
}

function isMaintenanceStatusAllowed(status: DiplomaticStatus): boolean {
  return status === DiplomaticStatus.SELF
    || status === DiplomaticStatus.ALLIED
    || status === DiplomaticStatus.PEACE
    || status === DiplomaticStatus.PASSIVE;
}

function buildMaintenanceOptionsDto(context: MaintenanceContext): FleetMaintenanceOptionsDto {
  const remainingCargoCapacity = Math.max(0, context.fleet.totalCargoCapacity - context.fleet.usedCargoCapacity);
  const currentBombHangarUsage = calculateBombHangarUsageForManyDefences(context.fleet.carriedBombs);
  const remainingHangarCapacity = Math.max(
    0,
    ManyShips.totalTravelHangarCapacity(context.fleet.ships)
    - ManyShips.totalRequiredHangarCapacity(context.fleet.ships)
    - currentBombHangarUsage
  );
  const remainingBomberHangarCapacity = Math.max(
    0,
    ManyShips.totalBomberHangarCapacity(context.fleet.ships) - currentBombHangarUsage
  );

  return {
    fleetId: context.fleet.fleetId,
    targetPlanetName: context.targetPlanet.basicInfo.name,
    autoApprove: context.autoApprove,
    fuelCap: context.fuelCap,
    supportCap: context.supportCap,
    availableFuel: Math.max(0, Math.floor(context.targetPlanet.rBDSFTQ.resources.deuterium)),
    remainingCargoCapacity,
    remainingHangarCapacity,
    remainingBomberHangarCapacity,
    availableShips: buildMaintenanceShipOptions(context.targetPlanet),
    availableBombs: buildMaintenanceBombOptions(context.targetPlanet)
  };
}

function buildMaintenanceShipOptions(planet: Planet): FleetMaintenanceShipOptionDto[] {
  const totalCounts = ManyShips.countByType(planet.rBDSFTQ.ships);
  const undamagedCounts = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const damagedCounts = ManyShips.damagedCountByType(planet.rBDSFTQ.ships);

  return [...totalCounts.entries()]
    .map(([type, available]) => {
      const blueprint = SHIP_BLUEPRINTS.get(type);
      if (!blueprint || blueprint.hullClass !== HullClass.SMALL) {
        return null;
      }

      return {
        type,
        available,
        undamagedAvailable: undamagedCounts.get(type) ?? 0,
        damagedAvailable: damagedCounts.get(type) ?? 0,
        size: blueprint.size
      } satisfies FleetMaintenanceShipOptionDto;
    })
    .filter((entry): entry is FleetMaintenanceShipOptionDto => !!entry && entry.available > 0)
    .sort((left, right) => left.type.localeCompare(right.type));
}

function buildMaintenanceBombOptions(planet: Planet): FleetMaintenanceBombOptionDto[] {
  const totalCounts = ManyDefences.countByType(planet.rBDSFTQ.defences);
  const undamagedCounts = ManyDefences.undamagedCountByType(planet.rBDSFTQ.defences);
  const damagedCounts = ManyDefences.damagedCountByType(planet.rBDSFTQ.defences);

  return [...totalCounts.entries()]
    .map(([type, available]) => {
      if (!isPlanetaryBombDefenceType(type)) {
        return null;
      }

      const blueprint = DEFENCE_BLUEPRINTS.get(type);
      if (!blueprint) {
        return null;
      }

      return {
        type,
        available,
        undamagedAvailable: undamagedCounts.get(type) ?? 0,
        damagedAvailable: damagedCounts.get(type) ?? 0,
        size: blueprint.size
      } satisfies FleetMaintenanceBombOptionDto;
    })
    .filter((entry): entry is FleetMaintenanceBombOptionDto => !!entry && entry.available > 0)
    .sort((left, right) => left.type.localeCompare(right.type));
}

function validateRequestedMaintenancePayload(
  context: MaintenanceContext,
  payload: MaintenanceRequest['requested']
): ReturnType<typeof commandError> | null {
  const options = buildMaintenanceOptionsDto(context);
  if (payload.fuel > Math.min(options.fuelCap, options.availableFuel, options.remainingCargoCapacity)) {
    return commandError(400, 'CONFLICT', 'Requested fuel exceeds depot or fleet capacity.');
  }

  const shipOptions = new Map(options.availableShips.map((entry) => [entry.type, entry]));
  const bombOptions = new Map(options.availableBombs.map((entry) => [entry.type, entry]));
  let supportSize = 0;
  let requiredHangar = 0;
  let requiredBomberHangar = 0;

  for (const shipRequest of payload.ships) {
    const option = shipOptions.get(shipRequest.type);
    const blueprint = SHIP_BLUEPRINTS.get(shipRequest.type);
    if (!option || !blueprint || blueprint.hullClass !== HullClass.SMALL) {
      return commandError(
        400,
        'INVALID_INPUT',
        `${shipRequest.type}: maintenance can request only small ships stored on the target planet.`
      );
    }
    if (shipRequest.amount > option.available) {
      return commandError(400, 'CONFLICT', `${shipRequest.type}: requested amount exceeds local depot stock.`);
    }

    supportSize += blueprint.size * shipRequest.amount;
    if (!blueprint.canJump) {
      requiredHangar += blueprint.size * shipRequest.amount;
    }
  }

  for (const bombRequest of payload.bombs) {
    const option = bombOptions.get(bombRequest.type);
    const blueprint = DEFENCE_BLUEPRINTS.get(bombRequest.type);
    if (!option || !blueprint || !isPlanetaryBombDefenceType(bombRequest.type)) {
      return commandError(400, 'INVALID_INPUT', `${bombRequest.type}: requested bombs are not available in the target depot.`);
    }
    if (bombRequest.amount > option.available) {
      return commandError(400, 'CONFLICT', `${bombRequest.type}: requested amount exceeds local depot stock.`);
    }

    supportSize += blueprint.size * bombRequest.amount;
    requiredHangar += blueprint.size * bombRequest.amount;
    requiredBomberHangar += blueprint.size * bombRequest.amount;
  }

  if (supportSize > options.supportCap) {
    return commandError(400, 'CONFLICT', 'Requested ships and bombs exceed Alliance Depot support capacity.');
  }

  if (requiredHangar > options.remainingHangarCapacity) {
    return commandError(400, 'CONFLICT', 'Requested ships and bombs do not fit into the fleet hangar capacity.');
  }

  if (requiredBomberHangar > options.remainingBomberHangarCapacity) {
    return commandError(400, 'CONFLICT', 'Requested bombs do not fit into bomber hangar capacity.');
  }

  return null;
}

function maintenancePayloadHasAnySelection(payload: MaintenanceRequest['requested']): boolean {
  return payload.fuel > 0 || payload.ships.length > 0 || payload.bombs.length > 0;
}

function clampMaintenancePayloadToRequested(
  desired: MaintenanceTransferPayloadDto,
  requested: MaintenanceRequest['requested']
): MaintenanceRequest['requested'] {
  const normalizedDesired = normalizeMaintenanceTransferPayload(desired);
  const requestedShips = new Map(requested.ships.map((entry) => [entry.type, entry.amount]));
  const requestedBombs = new Map(requested.bombs.map((entry) => [entry.type, entry.amount]));

  return {
    fuel: Math.min(normalizedDesired.fuel, requested.fuel),
    ships: normalizedDesired.ships.map((entry) => ({
      type: entry.type,
      amount: Math.min(entry.amount, requestedShips.get(entry.type) ?? 0)
    })).filter((entry) => entry.amount > 0),
    bombs: normalizedDesired.bombs.map((entry) => ({
      type: entry.type,
      amount: Math.min(entry.amount, requestedBombs.get(entry.type) ?? 0)
    })).filter((entry) => entry.amount > 0)
  };
}

function applyMaintenanceTransfer(
  fleet: Fleet,
  targetPlanet: Planet,
  requested: MaintenanceRequest['requested']
): MaintenanceRequest['approved'] {
  const normalized = normalizeMaintenanceTransferPayload(requested);
  const approvedFuel = Math.min(
    normalized.fuel,
    Math.max(0, targetPlanet.rBDSFTQ.resources.deuterium),
    Math.max(0, fleet.totalCargoCapacity - fleet.usedCargoCapacity)
  );
  if (approvedFuel > 0) {
    targetPlanet.rBDSFTQ.resources.deuterium -= approvedFuel;
    fleet.cargo.deuterium += approvedFuel;
    fleet.usedCargoCapacity = fleet.cargo.metal + fleet.cargo.crystal + fleet.cargo.deuterium;
  }

  const approvedShips = extractMaintenanceShips(targetPlanet, fleet, normalized.ships);
  const approvedBombs = extractMaintenanceBombs(targetPlanet, fleet, normalized.bombs);
  if (approvedShips.totalShipsCount() > 0) {
    fleet.ships.addManyShips(approvedShips);
    fleet.totalCargoCapacity = ManyShips.totalCargoCapacity(fleet.ships);
  }
  if (approvedBombs.totalDefencesCount() > 0) {
    fleet.carriedBombs.addManyDefences(approvedBombs);
  }

  return {
    fuel: approvedFuel,
    ships: [...ManyShips.countByType(approvedShips).entries()].map(([type, amount]) => ({ type, amount })),
    bombs: [...ManyDefences.countByType(approvedBombs).entries()].map(([type, amount]) => ({ type, amount }))
  };
}

function rejectOrCancelMaintenanceRequest(
  galaxy: Galaxy,
  request: MaintenanceRequest,
  state: DiplomaticProposalState,
  ownerBody: string,
  requesterBody: string
): void {
  request.state = state;
  request.approved = normalizeMaintenanceTransferPayload(null);

  const fleet = galaxy.activeFleets.find((entry) => entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId);
  if (fleet) {
    fleet.pendingMaintenanceRequestId = null;
  }

  const targetPlanetResult = resolvePlanetOrError(galaxy, request.targetCoordinates);
  const targetPlanet = targetPlanetResult.ok ? targetPlanetResult.value : null;
  const targetOwner = resolvePlayerById(galaxy, request.toPlayerId);
  if (!fleet || !targetPlanet || !targetOwner) {
    return;
  }

  addMaintenanceResolutionReports(
    galaxy,
    fleet,
    targetPlanet,
    targetOwner,
    'Maintenance request resolved',
    requesterBody,
    ownerBody
  );
}

function extractMaintenanceShips(
  targetPlanet: Planet,
  fleet: Fleet,
  requestedShips: MaintenanceRequest['requested']['ships']
): ManyShips {
  const extracted = ManyShips.empty();
  let remainingHangarCapacity = Math.max(
    0,
    ManyShips.totalTravelHangarCapacity(fleet.ships)
    - ManyShips.totalRequiredHangarCapacity(fleet.ships)
    - calculateBombHangarUsageForManyDefences(fleet.carriedBombs)
  );

  for (const request of requestedShips) {
    const blueprint = SHIP_BLUEPRINTS.get(request.type);
    if (!blueprint || blueprint.hullClass !== HullClass.SMALL) {
      continue;
    }

    const hangarCost = blueprint.canJump ? 0 : blueprint.size;
    let remaining = request.amount;
    const availableUndamaged = targetPlanet.rBDSFTQ.ships.undamagedShipsCount[request.type] ?? 0;
    const takeUndamaged = Math.min(
      availableUndamaged,
      remaining,
      hangarCost <= 0 ? remaining : Math.floor(remainingHangarCapacity / hangarCost)
    );
    if (takeUndamaged > 0) {
      extracted.addUndamaged(request.type, takeUndamaged);
      remaining -= takeUndamaged;
      remainingHangarCapacity = Math.max(0, remainingHangarCapacity - (takeUndamaged * hangarCost));
      const nextUndamaged = availableUndamaged - takeUndamaged;
      if (nextUndamaged > 0) {
        targetPlanet.rBDSFTQ.ships.undamagedShipsCount[request.type] = nextUndamaged;
      } else {
        delete targetPlanet.rBDSFTQ.ships.undamagedShipsCount[request.type];
      }
    }

    if (remaining <= 0) {
      continue;
    }

    const updatedDamaged: typeof targetPlanet.rBDSFTQ.ships.damagedShips = [];
    for (const damagedShip of targetPlanet.rBDSFTQ.ships.damagedShips) {
      if (
        damagedShip.type === request.type
        && remaining > 0
        && (hangarCost <= 0 || remainingHangarCapacity >= hangarCost)
      ) {
        extracted.addDamaged(damagedShip.type, damagedShip.hull);
        remaining -= 1;
        remainingHangarCapacity = Math.max(0, remainingHangarCapacity - hangarCost);
        continue;
      }

      updatedDamaged.push(damagedShip);
    }
    targetPlanet.rBDSFTQ.ships.damagedShips = updatedDamaged;
  }

  return extracted;
}

function extractMaintenanceBombs(
  targetPlanet: Planet,
  fleet: Fleet,
  requestedBombs: MaintenanceRequest['requested']['bombs']
): ManyDefences {
  const extracted = ManyDefences.empty();
  let remainingTotalHangar = Math.max(
    0,
    ManyShips.totalTravelHangarCapacity(fleet.ships)
    - ManyShips.totalRequiredHangarCapacity(fleet.ships)
    - calculateBombHangarUsageForManyDefences(fleet.carriedBombs)
  );
  let remainingBomberHangar = Math.max(
    0,
    ManyShips.totalBomberHangarCapacity(fleet.ships) - calculateBombHangarUsageForManyDefences(fleet.carriedBombs)
  );

  for (const request of requestedBombs) {
    if (!isPlanetaryBombDefenceType(request.type)) {
      continue;
    }

    const blueprint = DEFENCE_BLUEPRINTS.get(request.type);
    if (!blueprint) {
      continue;
    }

    let remaining = request.amount;
    const size = Math.max(0, blueprint.size);
    const availableUndamaged = targetPlanet.rBDSFTQ.defences.undamagedDefencesCount[request.type] ?? 0;
    const hangarLimitedAmount = size <= 0
      ? remaining
      : Math.min(
        remaining,
        Math.floor(remainingTotalHangar / size),
        Math.floor(remainingBomberHangar / size)
      );
    const takeUndamaged = Math.min(availableUndamaged, hangarLimitedAmount);
    if (takeUndamaged > 0) {
      extracted.addUndamaged(request.type, takeUndamaged);
      remaining -= takeUndamaged;
      remainingTotalHangar = Math.max(0, remainingTotalHangar - (takeUndamaged * size));
      remainingBomberHangar = Math.max(0, remainingBomberHangar - (takeUndamaged * size));
      const nextUndamaged = availableUndamaged - takeUndamaged;
      if (nextUndamaged > 0) {
        targetPlanet.rBDSFTQ.defences.undamagedDefencesCount[request.type] = nextUndamaged;
      } else {
        delete targetPlanet.rBDSFTQ.defences.undamagedDefencesCount[request.type];
      }
    }

    if (remaining <= 0) {
      continue;
    }

    const updatedDamaged: typeof targetPlanet.rBDSFTQ.defences.damagedDefences = [];
    for (const damagedBomb of targetPlanet.rBDSFTQ.defences.damagedDefences) {
      if (
        damagedBomb.type === request.type
        && remaining > 0
        && (size <= 0 || (remainingTotalHangar >= size && remainingBomberHangar >= size))
      ) {
        extracted.addDamaged(damagedBomb.type, damagedBomb.hull);
        remaining -= 1;
        remainingTotalHangar = Math.max(0, remainingTotalHangar - size);
        remainingBomberHangar = Math.max(0, remainingBomberHangar - size);
        continue;
      }

      updatedDamaged.push(damagedBomb);
    }
    targetPlanet.rBDSFTQ.defences.damagedDefences = updatedDamaged;
  }

  return extracted;
}

function calculateBombHangarUsageForManyDefences(defences: ManyDefences): number {
  let total = 0;
  for (const [type, amount] of ManyDefences.countByType(defences).entries()) {
    const blueprint = DEFENCE_BLUEPRINTS.get(type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.size) * amount;
  }

  return total;
}

function summarizeMaintenanceTransfer(payload: MaintenanceRequest['approved'] | MaintenanceRequest['requested']): string {
  const normalized = normalizeMaintenanceTransferPayload(payload);
  const parts: string[] = [];
  if (normalized.fuel > 0) {
    parts.push(`${normalized.fuel} deuterium`);
  }
  if (normalized.ships.length > 0) {
    parts.push(normalized.ships.map((entry) => `${entry.type} x${entry.amount}`).join(', '));
  }
  if (normalized.bombs.length > 0) {
    parts.push(normalized.bombs.map((entry) => `${entry.type} x${entry.amount}`).join(', '));
  }

  return parts.length > 0 ? parts.join(' | ') : 'nothing';
}

function addMaintenanceResolutionReports(
  galaxy: Galaxy,
  fleet: Fleet,
  targetPlanet: Planet,
  targetOwner: Player,
  title: string,
  requesterBody: string,
  ownerBody: string
): void {
  const requester = resolvePlayerById(galaxy, fleet.ownerId);
  if (requester) {
    requester.addReport(new FleetReport({
      reportId: requester.createReportId(),
      createdTurn: galaxy.currentTurn,
      title,
      sourceCoordinates: toCoordinates(fleet.target),
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: targetOwner.playerName
    }, requesterBody));
  }

  if (targetOwner.playerId === fleet.ownerId) {
    return;
  }

  targetOwner.addReport(new FleetReport({
    reportId: targetOwner.createReportId(),
    createdTurn: galaxy.currentTurn,
    title,
    sourceCoordinates: toCoordinates(fleet.target),
    sourcePlanetName: targetPlanet.basicInfo.name,
    sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
    senderPlayerName: requester?.playerName ?? null
  }, ownerBody));
}

function toCoordinates(destination: Fleet['target']): ClientCoordinates {
  return { x: destination.x, y: destination.y, z: destination.z };
}
