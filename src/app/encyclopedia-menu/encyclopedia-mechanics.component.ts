import { NgClass, NgFor, NgIf } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type MechanicStatus = 'Live' | 'Partial' | 'Planned';
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
  readonly statusFilters: Array<'All' | MechanicStatus> = ['All', 'Live', 'Partial', 'Planned'];
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
        'randomPlanetBaseSize = randomInt(90, 200)',
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
      title: 'Turn Progression State',
      category: 'Core Loop',
      status: 'Live',
      summary: 'End Turn resolves economy, queues, research, fleet movement and encounters, then repair and report side effects.',
      details: [
        'The server exposes a real end-turn endpoint and increments the galaxy turn after successful processing.',
        'Turn resolution applies income, advances building queues, shipyard queues, and research queues, resolves fleets and encounters, then performs repair passes.',
        'Planet, shipyard, and research queues expose invested/base progress fields in the UI, while Operations, Reports, and Mail reflect the fleet and communication side of turn progression.'
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
        'Mission Planner currently supports Move, Guard, Transport, Spy, Bombard, Siege, Recycle, Repair, and Colonize.',
        'Validation includes coordinates, ownership/diplomacy constraints, ship capability checks, cargo rules, fuel reserves, and active-fleet-cap checks.',
        'Fleet lifecycle states are meaningful: fleets can be MOVING_TO_TARGET, ORBITING, RETURNING, MISSION_FAILURE_RETURNING, or MISSION_FAILURE_IDLE.',
        'Move to owned planets merges into the target planet, Move to non-hostile foreign or unowned orbit can stay in orbit, Transport delivers cargo then returns, and Spy creates structured espionage reports.',
        'Mission Planner can also be prefilled from other screens, for example Spy Planet actions from reports or planet previews.'
      ],
      formulas: [
        'maxActiveFleets = 2 + COMPUTER_TECHNOLOGY * 2',
        'fuelCost = sum(ship.jumpCost * max(1, distance) * amount) * minimumFuelReserves'
      ],
      notes: [
        'Dedicated attack/plunder-style missions are still future work, but the current planner and mission runtime are fully live.'
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
        'Default battle length is now 4 rounds, then missions modify that baseline: Move and Transport reduce it by 1, while future mission types can extend it.',
        'Allied defenders merge into one side, PEACE prevents automatic hostilities, and guarding orbit contributes differently than passive orbit.',
        'Planetary defences join the same defender side as orbit fleets, persist hull damage between turns, and can be repaired later.',
        'Only BOMBARDMENT_WEAPONS can damage planetary defences, and atmosphere-only defences can target only SMALL bombardment ships.',
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
        'Mail is the player communication center for direct messages, diplomacy requests, and Alliance Depot maintenance requests.',
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
        'Terraformer only improves penalized metal, crystal, deuterium, science, and industry modifiers up to 1.0; it does not change anomalies/noise or hyperspace parameters.'
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
      summary: 'Planets can now be abandoned with immediate ownership transfer to a fresh neutral, and some passive neutral worlds can be recolonized later.',
      details: [
        'A planet can be abandoned only if it is not the player\'s last owned planet.',
        'Abandoning removes the world from the player, assigns a fresh neutral owner, applies PASSIVE relation to the old owner, and cancels building, shipyard, and research queues.',
        'Local resources, ships, defences, and active fleets remain in place on the abandoned world.',
        'Colonize can still claim unowned planets and can also reclaim PASSIVE neutral abandoned planets, merging arriving ships and cargo into the recolonized world.'
      ]
    },
    {
      title: 'New Views and Screens',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Most game-management screens are now live, but a few top-level routes still remain placeholders.',
      details: [
        'Imperium, Buildings, Production, Defence, Researches, Reports, Mail, Diplomacy, Operations, Mission Planner, Planet View, Galactic View, and Star System View are live.',
        'Buildings and Production provide compact multi-planet management flows, while Reports, Mail, Diplomacy, and Operations handle strategic information and fleet state.',
        'Top-level Load, Multiplayer, and Help/About placeholders still remain outside the main live game shell.'
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
      title: 'Fleet Groups for Tactics',
      category: 'Core Loop',
      status: 'Planned',
      summary: 'Fleet groups are planned to allow richer tactical organization.',
      details: [
        'Players will be able to define reusable ship groups for faster mission setup.',
        'Grouping is intended to support different strategic roles and formations.'
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
      summary: 'Auth and some client state persist, but the active galaxy is still an in-memory server runtime object.',
      details: [
        'localStorage currently stores setup in srogame:setup and the auth/player session in srogame:player.',
        'Server auth accounts and sessions are stored in server/data/auth.json.',
        'The active galaxy, diplomacy, fleets, queues, reports, and operations are still in-memory server state.',
        'True durable load and resume flows for the galaxy itself are still future work.'
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

    return 'mechanics-status--planned';
  }

  trackByTitle(_index: number, mechanic: MechanicSection): string {
    return mechanic.title;
  }
}
