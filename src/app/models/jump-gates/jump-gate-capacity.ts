import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { BuildingType } from '../enums/building-type';

const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();

export function jumpGateBaseCapacityForLevel(level: number): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(BuildingType.JUMP_GATE);
  if (!blueprint) {
    return 0;
  }

  const baseCapacity = blueprint.production1[normalizedLevel - 1];
  return Number.isFinite(baseCapacity) ? Math.max(0, Math.floor(baseCapacity)) : 0;
}

export function jumpGateTechnologyMultiplier(hyperspaceTechnologyLevel: number): number {
  const normalizedLevel = Number.isFinite(hyperspaceTechnologyLevel)
    ? Math.max(0, Math.floor(hyperspaceTechnologyLevel))
    : 0;
  return 1 + (normalizedLevel * 0.05);
}

export function calculateJumpGateCapacity(
  jumpGateLevel: number,
  hyperspaceParameters: number,
  hyperspaceTechnologyLevel: number,
  buildingEffectiveness = 1
): number {
  const baseCapacity = jumpGateBaseCapacityForLevel(jumpGateLevel);
  if (baseCapacity <= 0) {
    return 0;
  }

  const normalizedHyperspaceParameters = Number.isFinite(hyperspaceParameters)
    ? Math.max(0, hyperspaceParameters)
    : 0;
  const normalizedBuildingEffectiveness = Number.isFinite(buildingEffectiveness)
    ? Math.max(0, buildingEffectiveness)
    : 0;

  return Math.max(
    0,
    Math.floor(
      baseCapacity
      * normalizedBuildingEffectiveness
      * normalizedHyperspaceParameters
      * jumpGateTechnologyMultiplier(hyperspaceTechnologyLevel)
    )
  );
}
