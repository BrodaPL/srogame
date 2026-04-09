# PROJECT_MAP.md

This file is the architecture-first project map for `srogame`.

Use it to answer:
- where a feature lives
- which files own a workflow
- what client/server/domain layers are involved
- where a structural change should be documented

Do not use this file for session history. Session history belongs in `AGENTS.md`.

## Maintenance Rule

Update this file after structural changes, especially when any of the following change:
- routes or top-level screens
- API endpoints or DTO shape families
- domain ownership boundaries
- new major feature modules
- major refactors that move responsibilities between files
- smoke-test entry points or core testing workflow

Usually do not update this file for:
- isolated bugfixes inside one existing module
- styling-only tweaks
- copy/text changes
- small validation changes that do not change architecture or ownership

## Document Roles

- `AGENTS.md`: session handoff, current behavior, working notes, recent history
- `PROJECT_MAP.md`: stable architecture map and "where to change" guide
- `BOT_LOGIC.md`: current bot-AI behavior, observed findings, and tuning notes
- `McpTesting.md`: project-specific Chrome MCP and browser-testing workflow
- `InGameTutorials.md`: tutorial-authoring and maintenance guide

## System Shape

High-level layers:

1. Angular shell and screens
2. Client services and local session/state
3. Shared domain model under `src/app/models`
4. Node/Express server reusing shared domain modules
5. Browser-based verification via smoke tests and browser automation

Core design choice:
- most game rules live in shared TypeScript domain modules under `src/app/models`
- the server imports and executes those domain modules directly
- the client mostly renders data, validates user intent, and calls API endpoints

## Entry Points

Frontend bootstrap:
- `src/main.ts`
- `src/app/app.config.ts`
- `src/app/app.routes.ts`

Main shell:
- `src/app/app.ts`
- `src/app/game/game.component.ts`
- `src/app/game/ui/top-menu/top-menu.component.ts`

Server bootstrap:
- `server/src/index.ts`
- `server/src/active-game-turn.ts`
- `server/src/game-save.ts`
- `server/src/game-commands/`
- `server/src/bots/`

Smoke runner:
- `scripts/run-smoke-tests.js`

## Frontend Route Map

Top-level routes:

- `/` -> `src/app/main-menu/`
- `/login` -> `src/app/auth/`
- `/setup` -> `src/app/setup/`
- `/load` -> `src/app/load-game/`
- `/multiplayer` -> `src/app/multiplayer/`
- `/help` -> `src/app/help-about/`
- `/encyclopedia/*` -> `src/app/encyclopedia-menu/`
- `/game/*` -> `src/app/game/`

Game child routes:

- `/game/galactic` -> `src/app/game/galactic-view/`
- `/game/imperium` -> `src/app/game/imperium-view/`
- `/game/star-system` -> `src/app/game/star-system-view/`
- `/game/planet` -> `src/app/game/planet-view/`
- `/game/reports` -> `src/app/game/reports-view/`
- `/game/mail` -> `src/app/game/mail-view/`
- `/game/diplomacy` -> `src/app/game/diplomacy-view/`
- `/game/researches` -> `src/app/game/researches-view/`
- `/game/production` -> `src/app/game/production-view/`
- `/game/buildings` -> `src/app/game/buildings-view/`
- `/game/bot-debug` -> `src/app/game/bot-debug-view/`
- `/game/defence` -> `src/app/game/defence-view/`
- `/game/operations` -> `src/app/game/operations-view/`
- `/game/mission-planner` -> `src/app/game/mission-planner-view/`

Shared game UI components:
- `src/app/game/ui/`
- `src/app/game/ui/top-menu/` owns the shared in-game navigation, including the local-admin `Bot AI` link

## Client State Ownership

Auth/session:
- `src/app/core/auth-api.service.ts`: auth HTTP calls
- `src/app/core/auth-state.service.ts`: current authenticated session signal
- `src/app/core/player-session.service.ts`: localStorage owner for `srogame:player`

