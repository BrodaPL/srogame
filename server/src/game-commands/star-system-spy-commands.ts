import * as planetTypeEnumModule from '../../../src/app/models/enums/planet-type.js';
import * as shipTypeEnumModule from '../../../src/app/models/enums/ship-type.js';
import * as fleetMissionTypeEnumModule from '../../../src/app/models/enums/fleet-mission-type.js';
import * as fleetModule from '../../../src/app/models/fleets/fleet.js';
import type { ClientCoordinates } from '../../../src/app/models/game-api-types.ts';
import type { Fleet as FleetType } from '../../../src/app/models/fleets/fleet.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  calculatePlayerFuelCost,
  calculatePlayerMaxActiveFleets,
  calculateTravelDistance,
  commandError,
  commandOk,
  countPlanetDamagedShipsByType,
  countPlanetUndamagedShipsByType,
  resolvePlanetOrError,
  resolvePlayerById,
  resolveSystemOrError
} from './command-helpers.ts';
import { createFleetMission } from './fleet-commands.js';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { PlanetType } = resolveModule(planetTypeEnumModule) as typeof import('../../../src/app/models/enums/planet-type.js');
const { ShipType } = resolveModule(shipTypeEnumModule) as typeof import('../../../src/app/models/enums/ship-type.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeEnumModule) as typeof import('../../../src/app/models/enums/fleet-mission-type.js');
const { FleetState } = resolveModule(fleetModule) as typeof import('../../../src/app/models/fleets/fleet.js');

export type CreateStarSystemSpyCommand = {
  systemX: number;
  systemY: number;
  origin: ClientCoordinates;
  originFleetId?: number | null;
};

export type CreateStarSystemSpyResult = {
  fleets: FleetType[];
  launchedFleetCount: number;
  targetPlanets: Planet[];
};

export function createStarSystemSpyMissions(
  context: GameCommandContext,
  command: CreateStarSystemSpyCommand
): CommandResult<CreateStarSystemSpyResult> {
  const systemResult = resolveSystemOrError(context.galaxy, command.systemX, command.systemY);
  if (!systemResult.ok) {
    return systemResult;
  }

  const player = resolvePlayerById(context.galaxy, context.playerId);
  if (!player) {
    return {
      ok: false,
      error: commandError(404, 'PLAYER_NOT_FOUND', 'Player not found.')
    };
  }

  const originContextResult = resolveStarSystemSpyOriginContext(context, command, player);
  if (!originContextResult.ok) {
    return originContextResult;
  }
  const originContext = originContextResult.value;

  const targetPlanets = systemResult.value.planets.filter((planet) =>
    planet.basicInfo.type !== PlanetType.ASTEROIDS && planet.info.ownerId !== context.playerId
  );
  if (targetPlanets.length <= 0) {
    return {
      ok: false,
      error: commandError(400, 'MISSION_INVALID', 'No non-owned, non-asteroid planets are available in this star system.')
    };
  }

  const playerActiveFleetCount = context.galaxy.activeFleets.filter((fleet) => fleet.ownerId === context.playerId).length;
  const playerMaxActiveFleets = calculatePlayerMaxActiveFleets(player);
  if ((playerActiveFleetCount + targetPlanets.length) > playerMaxActiveFleets) {
    return {
      ok: false,
      error: commandError(
        400,
        'ACTIVE_FLEET_LIMIT',
        `Star system espionage needs ${targetPlanets.length} free fleet slots, but only ${Math.max(0, playerMaxActiveFleets - playerActiveFleetCount)} are available.`
      )
    };
  }

  const availableUndamagedProbes = originContext.availableUndamagedProbes;
  const availableDamagedProbes = originContext.availableDamagedProbes;
  const availableTotalProbes = availableUndamagedProbes + availableDamagedProbes;
  if (availableTotalProbes < targetPlanets.length) {
    return {
      ok: false,
      error: commandError(
        409,
        'CONFLICT',
        `${originContext.label} needs ${targetPlanets.length} espionage probes for this star system, but only ${availableTotalProbes} are available.`
      )
    };
  }

  let requiredFuel = 0;
  for (const targetPlanet of targetPlanets) {
    const distance = calculateTravelDistance(originContext.coordinates, {
      x: targetPlanet.basicInfo.solarSystem.coordinates.x,
      y: targetPlanet.basicInfo.solarSystem.coordinates.y,
      z: Math.max(0, targetPlanet.basicInfo.order - 1)
    });
    requiredFuel += calculatePlayerFuelCost([{ type: ShipType.SPY_PROBE, amount: 1 }], distance, 1, player);
  }

  if (originContext.availableDeuterium < requiredFuel) {
    return {
      ok: false,
      error: commandError(
        400,
        'INSUFFICIENT_RESOURCES',
        `Star system espionage needs ${requiredFuel} deuterium, but ${originContext.label} has only ${originContext.availableDeuterium}.`
      )
    };
  }

  const createdFleets: FleetType[] = [];
  let remainingUndamagedProbes = availableUndamagedProbes;
  let remainingDamagedProbes = availableDamagedProbes;
  for (const targetPlanet of targetPlanets) {
    const targetCoordinates = {
      x: targetPlanet.basicInfo.solarSystem.coordinates.x,
      y: targetPlanet.basicInfo.solarSystem.coordinates.y,
      z: Math.max(0, targetPlanet.basicInfo.order - 1)
    };
    const useUndamagedProbe = remainingUndamagedProbes > 0;
    const result = createFleetMission(
      context,
      {
        missionType: FleetMissionType.SPY,
        origin: originContext.coordinates,
        originFleetId: command.originFleetId ?? null,
        target: targetCoordinates,
        ships: [{
          type: ShipType.SPY_PROBE,
          undamagedAmount: useUndamagedProbe ? 1 : 0,
          damagedAmount: useUndamagedProbe ? 0 : 1
        }],
        carriedBombs: [],
        cargo: {
          metal: 0,
          crystal: 0,
          deuterium: 0
        },
        useJumpGate: false,
        bombardmentPriorities: null
      }
    );
    if (!result.ok) {
      return result;
    }

    if (useUndamagedProbe) {
      remainingUndamagedProbes -= 1;
    } else {
      remainingDamagedProbes -= 1;
    }
    createdFleets.push(result.value.fleet);
  }

  return commandOk({
    fleets: createdFleets,
    launchedFleetCount: createdFleets.length,
    targetPlanets
  });
}

function resolveStarSystemSpyOriginContext(
  context: GameCommandContext,
  command: CreateStarSystemSpyCommand,
  player: Player
): CommandResult<{
  coordinates: ClientCoordinates;
  availableUndamagedProbes: number;
  availableDamagedProbes: number;
  availableDeuterium: number;
  label: string;
}> {
  if (command.originFleetId !== null && command.originFleetId !== undefined) {
    if (!Number.isInteger(command.originFleetId) || command.originFleetId <= 0) {
      return {
        ok: false,
        error: commandError(400, 'INVALID_INPUT', 'Invalid origin fleet id.')
      };
    }

    const fleet = context.galaxy.activeFleets.find((entry) =>
      entry.fleetId === command.originFleetId && entry.ownerId === context.playerId
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

    const originCoordinates = {
      x: fleet.target.x,
      y: fleet.target.y,
      z: fleet.target.z
    };
    const originPlanetResult = resolvePlanetOrError(context.galaxy, originCoordinates);
    if (!originPlanetResult.ok) {
      return {
        ok: false,
        error: commandError(404, 'PLANET_NOT_FOUND', 'Remote origin planet not found.')
      };
    }

    return commandOk({
      coordinates: originCoordinates,
      availableUndamagedProbes: fleet.ships.undamagedShipsCount[ShipType.SPY_PROBE] ?? 0,
      availableDamagedProbes: fleet.ships.damagedShips.filter((entry) => entry.type === ShipType.SPY_PROBE).length,
      availableDeuterium: Math.max(0, Math.floor(fleet.cargo.deuterium)),
      label: `Origin fleet #${fleet.fleetId}`
    });
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

  const originPlanet = originPlanetResult.value;
  if (originPlanet.info.ownerId !== player.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Origin planet must be owned by you.')
    };
  }

  return commandOk({
    coordinates: command.origin,
    availableUndamagedProbes: countPlanetUndamagedShipsByType(originPlanet).get(ShipType.SPY_PROBE) ?? 0,
    availableDamagedProbes: countPlanetDamagedShipsByType(originPlanet).get(ShipType.SPY_PROBE) ?? 0,
    availableDeuterium: Math.max(0, Math.floor(originPlanet.rBDSFTQ.resources.deuterium)),
    label: 'Origin planet'
  });
}
