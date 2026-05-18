import * as buildingTypeEnumModule from '../../../src/app/models/enums/building-type.js';
import type { Planet } from '../../../src/app/models/planets/planet.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { BuildingType } = resolveModule(buildingTypeEnumModule) as typeof import('../../../src/app/models/enums/building-type.js');

export type BotInfrastructureDamageCategory = 'CRUCIAL' | 'IMPORTANT' | 'BASIC';

export type BotInfrastructureBuildingDamageEntry = {
  category: BotInfrastructureDamageCategory;
  level: number;
  currentStructuralPoints: number;
  maxStructuralPoints: number;
  missingStructuralPoints: number;
  damagePercent: number;
  thresholdPercent: number;
  emergencyTriggered: boolean;
};

export type BotInfrastructureDamageCategorySummary = {
  damagedBuildingCount: number;
  missingStructuralPoints: number;
  totalStructuralPoints: number;
  damagePercent: number;
  thresholdPercent: number;
  emergencyTriggered: boolean;
  maxBuildingDamagePercent: number;
  triggeredBuildingTypes: BuildingType[];
};

export type BotInfrastructureDamageSummary = {
  damagedBuildingCount: number;
  missingBuildingStructuralPoints: number;
  totalBuildingStructuralPoints: number;
  totalDamagePercent: number;
  emergencyRepairTriggered: boolean;
  highestTriggeredCategory: BotInfrastructureDamageCategory | null;
  maxTriggeredBuildingDamagePercent: number;
  damageByCategory: Record<BotInfrastructureDamageCategory, BotInfrastructureDamageCategorySummary>;
  damageByBuildingType: Partial<Record<BuildingType, BotInfrastructureBuildingDamageEntry>>;
};

type InfrastructureThresholdMap = Record<BotInfrastructureDamageCategory, number>;

const BUILDING_DAMAGE_CATEGORY_THRESHOLDS: InfrastructureThresholdMap = {
  CRUCIAL: 25,
  IMPORTANT: 40,
  BASIC: 80
};

const CRUCIAL_BUILDINGS = new Set<BuildingType>([
  BuildingType.SOLAR_WIND_GEOTHERMAL,
  BuildingType.NUCLEAR_PLANT,
  BuildingType.FUSION_REACTOR
]);

const IMPORTANT_BUILDINGS = new Set<BuildingType>([
  BuildingType.METAL_MINE,
  BuildingType.CRYSTAL_MINE,
  BuildingType.DEUTERIUM_SYNTHESIZER,
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.NANITE_FACTORY,
  BuildingType.SHIPYARD
]);

export function resolveInfrastructureDamageCategory(buildingType: BuildingType): BotInfrastructureDamageCategory {
  if (CRUCIAL_BUILDINGS.has(buildingType)) {
    return 'CRUCIAL';
  }
  if (IMPORTANT_BUILDINGS.has(buildingType)) {
    return 'IMPORTANT';
  }
  return 'BASIC';
}

export function resolveInfrastructureDamageThresholdPercent(category: BotInfrastructureDamageCategory): number {
  return BUILDING_DAMAGE_CATEGORY_THRESHOLDS[category];
}

