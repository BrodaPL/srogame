import { TutorialEntry, TutorialViewKey } from './tutorial-types';

const secretaryImageA = 'images/instructors/secretary_1_waifu.png';
const secretaryImageB = 'images/instructors/secretary_2_waifu.png';
const commanderImageA = 'images/instructors/commander_1_waifu.png';
const spaceOfficerImageA = 'images/instructors/spaceOfficer_1_waifu.png';
const spaceOfficerImageB = 'images/instructors/spaceOfficer_2_waifu.png';
const scientistImageA = 'images/instructors/scientist_1_waifu.png';
const scientistImageB = 'images/instructors/scientist_2_waifu.png';
const engineerImageA = 'images/instructors/engineer_1_waifu.png';
const engineerImageB = 'images/instructors/engineer_2_waifu.png';
const builderImageA = 'images/instructors/builder_1_waifu.png';
const builderImageB = 'images/instructors/builder_2_waifu.png';
const pilotImageA = 'images/instructors/pilot_1_waifu.png';
const pilotImageB = 'images/instructors/pilot_2_waifu.png';

export const TUTORIAL_CONTENT: Partial<Record<TutorialViewKey, TutorialEntry>> = {
  missionPlannerView: {
    key: 'missionPlannerView',
    title: 'Mission Planner View Tutorial',
    steps: [
      {
        heading: 'Welcome to Mission Planner View',
        bodyHtml: `
          <p>This screen is your launch deck for fleet missions.</p>
          <p>Here you choose a mission type, assemble ships, define origin and target, and validate whether the operation can actually begin.</p>
        `,
        characterImages: [pilotImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Mission Type, Origin, and Target',
        bodyHtml: `
          <p>Start by selecting the mission type, then choose an origin planet from the rail and resolve the target coordinates or target planet.</p>
          <p>The planner adapts its requirements and warnings depending on whether you are moving, transporting, spying, or colonizing.</p>
        `,
        characterImages: [pilotImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Fleet Composition and Cargo',
        bodyHtml: `
          <p>The fleet panel lets you pick ship amounts and filter them by purpose, while the summary panels track cargo, hangar capacity, distance, ETA, and fuel.</p>
          <p>This gives you a compact operational preview before you commit the mission.</p>
        `,
        characterImages: [pilotImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Warnings and Launch Readiness',
        bodyHtml: `
          <p>The warning list is your final mission checklist. It blocks invalid launches and still shows softer notes for things that are possible but not ideal.</p>
          <p>Use Mission Planner whenever you want to confirm that ships, cargo, fuel, and mission rules all line up correctly.</p>
        `,
        characterImages: [pilotImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
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
          <p>This screen lists your active outbound fleets in one place.</p>
          <p>Use it to track what missions are already in flight without returning to every origin planet.</p>
        `,
        characterImages: [spaceOfficerImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Reading Fleet Rows',
        bodyHtml: `
          <p>Each operation shows mission type, origin, target, cargo, ETA, and the current ship composition.</p>
          <p>This gives you a quick operational picture of what is moving across space right now.</p>
        `,
        characterImages: [spaceOfficerImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Mission Awareness',
        bodyHtml: `
          <p>Operations View is especially useful after sending several fleets from Mission Planner.</p>
          <p>Instead of checking each planet manually, you can verify where your transports, spies, and colonizers are headed.</p>
        `,
        characterImages: [spaceOfficerImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Using Operations Strategically',
        bodyHtml: `
          <p>Think of this screen as your command ledger for active missions.</p>
          <p>It helps you avoid sending duplicate fleets, confirm expected arrivals, and understand how much of your mobile force is already committed.</p>
        `,
        characterImages: [spaceOfficerImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
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
          <p>This screen is your compact construction center for planetary infrastructure.</p>
          <p>It gathers building management into one place, so you can develop colonies faster than switching through individual Planet Views.</p>
        `,
        characterImages: [builderImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Choosing Planets and Categories',
        bodyHtml: `
          <p>The rail on the right lets you switch the active planet, while the category buttons change between <strong>Resources infrastructure</strong> and <strong>Facilities</strong>.</p>
          <p>This helps you compare colonies and focus on the exact type of development you want to manage.</p>
        `,
        characterImages: [builderImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Queues and Planet Status',
        bodyHtml: `
          <p>The top summary bar reflects the selected planet, including resources, income, energy, and production power.</p>
          <p>Below it, the building queue card shows what is already scheduled, or warns you when a planet has nothing under construction.</p>
        `,
        characterImages: [builderImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Compact Build Rows',
        bodyHtml: `
          <p>Each building row shows current level, next-level costs, unmet requirements, and the action to queue construction.</p>
          <p>Use Buildings View when you want fast empire-wide infrastructure planning without the heavier Planet View layout.</p>
        `,
        characterImages: [builderImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
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
          <p>This screen is your centralized ship-production hub.</p>
          <p>It lets you manage shipyard queues across owned planets without returning to each individual Planet View.</p>
        `,
        characterImages: [engineerImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Selecting Planets and Categories',
        bodyHtml: `
          <p>The planet rail on the right switches the active production planet, while the top category buttons swap between <strong>Shipyard</strong> and future <strong>Defences</strong>.</p>
          <p>This makes it easy to review several colonies quickly and compare their current production state.</p>
        `,
        characterImages: [engineerImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Queue and Resource Awareness',
        bodyHtml: `
          <p>The top resource bar reflects the selected planet, including income, energy, and power values that affect production planning.</p>
          <p>Below it, the queue panels show current shipyard progress and leave space for future defence production.</p>
        `,
        characterImages: [engineerImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Ordering Ships Efficiently',
        bodyHtml: `
          <p>Each ship row shows amount input, single and total costs, unmet requirements, and the action to add another order to the queue.</p>
          <p>Use Production View when you want a compact overview of what each colony can build right now.</p>
        `,
        characterImages: [engineerImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
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
          <p>This screen is your inbox for intelligence, battle results, system messages, and other important updates.</p>
          <p>Use it to track what happened across your empire without checking every planet manually.</p>
        `,
        characterImages: [secretaryImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Filtering and Reading Reports',
        bodyHtml: `
          <p>You can filter reports by type or show them all together.</p>
          <p>Opening a report marks it as read, and the detail pane on the right shows the full message or structured dossier data.</p>
        `,
        characterImages: [secretaryImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Previewing Locations',
        bodyHtml: `
          <p>Some reports include source coordinates. In those cases you can preview the related planet directly from the report.</p>
          <p>This helps you jump from intelligence to action without leaving the inbox flow.</p>
        `,
        characterImages: [secretaryImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Inbox Management',
        bodyHtml: `
          <p>You can select visible reports, delete them, and keep your inbox organized.</p>
          <p>Reports View is especially useful for espionage summaries, because the right-side dossier layout groups known resources, buildings, ships, and other discovered data.</p>
        `,
        characterImages: [secretaryImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
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
          <p>This is your empire-wide strategic dashboard.</p>
          <p>Instead of focusing on one planet, Imperium summarizes resources, queues, production power, and warnings across everything you own.</p>
        `,
        characterImages: [commanderImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Empire Summary',
        bodyHtml: `
          <p>The top summary bar combines your stored resources, global income, energy state, and total production powers.</p>
          <p>Use it to understand the overall condition of your empire without opening each planet separately.</p>
        `,
        characterImages: [commanderImageA],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Needs Attention and Owned Planets',
        bodyHtml: `
          <p>The attention panel groups planets with important problems like energy shortage, empty queues, or reduced production power.</p>
          <p>The owned-planets section lets you compare queue state and warning state across your whole empire in one place.</p>
        `,
        characterImages: [commanderImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Fleet and Building Statistics',
        bodyHtml: `
          <p>Imperium also aggregates ship counts by type and shows average, minimum, and maximum building levels.</p>
          <p>Use these statistics to find weak infrastructure, track military growth, and decide where to invest next.</p>
        `,
        characterImages: [commanderImageA],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
      }
    ]
  },
  researchesView: {
    key: 'researchesView',
    title: 'Research View Tutorial',
    steps: [
      {
        heading: 'Welcome to Research View',
        bodyHtml: `
          <p>This screen controls your empire-wide technology progress.</p>
          <p>Here you assign Research Labs, start new technologies, and monitor how much research power your planets can contribute.</p>
        `,
        characterImages: [scientistImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Assigning Labs',
        bodyHtml: `
          <p>Each technology needs one main lab to start research.</p>
          <p>If you have more advanced research support, helper labs from other planets can also assist the same technology.</p>
        `,
        characterImages: [scientistImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Requirements and Costs',
        bodyHtml: `
          <p>Every technology row shows the next-level cost, energy requirement, and unmet building or technology requirements.</p>
          <p>Use this view to decide which research is affordable and which prerequisites must be prepared first.</p>
        `,
        characterImages: [scientistImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Research Queue Overview',
        bodyHtml: `
          <p>The queue section summarizes active research, helper-lab participation, invested power, and estimated completion time.</p>
          <p>Research View is the best place to coordinate multiple labs and keep technology development efficient.</p>
        `,
        characterImages: [scientistImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
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
        bubblePosition: 'bottom',
        targetId: 'galactic-grid',
        targetPadding: 18
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
          <p>This screen is the main control room for one planet.</p>
          <p>You can monitor resources, energy, queues, buildings, ships, and the local situation without leaving this page.</p>
        `,
        characterImages: [secretaryImageA],
        characterSide: 'right',
        bubblePosition: 'top',
        mirrorCharacter: false
      },
      {
        heading: 'Top Summary and Warnings',
        bodyHtml: `
          <p>The top bar shows your planet resources, income, energy, and production powers.</p>
          <p>The <strong>Needs Attention</strong> box warns about issues like <strong>Energy insufficient</strong>, <strong>Energy reduction</strong>, empty queues, and inactive research.</p>
        `,
        characterImages: [secretaryImageB],
        characterSide: 'left',
        bubblePosition: 'top',
        mirrorCharacter: true
      },
      {
        heading: 'Planet Navigation',
        bodyHtml: `
          <p>The buttons near the planet image move to the previous or next owned planet.</p>
          <p>The dots in the top resource bar show where this planet sits in your ordered planet list. Their color reflects warning severity.</p>
        `,
        characterImages: [secretaryImageA],
        characterSide: 'right',
        bubblePosition: 'bottom',
        mirrorCharacter: false
      },
      {
        heading: 'Tabs and Production Control',
        bodyHtml: `
          <p>Use the tabs to switch between resource buildings, facilities, ships, defences, operations, and queues.</p>
          <p>On this screen you can also change building power usage, queue construction, and review progress for active production.</p>
        `,
        characterImages: [secretaryImageB],
        characterSide: 'left',
        bubblePosition: 'bottom',
        mirrorCharacter: true
      }
    ]
  }
};
