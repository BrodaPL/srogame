export const gameShellEn = {
  loading: {
    title: 'Loading game',
    body: 'Loading the current galaxy state from the server.'
  },
  state: {
    loginRequiredTitle: 'Login required',
    loginRequiredBody: 'Login to continue, then start or join a game.',
    noActiveGameTitle: 'No active game',
    unableToLoadTitle: 'Unable to load game',
    noActiveGameAssigned: 'This account is not assigned to the current selected game. Join, resume, or start a game from the main menu.',
    serverStateMissing: 'The server did not return the current game state.'
  },
  actions: {
    goToLogin: 'Go to login'
  },
  overlays: {
    turnProcessing: {
      eyebrow: 'Turn Processing',
      title: 'Processing turn...',
      body: 'The server is resolving income, construction, and research.'
    },
    multiplayerPresence: {
      eyebrow: 'Multiplayer Presence',
      title: 'You were removed from active multiplayer presence after being away too long.',
      body: 'You have re-entered the loaded game now, but other players could keep playing only after enough humans were present again.',
      continue: 'Continue'
    },
    autoSkip: {
      eyebrow: 'Auto Skip Turn',
      title: 'Auto skip turn was activated because you were AFK.',
      body: 'Your multiplayer seat is still present, but your turns are being skipped until you disable auto skip.',
      keepEnabled: 'Keep enabled',
      disable: 'Disable auto skip turn'
    }
  }
} as const;