export function resolveInfrastructureDamageSummary(planet: Planet): BotInfrastructureDamageSummary {
  const damageByCategory: Record<BotInfrastructureDamageCategory, BotInfrastructureDamageCategorySummary> = {
    CRUCIAL: createCategorySummary('CRUCIAL'),
    IMPORTANT: createCategorySummary('IMPORTANT'),
    BASIC: createCategorySummary('BASIC')
  };
  const damageByBuildingType: Partial<Record<BuildingType, BotInfrastructureBuildingDamageEntry>> = {};

  let damagedBuildingCount = 0;
  let missingBuildingStructuralPoints = 0;
  let totalBuildingStructuralPoints = 0;
  let emergencyRepairTriggered = false;
  let highestTriggeredCategory: BotInfrastructureDamageCategory | null = null;
  let maxTriggeredBuildingDamagePercent = 0;

  for (const [buildingType, level] of planet.rBDSFTQ.buildingsLevels.entries()) {
    if (level <= 0) {
      continue;
    }

    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(buildingType);
    if (maxStructuralPoints <= 0) {
      continue;
    }

    totalBuildingStructuralPoints += maxStructuralPoints;
    const category = resolveInfrastructureDamageCategory(buildingType);
    const categorySummary = damageByCategory[category];
    categorySummary.totalStructuralPoints += maxStructuralPoints;

    const currentStructuralPoints = planet.getCurrentBuildingStructuralPoints(buildingType);
    const missingStructuralPoints = Math.max(0, maxStructuralPoints - currentStructuralPoints);
    const damagePercent = maxStructuralPoints <= 0 ? 0 : (missingStructuralPoints / maxStructuralPoints) * 100;
    const emergencyTriggered = damagePercent >= categorySummary.thresholdPercent;

    damageByBuildingType[buildingType] = {
      category,
      level,
      currentStructuralPoints,
      maxStructuralPoints,
      missingStructuralPoints,
      damagePercent,
      thresholdPercent: categorySummary.thresholdPercent,
      emergencyTriggered
    };

    if (missingStructuralPoints <= 0) {
      continue;
    }

    damagedBuildingCount += 1;
    missingBuildingStructuralPoints += missingStructuralPoints;
    categorySummary.damagedBuildingCount += 1;
    categorySummary.missingStructuralPoints += missingStructuralPoints;
    categorySummary.maxBuildingDamagePercent = Math.max(categorySummary.maxBuildingDamagePercent, damagePercent);

    if (emergencyTriggered) {
      categorySummary.emergencyTriggered = true;
      categorySummary.triggeredBuildingTypes.push(buildingType);
      emergencyRepairTriggered = true;
      maxTriggeredBuildingDamagePercent = Math.max(maxTriggeredBuildingDamagePercent, damagePercent);
      highestTriggeredCategory = resolveHigherPriorityCategory(highestTriggeredCategory, category);
    }
  }

  for (const summary of Object.values(damageByCategory)) {
    summary.damagePercent = summary.totalStructuralPoints <= 0
      ? 0
      : (summary.missingStructuralPoints / summary.totalStructuralPoints) * 100;
  }

  return {
    damagedBuildingCount,
    missingBuildingStructuralPoints,
    totalBuildingStructuralPoints,
    totalDamagePercent: totalBuildingStructuralPoints <= 0
      ? 0
      : (missingBuildingStructuralPoints / totalBuildingStructuralPoints) * 100,
    emergencyRepairTriggered,
    highestTriggeredCategory,
    maxTriggeredBuildingDamagePercent,
    damageByCategory,
    damageByBuildingType
  };
}

export function hasEmergencyInfrastructureDamage(
  infrastructure: Pick<BotInfrastructureDamageSummary, 'totalDamagePercent' | 'emergencyRepairTriggered'>,
  totalDamageThresholdPercent: number
): boolean {
  return infrastructure.totalDamagePercent >= totalDamageThresholdPercent || infrastructure.emergencyRepairTriggered;
}

export function resolveEffectiveInfrastructureDamagePercent(
  infrastructure: Pick<BotInfrastructureDamageSummary, 'totalDamagePercent' | 'maxTriggeredBuildingDamagePercent'>
): number {
  return Math.max(infrastructure.totalDamagePercent, infrastructure.maxTriggeredBuildingDamagePercent);
}

export function resolvePrioritizedInfrastructureDamagePoints(
  infrastructure: Pick<BotInfrastructureDamageSummary, 'missingBuildingStructuralPoints' | 'damageByBuildingType'>
): number {
  let prioritizedPoints = infrastructure.missingBuildingStructuralPoints;

  for (const entry of Object.values(infrastructure.damageByBuildingType)) {
    if (!entry?.emergencyTriggered || entry.missingStructuralPoints <= 0) {
      continue;
    }
    prioritizedPoints += entry.missingStructuralPoints;
  }

  return prioritizedPoints;
}

function createCategorySummary(category: BotInfrastructureDamageCategory): BotInfrastructureDamageCategorySummary {
  return {
    damagedBuildingCount: 0,
    missingStructuralPoints: 0,
    totalStructuralPoints: 0,
    damagePercent: 0,
    thresholdPercent: resolveInfrastructureDamageThresholdPercent(category),
    emergencyTriggered: false,
    maxBuildingDamagePercent: 0,
    triggeredBuildingTypes: []
  };
}

function resolveHigherPriorityCategory(
  current: BotInfrastructureDamageCategory | null,
  candidate: BotInfrastructureDamageCategory
): BotInfrastructureDamageCategory {
  if (current === null) {
    return candidate;
  }

  const priority = {
    CRUCIAL: 3,
    IMPORTANT: 2,
    BASIC: 1
  } as const;

  return priority[candidate] > priority[current] ? candidate : current;
}
