export const gameShellPl = {
  loading: {
    title: 'Ladowanie gry',
    body: 'Ladowanie aktualnego stanu galaktyki z serwera.'
  },
  state: {
    loginRequiredTitle: 'Wymagane logowanie',
    loginRequiredBody: 'Zaloguj sie, aby kontynuowac, a nastepnie uruchom lub dolacz do gry.',
    noActiveGameTitle: 'Brak aktywnej gry',
    unableToLoadTitle: 'Nie udalo sie wczytac gry',
    noActiveGameAssigned: 'To konto nie jest przypisane do aktualnie wybranej gry. Dolacz, wznow lub rozpocznij gre z menu glownego.',
    serverStateMissing: 'Serwer nie zwrocil aktualnego stanu gry.'
  },
  actions: {
    goToLogin: 'Przejdz do logowania'
  },
  overlays: {
    turnProcessing: {
      eyebrow: 'Przetwarzanie Tury',
      title: 'Przetwarzanie tury...',
      body: 'Serwer rozlicza dochod, budowe i badania.'
    },
    multiplayerPresence: {
      eyebrow: 'Obecnosc Multiplayer',
      title: 'Zostales usuniety z aktywnej obecnosci multiplayer po zbyt dlugiej nieobecnosci.',
      body: 'Ponownie wszedles teraz do zaladowanej gry, ale inni gracze mogli grac dalej dopiero wtedy, gdy znow bylo obecnych wystarczajaco wielu ludzi.',
      continue: 'Kontynuuj'
    },
    autoSkip: {
      eyebrow: 'Auto Skip Tury',
      title: 'Auto skip tury wlaczyl sie, poniewaz byles AFK.',
      body: 'Twoje miejsce w multiplayerze nadal jest obecne, ale twoje tury sa pomijane, dopoki nie wylaczysz auto skip.',
      keepEnabled: 'Pozostaw wlaczone',
      disable: 'Wylacz auto skip tury'
    }
  }
} as const;
