# Bot AI V2 Phase 0 Spec

This document turns the high-level architecture in `NEW_BOT_AI_DESIGN.md` into an implementation-ready Phase 0 contract.

Phase 0 originally described the shadow scaffold. The current implementation has moved beyond that into the first Supervisor runtime slice:
- V2 owns the end-turn bot runtime for bot-controlled seats
- V2 supports explicit `DISABLED` / `SHADOW` / `LIVE` modes
- `LIVE` mode can execute queue actions, allowlisted fleet missions, subsystem-proposed incoming request decisions, Strategic Diplomatic outgoing support-request creation, and subsystem-proposed diplomacy decisions through the Supervisor/Executor layer
- the old V1 live turn runner is no longer used by the end-turn flow

This document is a working engineering spec, not a final behavior design for all subsystems.

## Locked rollout decisions

- V2 supports `SHADOW` for trace-only comparison, but the normal runtime mode is now `LIVE`
- V2 gets a minimal shared world/state snapshot before any real subsystem logic
- subsystem rollout order:
  - `Economic`
  - `Defensive`
  - `Warfare`
  - `Research`
  - `Strategic Development`
  - `Strategic Military`
  - `Strategic Diplomatic`
  - `Weight Manager`
  - `Critical`
  - `Supervisor` phase 1 live queue arbitration
- V2 memory persistence scope:
  - persist stable subsystem state plus Supervisor pending/spending/proposal history

## Phase 0 goals

- define V2 module boundaries
- define the first shared type contracts
- define V2 runtime execution flow
- define the minimum snapshot needed by `Economic`
- define the minimum durable V2 memory shape
- define trace output for inspection and later parity work

## Deferred Supervisor Scope

- full reservation system
- full long-term commitment engine
- outgoing maintenance request creation
- standalone outgoing Jump Gate request creation; foreign/allied Jump Gate requests are created only as a side effect of accepted fleet proposals with `useJumpGate: true`
- score tuning
- behavior parity with the removed V1 bot

## Proposed location

V2 lives beside the old monolithic runner instead of being merged into it.

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
    bot-execution-adapters.ts
    bot-fleet-execution-adapters.ts
  subsystems/
    bot-subsystem-types.ts
    economic/
      bot-economic-subsystem.ts
```

Notes:
- V2 is the active bot runtime from the end-turn hook
- only the Supervisor/Executor layer may mutate game state
- V2 can reuse shared models and command helpers from the existing server code

## Current V2 Runtime Flow

Current flow for each bot turn:

1. `server/src/index.ts` invokes `runBotTurnPhaseV2(...)` before shared turn resolution.
2. V2 skips execution when mode is `DISABLED`.
3. V2 builds a `BotWorldSnapshot`.
4. V2 loads and normalizes stable `BotMemoryV2`.
5. V2 runs enabled V2 subsystems.
6. V2 collects proposals.
7. `Supervisor` scores, accepts, rejects, or stores pending commitments.
8. `SHADOW` mode records decisions but executes nothing.
9. `LIVE` mode executes accepted queue actions and allowlisted fleet missions through shared command helpers.
10. V2 records traces and execution outcomes.

## Feature flags

V2 runtime gating is mode-based.

Recommended flags:

```ts
export type BotV2FeatureFlags = {
  mode: 'DISABLED' | 'SHADOW' | 'LIVE';
  enabledSubsystems: {
    economic: boolean;
    defensive: boolean;
    warfare: boolean;
    research: boolean;
    critical: boolean;
    strategicDevelopment: boolean;
    strategicMilitary: boolean;
    strategicDiplomatic: boolean;
    weightManager: boolean;
  };
};
```

Current research note:
- `Research` is now a dedicated simple global subsystem.
- It emits at most one new `RESEARCH` proposal per turn.
- It chooses the best `(technology, main lab)` pair by affordability ETA, ETC, resource fit, and research power.
- It can attach helper labs when starting the research, preferring weaker or currently unaffordable idle labs first up to the IRN helper cap.
- It persists a per-player affordability window in `player.botMemoryV2.research`, starting at `5` turns and widening by `+1` at most once per turn when nothing is affordable yet.

Current defaults:
- `mode = 'LIVE'`
- `SROGAME_BOT_AI_V2_MODE=DISABLED|SHADOW|LIVE` overrides runtime mode
- legacy `SROGAME_BOT_AI_V2_ENABLED=false` maps to `DISABLED`
- legacy `SROGAME_BOT_AI_V2_SHADOW_MODE=true` maps to `SHADOW`
- implemented subsystems default enabled

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
  | 'REQUEST_DECISION'
  | 'REQUEST_CREATION'
  | 'DIPLOMACY_DECISION'
  | 'DIPLOMACY_PROPOSAL'
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
  mode: 'DISABLED' | 'SHADOW' | 'LIVE';
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
- subsystem contract stays proposal-only:
  - subsystems propose actions
  - `Supervisor` chooses what to accept or reject
  - only `Supervisor` / `Executor` layers should answer requests or execute real commands
  - this also applies to support-request and maintenance-request handling

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

The implemented Supervisor is live in `LIVE` mode. It now covers queue arbitration, allowlisted fleet execution, incoming request-decision execution, and outgoing support-request creation when an owning subsystem emits an executable proposal.

```ts
export type BotSupervisorDecision = {
  accepted: BotProposal[];
  pending: BotProposal[];
  rejected: Array<{
    proposalId: string;
    reason: string;
  }>;
  debug?: Record<string, unknown>;
};

export interface BotSupervisor {
  decide(
    snapshot: BotWorldSnapshot,
    memory: BotMemoryV2,
    proposals: BotProposal[]
  ): BotSupervisorDecision;
}
```

Current behavior:
- `DISABLED` rejects all proposals
- `SHADOW` rejects with `shadow_mode_no_execution` and records trace/debug data
- `LIVE` may accept executable queue proposals, allowlisted fleet proposals, incoming request decisions, outgoing support request creation proposals, diplomacy decision proposals, and outgoing diplomacy proposal creation
- executable queue proposal kinds are `BUILDING`, `RESEARCH`, and `SHIPYARD`
- executable fleet mission types are `SPY`, `TRANSPORT`, `ARMAMENT_DELIVERY`, `REPAIR`, `COLONIZE`, `MOVE`, `DEFEND`, `ATTACK`, `BOMBARD`, and `SIEGE`
- executable incoming request decisions use `REQUEST_DECISION`; Strategic Diplomatic evaluates the request and Supervisor only executes the accepted decision
- supported incoming request families are `JUMP_GATE`, `MAINTENANCE`, and `SUPPORT`
- executable outgoing support request creation uses `REQUEST_CREATION` with `requestType: 'SUPPORT'`; Strategic Diplomatic owns the intent and Supervisor only arbitrates/executes it
- executable diplomacy decisions use `DIPLOMACY_DECISION`; Strategic Diplomatic owns pending `PEACE` / `ALLIED` / `NEUTRAL` / `WAR` proposal policy, including rejecting invalid treaty-ladder proposals and cancelling own outgoing proposals when utility turns negative
- executable outgoing treaty creation uses `DIPLOMACY_PROPOSAL`; Strategic Diplomatic owns treaty policy and emits at most one best outgoing treaty proposal per turn, while Supervisor only arbitrates/executes it
- `RECYCLE` stays deferred until a subsystem emits and owns explicit recycle proposals
- `BOMBARD` and `SIEGE` get a simple Supervisor trace precheck when proposal metadata says the target is not `WAR`
- Strategic Diplomatic now also persists a per-faction `warAdvantageLevel` (`-2 .. +2`) from the 20-turn war-evaluation cadence; ship-loss value is dominant, structural damage is medium-high, and plunder is light
- outgoing maintenance request creation and standalone outgoing Jump Gate request creation are deferred and traced
- accepted diplomacy decisions execute before lifecycle recall, then normal accepted actions execute after recall
- Supervisor lifecycle recall returns own `ATTACK`, `BOMBARD`, `SIEGE`, and `SPY` fleets in `MOVING_TO_TARGET`, `PENDING_JUMP_GATE`, or `ORBITING` when the target owner relation is now `NEUTRAL`, `PEACE`, or `ALLIED`
- `SHIP_NEED` / `demandOnly` proposals are pressure only; they boost matching executable shipyard proposals instead of being converted directly
- non-critical unaffordable queue proposals can become pending commitments instead of being lost
- pending queue commitments are retried before new proposals and expired after the current 40-turn horizon
- exact fleet proposals can become `PENDING_SHIPS_NEXT_TURN` only when the missing exact ship type/count is completing next turn
- fleet-slot usage is accounted separately from resource spending, using the same target-share policy as a soft alignment input
- own-planet Jump Gate use is enabled by default when the shared command validation says it is legal and auto-approved
- foreign/allied Jump Gate request creation is not a standalone Supervisor proposal; it can happen through an accepted `FLEET_MISSION` whose owning subsystem set `useJumpGate: true`
- incoming foreign/allied Jump Gate approval is request-driven: Strategic Diplomatic emits `REQUEST_DECISION`, then Supervisor executes the shared Jump Gate request command
- TODO: check whether shared `DEFEND` launch/arrival logic fully supports own + allied/peace guard targets as intended

### Executor interface

```ts
export type BotExecutionOutcome = {
  proposalId: string;
  executed: boolean;
  success: boolean;
  message: string | null;
  spent?: { metal: number; crystal: number; deuterium: number };
  fuelSpent?: number;
  fleetId?: number;
  fleetSlotsUsed?: number;
  missionType?: FleetMissionType;
  requestType?: 'JUMP_GATE' | 'MAINTENANCE' | 'SUPPORT';
  requestId?: number;
  requestDecision?: 'APPROVE' | 'REJECT' | 'PARTIAL_APPROVE';
  supportType?: string;
  targetPlayerId?: number;
  commandErrorCode?: string;
};

