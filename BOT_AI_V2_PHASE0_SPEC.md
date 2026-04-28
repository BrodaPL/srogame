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

This is the shared transport envelope between subsystems and the supervisor.
Subsystem-specific planning docs may use more domain-specific naming on top of it.
For `Economic`, the naming is:
- `goal` = the ranked economic target the subsystem wants to pursue on one planet
- `request` = the immediate next actionable step toward that goal
- the outward `Primary request` / `Secondary request` are still carried in the shared `BotProposal` envelope

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
- the common transport type remains `BotProposal` even when a subsystem uses local naming such as `goal` and `request`

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

Allowed request domains:
- mine upgrades
- energy building upgrades
- storage upgrades
- robotics factory upgrades
- nanite factory upgrades
- prerequisite research upgrades that are strictly required to progress an in-scope economic building goal

Not yet allowed in Phase 0:
- unrelated research planning
- shipyard production
- fleet missions
- diplomacy
- transport planning

Economic naming lock for Phase 0:
- the subsystem evaluates all candidate economic goals independently for each planet
- candidate goals are sorted from best to worst
- the best candidate becomes that planet's `Primary goal`
- the second-best candidate becomes that planet's `Secondary goal`
- the subsystem emits exactly two outward requests per viable planet:
  - `Primary request`: the immediate next actionable step toward the `Primary goal`
  - `Secondary request`: the immediate next actionable step toward the `Secondary goal`
- each outward request must include final-goal metadata, so the supervisor can see both:
  - the immediate action being requested now
  - the longer-term goal that request is advancing
- if the `Primary goal` and `Secondary goal` share the same immediate next step:
  - emit one outward request
  - keep both goal links in that request metadata

Economic subsystem output expectations:
- up to two outward requests per viable planet when at least two valid candidates exist
- if only one valid candidate exists for a planet, emit one request and record why no valid secondary candidate exists
- if no valid candidate exists for a planet, emit no request for that planet and record explicit blockers
- emit a first-class per-planet result even when no request is emitted, including:
  - active branch
  - emitted request count
  - selected goal keys when present
  - explicit no-action reason
- requests are per-planet, not empire-global
- all requests must be derived from a full local economic evaluation of in-scope goals and their requirements
- request selection must not be based on old V1 bot logic
- goal ranking should use a composite utility model with `Estimated Time Completion` as the main factor
- the subsystem should avoid trying to normalize all economic effects into one shared cross-resource expected-benefit number
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
- unlock an energy building prerequisite through required research

Economic algorithm expectations for Phase 0:
- for each planet, evaluate all in-scope economic goals from scratch
- each goal evaluation should account for:
  - direct building requirements
  - required prerequisite research
  - full immediate-next-step feasibility
  - total dependency-chain cost of progression toward the chosen goal
  - total `Estimated Time Completion` for the full dependency chain
- after a chosen request is fulfilled, the subsystem should recompute the goal ranking from the updated state instead of following a fixed script
- research prerequisites may contribute to a goal chain and may be executed in parallel where the game rules allow it

Locked branch-first algorithm for Phase 0:
- `Economic` should branch on the local planet state before ranking candidate goals
- if multiple branch conditions are true at the same time, branch precedence is:
  - energy first
  - storage second
  - economy / industry third
- Branch 1: if energy is inside the target threshold and storage is sufficient:
  - consider only:
    - mines
    - `ROBOTICS_FACTORY`
    - `NANITE_FACTORY`
  - rank those candidates by `ETC` plus positive priority modifiers
- Branch 2: if energy is below the local target threshold:
  - consider only energy-building goals
  - rank those candidates by `ETC` plus positive priority modifiers
- Branch 3: if storage capacity is insufficient for some resource type:
  - consider only storage for that resource type
  - if more than one storage goal is valid, rank those candidates by `ETC` plus positive priority modifiers
- after ranking candidates inside the active branch:
  - best candidate becomes `Primary goal`
  - second-best candidate becomes `Secondary goal`
  - the subsystem emits the immediate next step for each selected goal as `Primary request` and `Secondary request`

