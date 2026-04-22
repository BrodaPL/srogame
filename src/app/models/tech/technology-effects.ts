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
  gravitonTechnologyLevel: number
): number {
  const sanitizedDistance = Math.max(0, distance);
  const sanitizedFusionDriveLevel = sanitizeTechLevel(fusionDriveLevel);
  const sanitizedHyperspaceDriveLevel = sanitizeTechLevel(hyperspaceDriveLevel);
  const sanitizedGravitonTechnologyLevel = sanitizeTechLevel(gravitonTechnologyLevel);
  const rawTurns = (
    4 / (1 + (sanitizedFusionDriveLevel / 3))
    + sanitizedDistance / (1 + (sanitizedHyperspaceDriveLevel / 6))
    - sanitizedGravitonTechnologyLevel
  );

  return Math.max(1, Math.ceil(rawTurns));
}

function sanitizeTechLevel(level: number): number {
  if (!Number.isFinite(level)) {
    return 0;
  }

  return Math.max(0, level);
}