export interface BotExecutor {
  executeAcceptedTasks(accepted: BotProposal[]): BotExecutionOutcome[];
}
```

Current behavior:
- `NoopBotExecutor` is used outside `LIVE`
- `LiveQueueBotExecutor` calls shared building, research, and shipyard command helpers
- `LiveQueueBotExecutor` also normalizes allowlisted fleet mission proposals and calls the shared fleet command helper
- `LiveQueueBotExecutor` executes accepted `REQUEST_DECISION` proposals through shared Jump Gate, Maintenance, and Support request command helpers
- `LiveQueueBotExecutor` executes accepted `REQUEST_CREATION` support proposals through the shared Support request creation command helper
- fleet execution trusts subsystem-provided exact ships and cargo; it does not compose replacement payloads
- own Jump Gate use is auto-selected when available and legal; subsystem-owned `useJumpGate: true` is preserved so shared fleet command validation can create pending foreign/allied Jump Gate requests
- fleet cargo is recorded as normal spending, while fleet fuel is recorded separately as lightweight fuel spending history
- command failures are logged and traced instead of falling back to V1

## Minimal V2 memory

V2 persists stable subsystem state plus Supervisor state.

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
  supervisor: {
    pendingCommitments: Array<{
      proposalId: string;
      dedupeKey: string;
      subsystemId: BotSubsystemId;
      proposalKind: BotProposalKind;
      createdTurn: number;
      expiresTurn: number;
      status: 'PENDING_RESOURCES' | 'PENDING_QUEUE' | 'PENDING_SHIPS_NEXT_TURN' | 'EXPIRED' | 'CANCELLED';
    }>;
    spendingHistory: Array<{
      turn: number;
      subsystemId: BotSubsystemId;
      proposalKind: BotProposalKind;
      value: number;
      resources: { metal: number; crystal: number; deuterium: number };
    }>;
    proposalHistory: Array<{
      turn: number;
      proposalId: string;
      subsystemId: BotSubsystemId;
      proposalKind: BotProposalKind;
      decision: 'ACCEPTED' | 'PENDING' | 'REJECTED';
      reason: string | null;
      score: number;
    }>;
    fleetSlotHistory: Array<{
      turn: number;
      subsystemId: BotSubsystemId;
      missionType: string;
      slotsUsed: number;
    }>;
    fuelSpendingHistory: Array<{
      turn: number;
      proposalId: string;
      subsystemId: BotSubsystemId;
      missionType: string;
      originCoordinates: { x: number; y: number; z: number } | null;
      targetCoordinates: { x: number; y: number; z: number } | null;
      fleetId: number | null;
      deuterium: number;
    }>;
  };
};
```

Current persistence rules:
- persist this inside player bot memory or an adjacent stable bot-memory structure
- do not persist transient proposal lists
- do not persist transient scores
- do not persist snapshot data
- do not persist raw per-turn Supervisor score breakdowns

## Minimal snapshot builder rules

`buildBotWorldSnapshot(...)` should:
- derive data only from current authoritative game state
- avoid side effects
- avoid hidden caching in Phase 0 unless clearly needed
- expose enough information for `Economic` to reason about:
  - local resources
  - local building levels
  - local queue saturation
  - next-turn shipyard ship completions for Supervisor pending-ship checks
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

## Defensive subsystem scope in the next phase

`Defensive` is the next specialist subsystem after `Economic`.

Its scope is strictly local to one planet.

Allowed request domains:
- `BUNKER_NETWORK` upgrades
- `SHIPYARD` upgrades when required for defensive unlock progression
- defense production orders, excluding bombs
- prerequisite research upgrades that are strictly required to progress an in-scope defensive building or defense-production goal
- prerequisite building upgrades that are strictly required to progress an in-scope defensive building or defense-production goal

Not yet allowed in this phase:
- interplanetary movement
- resource management
- defensive fleet logistics
- empire-global military planning
- `Critical` emergency overrides inside the subsystem itself

Defensive naming lock:
- use the same outward model as `Economic`
- per planet, rank candidates and select:
  - `Primary goal`
  - `Secondary goal`
- emit:
  - `Primary request`
  - `Secondary request`
- each request is the immediate next actionable step toward the linked goal
- if both goals share the same immediate request, emit one outward request and keep both goal links in metadata
- emit a first-class per-planet local result even when no outward request is emitted

### Defensive goal families

`Defensive` uses one mixed candidate pool containing three goal families:

- `UNLOCK`
  - unlock new defense tiers through required buildings or technologies
- `BUILDING`
  - mostly `BUNKER_NETWORK`
  - occasionally `SHIPYARD` when required to unlock defenses
- `PRODUCTION`
  - produce already unlocked local defenses in sized local batches

### Defensive local progress model

`Defensive` should use a dedicated per-planet metric called `avg_industry`.

`avg_industry` rules:
- use a simple average after pre-multiplying selected building levels
- include only buildings with current level `> 0`
- do not count missing buildings in the divisor
- included building set:
  - `METAL_MINE`
  - `CRYSTAL_MINE`
  - `DEUTERIUM_SYNTHESIZER`
  - `METAL_STORAGE`
  - `CRYSTAL_STORAGE`
  - `DEUTERIUM_TANK`
  - `SOLAR_WIND_GEOTHERMAL`
  - `NUCLEAR_PLANT`
  - `FUSION_REACTOR`
  - `ROBOTICS_FACTORY`
  - `SHIPYARD`
  - `NANITE_FACTORY`
- weighted building multipliers:
  - `FUSION_REACTOR * 1.25`
  - `NANITE_FACTORY * 2`

Conceptual formula:

```text
avg_industry =
  sum(weightedBuiltLevels)
  / count(builtBuildingsIncludedInTheSet)
```

Example:

```text
METAL_MINE = 2
METAL_STORAGE = 1
NANITE_FACTORY = 1
SOLAR_WIND_GEOTHERMAL = 5

avg_industry = (2 + 1 + (1 * 2) + 5) / 4 = 2.5
```

### Defensive unlock progression

Unlocking is derived only from current planet state.

Rules:
- if a defense is already unlocked on that planet, it cannot become locked again
- if multiple unlock goals open in the same threshold band, compare them by current `ETC`

Current unlock thresholds:
- `SAM` when `avg_industry >= 2`
- `LIGHT_BEAM` when `avg_industry >= 2.5`
- `ORBITAL_MISSILE_LAUNCHER` and `MEDIUM_BEAM` when `avg_industry >= 3.5`
- `HEAVY_ORBITAL_MISSILE_LAUNCHER`, `HEAVY_BEAM`, and `RAIL_GUN_CANNON` when `avg_industry >= 5`

### Defensive bunker rules

`BUNKER_NETWORK` should usually remain around `1-2` levels below the current local industry development.

It should also obey an explicit local max target.

Base bunker max from planet size:
- planet size `<= 100` -> max bunker level `2`
- then `+1` bunker max level for each `10` size above `100`

Attack-history additions from completed hostile arrivals/battles in the last `100` turns:
- `1-2` attacks -> `+1` max bunker level
- `3-5` attacks -> `+2` max bunker levels
- `6-15` attacks -> `+3` max bunker levels
- `>15` attacks -> `+4` max bunker levels

Attack history should also increase bunker priority:
- each attack-history step above adds `+50%` priority bonus to bunker-upgrade goals

### Defensive bunker-vs-defense equilibrium

The subsystem should compare:
- `total_bunker_val` = total raw resource value invested into completed bunker improvements
- `total_def_val` = total raw resource value of currently installed planetary defenses

Scaled imbalance rule:
- for every `20%` imbalance, the other side gets `+10%` priority bonus
- if bunker value is ahead, defense-production goals gain priority
- if defense value is ahead, bunker goals gain priority

### Defensive distribution rule

Defense production should not collapse into one dominant unlocked defense type only.

Use a light floor system:
- consider only currently unlocked defenses on that planet
- compare them by installed raw resource value, not by count
- production goals should favor unlocked defenses that have fallen too far below the others
- this should be a soft bonus, not a rigid equalization rule

### Defensive production-order sizing

One defense production order should target about `1.0` to `2.0` turns of that planet local income.

Rules:
- use that planet local income only, not empire-wide income
- choose a randomized sizing target inside the `1.0 - 2.0` range
- the result is still only a proposed order size; `Supervisor` remains responsible for actual funding and scheduling

### Defensive ETC and prerequisite handling

Use the same narrow-ETC and dependency-expansion style as `Economic`:
- throughput-only `ETC`
- no resource-wait simulation
- no empire-level resource logic
- strict prerequisite building goals allowed
- strict prerequisite research goals allowed
- throughput-affecting intermediate steps should immediately update later chain ETC where relevant

### Defensive selection behavior

`Defensive` should keep one mixed candidate pool, but final selection should follow explicit local behavior rules instead of pure global top-2 scoring.

When the planet cannot currently build defenses:
- select structural goals only
- normally:
  - best structural goal first
  - second-best structural fallback second
- structural goals may be:
  - bunker upgrade
  - unlock goal
  - prerequisite building/research for an unlock goal

When the planet can currently build defenses:
- use one structural slot and one production slot
- select:
  - best structural goal (`BUNKER_NETWORK` or unlock path)
  - best defense-production goal

When bunker upgrade is unavailable and no unlock goal is currently valid:
- select two defense-production goals

### Defensive ranking guidance

The subsystem purpose is local defensive optimization only.
It should not manage resources directly.

Candidate comparison should be based on:
- `ETC` as the base completion measure
- positive priority modifiers on top of ETC
- unlock thresholds from `avg_industry`
- bunker under-target pressure
- bunker-vs-defense imbalance
- attack-history pressure
- light distribution-floor pressure across unlocked defenses

Like `Economic`, lower final score is better.

Recommended weighted shape:

```text
weightedEtc = totalEtc / bonusFactor
```

Where:
- `bonusFactor` uses positive-only multiplicative bonuses
- no negative penalty factors below neutral baseline
- use raw resource value for bunker-vs-defense comparisons
- use completed hostile arrivals/battles in the last `100` turns as the local attack-history signal

## Warfare subsystem scope in the next phase

`Warfare` is the third local-first V2 subsystem.

Scope rules:
- strictly tied to one planet
- local military-production planner only
- no mission launches
- no target selection
- no empire-wide allocation
- no diplomacy-driven production logic
- no direct resource management

Outward contract:
- emit `5 goals`
- emit `5 immediate requests`
- keep first-class per-planet result output even when no request is emitted

The current high-level design wording about Supervisor-assigned production quota should be treated as obsolete.
`Warfare` is self-sufficient.

### Warfare goal families

`Warfare` uses three local goal families:

