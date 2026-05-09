import type {
  BotMemoryV2,
  BotProfileId,
  BotV2SubsystemId
} from '../../../src/app/models/player.ts';
import type { BuildingType } from '../../../src/app/models/enums/building-type.ts';
import type { DefenceType } from '../../../src/app/models/enums/defence-type.ts';
import type { ShipType } from '../../../src/app/models/enums/ship-type.ts';
import type { TechnologyType } from '../../../src/app/models/enums/technology-type.ts';
import type { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { PlayerType } from '../../../src/app/models/enums/player-type.ts';

export type BotProposalKind =
  | 'BUILDING'
  | 'RESEARCH'
  | 'SHIPYARD'
  | 'FLEET_MISSION'
  | 'MAINTENANCE_REQUEST'
  | 'NO_OP';

export type BotProposalStatus =
  | 'PROPOSED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'BLOCKED';

export type BotV2FeatureFlags = {
  enabled: boolean;
  shadowMode: boolean;
  enabledSubsystems: {
    economic: boolean;
    defensive: boolean;
    warfare: boolean;
    critical: boolean;
    strategicDevelopment: boolean;
    strategicMilitary: boolean;
    strategicDiplomatic: boolean;
  };
  allowSupervisorAcceptance: boolean;
  allowExecution: boolean;
};

export type BotPlanetMaturityStage =
  | 'BOOTSTRAP'
  | 'STABILIZING'
  | 'DEVELOPED'
  | 'MILITARY_CAPABLE'
  | 'STRATEGIC_HUB';

export type BotWorldSnapshot = {
  turn: number;
  playerId: number;
  playerName: string;
  profileId: BotProfileId | null;
  planets: BotPlanetSnapshot[];
  empire: BotEmpireSnapshot;
  flags: BotWorldFlags;
};

export type BotEmpireSnapshot = {
  ownedPlanetCount: number;
  computerTechnologyLevel: number;
  imperiumFleetCap: number;
  activeFleetCount: number;
  maxActiveFleetCount: number;
  activeColonizeFleetCount: number;
  totalResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  atWar: boolean;
  hasCriticalEnergyProblem: boolean;
  hasCriticalStorageProblem: boolean;
  intelCandidates: BotIntelCandidateSnapshot[];
  strategicMilitaryTargets: BotStrategicMilitaryTargetSnapshot[];
  strategicDiplomaticFactions: BotStrategicDiplomaticFactionSnapshot[];
};

export type BotStrategicDiplomaticFactionSnapshot = {
  playerId: number;
  playerName: string;
  playerType: PlayerType;
  currentStatus: DiplomaticStatus;
  totalPlanetCount: number;
  knownPlanetCount: number;
  averageKnownBuildingLevel: number;
  averageKnownTechLevel: number;
  averageKnownShipsAmount: number;
  averageKnownDefencesAmount: number;
  bestIntelDepth: number;
  lastRelevantReportAge: number | null;
  recentBattleReportCount: number;
  recentOutgoingCoercionPressureShort: number;
  recentOutgoingCoercionPressureLong: number;
  recentIncomingCoercionPressureShort: number;
  recentIncomingCoercionPressureLong: number;
  recentOutgoingDamagePercentShort: number;
  recentOutgoingDamagePercentLong: number;
  recentIncomingDamagePercentShort: number;
  recentIncomingDamagePercentLong: number;
  lastSuccessfulOutgoingBombardTurn: number | null;
  lastSuccessfulOutgoingSiegeTurn: number | null;
  pendingIncomingRequestedStatuses: DiplomaticStatus[];
  pendingOutgoingRequestedStatuses: DiplomaticStatus[];
  pendingIncomingSupportRequests: BotStrategicDiplomaticSupportRequestSnapshot[];
  knownPlanets: BotStrategicDiplomaticKnownPlanetSnapshot[];
};

export type BotStrategicDiplomaticKnownPlanetSnapshot = {
  coordinates: { x: number; y: number; z: number };
  intelDepth: number;
  lastRelevantReportAge: number;
  anomaliesAndNoise: number;
  averageBuildingLevel: number;
  averageTechLevel: number;
  totalShipsAmount: number;
  totalDefencesAmount: number;
  knownShipCountsByType: Partial<Record<ShipType, number>>;
  knownDefenceCountsByType: Partial<Record<DefenceType, number>>;
  currentResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  storageCapacity: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  income: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  bunkerLevel: number | null;
  recentBattleReportCount: number;
  lastCombatObservationTurn: number | null;
  lastPlunderTurn: number | null;
  latestPlunderedResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
};

export type BotStrategicDiplomaticSupportRequestSnapshot = {
  supportType: 'PLANET_REPAIR' | 'PLANET_DEFENSE';
  targetCoordinates: { x: number; y: number; z: number };
  createdTurn: number;
  expiresOnTurn: number;
};

export type BotIntelCandidateSnapshot = {
  coordinates: { x: number; y: number; z: number };
  size: number;
  colonizationDifficulty: number | null;
  industryModifier: number;
  metalModifier: number;
  crystalModifier: number;
  deuteriumModifier: number;
  neverScanned: boolean;
  needsScan: boolean;
  lastRelevantReportAge: number | null;
  colonizationScore: number;
};

export type BotStrategicMilitaryTargetSnapshot = {
  coordinates: { x: number; y: number; z: number };
  neverScanned: boolean;
  hasEspionageReport: boolean;
  reportAge: number | null;
  reportTurn: number | null;
  needsScan: boolean;
  isNeutral: boolean;
  mineLevels: {
    metalMineLevel: number;
    crystalMineLevel: number;
    deuteriumSynthesizerLevel: number;
  } | null;
  currentShipsCount: number | null;
  currentDefencesCount: number | null;
  knownShipCountsByType: Partial<Record<ShipType, number>>;
  knownDefenceCountsByType: Partial<Record<DefenceType, number>>;
  currentResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  storageCapacity: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  income: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  bunkerReductionPercent: number | null;
  size: number | null;
  industryModifier: number | null;
  metalModifier: number | null;
  crystalModifier: number | null;
  deuteriumModifier: number | null;
  lastAttackTurn: number | null;
  lastPlunderTurn: number | null;
  latestPlunderedResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  } | null;
  combatObservationTurn: number | null;
};

