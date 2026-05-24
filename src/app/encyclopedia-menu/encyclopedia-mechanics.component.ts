import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type MechanicStatus = 'Live' | 'Partial' | 'Planned' | 'Not Planned';
type MechanicCategory =
  | 'Economy'
  | 'Queues'
  | 'Research'
  | 'Planets'
  | 'Galaxy'
  | 'Intel'
  | 'Core Loop';

type MechanicSection = {
  title: string;
  category: MechanicCategory;
  status: MechanicStatus;
  summary: string;
  details: string[];
  formulas?: string[];
  notes?: string[];
};

@Component({
  selector: 'app-encyclopedia-mechanics',
  imports: [NgClass, NgFor, NgIf, RouterLink],
  templateUrl: './encyclopedia-mechanics.component.html'
})
export class EncyclopediaMechanicsComponent {
  readonly statusFilters: Array<'All' | MechanicStatus> = ['All', 'Live', 'Partial', 'Planned', 'Not Planned'];
  readonly categoryFilters: Array<'All' | MechanicCategory> = [
    'All',
    'Economy',
    'Queues',
    'Research',
    'Planets',
    'Galaxy',
    'Intel',
    'Core Loop'
  ];

  selectedStatus: 'All' | MechanicStatus = 'All';
  selectedCategory: 'All' | MechanicCategory = 'All';

