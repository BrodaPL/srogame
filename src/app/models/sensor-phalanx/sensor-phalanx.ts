export function calculateSensorPhalanxNormalRange(
  baseRange: number,
  anomaliesAndNoise: number,
  buildingEffectiveness: number
): number {
  const normalizedBaseRange = Number.isFinite(baseRange) ? Math.max(0, Math.floor(baseRange)) : 0;
  if (normalizedBaseRange <= 0) {
    return 0;
  }

  const normalizedAnomaliesAndNoise = Number.isFinite(anomaliesAndNoise)
    ? Math.max(0, anomaliesAndNoise)
    : 0;
  const normalizedEffectiveness = Number.isFinite(buildingEffectiveness)
    ? Math.max(0, buildingEffectiveness)
    : 0;

  return Math.max(0, Math.floor(normalizedBaseRange * normalizedAnomaliesAndNoise * normalizedEffectiveness));
}

export function calculateSensorPhalanxActiveScanRange(normalRange: number): number {
  const normalizedRange = Number.isFinite(normalRange) ? Math.max(0, Math.floor(normalRange)) : 0;
  if (normalizedRange <= 0) {
    return 0;
  }

  return Math.max(1, Math.floor(normalizedRange / 2));
}

export function calculateSensorPhalanxScansPerTurn(
  level: number,
  buildingEffectiveness: number
): number {
  const normalizedLevel = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;
  if (normalizedLevel <= 0) {
    return 0;
  }

  const normalizedEffectiveness = Number.isFinite(buildingEffectiveness)
    ? Math.max(0, buildingEffectiveness)
    : 0;

  return Math.max(0, Math.floor(Math.sqrt(normalizedLevel) * normalizedEffectiveness));
}
