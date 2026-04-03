import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import { SHIP_BLUEPRINTS, DEFENCE_BLUEPRINTS, calculateTravelDistance, resolveDiplomaticStatus } from '../game-commands/command-helpers.js';
import type { EspionageReportData } from '../../../src/app/models/reports/espionage-report-data.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { ClientCoordinates } from '../../../src/app/models/game-api-types.ts';
import type { ShipType } from '../../../src/app/models/enums/ship-type.ts';

export type BotDiplomacyContext = {
  otherPlayerId: number;
  currentStatus: DiplomaticStatus;
  relativeStrengthRatio: number;
  sharesBorder: boolean;
  borderPressure: number;
  recentConflictScore: number;
  strategicValue: number;
};

export function buildBotDiplomacyContexts(
  galaxy: Galaxy,
  player: Player
): Map<number, BotDiplomacyContext> {
  const contexts = new Map<number, BotDiplomacyContext>();
  const allPlanets = flattenPlanets(galaxy);

  for (const otherPlayer of galaxy.players) {
    if (otherPlayer.playerId === player.playerId) {
      continue;
    }

    const currentStatus = resolveDiplomaticStatus(galaxy, player.playerId, otherPlayer.playerId);
    const border = analyzeBorderSituation(galaxy, player, otherPlayer, allPlanets);
    const ownStrength = border.ownStrength > 0 ? border.ownStrength : estimateEmpirePlanetStrength(player.planets);
    const foreignStrength = border.foreignStrength > 0 ? border.foreignStrength : estimateKnownForeignStrength(player.playerId, otherPlayer.planets);
    const relativeStrengthRatio = ownStrength / Math.max(1, foreignStrength);

    contexts.set(otherPlayer.playerId, {
      otherPlayerId: otherPlayer.playerId,
      currentStatus,
      relativeStrengthRatio,
      sharesBorder: border.sharesBorder,
      borderPressure: border.borderPressure,
      recentConflictScore: estimateRecentConflictScore(galaxy, player.playerId, otherPlayer.playerId, allPlanets),
      strategicValue: estimateStrategicValue(currentStatus, border.sharesBorder, border.borderConnections, relativeStrengthRatio)
    });
  }

  return contexts;
}

type BorderAnalysis = {
  sharesBorder: boolean;
  borderConnections: number;
  ownStrength: number;
  foreignStrength: number;
  borderPressure: number;
};

function analyzeBorderSituation(
  galaxy: Galaxy,
  player: Player,
  otherPlayer: Player,
  allPlanets: Planet[]
): BorderAnalysis {
  const ownPlanets = player.planets;
  const foreignPlanets = otherPlayer.planets;
  const ownIncluded = new Set<string>();
  const foreignIncluded = new Set<string>();
  let sharesBorder = false;
  let borderConnections = 0;
  let ownStrength = 0;
  let foreignStrength = 0;
  let borderPressure = 0;

  for (const ownPlanet of ownPlanets) {
    const ownCoordinates = coordinatesOfPlanet(ownPlanet);
    for (const foreignPlanet of foreignPlanets) {
      const foreignCoordinates = coordinatesOfPlanet(foreignPlanet);
      const distance = calculateTravelDistance(ownCoordinates, foreignCoordinates);
      if (distance > 4) {
        continue;
      }

      sharesBorder = true;
      borderConnections += 1;

      const ownKey = coordinatesKey(ownCoordinates);
      if (!ownIncluded.has(ownKey)) {
        ownIncluded.add(ownKey);
        ownStrength += estimatePlanetCombatStrength(ownPlanet);
      }

      const foreignKey = coordinatesKey(foreignCoordinates);
      const knownStrength = estimateKnownPlanetStrength(player.playerId, foreignPlanet);
      if (!foreignIncluded.has(foreignKey)) {
        foreignIncluded.add(foreignKey);
        foreignStrength += knownStrength;
      }

      const status = resolveDiplomaticStatus(galaxy, player.playerId, otherPlayer.playerId);
      const pressureScale = pressureScaleForStatus(status);
      if (pressureScale <= 0) {
        continue;
      }

      borderPressure += (knownStrength / Math.max(1, distance * 10)) * pressureScale;
    }
  }

  return {
    sharesBorder,
    borderConnections,
    ownStrength,
    foreignStrength,
    borderPressure
  };
}

