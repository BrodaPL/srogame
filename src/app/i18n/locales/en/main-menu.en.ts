export const mainMenuEn = {
  eyebrow: 'Main Menu',
  subtitle: {
    loggedInAs: 'Logged in as {{playerName}}',
    localAdminTag: '(Local Admin)',
    notLoggedIn: 'Not logged in'
  },
  currentGame: {
    title: 'Current Game',
    noCurrentGameSelected: 'No current game selected',
    checkingCurrentGame: 'Checking current game',
    noGameSelected: 'No game selected',
    running: 'Running',
    draft: 'Draft',
    offline: 'Offline',
    archived: 'Archived',
    savedInactive: 'Saved / Inactive',
    selectOrCreateFirst: 'Select or create a game first.',
    multiplayerSavedInactiveHint: 'This multiplayer game is saved and inactive. Open Multiplayer to resume it.',
    unavailable: 'This game is not currently available.',
    resumeMultiplayerHint: 'Resume directly into the current running multiplayer game.',
    resumeHint: 'Resume directly into your current game.',
    closeUnavailable: 'Unable to close the current game.',
    resumeUnavailable: 'Unable to resume the selected game.'
  },
  actions: {
    loginRegister: 'Login / Register',
    resumeCurrentGame: 'Resume Current Game',
    closeCurrentGame: 'Close Current Game',
    closing: 'Closing...',
    openMultiplayer: 'Open Multiplayer',
    singleplayer: 'Singleplayer',
    multiplayer: 'Multiplayer',
    loadGame: 'Load Game',
    settings: 'Settings',
    logout: 'Logout',
    encyclopedia: 'Encyclopedia',
    helpAbout: 'Help & About'
  }
} as const;