export type BotPlanetSnapshot = {
  planetId: number | null;
  name: string;
  coordinates: { x: number; y: number; z: number };
  maturityStage: BotPlanetMaturityStage;
  tech: {
    energyTechnologyLevel: number;
    materialTechnologyLevel: number;
    adaptiveTechnologyLevel: number;
    computerTechnologyLevel: number;
    intergalacticResearchNetworkLevel: number;
    shieldingTechnologyLevel: number;
    armourTechnologyLevel: number;
    railgunsWeaponsLevel: number;
    beamsWeaponsLevel: number;
    missilesWeaponsLevel: number;
    fusionDriveLevel: number;
    hyperspaceDriveLevel: number;
    hyperspaceTechnologyLevel: number;
    espionageTechnologyLevel: number;
    astrophysicsTechnologyLevel: number;
  };
  economy: {
    metalMineLevel: number;
    crystalMineLevel: number;
    deuteriumSynthesizerLevel: number;
    solarLevel: number;
    nuclearLevel: number;
    fusionLevel: number;
    roboticsLevel: number;
    naniteLevel: number;
    shipyardLevel: number;
    researchLabLevel: number;
    sensorPhalanxLevel: number;
    jumpGateLevel: number;
    allianceDepotLevel: number;
    bombDepotLevel: number;
    interstellarTradePortLevel: number;
    metalStorageLevel: number;
    crystalStorageLevel: number;
    deuteriumTankLevel: number;
    averageMineLevel: number;
    availableEnergy: number;
    usedEnergy: number;
    energyGap: number;
    storagePressure: {
      metal: number;
      crystal: number;
      deuterium: number;
    };
    storageCapacity: {
      metal: number;
      crystal: number;
      deuterium: number;
    };
    income: {
      metal: number;
      crystal: number;
      deuterium: number;
    };
  };
  modifiers: {
    metal: number;
    crystal: number;
    deuterium: number;
    solarEnergy: number;
    nuclearEnergy: number;
    science: number;
    industry: number;
    anomaliesAndNoise: number;
    hyperspaceParameters: number;
  };
  power: {
    industryPower: number;
    researchPower: number;
    buildingQueueRemainingEtc: number;
    researchQueueRemainingEtc: number;
    maxBuildingQueueLength: number;
    shipyardPower: number;
    shipyardQueueRemainingEtc: number;
    maxShipyardQueueLength: number;
  };
  queues: {
    buildingQueueLength: number;
    shipyardQueueLength: number;
    hasActiveResearch: boolean;
    queuedBuildingTypes: BuildingType[];
    queuedDefenceTypes: DefenceType[];
    queuedShipTypes: ShipType[];
    currentResearchType: TechnologyType | null;
  };
  defense: {
    bunkerLevel: number;
    avgIndustryLevel: number;
    planetSize: number;
    recentHostileAttackCountLast100Turns: number;
    recentHostileAttackStep: number;
    totalBunkerValue: number;
    totalInstalledDefenseValue: number;
    installedCountByType: Partial<Record<DefenceType, number>>;
    installedValueByType: Partial<Record<DefenceType, number>>;
  };
  ships: {
    undamagedCountByType: Partial<Record<ShipType, number>>;
    damagedCountByType: Partial<Record<ShipType, number>>;
    installedCountByType: Partial<Record<ShipType, number>>;
    installedValueByType: Partial<Record<ShipType, number>>;
    totalInstalledShipValue: number;
  };
  infrastructure: {
    damagedBuildingCount: number;
    missingBuildingStructuralPoints: number;
  };
  localResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  blockers: {
    energyStarved: boolean;
    storageBlocked: boolean;
    queueSaturated: boolean;
    missingRoboticsForGrowth: boolean;
  };
};

