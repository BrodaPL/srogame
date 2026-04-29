import type {
  BotMemoryV2,
  BotProfileId,
  BotV2SubsystemId
} from '../../../src/app/models/player.ts';
import type { BuildingType } from '../../../src/app/models/enums/building-type.ts';
import type { DefenceType } from '../../../src/app/models/enums/defence-type.ts';
import type { TechnologyType } from '../../../src/app/models/enums/technology-type.ts';

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
  totalResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  atWar: boolean;
  hasCriticalEnergyProblem: boolean;
  hasCriticalStorageProblem: boolean;
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

export type BotGoalFamily =
  | 'ECONOMIC'
  | 'UNLOCK'
  | 'BUILDING'
  | 'PRODUCTION';

export type BotGoalTargetKind =
  | 'BUILDING'
  | 'RESEARCH'
  | 'DEFENCE';

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
  finalLevel: number;
  finalAmount: null;
};

export type BotDefensiveGoal = BotGoalBase & {
  subsystemId: 'DEFENSIVE';
  goalFamily: 'UNLOCK' | 'BUILDING' | 'PRODUCTION';
  branch: BotDefensiveBranch;
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
  goals?: Array<BotEconomicGoal | BotDefensiveGoal>;
  planetResults?: Array<BotEconomicPlanetResult | BotDefensivePlanetResult>;
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
