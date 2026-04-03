import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { ResourcesPack } from '../../../src/app/models/resources-pack.js';
import type { TechnologyType } from '../../../src/app/models/enums/technology-type.ts';
import type { ClientCoordinates } from '../../../src/app/models/game-api-types.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  TECHNOLOGY_BLUEPRINTS,
  ResearchHelperFor,
  TechnologyQueueEntry,
  calculateMaxLabsPerTechnology,
  commandError,
  commandOk,
  hasResearchBuildingRequirements,
  hasResearchTechnologyRequirements,
  resolveOwnedPlanetOrError,
  resolvePlanetOrError,
  resolvePlayerOrError,
  sameCoordinates,
  toCoordinatesId
} from './command-helpers.ts';

export type StartTechnologyResearchCommand = {
  x: number;
  y: number;
  z: number;
  technologyType: TechnologyType;
  helperPlanets: ClientCoordinates[];
};

export type StartTechnologyResearchResult = {
  mainPlanet: Planet;
  helperPlanets: Planet[];
  spent: ResourcesPackType;
};

export function startTechnologyResearch(
  context: GameCommandContext,
  command: StartTechnologyResearchCommand
): CommandResult<StartTechnologyResearchResult> {
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
  if (planet.getBuildingLevel(BuildingType.RESEARCH_LAB) <= 0) {
    return {
      ok: false,
      error: commandError(400, 'REQUIREMENTS_NOT_MET', 'Build Research Lab first.')
    };
  }

  if (planet.rBDSFTQ.currentResearchQueue) {
    return {
      ok: false,
      error: commandError(400, 'QUEUE_FULL', 'Queue full.')
    };
  }

  if (planet.rBDSFTQ.researchHelperFor) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Research Lab is currently assigned as helper.')
    };
  }

  const technology = TECHNOLOGY_BLUEPRINTS.get(command.technologyType);
  if (!technology) {
    return {
      ok: false,
      error: commandError(400, 'INVALID_INPUT', 'Unknown technology type.')
    };
  }

  const technologyAlreadyQueued = player.planets.some((entry) => {
    const queue = entry.rBDSFTQ.currentResearchQueue;
    return queue !== null && queue.technologyType === command.technologyType;
  });
  if (technologyAlreadyQueued) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Technology is already being researched.')
    };
  }

  const maxLabsPerTechnology = calculateMaxLabsPerTechnology(player);
  const starterCoordinates: ClientCoordinates = { x: command.x, y: command.y, z: command.z };
  const uniqueHelperCoordinates: ClientCoordinates[] = [];
  const helperPlanets: Planet[] = [];
  const helperIds = new Set<string>();

  for (const coordinates of command.helperPlanets) {
    if (sameCoordinates(coordinates, starterCoordinates)) {
      continue;
    }

    const helperId = toCoordinatesId(coordinates);
    if (helperIds.has(helperId)) {
      continue;
    }

    const helperPlanetResult = resolvePlanetOrError(context.galaxy, coordinates);
    if (!helperPlanetResult.ok) {
      const systemNotFound = helperPlanetResult.error.code === 'SYSTEM_NOT_FOUND';
      return {
        ok: false,
        error: {
          ...helperPlanetResult.error,
          message: systemNotFound
            ? 'Helper planet star system not found.'
            : 'Helper planet not found.'
        }
      };
    }

    const helperPlanet = helperPlanetResult.value;
    if (helperPlanet.info.ownerId !== context.playerId) {
      return {
        ok: false,
        error: commandError(403, 'FORBIDDEN', 'Helper planet must be owned by you.')
      };
    }

    if (helperPlanet.getBuildingLevel(BuildingType.RESEARCH_LAB) <= 0) {
      return {
        ok: false,
        error: commandError(400, 'REQUIREMENTS_NOT_MET', 'Selected helper planet has no Research Lab.')
      };
    }

    if (helperPlanet.rBDSFTQ.currentResearchQueue || helperPlanet.rBDSFTQ.researchHelperFor) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', 'Selected helper lab is busy.')
      };
    }

    helperIds.add(helperId);
    uniqueHelperCoordinates.push(coordinates);
    helperPlanets.push(helperPlanet);
  }

  if ((1 + uniqueHelperCoordinates.length) > maxLabsPerTechnology) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Too many helper labs assigned.')
    };
  }

  const nextLevel = player.getTechLevel(command.technologyType) + 1;
  if (!hasResearchBuildingRequirements(planet, technology, nextLevel)) {
    return {
      ok: false,
      error: commandError(400, 'REQUIREMENTS_NOT_MET', 'Building requirements are not met.')
    };
  }

  if (!hasResearchTechnologyRequirements(player, technology, nextLevel)) {
    return {
      ok: false,
      error: commandError(400, 'TECH_REQUIREMENTS_NOT_MET', 'Technology requirements are not met.')
    };
  }

  const cost = technology.getCostForLevel(nextLevel);
  if (!planet.rBDSFTQ.resources.isSufficient(cost)) {
    return {
      ok: false,
      error: commandError(400, 'INSUFFICIENT_RESOURCES', 'Insufficient resources.')
    };
  }

  planet.rBDSFTQ.resources.subtractResourcePack(cost);
  planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
    command.technologyType,
    nextLevel,
    0,
    uniqueHelperCoordinates
  );

  for (const helperPlanet of helperPlanets) {
    helperPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(starterCoordinates, command.technologyType);
  }

  return commandOk({
    mainPlanet: planet,
    helperPlanets,
    spent: new ResourcesPack(cost.metal, cost.crystal, cost.deuterium)
  });
}
