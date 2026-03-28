import { BuildingBlueprintsFactory } from '../../factories/building-blueprints.factory';
import { BuildingType } from '../enums/building-type';

const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();

export function tradePortBaseCapacityForLevel(level: number): number {
  const normalizedLevel = Math.max(0, Math.floor(level));
  if (normalizedLevel <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(BuildingType.INTERSTELLAR_TRADE_PORT);
  if (!blueprint) {
    return 0;
  }

  const baseCapacity = blueprint.production1[normalizedLevel - 1];
  return Number.isFinite(baseCapacity) ? Math.max(0, Math.floor(baseCapacity)) : 0;
}

export function tradePortTechnologyMultiplier(
  hyperspaceTechnologyLevel: number,
  gravitonTechnologyLevel: number,
  jumpGateLevel: number
): number {
  const normalizedHyperspaceTechnologyLevel = Number.isFinite(hyperspaceTechnologyLevel)
    ? Math.max(0, Math.floor(hyperspaceTechnologyLevel))
    : 0;
  const normalizedGravitonTechnologyLevel = Number.isFinite(gravitonTechnologyLevel)
    ? Math.max(0, Math.floor(gravitonTechnologyLevel))
    : 0;
  const normalizedJumpGateLevel = Number.isFinite(jumpGateLevel)
    ? Math.max(0, Math.floor(jumpGateLevel))
    : 0;

  return (1 + (normalizedHyperspaceTechnologyLevel * 0.05))
    * (1 + (normalizedGravitonTechnologyLevel * 0.25))
    * (1 + (normalizedJumpGateLevel * 0.2));
}

export function calculateTradePortCapacity(
  tradePortLevel: number,
  hyperspaceParameters: number,
  hyperspaceTechnologyLevel: number,
  gravitonTechnologyLevel: number,
  jumpGateLevel: number,
  buildingEffectiveness = 1
): number {
  const baseCapacity = tradePortBaseCapacityForLevel(tradePortLevel);
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
      * tradePortTechnologyMultiplier(
        hyperspaceTechnologyLevel,
        gravitonTechnologyLevel,
        jumpGateLevel
      )
    )
  );
}
