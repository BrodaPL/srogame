export const topMenuPl = {
  nav: {
    galactic: 'Galaktyka',
    imperium: 'Imperium',
    reports: 'Raporty',
    mail: 'Poczta',
    diplomacy: 'Dyplomacja',
    researches: 'Badania',
    production: 'Produkcja',
    buildings: 'Budynki',
    operations: 'Operacje',
    missionPlanner: 'Planer Misji',
    botAi: 'Bot AI'
  },
  actions: {
    auto: 'Auto',
    scheduledTurns: 'Zaplanowane Tury',
    endTurn: 'Zakoncz Ture {{turn}}'
  },
  status: {
    nextScheduledTurnUnknown: 'Nastepna zaplanowana tura --',
    nextScheduledTurnIn: 'Nastepna tura za {{time}}',
    readyWaiting: 'Gotowe. Oczekiwanie na innych graczy.',
    readyWaitingFor: 'Gotowe. Oczekiwanie na: {{players}}.'
  },
  hints: {
    autoSkipTooltip: 'Auto skip tury podczas AFK. Po {{idleDuration}} bezczynnosci w tej grze multiplayer twoje tury beda automatycznie pomijane. Po 30 minutach bezczynnosci zostaniesz usuniety z aktywnej obecnosci multiplayer.'
  },
  notices: {
    mailRequiresAttention: 'Poczta wymaga uwagi ({{count}})'
  },
  errors: {
    selectRunningMultiplayerFirst: 'Najpierw wybierz aktywna gre multiplayer.',
    noPlayerSession: 'Nie znaleziono sesji gracza.',
    updateAutoSkipFailed: 'Nie udalo sie zaktualizowac auto skip tury.',
    processTurnFailed: 'Nie udalo sie przetworzyc tury.'
  }
} as const;
