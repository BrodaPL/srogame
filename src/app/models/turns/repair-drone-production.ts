export type RepairDroneProductionAssignment = 'industry' | 'shipyard' | 'idle';

export type RepairDroneProductionRouting = {
  basePower: number;
  assignedTo: RepairDroneProductionAssignment;
  droneIndustryPower: number;
  droneShipyardPower: number;
};

export function calculateRepairDroneProductionBasePower(options: {
  repairDroneCount: number;
  industryModifier: number;
  adaptiveIndustryMultiplier: number;
  energyEfficiency: number;
  difficultyMultiplier?: number;
}): number {
  const repairDroneCount = Math.max(0, Math.floor(options.repairDroneCount));
  const difficultyMultiplier = Math.max(0, options.difficultyMultiplier ?? 1);
  const basePower = repairDroneCount
    * options.industryModifier
    * options.adaptiveIndustryMultiplier
    * options.energyEfficiency
    * difficultyMultiplier;

  if (!Number.isFinite(basePower) || basePower <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(basePower));
}

export function routeRepairDroneProduction(
  basePower: number,
  options: {
    hasBuildingQueueWork: boolean;
    hasShipyardQueueWork: boolean;
  }
): RepairDroneProductionRouting {
  const normalizedBasePower = Math.max(0, Math.floor(basePower));
  if (normalizedBasePower <= 0) {
    return {
      basePower: 0,
      assignedTo: 'idle',
      droneIndustryPower: 0,
      droneShipyardPower: 0
    };
  }

  if (options.hasBuildingQueueWork) {
    return {
      basePower: normalizedBasePower,
      assignedTo: 'industry',
      droneIndustryPower: normalizedBasePower,
      droneShipyardPower: 0
    };
  }

  if (options.hasShipyardQueueWork) {
    return {
      basePower: normalizedBasePower,
      assignedTo: 'shipyard',
      droneIndustryPower: 0,
      droneShipyardPower: normalizedBasePower
    };
  }

  return {
    basePower: normalizedBasePower,
    assignedTo: 'idle',
    droneIndustryPower: 0,
    droneShipyardPower: 0
  };
}
