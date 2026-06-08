export const topMenuEn = {
  nav: {
    galactic: 'Galactic',
    imperium: 'Imperium',
    reports: 'Reports',
    mail: 'Mail',
    diplomacy: 'Diplomacy',
    researches: 'Researches',
    production: 'Production',
    buildings: 'Buildings',
    operations: 'Operations',
    missionPlanner: 'Mission Planner',
    botAi: 'Bot AI'
  },
  actions: {
    auto: 'Auto',
    scheduledTurns: 'Scheduled Turns',
    endTurn: 'End Turn {{turn}}'
  },
  status: {
    nextScheduledTurnUnknown: 'Next scheduled turn --',
    nextScheduledTurnIn: 'Next turn in {{time}}',
    readyWaiting: 'Ready. Waiting for other players.',
    readyWaitingFor: 'Ready. Waiting for: {{players}}.'
  },
  hints: {
    autoSkipTooltip: 'Auto skip turn while AFK. After {{idleDuration}} of inactivity in this multiplayer game, your turns are skipped automatically. After 30 minutes of inactivity, you are removed from active multiplayer presence.'
  },
  notices: {
    mailRequiresAttention: 'Mail requires attention ({{count}})'
  },
  errors: {
    selectRunningMultiplayerFirst: 'Select a running multiplayer game first.',
    noPlayerSession: 'No player session found.',
    updateAutoSkipFailed: 'Unable to update auto skip turn.',
    processTurnFailed: 'Unable to process turn.'
  }
} as const;
