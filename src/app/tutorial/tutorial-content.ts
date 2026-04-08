import { TutorialEntry, TutorialViewKey } from './tutorial-types';

const secretaryImageA = 'images/instructors/normal/secretary_1_waifu.png';
const secretaryImageB = 'images/instructors/normal/secretary_2_waifu.png';
const commanderImageA = 'images/instructors/normal/commander_1_waifu.png';
const commanderImageB = 'images/instructors/normal/commander_2_waifu.png';
const spaceOfficerImageA = 'images/instructors/normal/spaceOfficer_1_waifu.png';
const spaceOfficerImageB = 'images/instructors/normal/spaceOfficer_2_waifu.png';
const scientistImageA = 'images/instructors/normal/scientist_1_waifu.png';
const scientistImageB = 'images/instructors/normal/scientist_2_waifu.png';
const engineerImageA = 'images/instructors/normal/engineer_1_waifu.png';
const engineerImageB = 'images/instructors/normal/engineer_2_waifu.png';
const builderImageA = 'images/instructors/normal/builder_1_waifu.png';
const builderImageB = 'images/instructors/normal/builder_2_waifu.png';
const pilotImageA = 'images/instructors/normal/pilot_1_waifu.png';
const pilotImageB = 'images/instructors/normal/pilot_2_waifu.png';

const secretaryImages = [secretaryImageA, secretaryImageB];
const commanderImages = [commanderImageA, commanderImageB];