- `CAPACITY`
- `UNLOCK`
- `PRODUCTION`

Meaning:
- `CAPACITY`
  - improve local ship-production throughput
  - primarily `SHIPYARD`
  - secondarily `NANITE_FACTORY`
- `UNLOCK`
  - unlock additional ship types for future production
- `PRODUCTION`
  - immediate ship-production orders for already unlocked ships

### Warfare construction and prerequisite scope

In-scope construction targets:
- `SHIPYARD`
- `NANITE_FACTORY`

Prerequisites:
- prerequisite building goals are allowed only to remove obstacles
- prerequisite research goals are allowed only to remove obstacles
- this should mirror the local dependency-expansion style already used by `Economic` and `Defensive`

### Warfare ship scope

Implementation should use explicit included ship-enum lists grouped by category:

- `combatShips`
- `cargoShips`

Cargo ships:
- `TRANSPORTER`
- `MASS_HAULER`
- `CARGO_SUPPORT`

Excluded:
- everything else

This means Phase 0 `Warfare` should include:
- all combat ships
- exactly the three cargo ship types listed above

And exclude:
- probes
- colonizers
- repair ships
- logistics/support specials outside the three cargo types above

### Warfare local progression and unlock gating

For now, `Warfare` should reuse `avg_industry`.

Unlock progression rules:
- ship unlock progression is hardcoded by threshold bands
- the unlock threshold for a ship equals that ship's `SHIPYARD` requirement
- if multiple ships open inside the same threshold band, they compete by `weightedEtc`

This subsystem should not infer or invent a separate strategic quota model in Phase 0.

### Warfare capacity targets

Capacity target rules:

```text
targetShipyard = round(avg_industry)
targetNanite = targetShipyard / 2
```

`SHIPYARD` and `NANITE_FACTORY` both compete under `CAPACITY` rules.

`NANITE_FACTORY` should have a permanent `20%` priority penalty.
Recommended implementation:

```text
weightedEtc *= 1.2
```

This is intentionally explicit instead of folding the penalty into the same positive `bonusFactor` bucket.

### Warfare production distribution

`Warfare` should not spam one already unlocked ship forever unless it keeps clearly winning.

Use a soft distribution rule:
- compare ship mix by total invested ship value
- not by raw count
- apply only a soft bonus, never rigid equalization

### Warfare production-order sizing

One ship-production order should use local income as its target budget.

Recommended exact rule:

```text
targetBudget =
  random(1 .. (1 + avg_industry)) turns of local income

amount =
  floor(targetBudget / unitCost)
```

This is per ship type and per local planet only.

### Warfare ranking guidance

Use the same general ETC-first mathematical shape as the other local subsystems:

```text
weightedEtc = totalEtc / bonusFactor
```

Where:
- lower score is better
- positive modifiers stay multiplicative where applicable
- `NANITE_FACTORY` receives its extra explicit `weightedEtc *= 1.2` penalty after normal scoring

### Warfare selection behavior

The output list is not a pure global top-5.
It should reserve slots by category.

Target visible list shape:
- up to `2` structural goals
  - `CAPACITY`
  - `UNLOCK`
- fill the rest with `PRODUCTION` goals if possible
- if production cannot fill all remaining slots, additional `UNLOCK` goals may appear

If at least one cargo ship is unlocked:
- reserve exactly `1` cargo production request in the visible list

If no cargo ship is unlocked:
- do not force a cargo slot
- let another military production goal fill it

### Warfare structural-visibility rule

If not all in-scope ships are unlocked yet, `Warfare` should not degenerate into production-only output too early.

Structural visibility should remain allowed only when:

```text
bestStructuralWeightedEtc <= bestProductionWeightedEtc * 1.5
```

or:
- no valid production goal exists

Additional shaping rule:
- if both structural slots are weak, still allow only `1` structural slot and `4` production slots

This keeps progression visible without forcing obviously weak capacity/unlock requests.

### Warfare production-goal rule

For already unlocked ships:
- the production goal is the immediate production request itself

This should mirror how already unlocked defences are handled in `Defensive`.

### Warfare per-planet no-action result

Like `Economic` and `Defensive`, `Warfare` should emit a first-class per-planet local result even when no outward request is emitted.

That result should include:
- emitted request count
- primary goal key
- secondary goal key
- no-action reason
- blocked goal count

## Strategic Development subsystem scope in the next phase

`Strategic Development` remains a single subsystem, but for implementation it should be treated as:

- a local phase-1 development section
- a future global mission-management section

Phase 1 should implement only local executable work and keep the global mission side analysis/debug-only.

### Strategic Development goal families

The subsystem should use:

- `BUILDING`
- `PRODUCTION`
- `LOGISTICS`
- `COLONIZATION`
- `INTEL`

Phase-1 execution scope:

- `BUILDING`
- `PRODUCTION`

Phase-1 analysis/debug-only scope:

- `LOGISTICS`
- `COLONIZATION`
- `INTEL`

### Strategic Development phase-1 local building scope

Local building targets:

- `INTERSTELLAR_TRADE_PORT`
- `JUMP_GATE`
- `RESEARCH_LAB`
- `SENSOR_PHALANX`

Allowed prerequisite scope:

- any facility prerequisite chain required to reach those targets

`RESEARCH_LAB` should be treated as a normal building target, not as a special branch.

Like the other local subsystems, strict prerequisite research may be emitted when needed to unblock a valid final local goal.

### Strategic Development phase-1 local production scope

Local production targets:

- `COLONIZER`
- `TRANSPORTER`
- `MASS_HAULER`
- `CARGO_SUPPORT`
- `REPAIR_DRONE`

Readiness gating:

- reuse `avg_industry`
- per-ship readiness threshold should match the ship's `SHIPYARD` requirement

Additional production rules:

- `COLONIZER` should only compete when the empire is below colony cap
- `REPAIR_DRONE` should only be considered on low-industry or recently colonized planets, once those planets are actually capable of producing it

### Strategic Development phase-1 local output shape

Per planet, the local executable output should stay split by queue type.

Per planet:

- up to `2` building goals
- up to `2` production goals

The subsystem contract should reflect that these are separate result sections, not one mixed list.

Reason:

- planets have separate building and production queues
- building and production requests usually differ by an order of magnitude in cost
- this separation should make later Supervisor decisions easier

### Strategic Development phase-1 ranking guidance

Use the same general ETC-first mathematical shape as the other local subsystems:

```text
weightedEtc = totalEtc / bonusFactor
```

Where:

- lower score is better
- positive modifiers stay multiplicative where applicable
- ranking should primarily reward unblock/development value, with ETC acting as the timing discriminator

### Strategic Development local priority bonuses

`INTERSTELLAR_TRADE_PORT`:

- bonus range: `0% .. 20%`
- based on local asymmetry between planetary resource modifiers
- recommended first implementation:

```text
modifierSpread = maxModifier - minModifier
```

`SENSOR_PHALANX`:

- bonus range: `0% .. 30%`
- based on the same planetary factors used by actual phalanx range / scan-quality formulas

`JUMP_GATE`:

- bonus range: `0% .. 30%`
- based on the same planetary factors used by actual jump-gate-capacity formulas

### Strategic Development phase-1 local selection behavior

Per planet, selection should prefer balance between structure and readiness.

When possible:

- emit up to `2` building goals
- emit up to `2` production goals

This is intentionally not a single mixed top-4 list.

### Strategic Development phase-2 global mission scope

Phase 2 should add executable global mission output for:

- `LOGISTICS`
- `INTEL`

`COLONIZATION` remains planned, but actual colonization launches should stay deferred until a later focused pass.

The current local phase-1 building/production output should remain intact.
Phase 2 should add a separate global mission-output section instead of mixing missions into local per-planet queue results.

### Strategic Development phase-2 executable mission types

Executable mission types:

- `TRANSPORT`
- `ARMAMENT_DELIVERY`
- `SPY`

Meaning:

- `TRANSPORT`
  - resource-only support
- `ARMAMENT_DELIVERY`
  - used when `REPAIR_DRONE`s are included
  - may also carry resources
- `SPY`
  - colonization-intel maintenance on unoccupied planets only

Important:

- `ARMAMENT_DELIVERY` already exists and should be reused
- in this subsystem it should carry only:
  - resources
  - `REPAIR_DRONE`
- `PLANETARY_BOMB`s and small-ship reinforcement stay out of scope here and belong to a different strategic subsystem

### Strategic Development phase-2 mission-output cap

The global mission-output section should use a soft cap:

```text
missionRequestCap =
  imperiumFleetCap * currentAvailabilityForThisSubsystem
  + ownedPlanetAmount
```

Where:

```text
imperiumFleetCap = 4 + COMPUTER_TECHNOLOGY
```

The intended default availability target for this subsystem is up to `40%` of fleet cap.

### Strategic Development phase-2 logistics-source qualification

A planet may act as a support/logistics source only if:

- `avg_industry >= 4`
- it has local surplus
- it has a valid cargo or ship-hangar-capacity fleet available

Recently colonized / undeveloped planets are targets only, not sources.

For this subsystem:

```text
recentlyColonized = avg_industry < 2
```

### Strategic Development phase-2 repair-drone delivery priority

Repair-drone delivery should use hard target-priority bands:

1. planets with damaged buildings
2. recently colonized / undeveloped planets
3. planets with negative industry or shipyard planetary modifiers

Target need should consider:

- missing building HP / repair workload
- industry-capacity penalty modifiers
- recently colonized status

### Strategic Development phase-2 shortage / surplus model

Target shortage should combine:

- queued building / production costs
- modifier-adjusted local scarcity

Source surplus should combine:

- modifier-adjusted resource dominance
- reserve-floor safety

Reserve floor:

```text
reserveFloor = max(3 turns of local income, 25% of storage)
```

Undeveloped planets may always be intentionally oversupplied beyond storage capacity.

### Strategic Development phase-2 payload rules

Resource payload:

```text
resourcePayload =
  min(targetShortage, sourceSurplus, fleetCargoCapacity)
```

Repair-drone payload rules:

- when drones are included, use `ARMAMENT_DELIVERY`
- one mission may carry both resources and `REPAIR_DRONE`s
- send all available drones, limited by ship hangar capacity
- do not drain the source if:

```text
sourceIndustryPower <= targetIndustryPower * 2
```

