# BOT_LOGIC.md

This file is the dedicated reference for current bot-AI behavior, observed test findings, and tuning notes.

Use it for:
- current bot decision scope
- profile-level behavior expectations
- diplomacy and logistics heuristics
- what the current test stack is actually showing
- known gaps and likely tuning targets

Do not use this file for architecture ownership details. Those stay in `PROJECT_MAP.md`.
Do not use this file for full session chronology. That stays in `AGENTS.md`.

## Current Bot Scope

The current server-side bot runtime covers:
- economy spending
- shipyard / research planning
- `Spy`
- `Colonize`
- conservative `Attack`
- `Transport`
- `Move`
- `Guard`
- `Recycle`
- `Repair`
- `Bombard`
- `Siege`
- self-owned Jump Gate logistics for selected logistics missions
- maintenance request creation
- incoming maintenance / Jump Gate / support request resolution
- outgoing support request creation
- incoming diplomacy proposal resolution
- conservative outgoing diplomacy proposal creation

The main runtime lives in:
- `server/src/bots/bot-turn-runner.ts`

Bot AI V2 note:
- `server/src/bots-v2/` is still shadow-only and does not execute live commands
- its current implemented subsystems are `Economic`, `Defensive`, `Warfare`, `Strategic Development`, and `Strategic Military`
- the current Economic shadow planner is local-per-planet, branch-first (`ENERGY` / `STORAGE` / `ECONOMY`), expands building + strict prerequisite-research chains, uses narrow throughput-only `ETC` with stepwise throughput re-simulation, deduplicates shared immediate requests, and emits per-planet goal/no-action metadata for later supervisory work
- the current Defensive shadow planner is also local-per-planet, mixes `UNLOCK` / `BUILDING` / `PRODUCTION` goals, uses `avg_industry`, bunker-vs-defense value balance, local shipyard throughput, and explicit selection modes (`STRUCTURAL_ONLY`, `STRUCTURE_AND_PRODUCTION`, `PRODUCTION_ONLY`), and emits the same primary/secondary goal-request contract as Economic
- the current Warfare shadow planner is also local-per-planet, mixes `CAPACITY` / `UNLOCK` / `PRODUCTION` goals, uses `avg_industry` for unlock and shipyard/nanite targets, ranks by `weightedEtc = totalEtc / bonusFactor`, emits up to five visible requests per planet with category-aware structural/cargo shaping, and currently scopes ship production to combat ships plus `TRANSPORTER` / `MASS_HAULER` / `CARGO_SUPPORT`
- the current Strategic Development shadow planner now has a split local/global shape: it still emits separate per-planet building-side and production-side requests for `INTERSTELLAR_TRADE_PORT` / `JUMP_GATE` / `RESEARCH_LAB` / `SENSOR_PHALANX` plus `COLONIZER` / transport / `REPAIR_DRONE` readiness stock, and it now also emits separate global `FLEET_MISSION` proposals for `TRANSPORT`, `ARMAMENT_DELIVERY`, colonization-intel `SPY`, and one executable `COLONIZE` request when a fresh scanned target, free colony slot, and ready colonizer source all exist
- the current Strategic Military shadow planner is global and mission-focused: it scans the whole galaxy for neutral-vs-not-neutral classification, keeps persistent neutral-farm ledgers in `BotMemoryV2`, uses only report/battle/plunder-derived farm facts plus remembered regrowth estimates instead of hidden live neutral state, emits immediate `SPY` / `BREAK` / `PLUNDER` mission proposals using existing fleets from the best single origin, and emits exact-ship-type `SHIP_NEED` demand proposals when the current farm plan is blocked by missing bombardment, combat, or cargo capacity

Supporting bot modules:
- `server/src/bots/bot-profile.ts`
- `server/src/bots/bot-diplomacy-awareness.ts`
- `server/src/bots/bot-diplomacy-resolver.ts`
- `server/src/bots/bot-diplomacy-planner.ts`
- `server/src/bots/bot-debug.ts`
- `server/src/bots/bot-debug-store.ts`
- `server/src/bots/bot-admin.ts`

## Runtime Model

Bot turns run before shared phase-one resolution.

Current high-level order:
1. resolve incoming support requests
2. resolve incoming diplomacy proposals
3. optionally create one outgoing diplomacy proposal
4. optionally create one outgoing support request
5. plan and launch bot actions through shared server commands
6. hand off to shared turn resolution

