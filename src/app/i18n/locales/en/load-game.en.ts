export const loadGameEn = {
  eyebrow: 'Load Game',
  title: 'Load Game',
  subtitle: 'Manage server saves, reopen recently closed singleplayer games, and replace the active runtime game with a selected save.',
  loading: {
    title: 'Loading',
    body: 'Reading saved games from the server.'
  },
  sections: {
    summaryError: 'Summary Error',
    noSavesFound: 'No Saves Found',
    activeRuntimeGame: 'Active Runtime Game',
    recommendedReopen: 'Recommended Reopen'
  },
  messages: {
    noSavesForContext: 'No saves were found for the currently selected game context.',
    activeRuntimeReplacementWarning: 'Loading will replace the currently active in-memory game.',
    confirmReplaceActiveGame: 'I understand that loading will replace the active game.',
    recommendedReopenReason: 'Recently closed single-player game. Load the latest save to reopen it.',
    sessionExpired: 'Session expired. Please log in again.',
    showingAllServerSaves: 'Showing all server saves.',
    currentSelection: 'Current selection: {{gameName}}'
  },
  actions: {
    loginToLoad: 'Login to load',
    logout: 'Logout',
    loadLatestSave: 'Load latest save',
    load: 'Load',
    delete: 'Delete',
    loading: 'Loading...',
    deleting: 'Deleting...',
    refreshSummary: 'Refresh summary',
    refreshing: 'Refreshing...'
  },
  labels: {
    galaxy: 'Galaxy',
    turn: 'Turn',
    owner: 'Owner',
    account: 'account',
    unknown: 'Unknown',
    latestSave: 'Latest save',
    autoSave: 'Auto save',
    disabled: 'disabled',
    everyTurns: 'every {{turns}} turns',
    saveCountOne: '{{count}} save',
    saveCountMany: '{{count}} saves'
  },
  status: {
    kindSingleplayer: 'Singleplayer',
    kindMultiplayer: 'Multiplayer',
    kindUntracked: 'Untracked',
    currentSelectedGame: 'Current selected game',
    recentlyClosedSingleplayerGame: 'Recently closed single-player game',
    trackedSaves: 'Tracked saves',
    untrackedSaves: 'Untracked saves',
    activeRuntime: 'Active runtime',
    savedInactive: 'Saved / Inactive',
    archived: 'Archived',
    singleplayerSaves: 'Singleplayer saves',
    multiplayerSaves: 'Multiplayer saves'
  },
  errors: {
    loadSummary: 'Unable to load save summary.',
    loadSavedGame: 'Unable to load saved game.',
    deleteSavedGame: 'Unable to delete saved game.'
  }
} as const;
