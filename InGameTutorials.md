# InGameTutorials.md

This document captures the current in-game tutorial system, the authoring rules that now matter in practice, and the rollout pattern for polishing remaining views.

Use this file before changing tutorial behavior or adding a new tutorialized screen.

## Scope

- Current tutorial polish level: phase-2 desktop-only.
- Mobile-specific tutorial layouts are not planned yet.
- Tutorials are shared across all game views through one overlay/service system.

## Main Files

- Shared types: `src/app/tutorial/tutorial-types.ts`
- Shared content registry: `src/app/tutorial/tutorial-content.ts`
- Shared logic: `src/app/tutorial/tutorial.service.ts`
- Shared overlay component: `src/app/tutorial/tutorial-overlay.component.ts`
- Shared overlay template: `src/app/tutorial/tutorial-overlay.component.html`
- Shared overlay styles: `src/app/tutorial/tutorial-overlay.component.css`

## Supported Tutorial Views

Tutorials are keyed by `TutorialViewKey` in `src/app/tutorial/tutorial-types.ts`.

Current keys:

- `galacticView`
- `imperiumView`
- `planetView`
- `buildingsView`
- `productionView`
- `researchesView`
- `missionPlannerView`
- `operationsView`
- `reportsView`
- `mailView`
- `diplomacyView`

## Current Shared Mechanics

### Open / close behavior

- Tutorials auto-open per view if that view is unread for the current game session.
- Manual reopen via the `?` button always starts from step 1.
- Closing with `X` still marks the current tutorial as read.
- Finishing the last step marks the current tutorial as read.
- `Skip all tutorials` marks every tutorial as read for the current game.

### Read-state persistence

- Read-state is per player/game, not account-global.
- The read map lives on `Player.tutorialRead`.
- It is mirrored into auth/session state and refreshed from the server.

### Step flow

For target-aware steps the current sequence is:

1. `focus`
2. `highlight`
3. `bubble`

Details:

- `focus`: target is brought into view and the layout is measured.
- `highlight`: spotlight and highlight ring appear.
- `bubble`: character + bubble dock appears.
- Clicking `Next` during staging finishes the current step instantly first, then the next click advances.

### Scroll behavior

- While a tutorial is open, page scrolling is locked.
- Wheel, touch-scroll, and scroll-style keyboard input are blocked outside the tutorial bubble.
- This is required to keep spotlight/highlight synchronized with the target element.

### Character and bubble behavior

- Current desktop dock is VN-style: the whole dock sits to the left or right of the highlighted target.
- Inside the dock, bubble and character are stacked vertically.
- Bubble is placed above or below the character depending on resolved placement.
- If two consecutive steps resolve to the same character side and `characterImages` contains more than one image, the next step uses the alternate image index.

### Reduced motion

- If the browser prefers reduced motion, staged delays are skipped and the bubble appears directly.

## Tutorial Step Model

`TutorialStep` currently supports:

- `heading`
- `bodyHtml`
- `characterImages`
- `characterSide`
- `bubblePosition`
- `mirrorCharacter`
- `imagePath`
- `imageAlt`
- `targetId`
- `targetPadding`

Notes:

- `targetId` activates target-aware spotlight and placement.
- `targetId` is optional. A whole-view intro step can intentionally omit it and show only the bubble/character dock without spotlighting one concrete element.
- `targetPadding` expands the measured highlighted rectangle.
- `characterImages` should usually contain 2 images for polished steps, so same-side alternation can work.
- Static `characterSide` / `bubblePosition` are still part of content, but for target-aware steps the runtime may resolve smarter placement around the target.

## Target Authoring Rules

### Preferred targeting method

Use explicit template anchors:

```html
<section data-tutorial-id="planet-overview"></section>
```

This is the preferred and most stable approach.

Important layout rule:

- Prefer adding `data-tutorial-id` to the existing layout element instead of introducing a new neutral wrapper.
- If a wrapper is necessary, preserve any layout classes that the original element relied on.
- Otherwise grid/flex placement can break, as happened in `Buildings View` and `Production View` when the summary-bar wrapper stopped carrying `.game-dashboard__resources`.

### Target selection rules