Support-request notes:
- bots keep directional goodwill toward other players in `botMemory`
- goodwill is updated from observed support-request outcomes
- outgoing support asks are capped to 1 per turn and 2 unresolved total
- repeat asks to the same player for the same support type / target planet use a 3-turn cooldown
- accepted `PLANET_REPAIR` now expects a real `Repair` helper launch, not acknowledge-only state
- accepted `PLANET_DEFENSE` now expects a real `Guard` helper launch, not acknowledge-only state
- offensive support acceptance now assumes a 5-turn launch window, matching the runtime support-request expiry

Bots do not use separate engine-only cheats for combat. The current explicit bot edge is:
- `botDifficulty` economy scaling
- bot income scaling
- bot industry / shipyard / research throughput scaling

Combat itself still uses the same domain rules as everyone else.

## Diplomacy Model

Current relation model:
- `SELF`
- `ALLIED`
- `PEACE`
- `NEUTRAL`
- `PASSIVE`
- `WAR`

Meaning:
- `NEUTRAL` is the default no-treaty baseline
- `WAR` is now explicit hostility, not the fallback absence of a treaty
- `PEACE` is an actual hard anti-attack state
- `PASSIVE` remains a special attackable state

Current treaty ladder:
- `NEUTRAL -> PEACE`
- `WAR -> PEACE`
- `PEACE -> ALLIED`

Not allowed:
- direct `NEUTRAL -> ALLIED`
- direct `WAR -> ALLIED`
- player-facing `PASSIVE` treaty proposals

Combat legality summary:
- `Attack`: `WAR`, `NEUTRAL`, `PASSIVE`
- `Bombard`: `WAR` only
- `Siege`: `WAR` only
- `Attack` on `PEACE` or `ALLIED`: invalid

Cooperative mission summary:
- `Move` / `Guard` / `Transport`: `SELF`, `ALLIED`, `PEACE`
- not legal on `NEUTRAL`

Important rule:
- hostile action does not automatically convert a relation to `WAR`
- recent conflict is therefore separate from formal relation

## Profile Expectations

These are the intended personality directions, not strict guarantees.

### `AGGRESSOR`
- strongest offensive pressure
- lower peace / alliance appetite
- better expansion in hostile scenarios than most other profiles
- should not become the most diplomatic profile

### `BALANCED`
- generalist baseline
- should be easier to tune against than specialist profiles
- should not dominate every preset

### `TURTLE`
- stronger border stabilization and movement toward defense
- should prefer safer posture and more defensive logistics
- should not out-expand `AGGRESSOR` in war-heavy presets

### `MINER`
- stronger growth / stabilization bias
- should care more about peace and economic safety
- should not become a stealth-aggressor through emergent thresholds

### `AVOIDER`
- strongest peace acceptance under threat
- should back away from marginal fights sooner

### `BUNKERER`
- defensive / infrastructure-leaning behavior
- should accept stabilizing peace more readily than `AGGRESSOR`

## Current Testing Stack

### T1: Deterministic Regression Scenarios

Files:
- `src/app/models/testing/bot-benchmark-scenarios.ts`
- `server/src/bots/bot-benchmark-scenarios.spec.ts`

Current role:
- hard deterministic regression checks
- exact expected bot outcomes in curated scenarios

Current seeded behaviors include:
- economy bootstrap
- nearby colonization
- risky-attack rejection
- frontier reinforcement
- peace acceptance under pressure
- dominant-aggressor peace rejection
- peace proposal initiation under pressure
- alliance proposal initiation only from `PEACE`

### T2: Advisory Benchmark Runner

Command:
```powershell
npm.cmd run bot:bench
```

Files:
- `scripts/run-bot-benchmarks.ts`
- `tmp/bot-benchmark-results.json`

Current role:
- advisory-only summary of benchmark scenario outcomes
- no workflow failure on behavior drift yet

### T3: Advisory Live Browser Smoke

Command:
```powershell
npm.cmd run bot:smoke
```

Files:
- `scripts/run-bot-smoke-tests.js`
- `tmp/bot-smoke-results.json`

Current role:
- make sure a live local-admin bot game still starts and runs
- verify `/game/operations`, `/game/mail`, `/game/diplomacy`, and `/game/bot-debug`
- useful for route / DTO / integration failures

Current limitation:
- the default 10-turn live smoke can still be too passive to judge gameplay quality

### T4: Advisory Long-Run Simulations

Commands:
```powershell
npm.cmd run bot:sim
npm.cmd run bot:sim -- warHotspot --profiles=AGGRESSOR,TURTLE --compare=AGGRESSOR,TURTLE
npm.cmd run bot:sim:baseline
```

Files:
- `scripts/run-bot-simulations.ts`
- `scripts/run-bot-sim-baselines.ts`
- `scripts/bot-simulation-baselines.json`
- `tmp/bot-simulation-results.json`
- `tmp/bot-simulation-baseline-results.json`

Current presets:
- `baselineMixed`
- `frontierPressure`
- `warHotspot`

