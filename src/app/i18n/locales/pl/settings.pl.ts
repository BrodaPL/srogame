export const settingsPl = {
  eyebrow: 'Ustawienia',
  title: 'Ustawienia konta',
  subtitle: 'Zarzadzaj stanem konta, preferencjami wylogowania w multiplayerze i samouczkami.',
  loading: 'Ladowanie ustawien.',
  errors: {
    load: 'Nie udalo sie wczytac ustawien.',
    update: 'Nie udalo sie zapisac ustawien.',
    resetTutorials: 'Nie udalo sie zresetowac samouczkow.'
  },
  info: {
    preferencesUpdated: 'Ustawienia zostaly zapisane.'
  },
  sections: {
    account: 'Konto',
    security: 'Bezpieczenstwo',
    gameplay: 'Rozgrywka',
    interface: 'Interfejs',
    tutorials: 'Samouczki'
  },
  account: {
    player: 'Gracz',
    email: 'Email',
    emailConfirmation: 'Potwierdzenie email',
    accountStatus: 'Status konta',
    accountStatusActive: 'Aktywne',
    accountStatusPendingConfirmation: 'Oczekuje na potwierdzenie',
    created: 'Utworzono',
    currentGame: 'Biezaca gra',
    noGameSelected: 'Nie wybrano gry.',
    privileges: 'Uprawnienia'
  },
  security: {
    forgotPassword: 'Zapomniane haslo',
    resetPassword: 'Reset hasla',
    resetPasswordUnavailableTitle: 'Reset hasla przez email nie jest jeszcze dostepny.'
  },
  gameplay: {
    replaceWithBotOnLogout: 'Zastepuj mnie botem po wylogowaniu',
    botTypeWhenOffline: 'Typ bota po wylogowaniu',
    offlineBotReplacementEnabled: 'Zastepowanie botem wlaczone',
    offlineBotReplacementDisabled: 'Zastepowanie botem wylaczone',
    offlineBotReplacementEnabledBody: 'Gdy opuscisz aktywna gre multiplayer, twoje miejsce moze przejac ten profil bota do czasu powrotu. Tury multiplayer nadal wymagaja co najmniej 2 ludzi online.',
    offlineBotReplacementDisabledBody: 'Gdy opuscisz aktywna gre multiplayer, inni gracze moga nadal czekac na twoj ruch. Tury multiplayer nadal wymagaja co najmniej 2 ludzi online.'
  },
  interface: {
    subtitle: 'Wybierz jezyk interfejsu gry.',
    languageLabel: 'Jezyk',
    languageSelectionAriaLabel: 'Wybor jezyka',
    languageEnglishShort: 'ENG',
    languagePolishShort: 'PL',
    languageEnglishFull: 'Angielski',
    languagePolishFull: 'Polski'
  },
  tutorials: {
    subtitle: 'Zresetuj postep samouczkow dla biezacej sesji i aktualnie wybranej aktywnej gry.'
  },
  botProfiles: {
    BALANCED: 'Zrownowazony',
    AGGRESSOR: 'Agresor',
    TURTLE: 'Zolw',
    MINER: 'Gornik',
    AVOIDER: 'Unikajacy',
    BUNKERER: 'Bunkrujacy'
  }
} as const;
