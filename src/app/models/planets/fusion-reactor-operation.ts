import { energyDeficitEfficiencyMultiplier } from './energy-deficit';

export type FusionReactorOperation = {
  selectedStage: number;
  effectiveStage: number;
  powerOutput: number;
  deuteriumUpkeep: number;
  grossDeuteriumIncome: number;
  netDeuteriumIncome: number;
  isClamped: boolean;
};

export type ResolveFusionReactorOperationInput = {
  selectedStage: number;
  maxStage: number;
  structuralUtilization: number;
  energyTechnologyLevel: number;
  adaptiveTechnologyLevel: number;
  solarProduction: number;
  nuclearProduction: number;
  otherEnergyUsed: number;
  energyModifierRES: number;
  energyModifierNuclear: number;
  deuteriumSynthesizerProduction: number;
  deuteriumModifier: number;
  fusionPowerAtStage: (stage: number) => number;
  fusionDeuteriumAtStage: (stage: number) => number;
};

export function resolveFusionReactorOperation(
  input: ResolveFusionReactorOperationInput
): FusionReactorOperation {
  const maxStage = Math.max(0, Math.floor(input.maxStage));
  const selectedStage = Math.min(maxStage, Math.max(0, Math.floor(input.selectedStage)));
  const normalizedStructuralUtilization = Number.isFinite(input.structuralUtilization)
    ? Math.min(1, Math.max(0, input.structuralUtilization))
    : 0;
  const energyMultiplier = 1 + ((normalizeFiniteNumber(input.energyTechnologyLevel) * 2) / 100);
  const adaptiveMultiplier = 1 + (normalizeFiniteNumber(input.adaptiveTechnologyLevel) / 100);
  const solarProduction = Math.max(0, normalizeFiniteNumber(input.solarProduction));
  const nuclearProduction = Math.max(0, normalizeFiniteNumber(input.nuclearProduction));
  const otherEnergyUsed = Math.max(0, normalizeFiniteNumber(input.otherEnergyUsed));
  const energyModifierRES = Math.max(0, normalizeFiniteNumber(input.energyModifierRES));
  const energyModifierNuclear = Math.max(0, normalizeFiniteNumber(input.energyModifierNuclear));
  const deuteriumSynthesizerProduction = Math.max(0, normalizeFiniteNumber(input.deuteriumSynthesizerProduction));
  const deuteriumModifier = Math.max(0, normalizeFiniteNumber(input.deuteriumModifier));

  for (let candidateStage = selectedStage; candidateStage >= 0; candidateStage -= 1) {
    const powerOutput = candidateStage <= 0
      ? 0
      : Math.max(0, Math.floor(input.fusionPowerAtStage(candidateStage) * normalizedStructuralUtilization));
    const deuteriumUpkeep = candidateStage <= 0
      ? 0
      : Math.max(0, Math.floor(input.fusionDeuteriumAtStage(candidateStage) * normalizedStructuralUtilization));
    const availableEnergy = (
      (solarProduction * energyModifierRES)
      + (nuclearProduction * energyModifierNuclear)
      + powerOutput
    ) * energyMultiplier;
    const energyEfficiency = energyDeficitEfficiencyMultiplier(availableEnergy, otherEnergyUsed);
    const grossDeuteriumIncome = Math.max(0, Math.floor(
      deuteriumSynthesizerProduction
      * adaptiveMultiplier
      * deuteriumModifier
      * energyEfficiency
    ));
    if (grossDeuteriumIncome >= deuteriumUpkeep) {
      return {
        selectedStage,
        effectiveStage: candidateStage,
        powerOutput,
        deuteriumUpkeep,
        grossDeuteriumIncome,
        netDeuteriumIncome: Math.max(0, grossDeuteriumIncome - deuteriumUpkeep),
        isClamped: candidateStage < selectedStage
      };
    }
  }

  return {
    selectedStage,
    effectiveStage: 0,
    powerOutput: 0,
    deuteriumUpkeep: 0,
    grossDeuteriumIncome: 0,
    netDeuteriumIncome: 0,
    isClamped: selectedStage > 0
  };
}

function normalizeFiniteNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
