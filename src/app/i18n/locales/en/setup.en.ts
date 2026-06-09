export const setupEn = {
  eyebrow: 'SroGame Core',
  title: 'Galaxy Initialization',
  subtitle: 'Configure the galaxy layout, populations, and starting resources.',
  fields: {
    playerName: 'Player name',
    galaxyName: 'Galaxy name',
    gameType: 'Game type',
    galaxyWidth: 'Galaxy width',
    galaxyHeight: 'Galaxy height',
    galaxyCenterSize: 'Galaxy center size (%)',
    voidChance: 'Void chance (%)',
    starsAmountModifierMin: 'Stars amount modifier min',
    starsAmountModifierMax: 'Stars amount modifier max',
    playerAmount: 'Player amount',
    botsAmount: 'Bots amount',
    botDifficulty: 'Bot difficulty (%)',
    neutralBotsAmount: 'Neutral bots amount (%)',
    neutralBotsDifficulty: 'Neutral bots difficulty (%)',
    autoSaveTurns: 'Auto save every N turns',
    playerActionLogging: 'Player action logging',
    startingHomeworldPreset: 'Starting homeworld preset',
    testingOptions: 'Testing options',
    startingResources: 'Starting resources',
    botPersonalities: 'Bot personalities',
    botDiplomacy: 'Bot diplomacy'
  },
  placeholders: {
    galaxyName: 'Aetheria'
  },
  gameTypes: {
    PvP: 'PvP',
    PvPvE: 'PvPvE',
    PvE: 'PvE',
    Sandbox: 'Sandbox'
  },
  actions: {
    goToLogin: 'Go to login',
    startNewGame: 'Start new game',
    starting: 'Starting...'
  },
  errors: {
    localAdminRequiredServer: 'Local admin privileges are required to start a single-player game on this server.',
    loginRequired: 'Login required to start a game.',
    loginRequiredToStart: 'Login required to start a game.',
    localAdminRequiredToStart: 'Local admin privileges are required to start a single-player game.',
    startFailed: 'Unable to reach the game server.'
  },
  botPersonalities: {
    assigned: 'Assigned: {{assigned}} / {{total}}',
    help: 'Choose the exact amount of each implemented bot personality.',
    validation: 'Assigned bot personalities must total exactly {{required}}. Current total: {{assigned}}.'
  },
  botDiplomacy: {
    botsUnitedAgainstHumans: 'Bots united against humans',
    tooltip: 'When enabled, permanent bot empires start allied with each other and at war with every human player. Neutral resource factions are not affected. Useful for PvE or co-op games where bots should act as a shared opposing bloc.'
  },
  autoSave: {
    hint: 'Use 0 to disable auto saving after end turn.',
    disabled: 'disabled',
    everyTurns: 'every {{turns}} turns'
  },
  playerActionLogging: {
    enable: 'Log successful local player actions to disk',
    hint: 'Writes building, shipyard, research, and fleet actions to server/data/player-action-logs/.'
  },
  startingHomeworldPreset: {
    help: 'Applies only to human and bot home planets. Neutral starts stay RNG-based.',
    presets: {
      Low: {
        label: 'Low',
        tooltip: 'Low preset\nBuildings: Metal Storage 1, Crystal Storage 1, Deuterium Tank 1, Metal Mine 1, Crystal Mine 1, Solar 1, Nuclear 1, Robotics Factory 1.\nTech: none.\nShips: none.\nDefences: none.'
      },
      Medium: {
        label: 'Medium',
        tooltip: 'Medium preset\nBuildings: Metal Storage 1, Crystal Storage 1, Deuterium Tank 1, Metal Mine 2, Crystal Mine 1, Deuterium Synthesizer 1, Solar 2, Nuclear 2, Robotics Factory 2, Shipyard 1, Research Lab 1.\nTech: Energy Technology 1, Fusion Drive 1, Hyperspace Drive 1, Espionage Technology 1.\nShips: Spy Probe 8, Transporter 1.\nDefences: SAM Site 4.'
      },
      High: {
        label: 'High',
        tooltip: 'High preset\nBuildings: Metal Storage 2, Crystal Storage 2, Deuterium Tank 2, Metal Mine 3, Crystal Mine 2, Deuterium Synthesizer 1, Solar 2, Nuclear 2, Fusion Reactor 1, Robotics Factory 3, Shipyard 2, Research Lab 1.\nTech: Energy Technology 1, Fusion Drive 1, Hyperspace Drive 1, Computer Technology 1, Espionage Technology 2, Adaptive Technology 1.\nShips: Fighter 8, Spy Probe 16, Battle Ship 1, Transporter 1, Colonizer 1.\nDefences: SAM Site 10.'
      }
    }
  },
  testingOptions: {
    createRandomPlanets: 'Create random planets',
    createStartingShips: 'Create starting ships',
    skipTutorial: 'Skip tutorial'
  },
  resources: {
    metal: 'Metal',
    crystal: 'Crystal',
    deuterium: 'Deuterium'
  },
  savedConfig: {
    title: 'Saved config',
    summary: '{{name}} ({{width}}x{{height}}) with {{players}} players, {{bots}} bots. Auto save: {{autoSave}}. Homeworld preset: {{preset}}. Starting resources: {{metal}} metal, {{crystal}} crystal, {{deuterium}} deuterium.'
  }
} as const;
