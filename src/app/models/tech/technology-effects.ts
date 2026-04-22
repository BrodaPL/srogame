import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { HullClass } from '../enums/hull-class';
import { ShipType } from '../enums/ship-type';

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();

const HULL_CLASS_TRAVEL_MODIFIERS: ReadonlyMap<HullClass, number> = new Map<HullClass, number>([
  [HullClass.SMALL, 0.5],
  [HullClass.MEDIUM, 0.25],
  [HullClass.BIG, 0],
  [HullClass.TITAN, -0.35],
  [HullClass.STATION, 1]
]);

export type FleetTravelShipSelection = {
  type: ShipType;
  amount: number;
};

export function maxActiveFleets(computerTechnologyLevel: number): number {
  return 2 + (sanitizeTechLevel(computerTechnologyLevel) * 2);
}

export function maxOwnedPlanets(adaptiveTechnologyLevel: number): number {
  return Math.floor(Math.sqrt(sanitizeTechLevel(adaptiveTechnologyLevel) * 2)) + 1;
}

export function industryPowerMultiplier(adaptiveTechnologyLevel: number): number {
  return 1 + (sanitizeTechLevel(adaptiveTechnologyLevel) / 100);
}

export function researchPowerMultiplier(
  computerTechnologyLevel: number,
  adaptiveTechnologyLevel: number,
  intergalacticResearchNetworkLevel: number
): number {
  const totalBonusPercent = (
    (sanitizeTechLevel(computerTechnologyLevel) * 5)
    + sanitizeTechLevel(adaptiveTechnologyLevel)
    + (sanitizeTechLevel(intergalacticResearchNetworkLevel) * 2)
  );

  return 1 + (totalBonusPercent / 100);
}

export function fleetTravelTurnsForDistance(
  distance: number,
  fusionDriveLevel: number,
  hyperspaceDriveLevel: number,
  gravitonTechnologyLevel: number,
  ships: FleetTravelShipSelection[] = []
): number {
  const sanitizedDistance = Math.max(0, distance);
  const sanitizedFusionDriveLevel = sanitizeTechLevel(fusionDriveLevel);
  const sanitizedHyperspaceDriveLevel = sanitizeTechLevel(hyperspaceDriveLevel);
  const sanitizedGravitonTechnologyLevel = sanitizeTechLevel(gravitonTechnologyLevel);
  const baseRawTurns = (
    4 / (1 + (sanitizedFusionDriveLevel / 3))
    + sanitizedDistance / (1 + (sanitizedHyperspaceDriveLevel / 6))
    - sanitizedGravitonTechnologyLevel
  );
  const shipModifierMultiplier = 1 + fleetTravelWorstShipModifier(ships);
  const rawTurns = baseRawTurns * shipModifierMultiplier;

  return Math.max(1, Math.ceil(rawTurns));
}

export function fleetTravelWorstShipModifier(ships: FleetTravelShipSelection[] = []): number {
  let worstModifier: number | null = null;

  for (const entry of ships) {
    const normalizedAmount = Math.max(0, Math.floor(entry.amount));
    if (normalizedAmount <= 0) {
      continue;
    }

    const hullClass = SHIP_BLUEPRINTS.get(entry.type)?.hullClass;
    if (!hullClass) {
      continue;
    }

    const modifier = HULL_CLASS_TRAVEL_MODIFIERS.get(hullClass) ?? 0;
    if (worstModifier === null || modifier > worstModifier) {
      worstModifier = modifier;
    }
  }

  return worstModifier ?? 0;
}

function sanitizeTechLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.max(0, level);
}