When both `TRANSPORT` and `ARMAMENT_DELIVERY` are otherwise valid:

- prefer `ARMAMENT_DELIVERY` whenever drones are included

Overlapping logistics requests should merge by:

- source-target pair
- mission type

Mission generation should be mixed:

- source-first for exporting abundance
- target-first for shortage / repair / industry-penalty support

### Strategic Development phase-2 intel / colonization loop

Intel maintenance rules:

- scan all eligible unoccupied planets in radius `2 + P`, where `P` is current owned planet count
- treat a planet as needing scan when:
  - no relevant espionage report exists
  - or the latest relevant report is older than `200` turns
- prefer never-scanned planets over stale-refresh scans
- allow any valid probe source

Colonization candidate ranking basis:

- planet size
- positive planetary modifiers
- industry modifier weighted `x2.0`
- resource modifiers weighted `x1.5`

Reject colonization candidates smaller than:

```text
140
```

### Strategic Development phase-3 colonization execution

Current executable colonization rules:

- emit immediate mission requests only
- emit at most `1` visible `COLONIZE` request
- launch only when colony cap is free
- launch only when no active own `COLONIZE` fleet already exists
- use scanned targets only
- reject targets when reported colonization difficulty exceeds current `ADAPTIVE_TECHNOLOGY`
- rank valid targets by pure `colonizationScore`
- take the top `2` valid targets and choose randomly between them
- ignore distance in target scoring
- choose any ready colonizer source that can launch now and has enough deuterium for fuel
- include bootstrap cargo when possible

Current bootstrap cargo heuristic:

- use the agreed simple `400`-cargo bootstrap budget
- try `133 metal`, `133 crystal`, `133 deuterium`
- still emit `COLONIZE` even when extra cargo cannot be loaded

Deferred Strategic Development follow-ups:

1. smarter bootstrap cargo planning
2. post-colony follow-up support goals
3. richer colonizer-source selection
4. longer-run trace tuning on real saves

### Strategic Development architecture TODO

TODO:

After all strategic subsystems exist, revisit the cross-subsystem queue/resource contract.

This is needed because the game already has several separate constraints:

- per-planet building queue
- per-planet production queue
- empire-wide fleet-cap constraints
- research throughput constrained by available research labs

The phase-1 subsystem should keep building requests and production requests separate so this future cleanup stays tractable.

## Strategic Military phase-1 scope

`Strategic Military` is a global neutral-farm operations subsystem.

It does **not** own the local `UNLOCK` / `BUILDING` / `PRODUCTION` combat-ship planner.
That remains the responsibility of the planetary-focused `Warfare` subsystem.

`Strategic Military` should instead:

- discover neutral planets,
- classify planets only as `neutral` vs `not-neutral`,
- maintain a farm ledger for discovered neutral planets,
- plan initial defense-break attacks,
- plan repeatable plunder attacks,
- emit ship-shortage demand when current fleets are insufficient for good farm plans.

### Strategic Military phase-1 outputs

This subsystem should emit:

- immediate mission requests
- ship-shortage demand requests

It should not emit local production/building requests directly.

### Strategic Military goal families

- `INTEL`
- `BREAK`
- `PLUNDER`
- `SHIP_NEED`

### Strategic Military phase-1 mission scope

Executable mission types:

- `SPY`
- `ATTACK`

Out of scope:

- `BOMBARD`
- `SIEGE`
- multi-origin raid coordination
- `MOVE`-based military relocation
- local ship unlock/building management

### Strategic Military intel model

Scanning rules:

- try to scan every planet in the galaxy
- classify only:
  - `neutral`
  - `not-neutral`
- after the whole galaxy is scanned, low-priority refresh should walk the oldest known intel first

`SPY_PROBE` stock management stays with `Critical`.
`Strategic Military` only consumes probes for discovery and refresh.

### Strategic Military farm memory

For every discovered neutral farm, subsystem memory should keep at least:

- coordinates
- last spy turn
- last attack turn
- last successful plunder turn
- known mine levels
- known storage capacity
- known bunker level
- known planetary modifiers
- known neutral ships
- known neutral defenses
- `initialDefenseBroken`
- estimated current stored resources
- estimated next good attack turn
- nearest / preferred owned source planets

Implementation boundary:

- snapshot data for `Strategic Military` should hold only current visible facts
- persistent farm-ledger state should live in `BotMemoryV2`
- the implemented memory-backed model must not fall back to hidden live neutral state

Farm-ledger update sources:

- espionage reports
- battle reports
- plunder reports

Farm-ledger truth rule:

- use only remembered / reported neutral state for:
  - ships
  - defenses
  - resources
- do not use hidden live neutral planet state for planning

### Strategic Military target-state transition

Neutral farm states:

- `BREAK`
- `PLUNDER`

Transition rule:

- a neutral farm becomes `PLUNDER`-ready only when known ships and known defenses are both gone
- `initialDefenseBroken = true` only under that same condition

### Strategic Military phase-1 firepower rule

For initial defense-break attacks:

- estimate required firepower from known neutral ships and defenses
- scale that estimate by:

```text
1.5
```

Phase-1 origin rule:

- use the best single valid origin only
- do not combine ships from multiple origins yet

### Strategic Military phase-1 plunder rule

Repeatable plunder fleets should use:

- cargo ships
- plus `1-2` military ships

### Strategic Military farm-regrowth model

Use existing in-game formulas to estimate regrowth:

- derive passive resource growth from known mine levels and planetary modifiers
- cap estimated stored resources by known storage capacity
- update the estimate every turn

Post-plunder baseline rule:

- after successful plunder, use exact reported leftover resources when available

Target timing rule:

- use both:
  - storage-regrowth timing
  - cargo-usefulness timing
- launch at the earlier useful turn
- planets should become valid attack targets `N` turns before the ideal resource state, where `N` is travel time

Useful-cargo threshold:

- a farm is already worth reattacking when estimated loot reaches at least `50%` of currently available cargo capacity

Fuel cost is not a dominant ranking factor here and should matter only lightly, mainly for early defense-break attacks.

### Strategic Military ship-shortage demand

When current fleets are insufficient, emit `SHIP_NEED` requests as:

- one request per exact ship type
- with minimal additional amount required
- do not emit blocked mission proposals instead of these demand requests
- cap outward `SHIP_NEED` to:
  - max `1` shortage request per planet
  - only the highest-priority shortage for that planet

Typical shortage cases:

- need more ships with `ATMOSPHERIC_BOMBARDMENT` weapons for defense breaking
- need more standard combat ships to defeat neutral ships
- need more cargo ships to carry expected plunder

### Strategic Military phase-2 follow-up

The next major slice after phase 1 should be relocation-assisted `BREAK`.

Hard gate:

- `BREAK` must be completed before `PLUNDER` is even considered
- if known ships or known defenses still remain, that neutral target stays in the `BREAK` / `SHIP_NEED` world only

Next-phase executable mission types:

- `SPY`
- `ATTACK`
- `MOVE`

Current relocation scope:

- focus only on military ships required for `BREAK`
- broader relocation for cargo / mixed `PLUNDER` fleets stays for a later phase

Relocation trigger:

- trigger when no single origin can satisfy the required `BREAK` force
- also trigger when regrouping to a nearer staging planet is better

Primary relocation use case:

- gather a `BREAK` fleet on one nearby owned planet

Staging-planet rule:

- choose the owned planet minimizing total ETA from contributing fleets to the target

Origin-composition rule:

- a blocked `BREAK` target may gather ships from multiple origins by `MOVE`
- the eventual `ATTACK` can still remain single-origin after regrouping

`SHIP_NEED` interaction:

- try relocation first
- emit `SHIP_NEED` only if regrouping still cannot satisfy `BREAK`

Stable carry-over rules:

- keep `BREAK` force sizing at estimated minimum `* 1.5`
- keep explicit distinction between:
  - `BREAK` intel
  - `PLUNDER` intel

`BREAK` vs `PLUNDER` budget split after relocation:

- `60% BREAK`
- `40% PLUNDER`

Intel refresh follow-up:

- after the whole galaxy is scanned, refresh all known planets uniformly by oldest-first

Explicit non-goals for this relocation phase:

- no multi-target coordinated attack waves
- no cross-turn fleet reservation system
- no escort-loss adaptive composition

## Strategic Diplomatic phase-1 scope

`Strategic Diplomatic` is a global geopolitical-management subsystem.

It does **not** target neutral farms.
It does **not** start as a mission subsystem in phase 1.

Phase-1 focus:

- manage diplomatic relations with discovered non-neutral players and bots
- estimate geopolitical situation
- decide preferred diplomatic directions
- propose diplomatic-state changes
- expose the diplomatic situation upward to `Supervisor` and the future weight-management subsystem

### Strategic Diplomatic phase-1 outputs

Phase-1 should emit:

- diplomatic action proposals
- global diplomatic situation summary
- per-faction diplomatic summary

Phase-1 should **not** yet emit:

- fleet-mission requests
- direct building requests
- direct `SHIP_NEED` / bomb / probe pressure

### Strategic Diplomatic phase-1 proposal scope

Allowed proposal families:

- executable relation-change proposals via `DIPLOMACY_PROPOSAL`
- proposal-management preferences
- retaliation flags

### Strategic Diplomatic relation ladder

Use adjacent-only diplomatic-state changes.

Escalation:

- `ALLIED -> PEACE`
- `PEACE -> NEUTRAL`
- `NEUTRAL -> WAR`

Deescalation:

- `WAR -> NEUTRAL`
- `NEUTRAL -> PEACE`
- `PEACE -> ALLIED`

### Strategic Diplomatic phase-1 target scope

Track only:

- discovered non-neutral human players
- discovered non-neutral bot players

Do not track neutral-planet-type empires here.

### Strategic Diplomatic per-faction model

For each discovered faction, maintain at least:

- current diplomatic status
- strength estimate
- stance score
- hostility score
- confidence score

### Strategic Diplomatic strength-estimate inputs

Per-faction strength estimate should include:

- planet count
- average development
- espionage quality gap
- battle reports
- recent hostile-action history

Winning / losing estimation should include:

- relative strength estimate
- recent battle outcomes
- recent hostile actions

### Strategic Diplomatic stance math

Build stance score with a layered model:

- personality bias
- relative strength bias
- recent hostility
- current relation tension
- ally / network pressure
- confidence penalty

Recommended compact utility form:

```text
actionUtility =
  personalityPressure
  + relationPressure
  + threatOrOpportunity
  + eventPressure
  + networkPressure
  - uncertaintyPenalty
```

### Strategic Diplomatic personality target-state model

Use a hybrid model:

- `aggressive` wants at least one active war most of the time
- `miner` prefers alliance and peace over war
- `diplomat` prefers alliance-building first and selective war later
- `isolationist` prefers neutrality or peace
- `balanced` prefers war mainly against weaker opponents

Phase-1 diplomatic proposal priority should be based on:

- stance score
- confidence
- personality target deficit

### Strategic Diplomatic hostility-escalation rule

Do not escalate to `WAR` from one small hostile event alone.

Use accumulated hostility:

- hostile actions add escalation pressure
- repeated hostility adds more pressure
- only sufficient accumulated hostility should make `WAR` a top diplomatic action

Treaty-policy extension:

- bots may also propose `WAR` against a clearly weaker faction even without repeated hostility
- the "clearly weaker" threshold is personality-dependent: aggressive profiles need a smaller advantage, avoider/turtle-style profiles need a larger one
- weaker bots should bias more strongly toward `ALLIED` proposals
- if a war target has been heavily beaten, Strategic Diplomatic applies temporary non-aggression treatment for roughly `40-100` turns, modified by personality (`AGGRESSOR -20`, `BALANCED -10`, `AVOIDER +20`)
- temporary non-aggression suppresses renewed `WAR` proposals and favors `WAR -> NEUTRAL` deescalation
- incoming pending treaty proposals suppress outgoing treaty creation for the same pair; older outgoing pending proposals suppress only that pair
- TODO: far-future coalition policy where weaker bots seek alliances specifically to contain a much stronger player

### Strategic Diplomatic upward summary contract

Expose both:

- global diplomatic summary
- per-faction diplomatic summary

Recommended global summary fields:

- count of `WAR`
- count of `ALLIED`
- count of `PEACE`
- count of `NEUTRAL`
- strongest enemy estimate
- weakest enemy estimate
- whether we are winning any war
- whether we are losing any war
- whether we lack allies
- top escalation target
- top deescalation target
- top alliance target
- overall diplomatic pressure score

### Strategic Diplomatic phase-1 non-goals

Explicitly out of scope:

- attack missions
- support missions
- bombardment missions
- siege missions
- direct building requests
- direct `SHIP_NEED` / bomb / probe pressure

### Strategic Diplomatic deferred future notes

Later phases should add:

- special multi-probe espionage planning against real players
- attack / support / bombard / siege mission planning
- direct building pressure for `BOMB_DEPOT`, `ALLIANCE_DEPOT`, and `JUMP_GATE`
- direct `SHIP_NEED` / probe / bomb pressure
- tributes / bribes / negotiated payments to influence diplomatic-state changes

## Strategic Diplomatic phase-2 follow-up

The next `Strategic Diplomatic` slice should add real-player espionage planning, but still avoid war/support execution.

### Strategic Diplomatic phase-2 outputs

Phase-2 should emit:

- immediate `SPY` mission requests
- probe `SHIP_NEED` requests
- refined diplomatic summaries

### Strategic Diplomatic phase-2 mission scope

Executable mission types:

- `SPY`

Still out of scope:

- `ATTACK`
- `SUPPORT`
- `BOMBARD`
- `SIEGE`

### Strategic Diplomatic phase-2 target priorities

All discovered factions remain in scope, with status-based priority weights:

- `ALLIED`: `5%`
- `PEACE`: `10%`
- `NEUTRAL`: `25%`
- `WAR`: `60%`

### Strategic Diplomatic phase-2 spy-planning rule

Optimize for:

- best intel gain per probe spent

Probe count should use:

- minimum probes needed to reach intended report depth
- plus a safety margin

Also enforce affordability:

- phase 2 should not blindly send extremely large probe swarms when the cost is poor relative to the expected information gain

### Strategic Diplomatic phase-2 intel targets

Desired report depth should vary by diplomatic status.

Intel should count as insufficient when it is:

- too old
- too shallow
- too sparse across that faction's planets

Staleness windows should differ by diplomatic status and should stay fairly long-term.

### Strategic Diplomatic phase-2 espionage-superiority signal

Phase 2 should explicitly estimate enemy espionage superiority.

One important signal is:

- even large probe groups still fail to produce sufficiently deep reports

This signal should feed later war/support planning.

### Strategic Diplomatic phase-2 probe-demand model

Probe `SHIP_NEED` should be:

- outwarded per planet
- but derived from a global diplomatic probe deficit

Global planned diplomatic probe need should be capped by:

- let `highestAvgIndustry` be the highest owned-planet `avg_industry`
- cap total planned probe demand at:

```text
2 * highestAvgIndustry + highestAvgIndustry^2
```

Separate outward probe-demand requests should be capped to:

- max `2` per-planet requests

### Strategic Diplomatic phase-3 note

After this spy-planning slice, the next major phase should be:

- combined enemy-attack and allied-support planning

## Strategic Diplomatic phase-3 follow-up

The next `Strategic Diplomatic` slice should add direct enemy-attack planning plus allied-support planning.

### Strategic Diplomatic phase-3 outputs

Phase 3 should emit:

- immediate mission requests
- exact-ship-type `SHIP_NEED`

It should still avoid:

- direct building requests
- direct probe-demand ownership outside the phase-2 spy layer

### Strategic Diplomatic phase-3 mission scope

Executable mission types:

- `ATTACK`
- `GUARD`
- `REPAIR`

Still out of scope:

- `BOMBARD`
- `SIEGE`
- `MOVE`
- `ARMAMENT_DELIVERY`

### Strategic Diplomatic phase-3 offensive target scope

Allow offensive planning against:

- `WAR`
- hostile `NEUTRAL` factions with high hostility
- `NEUTRAL` factions significantly weaker than us

Concrete first-pass rules:

- high hostility means `hostilityScore >= 50`
- significantly weaker means `ourStrength >= theirStrength * 1.5`

### Strategic Diplomatic phase-3 offensive intel requirement

Attack targets must have:

- espionage data
- or battle data

Do not attack blindly.

### Strategic Diplomatic phase-3 scout-by-battle rule

This phase should support a special reconnaissance-by-battle attack.

Allow it when:

- target is `WAR`, or hostile/weaker `NEUTRAL`
- espionage exists
- but military-state confidence is still low

Use one medium combat ship with fixed preference:

- `CRUISER`
- then `BATTLE_SHIP`
- then `FRIGATE`

### Strategic Diplomatic phase-3 offensive force sizing

Normal `ATTACK` force sizing should be based on estimated minimum required force, but should allow a wider aggression band:

- roughly `0.8 .. 2.0`

This wider band coexists with the dedicated one-medium-ship battle-scout case.

### Strategic Diplomatic phase-3 allied-support scope

Support planning should target:

- `ALLIED` factions only

Support targets become valid through:

- explicit support requests
- visible need

Visible need should prioritize:

- damaged allied planets
- recently attacked allied planets

`REPAIR` priority should combine both, with damaged buildings first.

### Strategic Diplomatic phase-3 attack / support split

Do not use one fixed split.

Use a dynamic split driven by:

- global war state
- ally distress

First-pass targets:

- winning: `70 / 30`
- balanced: `60 / 40`
- losing: `40 / 60`

### Strategic Diplomatic phase-3 war-state inputs

`winning / balanced / losing` should consider:

- relative strength
- recent battle outcomes
- active hostile pressure
- recent building damage on our side or hostile side

### Strategic Diplomatic phase-3 ship-need model

`SHIP_NEED` should be:

- per exact ship type
- emitted only for blocked `ATTACK` / `SUPPORT` plans

Cap:

- max `1` per origin planet

Probe shortage should remain owned by the phase-2 spy layer.

### Strategic Diplomatic phase-4 note

After direct enemy-attack and allied-support planning, the next major phase should be:

- `BOMBARD`
- `SIEGE`
- `MOVE`
- `ARMAMENT_DELIVERY`
- direct bombardment-support building / bomb pressure

## Strategic Diplomatic phase-4 follow-up

The next `Strategic Diplomatic` slice should add force projection and escalation tools for formal war pressure.

### Strategic Diplomatic phase-4 outputs

Phase 4 should emit:

- immediate mission requests
- exact-ship-type `SHIP_NEED`
- direct building requests
- `PLANETARY_BOMB` production pressure

### Strategic Diplomatic phase-4 mission scope

Executable mission types:

- `BOMBARD`
- `SIEGE`
- `MOVE`
- `ARMAMENT_DELIVERY`

Important mission-scope split:

- `ATTACK` keeps its current broader offensive scope
- `BOMBARD` is `WAR` only
- `SIEGE` is `WAR` only
- explicit hostility gates now apply:
  - `BOMBARD` requires hostility `>= 35`
  - `SIEGE` requires hostility `>= 60`
- when a target is siege-eligible but siege hostility is still too low, the subsystem should fall back to `BOMBARD`

### Strategic Diplomatic phase-4 local pressure scope

Allow direct local pressure for:

- `BOMB_DEPOT`
- `ALLIANCE_DEPOT`
- `JUMP_GATE`
- `PLANETARY_BOMB` production

### Strategic Diplomatic phase-4 bombard / siege distinction

Planning must distinguish:

- `BOMBARD` = shorter sharper structural strike
- `SIEGE` = persistent orbit pressure aimed at full target destruction

`SIEGE` also needs a real exposure model:

- the orbiting siege fleet can be hit by enemy relief forces
- hostile orbiting fleets must be fully cleared before siege really starts

### Strategic Diplomatic phase-4 siege-risk model

First-pass siege-risk evaluation should consider:

- target faction strength
- orbit duration

Do not use a trivial fixed penalty.

### Strategic Diplomatic phase-4 relocation rule

`MOVE` should be valid when:

- no single origin can satisfy the desired mission
- or regrouping on a nearer hub is better than direct launch

Staging-planet choice should use:

- best staging hub by ETA
- plus `JUMP_GATE` / `ALLIANCE_DEPOT` readiness

Jump Gate travel between own planets can collapse ETA to `1` turn and should influence staging value directly.