function estimateStrategicValue(
  status: DiplomaticStatus,
  sharesBorder: boolean,
  borderConnections: number,
  relativeStrengthRatio: number
): number {
  const borderValue = sharesBorder ? Math.min(3, 1 + (borderConnections * 0.4)) : 0.35;
  const vulnerabilityValue = relativeStrengthRatio < 1
    ? Math.min(2.5, (1 - relativeStrengthRatio) * 4)
    : Math.max(0, 1.25 - relativeStrengthRatio);
  const statusValue = status === DiplomaticStatus.PEACE
    ? 1.5
    : status === DiplomaticStatus.WAR
      ? 0.75
      : 1;

  return borderValue + vulnerabilityValue + statusValue;
}

function estimateRecentConflictScore(
  galaxy: Galaxy,
  playerId: number,
  otherPlayerId: number,
  allPlanets: Planet[]
): number {
  let score = 0;

  for (const fleet of galaxy.activeFleets) {
    const targetOwnerId = ownerIdAtCoordinates(allPlanets, fleet.target);
    if (fleet.ownerId === otherPlayerId && targetOwnerId === playerId) {
      score += hostileMissionConflictWeight(fleet.missionType);
    } else if (fleet.ownerId === playerId && targetOwnerId === otherPlayerId) {
      score += ownHostileMissionConflictWeight(fleet.missionType);
    }
  }

  return score;
}

function hostileMissionConflictWeight(missionType: FleetMissionType): number {
  switch (missionType) {
    case FleetMissionType.ATTACK:
      return 4;
    case FleetMissionType.BOMBARD:
      return 5;
    case FleetMissionType.SIEGE:
      return 6;
    case FleetMissionType.SPY:
      return 1.5;
    default:
      return 0;
  }
}

function ownHostileMissionConflictWeight(missionType: FleetMissionType): number {
  switch (missionType) {
    case FleetMissionType.ATTACK:
      return 2;
    case FleetMissionType.BOMBARD:
      return 2.5;
    case FleetMissionType.SIEGE:
      return 3;
    case FleetMissionType.SPY:
      return 0.5;
    default:
      return 0;
  }
}

function pressureScaleForStatus(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.WAR:
      return 1;
    case DiplomaticStatus.NEUTRAL:
      return 0.7;
    case DiplomaticStatus.PASSIVE:
      return 0.85;
    case DiplomaticStatus.PEACE:
      return 0.15;
    default:
      return 0;
  }
}

function estimateEmpirePlanetStrength(planets: Planet[]): number {
  return planets.reduce((sum, planet) => sum + estimatePlanetCombatStrength(planet), 0);
}

function estimateKnownForeignStrength(viewerPlayerId: number, planets: Planet[]): number {
  return planets.reduce((sum, planet) => sum + estimateKnownPlanetStrength(viewerPlayerId, planet), 0);
}

function estimateKnownPlanetStrength(viewerPlayerId: number, planet: Planet): number {
  const report = planet.lastReportData.get(viewerPlayerId) ?? null;
  if (report) {
    return estimateReportCombatStrength(report);
  }

  const fallbackStrength = estimatePlanetCombatStrength(planet);
  if (fallbackStrength > 0) {
    return fallbackStrength;
  }

  return 18;
}

function estimateReportCombatStrength(report: EspionageReportData): number {
  let total = 0;

  for (const [shipType, amount] of report.ships.entries()) {
    total += estimateShipCombatPower(shipType) * amount;
  }
  for (const defenceEntry of report.defences) {
    total += estimateDefenceCombatPower(defenceEntry.type) * defenceEntry.amount;
  }

  if (total <= 0) {
    total += report.totalShipsAmount * 6;
    total += report.totalDefencesAmount * 5;
  }

  return total;
}

function estimatePlanetCombatStrength(planet: Planet): number {
  let total = 0;

  for (const [shipType, amount] of planet.rBDSFTQ.ships.countByType().entries()) {
    total += estimateShipCombatPower(shipType) * amount;
  }
  for (const [defenceType, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
    total += estimateDefenceCombatPower(defenceType) * amount;
  }

  return total;
}

function estimateShipCombatPower(shipType: ShipType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function estimateDefenceCombatPower(type: string): number {
  const blueprint = DEFENCE_BLUEPRINTS.get(type as never);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function ownerIdAtCoordinates(planets: Planet[], coordinates: ClientCoordinates): number | null {
  const planet = planets.find((entry) => sameCoordinates(coordinatesOfPlanet(entry), coordinates)) ?? null;
  return planet?.info.ownerId ?? null;
}

function flattenPlanets(galaxy: Galaxy): Planet[] {
  return galaxy.stars.flatMap((row) => row.flatMap((system) => system.planets));
}

function coordinatesOfPlanet(planet: Planet): ClientCoordinates {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: Math.max(0, planet.basicInfo.order - 1)
  };
}

function coordinatesKey(coordinates: ClientCoordinates): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function sameCoordinates(left: ClientCoordinates, right: ClientCoordinates): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}
