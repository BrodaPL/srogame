import type { TechnologyType } from '../../../src/app/models/enums/technology-type.ts';
import type { ClientCoordinates } from '../../../src/app/models/game-api-types.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  BuildingType,
  ResourcesPack,
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

export type UpdateResearchHelpersCommand = {
  x: number;
  y: number;
  z: number;
  helperPlanets: ClientCoordinates[];
};

export type StartTechnologyResearchResult = {
  mainPlanet: Planet;
  helperPlanets: Planet[];
  spent: ResourcesPackType;
};

export type UpdateResearchHelpersResult = {
  mainPlanet: Planet;
  helperPlanets: Planet[];
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
  const helpersResult = resolveResearchHelpers(context, {
    starterCoordinates,
    technologyType: command.technologyType,
    helperPlanets: command.helperPlanets,
    allowCurrentResearchHelpers: false
  });
  if (!helpersResult.ok) {
    return helpersResult;
  }

  const { uniqueHelperCoordinates, helperPlanets } = helpersResult.value;

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

export function updateResearchHelpers(
  context: GameCommandContext,
  command: UpdateResearchHelpersCommand
): CommandResult<UpdateResearchHelpersResult> {
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

  const currentResearchQueue = planet.rBDSFTQ.currentResearchQueue;
  if (!currentResearchQueue) {
    return {
      ok: false,
      error: commandError(409, 'CONFLICT', 'Selected planet is not researching any technology.')
    };
  }

  const starterCoordinates: ClientCoordinates = { x: command.x, y: command.y, z: command.z };
  const helpersResult = resolveResearchHelpers(context, {
    starterCoordinates,
    technologyType: currentResearchQueue.technologyType,
    helperPlanets: command.helperPlanets,
    allowCurrentResearchHelpers: true
  });
  if (!helpersResult.ok) {
    return helpersResult;
  }

  const { uniqueHelperCoordinates, helperPlanets } = helpersResult.value;
  const maxLabsPerTechnology = calculateMaxLabsPerTechnology(player);
  if ((1 + uniqueHelperCoordinates.length) > maxLabsPerTechnology) {
    return {
      ok: false,
      error: commandError(400, 'CONFLICT', 'Too many helper labs assigned.')
    };
  }

  clearResearchHelpers(context.galaxy, starterCoordinates, currentResearchQueue.technologyType, currentResearchQueue.helperLabs);
  currentResearchQueue.helperLabs = uniqueHelperCoordinates;
  for (const helperPlanet of helperPlanets) {
    helperPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(
      starterCoordinates,
      currentResearchQueue.technologyType
    );
  }

  return commandOk({
    mainPlanet: planet,
    helperPlanets
  });
}

type ResolveResearchHelpersOptions = {
  starterCoordinates: ClientCoordinates;
  technologyType: TechnologyType;
  helperPlanets: ClientCoordinates[];
  allowCurrentResearchHelpers: boolean;
};

function resolveResearchHelpers(
  context: GameCommandContext,
  options: ResolveResearchHelpersOptions
): CommandResult<{ uniqueHelperCoordinates: ClientCoordinates[]; helperPlanets: Planet[] }> {
  const uniqueHelperCoordinates: ClientCoordinates[] = [];
  const helperPlanets: Planet[] = [];
  const helperIds = new Set<string>();

  for (const coordinates of options.helperPlanets) {
    if (sameCoordinates(coordinates, options.starterCoordinates)) {
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

    if (helperPlanet.rBDSFTQ.currentResearchQueue) {
      return {
        ok: false,
        error: commandError(400, 'CONFLICT', 'Selected helper lab is busy.')
      };
    }

    if (helperPlanet.rBDSFTQ.researchHelperFor) {
      const canReuseExistingHelper = options.allowCurrentResearchHelpers
        && isHelperForResearch(
          helperPlanet,
          options.starterCoordinates,
          options.technologyType
        );
      if (!canReuseExistingHelper) {
        return {
          ok: false,
          error: commandError(400, 'CONFLICT', 'Selected helper lab is busy.')
        };
      }
    }

    helperIds.add(helperId);
    uniqueHelperCoordinates.push(coordinates);
    helperPlanets.push(helperPlanet);
  }

  return commandOk({
    uniqueHelperCoordinates,
    helperPlanets
  });
}

function clearResearchHelpers(
  galaxy: GameCommandContext['galaxy'],
  starterCoordinates: ClientCoordinates,
  technologyType: TechnologyType,
  helperCoordinates: ClientCoordinates[]
): void {
  for (const coordinates of helperCoordinates) {
    const helperPlanetResult = resolvePlanetOrError(galaxy, coordinates);
    if (!helperPlanetResult.ok) {
      continue;
    }

    const helperPlanet = helperPlanetResult.value;
    if (!isHelperForResearch(helperPlanet, starterCoordinates, technologyType)) {
      continue;
    }

    helperPlanet.rBDSFTQ.researchHelperFor = null;
  }
}

function isHelperForResearch(
  helperPlanet: Planet,
  starterCoordinates: ClientCoordinates,
  technologyType: TechnologyType
): boolean {
  const helperReference = helperPlanet.rBDSFTQ.researchHelperFor;
  return helperReference !== null
    && helperReference.technologyType === technologyType
    && sameCoordinates(helperReference.mainResearchCoordinates, starterCoordinates);
}