  readonly mechanics: MechanicSection[] = [
    {
      title: 'Planet Economy and Power',
      category: 'Economy',
      status: 'Live',
      summary: 'Production depends on current power usage, structural health, energy efficiency, tech multipliers, and effective planetary modifiers.',
      details: [
        'Each powered building has max power equal to level multiplied by blueprint powerConsumption.',
        'Current power is configurable in whole level-steps and scales output instead of hard-disabling it.',
        'Structural damage reduces building effectiveness, with Bunker Network providing a minimum structural floor for most buildings.',
        'Energy insufficient is a planet-wide shortage warning, while Energy reduction means a building was manually throttled.'
      ],
      formulas: [
        'powerUtilization = clamp(currentPower / maxPower, 0, 1)',
        'structuralUtilization = clamp(currentSP / maxSP, minimumStructuralUtilization, 1)',
        'finalBuildingEffectiveness = powerUtilization * structuralUtilization',
        'resourceGain = floor(baseProduction * (1 + adaptiveTechnology / 100) * effectivePlanetModifier * energyEfficiency)'
      ]
    },
    {
      title: 'Building Queue Rules',
      category: 'Queues',
      status: 'Live',
      summary: 'Buildings use a per-planet queue with upfront payment, duplicate-type blocking, drag-and-drop reorder, and cancel support.',
      details: [
        'Queue capacity is calculated from player Computer Technology and planet Robotics Factory.',
        'Only one queued entry per building type is allowed on the same planet.',
        'Resources are deducted immediately when the queue entry is created.',
        'Reordering preserves invested industry progress, and cancel refunds 100% for unstarted entries or 75% after progress starts.'
      ],
      formulas: [
        'maxBuildingQueue = max(1, floor(1 + sqrt(COMPUTER_TECHNOLOGY + ROBOTICS_FACTORY)))'
      ]
    },
    {
      title: 'Trade Port Exchanges',
      category: 'Economy',
      status: 'Live',
      summary: 'Interstellar Trade Port generates planet-local exchange offers each turn, and each offer can be used once for an instant local resource trade.',
      details: [
        'Offer count equals current Interstellar Trade Port level on that planet.',
        'Offers are local to the planet and refresh on every global turn advance.',
        'Each offer exchanges one resource into a different resource type and spends or grants resources immediately on that same planet.',
        'The Trade Port button in Planet View is enabled once the building exists and opens the local offer popup.',
        'Offers stay fixed for the turn once rolled, even if current power or damage later changes.'
      ],
      formulas: [
        'tradePortCapacity = floor(baseCap * tradePortEffectiveness * hyperspaceParameters * (1 + HYPERSPACE_TECHNOLOGY * 0.05) * (1 + GRAVITON_TECHNOLOGY * 0.25) * (1 + JUMP_GATE level * 0.2))',
        'offerCount = INTERSTELLAR_TRADE_PORT level',
        'offerAmount = floor(tradePortCapacity * step), where step is one of 20%, 40%, 60%, 80%, 100%',
        'value ratio = 3 metal = 2 crystal = 1 deuterium',
        'totalCost = ceil(baseCost * (1 + rolledModifier - levelDiscount))',
        'rolledModifier = 5%..40%, levelDiscount = 1% per Trade Port level + 1% per Jump Gate level'
      ],
      notes: [
        'High Trade Port and Jump Gate levels can fully offset the rolled surcharge and produce zero-cost offers, but the final cost never goes below zero.'
      ]
    },
    {
      title: 'Shipyard Queue Rules',
      category: 'Queues',
      status: 'Live',
      summary: 'Ships and defences share one ordered shipyard queue per planet, and queue-management UIs mirror the real execution order.',
      details: [
        'Shipyard level must be above 0 before enqueuing ships or defences.',
        'Each queue entry now contains item kind, unit type, amount, and invested shipyard power.',
        'Ships and defences compete in the same queue order and use the same shipyard power pool.',
        'Reordering preserves invested progress; cancel delivers already finished units first and refunds 75% of the unfinished remainder.'
      ],
      formulas: [
        'maxShipyardQueue = max(1, floor(1 + sqrt(COMPUTER_TECHNOLOGY + SHIPYARD)))'
      ]
    },
    {
      title: 'Research Queue and Helper Labs',
      category: 'Research',
      status: 'Live',
      summary: 'Research starts from one main lab, can scale with helper labs, and uses the same live turn-resolution flow as other queues.',
      details: [
        'A planet can hold one currentResearchQueue entry at a time, and helper labs cannot already be busy.',
        'The same technology cannot be researched in parallel on different planets.',
        'Current research queue management still has no cancel or reorder controls.'
      ],
      formulas: [
        'maxLabsPerTechnology = max(1, floor(1.5 * sqrt(INTERGALACTIC_RESEARCH_NETWORK) + 1))',
        'researchPower = floor(RESEARCH_LAB production1 * (1 + (COMPUTER_TECHNOLOGY * 5 + ADAPTIVE_TECHNOLOGY + INTERGALACTIC_RESEARCH_NETWORK * 2) / 100) * scienceModifier * energyEfficiency)'
      ]
    },
    {
      title: 'Cost Scaling for Upgrades',
      category: 'Economy',
      status: 'Live',
      summary: 'Both building and technology upgrade costs scale by doubling each level.',
      details: [
        'Base costs come from blueprint data.',
        'Server validates requirement checks at enqueue time before subtracting resources.'
      ],
      formulas: [
        'costForLevel(L) = basicCost * 2^(L - 1)'
      ]
    },
    {
      title: 'Planet Generation and Modifiers',
      category: 'Planets',
      status: 'Live',
      summary: 'Random planets roll type-based parameter ranges and base sizes, while starting planets are normalized and terraformer later expands size permanently.',
      details: [
        'Random planets roll base size in range 90..200 with type-specific modifier ranges.',
        'Starting planets are fixed to base size 160 and all planetary multipliers at 1.0.',
        'anomaliesAndNoise and hyperspaceParameters are rolled in 0.05 steps.',
        'Terraformer permanently increases planet size once a level finishes, using the blueprint production1 value of the highest completed terraformer level reached.'
      ],
      formulas: [
        'randomPlanetBaseSize = randomInt(100, 220)',
        'startingPlanetBaseSize = 160',
        'currentPlanetSize = baseSize + permanentTerraformerSizeBonus'
      ]
    },
    {
      title: 'Galaxy Generation and Void Logic',
      category: 'Galaxy',
      status: 'Live',
      summary: 'The map is generated as a circular field with void rules, galaxy-center behavior, and guaranteed nearby neutral pressure in some starts.',
      details: [
        'Only cells inside galaxy radius become systems; outside remains Void.',
        'Galaxy center radius is overwritten as Galaxy Center systems.',
        'Edge systems have an extra 50% forced-void chance before base void chance is applied.',
        'When neutral bots are enabled, human home systems also get one guaranteed low-level neutral neighbor planet if needed.'
      ],
      formulas: [
        'if isEdge and random() < 0.5 => force Void',
        'adjustedVoidChance = baseVoidChance * (isCenterEdge ? 0.5 : 1)'
      ]
    },
    {
      title: 'Galaxy View Fleet Presence and Routes',
      category: 'Galaxy',
      status: 'Live',
      summary: 'Galaxy View now projects your active fleets directly onto the strategic map with route overlays and in-system presence highlights.',
      details: [
        'Own active fleets are serialized into the shared galaxy presentation payload instead of being reconstructed only in the view.',
        'Outbound routes render as green origin-to-target arrows, while returning routes render as darker green target-to-origin arrows.',
        'Multiple fleets on the same route are aggregated into one overlay with a route count badge.',
        'Selected systems list your own fleets currently stationed there, and own-system cell labels turn green and bold when one of your fleets is present.'
      ]
    },
    {
      title: 'Intel, Discovery, and Notes',
      category: 'Intel',
      status: 'Live',
      summary: 'Visibility is report-driven, diplomacy contacts are intel-gated, and notes plus previews are player-specific tools.',
      details: [
        'Galaxy ownership bytes and foreign-planet previews are based on espionage report data available to the current player.',
        'Star-system notes support create, edit, and delete with per-player storage.',
        'Reports and preview widgets can route directly into Planet View or Mission Planner when the player has enough intel.',
        'Diplomacy View only lists discovered contacts, which means the viewer has lastReportData for at least one planet currently owned by that player.'
      ]
    },
    {
      title: 'Sensor Phalanx Scans',
      category: 'Intel',
      status: 'Partial',
      summary: 'Sensor Phalanx backend mechanics are live in phase 1, but they currently feed reports and APIs without a dedicated player-facing screen.',
      details: [
        'Planets with Sensor Phalanx already expose live capability data for range, scan cost, scans-per-turn, and already-used scans through server endpoints.',
        'Active scans consume deuterium from the origin planet and reveal only minimal fleet-contact data: direction, fleet size, ETA, and allied status.',
        'Passive detection runs during turn processing and creates Sensor Phalanx reports only for newly visible incoming fleets.',
        'Current coverage is intentionally narrow: there is still no dedicated scan view yet, and the system does not reveal full fleet composition.'
      ],
      formulas: [
        'normalRange = floor(baseRange * anomaliesAndNoise * finalBuildingEffectiveness)',
        'activeScanRange = max(1, floor(normalRange / 2))',
        'scansPerTurn = floor(sqrt(SENSOR_PHALANX level) * finalBuildingEffectiveness)',
        'scanCost = SENSOR_PHALANX production2 deuterium'
      ]
    },
    {
      title: 'Turn Progression State',
      category: 'Core Loop',
      status: 'Live',
      summary: 'End Turn resolves economy, queues, research, fleet movement and encounters, then repair and report side effects.',
      details: [
        'The server exposes a real end-turn endpoint and increments the galaxy turn after successful processing.',
        'Turn resolution applies income, advances building queues, shipyard queues, and research queues, resolves fleets and encounters, then performs repair passes.',
        'Planet, shipyard, and research queues expose invested/base progress fields in the UI, while Operations, Reports, and Mail reflect the fleet and communication side of turn progression.',
        'Turn-generated side effects also include system reports such as passive Sensor Phalanx detection and orbit-resolution outcomes.'
      ],
      formulas: [
        'turnOrder = income -> building queues -> shipyard queues -> research queues -> fleet movement/encounters -> repair passes'
      ]
    },
    {
      title: 'Sandbox and Test Setup Flags',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Setup options and smoke scenarios can seed planets, ships, neutrals, and curated test states for development.',
      details: [
        'Create random planets assigns extra owned planets with random buildings and resources.',
        'Create starting ships seeds each owned planet with starter amounts for ship blueprints.',
        'Sandbox mode can spawn neutral bots with RNG-scaled buildings, ships, technology, and resources.',
        'Smoke-test scenarios can replace a fresh galaxy with deterministic seeded situations for route, fleet, battle, repair, and diplomacy checks.'
      ]
    },
    {
      title: 'Sending Fleets with Mission Types',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Mission Planner is live for launch across the currently supported mission set, with mission-first validation and shared mission definitions.',
      details: [
        'Mission Planner currently supports Attack, Move, Guard, Transport, Armament Delivery, Spy, Bombard, Siege, Recycle, Repair, and Colonize.',
        'Validation includes coordinates, ownership/diplomacy constraints, ship capability checks, cargo rules, fuel reserves, and active-fleet-cap checks.',
        'Fleet composition splits launch selection into Ready and Damaged counters, and damaged hull entries can still be launched for now.',
        'Fleet lifecycle states are meaningful: fleets can be PENDING_JUMP_GATE, MOVING_TO_TARGET, ORBITING, RETURNING, MISSION_FAILURE_RETURNING, or MISSION_FAILURE_IDLE.',
        'Move to owned planets merges into the target planet, Move to non-hostile foreign or unowned orbit can stay in orbit, Transport delivers cargo then returns, and Spy creates structured espionage reports.',
        'Attack can target WAR, NEUTRAL, and PASSIVE owned planets, resolves hostile arrival combat, and steals metal, crystal, and deuterium after successful arrival resolution if cargo space remains.',
        'Bombard and Siege can store optional Main, Secondary, and Tertiary bombard priorities, which persist on the fleet for later siege turns.',
        'Ship-mounted BOMBARDMENT_WEAPONS now always hit buildings and planetary defences once a bombardment shot actually fires; Siege still keeps its separate 50 percent per-shot trigger failure before that hit step.',
        'Move, Guard, and Transport can optionally use Jump Gate travel when both endpoints have enough capacity; approved Jump Gate launches always use exactly 1 travel turn.',
        'Foreign Jump Gate targets require known gate intel from the latest espionage report and create a Mail request for the target owner unless diplomacy auto-approves it.',
        'Mission Planner can also be prefilled from other screens, for example Spy Planet actions from reports or planet previews.',
        'The Travel Summary now shows the live ETA formula, the current substituted values, the active ship modifier, and the relevant drive-tech levels taken from the selected origin player.'
      ],
      formulas: [
        'maxActiveFleets = 2 + COMPUTER_TECHNOLOGY * 2',
        'travelTurns = ceil((4 / (1 + FUSION_DRIVE / 3) + distance / (1 + HYPERSPACE_DRIVE / 6) - GRAVITON_TECHNOLOGY) * shipModifier), minimum 1',
        'Jump Gate travelTurns = 1',
        'fuelCost = ceil(sum(ship.jumpCost * max(1, distance) * amount) * minimumFuelReserves * max(0, 1 - FUSION_DRIVE * 0.01 - HYPERSPACE_TECHNOLOGY * 0.02))'
      ],
      notes: [
        'Distance is still the raw coordinate delta sum abs(dx) + abs(dy) + abs(dz).',
        'shipModifier uses the slowest selected ship: Small -40%, Medium -25%, Big 0%, Titan +35%, Station +100%.',
        'SPY_PROBE is a Small hull, so it uses the same -40% modifier as other Small ships.',
        'Fuel cost uses raw distance, then Fusion Drive and Hyperspace Technology reduce the total deuterium reserve after the mission reserve multiplier.'
      ]
    },
    {
      title: 'Diplomacy and Friendly Orbit',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Diplomacy is live in both server/domain logic and the player UI, and it directly controls targeting, orbit stance, and encounter behavior.',
      details: [
        'Current statuses are SELF, ALLIED, PEACE, PASSIVE, and WAR, stored symmetrically on the galaxy.',
        'Diplomacy View lists only discovered contacts and can create treaty proposals; proposal management now lives in Mail.',
        'Treaty proposals are limited to one outgoing total per turn, block duplicate pending pair proposals, can be cancelled by the proposer, and expire on the proposer next turn if unanswered.',
        'Move can idle in non-hostile orbit, Transport can deliver to allied and peace planets, PEACE prevents auto-combat, and PASSIVE is stored for future-facing behavior.'
      ]
    },
    {
      title: 'Operations, Orbit, and Maintenance',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Operations View now tracks active fleets, orbit stance, live mission behavior, and Alliance Depot maintenance requests.',
      details: [
        'Orbiting non-hostile fleets now distinguish between passive orbit and active guarding orbit.',
        'Guard uses the internal defend mission path and joins friendly defense coalitions, while passive orbit mainly intercepts hostile orbit-staying missions.',
        'Siege can keep bombarding while hostile, Recycle can keep harvesting debris in idle orbit, and Repair has non-hostile orbit constraints.',
        'Pending Jump Gate fleets stay parked at the origin planet until the target owner resolves the request in Mail.',
        'Alliance Depot maintenance requests can deliver fuel, planetary bombs, and small ships from the target planet and are managed through Mail.'
      ]
    },
    {
      title: 'Space Battles',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Space battles are integrated into fleet arrival resolution, with same-turn orbit grouping, diplomacy-aware coalitions, and persistent damage side effects.',
      details: [
        'Planet-orbit encounters now resolve during turn processing, including same-turn arrival grouping at the same orbit and deterministic resolution by mission priority then fleetId.',
        'Battles use shuffled ship order, defender-first alternating fire, shield-to-hull damage flow, hangar trimming for non-jump survivors, and post-round destruction checks.',
        'Battle-side stats already respond to player technology, including weapon-family damage boosts, shielding and armour scaling, material-tech armor scaling, and graviton or fusion evasion bonuses.',
        'Default battle length is now 4 rounds, then missions modify that baseline: Move and Transport reduce it by 1, while future mission types can extend it.',
        'Allied defenders merge into one side, PEACE prevents automatic hostilities, and guarding orbit contributes differently than passive orbit.',
        'Planetary defences join the same defender side as orbit fleets, persist hull damage between turns, and can be repaired later.',
        'Only BOMBARDMENT_WEAPONS can damage planetary defences, and atmosphere-only defences can target only SMALL bombardment ships.',
        'BOMBARDMENT_WEAPONS use target-type accuracy: against ships they have only a flat 10 percent final hit chance, while against planetary defences they hit automatically once selected.',
        'True multi-faction combat and deeper mission-specific post-battle actions are still planned.'
      ],
      formulas: [
        'defaultBattleRounds = 4',
        'moveBattleRounds = 3',
        'transportBattleRounds = 3'
      ]
    },
    {
      title: 'Reports, Mail, and Turn Blockers',
      category: 'Intel',
      status: 'Live',
      summary: 'Reports and Mail are now separate communication flows, and End Turn is blocked until critical incoming communication is cleared.',
      details: [
        'Reports is a data-report inbox for espionage, battles, arrivals, bombardment, repair, and other generated reports.',
        'Mail is the player communication center for direct messages, diplomacy requests, Jump Gate requests, and Alliance Depot maintenance requests.',
        'Unread report count is separate from unread mail and pending incoming requests.',
        'End Turn is blocked while unread mail or pending incoming requests exist, and a sticky Mail CTA appears until the blocker is cleared.'
      ]
    },
    {
      title: 'Damaging Buildings',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Buildings now have Structural Points, can be reduced to 0 SP without being destroyed, and lose effectiveness as integrity falls.',
      details: [
        'Buildings use Structural Points derived from current level cost and never disappear when reduced to 0 SP.',
        'Lower structural integrity reduces output through structural utilization, then combines with power utilization.',
        'Bunker Network provides a minimum structural floor for most buildings, while Jump Gate, Sensor Phalanx, and Bomb Depot can still fall to 0%.',
        'Terraformer size gain is permanent once a level completes, but its live parameter-penalty reduction still scales with current power and structural effectiveness.',
        'Terraformer only improves penalized metal, crystal, deuterium, research, and industry modifiers up to 1.0; it does not change anomalies/noise or hyperspace parameters.'
      ],
      formulas: [
        'maxBuildingSP = metalCost * 2 + crystalCost + floor(deuteriumCost * 0.5)',
        'finalBuildingEffectiveness = powerUtilization * structuralUtilization',
        'minimumStructuralUtilization = 0.02 + 0.01 * BUNKER_NETWORK',
        'terraformerPenaltyReduction = TERRAFORMER level * finalBuildingEffectiveness * 1%',
        'effectivePlanetModifier = min(1.0, baseModifier + terraformerPenaltyReduction) for modifiers below 1.0'
      ]
    },
    {
      title: 'Planet Abandonment and Recolonization',
      category: 'Planets',
      status: 'Live',
      summary: 'Planets can now be abandoned with immediate ownership transfer to a fresh neutral, and colonization is limited by Adaptive Technology.',
      details: [
        'A planet can be abandoned only if it is not the player\'s last owned planet.',
        'Abandoning removes the world from the player, assigns a fresh neutral owner, applies PASSIVE relation to the old owner, and cancels building, shipyard, and research queues.',
        'Local resources, ships, defences, and active fleets remain in place on the abandoned world.',
        'Colonize can still claim unowned planets and can also reclaim PASSIVE neutral abandoned planets, merging arriving ships and cargo into the recolonized world.',
        'Colonize launch and arrival both fail once the player already owns their current maximum number of planets.'
      ],
      formulas: [
        'maxOwnedPlanets = floor(sqrt(ADAPTIVE_TECHNOLOGY * 2)) + 1'
      ]
    },
    {
      title: 'New Views and Screens',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Most game-management screens are now live, with only a small number of top-level utility routes still placeholder-only.',
      details: [
        'Imperium, Buildings, Production, Defence, Researches, Reports, Mail, Diplomacy, Operations, Mission Planner, Planet View, Galactic View, Star System View, Load Game, and Multiplayer Lobby are live.',
        'Buildings and Production provide compact multi-planet management flows, while Reports, Mail, Diplomacy, Operations, Load Game, and Multiplayer Lobby handle strategic information, persistence, and fleet or lobby state.',
        'Help/About remains a top-level placeholder outside the main live game shell.'
      ]
    },
    {
      title: 'In-Game Tutorials',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'The guided tutorial framework is live for the main desktop management views, but not every route is covered and mobile-specific layouts are intentionally out of scope.',
      details: [
        'Tutorials now exist for Galaxy View, Planet View, Mission Planner, Reports, Mail, Diplomacy, Operations, Imperium, Buildings, Production, and Researches.',
        'The overlay uses staged focus, highlight, and bubble presentation with spotlight dimming, scroll locking, and target-aware placement via data-tutorial-id anchors.',
        'Whole-view intro steps can omit a target, and views can register preparation hooks so hidden UI is revealed safely before measurement.',
        'Auto-open behavior is view-specific and tries to land on meaningful data, for example requiring active fleets before opening the Operations tutorial.',
        'Current polish is desktop-focused; unsupported routes like Help and some lower-priority screens still sit outside the implemented tutorial scope.'
      ]
    },
    {
      title: 'Production Queue Management',
      category: 'Queues',
      status: 'Partial',
      summary: 'Queue management is live for buildings and shipyard production, while research queue control is still simpler.',
      details: [
        'Building queues support drag-and-drop reorder plus cancel, with invested progress preserved.',
        'Shipyard queues use one mixed queue for ships and defences so visible order matches real execution order.',
        'Cancel rules differ by queue state: unstarted entries fully refund, while started entries refund only the unfinished portion at 75%.',
        'Research queues still expose live state and progress but currently have no cancel or reorder management.'
      ]
    },
    {
      title: 'Persistent Ship Damage',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Ship hull damage now persists between turns for both planets and fleets instead of collapsing everything into fresh full-health counts.',
      details: [
        'Ship storage now uses ManyShips, which keeps undamaged ship counts plus explicit damaged-hull entries.',
        'Battle damage persists on surviving ships, while shields reset after each battle as separate combat state.',
        'Mission Planner and ship-status UI distinguish Ready and Damaged ship availability, and Planet View exposes a dedicated Ship Damage Status panel.',
        'Damaged ships still count as usable for launch selection for now, so the current restriction is informational rather than a hard mission blocker.'
      ]
    },
    {
      title: 'Fleet Tactics and Group Templates',
      category: 'Core Loop',
      status: 'Not Planned',
      summary: 'Reusable fleet-tactics or group-template systems are not planned in the current roadmap.',
      details: [
        'The current mission flow focuses on direct ship selection, mission validation, and live fleet states instead of prebuilt tactical formations.',
        'Future mission or combat work may still deepen existing systems, but dedicated fleet-tactics tooling is not an active planned feature.'
      ]
    },
    {
      title: 'Multiplayer Lobby and Seat Assignment',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'A real host-controlled multiplayer lobby is live, but broader multiplayer scale and hardening are still future work.',
      details: [
        'Multiplayer currently runs as one global lobby managed by a local-admin host.',
        'The host can change lobby setup, bind a saved game, assign missing saved-human seats, and start the game.',
        'Regular logged-in users can join, leave, and toggle ready, while saved human seats can be auto-reclaimed or replaced before start.',
        'Expanded multiplayer support, broader scaling, and more hardened competitive flow remain future work.'
      ]
    },
    {
      title: 'Repair Mechanics (Fleet and Planets)',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Automatic repair and REPAIR missions are both live, with ship, building, and defence repair all tied into end-turn processing.',
      details: [
        'Planet ships are repaired first, then owned or allied idle orbit fleets.',
        'Buildings and defences also repair automatically using industry repair, drone repair, and available repair equipment splits.',
        'Repair currently costs no extra resources or energy beyond the existing production and capability rules.',
        'The UI exposes repair values in the shared powers panel, Mission Planner, Operations, Planet View, and Imperium.'
      ],
      formulas: [
        'shipRepairPerTurn = currentShipyardPower + nonDroneRepairCapability + droneShareForShips',
        'buildingRepairPerTurn = industryRepairShare + droneShareForBuildings',
        'defenceRepairPerTurn = industryRepairShare + droneShareForDefences'
      ]
    },
    {
      title: 'Power Influence on Industry and Mining',
      category: 'Economy',
      status: 'Live',
      summary: 'Energy deficits reduce mining and all production powers on the planet, but are tracked separately from manual building-power reduction.',
      details: [
        'If available energy is below used energy, resource income, industry power, shipyard power, and research power are all reduced.',
        'Penalty is linear from the energy deficit percentage, with a 95% maximum penalty cap.',
        'Storage capacity is not affected by energy deficit.',
        'Warnings are split: Energy insufficient marks planet-wide shortage, while Energy reduction marks manual per-building throttling.'
      ],
      formulas: [
        'deficitPercent = ((usedEnergy - availableEnergy) / availableEnergy) * 100',
        'penaltyPercent = min(95, deficitPercent * 1.5)',
        'effectiveOutput = baseOutput * (1 - penaltyPercent / 100)'
      ]
    },
    {
      title: 'Space Debris and Recycling',
      category: 'Economy',
      status: 'Live',
      summary: 'Debris fields now accumulate after battles, and Recycle missions can actively harvest them over one or more turns.',
      details: [
        'Space battles now convert destroyed-ship value into a persistent spaceDebris resource pack on the target planet.',
        'If the attacking fleet is wiped out, its carried cargo is also added into the destroyed-value pool before salvage rates are applied.',
        'Recycle missions can establish salvage orbit, collect debris each turn with recycle equipment until cargo is full or the field is empty, and then auto-return.',
        'Recycle can remain in idle orbit even over hostile debris fields when no defenders remain.'
      ],
      formulas: [
        'debrisMetal = floor(totalLostMetal * random(0.2, 0.3))',
        'debrisCrystal = floor(totalLostCrystal * random(0.2, 0.3))',
        'debrisDeuterium = floor(totalLostDeuterium * random(0.05, 0.1))'
      ]
    },
    {
      title: 'Expeditions',
      category: 'Galaxy',
      status: 'Planned',
      summary: 'Expedition missions are planned for risk/reward exploration gameplay.',
      details: [
        'Fleets will be sent into uncertain zones for randomized outcomes.',
        'Possible outcomes include resources, ships, losses, and special events.'
      ]
    },
    {
      title: 'Bot Implementation',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Neutral seeding and small-scale PvE pressure already exist, but full strategic AI behavior is still future work.',
      details: [
        'Sandbox generation can already spawn neutral-owned planets with RNG-scaled buildings, ships, technology, and resources.',
        'Human home systems can also get one guaranteed low-level neutral neighbor when neutral planets are enabled.',
        'Bots still need broader strategy loops for expansion, diplomacy, and combat behavior.',
        'PvE remains the primary focus, with PvP supported at smaller scale.'
      ]
    },
    {
      title: 'Functional Multiplayer (4+ Players)',
      category: 'Core Loop',
      status: 'Planned',
      summary: 'Expanded multiplayer support for at least 4 concurrent players is planned.',
      details: [
        'Session, turn, and conflict resolution flow will be expanded for multi-human games.',
        'Validation and synchronization rules will be hardened for competitive play.'
      ]
    },
    {
      title: 'Saving and Loading Game',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Save inspection and manual load are live, but the active runtime game is still controlled as a server-memory session rather than a fully seamless persistent world.',
      details: [
        'localStorage stores setup in srogame:setup and the auth/player session in srogame:player.',
        'Server auth accounts and sessions are stored in server/data/auth.json.',
        'The server now persists rotating full-game autosaves under server/data/saves/ on game start and on the configured autosave cadence.',
        'The /load route can inspect the saved snapshot, confirm replacement of the active runtime game, and load that save back into the live server state.',
        'Startup auto-load is still not implemented, and the active galaxy, diplomacy, fleets, queues, reports, and operations still run from in-memory live state between loads.'
      ]
    }
  ];

