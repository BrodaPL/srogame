export const settingsEn = {
  eyebrow: 'Settings',
  title: 'Account Settings',
  subtitle: 'Manage your account status, multiplayer logout preferences, and tutorial controls.',
  loading: 'Loading settings.',
  errors: {
    load: 'Unable to load settings.',
    update: 'Unable to update preferences.',
    resetTutorials: 'Unable to reset tutorials.'
  },
  info: {
    preferencesUpdated: 'Preferences updated.'
  },
  sections: {
    account: 'Account',
    security: 'Security',
    gameplay: 'Gameplay',
    interface: 'Interface',
    tutorials: 'Tutorials'
  },
  account: {
    player: 'Player',
    email: 'Email',
    emailConfirmation: 'Email confirmation',
    accountStatus: 'Account status',
    accountStatusActive: 'Active',
    accountStatusPendingConfirmation: 'Pending confirmation',
    created: 'Created',
    currentGame: 'Current game',
    noGameSelected: 'No game selected.',
    privileges: 'Privileges'
  },
  security: {
    forgotPassword: 'Forgot password',
    resetPassword: 'Reset password',
    resetPasswordUnavailableTitle: 'Password reset by email is not available yet.'
  },
  gameplay: {
    replaceWithBotOnLogout: 'Replace me with bot after logout',
    botTypeWhenOffline: 'Bot type when offline',
    offlineBotReplacementEnabled: 'Offline bot replacement enabled',
    offlineBotReplacementDisabled: 'Offline bot replacement disabled',
    offlineBotReplacementEnabledBody: 'When you leave a running multiplayer game, your seat may be played by this bot profile until you return. Multiplayer turns still require at least 2 human players to be online.',
    offlineBotReplacementDisabledBody: 'If you leave a running multiplayer game, other players may still need to wait for you. Multiplayer turns still require at least 2 human players to be online.'
  },
  interface: {
    subtitle: 'Choose the language for the game interface.',
    languageLabel: 'Language',
    languageSelectionAriaLabel: 'Language selection',
    languageEnglishShort: 'ENG',
    languagePolishShort: 'PL',
    languageEnglishFull: 'English',
    languagePolishFull: 'Polish'
  },
  tutorials: {
    subtitle: 'Reset tutorial progress for the current session and currently selected running game.'
  },
  botProfiles: {
    BALANCED: 'Balanced',
    AGGRESSOR: 'Aggressor',
    TURTLE: 'Turtle',
    MINER: 'Miner',
    AVOIDER: 'Avoider',
    BUNKERER: 'Bunkerer'
  }
} as const;