export type BotWorldFlags = {
  shadowMode: boolean;
  currentBotStillExecutes: boolean;
};

export type BotProposal = {
  proposalId: string;
  subsystemId: BotV2SubsystemId;
  kind: BotProposalKind;
  status: BotProposalStatus;
  goalKey: string;
  dedupeKey: string;
  summary: string;
  planetId: number | null;
  targetCoordinates: { x: number; y: number; z: number } | null;
  expectedValue: number;
  urgency: number;
  risk: number;
  confidence: number;
  requestedResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  requestPayload: Record<string, unknown>;
  blockers: string[];
  expiresOnTurn: number | null;
  debug: Record<string, string | number | boolean | null>;
};

export type BotEconomicBranch =
  | 'ENERGY'
  | 'STORAGE'
  | 'ECONOMY';

export type BotDefensiveBranch =
  | 'STRUCTURAL_ONLY'
  | 'STRUCTURE_AND_PRODUCTION'
  | 'PRODUCTION_ONLY';

export type BotWarfareBranch =
  | 'CAPACITY'
  | 'UNLOCK'
  | 'PRODUCTION';

export type BotStrategicDevelopmentBranch =
  | 'LOCAL_DEVELOPMENT';

export type BotGoalFamily =
  | 'ECONOMIC'
  | 'UNLOCK'
  | 'BUILDING'
  | 'PRODUCTION'
  | 'CAPACITY';

export type BotGoalTargetKind =
  | 'BUILDING'
  | 'RESEARCH'
  | 'DEFENCE'
  | 'SHIP';

type BotGoalBase = {
  goalKey: string;
  subsystemId: BotV2SubsystemId;
  goalFamily: BotGoalFamily;
  branch: string;
  planetId: number | null;
  targetCoordinates: { x: number; y: number; z: number };
  finalTargetKind: BotGoalTargetKind;
  finalBuildingType: BuildingType | null;
  finalTechnologyType: TechnologyType | null;
  finalDefenceType: DefenceType | null;
  finalShipType: ShipType | null;
  finalLevel: number | null;
  finalAmount: number | null;
  weightedEtc: number;
  totalEtc: number;
  buildingSideEtc: number;
  researchSideEtc: number;
  bonusFactor: number;
  blockers: string[];
  debug: Record<string, string | number | boolean | null>;
};

export type BotEconomicGoal = BotGoalBase & {
  subsystemId: 'ECONOMIC';
  goalFamily: 'ECONOMIC';
  branch: BotEconomicBranch;
  finalTargetKind: 'BUILDING';
  finalBuildingType: BuildingType;
  finalTechnologyType: null;
  finalDefenceType: null;
  finalShipType: null;
  finalLevel: number;
  finalAmount: null;
};

export type BotDefensiveGoal = BotGoalBase & {
  subsystemId: 'DEFENSIVE';
  goalFamily: 'UNLOCK' | 'BUILDING' | 'PRODUCTION';
  branch: BotDefensiveBranch;
};

export type BotWarfareGoal = BotGoalBase & {
  subsystemId: 'WARFARE';
  goalFamily: 'CAPACITY' | 'UNLOCK' | 'PRODUCTION';
  branch: BotWarfareBranch;
};

export type BotStrategicDevelopmentGoal = BotGoalBase & {
  subsystemId: 'STRATEGIC_DEVELOPMENT';
  goalFamily: 'BUILDING' | 'PRODUCTION';
  branch: BotStrategicDevelopmentBranch;
};

