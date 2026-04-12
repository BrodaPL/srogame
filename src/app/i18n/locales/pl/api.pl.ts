export const apiPl = {
  errors: {
    unauthorized: 'Brak autoryzacji.',
    forbidden: 'Brak dostepu.',
    invalidGameId: 'Nieprawidlowe id gry.',
    gameNotFound: 'Nie znaleziono gry.',
    noCurrentGameSelected: 'Nie wybrano biezacej gry. Dolacz, wznow lub rozpocznij gre z menu glownego.',
    noActiveGameAssigned: 'To konto nie jest przypisane do aktualnie wybranej gry. Dolacz, wznow lub rozpocznij gre z menu glownego.',
    gameNotActiveAskAdmin: 'Ta gra nie jest obecnie aktywna. Popros localAdmina o jej wznowienie.',
    playerNotFoundInGame: 'Nie znaleziono gracza w biezacej grze.'
  },
  auth: {
    register: {
      rateLimited: 'Zbyt wiele prob rejestracji. Sprobuj ponownie za {{retryAfterSeconds}} sekund.',
      invalidPayload: 'Nieprawidlowa nazwa gracza, email lub haslo.',
      userExists: 'Taki uzytkownik juz istnieje.',
      emailExists: 'Taki email juz istnieje.',
      captchaFailed: 'Weryfikacja CAPTCHA nie powiodla sie.',
      successManualActivation: 'Konto zostalo utworzone. Przed logowaniem wymagane jest potwierdzenie email. Na razie aktywacja musi zostac wykonana recznie na serwerze.'
    },
    resendConfirmation: {
      rateLimited: 'Zbyt wiele prob ponownego wyslania potwierdzenia. Sprobuj ponownie za {{retryAfterSeconds}} sekund.',
      invalidEmail: 'Nieprawidlowy email.',
      cooldown: 'Potwierdzenie mozna wyslac ponownie za {{retryAfterMinutes}} minut{{minuteSuffix}}.',
      successGeneric: 'Jesli istnieje oczekujace konto dla tego emaila, okno potwierdzenia zostalo odswiezone. Wysylka emaili nie jest jeszcze skonfigurowana na tym serwerze; aktywacja nadal musi zostac wykonana recznie.'
    },
    login: {
      rateLimited: 'Zbyt wiele prob logowania. Sprobuj ponownie za {{retryAfterSeconds}} sekund.',
      invalidCredentials: 'Nieprawidlowa nazwa gracza lub haslo.',
      userNotFound: 'Nie ma takiego uzytkownika.',
      pendingConfirmation: 'Konto nie jest jeszcze potwierdzone.',
      wrongPasswordAttemptsLeft: 'Bledne haslo. Pozostalo {{attemptsLeft}} prob{{attemptSuffix}} przed 10-minutowa blokada.',
      accountLocked: 'Logowanie na konto jest zablokowane z powodu zbyt wielu blednych hasel. Sprobuj ponownie za {{retryAfterMinutes}} minut{{minuteSuffix}}.'
    }
  },
  account: {
    settings: {
      notFound: 'Nie znaleziono konta.',
      rateLimited: 'Zbyt wiele zmian ustawien. Sprobuj ponownie za {{retryAfterSeconds}} sekund.',
      invalidBotProfile: 'Przy wlaczonej zamianie na bota wymagany jest prawidlowy profil bota.',
      forgotPasswordUnavailable: 'Reset hasla przez email nie jest jeszcze dostepny.',
      tutorialsReset: 'Postep samouczkow zostal zresetowany dla biezacej sesji.'
    }
  },
  games: {
    current: {
      unavailableResume: 'Nie masz obecnie dostepu do wznowienia tej gry.',
      inactiveAskAdmin: 'Ta gra nie jest obecnie aktywna. Popros localAdmina o jej wznowienie.'
    },
    closeCurrent: {
      requiresLocalAdmin: 'Do zamkniecia gry jednoosobowej wymagane sa uprawnienia localAdmin.',
      selectFirst: 'Najpierw ustaw te gre jako biezaca.',
      useMultiplayerActions: 'Dla gier multiplayer uzyj akcji opuszczania lub wznawiania multiplayera.',
      notLoaded: 'Ta gra jednoosobowa nie jest obecnie zaladowana.',
      failed: 'Nie udalo sie zamknac biezacej gry jednoosobowej.'
    }
  },
  gameplay: {
    endTurn: {
      processingInProgress: 'Przetwarzanie tury jest juz w toku.',
      mailBlocked: 'Otworz Poczta i zalatw {{pendingRequestCount}} oczekujac{{pendingRequestSuffix}} prosb{{mailJoinClause}}przeczytaj {{unreadMailCount}} nieprzeczytan{{unreadMailSuffix}} wiadomosc{{unreadMessageSuffix}} przed zakonczeniem tury.',
      notEnoughOnlineHumans: 'Co najmniej 2 ludzkich graczy musi byc online, aby kontynuowac te gre multiplayer.',
      activeHumanRequired: 'Co najmniej 1 aktywny ludzki gracz musi byc obecny, aby kontynuowac te gre multiplayer.',
      processingFailed: 'Przetwarzanie tury nie powiodlo sie.'
    }
  },
  multiplayer: {
    presence: {
      runningGameNotFound: 'Nie znaleziono uruchomionej gry multiplayer.',
      autoSkipRequiresEnabledBoolean: 'Przelacznik auto skip wymaga wartosci enabled typu boolean.'
    }
  },
  commands: {
    common: {
      queueFull: 'Kolejka jest pelna.',
      buildingRequirementsNotMet: 'Wymagania budynkow nie sa spelnione.',
      technologyRequirementsNotMet: 'Wymagania technologiczne nie sa spelnione.',
      insufficientResources: 'Niewystarczajace zasoby.',
      onlyOwnPlanetModifiable: 'Mozna modyfikowac tylko wlasne planety.',
      starSystemNotFound: 'Nie znaleziono ukladu gwiezdnego.',
      planetNotFound: 'Nie znaleziono planety.'
    },
    building: {
      alreadyQueued: 'Ten typ budynku jest juz w kolejce.',
      unknownType: 'Nieznany typ budynku.'
    },
    shipyard: {
      buildShipyardFirst: 'Najpierw zbuduj Stocznie.',
      unknownShipType: 'Nieznany typ statku.',
      unknownDefenceType: 'Nieznany typ obrony.',
      bombDepotCapacityReached: 'Osiegnieto pojemnosc Magazynu Bomb.'
    },
    research: {
      buildResearchLabFirst: 'Najpierw zbuduj Laboratorium Badawcze.',
      labAssignedAsHelper: 'Laboratorium Badawcze jest obecnie przypisane jako pomocnicze.',
      unknownTechnologyType: 'Nieznany typ technologii.',
      alreadyQueued: 'Ta technologia jest juz badana.',
      helperSystemNotFound: 'Nie znaleziono ukladu gwiezdnego planety pomocniczej.',
      helperPlanetNotFound: 'Nie znaleziono planety pomocniczej.',
      helperPlanetMustBeOwned: 'Planeta pomocnicza musi nalezec do ciebie.',
      helperNeedsResearchLab: 'Wybrana planeta pomocnicza nie ma Laboratorium Badawczego.',
      helperLabBusy: 'Wybrane laboratorium pomocnicze jest zajete.',
      tooManyHelperLabs: 'Przypisano zbyt wiele laboratoriow pomocniczych.'
    },
    fleet: {
      missionUnavailable: 'Ten typ misji nie jest dostepny w fazie 1.',
      missionDefinitionNotFound: 'Nie znaleziono definicji misji.',
      originPlanetNotFound: 'Nie znaleziono planety poczatkowej.',
      targetPlanetNotFound: 'Nie znaleziono planety docelowej.',
      originPlanetMustBeOwned: 'Planeta poczatkowa musi nalezec do ciebie.',
      playerNotFound: 'Nie znaleziono gracza.',
      activeFleetLimitReached: 'Osiegnieto limit aktywnych flot. Rozwin COMPUTER_TECHNOLOGY, aby kontrolowac wiecej flot.',
      selectAtLeastOneShip: 'Wybierz co najmniej jeden statek.',
      insufficientHangarSpace: 'Niewystarczajaca pojemnosc hangaru na przewozone statki i bomby.',
      insufficientBomberHangarSpace: 'Niewystarczajaca pojemnosc hangaru bombowego na przewozone bomby.',
      insufficientCargoSpace: 'Niewystarczajaca pojemnosc ladowni.',
      insufficientResourcesCargoFuel: 'Niewystarczajace zasoby na ladunek i paliwo.',
      jumpGateRequiresOwnedTarget: 'Wrota Skokowe wymagaja posiadanej planety docelowej.',
      requestedShipSelectionUnavailable: 'Wybrany zestaw statkow nie jest juz dostepny na planecie poczatkowej.'
    }
  }
} as const;
