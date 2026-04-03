import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import type { DefenceType } from '../../../src/app/models/enums/defence-type.ts';
import type { ShipType } from '../../../src/app/models/enums/ship-type.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  ShipyardQueueEntry,
  calculateMaxShipyardQueueLength,
  commandError,
  commandOk,
  countPlanetaryBombs,
  hasDefenceBuildingRequirements,
  hasDefenceTechnologyRequirements,
  hasShipBuildingRequirements,
  hasShipTechnologyRequirements,
  isPlanetaryBombDefenceType,
  multiplyResourcePack,
  resolveOwnedPlanetOrError,
  resolvePlayerOrError
} from './command-helpers.ts';

export type StartShipyardConstructionCommand = {
  x: number;
  y: number;
  z: number;
  itemKind: 'ship' | 'defence';
  shipType?: ShipType | null;
  defenceType?: DefenceType | null;
  amount: number;
};

export type StartShipyardConstructionResult = {
  planet: Planet;
  queueLength: number;
  spent: ResourcesPackType;
};

export function startShipyardConstruction(
  context: GameCommandContext,
  command: StartShipyardConstructionCommand
): CommandResult<StartShipyardConstructionResult> {
  const playerResult = resolvePlayerOrError(context);
  if (!playerResult.ok) {
    return playerResult;
  }

  const planetResult = resolveOwnedPlanetOrError(context, command);
  if (!planetResult.ok) {
    return planetResult;
  }

  const player = playerResult.value;
  const planet = planetResult.value;
  if (planet.getBuildingLevel(BuildingType.SHIPYARD) <= 0) {
    return {
      ok: false,
      error: commandError(400, 'REQUIREMENTS_NOT_MET', 'Build Shipyard first.')
    };
  }

  const queueLimit = calculateMaxShipyardQueueLength(planet, player);
  if (planet.rBDSFTQ.shipyardQueue.length >= queueLimit) {
    return {
      ok: false,
      error: commandError(400, 'QUEUE_FULL', 'Queue full.')
    };
  }

  const ship = command.itemKind === 'ship' && command.shipType ? SHIP_BLUEPRINTS.get(command.shipType) : null;
  const defence = command.itemKind === 'defence' && command.defenceType ? DEFENCE_BLUEPRINTS.get(command.defenceType) : null;
  const blueprint = ship ?? defence;
  if (!blueprint) {
    return {
      ok: false,
      error: commandError(
        400,
        'INVALID_INPUT',
        command.itemKind === 'ship' ? 'Unknown ship type.' : 'Unknown defence type.'
      )
    };
  }

  const hasBuildingReqs = command.itemKind === 'ship'
    ? hasShipBuildingRequirements(planet, ship!)
    : hasDefenceBuildingRequirements(planet, defence!);
  if (!hasBuildingReqs) {
    return {
      ok: false,
      error: commandError(400, 'REQUIREMENTS_NOT_MET', 'Building requirements are not met.')
    };
  }

  const hasTechReqs = command.itemKind === 'ship'
    ? hasShipTechnologyRequirements(player, ship!)
    : hasDefenceTechnologyRequirements(player, defence!);
  if (!hasTechReqs) {
    return {
      ok: false,
      error: commandError(400, 'TECH_REQUIREMENTS_NOT_MET', 'Technology requirements are not met.')
    };
  }

  if (
    command.itemKind === 'defence'
    && command.defenceType
    && isPlanetaryBombDefenceType(command.defenceType)
  ) {
    const bombDepotCapacity = Math.max(0, Math.floor(planet.getBuildingProductionValue1(BuildingType.BOMB_DEPOT)));
    const queuedBombs = planet.rBDSFTQ.shipyardQueue
      .filter((entry) => entry.itemKind === 'defence' && entry.defenceType && isPlanetaryBombDefenceType(entry.defenceType))
      .reduce((sum, entry) => sum + Math.max(0, Math.floor(entry.amount)), 0);
    const totalBombsAfterQueue = countPlanetaryBombs(planet.rBDSFTQ.defences) + queuedBombs + command.amount;
    if (totalBombsAfterQueue > bombDepotCapacity) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', 'Bomb Depot capacity reached.')
      };
    }
  }

  const totalCost = multiplyResourcePack(blueprint.cost, command.amount);
  if (!planet.rBDSFTQ.resources.isSufficient(totalCost)) {
    return {
      ok: false,
      error: commandError(400, 'INSUFFICIENT_RESOURCES', 'Insufficient resources.')
    };
  }

  planet.rBDSFTQ.resources.subtractResourcePack(totalCost);
  planet.rBDSFTQ.shipyardQueue.push(
    command.itemKind === 'ship'
      ? ShipyardQueueEntry.ship(command.shipType!, command.amount, 0)
      : ShipyardQueueEntry.defence(command.defenceType!, command.amount, 0)
  );

  return commandOk({
    planet,
    queueLength: planet.rBDSFTQ.shipyardQueue.length,
    spent: new ResourcesPack(totalCost.metal, totalCost.crystal, totalCost.deuterium)
  });
}
