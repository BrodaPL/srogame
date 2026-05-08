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
