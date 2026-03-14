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
      summary: 'Production is tied to current power usage, energy availability, and planetary modifiers, with separate warnings for shortage and manual throttling.',
      details: [
        'Each powered building has max power equal to level multiplied by blueprint powerConsumption.',
        'Current power is configurable in whole level-steps and clamped to valid bounds.',
        'Lower manual power does not hard-disable production. It scales output by utilization.',
        'Energy shortage is a separate mechanic from manual power reduction: Energy insufficient is a red warning, while Energy reduction is a regular warning.'
      ],
      formulas: [
        'utilization = clamp(currentPower / maxPower, 0, 1)',
        'effectiveProduction = floor(baseProduction * utilization)',
        'resourceGain = floor(effectiveProduction * (1 + adaptiveTechnology / 100) * planetaryModifier * energyEfficiency)'
      ]
    },
    {
      title: 'Building Queue Rules',
      category: 'Queues',
      status: 'Live',
      summary: 'Buildings are queued per-planet with upfront cost payment and strict validation.',
      details: [
        'Queue capacity is calculated from player Computer Technology and planet Robotics Factory.',
        'Only one queued entry per building type is allowed on the same planet.',
        'Resources are deducted immediately when the queue entry is created.'
      ],
      formulas: [
        'maxBuildingQueue = max(1, floor(1 + sqrt(COMPUTER_TECHNOLOGY + ROBOTICS_FACTORY)))'
      ]
    },
    {
      title: 'Shipyard Queue Rules',
      category: 'Queues',
      status: 'Live',
      summary: 'Ship production is queued per-planet with amount limits and queue cap scaling.',
      details: [
        'Shipyard level must be above 0 before enqueuing ships.',
        'Each queue entry contains ship type, amount, and invested shipyard power.',
        'Enqueue amount is validated in range 1..100000 and total cost is paid upfront.'
      ],
      formulas: [
        'maxShipyardQueue = max(1, floor(1 + sqrt(COMPUTER_TECHNOLOGY + SHIPYARD)))'
      ]
    },
    {
      title: 'Research Queue and Helper Labs',
      category: 'Research',
      status: 'Live',
      summary: 'Research starts from one main lab and can scale with helper labs from other planets.',
      details: [
        'A starter planet can hold one currentResearchQueue entry at a time.',
        'A helper lab cannot be busy in another research queue or helper assignment.',
        'The same technology cannot be researched in parallel on different planets.'
      ],
      formulas: [
        'maxLabsPerTechnology = max(1, floor(1.5 * sqrt(INTERGALACTIC_RESEARCH_NETWORK) + 1))',
        'researchPower = floor(RESEARCH_LAB production1 * (1 + (COMPUTER_TECHNOLOGY * 5 + ADAPTIVE_TECHNOLOGY + INTERGALACTIC_RESEARCH_NETWORK * 2) / 100) * scienceModifier)'
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
      summary: 'Random planets roll type-based modifier ranges, while starting planets are normalized.',
      details: [
        'Random planets roll size in range 90..200 with type-specific parameter ranges.',
        'Starting planets are fixed to size 160 and all planetary multipliers at 1.0.',
        'anomaliesAndNoise and hyperspaceParameters are rolled in 0.05 steps.'
      ],
      formulas: [
        'randomPlanetSize = randomInt(90, 200)',
        'startingPlanetSize = 160'
      ]
    },
    {
      title: 'Galaxy Generation and Void Logic',
      category: 'Galaxy',
      status: 'Live',
      summary: 'The map is generated as a circular field, with special void and center-edge behavior.',
      details: [
        'Only cells inside galaxy radius become systems; outside remains Void.',
        'Galaxy center radius is overwritten as Galaxy Center systems.',
        'Edge systems have an extra 50% forced-void chance before base void chance is applied.'
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
      summary: 'Visibility is report-driven, reports can preview planets, and star-system notes are player-specific.',
      details: [
        'Galaxy ownership bytes are computed from espionage reports available to the current player.',
        'Unknown systems can be intentionally returned as null ownership bytes.',
        'Star-system notes support create, edit, and delete with per-player storage.',
        'Reports can preview planet data through MiniPlanetPreview, including direct actions like View Planet, Spy Planet, and Copy coordinates when intel is available.'
      ]
    },
    {
      title: 'Turn Progression State',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Queue enqueueing and UI ETA previews are implemented, but global turn processing is still limited.',
      details: [
        'Building, shipyard, and research enqueue endpoints are active.',
        'Planet and research queues expose invested/base progress fields for UI display.',
        'A dedicated public endpoint for full turn advancement is not currently exposed.'
      ],
      notes: [
        'This section reflects current server routes and may evolve with future tick processing.'
      ]
    },
    {
      title: 'Sandbox and Test Setup Flags',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Optional setup flags speed up testing by seeding planets, ships, and technology.',
      details: [
        'Create random planets assigns extra owned planets with random buildings and resources.',
        'Create starting ships seeds each owned planet with starter amounts for every ship blueprint.',
        'Sandbox mode can spawn neutral bots with RNG-scaled buildings, ships, and tech.'
      ]
    },
    {
      title: 'Sending Fleets with Mission Types',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Fleet dispatch is live through Mission Planner for a focused subset of mission types, with more mission logic still planned.',
      details: [
        'Mission Planner currently supports Move, Transport, Spy, and Colonize.',
        'Validation includes coordinates, ownership constraints, ship capability checks, cargo rules, and active-fleet-cap checks.',
        'Mission Planner can now be prefilled from other screens, for example Spy Planet actions from report or galaxy previews.',
        'Attack, plunder, invasion, recycle, repair, and other advanced mission types are still planned.'
      ],
      formulas: [
        'maxActiveFleets = 2 + COMPUTER_TECHNOLOGY * 2'
      ]
    },
    {
      title: 'Space Battles',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Fleet-vs-fleet combat exists in the battle domain, but full game-loop integration is still in progress.',
      details: [
        'Current battle resolution supports 5 rounds, shuffled ship order, defender-first alternating fire, shield-to-hull damage flow, and post-round destruction checks.',
        'Current technology modifiers support weapon damage bonuses, shield and hull capacity bonuses, armor scaling, critical-threshold reduction, and evasion chance scaling.',
        'Planetary defenses, debris generation, repair handling, and full turn-resolution integration are still planned.'
      ]
    },
    {
      title: 'Reports and Messages',
      category: 'Intel',
      status: 'Partial',
      summary: 'A player-facing report inbox is live, while broader event coverage and message depth are still expanding.',
      details: [
        'Reports View supports tabs, unread/read state, selection with delete, inline detail view, and location preview.',
        'Espionage reports render as structured dossiers with sectioned intel for resources, buildings, technologies, ships, defences, and planetary parameters.',
        'Report-linked planet previews reuse MiniPlanetPreview and can route into Planet View or Mission Planner.',
        'Combat, expedition, and other future system events are still planned to broaden report coverage.'
      ]
    },
    {
      title: 'Damaging Buildings',
      category: 'Core Loop',
      status: 'Planned',
      summary: 'Building damage and degradation from hostile actions is planned.',
      details: [
        'Attacks and operations will be able to reduce effective building performance or levels.',
        'Damage state will integrate with repair and economy systems.'
      ]
    },
    {
      title: 'New Views and Screens',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'The game now has multiple dedicated management views, with more strategic screens still planned.',
      details: [
        'Imperium, Buildings, Production, Researches, Reports, Operations, Mission Planner, Planet View, Galactic View, and Star System View are all live.',
        'Buildings and Production provide compact multi-planet management flows using shared planet selection patterns.',
        'Additional deeper strategy/control screens are still planned and will continue to follow the `/game/*` routed shell architecture.'
      ]
    },
    {
      title: 'Production Queue Management',
      category: 'Queues',
      status: 'Partial',
      summary: 'Queue management views and live queue displays exist, while advanced controls like reorder/cancel are still planned.',
      details: [
        'Planet View, Buildings View, Production View, and Researches View all expose live queue state and ETA-style previews.',
        'Queue entries are started through real client-server flows with immediate resource payment and updated owned-planet data.',
        'Planned controls still include reorder, cancel, and reprioritize actions.'
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
      status: 'Planned',
      summary: 'Repair loops are planned for damaged ships and planetary infrastructure.',
      details: [
        'Repair will consume resources/time and interact with queue priorities.',
        'Both post-battle recovery and infrastructure restoration are in scope.'
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
      status: 'Planned',
      summary: 'Debris fields and recycler gameplay are planned.',
      details: [
        'Combat and events will generate recoverable debris resources.',
        'Recycling missions will convert debris into usable economy input.'
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
      status: 'Planned',
      summary: 'Broader bot behavior is planned beyond current neutral sandbox spawning.',
      details: [
        'Bots will require strategy loops for expansion, economy, and combat actions.',
        'Difficulty scaling and predictable debugging behavior are design goals.'
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
      status: 'Planned',
      summary: 'Persistent save/load of active games is planned.',
      details: [
        'Current galaxy state is in memory; planned work adds durable game-state persistence.',
        'Load flows will cover resumed turn state, queues, reports, and player sessions.'
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
