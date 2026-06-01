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
- `NEW_BOT_AI_DESIGN.md`: Bot AI V2 architecture, behavior design, and current design notes
- `BOT_AI_V2_PHASE0_SPEC.md`: Bot AI V2 implementation-facing runtime/spec reference
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
- `server/src/game-registry.ts`
- `server/src/game-membership.ts`
- `server/src/game-runtime-store.ts`
- `server/src/multiplayer-lobby-store.ts`
- `server/src/multiplayer-presence.ts`
- `server/src/auth-account-security.ts`
- `server/src/auth-rate-limit.ts`
- `server/src/turnstile.ts`
- `server/src/game-commands/`
- `server/src/bots-v2/`
- `server/src/bots/` for shared profile/admin helpers and legacy V1 files that are no longer in the active turn runtime

Smoke runner:
- `scripts/run-smoke-tests.js`

## Frontend Route Map

Top-level routes:

- `/` -> `src/app/main-menu/`
- `/login` -> `src/app/auth/`
- `/settings` -> `src/app/settings/`
- `/setup` -> `src/app/setup/`
- `/load` -> `src/app/load-game/`
- `/multiplayer` -> `src/app/multiplayer/`
- `/help` -> `src/app/help-about/`
- `/encyclopedia/*` -> `src/app/encyclopedia-menu/`
- `/game/*` -> `src/app/game/`

Main menu note:
- `src/app/main-menu/` now reads `/api/games/current`, shows a primary `Resume current game` action plus a compact current-game status card, and uses `/api/games/:gameId/select` before entering the game shell
- `src/app/main-menu/` no longer tries to act as a general game browser; lobby selection stays in `/multiplayer`, and broader save browsing stays in `/load`
- `src/app/main-menu/` now also offers a direct `Open Multiplayer` handoff when the current selected game is a saved/inactive multiplayer game that cannot be resumed directly
- `src/app/main-menu/` now also offers `Close current game` for resumable loaded single-player current games; that action calls `/api/games/:gameId/close-current`, auto-saves, unloads the runtime, and clears the current-game pointer
- `src/app/main-menu/` now also links authenticated players to `/settings`
- `src/app/main-menu/` is now the phase-1 runtime localization pilot and consumes the shared `src/app/i18n/` service/pipe plus feature-scoped translation files for all frontend-owned text on that screen

Settings route note:
- `src/app/settings/` now owns the live phase-1 language selector and writes the chosen `en` / `pl` preference back through `/api/account/settings/preferences`
- `src/app/settings/` now also consumes the shared `src/app/i18n/` runtime localization layer and the public flag assets under `public/images/icons/`

Load route note:
- `src/app/load-game/` still owns explicit save browsing and reopen flows
- `/load` now consumes grouped save metadata from `/api/game/saves`, surfaces a `Recommended Reopen` card for the last closed single-player game when possible, and keeps current/selected game saves first without moving that browser back onto `/`

Multiplayer route note:
- `src/app/multiplayer/` now uses the per-game `/api/multiplayer/games*` family and renders a browser/detail layout with four sections: `Active Draft Lobbies`, `Active Running Games`, collapsed `Other Multiplayer Games`, and collapsed `Archived Multiplayer Games`
  - `Other Multiplayer Games` is where stale drafts and unloaded running games (`Saved / Inactive`) now appear
  - `Archived Multiplayer Games` is split out so history does not clutter the normal recovery flow
  - the selected draft detail panel owns join/leave/ready state, host setup/save/seat/start controls, and uses the shared save list only for save binding while the old singleton lobby UI is being phased out
  - resumed lobbies now get a clearer locked-snapshot callout, and the selected running-game detail now also exposes `Leave current game` for the current account

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

Researches route note:
- `src/app/game/researches-view/` owns both technology start flow and active helper-lab reassignment for queued research; the technology cards remain the start surface, while the queued-technologies table now owns live helper assignment with a fixed main lab

Shared game UI components:
- `src/app/game/ui/`
- `src/app/game/ui/top-menu/` owns the shared in-game navigation, including the local-admin `Bot AI` link
- `src/app/game/game.component.ts` also owns client-side multiplayer AFK detection, presence heartbeats, and the auto-skip return notice overlay

## Client State Ownership

Auth/session:
- `src/app/core/auth-api.service.ts`: auth HTTP calls
- `src/app/core/auth-state.service.ts`: current authenticated session signal and current-game synchronization into client game state
- `src/app/core/player-session.service.ts`: localStorage owner for `srogame:player`, including persisted `currentGameId` and the current session language

Localization:
- `src/app/i18n/i18n.service.ts`: runtime translation lookup, active-language signal, interpolation, and locale-aware date formatting for migrated views
- `src/app/i18n/i18n.pipe.ts`: template translation pipe for standalone components
- `src/app/i18n/language-preference.service.ts`: guest/local fallback persistence under `srogame:language`
- `src/app/i18n/locales/`: feature-scoped TypeScript translation modules (`common`, `main-menu`, `settings`) aggregated per language
- `src/app/i18n/api-message.utils.ts`: client bridge that resolves server `errorKey` / `messageKey` metadata through the runtime i18n layer with raw-message fallback during the Phase 2 migration
- `src/app/game/ui/top-menu/top-menu.component.ts`: consumes keyed `TurnStatusResponse.progressionBlockedReason*` metadata and keyed end-turn / auto-skip API errors
- `server/src/game-commands/command-result.ts` + `server/src/index.ts::sendGameCommandError(...)`: shared command-error transport point; common `GameCommandError.message` values are now mapped to `api.commands.*` localization keys before hitting the client

Game snapshot/state:
- `src/app/core/game-api.service.ts`: game HTTP calls; now includes the first game-registry/current-game endpoints and supports optional explicit `gameId` for state/turn/save/end-turn calls
- `src/app/core/game-api.service.ts` also now exposes the full per-game multiplayer browser/draft management endpoints under `/api/multiplayer/games*`
- `src/app/core/game-state.service.ts`: in-memory `GalaxySnapshot` plus active turn-status owner on the client, selected/current `gameId`, and an observable turn-status stream used by the game shell
- `src/app/models/game-api-types.ts`: shared `GalaxySetup` normalization, including count-based bot-profile setup validation/helpers

Load/save note:
- `src/app/load-game/` now scopes its save list to the selected/current `gameId` when one exists, instead of always showing one undifferentiated global save list

