export const blueprintsEn = {
  buildings: {
    descriptions: {
      METAL_MINE: 'Mines basic metal resources.',
      CRYSTAL_MINE: 'Mines rare crystal resources.',
      DEUTERIUM_SYNTHESIZER: 'Harvests deuterium.',
      SOLAR_WIND_GEOTHERMAL:
        'Uses the planet local renewable energy sources and large-scale energy storage.',
      NUCLEAR_PLANT: 'Steady nuclear power generation for planetary infrastructure.',
      FUSION_REACTOR: 'Generates power by converting deuterium through controlled fusion stages.',
      METAL_STORAGE: 'Planetary storage for metal reserves.',
      CRYSTAL_STORAGE: 'Planetary storage for crystal reserves.',
      DEUTERIUM_TANK: 'Planetary storage for deuterium reserves.',
      ROBOTICS_FACTORY: 'Core industrial base for planetary construction.',
      SHIPYARD: 'Produces ships and, when idle, repairs ships at reduced speed.',
      NANITE_FACTORY: 'Multiplies local industry and shipyard throughput.',
      RESEARCH_LAB: 'Researches new technologies.',
      ALLIANCE_DEPOT: 'Repairs orbiting ships and supplies them with deuterium.',
      BOMB_DEPOT: 'Stores planetary bombs for future bombardment missions.',
      SPACEPORT: 'Expands the number of fleets this planet can support.',
      TERRAFORMER: 'Creates new land and reduces negative planetary penalties.',
      SENSOR_PHALANX:
        'Detects incoming fleets in normal range and scans a chosen planet at half range.',
      JUMP_GATE: 'Enables system-to-system jumps and improves Interstellar Trade Port capacity.',
      INTERSTELLAR_TRADE_PORT: 'Exchanges resources at the 3:2:1 rate with operational cost.',
      BUNKER_NETWORK: 'Reduces enemy Attack plunder efficiency through local protection.',
    },
  },
  technologies: {
    descriptions: {
      ENERGY_TECHNOLOGY: 'Gives a +2% bonus to energy generation.',
      MATERIAL_TECHNOLOGY:
        'Improves all defence values by 5% and REPAIR_EQUIPMENT efficiency by 5%.',
      HYPERSPACE_TECHNOLOGY:
        'Gives +2% Sensor Phalanx range, increases Jump Gate and Interstellar Trade Port capacity by 5%, and reduces total fleet travel fuel cost by 2% per level.',
      ESPIONAGE_TECHNOLOGY:
        'Reveals more information from spy missions and gives +2% Sensor Phalanx range for detecting incoming fleets.',
      COMPUTER_TECHNOLOGY: 'Each level gives +2 maximum fleets and +5% research power.',
      ASTROPHYSICS_TECHNOLOGY:
        'Gives +5% expedition income, reduces bad expedition outcomes by 2%, and increases Sensor Phalanx range by 1%.',
      ADAPTIVE_TECHNOLOGY:
        'Unlocks more colonizable planet types, increases the owned-planet cap at defined levels, and gives +1% to all resource income, research, and industry.',
      INTERGALACTIC_RESEARCH_NETWORK:
        'Allows multiple Research Labs to work on one technology and gives +2% total research power.',
      GRAVITON_TECHNOLOGY:
        'Gives 5% ship evasion, increases jump range by 1, increases Jump Gate and Interstellar Trade Port capacity by 25%, and increases base Sensor Phalanx range by 0.5.',
      SHIELDING_TECHNOLOGY: 'Gives +10% to all shield durability.',
      ARMOUR_TECHNOLOGY:
        'Gives +10% to all hull durability and reduces ship destruction chance by 1%.',
      RAILGUNS_WEAPONS: 'Gives +10% to all RAILGUN weapon damage.',
      BEAMS_WEAPONS: 'Gives +10% to all BEAM weapon damage.',
      MISSILES_WEAPONS: 'Gives +10% to all MISSILE weapon damage.',
      FUSION_DRIVE:
        'Increases in-system ship speed by 1, increases evasion chance by 3%, and reduces total fleet travel fuel cost by 1% per level.',
      HYPERSPACE_DRIVE:
        'Increases jump range by 1 and reduces total fleet travel fuel cost by 1% per level.',
    },
  },
} as const;
