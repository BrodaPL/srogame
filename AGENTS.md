# AGENTS.md

This file captures session context for collaborators and future AI agents.

## Project Summary
- Name: srogame
- Stack: Angular (standalone components), TypeScript
- Purpose: Browser game similar to OGame but simplified, turn-based (not real-time), supports single-player and small-scale multiplayer. PvE is primary, PvP is possible. Enemy AI will be simplistic and RNG-driven with scaling.
- Secondary purpose: Learning TypeScript and Angular through building the game.
- Persistence (current): Uses browser localStorage key `srogame:setup` and `srogame:player`. Galaxy is held in server memory and fetched via API.

## Current Behavior
- Route `/` shows main menu (load, singleplayer, multiplayer, encyclopedia, help/about).
- Route `/setup` shows setup form (player name, game type, starting metal/crystal/deuterium).
- Route `/game` shows game view if config exists, otherwise prompts to go to setup. Shows a galaxy preview grid when in-memory galaxy exists.
- Route `/encyclopedia` shows encyclopedia menu with ships/buildings/technologies links.
- Routes `/load`, `/multiplayer`, `/help` are placeholders.
- Route `/encyclopedia/ships` shows ship cards sourced from ship blueprints (images + stats + costs).
- Route `/encyclopedia/buildings` shows building cards sourced from building blueprints (images + basic stats + costs).
- Route `/encyclopedia/technologies` shows technology cards sourced from tech blueprints (images + basic stats + costs).

## Key Files
- App bootstrap: `src/main.ts`, `src/app/app.config.ts`
- Routes: `src/app/app.routes.ts`
- Root component: `src/app/app.ts`, `src/app/app.html`
- Global styles: `src/styles.css`
- Main menu UI + logic: `src/app/main-menu/main-menu.component.ts`, `src/app/main-menu/main-menu.component.html`
- Encyclopedia menu UI + logic: `src/app/encyclopedia-menu/encyclopedia-menu.component.ts`, `src/app/encyclopedia-menu/encyclopedia-menu.component.html`
- Encyclopedia placeholders: `src/app/encyclopedia-menu/encyclopedia-ships.component.ts`, `src/app/encyclopedia-menu/encyclopedia-buildings.component.ts`, `src/app/encyclopedia-menu/encyclopedia-technologies.component.ts`
- Encyclopedias render blueprints: `src/app/encyclopedia-menu/encyclopedia-ships.component.html`, `src/app/encyclopedia-menu/encyclopedia-buildings.component.html`, `src/app/encyclopedia-menu/encyclopedia-technologies.component.html`
- Blueprints: `src/app/blueprints/ship-blueprints.json`, `src/app/blueprints/building-blueprints.json`, `src/app/blueprints/technology-blueprints.json`
- Setup UI + logic: `src/app/setup/setup.component.ts`, `src/app/setup/setup.component.html` (legacy)
- Galaxy setup UI + logic: `src/app/setup/galaxy.setup.component.ts`, `src/app/setup/galaxy.setup.component.html`
- Game UI + logic: `src/app/game/game.component.ts`, `src/app/game/game.component.html`
- Models (core): `src/app/models/resources-pack.ts`, `src/app/models/player-id.ts`, `src/app/models/player.ts`, `src/app/models/game-api-types.ts`
- Models (enums): `src/app/models/enums/building-type.ts`, `src/app/models/enums/technology-type.ts`, `src/app/models/enums/weapon-type.ts`, `src/app/models/enums/hull-class.ts`, `src/app/models/enums/planet-type.ts`, `src/app/models/enums/player-type.ts`, `src/app/models/enums/game-type.ts`, `src/app/models/enums/names-list.ts`
- Models (buildings): `src/app/models/buildings/building.ts`, `src/app/models/buildings/building-blueprints.ts`, `src/app/models/buildings/building-requirement.ts`
- Models (fleets): `src/app/models/fleets/fleet.ts`, `src/app/models/fleets/ship.ts`, `src/app/models/fleets/ship-instance.ts`, `src/app/models/fleets/ship-group.ts`, `src/app/models/fleets/ship-blueprints.ts`, `src/app/models/fleets/weapon.ts`, `src/app/models/fleets/destination.ts`
- Models (planets): `src/app/models/planets/planet.ts`, `src/app/models/planets/solar-system.ts`, `src/app/models/planets/galaxy.ts`, `src/app/models/planets/galaxy-creator.ts`, `src/app/models/planets/planet-type-assets.ts`, `src/app/models/planets/planet-image-helper.ts`
- Models (tech): `src/app/models/tech/technology.ts`, `src/app/models/tech/technology-blueprints.ts`, `src/app/models/tech/tech-requirement.ts`
- Logging: `src/app/core/logger.ts`
- In-memory state: `src/app/core/game-state.service.ts`
- API client: `src/app/core/game-api.service.ts`, `src/app/core/player-session.service.ts`, `src/app/models/game-api-types.ts`
- Server (Node + Express): `server/src/index.ts` (in-memory galaxy, start + state endpoints)

