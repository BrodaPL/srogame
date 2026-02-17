# AGENTS.md

This file captures session context for collaborators and future AI agents.

## Project Summary
- Name: srogame
- Stack: Angular (standalone components), TypeScript
- Purpose: Browser game similar to OGame but simplified, turn-based (not real-time), supports single-player and small-scale multiplayer. PvE is primary, PvP is possible. Enemy AI will be simplistic and RNG-driven with scaling.
- Secondary purpose: Learning TypeScript and Angular through building the game.
- Persistence (current): Uses browser localStorage key `srogame:setup`.

## Current Behavior
- Route `/` shows main menu (load, singleplayer, multiplayer, help/about).
- Route `/setup` shows setup form (player name + starting metal/crystal/deuterium).
- Route `/game` shows game view if config exists, otherwise prompts to go to setup.
- Routes `/load`, `/multiplayer`, `/help` are placeholders.

## Key Files
- App bootstrap: `src/main.ts`, `src/app/app.config.ts`
- Routes: `src/app/app.routes.ts`
- Root component: `src/app/app.ts`, `src/app/app.html`
- Global styles: `src/styles.css`
- Main menu UI + logic: `src/app/main-menu/main-menu.component.ts`, `src/app/main-menu/main-menu.component.html`
- Setup UI + logic: `src/app/setup/setup.component.ts`, `src/app/setup/setup.component.html`
- Game UI + logic: `src/app/game/game.component.ts`, `src/app/game/game.component.html`
- Models: `src/app/models/resources-pack.ts`
- Models: `src/app/models/building-type.ts`, `src/app/models/technology-type.ts`, `src/app/models/building-requirement.ts`, `src/app/models/tech-requirement.ts`, `src/app/models/weapon-type.ts`, `src/app/models/weapon.ts`, `src/app/models/technology.ts`, `src/app/models/building.ts`, `src/app/models/hull-class.ts`, `src/app/models/ship.ts`, `src/app/models/ship-instance.ts`, `src/app/models/ship-group.ts`, `src/app/models/planet.ts`, `src/app/models/planet-type.ts`, `src/app/models/solar-system.ts`, `src/app/models/galaxy.ts`, `src/app/models/player.ts`, `src/app/models/fleet.ts`
- Logging: `src/app/core/logger.ts`

## Dev Commands
- `npm run start` (ng serve)
- `npm run build`
- `npm run test`

## Session Notes (most recent first)
- 2026-02-17: Added ship/building/technology blueprints with JSON sources, factories to hydrate them, and new blueprint container models (`ShipBlueprints`, `BuildingBlueprints`, `TechnologyBlueprints`). JSON uses enum identifiers and lives in `src/app/blueprints/`.
- 2026-02-15: Added domain models for resources, buildings, tech, ships, fleets, planets, solar systems, galaxies, and players.
- 2026-02-15: Added main menu + new routes, centralized CSS in `src/styles.css`, added `ResourcesPack` model and global logger.
- 2026-02-15: Created this AGENTS.md to persist context. Explained basic Angular/TypeScript features in the current codebase.

## Open Questions / Next Steps
- None recorded yet.