  get filteredMechanics(): MechanicSection[] {
    return this.mechanics.filter((mechanic) => {
      const statusMatches = this.selectedStatus === 'All' || mechanic.status === this.selectedStatus;
      const categoryMatches = this.selectedCategory === 'All' || mechanic.category === this.selectedCategory;
      return statusMatches && categoryMatches;
    });
  }

  setStatusFilter(status: 'All' | MechanicStatus): void {
    this.selectedStatus = status;
  }

  setCategoryFilter(category: 'All' | MechanicCategory): void {
    this.selectedCategory = category;
  }

  statusCount(status: 'All' | MechanicStatus): number {
    if (status === 'All') {
      return this.mechanics.length;
    }

    return this.mechanics.filter((mechanic) => mechanic.status === status).length;
  }

  categoryCount(category: 'All' | MechanicCategory): number {
    if (category === 'All') {
      return this.mechanics.length;
    }

    return this.mechanics.filter((mechanic) => mechanic.category === category).length;
  }

  statusClass(status: MechanicStatus): string {
    if (status === 'Live') {
      return 'mechanics-status--live';
    }

    if (status === 'Partial') {
      return 'mechanics-status--partial';
    }

    if (status === 'Not Planned') {
      return 'mechanics-status--not-planned';
    }

    return 'mechanics-status--planned';
  }

  trackByTitle(_index: number, mechanic: MechanicSection): string {
    return mechanic.title;
  }
}