TODO:

- clarify and later implement whether allied Jump Gate travel should provide the same ETA reduction between allied planets

### Strategic Diplomatic phase-4 armament-delivery scope

In this subsystem, `ARMAMENT_DELIVERY` should carry:

- `PLANETARY_BOMB`
- small war ships
- repair / defense reinforcement

Valid targets:

- own planets
- allied planets

Priority between own and allied targets should be:

- pure need-score competition

### Strategic Diplomatic phase-4 planetary-bomb pressure model

`PLANETARY_BOMB` pressure should use a hybrid model:

- exact blocked-plan bomb demand
- plus readiness stock

Readiness stock should be based on:

- active war count
- fixed stock per strategic hub

Always respect:

- the local `PLANETARY_BOMB` cap from `BOMB_DEPOT`

Interpret stock goals mainly as `%` of local bomb capacity:

- during active war: target near `90%`
- with allies but no war: target roughly `30%–50%`
- with peace only: target roughly `10%–20%`

### Strategic Diplomatic phase-4 family competition

Family competition should stay:

- dynamic
- war-state-driven

Do not fall back to one rigid static split.

### Strategic Diplomatic phase-4 explicit non-goals

Still out of scope:

- no cross-turn reservation system yet
- no multi-target synchronized waves yet
- no allied / peace hostile-activity auto-sharing execution yet

### Strategic Diplomatic deferred shared-intel note

Later phases should add allied / peace hostile-activity information sharing:

- `ALLIED` and `PEACE` bots should automatically share attack knowledge
- human allies / peace contacts should receive copied hostile battle / attack reports

### Strategic Diplomatic phase-5 note

After phase 4 force projection, the next `Strategic Diplomatic` slice should be a tight pre-break concentration phase:

- `MOVE`
- `ATTACK`
- one primary war-break target
- concentration before smaller post-break pressure

## Strategic Diplomatic phase-5 follow-up

The next `Strategic Diplomatic` slice should add pre-break concentration and a primary war-break target model.

### Strategic Diplomatic phase-5 outputs

Phase 5 should emit:

- one primary `MOVE` bundle
- one primary `ATTACK`
- exact-ship-type `SHIP_NEED` only after relocation options are exhausted

### Strategic Diplomatic phase-5 mission scope

Executable mission types:

- `MOVE`
- `ATTACK`

Do not expand `BOMBARD` / `SIEGE` further in this phase.

### Strategic Diplomatic phase-5 campaign order

The intended order is:

1. concentrate force
2. try to break the target
3. only later, in another phase, switch to smaller repeat attacks after the target is opened

### Strategic Diplomatic phase-5 primary target rule

Keep:

- one global primary war-break target for the whole subsystem

Primary-target persistence:

- randomized `3 .. 10` turns
- not one fixed constant

Immediate invalidation:

- fresh intel shows the target is no longer favorable
- required concentrated force is no longer reachable
- diplomatic status changed

### Strategic Diplomatic phase-5 target-value rule

A target should be worth concentration only when:

- `targetValue >= expectedLosses * V`

Where:

- `V` is randomized in range `1.25 .. 1.5`
- not a fixed hardcoded constant

Target value should combine:

- known ships value
- known defenses value
- planet development value
- diplomatic pressure

### Strategic Diplomatic phase-5 loss-estimate rule

Expected losses should use:

- actual battle-simulator estimate if available

### Strategic Diplomatic phase-5 concentration rule

Before target defenses are broken:

- prefer one concentrated strike over several smaller attacks

If a direct `ATTACK` is already possible without relocation:

- choose randomly only among near-equal options between immediate attack and further concentration

### Strategic Diplomatic phase-5 relocation rule

`MOVE` should trigger when:

- no single origin can satisfy the preferred pre-break attack
- or regrouping on a nearer hub creates a better concentrated strike

Staging choice should still use:

- best owned hub by contributor ETA
- plus `JUMP_GATE` / `ALLIANCE_DEPOT` readiness

### Strategic Diplomatic phase-5 ship-need rule

`SHIP_NEED` should be emitted:

- only after relocation options are exhausted

### Strategic Diplomatic phase-5 explicit non-goals

Still defer to the following phase:

- post-break smaller repeat attacks
- cargo-supported war raids
- ambush-risk control
- opened-target pacing

## Strategic Diplomatic phase-6 follow-up

The next `Strategic Diplomatic` slice should be the **post-break war-pressure phase**.

It should cover:

- repeated post-break `ATTACK`
- cargo-supported war raids
- ambush-risk control

Mission scope for this phase:

- `ATTACK` only

It should not re-expand `MOVE`, `BOMBARD`, or `SIEGE` in this slice.

Current implementation note:

- phase 6 now also consumes the live per-faction `warAdvantageLevel` as extra raid-scoring context
- post-break raid continuation now hard-stops as soon as the relation is no longer `WAR`
- stale opened targets are no longer blind-raided; they instead feed high-priority `SPY` refresh pressure
- only one opened-target raid per enemy is kept each turn
- direct `BREAK` pressure is still preferred unless the best raid is at least `25%` better
- raid pause thresholds and active opened-raid caps now scale with `warAdvantageLevel`
- it still does not introduce a broader doctrine table or campaign-state machine yet

### Strategic Diplomatic phase-6 opened-target gate

A target may become a post-break raid target only after the subsystem is sure `BREAK` succeeded for that planet.

Opened means:

- known ships on the targeted planet are `0`
- known defenses on the targeted planet are `0`

That confirmation may come from either:

- the latest battle report
- or the latest fresh spy report

Either one is sufficient if it clearly confirms zero ships and zero defenses.

### Strategic Diplomatic phase-6 fleet-shape rule

Post-break raid fleets should use:

- cargo ships
- plus variable military cover

Military cover should be sized as:

- a minimum combat package by target-risk band

Cargo should be brought only:

- up to estimated plunder

More cargo than estimated plunder should not be preferred.

### Strategic Diplomatic phase-6 scoring rule

Repeated post-break attacks should optimize:

- `plunder - travel churn - ambush risk`

### Strategic Diplomatic phase-6 ambush-risk rule

Ambush risk should combine:

- enemy overall strength
- attack frequency
- nearby hostile planet coverage

The strongest upward signals should be:

- many recent raids on the same target
- recent hostile battle activity near the target
- strong nearby enemy planets

Risk should decay by:

- fixed `-10` per quiet turn
- plus new hostile-evidence bumps

When risk reaches:

- `>= 70`

The subsystem should:

- pause raids on that target

Current implementation detail:

- pause threshold is now dynamic by `warAdvantageLevel`:
  - `-2 -> 55`
  - `-1 -> 60`
  - `0 -> 70`
  - `+1/+2 -> 80`

If no valid post-break raid targets remain, prefer:

- `SPY` on current `WAR` targets
- plus high-hostility `NEUTRAL` targets only when already part of current operations

### Strategic Diplomatic phase-6 break-vs-raid caps

This phase should keep separate caps for:

- `BREAK`
- opened-target raids

`BREAK` should stay capped at:

- max `2`

Opened-war raid targets may be active up to:

- `floor(sqrt(ownedPlanetsCount)) + 1`

Current implementation detail:

- when average active-war `warAdvantageLevel <= -1`, the opened-target raid cap is reduced to `1`

But concentrated `BREAK` pressure should still preferably stay at:

- only `1` or `2`

### Strategic Diplomatic phase-6 memory rule

This phase should keep an operational opened-target ledger with fields such as:

- target coordinates
- target player id
- last post-break attack turn
- recent raid count in a rolling window
- current ambush-risk score
- `pausedUntilTurn`
- last known preferred raid origin
- last known estimated plunder value

The recent-raid rolling window should be:

- linear by solar-system distance
- `5` turns at distance `1`
- up to `25` turns at maximum galaxy distance

### Strategic Diplomatic phase-6 hostile-neutral rule

High-hostility `NEUTRAL` attacks should remain allowed during active `WAR`, but they should receive:

- a `-40%` score penalty

So real war fronts stay first priority.

## Strategic Diplomatic phase-7 follow-up

The next `Strategic Diplomatic` slice should be the **war-exit pressure and hostility-rebalancing phase**.

It should cover:

- hostility rebalancing from coercive war actions
- deescalation proposal readiness
- campaign-state pacing between continued pressure and war exit

This phase should not primarily add new mission families.

It should instead change how the subsystem interprets:

- successful `BOMBARD`
- successful `SIEGE`
- incoming enemy coercion
- losing-vs-winning war posture

### Strategic Diplomatic phase-7 outgoing coercion rule

Successful outgoing coercion should reduce our hostility toward the target faction.

Current live extension:

- successful outgoing plunder also reduces hostility when the plunder is meaningful
- enemy ship losses reduce hostility immediately
- meaningful outgoing structural damage reduces hostility
- successful `BOMBARD` / `SIEGE` damage reduces hostility on both sides

Successful `BOMBARD` should apply:

- base hostility decrease `-5`
- plus `0.5` hostility points per `1%` inflicted damage

Successful `SIEGE` should apply per successful orbit turn:

- base hostility decrease `-3`
- plus `0.5` hostility points per `1%` inflicted damage

This should use mission report outcome plus percentage damage rather than flat destroyed-value only.

### Strategic Diplomatic phase-7 incoming coercion rule

Enemy coercion against us should increase hostility toward that enemy.

Current live extension:

- incoming plunder increases hostility when we are not losing
- incoming plunder decreases hostility when we are already losing

Enemy successful `BOMBARD` should apply:

- base hostility increase `+8`
- plus `0.5` hostility points per `1%` inflicted damage

Enemy successful `SIEGE` should apply per successful orbit turn:

- base hostility increase `+4`
- plus `0.5` hostility points per `1%` inflicted damage

Incoming enemy coercion should also:

- increase retaliation pressure

### Strategic Diplomatic phase-7 war-evaluation rule

War state should be evaluated in two windows:

- short-term `20` turns
- long-term `100` turns

Evaluation cadence:

- every `20` turns

Current live extension:

- the same cadence now persists `warAdvantageLevel` on `-2 .. +2`
- score-band mapping is:
  - `<= -60 -> -2`
  - `-59 .. -20 -> -1`
  - `-19 .. +19 -> 0`
  - `+20 .. +59 -> +1`
  - `>= +60 -> +2`

