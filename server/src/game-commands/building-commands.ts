import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import type { BuildingType } from '../../../src/app/models/enums/building-type.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  BUILDING_BLUEPRINTS,
  BuildingQueueEntry,
  calculateMaxBuildingQueueLength,
  commandError,
  commandOk,
  hasBuildingRequirements,
  hasTechnologyRequirements,
  resolveOwnedPlanetOrError,
  resolvePlayerOrError
} from './command-helpers.ts';

export type StartBuildingConstructionCommand = {
  x: number;
  y: number;
  z: number;
  buildingType: BuildingType;
};

export type StartBuildingConstructionResult = {
  planet: Planet;
  queueLength: number;
  spent: ResourcesPackType;
};

export function startBuildingConstruction(
  context: GameCommandContext,
  command: StartBuildingConstructionCommand
): CommandResult<StartBuildingConstructionResult> {
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
  const queueLimit = calculateMaxBuildingQueueLength(planet, player);
  if (planet.rBDSFTQ.buildingQueue.length >= queueLimit) {
    return {
      ok: false,
      error: commandError(400, 'QUEUE_FULL', 'Queue full.')
    };
  }

  const alreadyQueued = planet.rBDSFTQ.buildingQueue.some(
    (entry) => entry.buildingType === command.buildingType
  );
  if (alreadyQueued) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Building type is already queued.')
    };
  }

  const building = BUILDING_BLUEPRINTS.get(command.buildingType);
  if (!building) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Unknown building type.')
    };
  }

  const nextLevel = planet.getBuildingLevel(command.buildingType) + 1;
  if (!hasBuildingRequirements(planet, building, nextLevel)) {
    return {
      ok: false,
      error: commandError(400, 'REQUIREMENTS_NOT_MET', 'Building requirements are not met.')
    };
  }

  if (!hasTechnologyRequirements(player, building, nextLevel)) {
    return {
      ok: false,
      error: commandError(400, 'TECH_REQUIREMENTS_NOT_MET', 'Technology requirements are not met.')
    };
  }

  const cost = building.getCostForLevel(nextLevel);
  if (!planet.rBDSFTQ.resources.isSufficient(cost)) {
    return {
      ok: false,
      error: commandError(400, 'INSUFFICIENT_RESOURCES', 'Insufficient resources.')
    };
  }

  planet.rBDSFTQ.resources.subtractResourcePack(cost);
  planet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(command.buildingType, nextLevel, 0));

  return commandOk({
    planet,
    queueLength: planet.rBDSFTQ.buildingQueue.length,
    spent: new ResourcesPack(cost.metal, cost.crystal, cost.deuterium)
  });
}