Game snapshot/state:
- `src/app/core/game-api.service.ts`: game HTTP calls
- `src/app/core/game-state.service.ts`: in-memory `GalaxySnapshot` plus active turn-status owner on the client
- `src/app/models/game-api-types.ts`: shared `GalaxySetup` normalization, including count-based bot-profile setup validation/helpers

Tutorial state:
- `src/app/tutorial/tutorial.service.ts`: overlay control, auto-open rules, step preparation
- `src/app/tutorial/tutorial-content.ts`: per-view tutorial content
- `src/app/tutorial/tutorial-types.ts`: tutorial contracts and normalization helpers

Local persistence:
- `srogame:player` -> auth session + tutorial state + unread report/mail counts + pending incoming request count
- `srogame:setup` -> last game setup
- `server/data/auth.json` -> server auth accounts and sessions
- `server/data/saves/` -> managed save directory for server-side galaxy snapshots; autosaves use slugified galaxy-name + turn + timestamp filenames, rotate through 5 autosave slots, and the directory is capped at 100 files. `/load` and the multiplayer lobby both use this same save list.

## API Ownership Map

Auth endpoints:
- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/me`
- `/api/auth/logout`

Auth/session note:
- `server/src/index.ts` persists a manual `localAdmin` boolean on accounts/sessions through `server/data/auth.json`
- `localAdmin` is required for single-player start, direct save load, and multiplayer lobby host/control actions
- active-game turn advancement is no longer controller-only: in multiplayer-scale active games every human player must mark ready through `/api/game/end-turn`, while singleplayer still resolves immediately

Game lifecycle:
- `/api/game/start`
- `/api/game/saves`
- `/api/game/saves/:saveId/load`
- `/api/game/saves/:saveId`
- `/api/game/state`
- `/api/game/turn-status`
- `/api/game/end-turn`
- `/api/admin/bots`
- `/api/admin/bots/traces`
- `/api/admin/bots/:playerId/profile`
- `/api/admin/bots/:playerId/pause`
- `/api/admin/bots/:playerId/resume`
- `/api/admin/bots/:playerId/clear-memory`

Multiplayer lobby lifecycle:
- `/api/multiplayer/lobby`
- `/api/multiplayer/lobby/open`
- `/api/multiplayer/lobby/join`
- `/api/multiplayer/lobby/leave`
- `/api/multiplayer/lobby/ready`
- `/api/multiplayer/lobby/setup`
- `/api/multiplayer/lobby/load-save`
- `/api/multiplayer/lobby/new-game`
- `/api/multiplayer/lobby/assign-seat`
- `/api/multiplayer/lobby/start`

Lifecycle persistence note:
- `/api/game/start` writes the initial autosave snapshot through `server/src/game-save.ts`
- `/api/game/saves` lists all managed saves plus the active-runtime summary and admin-manageability state
- `/api/game/saves/:saveId/load` hydrates a selected save back into live runtime objects, replaces the active in-memory game, and rebuilds galaxy-presentation caches
- `/api/game/saves/:saveId` deletes a selected save file
- `/api/game/turn-status` is the lightweight active-game polling endpoint used by the Angular game shell to detect ready-state and turn-number changes without reloading the full game snapshot every poll
- `/api/game/end-turn` writes rotating autosaves into `server/data/saves/` when `GalaxySetup.autoSaveTurns` is greater than `0` and the configured cadence is reached
- `/api/multiplayer/lobby/load-save` binds a selected save from the shared save list into lobby state without mutating runtime
- `/api/multiplayer/lobby/start` either creates a new multiplayer galaxy from joined lobby members or hydrates the bound save, applies seat assignments, converts unresolved saved humans to `BOT`, and then replaces the active runtime game
- `/api/game/end-turn` now also runs the server-side bot planning phase before shared turn resolution; for active games with more than one human player it first records per-player readiness and resolves only after every human has clicked End Turn for that turn
- `/api/admin/bots*` exposes local-admin/controller-only bot inspection and live runtime controls for profile, pause/resume, and memory clearing

Galaxy and planet reads:
- `/api/game/client-galaxy`
- `/api/game/galaxy-presentation-data`
- `/api/game/client-star-system`
- `/api/game/client-planet`
- `/api/game/owned-planets`

Planet/system mutations:
- `/api/game/star-system-note`
- `/api/game/power-consumption`
- `/api/game/abandon-planet`
- `/api/game/sensor-phalanx/capabilities`
- `/api/game/sensor-phalanx/scan`
- `/api/game/trade-port/use-offer`

Queues and production:
- `/api/game/building-queue`
- `/api/game/building-queue/reorder`
- `/api/game/building-queue/cancel`
- `/api/game/shipyard-queue`
- `/api/game/shipyard-queue/reorder`
- `/api/game/shipyard-queue/cancel`
- `/api/game/technology-queue`

Queue command ownership note:
- `server/src/index.ts` owns auth/session checks, request parsing, and HTTP DTO responses for queue-start endpoints
- `server/src/game-commands/building-commands.ts` owns building-queue validation + mutation
- `server/src/game-commands/shipyard-commands.ts` owns shipyard-queue validation + mutation
- `server/src/game-commands/research-commands.ts` owns technology-queue validation + mutation
- `server/src/game-commands/command-helpers.ts` owns shared player/planet resolution plus queue/research requirement helpers
- `server/src/game-commands/command-result.ts` defines the shared internal command result/error shape used by those modules

Fleet operations:
- `/api/game/active-fleets`
- `/api/game/active-fleets/:fleetId/maintenance-options`
- `/api/game/active-fleets/:fleetId/maintenance-request`
- `/api/game/active-fleets/:fleetId/return`
- `/api/game/active-fleets/:fleetId/delay`
- `/api/admin/bots/traces`

Fleet command ownership note:
- `server/src/index.ts` owns auth/session checks, mission payload parsing, and HTTP response DTO shaping for fleet launch
- `server/src/game-commands/fleet-commands.ts` owns fleet-launch validation + mutation, including mission validation, cargo/fuel checks, and Jump Gate launch side effects
- `server/src/game-commands/maintenance-commands.ts` owns fleet-maintenance option validation, request creation, and auto-approved depot transfer side effects for maintenance requests
- `server/src/game-commands/jump-gate-request-commands.ts` owns Jump Gate mail-request approval/reject/cancel validation + mutation
- `server/src/game-commands/command-helpers.ts` now also owns shared fleet-launch helpers used by the command layer

Diplomacy command ownership note:
- `server/src/index.ts` owns auth/session checks, request parsing, and diplomacy view/mail DTO projection
- `server/src/game-commands/diplomacy-commands.ts` owns treaty-proposal create/accept/reject/cancel validation + mutation, diplomacy-contact visibility checks, human/bot proposal eligibility, and shared one-outgoing-per-turn / pending-pair enforcement
- `src/app/models/diplomacy/diplomatic-proposal-rules.ts` owns the shared treaty ladder used by both server and Angular UI (`NEUTRAL` / `WAR` -> `PEACE`, `PEACE` -> `ALLIED`)

Bot runtime ownership note:
- `server/src/index.ts` owns the end-turn hook and runs bot planning immediately before `resolvePhaseOneTurn(...)`
- `server/src/bots/bot-turn-runner.ts` owns current server-side bot turn planning and action application
- `server/src/bots/bot-profile.ts` owns fixed bot personality weights, military thresholds, and per-turn soft caps
- `server/src/bots/bot-diplomacy-awareness.ts` owns lightweight per-contact diplomacy context building for bot planning
- `server/src/bots/bot-diplomacy-planner.ts` owns outgoing bot `PEACE` / `ALLIED` proposal candidate generation plus proposal cooldown heuristics
- `server/src/bots/bot-diplomacy-resolver.ts` owns bot treaty-response heuristics for incoming `PEACE` / `ALLIED` proposals
- `server/src/bots/bot-admin.ts` owns controller-only runtime bot controls and paused-bot state
- `server/src/bots/bot-debug.ts` and `server/src/bots/bot-debug-store.ts` own the in-memory bot decision trace model and ring buffer used for controller-side AI inspection
- bot actions currently reuse the shared command layer in `server/src/game-commands/` for buildings, research, shipyard, spy, colonize, attack, transport, maintenance, recycle, repair, bombard, siege, guard, and move launches; self-owned move/transport/guard routes can now opt into Jump Gate travel when access is valid and the distance benefit is meaningful, orbiting self-owned fleets can request auto-approved Alliance Depot maintenance support, bots now resolve incoming allied/peace maintenance + Jump Gate requests plus incoming `PEACE` / `ALLIED` diplomacy proposals before normal action planning, can initiate one conservative outgoing `PEACE` / `ALLIED` proposal per turn using cooldown memory, owned planets can trigger conservative recycle/repair support launches, high-infrastructure hostile worlds can trigger bombard/siege plans instead of default raids, and current diplomacy status now feeds back into bot attack/spy/border-defense scoring

Reports and tutorials:
- `/api/game/reports`
- `/api/game/reports/read`
- `/api/game/reports/delete`
- `/api/game/mail`
- `/api/game/mail/messages/read`
- `/api/game/mail/messages/delete`
- `/api/game/mail/requests/delete`
- `/api/game/mail/jump-gate-requests/:requestId/approve`
- `/api/game/mail/jump-gate-requests/:requestId/reject`
- `/api/game/mail/jump-gate-requests/:requestId/cancel`
- `/api/game/mail/maintenance-requests/:requestId/approve`
- `/api/game/mail/maintenance-requests/:requestId/reject`
- `/api/game/mail/maintenance-requests/:requestId/cancel`
- `/api/game/mail/messages/send`
- `/api/game/tutorial-read`

Diplomacy and messages:
- `/api/game/diplomacy`
- `/api/game/diplomacy-view`
- `/api/game/diplomacy/proposals`
- `/api/game/diplomacy/proposals/:proposalId/accept`
- `/api/game/diplomacy/proposals/:proposalId/reject`
- `/api/game/diplomacy/proposals/:proposalId/cancel`

Primary API contracts:
- `src/app/models/game-api-types.ts`

## Domain Ownership Map

### Planets and galaxy

Primary files:
- `src/app/models/planets/planet.ts`
- `src/app/models/planets/solar-system.ts`
- `src/app/models/planets/galaxy.ts`
- `src/app/models/planets/galaxy-creator.ts`
- `src/app/models/planets/galaxy-presentation-data.ts`
- `src/app/models/planets/planet-abandonment.ts`
- `src/app/models/planets/planet-ownership.ts`

Owns:
- galaxy generation
- planet/system structure
- effective planetary parameter derivation and permanent terraformer size bonus handling
- abandonment and ownership transitions
- galaxy-view presentation data, including own-fleet route and presence summaries
- initial bot empire creation from `GalaxySetup.botsAmount`, including deterministic bot profile assignment from `GalaxySetup.botProfileCounts`

### Fleets, ships, and mission payload state

Primary files:
- `src/app/models/fleets/fleet.ts`
- `src/app/models/fleets/many-ships.ts`
- `src/app/models/fleets/ship.ts`
- `src/app/models/fleets/ship-instance.ts`
- `src/app/models/fleets/shipyard-queue-entry.ts`
- `src/app/models/jump-gates/jump-gate-capacity.ts`

Owns:
- fleet lifecycle state
- orbit stance state (`PASSIVE_HOLD`, `GUARDING`, mission-in-progress orbit)
- ship storage model
- carried bomb storage, bombardment-priority state, remaining siege fuel reserve, Jump Gate metadata, and maintenance-request metadata
- per-ship damaged hull state
- shipyard queue payload shape

### Bombardment

Primary files:
- `src/app/models/bombardment/building-bombardment.ts`
- `src/app/models/bombardment/bombardment-priority.ts`

Owns:
- `Bombard` / `Siege` bombardment target selection
- bombardment-priority catalog and labels
- fallback targeting behavior for bombardment weapons and carried planetary bombs
- bombardment-vs-defence/building damage application
- siege-only per-shot efficiency penalty inputs

### Sensor Phalanx

Primary files:
- `src/app/models/sensor-phalanx/sensor-phalanx.ts`
- `src/app/models/reports/sensor-phalanx-report.ts`
- `src/app/models/planets/planet.ts`
- `server/src/index.ts`

Owns:
- Sensor Phalanx range and scan-count math
- per-planet scan-usage and known-contact state
- passive incoming-fleet detection at turn start
- active target-planet scan API and DTOs
- minimal fleet-contact visibility payloads

### Missions

Primary files:
- `src/app/models/missions/fleet-mission-registry.ts`
- `src/app/models/missions/fleet-mission.ts`
- `src/app/models/missions/mission-effect-executor.ts`
- `src/app/models/missions/mission-context.ts`
- `src/app/models/missions/types/`
- `src/app/models/missions/encounters/`

Owns:
- mission rules
- mission validation and warnings
- launch behavior contracts
- target-arrival behavior dispatch
- encounter integration points
- player-facing mission set such as `Attack`, `Move`, `Guard`, `Bombard`, `Siege`, `Repair`, and `Recycle`
- optional Jump Gate launch mode for `Move`, `Guard`, and `Transport`, including one-turn approved travel

### Requests and mail actions

Primary files:
- `src/app/models/requests/jump-gate-request.ts`
- `src/app/models/requests/maintenance-request.ts`
- `src/app/game/mail-view/`
- `server/src/index.ts`

Owns:
- Mail request DTO projection
- diplomacy proposal actions in Mail
- Jump Gate approval/reject/cancel flow
- Alliance Depot maintenance request flow

### Trade and local exchange

Primary files:
- `src/app/models/trade/trade-port-capacity.ts`
- `src/app/models/trade/trade-port-offer.ts`
- `src/app/models/trade/trade-port-offers.ts`
- `src/app/game/planet-view/`
- `server/src/index.ts`

Owns:
- Interstellar Trade Port capacity math
- per-planet per-turn offer generation and refresh rules
- resource valuation and offer price math
- local offer-use validation and planet-resource mutation flow
- Trade Port popup projection in Planet View

### Turns and resolution

Primary files:
- `src/app/models/turns/phase-one-turn-resolver.ts`
- `src/app/models/turns/tests/`

Owns:
- end-turn progression
- mission arrival resolution
- orbit processing
- orbit downgrade/parking rules after diplomacy or failed return conditions
- queue progress
- repair pass
- battle/debris/recycling integration
- post-battle `Attack` plunder resolution and bunker-reduced loot distribution

### Battles, bombardment, recycling, repairs

Primary files:
- `src/app/models/battles/space-battle-resolver.ts`
- `src/app/models/bombardment/`
- `src/app/models/recycling/`
- `src/app/models/repairs/`

Owns:
- ship combat resolution
- bombard/siege side effects
- debris collection logic
- repair capability and repair flow helpers

### Diplomacy

Primary files:
- `src/app/models/diplomacy/diplomatic-status.ts`
- `src/app/models/diplomacy/diplomatic-relation.ts`
- `src/app/models/diplomacy/diplomacy-resolver.ts`
- `src/app/models/diplomacy/diplomatic-proposal.ts`
- `src/app/models/diplomacy/diplomatic-proposal-state.ts`
- `src/app/models/diplomacy/diplomatic-proposal-rules.ts`

Owns:
- diplomatic relation rules
- proposal lifecycle
- friendly/hostile mission resolution context
- contact/discovery semantics used by diplomacy UI

### Reports

Primary files:
- `src/app/models/reports/`
- `src/app/generators/espionage-report-generator.ts`

Owns:
- informational/data report model hierarchy
- espionage report content
- report serialization boundaries

### Mail

Primary files:
- `src/app/models/mail/`
- `src/app/models/requests/maintenance-request.ts`
- `src/app/game/mail-view/`
- `src/app/game/ui/message-compose-dialog/`

Owns:
- player-to-player message model hierarchy
- mixed mail request projection from diplomacy proposals and maintenance requests
- reusable compose/reply popup
- mail attention counts used by top menu and end-turn lock

### Logistics requests

Primary files:
- `src/app/models/requests/maintenance-request.ts`
- `src/app/game/operations-view/`
- `server/src/index.ts`

Owns:
- `ALLIANCE_DEPOT` maintenance request domain model
- request creation, approval, rejection, cancellation, expiry, and auto-cancel rules
- orbit-fleet maintenance availability metadata
- depot transfer rules for fuel, `PLANETARY_BOMB`s, and `HullClass.SMALL` ships

### Queues

Primary files:
- `src/app/models/queues/queue-management.ts`
- `src/app/models/buildings/building-queue-entry.ts`
- `src/app/models/fleets/shipyard-queue-entry.ts`
- `src/app/models/tech/technology-queue-entry.ts`

Owns:
- reorder/cancel helper logic
- refund logic
- queue entry movement rules

### Technology and blueprints

Primary files:
- `src/app/models/tech/`
- `src/app/models/tech/technology-effects.ts`
- `src/app/blueprints/`
- `src/app/factories/*blueprints.factory.ts`

Owns:
- tech state and requirements
- derived tech effects
- blueprint hydration from JSON

## Server Ownership

Main server file:
- `server/src/index.ts`

Server responsibilities:
- auth/session persistence in `server/data/auth.json`
- current in-memory galaxy owner
- single-save persistence and hydration through `server/src/game-save.ts`
- API validation and DTO translation
- invoking shared domain rules
- snapshot and report serialization
- orchestrating server-side bot planning during end turn through `server/src/bots/`

Important constraint:
- the server is large and central, but many rules should still stay in shared domain modules under `src/app/models`
- prefer pushing reusable game logic out of `server/src/index.ts` when a rule becomes complex

## Testing and Verification Map

Unit/spec focus:
- domain tests live mostly under `src/app/models/**/tests`

Browser smoke entry point:
- `scripts/run-smoke-tests.js`

Smoke scenario definitions:
- `src/app/models/testing/smoke-test-scenarios.ts`

Bot benchmark scenario definitions:
- `src/app/models/testing/bot-benchmark-scenarios.ts`
- `server/src/bots/bot-benchmark-scenarios.spec.ts`

Advisory benchmark runner:
- `scripts/run-bot-benchmarks.ts`
- writes `tmp/bot-benchmark-results.json`

Advisory bot smoke runner:
- `scripts/run-bot-smoke-tests.js`
- writes `tmp/bot-smoke-results.json`
- runs a live local-admin single-player bot game for 10 turns, clears mail/request blockers, then checks `/game/operations`, `/game/mail`, `/game/diplomacy`, and `/game/bot-debug`

Local Chrome MCP route smoke runner:
- `scripts/run-mcp-smoke-tests.js`
- package entry: `npm.cmd run mcp:smoke`
- writes `tmp/mcp-route-smoke/result.json`
- drives Chrome through `chrome-devtools-mcp`, injects a deterministic `routeSmoke` session, and verifies main menu, Planet View, Mission Planner, Operations, and Reports

Advisory bot simulation runner:
- `scripts/run-bot-simulations.ts`
- writes `tmp/bot-simulation-results.json`
- runs standalone 20/50/100-turn all-bot simulations using `GalaxyCreator`, `runBotTurnPhase(...)`, and `resolvePhaseOneTurn(...)`
- includes `baselineMixed`, `frontierPressure`, and `warHotspot` presets
- `warHotspot` additionally occupies the remaining map, seeds mutual full-strength espionage intel, and sets contender pairs to explicit `WAR` so advisory runs can surface attack behavior instead of only growth/logistics
- output now includes per-run `profileSummary` plus top-level `overallProfileSummary` aggregates for profile-level tuning
- supports `--profiles=AGGRESSOR,TURTLE` and `--compare=AGGRESSOR,TURTLE` for targeted comparison runs

Advisory simulation baseline compare:
- `scripts/run-bot-sim-baselines.ts`
- `scripts/bot-simulation-baselines.json`
- writes `tmp/bot-simulation-baseline-results.json`
- replays checked-in targeted `warHotspot` profile comparisons against broad advisory tolerances so tuning drift can be reviewed without failing the workflow

Notable smoke coverage:
- `guardOrbitStatus` seeds one `Guarding Orbit` fleet and one `Passive Orbit` fleet so the Operations/UI and orbit-state serialization stay visible in browser verification
- no dedicated maintenance-request smoke scenario yet; current maintenance coverage is TypeScript build + shared resolver/spec suites only

Browser/MCP workflow:
- `McpTesting.md`

Tutorial maintenance:
- `InGameTutorials.md`

## Where To Change

Add or change a game route:
- `src/app/app.routes.ts`
- target component under `src/app/game/` or another top-level feature folder
- possibly top menu/navigation UI under `src/app/game/ui/`

Change mission rules or add a mission:
- `src/app/models/missions/types/`
- `src/app/models/missions/fleet-mission-registry.ts`
- `src/app/blueprints/mission-blueprints.json`
- `src/app/models/missions/mission-effect-executor.ts`
- `src/app/models/missions/encounters/` for orbit participation and coalition behavior
- `src/app/models/bombardment/` for `Bombard` / `Siege` targeting logic and priority categories
- `src/app/models/jump-gates/jump-gate-capacity.ts` for Jump Gate capacity math
- `src/app/models/turns/phase-one-turn-resolver.ts` for post-battle `Attack` plunder, bunker reduction, and return behavior
- `src/app/models/planets/planet.ts` or `src/app/blueprints/building-blueprints.json` if bunker/plunder formulas change
- `src/app/game/mission-planner-view/`
- `src/app/game/operations-view/`
- `server/src/index.ts` for launch endpoint validation if needed

Change maintenance-request / `ALLIANCE_DEPOT` logistics:
- `src/app/models/requests/maintenance-request.ts`
- `src/app/models/game-api-types.ts`
- `src/app/core/game-api.service.ts`
- `src/app/game/operations-view/`
- `src/app/game/mail-view/`
- `server/src/index.ts`
- `src/app/models/planets/planet.ts` if depot cap formulas change

Change Trade Port offers and local exchange flow:
- `src/app/models/trade/trade-port-capacity.ts`
- `src/app/models/trade/trade-port-offer.ts`
- `src/app/models/trade/trade-port-offers.ts`
- `src/app/models/planets/planet.ts`
- `src/app/models/game-api-types.ts`
- `src/app/core/game-api.service.ts`
- `src/app/game/planet-view/`
- `server/src/index.ts`
- `src/app/encyclopedia-menu/encyclopedia-mechanics.component.ts`

Change Jump Gate travel and approval flow:
- `src/app/models/requests/jump-gate-request.ts`
- `src/app/models/jump-gates/jump-gate-capacity.ts`
- `src/app/models/fleets/fleet.ts`
- `src/app/models/game-api-types.ts`
- `src/app/core/game-api.service.ts`
- `src/app/game/mission-planner-view/`
- `src/app/game/mail-view/`
- `src/app/game/operations-view/`
- `server/src/index.ts`
- `src/app/models/planets/planet.ts` if endpoint capacity math changes

Change turn resolution:
- `src/app/models/turns/phase-one-turn-resolver.ts`
- supporting helpers in `battles/`, `repairs/`, `recycling/`, `missions/encounters/`
- tests in `src/app/models/turns/tests/`

Change battles:
- `src/app/models/battles/space-battle-resolver.ts`
- `src/app/models/turns/phase-one-turn-resolver.ts`
- `src/app/models/battles/tests/space-battle-resolver.spec.ts`

Change diplomacy behavior:
- `src/app/models/diplomacy/`
- `src/app/game/diplomacy-view/`
- `src/app/core/game-api.service.ts`
- `server/src/index.ts`

Change reports/inbox behavior:
- `src/app/models/reports/`
- `src/app/generators/espionage-report-generator.ts`
- `src/app/game/reports-view/`
- `server/src/index.ts`

Change mail/messages/request inbox behavior:
- `src/app/models/mail/`
- `src/app/game/mail-view/`
- `src/app/game/ui/message-compose-dialog/`
- `src/app/game/ui/top-menu/`
- `src/app/core/game-api.service.ts`
- `server/src/index.ts`

Change tutorials:
- `src/app/tutorial/tutorial-content.ts`
- `src/app/tutorial/tutorial.service.ts`
- target view template for `data-tutorial-id` anchors
- target view component if step preparation is needed
- `InGameTutorials.md`

Change smoke/browser verification:
- `scripts/run-smoke-tests.js`
- `scripts/run-mcp-smoke-tests.js`
- `scripts/run-bot-benchmarks.ts`
- `scripts/run-bot-smoke-tests.js`
- `scripts/run-bot-simulations.ts`
- `scripts/run-bot-sim-baselines.ts`
- `scripts/bot-simulation-baselines.json`
- `src/app/models/testing/smoke-test-scenarios.ts`
- `src/app/models/testing/bot-benchmark-scenarios.ts`
- `server/src/bots/bot-benchmark-scenarios.spec.ts`
- `McpTesting.md` if the workflow itself changes

Change auth/session behavior:
- `src/app/core/auth-api.service.ts`
- `src/app/core/auth-state.service.ts`
- `src/app/core/player-session.service.ts`
- `server/src/index.ts`

Change setup/start-game flow:
- `src/app/setup/`
- `src/app/load-game/`
- `src/app/models/game-api-types.ts`
- `server/src/game-save.ts`
- `server/src/index.ts`
- `src/app/models/planets/galaxy-creator.ts`
- `server/src/multiplayer-lobby.ts` if saved-human seat conversion or bot defaults change

Change bot AI:
- `server/src/bots/bot-turn-runner.ts`
- `server/src/bots/bot-profile.ts`
- `server/src/bots/bot-diplomacy-awareness.ts`
- `server/src/bots/bot-diplomacy-planner.ts`
- `server/src/bots/bot-diplomacy-resolver.ts`
- `server/src/bots/bot-debug.ts`
- `server/src/bots/bot-debug-store.ts`
- `server/src/game-commands/` when bot actions need new shared validation/mutation paths
- `server/src/index.ts` for end-turn orchestration
- `src/app/models/player.ts` and `server/src/game-save.ts` for bot profile/memory persistence
- `src/app/models/planets/galaxy-creator.ts` and `server/src/multiplayer-lobby.ts` for starting-bot and converted-bot assignment rules

## Danger Zones

These are common cross-cutting areas where one change usually affects multiple files.

Mission changes:
- often touch UI validation, DTOs, server launch validation, mission registry, mission blueprints, encounter rules, turn resolver, Operations labels, and browser smoke tests

Orbit-behavior changes:
- usually touch `src/app/models/fleets/fleet.ts`, `src/app/models/missions/encounters/encounter-resolver.ts`, `src/app/models/turns/phase-one-turn-resolver.ts`, `src/app/game/operations-view/`, and at least one smoke scenario

Fleet/ship storage changes:
- often touch `ManyShips`, mission planner, operations, reports, battle resolution, serialization, and server launch/removal logic

Turn-resolution changes:
- often touch battles, mission effects, repairs, recycling, reports, and end-turn browser scenarios

Diplomacy changes:
- often touch mission legality, encounter behavior, reports/messages, diplomacy UI, and server serialization

Tutorial changes:
- often touch tutorial content, overlay layout, target anchors in templates, and sometimes view preload/auto-selection logic

DTO changes:
- almost always require matching edits in:
  - `src/app/models/game-api-types.ts`
  - `src/app/core/game-api.service.ts`
  - `server/src/index.ts`
  - affected client mappers/components

Smoke-test changes:
- can be caused by visible text changes, tutorial overlays blocking clicks, route changes, or renamed UI sections

## Recommended Update Pattern

When structural work is completed:

1. Update `PROJECT_MAP.md` if ownership, routes, modules, or verification entry points changed.
2. Update `AGENTS.md` with the current behavior/session note if the user-facing behavior changed.
3. Update `McpTesting.md` only if browser/MCP workflow changed.
4. Update `InGameTutorials.md` only if tutorial authoring or overlay maintenance rules changed.

## Future Extension

If this map becomes too large, split it by stable concern:
- `PROJECT_MAP.md` for top-level architecture
- `PROJECT_TASK_GUIDE.md` for "where to change" workflows
- `PROJECT_API_MAP.md` for endpoint/DTO detail

Do not split until this file becomes hard to scan in one pass.