## Dev Commands
- `npm run start` (ng serve)
- `npm run build`
- `npm run test`
- `cd server && npm run dev` (Express server)

## Session Notes (most recent first)
- 2026-02-25: Added RNG generator stubs (buildings/ships/tech/resources). Implemented `RngResourceGenerator.generateWithModifiersAndRng` to apply ±percent randomness per resource.
- 2026-02-24: Expanded `PlanetaryReportData` with report metadata, averages, and detailed lists. Added placeholder report queue/defence classes: `DefenceBuildingInstances`, `ShipyardQueue`, `DefencesQueue`, `ResearchQueue`.
- 2026-02-24: Note: broad PowerShell `Select-String` from repo root can traverse `node_modules` and be very slow. Prefer scoping searches to `src` and `server/src`, or explicitly exclude `node_modules`.
- 2026-02-24: Added `WeaponType.REPAIR_EQIPMENT`. Added `anomaliesAndNoise` (-60%..60% in 5% steps) and `hyperspaceParameters` (-80%..50% in 5% steps) to `Planet`, including modifier ranges for all planet types and stepped random generation.
- 2026-02-23: Added `isCenterEdge` to `SolarSystem` and applied center-edge void reduction (50% of `voidChance`). Galaxy creation now adds a 50% void chance on galaxy edge systems. Added reports model: `PlanetaryReportData` and new report fields on `Planet` and `SolarSystem` (`lastReportData` map and `discoveredByPlayer` set). Added `GameType` enum and game type selection (PvP/PvPvE/PvE) to galaxy setup; `GalaxySetup` now includes `gameType` with validation updates on client/server. Added `PlanetImageHelper` for size-based planet images in `public/images/planet_blank`. Fixed ship blueprints `techRequirements` JSON shape.
- 2026-02-23: Added game subpages under `/game` with child routing and default Empire Overview. Galaxy Preview moved into its own screen; Reports and Tech Overview mockups added. Game view now uses a shell + router-outlet. Added overview UI styles and kept galaxy grid styling (22px cells, hover zoom/border).
- 2026-02-22: Galaxy Preview tweaks: larger cells (22px), scrollable grid, hover-to-reveal coords (including void), hover scale and border highlight.
- 2026-02-22: Introduced `PlayerID` (shared id+name), updated `Player` to store `playerId`, and changed `Planet`/`Fleet` ownership to `PlayerID`. Added player maps to `Galaxy` (human/bot/neutral + name lookup).
- 2026-02-22: Reorganized models into folders: `buildings/`, `fleets/`, `planets/`, `tech/`, `enums/`, with updated imports and server model paths.
- 2026-02-22: Fixed server import interop for `GalaxyCreator` (ESM/CJS) so `npm run dev` starts. Now have one common `GalaxySetup` type for client and server. User made additional minor local fixes after server startup (details not recorded).
- 2026-02-22: Added Node + Express server under `server/` with in-memory Galaxy (`POST /api/game/start`, `GET /api/game/state`). Client now calls API to start/load game; stores player session in localStorage; galaxy preview uses server snapshot. Added commander name to setup form. Added API/client services and shared API types.
- 2026-02-22: Added `createGalaxy` step to override systems within `galaxyCenterRadius` to `SolarSystem.createGalaxyCenter`. Added galaxy preview grid to `/game` (void=black, center=yellow, regular=dark blue w/ coords). Added `GameStateService` to keep Galaxy in memory only; removed galaxy JSON persistence. Setup now stores galaxy in memory, not localStorage.
- 2026-02-22: Added `GalaxyCreator` with instance-based galaxy setup, center/radius calculations, and `createGalaxy()` that fills a void grid with random `SolarSystem`s inside the galaxy radius (name pool + random planet count). Setup now builds and stores this galaxy on start.
- 2026-02-21: Added random `SolarSystem` constructor logic (planet generation rules, naming, clamped planet count, void/galaxy-center handling) and optional forced planet type to `Planet.createRandomEmpty`. Reworked setup into `galaxy.setup.component` to capture galaxy-generation params (size, center/void, stars modifiers, bots, difficulties, starting resources), added random galaxy name default, updated game view config display, and reorganized setup UI into row groupings with resource icon inputs and validation caps (max 999999) plus styling updates.
- 2026-02-21: Added `SolarSystem.coordinates` (readonly), created `names-list.ts` with single-word names for solar systems, and added `Galaxy.buildSolarSystemNamePool()` to generate all prefix+suffix permutations with optional shuffle. User later expanded `names-list.ts` to 1600+ unique names and updated `buildSolarSystemNamePool` to include single-word names as well.
- 2026-02-20: Refactored `Planet` random generation: modifier ranges are now per `PlanetType`, colonization difficulty is per type, added `createStartingPlanet` (size 160, zero modifiers, type limited to Jungle/Savanna/Oceanic), `solarSystem` is required on `Planet`, and `owner` is now nullable with factories defaulting to null.
- 2026-02-20: Switched global UI to a dark, space-themed palette in `src/styles.css`; adjusted encyclopedia cost chips (bigger icons, tighter padding). Renamed `public/images/planet_view/*_Backdrop.webp` files to remove `_Backdrop`. Added `PlanetType` image mapping (`PLANET_TYPE_IMAGES`) with resources/facilities views and updated to `OCEANIC`. Added `PlayerType` enum. Added `Planet.createRandomEmpty` factory with randomized planet parameters and modifiers rounded to 2 decimals.
- 2026-02-19: Added ship/building/technology encyclopedia views with cards, images, and costs. Added imagePath fields to Ship/Building/Technology + blueprints. Moved image assets under `public/images` and added icons for resource costs. Fixed missing tech image reference.
- 2026-02-19: Added encyclopedia menu route and main menu button. Added placeholder routes + components for ships/buildings/technologies in `src/app/encyclopedia-menu/`.
- 2026-02-18: Moved enums into `src/app/models/enums/`. Updated ship blueprints (evasionChance scalar; scaled hull/shield/dmg/cargo/cost by 10). Building/Technology blueprints now use `basicCost`, both populated with placeholders. Building `cost`/`powerConsumption` now scalar; Technology `basicCost` now scalar. Added `getCostForLevel(levelParam)` to Building and Technology.
- 2026-02-17: Added ship/building/technology blueprints with JSON sources, factories to hydrate them, and new blueprint container models (`ShipBlueprints`, `BuildingBlueprints`, `TechnologyBlueprints`). JSON uses enum identifiers and lives in `src/app/blueprints/`.
- 2026-02-15: Added domain models for resources, buildings, tech, ships, fleets, planets, solar systems, galaxies, and players.
- 2026-02-15: Added main menu + new routes, centralized CSS in `src/styles.css`, added `ResourcesPack` model and global logger.
- 2026-02-15: Created this AGENTS.md to persist context. Explained basic Angular/TypeScript features in the current codebase.

## Open Questions / Next Steps
- None recorded yet.