- Prefer stable container-level anchors over brittle child selectors.
- Do not force a target onto a pure intro step. If the step is only explaining the purpose of the whole view, leave it untargeted.
- Spotlight one meaningful area, not a whole screen, unless the section itself is the feature being taught.
- For repeated rows/lists, prefer one representative item when possible.
- Use names that are view-specific and semantic, for example:
  - `planet-summary`
  - `mission-planner-target-card`
  - `galactic-note-action`

### When a target is conditionally hidden

If the target only exists on a specific tab/substate, the view should prepare that state before the tutorial measures the target.

Current mechanism:

- Register a per-view step preparer through `TutorialService.registerStepPreparer(...)`.
- The preparer can safely switch tabs or reveal a panel before target measurement.

Current example:

- `Planet View` uses a preparer to switch between `Resources` and `Queues` when the active tutorial step needs it.

Important:

- Step preparers should only perform safe, non-destructive UI state changes.
- They should not trigger writes or risky gameplay actions.

## Safe Default-State Rules

Before polishing a view, decide whether its first-load state is tutorial-ready.

Preferred approach:

- auto-select or preload safe local UI state on first open
- avoid synthetic tutorial clicks when the same result can be achieved by default state

Good examples already implemented:

- `Galaxy View`: auto-selects and preloads the home system when there is no current selection.
- `Mission Planner`: auto-selects the first owned planet with ships as origin and now also preselects a default owned target when no route-prefill target exists.

Avoid:

- saving data
- creating fleets
- mutating gameplay state
- forcing modal flows just for tutorial presentation

## Placement Rules

The current desktop intent is:

- spotlight the described element
- place the dock to the left or right of it
- stack bubble and character vertically
- keep bubble visually connected to the character

Original placement heuristics used during phase-2 design:

- element TL -> bubble bottom, character right
- element BL -> bubble top, character right
- element TC -> bubble bottom, character right
- element BR -> bubble top, character left
- element TR -> bubble bottom, character left
- element BC -> bubble top, character right

Runtime behavior:

- `TutorialService` resolves side/vertical placement from the target rect.
- It also applies edge fallback when the preferred side would clip near viewport bounds.

## Copywriting Rules

When rewriting tutorial text:

- describe the actual live screen, not a generic idea of the screen
- explain what the player can do here and why it matters
- avoid repeating obvious labels without interpretation
- keep each step focused on one element or one small cluster
- do not force every view into 4 steps

Step count should match the view.

Typical outcome:

- 5 to 7 steps is often more natural than 4.

## Recommended Rollout Pattern For A New View

When polishing a view to phase-2 quality:

1. Inspect the first-load state and decide whether it is tutorial-ready.
2. Add stable `data-tutorial-id` anchors in the template.
3. If needed, add safe preload/default selection logic.
4. If needed, register a per-view step preparer for hidden targets.
5. Rewrite the tutorial in `tutorial-content.ts` with accurate step count.
6. Prefer `characterImages` arrays with 2 images per step flow.
7. Verify target visibility and desktop placement.
8. Run:
   - `npx.cmd tsc -p tsconfig.app.json --noEmit`
   - `npm.cmd run build`

## Current Phase-2 View Status

### Already polished

#### `galacticView`

- Anchors:
  - `galactic-grid`
  - `galactic-home-cell`
  - `galactic-route-toggle`
  - `galactic-system-preview`
  - `galactic-planet-mini-cards`
  - `galactic-own-fleets`
  - `galactic-note-action`
- Safe preload:
  - home system auto-select/preload when no current selection exists
- Current step count:
  - 8

#### `planetView`

- Anchors:
  - `planet-summary`
  - `planet-overview`
  - `planet-navigation`
  - `planet-tab-bar`
  - `planet-resource-card`
  - `planet-queues-grid`
- Safe view preparation:
  - step preparer switches between `Resources` and `Queues`
- Current step count:
  - 6

#### `missionPlannerView`

- Anchors:
  - `mission-planner-mission-types`
  - `mission-planner-target-card`
  - `mission-planner-origin-rail`
  - `mission-planner-details-card`
  - `mission-planner-travel-summary`
  - `mission-planner-fleet-composition`
  - `mission-planner-launch-readiness`