Tutorial state:
- `src/app/tutorial/tutorial.service.ts`: overlay control, auto-open rules, step preparation
- `src/app/tutorial/tutorial-content.ts`: per-view tutorial content
- `src/app/tutorial/tutorial-types.ts`: tutorial contracts and normalization helpers

Local persistence:
- `srogame:player` -> auth session + tutorial state + unread report/mail counts + pending incoming request count
- `srogame:language` -> last client-selected interface language used as the guest/local fallback
- `srogame:setup` -> last game setup
- `server/data/auth.json` -> server auth accounts and sessions, including per-account `currentGameId`
- `server/data/games.json` -> persistent server-side game metadata registry
- `server/data/game-memberships.json` -> persistent account-to-game membership records
- `server/data/multiplayer-lobbies.json` -> persistent draft multiplayer-lobby records keyed by `gameId`
- `server/data/multiplayer-presence.json` -> persistent running-multiplayer presence records keyed by `gameId + accountId`
- `server/data/saves/` -> managed save directory for server-side galaxy snapshots; save payloads now carry `gameId` when they belong to a registered game, legacy pre-`gameId` saves still load as `gameId: null`, autosaves rotate through 5 slots per game, and the directory is still capped at 100 files globally. `/load` and the multiplayer lobby still use the shared save list for now.

## API Ownership Map

Auth endpoints:
- `/api/auth/register-config`
- `/api/auth/register`
- `/api/auth/resend-confirmation`
- `/api/auth/login`
- `/api/auth/me`
- `/api/auth/logout`
- `/api/account/settings`
- `/api/account/settings/preferences`
- `/api/account/settings/tutorials/reset`