Combined war score:

- normalized `-100 .. +100`
- `60%` long-term weight
- `40%` short-term weight

Classification:

- `>= 20` winning
- `<= -20` losing
- otherwise balanced

### Strategic Diplomatic phase-7 losing-war response

If the combined war score says we are losing, apply:

- hostility decay `-10` per evaluation

Current live extension:

- hostility decay now also keys off `warAdvantageLevel`
- decay applies at `-1`
- stronger decay applies at `-2`

There should be no separate hard deescalation-block timer.

Instead:

- recent enemy `BOMBARD` / `SIEGE`
- should directly worsen the short-term `20`-turn score
- and raise retaliation pressure

### Strategic Diplomatic phase-7 deescalation rule

Deescalation should stay adjacent-only and prefer:

- `WAR -> NEUTRAL`
- then `NEUTRAL -> PEACE`

If coercion succeeds and hostility falls enough, the subsystem should:

- allow
- but not force
- `NEUTRAL` proposals

### Strategic Diplomatic phase-7 memory rule

This phase should keep a per-faction operational war-pressure ledger with fields such as:

- `lastSuccessfulBombardTurn`
- `lastSuccessfulSiegeTickTurn`
- `recentOutgoingCoercionPressure`
- `recentIncomingCoercionPressure`
- `lastWarEvaluationTurn`
- `shortWindowWarScore`
- `longWindowWarScore`
- `warAdvantageLevel`
- `currentWarExitPressure`

Outgoing coercion pressure should use a hybrid model:

- actual hostility swing
- plus inflicted damage percentage

## Strategic Diplomatic phase-8 follow-up

The next `Strategic Diplomatic` slice should be the **shared war awareness phase**.

### Strategic Diplomatic phase-8 outputs

This phase should add:

- diplomatic hostile-activity sharing
- human hostile-report copying
- bot-side shared hostile-intel summaries
- hostility updates from shared hostile activity
- military score modifiers from shared hostile activity

### Strategic Diplomatic phase-8 shared-event scope

This phase should share:

- battle reports
- bombardment reports
- siege reports

It should not add hostile attack-intent prediction yet.

### Strategic Diplomatic phase-8 relation scope

Automatic hostile-activity sharing should apply to:

- `ALLIED`
- `PEACE`

Sharing direction should be:

- two-way always

### Strategic Diplomatic phase-8 human-delivery rule

Human `ALLIED` / `PEACE` contacts should receive:

- copied hostile battle reports
- copied hostile bombardment / siege reports

### Strategic Diplomatic phase-8 bot-delivery rule

Bots should not receive raw copied inbox reports.

Instead they should receive:

- summarized shared hostile intel only

### Strategic Diplomatic phase-8 memory rule

This phase should add:

- per-faction hostile-event counters
- plus a per-planet hostile-event ledger

An operational shared hostile-event ledger should include fields such as:

- foreign attacker player id
- victim player id
- target coordinates
- event type: `BATTLE` / `BOMBARD` / `SIEGE`
- event turn
- `sharedFromPlayerId`
- severity estimate
- propagation marker / propagation turn

### Strategic Diplomatic phase-8 hostility rule

Shared hostile intel should affect diplomatic hostility immediately.

Its weight should depend on relation:

- direct self-hit = `100%`
- shared from `ALLIED` = `40%`
- shared from `PEACE` = `10%`

### Strategic Diplomatic phase-8 military-impact rule

Shared hostile intel should also affect military planning,
but only as score modifiers.

It should not:

- create new mission-legality rules
- unlock new diplomatic target classes

## Strategic Diplomatic phase-9 follow-up

The next `Strategic Diplomatic` slice should be the **allied-cooperation execution phase**.

### Strategic Diplomatic phase-9 outputs

This phase should add:

- outgoing support requests
- `ALLIANCE_DEPOT` usage
- better incoming-request acceptance
- request-driven cooperation instead of multi-front orchestration

### Strategic Diplomatic phase-9 request scope

This phase should outward:

- `PLANET_DEFENSE`
- `PLANET_REPAIR`
- `ATTACK_TARGET`
- `BOMBARD_TARGET`
- `SIEGE_TARGET`
- extreme-case `RESOURCE_SUPPORT`

### Strategic Diplomatic phase-9 recipient rule

Recipients should be:

- offensive requests: `ALLIED` only
- defensive / repair / resource requests: `ALLIED`, `PEACE`, and `NEUTRAL`

Answering non-offensive requests should:

- improve friendliness
- reduce hostility

### Strategic Diplomatic phase-9 trigger rules

`PLANET_DEFENSE` should trigger when:

- the planet suffered recent hostile attack
- there is no valid local guard fleet
- local defense is below estimated hostile pressure
- and the planet is an important strategic hub

`PLANET_REPAIR` should trigger when:

- total structural HP loss is greater than `35%`
- local repair capability cannot restore more than `15%` of missing HP within `5` turns
- and other own planets cannot deliver enough repair drones

Offensive support should trigger when:

- `ATTACK` / `BOMBARD` / `SIEGE` plans are blocked
- and current intel says enemy fleet / defenses are weak enough that allied help is worthwhile

`RESOURCE_SUPPORT` should trigger only for extreme shortages:

- the planet cannot afford current queue plus fuel baseline
- or near-zero deuterium / emergency resource state is reached

### Strategic Diplomatic phase-9 request cap

This phase should emit:

- max `1` outgoing support request total per turn

### Strategic Diplomatic phase-9 helper selection

For non-offensive requests, helper selection priority should be:

1. known capability
2. relation strength
3. distance

For offensive requests, helper selection priority should be:

1. known capability
2. distance
3. relation strength

### Strategic Diplomatic phase-9 alliance-depot rule

`ALLIANCE_DEPOT` should:

- improve support and maintenance attractiveness
- increase the chance that support requests are worth sending
- increase the chance that support requests are worth accepting

### Strategic Diplomatic phase-9 explicit non-goals

This phase should explicitly exclude:

- no multi-front global allocator now
- no synchronized ally war waves
- no ally-to-ally autonomous campaign planner

Add only a far-future TODO note that a **multi-front global allocator** may be considered later.

## Trace contract

