export const loadGamePl = {
  eyebrow: 'Wczytaj Gre',
  title: 'Wczytaj Gre',
  subtitle: 'Zarzadzaj zapisami serwera, ponownie otwieraj niedawno zamkniete gry jednoosobowe i zastap aktywna gre runtime wybranym zapisem.',
  loading: {
    title: 'Wczytywanie',
    body: 'Odczytywanie zapisanych gier z serwera.'
  },
  sections: {
    summaryError: 'Blad podsumowania',
    noSavesFound: 'Brak zapisow',
    activeRuntimeGame: 'Aktywna gra runtime',
    recommendedReopen: 'Polecane ponowne otwarcie'
  },
  messages: {
    noSavesForContext: 'Nie znaleziono zapisow dla aktualnie wybranego kontekstu gry.',
    activeRuntimeReplacementWarning: 'Wczytanie zastapi aktualnie aktywna gre w pamieci.',
    confirmReplaceActiveGame: 'Rozumiem, ze wczytanie zastapi aktywna gre.',
    recommendedReopenReason: 'Niedawno zamknieta gra jednoosobowa. Wczytaj najnowszy zapis, aby otworzyc ja ponownie.',
    sessionExpired: 'Sesja wygasla. Zaloguj sie ponownie.',
    showingAllServerSaves: 'Pokazywane sa wszystkie zapisy serwera.',
    currentSelection: 'Aktualny wybor: {{gameName}}'
  },
  actions: {
    loginToLoad: 'Zaloguj sie, aby wczytac',
    logout: 'Wyloguj',
    loadLatestSave: 'Wczytaj najnowszy zapis',
    load: 'Wczytaj',
    delete: 'Usun',
    loading: 'Wczytywanie...',
    deleting: 'Usuwanie...',
    refreshSummary: 'Odswiez podsumowanie',
    refreshing: 'Odswiezanie...'
  },
  labels: {
    galaxy: 'Galaktyka',
    turn: 'Tura',
    owner: 'Wlasciciel',
    account: 'konto',
    unknown: 'Nieznany',
    latestSave: 'Najnowszy zapis',
    autoSave: 'Autozapis',
    disabled: 'wylaczony',
    everyTurns: 'co {{turns}} tur',
    saveCountOne: '{{count}} zapis',
    saveCountMany: '{{count}} zapisow'
  },
  status: {
    kindSingleplayer: 'Jednoosobowa',
    kindMultiplayer: 'Multiplayer',
    kindUntracked: 'Niesledzona',
    currentSelectedGame: 'Aktualnie wybrana gra',
    recentlyClosedSingleplayerGame: 'Niedawno zamknieta gra jednoosobowa',
    trackedSaves: 'Sledzone zapisy',
    untrackedSaves: 'Niesledzone zapisy',
    activeRuntime: 'Aktywny runtime',
    savedInactive: 'Zapisana / Nieaktywna',
    archived: 'Zarchiwizowana',
    singleplayerSaves: 'Zapisy jednoosobowe',
    multiplayerSaves: 'Zapisy multiplayer'
  },
  errors: {
    loadSummary: 'Nie udalo sie wczytac podsumowania zapisow.',
    loadSavedGame: 'Nie udalo sie wczytac zapisanej gry.',
    deleteSavedGame: 'Nie udalo sie usunac zapisanej gry.'
  }
} as const;
