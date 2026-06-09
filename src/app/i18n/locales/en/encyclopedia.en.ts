export const encyclopediaEn = {
  menu: {
    eyebrow: 'Encyclopedia',
    title: 'Encyclopedia',
    subtitle: 'Reference guides for ships, defences, buildings, technologies, and mechanics covering missions, diplomacy, tutorials, scanning, and turn rules.',
    actions: {
      ships: 'Ships',
      defences: 'Defences',
      buildings: 'Buildings',
      technologies: 'Technologies',
      mechanics: 'Mechanics',
      backToMainMenu: 'Back to main menu'
    }
  },
  shared: {
    eyebrow: 'Encyclopedia',
    actions: {
      backToEncyclopedia: 'Back to encyclopedia',
      close: 'Close'
    },
    dialog: {
      ariaLabel: '{{title}} image preview',
      imageAlt: '{{title}} image',
      loadingRaw: 'Loading raw image...',
      rawLoadFailed: 'Raw image could not be loaded. Showing optimized preview.',
      showingRaw: 'Showing raw image.'
    },
    tooltips: {
      openLargeImage: 'Open large image for {{title}}'
    },
    counts: {
      shipsOne: '{{count}} ship cataloged',
      shipsMany: '{{count}} ships cataloged',
      defencesOne: '{{count}} defence unit cataloged',
      defencesMany: '{{count}} defence units cataloged',
      buildingsOne: '{{count}} building cataloged',
      buildingsMany: '{{count}} buildings cataloged',
      technologiesOne: '{{count}} technology cataloged',
      technologiesMany: '{{count}} technologies cataloged',
      topicsShown: '{{shown}} / {{total}} topics shown'
    },
    stats: {
      size: 'Size',
      evasion: 'Evasion',
      hull: 'Hull',
      critical: 'Critical',
      shield: 'Shield',
      armor: 'Armor',
      cargo: 'Cargo',
      hangar: 'Hangar',
      jumpCost: 'Jump cost',
      jump: 'Jump',
      level: 'Level',
      power: 'Power',
      damageMultiplier: 'Damage x',
      research: 'Research',
      orbitFire: 'Orbit fire'
    },
    sections: {
      weapons: 'Weapons',
      requirements: 'Requirements',
      buildings: 'Buildings',
      technologies: 'Technologies',
      cost: 'Cost',
      output: 'Output',
      howItWorks: 'How It Works',
      formulas: 'Formulas',
      notes: 'Notes'
    },
    labels: {
      yes: 'Yes',
      no: 'No',
      noInactive: 'No (inactive)',
      level: 'Level {{level}}',
      baseValue: 'Base value: {{value}}'
    },
    empty: {
      unarmed: 'Unarmed',
      noBuildingRequirements: 'No building requirements',
      noTechRequirements: 'No tech requirements',
      noHyperJumpAbility: 'No Hyper Jump Ability',
      noOutputValue: 'No output value',
      noMatchingMechanics: 'No mechanics match the selected filters.'
    },
    resources: {
      metal: 'Metal',
      crystal: 'Crystal',
      deuterium: 'Deuterium'
    }
  },
  ships: {
    title: 'Ships',
    subtitle: 'Detailed hull data sourced from the ship blueprints.'
  },
  defences: {
    title: 'Defences',
    subtitle: 'Planetary defense emplacements, target rules, and construction requirements.',
    descriptions: {
      planetaryBomb: 'Stored in Bomb Depot inventory. Phase 1 adds storage and production only; combat use comes later.',
      orbitCapable: 'Can engage orbiting ships.',
      atmosphereOnly: 'Can engage only small bombardment ships entering the atmosphere.'
    }
  },
  buildings: {
    title: 'Buildings',
    subtitle: 'Core planetary infrastructure and specialized facilities.',
    structureNote: 'Structural Points use current level cost and integrity now reduces live building effectiveness.'
  },
  technologies: {
    title: 'Technologies',
    subtitle: 'Research paths, drives, and combat science.'
  },
  mechanics: {
    title: 'Mechanics',
    subtitle: 'Rulebook for current gameplay systems. Status, formulas, and constraints here are aligned with the active client/server code.',
    overview: {
      live: 'Live',
      partial: 'Partial',
      planned: 'Planned',
      notPlanned: 'Not Planned'
    },
    filters: {
      status: 'Status filter',
      category: 'Category filter',
      all: 'All'
    },
    statuses: {
      Live: 'Live',
      Partial: 'Partial',
      Planned: 'Planned',
      'Not Planned': 'Not Planned'
    },
    categories: {
      Economy: 'Economy',
      Queues: 'Queues',
      Research: 'Research',
      Planets: 'Planets',
      Galaxy: 'Galaxy',
      Intel: 'Intel',
      'Core Loop': 'Core Loop'
    }
  }
} as const;
