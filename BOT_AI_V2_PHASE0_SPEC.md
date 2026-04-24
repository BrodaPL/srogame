# Bot AI V2 Phase 0 Spec

This document turns the high-level architecture in `NEW_BOT_AI_DESIGN.md` into an implementation-ready Phase 0 contract.

Phase 0 is intentionally narrow:
- create the V2 scaffolding
- keep the current bot runtime as the only live executor
- run V2 in shadow mode only
- support the first real subsystem milestone: `Economic`

This document is a working engineering spec, not a final behavior design for all subsystems.

## Locked rollout decisions

- V2 starts in `shadow mode`
- V2 gets a minimal shared world/state snapshot before any real subsystem logic
- subsystem rollout order:
  - `Economic`
  - `Defensive`
  - `Warfare`
  - `Critical`
  - richer `World/State analysis`
  - `Strategic Development`
  - `Strategic Military`
  - `Strategic Diplomatic`
  - full `Supervisory`
- V2 memory persistence scope:
  - persist minimal stable fields only

## Phase 0 goals

- define V2 module boundaries
- define the first shared type contracts
- define shadow-mode execution flow
- define the minimum snapshot needed by `Economic`
- define the minimum durable V2 memory shape
- define trace output for inspection and later parity work

## Phase 0 non-goals

- replacing the current bot executor
- full Supervisory arbitration
- full reservation system
- full long-term commitment engine
- complete subsystem set
- score tuning
- behavior parity with the current bot

## Proposed location

V2 should live beside the current runtime, not inside the existing monolithic runner.

Recommended root:

```text
server/src/bots-v2/
```

Recommended initial tree:

```text
server/src/bots-v2/
  bot-brain-v2.ts
  bot-v2-feature-flags.ts
  bot-v2-types.ts
  bot-v2-memory.ts
  bot-v2-trace.ts
  bot-v2-shadow-runner.ts
  snapshot/
    build-bot-world-snapshot.ts
    bot-world-snapshot-types.ts
  supervisor/
    bot-supervisor.ts
    bot-supervisor-types.ts
  execution/
    bot-executor.ts
    bot-execution-types.ts
  subsystems/
    bot-subsystem-types.ts
    economic/
      bot-economic-subsystem.ts
```

Notes:
- the current runtime in `server/src/bots/` remains active
- V2 must not mutate game state directly
- V2 can reuse shared models and command helpers from the existing server code

## Phase 0 runtime flow

Phase 0 shadow flow for each bot turn:

1. Current bot runtime executes normally.
2. V2 shadow runner is invoked after or alongside current bot planning.
3. V2 builds a `BotWorldSnapshot`.
4. V2 loads minimal stable `BotMemoryV2`.
5. V2 runs enabled V2 subsystems.
6. V2 collects proposals.
7. V2 runs a stub supervisor that does one of:
   - no acceptance at all, or
   - debug-only acceptance for local scoring experiments
8. V2 records traces.
9. V2 does not call live commands in Phase 0.

Recommended default for Phase 0:
- build snapshot
- run `Economic`
- collect proposals
- record traces
- execute nothing

## Feature flags

Phase 0 needs explicit V2 gating.

Recommended flags:

```ts
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
```

Phase 0 defaults:
- `enabled = true` only in local/dev when intentionally turned on
- `shadowMode = true`
- `enabledSubsystems.economic = true`
- all other subsystems `false`
- `allowSupervisorAcceptance = false`
- `allowExecution = false`

## Core V2 contracts

These are the minimum contracts to scaffold Phase 0.

### Identity types

```ts
export type BotSubsystemId =
  | 'ECONOMIC'
  | 'DEFENSIVE'
  | 'WARFARE'
  | 'CRITICAL'
  | 'STRATEGIC_DEVELOPMENT'
  | 'STRATEGIC_MILITARY'
  | 'STRATEGIC_DIPLOMATIC';

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
```

### World snapshot

`BotWorldSnapshot` is the shared read model for all V2 subsystems.

Phase 0 keeps it intentionally small and biased toward `Economic`.

```ts
export type BotWorldSnapshot = {
  turn: number;
  playerId: number;
  playerName: string;
  profileId: string | null;
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
    roboticsLevel: number;
    naniteLevel: number;
    shipyardLevel: number;
    metalStorageLevel: number;
    crystalStorageLevel: number;
    deuteriumTankLevel: number;
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

export type BotPlanetMaturityStage =
  | 'BOOTSTRAP'
  | 'STABILIZING'
  | 'DEVELOPED'
  | 'MILITARY_CAPABLE'
  | 'STRATEGIC_HUB';
```

### Proposal contract

Every V2 subsystem must emit the same proposal structure.

```ts
export type BotProposal = {
  proposalId: string;
  subsystemId: BotSubsystemId;
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
```

Rules:
- `expectedValue`, `urgency`, `risk`, and `confidence` are subsystem-local outputs in Phase 0
- cross-subsystem normalization can stay simple in Phase 0
- `dedupeKey` is mandatory from day one
- `requestPayload` is command-shaped but not executed yet