V2 keeps dedicated traces for both shadow inspection and live Supervisor debugging.

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
    proposalKind: BotProposalKind;
    summary: string;
    expectedValue: number;
    urgency: number;
    risk: number;
    confidence: number;
    dedupeKey: string;
  }>;
  supervisorDecision: {
    acceptedProposalIds: string[];
    pendingProposalIds: string[];
    rejectedCount: number;
    mode: 'SHADOW' | 'LIVE';
    debug?: Record<string, unknown>;
  };
  executionOutcomes: BotExecutionOutcome[];
};
```

Trace goals:
- inspect snapshot quality
- inspect proposal volume
- inspect duplicate proposal patterns
- inspect whether the emitted primary/secondary requests and their goal metadata are mathematically coherent
- inspect Supervisor scoring, pending commitments, and execution failures

## Integration with Current Runtime

Current integration rules:
- `server/src/index.ts` calls `runBotTurnPhaseV2(...)` during end turn
- V1 `runBotTurnPhase(...)` is no longer part of the live end-turn flow
- V2 traces are exposed through the admin bot trace endpoint and `/game/bot-debug`
- if V2 live Supervisor execution fails, the bot skips/logs/traces that proposal instead of falling back to V1

Entry points:
- `runBotTurnPhaseV2(galaxy)` handles `DISABLED`, `SHADOW`, and `LIVE`
- `runBotTurnPhaseV2Shadow(galaxy)` remains as a compatibility helper for explicit shadow-only tests

## Historical Phase 0 Completion Criteria

The original shadow scaffold was complete when all of the following were true:

- V2 folder structure exists
- feature flags exist
- `BotWorldSnapshot` builds successfully for a bot turn
- `BotMemoryV2` loads and normalizes safely
- `Economic` subsystem emits structured proposals
- V2 traces are recorded and inspectable
- no live commands were executed by V2

## Weight Manager Phase 1

`Weight Manager` is the next planned V2 subsystem after the current `Strategic Diplomatic` scope.

It is advisory only:
- no proposal acceptance
- no execution
- no campaign orchestration
- no `Critical` weighting here

It acts as the main policy input layer before `Supervisor`, using:
- static personality base tables
- dynamic situation modifiers

There should not be a separate later "full global policy engine" beyond that model.

### Inputs

`Weight Manager` phase 1 should consume:
- bot personality
- world snapshot
- diplomacy status mix
- discovered farm status mix like `BREAK_NEED` / `RAID_READY`
- owned-planet maturity spread
- per-planet aggregate metrics

### Outputs

Phase 1 should output:
- global strategic subsystem weights in `0..100`
- per-planet local subsystem weights in `0..100`
- one mutually-exclusive global mode flag set
- per-planet mode/descriptor flags
- rationale/debug metadata

### Weighted subsystems

Global strategic weights:
- `strategicDevelopmentWeight`
- `strategicMilitaryWeight`
- `strategicDiplomaticWeight`

Per-planet local weights:
- `economicWeight`
- `defensiveWeight`
- `warfareWeight`

`Critical` remains out of scope for `Weight Manager` and should be handled separately later.

### Personality model

Phase 1 should use direct per-profile base tables first.

Expose axis/debug values for:
- `aggression`
- `industry`
- `diplomacy`
- `defences`
- `caution`
- `development`

TODO, far future:
- consider a hybrid model with trait-vector interpolation plus learned/tuned situational modifiers

### Global mode flags

Global mode flags should be mutually exclusive:
- `economicRecoveryMode`
- `warEmergencyMode`
- `expansionMode`
- `diplomaticCautionMode`
- `normalSituationMode`

`normalSituationMode` should be true only when no other mode is active.

### Planet aggregate metrics

Phase 1 should reuse these per-planet aggregates:
- `avg_industry`
- `avg_military`
- `avg_defence`
- `avg_development`

Definitions:
- `avg_military` = all combat-capable ships
- `avg_defence` = planetary defence units + bunker influence
- `avg_development` = all buildings not counted in industry/military/defence

It should also expose empire-wide best values:
- `highest_avg_industry`
- `highest_avg_military`
- `highest_avg_defence`
- `highest_avg_development`

### Planet maturity

Use a hard maturity gate:
- if `avg_industry <= 4` => `immaturePlanet`
- else => `maturePlanet`

Those two flags are mutually exclusive.

`immaturePlanet` should be focused almost purely on local economic growth and should not be treated as a capable military-production planet.

### Planet focus flags

Phase 1 should include:
- `industryFocused`
- `defenceFocused`
- `militaryFocused`
- `developmentFocused`

These focus flags should be mutually exclusive.
They should be chosen by the single biggest gap to the matching `highest_avg_xxx`.

Generic first-pass rule:
- a focus becomes eligible when `planet avg_xxx + 2 < highest_avg_xxx`

`industryFocused` special rule:
- only on `maturePlanet`
- when `avg_industry + 2 < highest_avg_industry`
- remove it while any active `WAR` exists

These focus flags are pressure signals only.
They should add weight toward the matching subsystem/role.
They should not hard-block all other behavior.

### Other planet flags

Phase 1 should also include:
- `industryHubPlanet`
- `damagedPlanet`
- `inDangerPlanet`
- `constantlyAttackedPlanet`
- `veryHeavilyAttackedPlanet`

Rules:
- `industryHubPlanet` when `maturePlanet` and `avg_industry + 1.5 >= highest_avg_industry`
- `damagedPlanet` when more than `25%` structural HP is missing
- `inDangerPlanet` when `avg_defence + 3 < highest_avg_defence` and the planet was already discovered by a player currently in `WAR`
- `constantlyAttackedPlanet` when at least `3` hostile attacks happened in the last `20` turns
- `veryHeavilyAttackedPlanet` when at least `3` hostile attacks happened in the last `20` turns and `damagedPlanet` is currently true

TODO, far future:
- track repeated fleet losses on one planet as a separate signal, mainly for `Strategic Diplomatic`, so the bot can avoid feeding more fleets there for some time

### Weight interpretation

`Weight Manager` outputs are advisory inputs for the later `Supervisor`.

The intended later combination is:
- proposal score * subsystem weight

But `Weight Manager` itself should not:
- accept proposals
- reject proposals
- answer requests
- execute commands

Only the future `Supervisor` / `Executor` layers should do that.

## Critical Phase 1

`Critical` is the next planned V2 subsystem after `Weight Manager`.

It is not a normal growth subsystem.
It is an emergency-only unblock subsystem.

Phase 1 scope:
- emergency detection
- unblock proposals
- no emergency mission proposals yet

It stays proposal-only:
- no proposal acceptance
- no execution
- no request answering

### Allowed proposal kinds

Phase 1 may emit:
- `BUILDING`
- `RESEARCH`
- `SHIPYARD`

Phase 1 should not emit:
- combat rescue missions
- emergency mission execution
- request-handling decisions

### Blocker families

Phase 1 should use explicit blocker-family tagging:
- `ENERGY_DEADLOCK`
- `STORAGE_DEADLOCK`
- `INDUSTRY_CHAIN_DEADLOCK`
- `LOGISTICS_DEADLOCK`
- `INTEL_DEADLOCK`

Fixed priority order:
- `ENERGY`
- `STORAGE`
- `INDUSTRY_CHAIN`
- `LOGISTICS`
- `INTEL`

Severity should be normalized to `0..100`.

### ENERGY_DEADLOCK

Trigger when:
- `energyGap > 0`
- and the recovery is not already:
  - in the building queue
  - or in visible subsystem proposals

### STORAGE_DEADLOCK

Treat storage deadlock per resource type.

Trigger when:
- blocked request resource cost `* 1.5` exceeds the current relevant storage capacity on that planet

Rules:
- use the single relevant storage for that resource type
- any one blocked resource is enough to trigger deadlock

### INDUSTRY_CHAIN_DEADLOCK

Core infrastructure set for phase 1:
- `ROBOTICS_FACTORY`
- `SHIPYARD`
- `RESEARCH_LAB`
- `NANITE_FACTORY`

Trigger when either:
- a blocked critical recovery path is missing required prerequisite chain
- or one of those core infrastructure pieces is lagging badly by `ETC`

Comparison rule:
- compare lagging core infrastructure against the average `ETC` of other industry buildings except storages

Use `ETC`, not `avg_industry`, for this deadlock family.

TODO, far future:
- later also consider all `3` mine types in deeper industry-chain reasoning

### LOGISTICS_DEADLOCK

This family is about missing cargo capacity, not one exact ship type.

Cargo-capacity ship families in scope:
- `TRANSPORTER`
- `MASS_HAULER`
- `CARGO_SUPPORT`

Trigger when:
- no inactive cargo ships are available anywhere
- while a critical logistics transfer is already needed/proposed

Critical logistics scope in phase 1:
- emergency resource transfer need
- emergency repair-drone transfer need

Repair-drone transfer note:
- repair drones should be treated as movable only via carriers / battleships / fleet carriers

### INTEL_DEADLOCK

Trigger when:
- no `SPY_PROBE` is available anywhere
- while strategic intel targets still need scan coverage

### Emergency REPAIR_DRONE production

Phase 1 may propose emergency `REPAIR_DRONE` production, but only:
- on safe mature planets
- when another planet is heavily damaged
- and there are no repair drones available to relocate

Safe mature planet means:
- `maturePlanet`
- not `inDangerPlanet`
- not `constantlyAttackedPlanet`

Heavy damage means:
- more than `35%` structural HP missing
- and local full repair would take more than `20` turns

### Blocker ledger

Phase 1 should persist an operational full blocker ledger.

Suggested fields:
- blocker key
- blocker family
- target planet coordinates or `null`
- firstSeenTurn
- lastSeenTurn
- severity
- timesEmitted
- lastProposalTurn
- resolvedTurn
- active

### Output caps

Phase 1 should emit:
- max `2` global Critical proposals
- plus max `1` per planet

## Critical Phase 2

Phase 2 extends `Critical` from pure deadlock detection into an emergency mission-response layer.

It is still proposal-only:
- no proposal acceptance
- no execution
- no request answering

Phase 2 should stay narrow.
It is not a general mission planner, not a general logistics planner, and not an intel subsystem.

### Phase 2 mission scope

Allowed emergency mission types:
- `REPAIR`
- `TRANSPORT`
- `ARMAMENT_DELIVERY`

Not in scope:
- `SPY`
- combat rescue missions
- offensive emergency strikes
- broad acceleration logistics

`INTEL_DEADLOCK` still remains relevant in phase 2, but only as production pressure for `SPY_PROBE` stock that other subsystems consume.
`Critical` phase 2 should not emit `SPY` mission proposals.

### Phase 2 allowed proposal kinds

Phase 2 may emit:
- `FLEET_MISSION`
- `SHIPYARD`

`SHIPYARD` remains the production fallback form.
Do not add a new `PRODUCTION_REQUEST` proposal kind for `Critical`.

When a valid owned emergency mission can be formed:
- emit the mission proposal

When the emergency exists but no valid owned mission can be formed:
- emit a `SHIPYARD` demand-only fallback
- use the current `SHIP_NEED` style in payload/debug metadata

### Phase 2 response roles

`REPAIR`:
- default emergency repair response
- use when a valid repair helper fleet already exists

`ARMAMENT_DELIVERY`:
- only for repair recovery when `REPAIR_DRONE`s and optionally resources must be moved first
- do not use it as a generic transport replacement

`TRANSPORT`:
- only for small emergency resource rescue on immature planets
- not for broad empire optimization

### Payload rules

Critical `TRANSPORT` should carry:
- resources only

Critical `ARMAMENT_DELIVERY` should carry:
- `REPAIR_DRONE`
- resources

Critical `ARMAMENT_DELIVERY` should not carry:
- bombs
- offensive payloads
- broad military logistics payloads

### Priority and caps

Priority order in phase 2:
- `REPAIR`
- `TRANSPORT`

`SPY` is not considered here.

Phase 2 keeps the same cap shape as phase 1:
- max `2` global Critical proposals
- plus max `1` per planet

It is allowed to emit one repair-side mission and one transport-side mission in the same turn, if:
- they target different planets
- both pass the cap and validity rules

### Phase 2 blocker-family handling

Keep the existing phase-1 blocker families:
- `ENERGY_DEADLOCK`
- `STORAGE_DEADLOCK`
- `INDUSTRY_CHAIN_DEADLOCK`
- `LOGISTICS_DEADLOCK`
- `INTEL_DEADLOCK`

Do not add a new top-level blocker family set in phase 2.

Instead, add mission-response subtype metadata such as:
- `REPAIR`
- `TRANSPORT`
- `ARMAMENT_DELIVERY`

This keeps ledger continuity while making emergency mission traces readable.

### Emergency TRANSPORT trigger

Critical `TRANSPORT` should trigger only when:
- the target is an immature planet
- the target is genuinely blocked on immediate recovery cost
- local recovery is not expected within `<= 5` turns

If the planet can recover locally within `<= 5` turns:
- do not use `Critical` transport

This emergency transport scope should stay small, roughly:
- up to about `2000` cargo capacity

Larger acceleration logistics should stay with other subsystems.

### Emergency REPAIR trigger

Critical `REPAIR` response should trigger only when:
- the target is an owned planet
- structural damage is more than `35%`
- local full recovery would take more than `20` turns
- the target is safe enough to justify committing repair help

### Safe target rule

The target should pass a hybrid safety test:
- not `inDangerPlanet`
- not `constantlyAttackedPlanet`
- and not under meaningful recent hostile pressure

### Valid emergency repair source

A valid owned repair source should be:
- a planet with a repair-capable fleet
- source structural damage below `10%`
- not under recent pressure

### Mission-selection rule

When both repair response paths are possible:
- prefer `REPAIR` whenever a valid helper already exists
- use `ARMAMENT_DELIVERY` only when repair recovery depends on moving `REPAIR_DRONE`s or resources first

### ETA caps

Mission-specific ETA caps should be:
- `REPAIR <= 8`
- `ARMAMENT_DELIVERY <= 5`
- `TRANSPORT <= 8`

Do not use one generic ETA cap for all Critical phase-2 missions.

### Utility-only planning rule

For phase 2, `Critical` should use a utility-only planner-side ship selection rule for emergency repair/logistics support.

This is a planner rule for `Critical`.
It does not require changing the broader shared legality of the mission types themselves.