export const TUTORIAL_CONTENT: Partial<Record<TutorialViewKey, TutorialEntry>> = {
  missionPlannerView: {
    key: 'missionPlannerView',
    title: 'Mission Planner View Tutorial',
    steps: [
      {
        heading: 'Welcome to Mission Planner',
        bodyHtml: `
          <p>This screen is your launch deck for fleet missions.</p>
          <p>It brings mission choice, target resolution, fleet assembly, travel math, and launch validation into one flow so you can send fleets without jumping through multiple screens.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Mission Type Comes First',
        bodyHtml: `
          <p>The planner is mission-first. Start by choosing what the fleet should do, then the rest of the screen adapts around that choice.</p>
          <p>Attack, transport, spy, repair, recycle, colonize, bombardment, siege, and Jump Gate capable moves all share this same launch flow.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'mission-planner-mission-types',
        targetPadding: 12
      },
      {
        heading: 'Resolve The Target',
        bodyHtml: `
          <p>The target card is where you resolve the destination. You can paste coordinates manually or reuse planets already visible in the planner.</p>
          <p>When a target is known, the preview card gives you immediate context before you commit ships.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'mission-planner-target-card',
        targetPadding: 12
      },
      {
        heading: 'Origin Rail',
        bodyHtml: `
          <p>The origin rail on the right chooses which of your planets launches the fleet.</p>
          <p>On first open the planner prefers a planet that already has ships, so you can start assembling a mission immediately.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mission-planner-origin-rail',
        targetPadding: 12
      },
      {
        heading: 'Mission Details And Special Controls',
        bodyHtml: `
          <p>This top area reflects the current mission and origin. It shows repair capability, cargo inputs, bomb load context, and other mission-specific controls.</p>
          <p>When the chosen mission supports them, extra cards also appear here for tools like bombard priorities or Jump Gate travel.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mission-planner-details-card',
        targetPadding: 12
      },
      {
        heading: 'Travel Summary',
        bodyHtml: `
          <p>The travel summary turns your current setup into numbers: distance, ETA, return time, fuel reserve, cargo usage, bomb hangars, and total transport capacity.</p>
          <p>Use it to sanity-check the trip before you spend ships and fuel on a bad route, especially on long launches or missions with tight cargo limits.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mission-planner-travel-summary',
        targetPadding: 12
      },
      {
        heading: 'Fleet Composition',
        bodyHtml: `
          <p>This section is where you assemble the actual task force.</p>
          <p>Mission relevance, purpose filters, ready versus damaged ship counts, cargo, hangar capacity, and Jump Gate capability all come together here.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mission-planner-fleet-composition',
        targetPadding: 12
      },
      {
        heading: 'Warnings And Launch Readiness',
        bodyHtml: `
          <p>The launch summary and warning list are your final checklist.</p>
          <p>Errors block launch, softer notes still point out weaker choices, and the launch button only becomes useful when the whole mission setup is coherent.</p>
        `,
        characterImages: [pilotImageA, pilotImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mission-planner-launch-readiness',
        targetPadding: 12
      }
    ]
  },
  operationsView: {
    key: 'operationsView',
    title: 'Operations View Tutorial',
    steps: [
      {
        heading: 'Welcome to Operations View',
        bodyHtml: `
          <p>This screen is your fleet activity board.</p>
          <p>Use it to monitor launched missions in one place, check where fleets are right now, and judge whether you need to send reinforcements or just wait for returns.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Operations List',
        bodyHtml: `
          <p>This area is where your active fleets appear after launch.</p>
          <p>If it is empty, the screen tells you clearly that nothing is currently in flight. Once fleets exist, each mission is shown here as its own operation card.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'operations-main-state',
        targetPadding: 12
      },
      {
        heading: 'Reading An Operation Card',
        bodyHtml: `
          <p>A single operation card gives you the mission type, current state, current position, destination, ETA, fuel, cargo load, ship summary, and repair capability.</p>
          <p>It also shows newer mission states like pending Jump Gate approval, passive or guarding orbit, and mission-failure returns.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'operations-primary-card',
        targetPadding: 12
      },
      {
        heading: 'Live Fleet Commands',
        bodyHtml: `
          <p>The action row gives you the live commands that are currently safe for that fleet.</p>
          <p><strong>Return now</strong> recalls a fleet, <strong>Delay +1</strong> stretches an outbound ETA, and <strong>Request maintenance</strong> opens the Alliance Depot support flow when orbit logistics allow it.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'operations-card-actions',
        targetPadding: 12
      }
    ]
  },
  buildingsView: {
    key: 'buildingsView',
    title: 'Buildings View Tutorial',
    steps: [
      {
        heading: 'Welcome to Buildings View',
        bodyHtml: `
          <p>This screen is the fast construction planner for your empire.</p>
          <p>It keeps the active planet, current queue, and compact building list close together so you can queue infrastructure without dropping back into full Planet View every time.</p>
        `,
        characterImages: [builderImageA, builderImageB],
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Building Categories',
        bodyHtml: `
          <p>The category toggle switches between <strong>Resources infrastructure</strong> and <strong>Facilities</strong>.</p>
          <p>That lets you stay on the same planet while narrowing the list to the kind of development you want to queue next.</p>
        `,
        characterImages: [builderImageA, builderImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'buildings-mode-toggle',
        targetPadding: 12
      },
      {
        heading: 'Current Building Queue',
        bodyHtml: `
          <p>This queue card shows what the active planet is already building, how far the head order has progressed, and the estimated turns remaining.</p>
          <p>You can also drag entries to reorder them and cancel orders here. Started entries keep their invested progress, while refunds depend on how far construction already advanced.</p>
        `,
        characterImages: [builderImageA, builderImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'buildings-queue-card',
        targetPadding: 12
      },
      {
        heading: 'Construction List',
        bodyHtml: `
          <p>This section is the compact building catalog for the active planet.</p>
          <p>It is designed for faster empire management than full Planet View, while still keeping costs, requirements, and queue actions close together.</p>
        `,
        characterImages: [builderImageA, builderImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'buildings-list',
        targetPadding: 12
      },
      {
        heading: 'A Single Building Row',
        bodyHtml: `
          <p>Each row shows the current level, next-level cost chips, unmet requirements, and the build action.</p>
          <p>This is the exact decision point for queueing the next upgrade on the selected colony without leaving the compact empire-management flow.</p>
        `,
        characterImages: [builderImageA, builderImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'buildings-primary-row',
        targetPadding: 12
      },
      {
        heading: 'Owned Planets Rail',
        bodyHtml: `
          <p>The rail on the right changes the active construction planet.</p>
          <p>Use it to compare colonies quickly and queue infrastructure without bouncing back and forth through separate planet pages.</p>
        `,
        characterImages: [builderImageA, builderImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'buildings-planet-rail',
        targetPadding: 12
      }
    ]
  },
  productionView: {
    key: 'productionView',
    title: 'Production View Tutorial',
    steps: [
      {
        heading: 'Welcome to Production View',
        bodyHtml: `
          <p>This screen is the compact production planner for ships and defences.</p>
          <p>It keeps the active planet, live mixed queue, and production catalog in one place so you can line up military output quickly across multiple colonies.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Production Categories',
        bodyHtml: `
          <p>The category toggle switches between <strong>Shipyard</strong> and <strong>Defences</strong>.</p>
          <p>Both are live now, so the same planet can queue ships, static defences, and planetary bombs through one management screen.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'production-mode-toggle',
        targetPadding: 12
      },
      {
        heading: 'Shared Queue Management',
        bodyHtml: `
          <p>This queue area shows what the active planet is already producing.</p>
          <p>The visible order now matches the real mixed execution order for ships and defences, and you can drag entries to reorder them or cancel them directly here.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'production-queue-grid',
        targetPadding: 12
      },
      {
        heading: 'Current Production Queue',
        bodyHtml: `
          <p>This card is the live queue for the selected planet, even though the heading still says Shipyard.</p>
          <p>Use it to see whether production is already active, how full the queue is, how much has already completed, and how long the current order still needs.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'production-shipyard-queue',
        targetPadding: 12
      },
      {
        heading: 'Production List',
        bodyHtml: `
          <p>This section is the compact production catalog for the active planet.</p>
          <p>Switching the mode changes the list between ships and defences, while keeping the same fast empire-level management layout.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'production-list',
        targetPadding: 12
      },
      {
        heading: 'A Single Production Row',
        bodyHtml: `
          <p>Each row combines amount input, single and total costs, unmet requirements, and the build action.</p>
          <p>In ship mode this means mobile fleet production, while defence mode uses the same compact pattern for turrets, shields, and planetary bombs.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'production-primary-row',
        targetPadding: 12
      },
      {
        heading: 'Owned Planets Rail',
        bodyHtml: `
          <p>The rail on the right changes the active production planet.</p>
          <p>Use it to compare colonies quickly and queue ships across your empire without jumping in and out of separate planet screens.</p>
        `,
        characterImages: [engineerImageA, engineerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'production-planet-rail',
        targetPadding: 12
      }
    ]
  },
  reportsView: {
    key: 'reportsView',
    title: 'Reports View Tutorial',
    steps: [
      {
        heading: 'Welcome to Reports View',
        bodyHtml: `
          <p>This screen is your empire inbox.</p>
          <p>It keeps the report list and the selected dossier side by side, so you can scan what happened, filter it by type, and read the details without leaving the view.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Selection And Cleanup',
        bodyHtml: `
          <p>The footer under the tabs keeps track of how many reports are visible and how many are selected.</p>
          <p>Use <strong>Select all visible</strong> and <strong>Delete selected</strong> to clean the inbox without opening each entry one by one.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'reports-actions',
        targetPadding: 12
      },
      {
        heading: 'Inbox List',
        bodyHtml: `
          <p>The left column is the actual inbox. Unread reports stand out more strongly, and clicking one opens it in the detail pane.</p>
          <p>Checkboxes are only for bulk actions, while opening a report is what marks unread entries as read.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'reports-inbox-list',
        targetPadding: 12
      },
      {
        heading: 'Selected Report Header',
        bodyHtml: `
          <p>The top of the detail pane shows the selected report title, type, and turn.</p>
          <p>If the report has usable coordinates, the same header area also lets you preview the related location without leaving the inbox flow.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'reports-detail-head',
        targetPadding: 12
      },
      {
        heading: 'Quick Detail Stats',
        bodyHtml: `
          <p>This stat row summarizes the currently selected report: read state, source, coordinates, and sender.</p>
          <p>It gives you the basic context before you dive into the full message body or dossier.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'reports-detail-stats',
        targetPadding: 12
      },
      {
        heading: 'Full Report Body',
        bodyHtml: `
          <p>This scroll area holds the full content of the selected report.</p>
          <p>Plain reports show their text directly, while espionage reports expand into a structured dossier with resources, buildings, ships, defences, and planetary parameters.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'reports-detail-body',
        targetPadding: 12
      }
    ]
  },
  mailView: {
    key: 'mailView',
    title: 'Mail View Tutorial',
    steps: [
      {
        heading: 'Welcome to Mail',
        bodyHtml: `
          <p>This screen is your communication center.</p>
          <p>It combines player messages with diplomacy, Jump Gate, and maintenance requests so you can clear blockers and handle empire communication in one place.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Compose New Mail',
        bodyHtml: `
          <p>Use this button to open the shared mail composer.</p>
          <p>You can send direct player messages here, and some flows like replies reuse the same dialog with the recipient already locked in.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'mail-compose-action',
        targetPadding: 12
      },
      {
        heading: 'Pending Requests',
        bodyHtml: `
          <p>This section is for live requests that still need an answer.</p>
          <p>Incoming requests are especially important because unresolved ones can block End Turn until you approve, partially approve, reject, or otherwise clear them.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'mail-pending-requests',
        targetPadding: 12
      },
      {
        heading: 'Resolved Request History',
        bodyHtml: `
          <p>Resolved requests stay here until you delete them manually.</p>
          <p>This is the easiest place to confirm how a Jump Gate, diplomacy, or maintenance negotiation ended after the active decision is already over.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mail-resolved-requests',
        targetPadding: 12
      },
      {
        heading: 'Messages',
        bodyHtml: `
          <p>The message section separates unread and read mail. Opening a message marks it as read and exposes its reply or delete actions.</p>
          <p>This makes Mail the place to clear message blockers, follow negotiations, and handle direct human communication without mixing it into Reports.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'mail-messages',
        targetPadding: 12
      }
    ]
  },
  diplomacyView: {
    key: 'diplomacyView',
    title: 'Diplomacy View Tutorial',
    steps: [
      {
        heading: 'Welcome to Diplomacy',
        bodyHtml: `
          <p>This screen is where discovered factions become manageable contacts.</p>
          <p>Use it to review relations, inspect known planets from espionage intel, and prepare proposals before the actual accept or reject flow continues through Mail.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Discovered Contacts',
        bodyHtml: `
          <p>The contact list only shows players you have actually discovered through current espionage-backed intel.</p>
          <p>It is your fast index for who is known, what their current status is, and whether treaty proposals are available this turn.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'diplomacy-contacts',
        targetPadding: 12
      },
      {
        heading: 'Selected Contact Detail',
        bodyHtml: `
          <p>This detail panel summarizes the selected contact, their known planets, and the actions currently available against them.</p>
          <p>When a contact is selected, this is where you prepare treaty proposals and open the shared direct-message composer.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'diplomacy-detail-panel',
        targetPadding: 12
      },
      {
        heading: 'Active Proposals',
        bodyHtml: `
          <p>This section tracks unresolved diplomacy proposals and tells you whether they are incoming or outgoing.</p>
          <p>The proposals stay visible here for context, but Mail is where acceptance, rejection, and cancellation are completed.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'diplomacy-proposals',
        targetPadding: 12
      }
    ]
  },
  imperiumView: {
    key: 'imperiumView',
    title: 'Imperium View Tutorial',
    steps: [
      {
        heading: 'Welcome to Imperium View',
        bodyHtml: `
          <p>This screen is the strategic dashboard for your whole empire.</p>
          <p>It aggregates economy, warnings, colonies, fleets, and infrastructure into one place so you can decide what needs attention before diving into individual planets.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Empire Totals',
        bodyHtml: `
          <p>This block gives the most compact empire totals: number of planets, total ships, and how many building, shipyard, and research queues are currently active.</p>
          <p>Use it to answer quickly whether your empire is growing or sitting idle.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'imperium-empire-totals',
        targetPadding: 12
      },
      {
        heading: 'Needs Attention',
        bodyHtml: `
          <p>The attention panel groups planets by problem type, such as energy shortage, empty queues, or reduced production power.</p>
          <p>Each entry acts like a prioritized to-do list, and the planet links let you jump straight to the affected colony.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'imperium-attention-panel',
        targetPadding: 12
      },
      {
        heading: 'Owned Planets Overview',
        bodyHtml: `
          <p>This section is the heart of Imperium. It lets you sort and filter all colonies, then compare them as compact management cards.</p>
          <p>It is the fastest way to scan queue state, production output, power values, and local warning state across your empire.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'imperium-owned-planets',
        targetPadding: 12
      },
      {
        heading: 'A Single Planet Card',
        bodyHtml: `
          <p>Each planet card condenses one colony into practical numbers: resource income, energy, power, repair capability, local warnings, and queue summaries.</p>
          <p>This is where you compare colonies quickly and decide which one needs your next action.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'imperium-primary-planet-card',
        targetPadding: 12
      },
      {
        heading: 'Fleet Totals',
        bodyHtml: `
          <p>This block aggregates owned ships by type across all planets.</p>
          <p>Use it to estimate military scale, transport capacity, and whether your empire can support another wave of missions or combat.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'imperium-fleet-totals',
        targetPadding: 12
      },
      {
        heading: 'Building Statistics',
        bodyHtml: `
          <p>The building table summarizes average, minimum, and maximum levels for every building type across your empire.</p>
          <p>It helps you spot weak infrastructure, uneven development, and the next obvious upgrade targets at a strategic level.</p>
        `,
        characterImages: commanderImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'imperium-building-stats',
        targetPadding: 12
      }
    ]
  },
  researchesView: {
    key: 'researchesView',
    title: 'Research View Tutorial',
    steps: [
      {
        heading: 'Research Labs Overview',
        bodyHtml: `
          <p>This panel shows every owned planet that currently has a Research Lab.</p>
          <p>It tells you which labs are free, which are already researching or helping, and how much research power each one can contribute.</p>
        `,
        characterImages: [scientistImageA, scientistImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'researches-labs-panel',
        targetPadding: 12
      },
      {
        heading: 'Queued Technologies',
        bodyHtml: `
          <p>This queue section summarizes active research across the empire.</p>
          <p>It shows the researching planet, target level, helper-lab count, invested power, and estimated turns remaining.</p>
        `,
        characterImages: [scientistImageA, scientistImageB],
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'researches-queue-card',
        targetPadding: 12
      },
      {
        heading: 'Technology Catalog',
        bodyHtml: `
          <p>This list is the empire-wide research catalog.</p>
          <p>Each technology card lets you review the next level and prepare a valid lab assignment before you try to start research.</p>
        `,
        characterImages: [scientistImageA, scientistImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'researches-tech-list',
        targetPadding: 12
      },
      {
        heading: 'A Single Technology Card',
        bodyHtml: `
          <p>A technology card combines current level, energy requirement, research time, lab assignment, requirements, cost, and the start action.</p>
          <p>This is the full decision point for choosing the next technology and proving that your empire can actually research it now.</p>
        `,
        characterImages: [scientistImageA, scientistImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'researches-primary-tech-card',
        targetPadding: 12
      }
    ]
  },
  galacticView: {
    key: 'galacticView',
    title: 'Galaxy View Tutorial',
    steps: [
      {
        heading: 'Welcome to Galaxy View',
        bodyHtml: `
          <p>This grid is your strategic map of the discovered galaxy.</p>
          <p>Use it to scan many star systems quickly, compare occupied areas, and decide where to inspect, expand, spy, or avoid.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom'
      },
      {
        heading: 'Your Home System Is Preselected',
        bodyHtml: `
          <p>When this screen opens, your home system is selected automatically so the right-side preview already has useful data.</p>
          <p>This gives you a reliable starting point before you inspect neighboring systems.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-home-cell',
        targetPadding: 10
      },
      {
        heading: 'Reading Grid Meaning',
        bodyHtml: `
          <p>Each cell is one star system. The number shows planets, small dots can indicate asteroids, and filled ownership markers show your own presence.</p>
          <p>Cell color helps you read the local situation fast: your territory, neutral systems, and hostile or mixed systems stand out visually.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-grid',
        targetPadding: 18
      },
      {
        heading: 'Fleet Route Overlays',
        bodyHtml: `
          <p>The route toggle turns your own active fleet routes on or off across the map.</p>
          <p>When enabled, the grid shows outbound and returning arrows, aggregates duplicate routes into count badges, and helps you read where your traffic is already committed.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-route-toggle',
        targetPadding: 12
      },
      {
        heading: 'Star System Preview',
        bodyHtml: `
          <p>The preview panel summarizes the selected system with coordinates, planet count, asteroid count, and local status.</p>
          <p>Think of it as the detail pane for whatever cell you are currently evaluating on the map.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-system-preview',
        targetPadding: 14
      },
      {
        heading: 'Planet Mini-Cards',
        bodyHtml: `
          <p>When system data is available, each planet appears here as a compact mini-card.</p>
          <p>These cards let you read ownership and local basics without leaving Galaxy View for a heavier full-screen inspection.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-planet-mini-cards',
        targetPadding: 12
      },
      {
        heading: 'Own Fleets In System',
        bodyHtml: `
          <p>If one of your fleets is currently stationed in the selected system, it appears here with mission, status, ETA, and route summary.</p>
          <p>This works together with the green route overlays and green-highlighted cell values so you can see both where your fleets are and where they are headed.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-own-fleets',
        targetPadding: 12
      },
      {
        heading: 'System Notes',
        bodyHtml: `
          <p>You can mark systems with notes to remember expansion targets, risky zones, or important enemy locations.</p>
          <p>Use notes as lightweight map memory so you do not need to rely only on reports or recollection.</p>
        `,
        characterImages: [spaceOfficerImageA, spaceOfficerImageB],
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'galactic-note-action',
        targetPadding: 12
      }
    ]
  },
  planetView: {
    key: 'planetView',
    title: 'Planet View Tutorial',
    steps: [
      {
        heading: 'Welcome to Planet View',
        bodyHtml: `
          <p>This screen is the main control room for a single colony.</p>
          <p>It combines local economy, buildings, ships, warnings, and queues into one place so you can manage a planet in detail without hopping between separate screens.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top'
      },
      {
        heading: 'Overview, Parameters, And Warnings',
        bodyHtml: `
          <p>This overview block combines the planet portrait with practical status panels.</p>
          <p><strong>Planet Parameters</strong> show local production modifiers, while <strong>Needs Attention</strong> warns about issues like bad energy balance, empty queues, or idle research capacity.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'planet-overview',
        targetPadding: 12
      },
      {
        heading: 'Planet Navigation',
        bodyHtml: `
          <p>The arrow buttons beside the planet image move through your owned planets without leaving Planet View.</p>
          <p>Use them when you want to review several colonies quickly while keeping the same management layout.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'planet-navigation',
        targetPadding: 12
      },
      {
        heading: 'Management Tabs',
        bodyHtml: `
          <p>The tab bar splits the planet into focused work areas: economy, facilities, ships, and queues.</p>
          <p>You do not need separate screens for most local management. Switch tabs here when you want to stay on the same planet and go deeper.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'planet-tab-bar',
        targetPadding: 10
      },
      {
        heading: 'Resource Building Cards',
        bodyHtml: `
          <p>Each building card shows level, output, power usage, next costs, and requirement checks in one place.</p>
          <p>This is where you inspect the local economy and queue the next upgrade when the planet is ready.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'bottom',
        targetId: 'planet-resource-card',
        targetPadding: 12
      },
      {
        heading: 'Queues For This Planet',
        bodyHtml: `
          <p>The queues tab gathers current construction, shipyard work, and research activity for this colony.</p>
          <p>Use it to see what is already in progress, what is waiting next, and where the planet may need your attention.</p>
        `,
        characterImages: secretaryImages,
        characterSide: 'right',
        bubblePosition: 'top',
        targetId: 'planet-queues-grid',
        targetPadding: 12
      }
    ]
  }
};
