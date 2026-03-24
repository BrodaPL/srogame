import { Galaxy } from './galaxy';
import { Planet } from './planet';
import { Player } from '../player';
import { createNeutralOwnerForPlanet } from './planet-ownership';

export function abandonPlanetToNewNeutralOwner(
  galaxy: Galaxy,
  owner: Player,
  planet: Planet
): Player {
  if (planet.info.ownerId !== owner.playerId) {
    throw new Error('Only the current owner can abandon this planet.');
  }

  clearPlanetResearchParticipation(galaxy, planet);
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
  planet.rBDSFTQ.researchHelperFor = null;

  return createNeutralOwnerForPlanet(galaxy, planet);
}

function clearPlanetResearchParticipation(galaxy: Galaxy, targetPlanet: Planet): void {
  const targetId = toPlanetCoordinatesId(targetPlanet);
  const planets = galaxy.stars.flatMap((row) => row.flatMap((system) => system.planets));

  for (const planet of planets) {
    if (planet === targetPlanet) {
      continue;
    }

    if (planet.rBDSFTQ.currentResearchQueue) {
      planet.rBDSFTQ.currentResearchQueue.helperLabs = planet.rBDSFTQ.currentResearchQueue.helperLabs.filter(
        (helperCoordinates) => toCoordinatesId(helperCoordinates) !== targetId
      );
    }

    if (!planet.rBDSFTQ.researchHelperFor) {
      continue;
    }

    if (toCoordinatesId(planet.rBDSFTQ.researchHelperFor.mainResearchCoordinates) === targetId) {
      planet.rBDSFTQ.researchHelperFor = null;
    }
  }
}

function toPlanetCoordinatesId(planet: Planet): string {
  return toCoordinatesId({
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: Math.max(0, planet.basicInfo.order - 1)
  });
}

function toCoordinatesId(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}