### Subsystem interface

```ts
export type BotSubsystemContext = {
  snapshot: BotWorldSnapshot;
  memory: BotMemoryV2;
};

export type BotSubsystemResult = {
  subsystemId: BotSubsystemId;
  proposals: BotProposal[];
  debug: Record<string, string | number | boolean | null>;
};

export interface BotSubsystem {
  readonly subsystemId: BotSubsystemId;
  generate(context: BotSubsystemContext): BotSubsystemResult;
}
```

### Supervisor interface

Phase 0 supervisor is intentionally minimal.

```ts
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
```

Phase 0 default behavior:
- reject everything with reason `shadow_mode_no_execution`

### Executor interface

```ts
export type BotExecutionOutcome = {
  proposalId: string;
  executed: boolean;
  success: boolean;
  message: string | null;
};

export interface BotExecutor {
  executeAcceptedTasks(accepted: BotProposal[]): BotExecutionOutcome[];
}
```

Phase 0 default behavior:
- return empty outcomes
- or emit `executed = false` for all accepted debug tasks

## Minimal V2 memory

Phase 0 persists only stable, durable fields.

Recommended shape:

```ts
export type BotMemoryV2 = {
  version: 1;
  currentStance: string | null;
  antiOscillation: {
    lastMajorFocus: string | null;
    lastMajorFocusTurn: number | null;
    doNotReplaceBeforeTurn: number | null;
  };
  cooldowns: {
    [key: string]: number;
  };
  recentTargets: Array<{
    key: string;
    turn: number;
  }>;
  acceptedLongTermCommitments: Array<{
    commitmentKey: string;
    subsystemId: BotSubsystemId;
    createdTurn: number;
    expiresOnTurn: number | null;
  }>;
};
```

Phase 0 persistence rules:
- persist this inside player bot memory or an adjacent stable bot-memory structure
- do not persist transient proposal lists
- do not persist transient scores
- do not persist snapshot data
- do not persist supervisor intermediate state

## Minimal snapshot builder rules

`buildBotWorldSnapshot(...)` should:
- derive data only from current authoritative game state
- avoid side effects
- avoid hidden caching in Phase 0 unless clearly needed
- expose enough information for `Economic` to reason about:
  - local resources
  - local building levels
  - local queue saturation
  - local energy deficit
  - local storage pressure
  - coarse maturity stage

Recommended initial maturity heuristic for Phase 0:
- compute from average mine level only
- keep it explicitly temporary
- mark in code comments that this will become composite later

## Economic subsystem scope in Phase 0

The first real subsystem should stay narrow.

Allowed proposal domains:
- mine upgrades
- energy building upgrades
- storage upgrades
- robotics factory upgrades
- nanite factory upgrades

Not yet allowed in Phase 0:
- research proposals
- shipyard production
- fleet missions
- diplomacy
- transport planning

Economic subsystem output expectations:
- at least one proposal per viable planet when reasonable
- explicit blockers when no valid economic action exists
- no direct scheduling logic
- no direct mutation

Examples of valid Phase 0 economic goals:
- recover from energy starvation
- reduce storage pressure
- improve metal production
- improve crystal production
- improve deuterium production
- improve industrial throughput

## Trace contract

V2 needs dedicated traces from the start so shadow mode is useful.

Recommended trace shape:

```ts
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
    subsystemId: BotSubsystemId;
    proposalCount: number;
    debug: Record<string, string | number | boolean | null>;
  }>;
  proposals: Array<{
    proposalId: string;
    subsystemId: BotSubsystemId;
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
```

Phase 0 trace goals:
- inspect snapshot quality
- inspect proposal volume
- inspect duplicate proposal patterns
- compare V2 economic proposals with current bot behavior later

## Integration with current runtime

Phase 0 integration rules:
- current `server/src/bots/bot-turn-runner.ts` remains the live system
- V2 must be called through a separate shadow runner
- V2 must not change the existing bot trace format
- V2 should store its traces separately from current V1 traces

Recommended entry point:
- current bot executes first
- then `runBotTurnPhaseV2Shadow(galaxy)` runs only for enabled local/dev scenarios

## Phase 0 completion criteria

Phase 0 is complete when all of the following are true:

- V2 folder structure exists
- feature flags exist
- `BotWorldSnapshot` builds successfully for a bot turn
- `BotMemoryV2` loads and normalizes safely
- `Economic` subsystem emits structured proposals
- V2 traces are recorded and inspectable
- no live commands are executed by V2

## Immediate next step after Phase 0

After Phase 0 is merged, the next implementation target should be:

1. scaffold code for `Defensive`
2. improve the snapshot only where `Defensive` actually needs more information
3. keep the supervisor mostly stubbed until at least:
   - `Economic`
   - `Defensive`
   - `Warfare`
   - `Critical`
   are all producing usable proposals

That keeps V2 incremental and prevents the Supervisory layer from becoming another monolith too early.
