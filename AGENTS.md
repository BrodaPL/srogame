# AGENTS.md

This file captures session context for collaborators and future AI agents.

## Project Summary
- Name: srogame
- Stack: Angular (standalone components), TypeScript
- Purpose: Browser game similar to OGame but simplified, turn-based (not real-time), supports single-player and small-scale multiplayer. PvE is primary, PvP is possible. Enemy AI will be simplistic and RNG-driven with scaling.
- Secondary purpose: Learning TypeScript and Angular through building the game.
- Persistence (current): Uses browser localStorage key `srogame:setup`.

## Current Behavior
- Route `/` shows setup form (player name + starting metal/crystal/deuterium).
- Route `/game` shows game view if config exists, otherwise prompts to go to setup.

## Key Files
- App bootstrap: `src/main.ts`, `src/app/app.config.ts`
- Routes: `src/app/app.routes.ts`
- Root component: `src/app/app.ts`, `src/app/app.html`
- Setup UI + logic: `src/app/setup/setup.component.html`, `src/app/setup/main_menu.component.css`
- Game UI + logic: `src/app/game/game.component.ts`, `src/app/game/game.component.html`, `src/app/game/game.component.css`

## Dev Commands
- `npm run start` (ng serve)
- `npm run build`
- `npm run test`

## Session Notes (most recent first)
- 2026-02-15: Created this AGENTS.md to persist context. Explained basic Angular/TypeScript features in the current codebase.

## Open Questions / Next Steps
- None recorded yet.