## Current Findings

### Overall Stability

Current overall state:
- the bot stack is functionally stable
- economy, logistics, diplomacy, and turn integration are working together
- no obvious catastrophic regressions are visible in the current benchmark set

### T1 Findings

Observed:
- the first deterministic benchmark set is green
- the bot can satisfy the currently seeded scenario expectations

Interpretation:
- core decision wiring is in place
- phase-1 and phase-2 diplomacy behavior are testable and reproducible at the scenario level

### T2 Findings

Observed:
- current advisory benchmark signals are all met
- no obvious single-turn planner regression is showing up in the current seeded benchmark set

Interpretation:
- the current benchmark seeds are useful sanity checks
- they are not yet broad enough to cover all mission types or all diplomacy edge cases

### T3 Findings

Observed:
- live bot-smoke runs are stable
- start-game, turn advancement, Mail, Diplomacy, Operations, and Bot Debug remain usable
- bot traces appear correctly in the UI and API

Important caveat:
- current live smoke runs are often too passive to be strong gameplay judges
- this layer is currently better at detecting integration breakage than at grading bot quality

### T4 Findings

#### `baselineMixed`

Observed:
- mostly economy and logistics behavior
- very little combat

Interpretation:
- good baseline for “are bots doing normal empire work”
- not useful as a combat-pressure tuning preset

#### `frontierPressure`

Observed:
- some diplomacy activity
- still limited combat

Interpretation:
- useful as a mild-pressure preset
- still not strong enough on its own to stress offensive behavior

#### `warHotspot`

Observed:
- repeatable attack activity
- heavy diplomacy traffic
- best current preset for profile differentiation under pressure

Interpretation:
- this is currently the most valuable simulation preset for tuning

## Profile-Level Observations From Current Runs

These are observations from the current advisory runs, not final balance truths.

### `AGGRESSOR`

Current observation:
- tends to own more planets in `warHotspot`
- expansion signal is stronger than some defensive/economic profiles

This is directionally correct.

### `TURTLE`

Current observation:
- can show more combat and diplomacy activity than expected in some `warHotspot` comparisons
- movement / repositioning can spike strongly

Interpretation:
- border-defense logic may be creating more military activity than the label “Turtle” suggests
- this profile should be watched during future tuning

### `MINER`

Current observation:
- the main current baseline drift appears in `warHotspotAggressorVsMiner`
- drift is especially visible in planet ownership comparisons

Interpretation:
- this is the clearest current tuning target
- `MINER` may need tighter differentiation from more expansion-capable profiles, or the baseline itself may need refresh after future tuning

## Baseline-Compare Findings

Current baseline compare layer is working and advisory-only.

Current broad result:
- most tracked metrics are within tolerance
- the main flagged drift in the latest run is:
  - `warHotspotAggressorVsMiner`
  - comparison `avgPlanetsOwned`

Important:
- this does not fail the workflow yet
- these numbers are intended for drift visibility, not hard CI gating

## Known Gaps

Current testing gaps:
- deterministic coverage for Jump Gate-specific bot choices is still too thin
- deterministic coverage for maintenance-request approval / creation could be deeper
- deterministic coverage for `Recycle` / `Repair` behavior is still narrower than core economy / colonize / diplomacy coverage
- deterministic coverage for `Bombard` / `Siege` gating should be extended
- deterministic coverage for `PEACE` attack invalidation vs `NEUTRAL` attack allowance should be expanded further
- live smoke scenarios still need more forceful seeded combat / diplomacy situations

Current behavior gaps:
- some live runs are still too passive
- profile differentiation is visible, but not yet fully trustworthy
- diplomacy traffic in war-heavy presets can become surprisingly high

## Recommended Next Tuning Targets

In priority order:
1. expand deterministic T1 coverage for missing mission families and diplomacy legality edges
2. strengthen T3 live-smoke presets so they guarantee combat and diplomacy activity
3. tune `MINER` and `TURTLE` behavior against `warHotspot`
4. later decide which advisory metrics should graduate into hard regression gates

## Working Commands

Deterministic regression:
```powershell
npx.cmd vitest run server/src/bots/bot-benchmark-scenarios.spec.ts
```

Advisory benchmark:
```powershell
npm.cmd run bot:bench
```

Live browser smoke:
```powershell
npm.cmd run bot:smoke
```

Long-run simulations:
```powershell
npm.cmd run bot:sim
```

Targeted comparison example:
```powershell
npm.cmd run bot:sim -- warHotspot --profiles=AGGRESSOR,TURTLE --compare=AGGRESSOR,TURTLE
```

Baseline compare:
```powershell
npm.cmd run bot:sim:baseline
```
