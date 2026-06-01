import type { ResourcesPackDto } from '../../../src/app/models/game-api-types.ts';
import type { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.ts';

export type JumpGateOperatingCostQuote = {
  active: boolean;
  payer: 'NONE' | 'REQUESTER' | 'TARGET_OWNER' | 'SPLIT';
  resources: ResourcesPackDto;
  weightedResourceValue: number;
  reason: string;
};

export type JumpGateOperatingCostPolicyInput = {
  missionType: FleetMissionType;
  selectedShipCount: number;
  normalTravelTurns: number;
  jumpGateTravelTurns: number;
  fuelCost: number;
  costQuote?: JumpGateOperatingCostQuote;
};

export type JumpGateOperatingCostPolicyDecision = {
  allowed: boolean;
  savedTurns: number;
  maxAcceptedWeightedCost: number;
  costQuote: JumpGateOperatingCostQuote;
  reason: string;
};

const NO_OPERATING_COST_QUOTE: JumpGateOperatingCostQuote = {
  active: false,
  payer: 'NONE',
  resources: { metal: 0, crystal: 0, deuterium: 0 },
  weightedResourceValue: 0,
  reason: 'NO_JUMP_GATE_OPERATING_COST_MODEL'
};

export function estimateJumpGateOperatingCost(): JumpGateOperatingCostQuote {
  return { ...NO_OPERATING_COST_QUOTE, resources: { ...NO_OPERATING_COST_QUOTE.resources } };
}

export function evaluateJumpGateOperatingCostPolicy(
  input: JumpGateOperatingCostPolicyInput
): JumpGateOperatingCostPolicyDecision {
  const costQuote = input.costQuote ?? estimateJumpGateOperatingCost();
  const savedTurns = Math.max(0, Math.floor(input.normalTravelTurns) - Math.floor(input.jumpGateTravelTurns));

  if (!costQuote.active || costQuote.weightedResourceValue <= 0) {
    return {
      allowed: true,
      savedTurns,
      maxAcceptedWeightedCost: Number.POSITIVE_INFINITY,
      costQuote,
      reason: 'NO_OPERATING_COST'
    };
  }

  if (savedTurns <= 0) {
    return {
      allowed: false,
      savedTurns,
      maxAcceptedWeightedCost: 0,
      costQuote,
      reason: 'NO_TRAVEL_TIME_SAVED'
    };
  }

  const avoidedFuelValue = Math.max(0, input.fuelCost) * 2.6;
  const savedTurnValue = savedTurns * Math.max(25, Math.max(1, input.selectedShipCount) * 8);
  const maxAcceptedWeightedCost = (avoidedFuelValue * 0.6) + savedTurnValue;

  return {
    allowed: costQuote.weightedResourceValue <= maxAcceptedWeightedCost,
    savedTurns,
    maxAcceptedWeightedCost,
    costQuote,
    reason: costQuote.weightedResourceValue <= maxAcceptedWeightedCost
      ? 'OPERATING_COST_ACCEPTABLE'
      : 'OPERATING_COST_TOO_HIGH'
  };
}