Auth/session note:
- `server/src/index.ts` persists a manual `localAdmin` boolean on accounts/sessions through `server/data/auth.json`
- `server/src/index.ts` now also persists account email, account status (`PENDING_CONFIRMATION` / `ACTIVE`), confirmation-expiry metadata, and initial user-preference placeholders (`replaceWithBotOnLogout`, `logoutBotProfileId`, `language`) through `server/data/auth.json`
- `server/src/auth-rate-limit.ts` owns the lightweight in-memory auth/account rate-limit buckets currently used for register, login, and settings mutations
- `server/src/auth-account-security.ts` owns the pure pending-confirmation cleanup, login-lockout, and login-eligibility helpers used by `server/src/index.ts`
- `server/src/turnstile.ts` owns optional Cloudflare Turnstile registration config/verification: registration stays enabled without CAPTCHA by default, requires Turnstile only when both `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are configured, and also supports an explicit local-dev bypass via `TURNSTILE_BYPASS_FOR_LOCAL_DEV=true`
- `server/src/index.ts` now exports the Express `app`, only auto-listens when run as the main module, and supports test/dev data-path overrides via `SROGAME_AUTH_DATA_PATH`, `SROGAME_GAME_REGISTRY_DATA_PATH`, `SROGAME_GAME_MEMBERSHIPS_DATA_PATH`, `SROGAME_MULTIPLAYER_LOBBY_STORE_DATA_PATH`, `SROGAME_MULTIPLAYER_PRESENCE_DATA_PATH`, and `SROGAME_GAME_SAVES_DIRECTORY_PATH`
- `/api/auth/register` now requires `playerName`, `email`, and `password`, creates a `PENDING_CONFIRMATION` account, and no longer auto-logs the player in
- `/api/auth/register-config` tells the client whether Turnstile is currently required for registration; registration itself now stays available even when CAPTCHA is not configured
- `/api/auth/resend-confirmation` refreshes the pending confirmation window for unconfirmed accounts, enforces a 10-minute resend cooldown, and currently returns a manual-activation reminder because SMTP delivery is still not wired
- `/api/auth/login` now blocks unconfirmed accounts, applies the per-IP auth rate limit, and also enforces account-level password lockout: 5 wrong passwords lock that account for 10 minutes
- migrated auth/account responses now also carry localization-ready transport metadata: successes may include `messageKey` + `messageParams`, and errors may include `errorKey` + `errorParams` alongside the legacy English text
- `/api/auth/logout` now also removes the account's running-multiplayer presence immediately before the server reconciles bot replacement and empty-runtime unload state for that game
- expired pending accounts are cleaned up during auth/account requests instead of via a background job
- `/api/account/settings*` owns read/update access to account preferences plus tutorial reset from the main-menu settings screen
- `server/src/index.ts` now also persists `currentGameId` on accounts/sessions as the selected resume/default game pointer
- `localAdmin` is required for single-player start, direct save load, and multiplayer lobby host/control actions
- active-game turn advancement is no longer controller-only: in multiplayer-scale active games every human player must mark ready through `/api/game/end-turn`, while singleplayer still resolves immediately
- running multiplayer games now also require at least 2 human players to be online in that specific game before turn progression is allowed; this rule is exposed through `TurnStatusResponse.onlineHumanCount`, `minimumOnlineHumanCount`, and `progressionBlockedReason`
- running multiplayer presence is now tracked separately in `server/src/multiplayer-presence.ts`; it now powers AFK auto-skip state, return notices, and the presence-aware multiplayer progression gate
- running multiplayer progression is now presence-aware: `ACTIVE` plus `AUTO_SKIP_TURN` counts as present humans, but only `ACTIVE` humans block ready-state and appear in waiting lists
- running multiplayer presence now has a second timeout tier: after 30 minutes with no meaningful activity, the server removes that player from presence, clears their ready-state, and can switch their seat to offline bot control if the account enabled replacement
- running multiplayer runtimes now also carry a request-driven empty-runtime unload deadline: if zero present humans remain for 3 minutes, the server snapshots the game, unloads the runtime, and the multiplayer browser reclassifies it as `Saved / Inactive`

Auth/security test coverage:
- `server/src/auth-account-security.spec.ts` covers expired pending-account cleanup, pending-confirmation login blocking, password-failure lockout, and successful-login lock reset behavior
- `server/src/turnstile.spec.ts` covers Turnstile registration config modes and invalid verification response handling without requiring a live Cloudflare round trip
- `server/src/auth-api.spec.ts` runs a spawned real server process against temp data files and covers register-config, pending-confirmation registration, resend-confirmation cooldown/refresh behavior, blocked login for unconfirmed users, account lockout after 5 wrong passwords, successful-login reset, and settings preference persistence through the actual HTTP routes

Game registry:
- `/api/games`
- `/api/games/current`
- `/api/games/:gameId/select`
- `/api/games/:gameId/close-current`
- `/api/games/:gameId/saves`
- `/api/games/:gameId/state`
- `/api/games/:gameId/turn-status`

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
- `/api/multiplayer/games`
- `/api/multiplayer/games/:gameId`
- `/api/multiplayer/games/:gameId/join`
- `/api/multiplayer/games/:gameId/leave`
- `/api/multiplayer/games/:gameId/leave-lobby`
- `/api/multiplayer/games/:gameId/leave-current-game`
- `/api/multiplayer/games/:gameId/ready`
- `/api/multiplayer/games/:gameId/setup`
- `/api/multiplayer/games/:gameId/bind-save`
- `/api/multiplayer/games/:gameId/clear-save`
- `/api/multiplayer/games/:gameId/assign-seat`
- `/api/multiplayer/games/:gameId/start`
- `/api/multiplayer/games/:gameId/presence`
- `/api/multiplayer/games/:gameId/auto-skip-turn`

Lifecycle persistence note:
- `/api/games` lists persistent game metadata from `server/data/games.json`; current implementation is the first multi-game groundwork layer and does not yet replace all legacy `/api/game/*` global-runtime assumptions
- `/api/games/current` exposes the authenticated account `currentGameId`, the matching game summary if present, and resume availability/unavailability state for main-menu resume flows
- `/api/games/current` now also carries optional `unavailableReasonKey` + `unavailableReasonParams` metadata for localization-ready current-game blockers
- `/api/games/:gameId/select` updates the authenticated account `currentGameId` and, when that runtime is already loaded, switches the legacy global runtime pointers onto the selected game
- `/api/games/:gameId/select` and `/api/games/:gameId/close-current` now also return keyed error metadata for the main-menu current-game flow
- `/api/games/:gameId/saves` is the first game-scoped save-list endpoint and currently returns the existing `GameSavesResponse` shape filtered by `gameId`
- `/api/games/:gameId/state` and `/api/games/:gameId/turn-status` are the first game-scoped runtime read endpoints; they resolve through `server/src/game-runtime-store.ts` instead of assuming the one global active game
- `/api/games/:gameId/end-turn` now exists as the first game-scoped mutation endpoint for active runtime progression
- the shared runtime-access helpers behind `/api/game/state`, `/api/game/turn-status`, `/api/games/:gameId/state`, `/api/games/:gameId/turn-status`, `/api/games/:gameId/end-turn`, and many `authPlayer`-backed in-game routes now emit localization-ready `errorKey` / `errorParams` metadata instead of raw `{ error }` only
- `/api/multiplayer/games` is the multiplayer browser endpoint family; it now returns `activeDraftLobbies`, `activeRunningGames`, and `otherMultiplayerGames` instead of one undifferentiated list
- `server/src/multiplayer-lobby-store.ts` now persists draft multiplayer lobbies by `gameId` in `server/data/multiplayer-lobbies.json`
- `/api/multiplayer/games` `POST` creates a new `MULTIPLAYER` `DRAFT` game record plus matching draft-lobby record; `/api/multiplayer/games/:gameId/join` enforces the new rule that an account may belong to only one draft multiplayer lobby at a time by removing it from other draft lobbies first
- browser classification rules now treat drafts updated within 1 hour as active, loaded `RUNNING` games as active running, and everything else visible as `Other Multiplayer Games`; unloaded running games get the UI label `Saved / Inactive`
- `/api/multiplayer/games/:gameId/leave` and `/leave-lobby` clean up empty draft lobbies by deleting the stored draft record and archiving the corresponding game record
- `/api/multiplayer/games/:gameId/leave-current-game` clears the account `currentGameId` but keeps multiplayer membership; if that leaves fewer than 2 online humans in the running game, the server snapshots the game, unloads the runtime, and the browser reclassifies it as `Saved / Inactive`
- `/api/multiplayer/games/:gameId/resume-lobby` lets localAdmin reopen a `Saved / Inactive` multiplayer game as a locked `Resumed lobby` bound to that game's latest save; resumed lobbies appear under `Active Draft Lobbies` instead of duplicating the game under `Other Multiplayer Games`
- `/api/multiplayer/games/:gameId/archive` lets localAdmin archive an unloaded multiplayer game after it is no longer relevant
- `/api/multiplayer/games/:gameId/setup`, `/bind-save`, `/clear-save`, `/assign-seat`, and `/start` now move draft-lobby management onto the per-game API family; `/start` keeps the same `gameId`, promotes the draft record to a running multiplayer game, switches all lobby members to that `currentGameId`, deletes the stored draft-lobby record, and preserves any previously mounted runtime in `server/src/game-runtime-store.ts`
- `server/src/multiplayer-presence.ts` now persists per-game running-multiplayer presence records (`ACTIVE` vs `AUTO_SKIP_TURN`, auto-skip enabled flag, last seen timestamp, and return notice state)
- `/api/multiplayer/games/:gameId/presence` is the explicit heartbeat endpoint the Angular game shell uses for meaningful multiplayer activity; passive turn-status polling intentionally does not count as AFK-preventing activity
- `/api/multiplayer/games/:gameId/auto-skip-turn` enables or disables the player's per-game AFK auto-skip flag and can also force immediate `AUTO_SKIP_TURN` activation when the client inactivity timer fires
- request-driven multiplayer lifecycle reconciliation now runs from `/api/auth/me`, `/api/account/settings`, `/api/games`, `/api/games/current`, `/api/multiplayer/games`, `/api/multiplayer/games/:gameId`, and all game-state / turn-status / end-turn runtime-access routes so long-AFK cleanup and empty-runtime unloads can complete without a background worker
- shared multiplayer browser list items now also carry resume-lobby, archive, return-to-game, and inactive-reason metadata so `/multiplayer` does not need to infer lifecycle state from raw `status` alone
- `src/app/multiplayer/multiplayer.component.ts` and `.html` now consume that API family directly, so the frontend no longer depends on the singleton-lobby response shape for the main multiplayer route
- `/api/game/start` writes the initial autosave snapshot through `server/src/game-save.ts`
- `server/src/game-save.ts` now writes immutable snapshots with `gameId` when available, includes `gameId` in `GameSaveSummary`, and exposes per-game save listing helpers while keeping legacy save compatibility
- `/api/game/start` now also registers a running `SINGLEPLAYER` game record plus owner membership and updates the starting account `currentGameId`
- `/api/game/saves` lists all managed saves plus the active-runtime summary and admin-manageability state
- `/api/game/saves/:saveId/load` hydrates a selected save back into live runtime objects, replaces the active in-memory game, and rebuilds galaxy-presentation caches
- `/api/game/saves/:saveId` deletes a selected save file
- `/api/game/turn-status` is the lightweight active-game polling endpoint used by the Angular game shell to detect ready-state and turn-number changes without reloading the full game snapshot every poll
- `/api/game/turn-status` and `/api/games/:gameId/turn-status` now also report the multiplayer online-human gate, so the top menu can show when a running multiplayer game is blocked because fewer than 2 human players are online
- `/api/game/turn-status` and `/api/games/:gameId/turn-status` now also carry the current player's multiplayer presence metadata: `currentPlayerPresenceState`, `currentPlayerAutoSkipEnabled`, `currentPlayerAutoSkipActivatedAt`, `showAutoSkipReturnNotice`, and `showPresenceRemovedReturnNotice`
- `/api/game/end-turn` and `/api/games/:gameId/end-turn` now interpret running multiplayer readiness through presence: `ACTIVE + AUTO_SKIP_TURN` must be at least `2`, but only `ACTIVE` humans are counted as ready blockers; all-auto-skip presence is blocked with `At least 1 active human player must be present to progress this multiplayer game.`
- `/api/game/end-turn` writes rotating autosaves into `server/data/saves/` when `GalaxySetup.autoSaveTurns` is greater than `0` and the configured cadence is reached
- `/api/game/end-turn` now also updates the persistent game registry turn/update metadata for the currently loaded runtime game
- `server/src/game-runtime-store.ts` now persists the in-memory per-game runtime payload plus per-game ready-state, turn-processing state, offline-bot-controlled seats, and `emptyPresenceUnloadAt`, which is used by the game-scoped runtime read/select endpoints and the multiplayer empty-runtime unload flow
- legacy gameplay endpoints under `/api/game/*` now resolve their runtime via the authenticated account `currentGameId` first; if that selected game is not loaded, they return the same unavailable/resume-needed behavior instead of silently acting on another loaded game
- `/api/game/end-turn` now also runs the server-side bot planning phase before shared turn resolution; for active games with more than one human player it first records per-player readiness and resolves only after every human has clicked End Turn for that turn
- `/api/game/turn-status` and `/api/games/:gameId/turn-status` now also carry optional `progressionBlockedReasonKey` + `progressionBlockedReasonParams` metadata for localization-ready active-play blockers
- `/api/game/end-turn`, `/api/games/:gameId/end-turn`, and `/api/multiplayer/games/:gameId/auto-skip-turn` now also return keyed error metadata for the common active-play blockers and validation failures used by the top menu / game shell
- `/api/game/building-queue`, `/api/game/shipyard-queue`, `/api/game/technology-queue`, `/api/game/technology-queue/helpers`, and `/api/game/fleet` now also return keyed metadata for the mapped common `GameCommandError` cases, while still falling back to raw English for dynamic or not-yet-mapped command messages
- `/api/admin/bots*` exposes local-admin/controller-only V2 bot inspection and live runtime controls for profile, pause/resume, V2 trace viewing, and V2 memory clearing

Galaxy and planet reads:
- `/api/game/client-galaxy`
- `/api/game/galaxy-presentation-data`
- `/api/game/client-star-system`
- `/api/game/client-planet`
- `/api/game/owned-planets`

Planet/system mutations:
- `/api/game/star-system-note`
- `/api/game/power-consumption`
- `/api/game/fusion-reactor-stage`
- `/api/game/abandon-planet`
- `/api/game/sensor-phalanx/capabilities`
- `/api/game/sensor-phalanx/scan`
- `/api/game/trade-port/use-offer`

Planet power-operation note:
- `/api/game/power-consumption` still owns the normal electrical-load throttling for buildings that consume power
- `/api/game/fusion-reactor-stage` now owns the Fusion Reactor operating-stage selection separately because Fusion trades power output against deuterium upkeep instead of electrical consumption
- `ClientPlanetDto.objects.fusionReactorStage` carries the selected Fusion stage to the client, while the effective stage/output/upkeep are derived from the shared domain model at read time
- `src/app/models/planets/fusion-reactor-operation.ts` owns the shared selected-stage -> effective-stage clamp against gross deuterium income, and `server/src/game-save.ts` persists the selected stage in save payloads

Queues and production:
- `/api/game/building-queue`
- `/api/game/building-queue/reorder`
- `/api/game/building-queue/cancel`
- `/api/game/shipyard-queue`
- `/api/game/shipyard-queue/reorder`
- `/api/game/shipyard-queue/cancel`
- `/api/game/technology-queue`
- `/api/game/technology-queue/helpers`

Queue command ownership note:
- `server/src/index.ts` owns auth/session checks, request parsing, and HTTP DTO responses for queue-start/update endpoints
- `server/src/game-commands/building-commands.ts` owns building-queue validation + mutation
- `server/src/game-commands/shipyard-commands.ts` owns shipyard-queue validation + mutation
- `server/src/game-commands/research-commands.ts` owns technology-queue validation + mutation, including active helper-lab replacement for ongoing research
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
- `src/app/models/diplomacy/diplomatic-proposal-rules.ts` owns the shared treaty ladder used by both server and Angular UI (`NEUTRAL -> PEACE/WAR`, `WAR -> PEACE/NEUTRAL`, `PEACE -> ALLIED/NEUTRAL`, `ALLIED -> PEACE`)
- `src/app/models/requests/support-request.ts` owns the shared phase-1 diplomacy support-request model and resource-payload normalization used by the server, save layer, and Angular UI
- diplomacy support-request creation/approval/rejection command logic lives in `server/src/game-commands/support-request-commands.ts`; Mail projection, support expiry/synchronization, and accepted support execution still live in `server/src/index.ts`
- phase-2 offensive support requests (`ATTACK_TARGET`, `BOMBARD_TARGET`, `SIEGE_TARGET`) currently auto-launch via the shared `createFleetMission(...)` command path after acceptance, so mission legality still resolves through the normal fleet-command layer

Bot runtime ownership note:
- `server/src/index.ts` owns the end-turn hook and runs bot planning immediately before `resolvePhaseOneTurn(...)`
- `server/src/bots-v2/` now owns the active Bot AI V2 runtime: feature flags, persisted V2 memory contract, snapshot builder, V2 trace store, Supervisor, executor, and the `Economic` + `Defensive` + `Warfare` + `Research` + `Strategic Development` + `Strategic Military` + `Strategic Diplomatic` + `Weight Manager` + `Critical` subsystems
- `server/src/bots-v2/bot-v2-feature-flags.ts` owns the mode gate: `DISABLED`, `SHADOW`, or `LIVE`. `LIVE` is the normal V2 runtime mode, while `SHADOW` still runs trace-only planning.
- `server/src/bots-v2/bot-v2-shadow-runner.ts` owns the V2 end-turn runner. `runBotTurnPhaseV2(...)` handles all V2 modes, and `runBotTurnPhaseV2Shadow(...)` remains only as an explicit shadow helper for tests.
- `server/src/bots-v2/bot-brain-v2.ts` now runs enabled V2 subsystems sequentially instead of in one blind batch, passing accumulated `priorProposals` into later subsystem contexts so advisory/policy layers like `Critical` can inspect earlier shadow requests before proposing emergency overrides. The current order includes `Research` before `Strategic Development`, and successful neutral-foreign `RECYCLE` execution now also records a Strategic Diplomatic hostile-event side effect against the target bot owner there.
- `server/src/bots-v2/ship-payload-planning.ts` now owns the shared carried-payload helper used by Strategic Military and Strategic Diplomatic when they need bombs or small carried combat ships attached behind jump-capable warships.
- `server/src/bots-v2/supervisor/bot-supervisor.ts` owns live Supervisor arbitration: Critical-first scoring, Weight Manager spending-share alignment, pressure-only `SHIP_NEED` boosts, exact same-technology `RESEARCH` overlap boosts across subsystem proposals, queue caps, soft fleet-slot caps, pending-commitment retry/expiry, allowlisted fleet acceptance including combat/guard launch proposals, one-turn pending for exact ships completing next turn, priority handling for executable incoming `REQUEST_DECISION` proposals, normal arbitration for executable outgoing `REQUEST_CREATION` support proposals, and priority handling for executable diplomacy actions (`DIPLOMACY_DECISION` / `DIPLOMACY_PROPOSAL`).
- `server/src/bots-v2/supervisor/bot-supervisor-scoring.ts` owns Supervisor resource-value scoring, using `metal * 1 + crystal * 1.8 + deuterium * 2.6`, local Weight Manager planet weights, global strategic weights including `RESEARCH`, progressive overfunding penalties, and capped underfunding bonuses.
- `src/app/models/jump-gates/jump-gate-travel-cost.ts` owns the shared Jump Gate travel-cost formula: `10` deuterium per jump-capable selected ship except `SPY_PROBE`, reduced by `HYPERSPACE_TECHNOLOGY`, `HYPERSPACE_DRIVE`, and `5%` per lower endpoint `JUMP_GATE` level above 1. `server/src/bots-v2/jump-gate-operating-cost-policy.ts` owns the V2 auto-selection decision hook so bots weigh paid Jump Gate travel against saved turns/fuel.
- `server/src/bots-v2/execution/bot-executor.ts` owns live execution for accepted `BUILDING`, `RESEARCH`, `SHIPYARD`, allowlisted `FLEET_MISSION`, incoming `REQUEST_DECISION`, outgoing support `REQUEST_CREATION`, `DIPLOMACY_DECISION`, and `DIPLOMACY_PROPOSAL` proposals. It executes diplomacy decisions first, runs the lifecycle recall pass second, then executes normal accepted actions. It calls shared command helpers, auto-selects own Jump Gate use when legal/auto-approved, preserves subsystem-owned `useJumpGate: true` so shared fleet validation can create foreign/allied pending Jump Gate requests, executes accepted Jump Gate/Maintenance/Support request decisions, Support request creation, full-ladder diplomacy decisions, and outgoing treaty creation through shared command helpers, recalls own invalid offensive `ATTACK` / `BOMBARD` / `SIEGE` / `SPY` fleets when target relations become `NEUTRAL` / `PEACE` / `ALLIED`, also recalls active `BOMBARD` / `SIEGE` fleets when fresh intel shows defending anti-fleet strength above the configured safety threshold, runs the Research phase-2 free-helper maintenance pass after accepted actions via `updateResearchHelpers(...)`, splits cargo spending from fuel spending, and logs/traces command failures instead of falling back to V1.
- `server/src/bots-v2/execution/bot-execution-adapters.ts` owns normalization of executable queue proposals and intentionally rejects `demandOnly` shipyard / `SHIP_NEED` pressure as non-executable.
- `server/src/bots-v2/execution/bot-fleet-execution-adapters.ts` owns normalization of executable fleet proposals. It allows `SPY`, `TRANSPORT`, `ARMAMENT_DELIVERY`, `REPAIR`, `COLONIZE`, `MOVE`, `DEFEND`, `ATTACK`, `BOMBARD`, `SIEGE`, and `RECYCLE`. Fleet adapters require exact subsystem-provided ships/cargo instead of composing missions inside Supervisor.
- `server/src/bots-v2/execution/bot-request-creation-adapters.ts` owns normalization of executable outgoing request-creation proposals. The current scope is Support requests only; outgoing Maintenance request creation is deferred. Jump Gate requests are not created through this adapter because they require a waiting fleet; accepted fleet proposals with `useJumpGate: true` use the shared fleet command to create pending foreign/allied Jump Gate requests.
- `server/src/bots-v2/execution/bot-request-decision-adapters.ts` owns normalization of executable incoming request decisions (`JUMP_GATE`, `MAINTENANCE`, `SUPPORT`; `APPROVE`, `REJECT`, `PARTIAL_APPROVE`).
- `server/src/bots-v2/execution/bot-diplomacy-decision-adapters.ts` owns normalization of executable diplomacy decisions (`PEACE` / `ALLIED` / `NEUTRAL` / `WAR`; `ACCEPT`, `REJECT`, `CANCEL`).
- `server/src/bots-v2/execution/bot-diplomacy-proposal-adapters.ts` owns normalization of executable outgoing treaty proposals (`DIPLOMACY_PROPOSAL` with target player and requested treaty status).
- `server/src/game-commands/fleet-lifecycle-commands.ts` owns the shared active-fleet return helper used by both the player API and V2 Supervisor lifecycle recall.
- `server/src/bots-v2/snapshot/build-bot-world-snapshot.ts` now owns the enriched V2 local read model: local incomes/capacities, industry/research/shipyard power, queue ETC estimates, next-turn queued ship completions for Supervisor pending-ship checks, bunker/defense value summaries, installed-ship value summaries plus undamaged/damaged ship splits, building-damage summaries, owned-planet debris exposure, `avg_industry`, queued-defense/queued-ship state, `isResearchHelper` queue occupancy, recent hostile-attack proxy counts including the 20-turn local pressure window plus `knownByWarFaction`, empire-level Strategic Development intel candidates with scan freshness + reported colonization difficulty, Strategic Military target snapshots with neutral-vs-not-neutral classification plus report-derived stored-resource/storage/income/bunker/defender observations and debris exposure, Strategic Diplomatic faction snapshots for discovered non-neutral players/bots with relation state + intel depth + battle-history + pending incoming/outgoing diplomacy proposal ids plus known-planet debris exposure, pending incoming Jump Gate/Maintenance/Support request snapshots, per-known-planet recent battle pressure, active-fleet / active-colonize-fleet counts, active-recycle-fleet count, active-bombardment-fleet visibility for safety scouting/recall, strategic-development building levels, and the tech/modifier fields required by the Economic, Defensive, Warfare, Research, Strategic Development, Strategic Military, Strategic Diplomatic, and Weight Manager planners, including `anomaliesAndNoise` and `hyperspaceParameters`; it now also normalizes the report-backed 40-turn shared hostile-awareness feed that Strategic Diplomatic consumes from direct `Incoming Attack Report`, `Battle Report`, and `Incoming Bombardment Report` evidence
- `server/src/bots-v2/infrastructure-damage.ts` now centralizes V2 building-damage classification and emergency-threshold logic. It defines the shared `CRUCIAL` / `IMPORTANT` / `BASIC` categories, their emergency thresholds (`25 / 40 / 80`), per-building damage entries, per-category summaries, the hybrid total-plus-category emergency trigger, and the prioritized damage-point helper used by repair-aware planners.
- `server/src/bots-v2/subsystems/economic/bot-economic-subsystem.ts` now owns the branch-first local Economic planner: per-planet energy/storage/economy branch selection, dependency-chain expansion, narrow ETC-first goal ranking with stepwise throughput re-simulation, prerequisite research support, deduped shared-request emission, and first-class per-planet goal/no-action results
- `server/src/bots-v2/subsystems/defensive/bot-defensive-subsystem.ts` now owns the local Defensive planner: per-planet unlock/bunker/production candidate generation, strict prerequisite building/research expansion for unlock paths, narrow ETC-first structural and production ranking with positive-only bonuses, and explicit selection between structural-only, mixed structural+production, and production-only output modes
- `server/src/bots-v2/subsystems/warfare/bot-warfare-subsystem.ts` now owns the local Warfare planner: per-planet `CAPACITY` / `UNLOCK` / `PRODUCTION` candidate generation for military+cargo ship production, explicit included ship lists, avg-industry-driven shipyard/nanite targets, category-shaped 5-goal/5-request output, reserved cargo visibility, first-class per-planet no-action results, and the current `RECOVERY` slice for owned/safe/neutral recycle planning with recycler `SHIP_NEED` / direct `SHIPYARD` fallback when a chosen recycle job cannot yet launch
- `server/src/bots-v2/subsystems/research/bot-research-subsystem.ts` now owns the current global Research planner: at most one new `RESEARCH` proposal per turn, best `(technology, main lab)` pair selection by affordability ETA + ETC + resource fit + research power, helper-lab attachment at launch time with preference for weaker/currently unaffordable idle labs, persistent per-player affordability-window state in `player.botMemoryV2.research`, and non-executable resource-concentration signals for expensive otherwise-valid research outside the affordability window. Helper reassignment for already running research is intentionally not proposal-driven; the first phase-2 slice runs later in the executor as a free idle-lab maintenance pass.
- `server/src/bots-v2/subsystems/strategic-development/bot-strategic-development-subsystem.ts` now owns the current layered Strategic Development planner: the local building/production planner for `INTERSTELLAR_TRADE_PORT` / `JUMP_GATE` / `RESEARCH_LAB` / `SENSOR_PHALANX` plus support-ship readiness stock, the global logistics/intel planner for `TRANSPORT`, `ARMAMENT_DELIVERY`, and `SPY`, the current colonization-execution slice that can emit one executable `COLONIZE` mission request with bootstrap cargo from any ready colonizer source toward the best fresh scanned target, and one global resource-concentration target that can feed expensive old-planet building or research investments through budget-attributed transport missions
- `server/src/bots-v2/subsystems/strategic-military/bot-strategic-military-subsystem.ts` now owns the current global neutral-farm planner: galaxy-wide `SPY` discovery/refresh requests, direct `BREAK` attack proposals against scanned neutral defenders, one-ship INTEL attacks when spy intel has only total nonzero defender counts, anti-ship / anti-defence break composition targeting from known defender mix, relocation `MOVE` proposals that gather military ships from multiple owned origins onto the best staging planet when no single origin can satisfy `BREAK`, repeatable `PLUNDER` attack proposals against opened farms using cargo plus 1-2 military ships, stronger opened-farm repeat-use slot/scoring pressure, carried small-combat/bomber payload planning through the shared payload helper when useful, exact-ship-type `SHIP_NEED` demand proposals when current local fleets still cannot execute the next farm step after relocation, and the persistent memory-backed farm ledger / regrowth scheduling layer that converts espionage, battle, and plunder reports into remembered neutral-farm state while treating sudden extra enemy ships on failed breaks as likely third-party interference instead of pure weak-force failure
- `server/src/bots-v2/subsystems/strategic-diplomatic/bot-strategic-diplomatic-subsystem.ts` now owns the current phased Strategic Diplomatic planner: phase-1 discovered-faction evaluation, per-faction hostility/stance/strength/confidence scoring, adjacent-only relation-change proposals, incoming/outgoing diplomatic-proposal preference suggestions, retaliation flags, and memory-backed per-faction diplomatic ledgers, the phase-2 real-player espionage slice that emits weighted `SPY` mission proposals and up to two per-planet `SPY_PROBE` `SHIP_NEED` requests from global diplomatic probe pressure, and the current phase-3 diplomatic combat slice that emits executable `ATTACK`, allied `REPAIR`, and allied `DEFEND` mission proposals plus exact-ship-type non-probe `SHIP_NEED` fallbacks for blocked war/support plans
- `server/src/bots-v2/subsystems/strategic-diplomatic/bot-strategic-diplomatic-subsystem.ts` now also owns the phase-4 diplomatic force-projection slice: `BOMBARD` / `SIEGE` planning for `WAR` targets, bombardment-staging `MOVE` regrouping when no single origin can satisfy war pressure, own/allied `ARMAMENT_DELIVERY` support proposals, and direct `BOMB_DEPOT` / `ALLIANCE_DEPOT` / `JUMP_GATE` building pressure plus hybrid `PLANETARY_BOMB` production pressure. The current live follow-up also attaches prioritized carried bombardment/small-combat payload through the shared payload helper, emits matching bomber/small-combat `SHIP_NEED` pressure, and can schedule safety `SPY` / scout checks for active bombard/siege fleets before they commit into fresh defending intel.
- `server/src/bots-v2/subsystems/strategic-diplomatic/bot-strategic-diplomatic-subsystem.ts` now also owns the phase-5 pre-break concentration slice: one persisted global primary `WAR` break target in `BotMemoryV2`, deterministic randomized hold/worth thresholds, relocation-first `MOVE + ATTACK` war-break planning, and exact-ship-type war-break `SHIP_NEED` only after concentration options are exhausted
- `server/src/bots-v2/subsystems/strategic-diplomatic/bot-strategic-diplomatic-subsystem.ts` now also owns the live phase-8 shared-war-awareness slice: report-backed `ATTACK` / `BOMBARD` / `SIEGE` event sharing across `ALLIED` and `PEACE` contacts, 40-turn shared-hostile-event retention, existing `ALLIED > PEACE` hostility weighting, and the resulting hostility/support/escalation score pressure without propagating `SPY` events into coalition awareness
- `server/src/bots-v2/subsystems/strategic-diplomatic/bot-strategic-diplomatic-subsystem.ts` now also owns V2 request and diplomacy evaluation: it emits executable `REQUEST_DECISION` proposals for pending Jump Gate, Maintenance, and Support requests, executable `REQUEST_CREATION` proposals for outgoing Support requests, executable `DIPLOMACY_DECISION` proposals for pending full-ladder treaty decisions, and executable `DIPLOMACY_PROPOSAL` proposals for one best outgoing treaty opportunity per turn. Allied Jump Gate requests with valid mission types are approved, Peace Jump Gate defense can be approved under shared hostile pressure, Maintenance approvals preserve a 5% deuterium-storage reserve and limit Peace to fuel only, Support decisions reuse the existing diplomatic support preference logic, outgoing Support creation is capped to one request per turn, invalid treaty-ladder proposals such as neutral-to-allied are rejected, and own outgoing treaty proposals can be cancelled when utility turns negative. Treaty policy can propose `WAR` against clearly weaker factions, boosts alliance seeking when weaker, and persists temporary post-victory non-aggression treatment in the per-faction ledger.
- `server/src/bots-v2/subsystems/weight-manager/bot-weight-manager-subsystem.ts` now owns the advisory Weight Manager phase-1 policy layer: direct per-profile base tables, mutually-exclusive global mode selection, global strategic weights, per-planet local weights, reused aggregate-metric comparisons (`avg_industry`, computed `avg_military` / `avg_defence` / `avg_development` vs `highest_*`), and maturity/focus/danger flags intended for later Supervisor consumption
- `server/src/bots-v2/subsystems/critical/bot-critical-subsystem.ts` now owns the current emergency-only Critical planner: phase-1 shadow detection of energy/storage/industry-chain/logistics/intel deadlocks, fixed family priority, blocker-ledger persistence, earlier-proposal awareness, and capped emergency `BUILDING` / `SHIPYARD` unblock proposals including safe-planet `REPAIR_DRONE` production when damage recovery is otherwise stuck; plus the current phase-2 owned-planet emergency mission layer that can emit proposal-only self-recovery `REPAIR`, `ARMAMENT_DELIVERY`, and immature-planet `TRANSPORT` requests with response-subtype metadata and `SHIPYARD` demand-only fallback when the required utility hulls are missing. Its repair escalation now uses the shared categorized infrastructure-damage model instead of only aggregate structural loss.
- `server/src/bots-v2/bot-v2-types.ts` now owns the shared V2 goal/result contracts for multiple subsystems, including ship-target metadata, Warfare planet results, the separate building-vs-production Strategic Development planet-result shape, the optional `priorProposals` context channel for later-running subsystems, and the extra snapshot fields needed by Weight Manager
- `server/src/bots/bot-profile.ts` still owns shared fixed bot personality/profile definitions used by setup/admin flows
- `server/src/bots/bot-diplomacy-awareness.ts`, `server/src/bots/bot-diplomacy-planner.ts`, and `server/src/bots/bot-diplomacy-resolver.ts` are legacy V1 planning helpers and are not part of the current V2 end-turn runtime
- `server/src/bots/bot-admin.ts` owns controller-only runtime bot controls and paused-bot state, but bot memory clearing now targets `botMemoryV2`
- `server/src/bots-v2/bot-v2-trace.ts` owns the in-memory V2 trace ring buffer used by `/api/admin/bots/traces` and `/game/bot-debug`
- bot actions currently reuse the shared command layer in `server/src/game-commands/` for buildings, research, shipyard, spy, colonize, attack, transport, maintenance, recycle, repair, bombard, siege, guard, move launches, incoming request decisions, outgoing Support request creation, diplomacy decisions/proposals, and active-fleet returns; self-owned move/transport/guard routes can now opt into Jump Gate travel when access is valid and the distance benefit is meaningful, accepted V2 fleet proposals with `useJumpGate: true` can create pending foreign/allied Jump Gate requests through the shared fleet command, orbiting self-owned fleets can request auto-approved Alliance Depot maintenance support, V2 bots now resolve incoming Jump Gate/Maintenance/Support requests only when Strategic Diplomatic emits executable `REQUEST_DECISION` proposals, V2 bots resolve pending treaty proposals only when Strategic Diplomatic emits executable `DIPLOMACY_DECISION` proposals, V2 bots create outgoing treaty proposals only when Strategic Diplomatic emits executable `DIPLOMACY_PROPOSAL` proposals, Warfare can now launch conservative owned/safe/neutral recycle missions directly, owned planets can trigger conservative repair support launches, high-infrastructure hostile worlds can trigger bombard/siege plans instead of default raids, and current diplomacy status now feeds back into bot attack/spy/border-defense scoring and Supervisor recall behavior
- `src/app/models/turns/phase-one-turn-resolver.ts` now also owns the human-facing alert layer for shared hostile awareness: it still forwards copied hostile battle/bombardment reports to human `ALLIED` / `PEACE` contacts, and now also adds aggregated same-turn system-mail alerts for hostile `ATTACK` / `BOMBARD` / `SIEGE` events plus direct victim-only `Espionage alert` mail that does not enter shared coalition awareness

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
- `/api/game/mail/support-requests/:requestId/approve`
- `/api/game/mail/support-requests/:requestId/reject`
- `/api/game/mail/support-requests/:requestId/cancel`
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
- `/api/game/diplomacy/support-requests`

Primary API contracts:
- `src/app/models/game-api-types.ts`
- `ApiErrorResponse` and `ApiMessageMetadata` in `src/app/models/game-api-types.ts` are the shared Phase 2 transport shapes for backend-owned localized messages; migrated clients should prefer keyed metadata and fall back to raw `error` / `message` strings while server coverage is still partial

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
- diplomacy support-request approval/reject/cancel flow, including partial approval for `RESOURCE_SUPPORT`
- offensive support auto-launch scheduling, target invalidation auto-cancel, and 3-turn waiting-window auto-reject

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
- orchestrating server-side bot planning during end turn through `server/src/bots-v2/`

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
- runs standalone 20/50/100-turn all-bot simulations using `GalaxyCreator`, the bot runtime, and `resolvePhaseOneTurn(...)`
- includes `baselineMixed`, `frontierPressure`, and `warHotspot` presets
- `warHotspot` additionally occupies the remaining map, seeds mutual full-strength espionage intel, and sets contender pairs to explicit `WAR` so advisory runs can surface attack behavior instead of only growth/logistics
- output now includes per-run `profileSummary` plus top-level `overallProfileSummary` aggregates for profile-level tuning
- supports `--profiles=AGGRESSOR,TURTLE` and `--compare=AGGRESSOR,TURTLE` for targeted comparison runs

Strict V2 bot simulation runner:
- `scripts/run-bot-v2-simulation.ts`
- package entries: `npm.cmd run bot:sim`, `npm.cmd run bot:sim:initial`, `npm.cmd run bot:sim:advanced`
- writes `tmp/bot-v2-sim/<timestamp>-*/summary.json`, `traces.jsonl`, `turn-summary.jsonl`, `anomalies.json`, `battle-summary.json`, `final-state-summary.json`, and `resource-concentration-summary.json`
- supports fresh-game and `--load-save-id=<saveId>` execution modes
- supports scenario selection including `initial`, `advanced`, and `benchmark20x20`; `advanced` is the fast no-neutral smoke scenario, while `benchmark20x20` is the neutral-enabled farming benchmark
- runs `runBotTurnPhaseV2(..., { mode: 'LIVE' })` plus `resolvePhaseOneTurn(...)`
- performs first-pass invariant checks and groups unexpected bot command failures for stabilization work
- now seeds galaxy/context creation through the same deterministic RNG path so repeated runs with the same seed are actually comparable
- includes resource-concentration counters for old-planet/expensive-research logistics: concentration signals, target selections, transport proposals/acceptances/executions, incoming reservations, reservation expiry, matching investments, and active locked resources

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
- `server/src/game-commands/fleet-commands.ts` for shared launch execution, including owned-planet origins and remote-origin launches from orbiting fleets

Change maintenance-request / `ALLIANCE_DEPOT` logistics:
- `src/app/models/requests/maintenance-request.ts`
- `src/app/models/fleets/fleet.ts` for orbiting-fleet cargo/payload state and remote-origin markers
- `src/app/models/game-api-types.ts`
- `src/app/core/game-api.service.ts`
- `src/app/game/operations-view/`
- `src/app/game/mission-planner-view/` when maintenance-delivered fuel/small ships/bombs should be reused as a remote mission origin
- `src/app/game/mail-view/`
- `server/src/index.ts`
- `server/src/game-commands/fleet-commands.ts`
- `server/src/game-commands/maintenance-commands.ts`
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
- `src/app/models/planets/fusion-reactor-operation.ts` when Fusion output/upkeep rules or deuterium-income clamping change
- `src/app/models/planets/planet.ts` when stored Fusion stage state or planet-side net deuterium helpers change
- supporting helpers in `battles/`, `repairs/`, `recycling/`, `missions/encounters/`
- tests in `src/app/models/turns/tests/`

Change building power / Fusion Reactor operating rules:
- `src/app/models/planets/fusion-reactor-operation.ts`
- `src/app/models/planets/planet.ts`
- `src/app/models/game-api-types.ts`
- `src/app/core/game-api.service.ts`
- `server/src/index.ts`
- `server/src/game-save.ts`
- `src/app/game/planet-view/`
- read-only parity surfaces in `src/app/game/buildings-view/`, `src/app/game/production-view/`, `src/app/game/researches-view/`, and `src/app/game/imperium-view/`

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
- `server/src/bots-v2/` for active bot planning/runtime changes
- `server/src/bots-v2/supervisor/` for proposal arbitration, spending alignment, fleet-slot alignment, pending commitments, executable diplomacy decisions, and lifecycle recall decisions
- `server/src/bots-v2/execution/` for live queue/fleet command adapters and executors
- `server/src/bots-v2/subsystems/` for subsystem proposal generation
- `server/src/bots/bot-profile.ts` for shared bot personality/profile definitions
- `server/src/bots/bot-admin.ts` for controller-only profile/pause/memory controls
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
