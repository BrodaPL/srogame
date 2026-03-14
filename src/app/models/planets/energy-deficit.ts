const MAX_ENERGY_DEFICIT_PENALTY_PERCENT = 95;
const ENERGY_DEFICIT_PENALTY_FACTOR = 1.5;

export function energyDeficitPenaltyPercent(availableEnergy: number, usedEnergy: number): number {
  if (!Number.isFinite(availableEnergy) || !Number.isFinite(usedEnergy)) {
    return 0;
  }

  const normalizedAvailableEnergy = Math.max(0, availableEnergy);
  const normalizedUsedEnergy = Math.max(0, usedEnergy);
  if (normalizedUsedEnergy <= normalizedAvailableEnergy) {
    return 0;
  }

  if (normalizedAvailableEnergy <= 0) {
    return MAX_ENERGY_DEFICIT_PENALTY_PERCENT;
  }

  const deficitPercent = ((normalizedUsedEnergy - normalizedAvailableEnergy) / normalizedAvailableEnergy) * 100;
  return Math.min(MAX_ENERGY_DEFICIT_PENALTY_PERCENT, deficitPercent * ENERGY_DEFICIT_PENALTY_FACTOR);
}

export function energyDeficitEfficiencyMultiplier(availableEnergy: number, usedEnergy: number): number {
  const penaltyPercent = energyDeficitPenaltyPercent(availableEnergy, usedEnergy);
  return Math.max(0.05, 1 - (penaltyPercent / 100));
}
