export const mainMenuPl = {
  eyebrow: 'Menu glowne',
  subtitle: {
    loggedInAs: 'Zalogowano jako {{playerName}}',
    localAdminTag: '(Lokalny administrator)',
    notLoggedIn: 'Niezalogowano'
  },
  currentGame: {
    title: 'Biezaca gra',
    noCurrentGameSelected: 'Nie wybrano biezacej gry',
    checkingCurrentGame: 'Sprawdzanie biezacej gry',
    noGameSelected: 'Nie wybrano gry',
    running: 'Aktywna',
    draft: 'Wersja robocza',
    offline: 'Offline',
    archived: 'Zarchiwizowana',
    savedInactive: 'Zapisana / Nieaktywna',
    selectOrCreateFirst: 'Najpierw wybierz lub utworz gre.',
    multiplayerSavedInactiveHint: 'Ta gra multiplayer jest zapisana i nieaktywna. Otworz Multiplayer, aby ja wznowic.',
    unavailable: 'Ta gra jest obecnie niedostepna.',
    resumeMultiplayerHint: 'Wznow bezposrednio biezaca aktywna gre multiplayer.',
    resumeHint: 'Wznow bezposrednio biezaca gre.',
    closeUnavailable: 'Nie udalo sie zamknac biezacej gry.',
    resumeUnavailable: 'Nie udalo sie wznowic wybranej gry.'
  },
  actions: {
    loginRegister: 'Logowanie / Rejestracja',
    resumeCurrentGame: 'Wznow biezaca gre',
    closeCurrentGame: 'Zamknij biezaca gre',
    closing: 'Zamykanie...',
    openMultiplayer: 'Otworz Multiplayer',
    singleplayer: 'Jednoosobowa',
    multiplayer: 'Multiplayer',
    loadGame: 'Wczytaj gre',
    settings: 'Ustawienia',
    logout: 'Wyloguj',
    encyclopedia: 'Encyklopedia',
    helpAbout: 'Pomoc i informacje'
  }
} as const;
