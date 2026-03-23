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
      summary: 'Ships and defences now share one ordered shipyard queue per planet, with amount limits and queue cap scaling.',
      details: [
        'Shipyard level must be above 0 before enqueuing ships.',
        'Each queue entry now contains item kind, unit type, amount, and invested shipyard power.',
        'Ships and defences compete in the same queue order and use the same shipyard power pool.',
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
      status: 'Live',
      summary: 'End Turn now resolves the real phase-one game loop: economy, queues, research, fleet arrivals, reports, and debris updates.',
      details: [
        'The server exposes a real end-turn endpoint and increments the galaxy turn after successful processing.',
        'Turn resolution currently applies income, advances building queues, advances shipyard queues, advances research queues, and then resolves active fleets and encounters.',
        'Planet and research queues expose invested/base progress fields for UI display, while Operations and Reports reflect the fleet side of turn progression.'
      ],
      formulas: [
        'turnOrder = income -> building queues -> shipyard queues -> research queues -> fleet movement/encounters'
      ],
      notes: [
        'This is still phase-one turn logic: many advanced missions and deeper operation layers are not implemented yet.'
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
      summary: 'Fleet dispatch is live through Mission Planner for a focused subset of mission types, with mission validation and resolution now driven by shared mission definitions.',
      details: [
        'Mission Planner currently supports Move, Transport, Spy, and Colonize.',
        'Validation includes coordinates, ownership/diplomacy constraints, ship capability checks, cargo rules, fuel reserves, and active-fleet-cap checks.',
        'Fleet lifecycle states are now meaningful: fleets can be MOVING_TO_TARGET, IDLE, RETURNING, or mission-failure return/idle states instead of being consumed immediately.',
        'Move to owned planets merges into the target planet, Move to unowned/friendly foreign orbit can stay idle, Transport delivers cargo then returns, and Spy creates structured espionage reports.',
        'Mission Planner can now be prefilled from other screens, for example Spy Planet actions from report or galaxy previews.',
        'Attack, plunder, invasion, recycle, repair, and other advanced mission types are still planned.'
      ],
      formulas: [
        'maxActiveFleets = 2 + COMPUTER_TECHNOLOGY * 2',
        'fuelCost = sum(ship.jumpCost * max(1, distance) * amount) * minimumFuelReserves'
      ]
    },
    {
      title: 'Diplomacy and Friendly Orbit',
      category: 'Core Loop',
      status: 'Live',
      summary: 'Basic diplomacy now exists as symmetric player-to-player relations and directly affects mission targeting and auto-combat.',
      details: [
        'Current diplomacy statuses are SELF, ALLIED, PEACE, and WAR.',
        'Relations are stored centrally on the galaxy and treated as symmetric pairs rather than one-sided flags.',
        'Move can target allied and peace planets but stays as an orbiting fleet instead of merging into foreign-friendly planet ships.',
        'Transport can target allied and peace planets, delivers cargo on arrival, and then returns home.',
        'PEACE prevents auto-combat, while allied idle fleets and orbiting ships join the same defensive side during encounters.'
      ],
      notes: [
        'Current diplomacy mutation is admin/test-oriented in the server layer. Full player-facing diplomacy UI and treaty workflows are still planned.'
      ]
    },
    {
      title: 'Space Battles',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'Space battles are integrated into phase-one fleet arrival resolution, and planetary defences now fight as immobile ship-like units on the defender side.',
      details: [
        'Planet-orbit encounters now resolve during turn processing, including same-turn arrival grouping at the same orbit and deterministic resolution by mission priority then fleetId.',
        'Battles use shuffled ship order, defender-first alternating fire, shield-to-hull damage flow, hangar trimming for non-jump survivors, and post-round destruction checks.',
        'Default battle length is now 4 rounds, then missions modify that baseline: Move and Transport reduce it by 1, while future mission types can extend it.',
        'Allied defenders merge into one side, and PEACE prevents automatic hostilities.',
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
      title: 'Reports and Messages',
      category: 'Intel',
      status: 'Partial',
      summary: 'A player-facing report inbox is live for espionage, fleet arrivals/failures, battles, bombardment, and repair flow, while broader event coverage is still expanding.',
      details: [
        'Reports View supports tabs, unread/read state, selection with delete, inline detail view, and location preview.',
        'Espionage reports render as structured dossiers with sectioned intel for resources, buildings, technologies, ships, defences, and planetary parameters.',
        'Report-linked planet previews reuse MiniPlanetPreview and can route into Planet View or Mission Planner.',
        'Battle reports and fleet mission reports are generated by the live turn-resolution flow.',
        'Bombardment missions now generate dedicated building-damage reports, and REPAIR missions generate arrival plus return summary reports.',
        'Combat, expedition, diplomacy-event, and other future system events are still planned to broaden report coverage.'
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
        'Bunker Network provides a minimum structural floor for most buildings, while Jump Gate, Sensor Phalanx, and Missile Silo can still fall to 0%.',
        'Terraformer can take damage and be repaired, but its effect does not scale down from structural loss.'
      ],
      formulas: [
        'maxBuildingSP = metalCost * 2 + crystalCost + floor(deuteriumCost * 0.5)',
        'finalBuildingEffectiveness = powerUtilization * structuralUtilization',
        'minimumStructuralUtilization = 0.02 + 0.01 * BUNKER_NETWORK'
      ]
    },
    {
      title: 'New Views and Screens',
      category: 'Core Loop',
      status: 'Partial',
      summary: 'The game now has multiple dedicated management views, with more strategic screens still planned.',
      details: [
        'Imperium, Buildings, Production, Defence, Researches, Reports, Operations, Mission Planner, Planet View, Galactic View, and Star System View are all live.',
        'Buildings and Production provide compact multi-planet management flows using shared planet selection patterns.',
        'Additional deeper strategy/control screens are still planned and will continue to follow the `/game/*` routed shell architecture.'
      ]
    },
    {
      title: 'Production Queue Management',
      category: 'Queues',
      status: 'Partial',
      summary: 'Queue management views and live queue displays exist for buildings, research, ships, and defences, while advanced controls like reorder/cancel are still planned.',
      details: [
        'Planet View, Buildings View, Production View, and Researches View all expose live queue state and ETA-style previews.',
        'Defence production now exists and shares the same shipyard queue as ships.',
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
      status: 'Partial',
      summary: 'Ship, defence, and building repair are now live during end-turn resolution, and REPAIR is now a real fleet mission.',
      details: [
        'Damaged ships now repair automatically during end-turn resolution. Planet ships are repaired first, then owned/allied idle fleets in orbit.',
        'Buildings and defences also repair automatically: industry repair plus drone repair are split across damaged categories present.',
        'Repair does not currently consume extra resources or energy, and shipyard/build queues continue independently of repair.',
        'The UI now exposes split repair values in the shared powers panel, Mission Planner, Operations, Planet View, and Imperium.',
        'REPAIR missions require at least one Repair Drone, can target non-hostile locations, and return automatically when there is nothing left to repair.'
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
      status: 'Partial',
      summary: 'Debris fields now accumulate on planets after battles, while dedicated recycling gameplay is still planned.',
      details: [
        'Space battles now convert destroyed-ship value into a persistent spaceDebris resource pack on the target planet.',
        'If the attacking fleet is wiped out, its carried cargo is also added into the destroyed-value pool before salvage rates are applied.',
        'Recycling missions and player-facing debris recovery loops are still planned.'
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
      summary: 'Neutral and sandbox-side bot seeding already exists, but full strategic AI behavior is still planned.',
      details: [
        'Sandbox generation can already spawn neutral-owned planets with RNG-scaled buildings, ships, technology, and resources.',
        'Human home systems can also get one guaranteed low-level neutral neighbor when neutral planets are enabled.',
        'Bots still need strategy loops for expansion, economy, diplomacy, and combat actions.',
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
      status: 'Partial',
      summary: 'Authentication and local client setup persist, but the active galaxy is still only stored in server memory.',
      details: [
        'Player auth sessions are stored in server JSON, and localStorage keeps setup plus the current player session on the client.',
        'The active galaxy, diplomacy relations, fleets, queues, and reports are still in-memory runtime state on the server.',
        'Planned work adds durable game-state persistence and true load/resume flows for turns, queues, reports, and operations.'
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
