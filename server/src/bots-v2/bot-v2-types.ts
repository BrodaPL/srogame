import type {
  BotMemoryV2,
  BotProfileId,
  BotV2SubsystemId
} from '../../../src/app/models/player.ts';

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
  };
  queues: {
    buildingQueueLength: number;
    shipyardQueueLength: number;
    hasActiveResearch: boolean;
    queuedBuildingTypes: string[];
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
  supervisorDecision: {
    acceptedProposalIds: string[];
    rejectedCount: number;
    mode: 'SHADOW';
  };
  executionOutcomes: BotExecutionOutcome[];
};