- Safe preload:
  - first owned planet with ships is auto-selected as origin
  - first owned planet different from origin is auto-selected as default target when no route-prefill target exists
- Current step count:
  - 8

#### `reportsView`

- Anchors:
  - `reports-tabs`
  - `reports-actions`
  - `reports-inbox-list`
  - `reports-detail-head`
  - `reports-detail-stats`
  - `reports-detail-body`
- Safe preload:
  - first visible report is preselected into the detail pane without marking it read
- Current step count:
  - 6

#### `operationsView`

- Anchors:
  - `operations-header`
  - `operations-main-state`
  - `operations-primary-card`
  - `operations-card-actions`
- Auto-open behavior:
  - tutorial auto-opens only when at least one active fleet exists
  - manual reopen remains available even on empty state
- Current step count:
  - 4

#### `imperiumView`

- Anchors:
  - `imperium-summary-bar`
  - `imperium-empire-totals`
  - `imperium-attention-panel`
  - `imperium-owned-planets`
  - `imperium-primary-planet-card`
  - `imperium-fleet-totals`
  - `imperium-building-stats`
- Safe preload:
  - none needed; the dashboard already opens in a populated aggregate state
- Current step count:
  - 7

#### `buildingsView`

- Anchors:
  - `buildings-summary-bar`
  - `buildings-mode-toggle`
  - `buildings-queue-card`
  - `buildings-list`
  - `buildings-primary-row`
  - `buildings-planet-rail`
- Safe preload:
  - none needed; first owned planet is already selected and `Resources infrastructure` is the default mode
- Current step count:
  - 6

#### `productionView`

- Anchors:
  - `production-summary-bar`
  - `production-mode-toggle`
  - `production-queue-grid`
  - `production-shipyard-queue`
  - `production-list`
  - `production-primary-row`
  - `production-planet-rail`
- Safe preload:
  - none needed; first owned planet is already selected and `Shipyard` is the default mode
- Current step count:
  - 7

#### `researchesView`

- Anchors:
  - `researches-labs-panel`
  - `researches-queue-card`
  - `researches-tech-list`
  - `researches-primary-tech-card`
- Safe preload:
  - none needed for data selection, but tutorial open is deferred until after the initial DOM render so lab controls and cards exist before spotlight measurement
- Current step count:
  - 4

#### `mailView`

- Anchors:
  - `mail-compose-action`
  - `mail-pending-requests`
  - `mail-resolved-requests`
  - `mail-messages`
- Safe preload:
  - none needed; tutorial targets intentionally use always-present mail sections so the walkthrough still works on empty inboxes
- Current step count:
  - 5

#### `diplomacyView`

- Anchors:
  - `diplomacy-contacts`
  - `diplomacy-detail-panel`
  - `diplomacy-treaty-controls`
  - `diplomacy-direct-message`
  - `diplomacy-proposals`
- Safe preload:
  - first discovered contact is auto-selected when any contact exists
  - tutorial targets intentionally anchor the always-present contact/detail/proposal containers so the walkthrough still works on empty-state diplomacy screens
- Current step count:
  - 4

### Still pending for phase-2 polish

None.

Recommended order at the time this file was written:

Phase-2 rollout is complete for currently supported tutorial views.

## Practical Warnings

- `tutorial-overlay.component.css` currently exceeds its component stylesheet budget by about `761 bytes`.
- Angular build still reports the main bundle budget warning plus several component stylesheet budget warnings on larger game views.
- Chrome MCP has been unreliable in this environment; when browser inspection is needed, use the documented fallback workflow from `McpTesting.md`.
- Latest browser baseline check on `2026-04-02` used the documented Playwright fallback with `TestUserA` and a fresh `smokeSuite` game plus one seeded player `Move` mission. All 11 tutorialized routes opened, stepped past intro into a live spotlight on step 2, and produced no console or page errors.

## Maintenance Rule

Whenever a tutorialized view changes materially:

- update its targets if the DOM moved
- review step copy for accuracy
- confirm safe default state still exists
- update this file if a new pattern or caveat was introduced