Economic scoring lock for Phase 0:
- scoring is a `composite utility` model
- lower final goal score is better
- the main ranking value is full-goal `Estimated Time Completion` (`ETC`)
- the visible request cost sent to the supervisor is only the immediate request cost
- the internal goal evaluation must still reason about the total dependency-chain cost and total dependency-chain ETC
- hard-lock handling belongs to `Critical`, not to `Economic`
- energy and storage prioritization should happen primarily through branch selection, not through cross-domain absolute overrides
- inside `Economic`, `ETC` is `Narrow ETC`:
  - throughput-only completion time
  - no resource-wait simulation
  - no future mine-income simulation
- when prerequisite research can run in parallel with other required progression, full-goal ETC should be:
  - goal-building ETC
  - plus mutual ETC of required prerequisite buildings
  - plus prerequisite-research ETC only if that research ETC exceeds the building-side path above
- throughput-affecting intermediate steps should immediately update the ETC of later steps in the same chain

Recommended conceptual model:
- Step 1: build all valid local economic goals for the planet
- Step 2: expand each goal into its dependency chain
- Step 3: determine which branch is active for the current planet state
- Step 4: estimate the chain's total ETC for candidates in that branch using:
  - building-side ETC = goal-building ETC + mutual ETC of prerequisite buildings
  - research-side ETC = ETC of prerequisite research that can run in parallel
  - full-goal ETC = building-side ETC, unless research-side ETC is longer
- Step 5: apply only positive priority bonuses to ETC to get the final ranked goal score
- Step 6: sort all goals in the active branch by final ranked goal score and select:
  - `Primary goal`
  - `Secondary goal`
- Step 7: emit the immediate next step for each selected goal as:
  - `Primary request`
  - `Secondary request`

ETC-first ranking guidance:
- the first comparison axis between goals is their full dependency-chain ETC
- positive priority bonuses then reduce the effective ETC
- goals that improve build throughput should naturally become more competitive because they reduce time-to-completion for future progress
- throughput-improving goals should also receive an explicit built-in priority improvement
- inside `Economic`, this ETC-first ranking is preferred over trying to compare unlike outcomes such as `+energy` versus `+metal income` through one shared expected-benefit formula

Recommended weighted-ETC shape:
- `weightedEtc = totalEtc / bonusFactor`
- lower `weightedEtc` is better
- positive effects should increase `bonusFactor`
- do not use negative penalties that reduce `bonusFactor` below the neutral baseline inside `Economic`
- positive priority bonuses should stack multiplicatively
- `bonusFactor` should have a hard upper ceiling of `2.0`

Locked Economic priority modifiers for Phase 0:
- goals whose completed effect improves throughput by reducing future ETC should receive a built-in `10%` priority improvement
- planetary positive efficiency modifiers should improve the priority of matching goals
- example:
  - if a planet has `160%` crystal mining efficiency, a crystal-mine goal should receive a positive priority improvement relative to neutral goals
  - if that improvement is `15%`, then `bonusFactor = 1.15`
- for mine goals, prefer positive planetary-parameter-based weighting rather than a separate mine-balance rule
- the intended mine-parameter mapping is:
  - compute only the positive production bonus above the neutral baseline
  - reduce that positive bonus by `4`
  - use the result as the mine's priority improvement
  - example:
    - `160%` normal production means a `+60%` positive bonus
    - `+60% / 4 = 15%` priority improvement
    - therefore `bonusFactor = 1.15`
- priority improvements should only be added for positive effects

Locked energy-priority behavior for Phase 0:
- define the local energy target as `current used energy + 5`
- energy buildings should be considered only when energy is below the local target threshold
- when energy-building goals are being ranked, lower projected energy relative to target should improve their priority by `10%` per energy below target
- energy goals should also receive positive planetary-parameter-based priority improvements when the planet favors that energy source

Locked storage-priority behavior for Phase 0:
- storage should be evaluated separately for `metal`, `crystal`, and `deuterium`
- the local storage target for each resource should be at least `1.5x` the highest relevant immediate next-cost requirement for that resource among:
  - the highest-level in-scope mine goal
  - the highest-level in-scope energy goal
  - the highest-level in-scope industry goal
- storage goals should be considered only for resource types that are below those resource-specific storage targets
- if multiple resource types are below target at the same time, pick the most deficient resource type first and activate only that storage branch

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
- inspect whether the emitted primary/secondary requests and their goal metadata are mathematically coherent

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
