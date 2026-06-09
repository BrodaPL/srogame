export const multiplayerEn = {
  eyebrow: 'Multiplayer',
  title: 'Lobby Browser',
  subtitle: 'Browse many draft lobbies and running multiplayer games. Joining a draft lobby removes you from any other draft lobby.',
  subtitleSecondary: 'If a running multiplayer member enabled logout replacement, their seat can continue as a bot until they return. Standard multiplayer turns still require online humans and ready-state; Scheduled Turns games progress by server schedule.',
  sections: {
    update: 'Update',
    loginRequired: 'Login Required',
    currentAccount: 'Current account',
    activeDraftLobbies: 'Active Draft Lobbies',
    activeRunningGames: 'Active Running Games',
    otherMultiplayerGames: 'Other Multiplayer Games',
    archivedMultiplayerGames: 'Archived Multiplayer Games',
    noSelection: 'No Selection',
    loading: 'Loading',
    unavailable: 'Unavailable',
    selectedGame: 'Selected Game',
    runningMultiplayerGame: 'Running Multiplayer Game',
    savedInactive: 'Saved / Inactive',
    lobbyOverview: 'Lobby Overview',
    members: 'Members',
    boundSave: 'Bound Save',
    savedHumanSeats: 'Saved Human Seats',
    hostControls: 'Host Controls',
    resumeLobby: 'Resume Lobby',
    scheduledTurns: 'Scheduled Turns'
  },
  browser: {
    activeDraftMeta: 'Open multiplayer drafts updated within the last hour.',
    activeRunningMeta: 'Currently loaded multiplayer games you can enter or inspect.',
    otherGamesMeta: 'Older drafts and saved inactive multiplayer games that are not currently joinable.',
    archivedGamesMeta: 'Historical multiplayer records kept out of the normal recovery flow by default.',
    loadingDrafts: 'Loading draft lobbies.',
    noDrafts: 'No current draft lobbies are open right now.',
    loadingRunning: 'Loading running multiplayer games.',
    noRunning: 'No running multiplayer games are visible to this account yet.',
    noOtherGames: 'No other multiplayer games are visible to this account.',
    noArchivedGames: 'No archived multiplayer games are visible to this account.',
    host: 'Host: {{host}}',
    updated: 'Updated: {{date}}',
    offlineBotSeats: 'Offline bot seats: {{count}}'
  },
  labels: {
    mode: 'Mode'
  },
  detail: {
    noSelection: 'Select a draft lobby or running game from the browser.',
    loading: 'Reading selected multiplayer game details.',
    unavailable: 'The selected multiplayer game is no longer available.',
    savedInactiveBody: 'This multiplayer game is saved but not currently loaded. Ask localAdmin to resume it before entering again.',
    runningBody: 'This game is already running. Use Enter to rejoin it if you have access.'
  },
  account: {
    localAdmin: 'Local Admin'
  },
  actions: {
    createDraftLobby: 'Create draft lobby',
    creating: 'Creating...',
    logout: 'Logout',
    enter: 'Enter',
    join: 'Join',
    showOtherGames: 'Show other games',
    hideOtherGames: 'Hide other games',
    showArchived: 'Show archived',
    hideArchived: 'Hide archived',
    returnToGame: 'Return to game',
    enterRunningGame: 'Enter running game',
    joinRunningGame: 'Join running game',
    resumeLobby: 'Resume lobby',
    archive: 'Archive',
    leaveCurrentGame: 'Leave current game',
    joinDraftLobby: 'Join draft lobby',
    leaveDraftLobby: 'Leave draft lobby',
    ready: 'Ready',
    notReady: 'Not ready',
    saveLobbySetup: 'Save lobby setup',
    bindSelectedSave: 'Bind selected save',
    switchToNewGame: 'Switch to new game',
    startFromSave: 'Start from save',
    startMultiplayerGame: 'Start multiplayer game',
    starting: 'Starting...',
    refreshBrowser: 'Refresh browser',
    refreshing: 'Refreshing...',
    editSchedule: 'Edit schedule',
    close: 'Close',
    restoreDefault: 'Restore default'
  },
  fields: {
    galaxyName: 'Galaxy name',
    gameType: 'Game type',
    galaxyWidth: 'Galaxy width',
    galaxyHeight: 'Galaxy height',
    galaxyCenterSize: 'Galaxy center size (%)',
    voidChance: 'Void chance (%)',
    starsAmountModifierMin: 'Stars modifier min',
    starsAmountModifierMax: 'Stars modifier max',
    botsAmount: 'Bots amount',
    botDifficulty: 'Bot difficulty (%)',
    neutralBotsAmount: 'Neutral bots amount (%)',
    neutralBotsDifficulty: 'Neutral bots difficulty (%)',
    autoSaveTurns: 'Auto save every N turns',
    scheduledTurns: 'Scheduled Turns',
    startingHomeworldPreset: 'Starting homeworld preset',
    testingOptions: 'Testing options',
    startingResources: 'Starting resources',
    botPersonalities: 'Bot personalities',
    botDiplomacy: 'Bot diplomacy'
  },
  gameTypes: {
    PvP: 'PvP',
    PvPvE: 'PvPvE',
    PvE: 'PvE',
    Sandbox: 'Sandbox'
  },
  messages: {
    browseWithoutLogin: 'You can browse multiplayer games, but joining or managing them requires login.',
    joinedDraftLobby: 'Joined draft lobby. Any previous draft-lobby membership was cleared.',
    leftDraftLobby: 'Left draft lobby.',
    reopenedResumeLobby: 'Reopened saved multiplayer game as a resumed lobby.',
    archivedGame: 'Archived multiplayer game.',
    markedReady: 'Marked ready.',
    markedNotReady: 'Marked not ready.',
    lobbySetupSaved: 'Lobby setup saved.',
    saveBound: 'Save bound to draft lobby.',
    switchedToNewGame: 'Draft lobby switched back to new-game mode.',
    seatAssignmentUpdated: 'Seat assignment updated.',
    leftCurrentGameDefault: 'Left current multiplayer game. You can rejoin it later.',
    selectedSaveRequired: 'Select a save first.',
    selectedMembersCountOne: '{{count}} member',
    selectedMembersCountMany: '{{count}} members',
    humanPlayerAmountDerived: 'Human player amount is taken from joined lobby members: {{count}}.',
    scheduledTurnsDisabled: 'Disabled',
    scheduledTurnsPerDayOne: '{{count}} turn per day',
    scheduledTurnsPerDayMany: '{{count}} turns per day',
    selectedHours: '{{count}} selected',
    autoSaveDisabled: 'disabled',
    autoSaveEveryTurns: 'every {{turns}} turns'
  },
  errors: {
    createLobbyFailed: 'Unable to create a multiplayer lobby.',
    runningGameNotJoinable: 'This running game is not currently joinable.',
    joinRunningGameFailed: 'Unable to join the running Scheduled Turns game.',
    leaveDraftLobbyFailed: 'Unable to leave the draft lobby.',
    leaveCurrentGameFailed: 'Unable to leave the current multiplayer game.',
    archiveFailed: 'Unable to archive the selected multiplayer game.',
    lobbySetupInvalid: 'Lobby setup is incomplete or invalid.',
    invalidSeatAssignment: 'Invalid seat assignment.',
    startMultiplayerFailed: 'Unable to start the multiplayer game.',
    gameNotEnterable: 'This multiplayer game is not currently enterable.',
    enterRunningGameInactive: 'This multiplayer game is not currently active.',
    enterRunningGameFailed: 'Unable to enter the selected multiplayer game.',
    loadBrowserFailed: 'Unable to load multiplayer games.',
    loadDetailFailed: 'Unable to load multiplayer game details.',
    loadSavesFailed: 'Unable to load available saves.',
    actionFailed: 'Multiplayer action failed.'
  },
  status: {
    draft: 'Draft',
    running: 'Running',
    archived: 'Archived',
    resumedLobby: 'Resumed lobby',
    savedInactive: 'Saved / Inactive',
    multiplayer: 'Multiplayer',
    currentTurn: 'Turn {{turn}}',
    modeLoadSave: 'Load saved game',
    modeNewGame: 'Start new game',
    joinedPlayers: 'Joined players: {{count}}',
    scheduledTurnsPerDay: 'Scheduled Turns: {{count}} turn(s) per day.',
    onlineHumanControlled: 'Online / human-controlled',
    autoSkipTurn: 'Auto skip turn',
    offlineBotControlled: 'Offline, bot-controlled ({{profile}})',
    defaultBotProfile: 'Default',
    online: 'Online',
    autoSkip: 'Auto skip',
    offlineBot: 'Offline bot',
    ready: 'Ready',
    notReady: 'Not ready',
    readyForStart: 'Ready for start',
    waitingForReady: 'Waiting for ready'
  },
  inactiveReasons: {
    noPresentHumans: 'Stopped because no players remained present.',
    tooFewOnlinePlayers: 'Stopped because not enough players remained online.'
  },
  hostControls: {
    title: 'Only the local-admin host can manage this draft lobby and start the game.'
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
  scheduledTurns: {
    selectAtLeastOneHour: 'Select at least one scheduled turn hour.',
    mapTooSmall: 'Scheduled Turns games require at least {{size}}x{{size}} galaxy size.',
    onlyOneRunningGame: 'Only one running Scheduled Turns multiplayer game can be active on this server.',
    turnHoursTitle: 'Turn hours'
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
    deuterium: 'Deuterium',
    startingMetal: 'Starting metal',
    startingCrystal: 'Starting crystal',
    startingDeuterium: 'Starting deuterium'
  },
  saveBinding: {
    convertToBot: 'Convert to bot',
    seatWillBecomeBot: 'This seat will become a bot.',
    originalSavedPlayerMatched: 'Original saved player matched.',
    replacementPlayerAssigned: 'Replacement player assigned.'
  },
  callouts: {
    resumedLobbyTitle: 'Resumed lobby',
    resumedLobbyBody: 'This lobby resumes a saved multiplayer game. Settings stay locked to the saved snapshot while players rejoin and localAdmin prepares the restart.',
    logoutReplacementTitle: 'Logout replacement',
    logoutReplacementBody: 'Players who enable logout replacement can be temporarily bot-controlled in the running game. Standard games still require online humans; Scheduled Turns games keep progressing by schedule.',
    resumeLobbyBody: 'This resumed lobby is locked to the saved multiplayer snapshot. Players can rejoin here, seat replacements can still be adjusted if needed, and localAdmin can start the saved game again once everyone is ready.'
  },
  startBlockedReasons: {
    atLeastTwoJoinedPlayers: 'At least two joined players are required.',
    scheduledTurnsMaxHumans: 'Scheduled Turns games can have at most {{count}} human players.',
    standardMaxHumans: 'Standard multiplayer games can have at most {{count}} human players.',
    allNonAdminReady: 'All non-admin players must be ready.',
    bindSaveFirst: 'Bind a saved game first.',
    everyJoinedPlayerAssigned: 'Every joined player must be assigned to a saved human seat or leave the lobby.'
  }
} as const;
