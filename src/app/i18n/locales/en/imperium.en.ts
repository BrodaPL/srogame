export const imperiumEn = {
  loading: {
    title: 'Loading Imperium',
    body: 'Owned planets and empire statistics are being aggregated.'
  },
  unavailable: {
    title: 'Imperium unavailable'
  },
  summary: {
    viewName: '{{playerName}} Imperium Summary',
    title: 'Empire Totals',
    subtitle: 'High-level counts for planets, ships, and active queues.',
    ownedPlanets: 'Owned planets',
    totalShips: 'Total ships',
    buildingQueuesActive: 'Building queues active',
    shipyardQueuesActive: 'Shipyard queues active',
    researchRolesActive: 'Research roles active'
  },
  attention: {
    title: 'Needs Attention',
    subtitle: 'Planets that are idle, energy-starved, or operating below selected power.',
    none: 'No attention items right now.',
    labels: {
      energyDeficit: 'Energy insufficient',
      energyReduction: 'Energy reduction',
      idleBuildingQueue: 'Empty building queue',
      idleShipyardQueue: 'Empty shipyard queue',
      idleResearchRole: 'No active research role',
      limitedIndustryPower: 'Reduced industry power',
      limitedShipyardPower: 'Reduced shipyard power',
      limitedResearchPower: 'Reduced research power',
      damagedShipsPresent: 'Damaged ships present',
      damagedShipsNoRepair: 'Damaged ships without repair capability',
      damagedBuildingsPresent: 'Damaged buildings present',
      damagedBuildingsNoRepair: 'Damaged buildings without repair capability',
      damagedDefencesPresent: 'Damaged defences present',
      damagedDefencesNoRepair: 'Damaged defences without repair capability',
      damagedGroundNoRepair: 'Damaged structures without repair capability'
    },
    descriptions: {
      energyDeficit: 'Energy usage is above available output.',
      energyReduction: 'At least one building is manually set below its maximum power usage.',
      idleBuildingQueue: 'No construction is currently queued.',
      idleShipyardQueue: 'No ships are currently queued for production.',
      idleResearchRole: 'Planet is neither researching nor helping another lab.',
      limitedIndustryPower: 'Robotics or Nanite power allocation is below the selected maximum.',
      limitedShipyardPower: 'Shipyard or Nanite power allocation is below the selected maximum.',
      limitedResearchPower: 'Research Lab power allocation is below the selected maximum.',
      damagedShipsPresent: 'Stationed or idle orbit fleets above these planets still have hull damage.',
      damagedShipsNoRepair: 'Damaged ships are present but this location currently has no repair capability.',
      damagedBuildingsPresent: 'Planetary infrastructure is damaged and working below full efficiency.',
      damagedDefencesPresent: 'Planetary defences survived combat but still need repairs.',
      damagedGroundNoRepair: 'Buildings or defences are damaged but the location currently has no effective industry or drone repair.'
    }
  },
  planets: {
    title: 'Owned Planets',
    subtitle: 'Compact planet cards with queue summaries and local production snapshots.',
    sort: 'Sort',
    filter: 'Filter',
    noMatches: 'No planets match the current filter.',
    sortOptions: {
      coordinates: 'Coordinates',
      name: 'Name',
      metalIncome: 'Metal income',
      totalIncome: 'Total income',
      industryPower: 'Industry power'
    },
    filterOptions: {
      all: 'All planets',
      attention: 'Needs attention',
      activeQueues: 'Active queues',
      idleQueues: 'Idle queues'
    },
    stats: {
      metal: 'M',
      crystal: 'C',
      deuterium: 'D',
      energy: 'E',
      industry: 'I',
      drone: 'D',
      shipyard: 'S',
      research: 'R',
      shipRepair: 'Ship rep',
      industryRepair: 'Ind rep',
      droneRepair: 'Drone rep'
    },
    queues: {
      buildings: 'Buildings',
      shipyard: 'Shipyard',
      research: 'Research',
      idle: 'Idle'
    },
    actions: {
      title: 'Planet Action',
      abandon: 'Abandon planet',
      abandoning: 'Abandoning...',
      keep: 'Keep planet',
      confirm: 'Confirm: lose planet, cancel queues, leave assets'
    },
    abandon: {
      tooltip: 'Turn this planet into a passive neutral world.',
      blocked: 'Your last owned planet cannot be abandoned.',
      hint: 'Queues and research are canceled. Resources, stationed ships, and defences stay behind.',
      confirmBody: 'This planet leaves your empire, gets a fresh neutral owner, and becomes PASSIVE toward you.',
      confirmIntel: 'Active fleets stay with their current owners. You keep intel and can recolonize this world later with a Colonizer.'
    }
  },
  fleetTotals: {
    title: 'Fleet Totals',
    subtitle: 'Sum of owned ships by ship type across all planets.'
  },
  buildingStats: {
    title: 'Building Statistics',
    subtitle: 'Average, minimum, and maximum levels for all building types, including zeros.',
    building: 'Building',
    average: 'Average',
    min: 'Min',
    max: 'Max'
  },
  errors: {
    noSession: 'No player session found.',
    load: 'Unable to load owned planets.',
    abandon: 'Unable to abandon planet.'
  },
  energyTooltip: 'Average energy penalty: {{penalty}}%.'
} as const;