type BotPlanetResultBase = {
  planetId: number | null;
  subsystemId: BotV2SubsystemId;
  targetCoordinates: { x: number; y: number; z: number };
  branch: string;
  emittedRequestCount: number;
  primaryGoalKey: string | null;
  secondaryGoalKey: string | null;
  noActionReason: string | null;
  blockedGoalCount: number;
};

export type BotEconomicPlanetResult = BotPlanetResultBase & {
  subsystemId: 'ECONOMIC';
  branch: BotEconomicBranch;
};

export type BotDefensivePlanetResult = BotPlanetResultBase & {
  subsystemId: 'DEFENSIVE';
  branch: BotDefensiveBranch;
};

export type BotWarfarePlanetResult = BotPlanetResultBase & {
  subsystemId: 'WARFARE';
  branch: BotWarfareBranch;
};

export type BotStrategicDevelopmentPlanetResult = BotPlanetResultBase & {
  subsystemId: 'STRATEGIC_DEVELOPMENT';
  branch: BotStrategicDevelopmentBranch;
  emittedBuildingRequestCount: number;
  emittedProductionRequestCount: number;
  buildingGoalKeys: string[];
  productionGoalKeys: string[];
};

export type BotAcceptedTask = BotProposal & {
  status: 'ACCEPTED';
};

export type BotSubsystemContext = {
  snapshot: BotWorldSnapshot;
  memory: BotMemoryV2;
};

export type BotSubsystemResult = {
  subsystemId: BotV2SubsystemId;
  proposals: BotProposal[];
  goals?: Array<BotEconomicGoal | BotDefensiveGoal | BotWarfareGoal | BotStrategicDevelopmentGoal>;
  planetResults?: Array<BotEconomicPlanetResult | BotDefensivePlanetResult | BotWarfarePlanetResult | BotStrategicDevelopmentPlanetResult>;
  debug: Record<string, string | number | boolean | null>;
};

export interface BotSubsystem {
  readonly subsystemId: BotV2SubsystemId;
  generate(context: BotSubsystemContext): BotSubsystemResult;
}

export type BotSupervisorDecision = {
  accepted: BotProposal[];
  rejected: Array<{
    proposalId: string;
    reason: string;
  }>;
};

export interface BotSupervisor {
  decide(
    snapshot: BotWorldSnapshot,
    memory: BotMemoryV2,
    proposals: BotProposal[]
  ): BotSupervisorDecision;
}

export type BotExecutionOutcome = {
  proposalId: string;
  executed: boolean;
  success: boolean;
  message: string | null;
};

export interface BotExecutor {
  executeAcceptedTasks(accepted: BotProposal[]): BotExecutionOutcome[];
}

export type BotDecisionTraceV2 = {
  playerId: number;
  playerName: string;
  turn: number;
  shadowMode: boolean;
  snapshotSummary: {
    planetCount: number;
    totalResources: {
      metal: number;
      crystal: number;
      deuterium: number;
    };
    atWar: boolean;
  };
  subsystemResults: Array<{
    subsystemId: BotV2SubsystemId;
    proposalCount: number;
    goalCount?: number;
    planetResultCount?: number;
    debug: Record<string, string | number | boolean | null>;
  }>;
  proposals: Array<{
    proposalId: string;
    subsystemId: BotV2SubsystemId;
    summary: string;
    expectedValue: number;
    urgency: number;
    risk: number;
    confidence: number;
    dedupeKey: string;
  }>;
  goals?: Array<{
    goalKey: string;
    subsystemId: BotV2SubsystemId;
    goalFamily: BotGoalFamily;
    branch: string;
    finalTargetKind: BotGoalTargetKind;
    finalBuildingType: BuildingType | null;
    finalTechnologyType: TechnologyType | null;
    finalDefenceType: DefenceType | null;
    finalShipType: ShipType | null;
    finalLevel: number | null;
    finalAmount: number | null;
    weightedEtc: number;
    totalEtc: number;
    bonusFactor: number;
    blockers: string[];
  }>;
  planetResults?: Array<{
    subsystemId: BotV2SubsystemId;
    branch: string;
    targetCoordinates: { x: number; y: number; z: number };
    emittedRequestCount: number;
    primaryGoalKey: string | null;
    secondaryGoalKey: string | null;
    noActionReason: string | null;
    blockedGoalCount: number;
  }>;
  supervisorDecision: {
    acceptedProposalIds: string[];
    rejectedCount: number;
    mode: 'SHADOW';
  };
  executionOutcomes: BotExecutionOutcome[];
};
