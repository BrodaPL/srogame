import * as diplomaticStatusModule from '../../src/app/models/diplomacy/diplomatic-status.js';
import * as fleetModule from '../../src/app/models/fleets/fleet.js';
import * as manyShipsModule from '../../src/app/models/fleets/many-ships.js';
import type {
  ClientCoordinates,
  SensorPhalanxFleetContactDto
} from '../../src/app/models/game-api-types.ts';
import type { DiplomacyResolver } from '../../src/app/models/diplomacy/diplomacy-resolver.ts';
import type { Fleet } from '../../src/app/models/fleets/fleet.ts';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';

const { DiplomaticStatus } = diplomaticStatusModule as typeof import('../../src/app/models/diplomacy/diplomatic-status.js');
const { FleetState } = fleetModule as typeof import('../../src/app/models/fleets/fleet.js');
const { ManyShips } = manyShipsModule as typeof import('../../src/app/models/fleets/many-ships.js');

export type SensorPhalanxPassiveDetection = {
  fleetId: number;
  targetCoordinates: ClientCoordinates;
  targetPlanetName: string;
  contact: SensorPhalanxFleetContactDto;
};

export function collectSensorPhalanxPassiveDetections(
  galaxy: Galaxy,
  viewerPlayerId: number,
  detectorCoordinates: ClientCoordinates,
  normalRange: number,
  diplomacyResolver: DiplomacyResolver
): SensorPhalanxPassiveDetection[] {
  const detections: SensorPhalanxPassiveDetection[] = [];

  for (const fleet of galaxy.activeFleets) {
    if (fleet.state !== FleetState.MOVING_TO_TARGET) {
      continue;
    }

    if (fleet.ownerId === viewerPlayerId) {
      continue;
    }

    const targetPlanet = resolvePlanetAtCoordinates(galaxy, fleet.target);
    if (!targetPlanet) {
      continue;
    }

    if (calculateTravelDistance(detectorCoordinates, fleet.target) > normalRange) {
      continue;
    }

    detections.push({
      fleetId: fleet.fleetId,
      targetCoordinates: { ...fleet.target },
      targetPlanetName: targetPlanet.basicInfo.name,
      contact: toSensorPhalanxFleetContactDto(
        fleet,
        galaxy.currentTurn,
        isAlliedSensorPhalanxContact(diplomacyResolver, viewerPlayerId, fleet.ownerId)
      )
    });
  }

  detections.sort((left, right) =>
    compareSensorPhalanxContacts(left.contact, right.contact)
      || left.targetCoordinates.x - right.targetCoordinates.x
      || left.targetCoordinates.y - right.targetCoordinates.y
      || left.targetCoordinates.z - right.targetCoordinates.z
      || left.fleetId - right.fleetId
  );

  return detections;
}

function calculateTravelDistance(origin: ClientCoordinates, target: ClientCoordinates): number {
  return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
}

function remainingTravelTurnsForFleet(fleet: Fleet, currentTurn: number): number {
  if (fleet.state !== FleetState.MOVING_TO_TARGET) {
    return 0;
  }

  const elapsedTurns = Math.max(0, currentTurn - fleet.createdAtTurn);
  return Math.max(0, fleet.travelTurns - elapsedTurns);
}

function isAlliedSensorPhalanxContact(
  diplomacyResolver: DiplomacyResolver,
  viewerPlayerId: number,
  fleetOwnerId: number
): boolean {
  const status = diplomacyResolver.getStatus(viewerPlayerId, fleetOwnerId);
  return status === DiplomaticStatus.SELF || status === DiplomaticStatus.ALLIED;
}

function compareSensorPhalanxContacts(
  left: SensorPhalanxFleetContactDto,
  right: SensorPhalanxFleetContactDto
): number {
  const directionWeight = (contact: SensorPhalanxFleetContactDto) => contact.direction === 'INCOMING' ? 0 : 1;
  return directionWeight(left) - directionWeight(right)
    || left.etaTurns - right.etaTurns
    || right.fleetSize - left.fleetSize
    || Number(left.isAllied) - Number(right.isAllied);
}

function toSensorPhalanxFleetContactDto(
  fleet: Fleet,
  currentTurn: number,
  isAllied: boolean
): SensorPhalanxFleetContactDto {
  return {
    direction: 'INCOMING',
    fleetSize: ManyShips.totalShipsCount(fleet.ships),
    etaTurns: remainingTravelTurnsForFleet(fleet, currentTurn),
    isAllied
  };
}

function resolvePlanetAtCoordinates(galaxy: Galaxy, coordinates: ClientCoordinates) {
  return galaxy.stars[coordinates.y]?.[coordinates.x]?.planets[coordinates.z] ?? null;
}
