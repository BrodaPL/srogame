export const multiplayerPl = {
  eyebrow: 'Multiplayer',
  title: 'Przeglad Lobbies',
  subtitle: 'Przegladaj wiele lobby roboczych i uruchomionych gier multiplayer. Dolaczenie do jednego lobby roboczego usuwa cie z kazdego innego lobby roboczego.',
  subtitleSecondary: 'Jesli gracz w uruchomionej grze wlaczyl zastapienie po wylogowaniu, jego miejsce moze byc przejete przez bota do czasu powrotu. Standardowe tury multiplayer nadal wymagaja obecnych ludzi i stanu gotowosci; gry Zaplanowane Tury postepuja wedlug harmonogramu serwera.',
  sections: {
    update: 'Aktualizacja',
    loginRequired: 'Wymagane logowanie',
    currentAccount: 'Biezace konto',
    activeDraftLobbies: 'Aktywne lobby robocze',
    activeRunningGames: 'Aktywne uruchomione gry',
    otherMultiplayerGames: 'Inne gry multiplayer',
    archivedMultiplayerGames: 'Zarchiwizowane gry multiplayer',
    noSelection: 'Brak wyboru',
    loading: 'Wczytywanie',
    unavailable: 'Niedostepne',
    selectedGame: 'Wybrana gra',
    runningMultiplayerGame: 'Uruchomiona gra multiplayer',
    savedInactive: 'Zapisana / Nieaktywna',
    lobbyOverview: 'Przeglad lobby',
    members: 'Gracze',
    boundSave: 'Powiazany zapis',
    savedHumanSeats: 'Zapisane ludzkie miejsca',
    hostControls: 'Kontrola hosta',
    resumeLobby: 'Lobby wznowienia',
    scheduledTurns: 'Zaplanowane Tury'
  },
  browser: {
    activeDraftMeta: 'Otwarte lobby multiplayer zaktualizowane w ciagu ostatniej godziny.',
    activeRunningMeta: 'Obecnie zaladowane gry multiplayer, do ktorych mozna wejsc lub je sprawdzic.',
    otherGamesMeta: 'Starsze lobby i zapisane nieaktywne gry multiplayer, do ktorych nie mozna obecnie dolaczyc.',
    archivedGamesMeta: 'Historyczne zapisy multiplayer ukryte domyslnie poza zwyklym przeplywem odzyskiwania.',
    loadingDrafts: 'Wczytywanie lobby roboczych.',
    noDrafts: 'Obecnie nie ma otwartych lobby roboczych.',
    loadingRunning: 'Wczytywanie uruchomionych gier multiplayer.',
    noRunning: 'Dla tego konta nie sa jeszcze widoczne zadne uruchomione gry multiplayer.',
    noOtherGames: 'Dla tego konta nie sa widoczne zadne inne gry multiplayer.',
    noArchivedGames: 'Dla tego konta nie sa widoczne zadne zarchiwizowane gry multiplayer.',
    host: 'Host: {{host}}',
    updated: 'Aktualizacja: {{date}}',
    offlineBotSeats: 'Miejsca offline przejete przez boty: {{count}}'
  },
  labels: {
    mode: 'Tryb'
  },
  detail: {
    noSelection: 'Wybierz lobby robocze lub uruchomiona gre z przegladarki.',
    loading: 'Odczytywanie szczegolow wybranej gry multiplayer.',
    unavailable: 'Wybrana gra multiplayer nie jest juz dostepna.',
    savedInactiveBody: 'Ta gra multiplayer jest zapisana, ale nie jest obecnie zaladowana. Popros localAdmina o jej wznowienie przed ponownym wejsciem.',
    runningBody: 'Ta gra jest juz uruchomiona. Uzyj Wejdz, aby dolaczyc ponownie, jesli masz dostep.'
  },
  account: {
    localAdmin: 'Local Admin'
  },
  actions: {
    createDraftLobby: 'Utworz lobby robocze',
    creating: 'Tworzenie...',
    logout: 'Wyloguj',
    enter: 'Wejdz',
    join: 'Dolacz',
    showOtherGames: 'Pokaz inne gry',
    hideOtherGames: 'Ukryj inne gry',
    showArchived: 'Pokaz archiwalne',
    hideArchived: 'Ukryj archiwalne',
    returnToGame: 'Wroc do gry',
    enterRunningGame: 'Wejdz do uruchomionej gry',
    joinRunningGame: 'Dolacz do uruchomionej gry',
    resumeLobby: 'Wznow lobby',
    archive: 'Archiwizuj',
    leaveCurrentGame: 'Opusc biezaca gre',
    joinDraftLobby: 'Dolacz do lobby roboczego',
    leaveDraftLobby: 'Opusc lobby robocze',
    ready: 'Gotowy',
    notReady: 'Niegotowy',
    saveLobbySetup: 'Zapisz ustawienia lobby',
    bindSelectedSave: 'Powiaz wybrany zapis',
    switchToNewGame: 'Przelacz na nowa gre',
    startFromSave: 'Uruchom z zapisu',
    startMultiplayerGame: 'Uruchom gre multiplayer',
    starting: 'Uruchamianie...',
    refreshBrowser: 'Odswiez przegladarke',
    refreshing: 'Odswiezanie...',
    editSchedule: 'Edytuj harmonogram',
    close: 'Zamknij',
    restoreDefault: 'Przywroc domyslny'
  },
  fields: {
    galaxyName: 'Nazwa galaktyki',
    gameType: 'Typ gry',
    galaxyWidth: 'Szerokosc galaktyki',
    galaxyHeight: 'Wysokosc galaktyki',
    galaxyCenterSize: 'Rozmiar centrum galaktyki (%)',
    voidChance: 'Szansa pustki (%)',
    starsAmountModifierMin: 'Minimalny modyfikator gwiazd',
    starsAmountModifierMax: 'Maksymalny modyfikator gwiazd',
    botsAmount: 'Liczba botow',
    botDifficulty: 'Poziom trudnosci botow (%)',
    neutralBotsAmount: 'Liczba neutralnych botow (%)',
    neutralBotsDifficulty: 'Poziom trudnosci neutralnych botow (%)',
    autoSaveTurns: 'Autozapis co N tur',
    scheduledTurns: 'Zaplanowane Tury',
    startingHomeworldPreset: 'Preset planety startowej',
    testingOptions: 'Opcje testowe',
    startingResources: 'Zasoby startowe',
    botPersonalities: 'Osobowosci botow',
    botDiplomacy: 'Dyplomacja botow'
  },
  gameTypes: {
    PvP: 'PvP',
    PvPvE: 'PvPvE',
    PvE: 'PvE',
    Sandbox: 'Sandbox'
  },
  messages: {
    browseWithoutLogin: 'Mozesz przegladac gry multiplayer, ale dolaczanie i zarzadzanie nimi wymaga logowania.',
    joinedDraftLobby: 'Dolaczono do lobby roboczego. Kazde poprzednie czlonkostwo w innym lobby roboczym zostalo usuniete.',
    leftDraftLobby: 'Opuszczono lobby robocze.',
    reopenedResumeLobby: 'Ponownie otwarto zapisana gre multiplayer jako lobby wznowienia.',
    archivedGame: 'Zarchiwizowano gre multiplayer.',
    markedReady: 'Oznaczono jako gotowy.',
    markedNotReady: 'Oznaczono jako niegotowy.',
    lobbySetupSaved: 'Zapisano ustawienia lobby.',
    saveBound: 'Powiazano zapis z lobby roboczym.',
    switchedToNewGame: 'Lobby robocze przelaczono z powrotem na tryb nowej gry.',
    seatAssignmentUpdated: 'Zaktualizowano przypisanie miejsca.',
    leftCurrentGameDefault: 'Opuszczono biezaca gre multiplayer. Mozesz dolaczyc ponownie pozniej.',
    selectedSaveRequired: 'Najpierw wybierz zapis.',
    selectedMembersCountOne: '{{count}} gracz',
    selectedMembersCountMany: '{{count}} graczy',
    humanPlayerAmountDerived: 'Liczba ludzkich graczy wynika z dolaczonych czlonkow lobby: {{count}}.',
    scheduledTurnsDisabled: 'Wylaczone',
    scheduledTurnsPerDayOne: '{{count}} tura dziennie',
    scheduledTurnsPerDayMany: '{{count}} tury dziennie',
    selectedHours: '{{count}} wybranych',
    autoSaveDisabled: 'wylaczony',
    autoSaveEveryTurns: 'co {{turns}} tur'
  },
  errors: {
    createLobbyFailed: 'Nie udalo sie utworzyc lobby multiplayer.',
    runningGameNotJoinable: 'Do tej uruchomionej gry nie mozna obecnie dolaczyc.',
    joinRunningGameFailed: 'Nie udalo sie dolaczyc do uruchomionej gry Zaplanowane Tury.',
    leaveDraftLobbyFailed: 'Nie udalo sie opuscic lobby roboczego.',
    leaveCurrentGameFailed: 'Nie udalo sie opuscic biezacej gry multiplayer.',
    archiveFailed: 'Nie udalo sie zarchiwizowac wybranej gry multiplayer.',
    lobbySetupInvalid: 'Ustawienia lobby sa niepelne lub nieprawidlowe.',
    invalidSeatAssignment: 'Nieprawidlowe przypisanie miejsca.',
    startMultiplayerFailed: 'Nie udalo sie uruchomic gry multiplayer.',
    gameNotEnterable: 'Do tej gry multiplayer nie mozna obecnie wejsc.',
    enterRunningGameInactive: 'Ta gra multiplayer nie jest obecnie aktywna.',
    enterRunningGameFailed: 'Nie udalo sie wejsc do wybranej gry multiplayer.',
    loadBrowserFailed: 'Nie udalo sie wczytac gier multiplayer.',
    loadDetailFailed: 'Nie udalo sie wczytac szczegolow gry multiplayer.',
    loadSavesFailed: 'Nie udalo sie wczytac dostepnych zapisow.',
    actionFailed: 'Akcja multiplayer nie powiodla sie.'
  },
  status: {
    draft: 'Szkic',
    running: 'Uruchomiona',
    archived: 'Zarchiwizowana',
    resumedLobby: 'Lobby wznowienia',
    savedInactive: 'Zapisana / Nieaktywna',
    multiplayer: 'Multiplayer',
    currentTurn: 'Tura {{turn}}',
    modeLoadSave: 'Wczytaj zapisana gre',
    modeNewGame: 'Rozpocznij nowa gre',
    joinedPlayers: 'Dolaczeni gracze: {{count}}',
    scheduledTurnsPerDay: 'Zaplanowane Tury: {{count}} tur(y) dziennie.',
    onlineHumanControlled: 'Online / sterowany przez czlowieka',
    autoSkipTurn: 'Auto skip tury',
    offlineBotControlled: 'Offline, sterowany przez bota ({{profile}})',
    defaultBotProfile: 'Domyslny',
    online: 'Online',
    autoSkip: 'Auto skip',
    offlineBot: 'Bot offline',
    ready: 'Gotowy',
    notReady: 'Niegotowy',
    readyForStart: 'Gotowy do startu',
    waitingForReady: 'Czeka na gotowosc'
  },
  inactiveReasons: {
    noPresentHumans: 'Zatrzymano, poniewaz zaden gracz nie pozostawal obecny.',
    tooFewOnlinePlayers: 'Zatrzymano, poniewaz pozostalo zbyt malo graczy online.'
  },
  hostControls: {
    title: 'Tylko host local-admin moze zarzadzac tym lobby roboczym i uruchomic gre.'
  },
  botPersonalities: {
    assigned: 'Przypisano: {{assigned}} / {{total}}',
    help: 'Wybierz dokladna liczbe kazdej zaimplementowanej osobowosci bota.',
    validation: 'Laczna liczba przypisanych osobowosci botow musi wynosic dokladnie {{required}}. Biezaca suma: {{assigned}}.'
  },
  botDiplomacy: {
    botsUnitedAgainstHumans: 'Boty zjednoczone przeciw ludziom',
    tooltip: 'Po wlaczeniu stale imperia botow zaczynaja jako sojusznicy wobec siebie i w stanie wojny z kazdym ludzkim graczem. Neutralne frakcje zasobow nie sa tym objete. Przydatne w grach PvE lub kooperacyjnych, gdzie boty maja dzialac jako wspolny blok przeciwnikow.'
  },
  scheduledTurns: {
    selectAtLeastOneHour: 'Wybierz co najmniej jedna godzine zaplanowanej tury.',
    mapTooSmall: 'Gry Zaplanowane Tury wymagaja co najmniej galaktyki {{size}}x{{size}}.',
    onlyOneRunningGame: 'Na tym serwerze moze byc aktywna tylko jedna uruchomiona gra Zaplanowane Tury.',
    turnHoursTitle: 'Godziny tur'
  },
  startingHomeworldPreset: {
    help: 'Dotyczy tylko ludzkich i botowych planet macierzystych. Starty neutralnych frakcji pozostaja losowe.',
    presets: {
      Low: {
        label: 'Niski',
        tooltip: 'Preset niski\nBudynki: Magazyn Metalu 1, Magazyn Krysztalu 1, Zbiornik Deuteru 1, Kopalnia Metalu 1, Kopalnia Krysztalu 1, Elektrownia Sloneczna 1, Elektrownia Jadrowa 1, Fabryka Robotow 1.\nTechnologie: brak.\nStatki: brak.\nObrona: brak.'
      },
      Medium: {
        label: 'Sredni',
        tooltip: 'Preset sredni\nBudynki: Magazyn Metalu 1, Magazyn Krysztalu 1, Zbiornik Deuteru 1, Kopalnia Metalu 2, Kopalnia Krysztalu 1, Syntezator Deuteru 1, Elektrownia Sloneczna 2, Elektrownia Jadrowa 2, Fabryka Robotow 2, Stocznia 1, Laboratorium Badawcze 1.\nTechnologie: Technologia Energetyczna 1, Naped Fuzyjny 1, Naped Hiperprzestrzenny 1, Technologia Szpiegowska 1.\nStatki: Sonda Szpiegowska 8, Transportowiec 1.\nObrona: Wyrzutnia SAM 4.'
      },
      High: {
        label: 'Wysoki',
        tooltip: 'Preset wysoki\nBudynki: Magazyn Metalu 2, Magazyn Krysztalu 2, Zbiornik Deuteru 2, Kopalnia Metalu 3, Kopalnia Krysztalu 2, Syntezator Deuteru 1, Elektrownia Sloneczna 2, Elektrownia Jadrowa 2, Reaktor Fuzyjny 1, Fabryka Robotow 3, Stocznia 2, Laboratorium Badawcze 1.\nTechnologie: Technologia Energetyczna 1, Naped Fuzyjny 1, Naped Hiperprzestrzenny 1, Technologia Komputerowa 1, Technologia Szpiegowska 2, Technologia Adaptacyjna 1.\nStatki: Mysliwiec 8, Sonda Szpiegowska 16, Okret Bojowy 1, Transportowiec 1, Kolonizator 1.\nObrona: Wyrzutnia SAM 10.'
      }
    }
  },
  testingOptions: {
    createRandomPlanets: 'Tworz losowe planety',
    createStartingShips: 'Tworz statki startowe',
    skipTutorial: 'Pomin samouczek'
  },
  resources: {
    metal: 'Metal',
    crystal: 'Krysztal',
    deuterium: 'Deuter',
    startingMetal: 'Startowy metal',
    startingCrystal: 'Startowy krysztal',
    startingDeuterium: 'Startowy deuter'
  },
  saveBinding: {
    convertToBot: 'Zamien na bota',
    seatWillBecomeBot: 'To miejsce zostanie zamienione na bota.',
    originalSavedPlayerMatched: 'Dopasowano oryginalnego zapisanego gracza.',
    replacementPlayerAssigned: 'Przypisano gracza zastepczego.'
  },
  callouts: {
    resumedLobbyTitle: 'Lobby wznowienia',
    resumedLobbyBody: 'To lobby wznawia zapisana gre multiplayer. Ustawienia pozostaja zablokowane do stanu zapisanego snapshotu, podczas gdy gracze dolaczaja ponownie, a localAdmin przygotowuje restart.',
    logoutReplacementTitle: 'Zastapienie po wylogowaniu',
    logoutReplacementBody: 'Gracze, ktorzy wlacza zastapienie po wylogowaniu, moga byc tymczasowo sterowani przez bota w uruchomionej grze. Standardowe gry nadal wymagaja ludzi online; gry Zaplanowane Tury postepuja dalej wedlug harmonogramu.',
    resumeLobbyBody: 'To lobby wznowienia jest zablokowane do zapisanego snapshotu multiplayer. Gracze moga tutaj dolaczyc ponownie, w razie potrzeby nadal mozna poprawic przypisania miejsc, a localAdmin moze ponownie uruchomic zapisana gre, gdy wszyscy beda gotowi.'
  },
  startBlockedReasons: {
    atLeastTwoJoinedPlayers: 'Wymaganych jest co najmniej dwoch dolaczonych graczy.',
    scheduledTurnsMaxHumans: 'Gry Zaplanowane Tury moga miec maksymalnie {{count}} ludzkich graczy.',
    standardMaxHumans: 'Standardowe gry multiplayer moga miec maksymalnie {{count}} ludzkich graczy.',
    allNonAdminReady: 'Wszyscy gracze niebedacy adminami musza byc gotowi.',
    bindSaveFirst: 'Najpierw powiaz zapisana gre.',
    everyJoinedPlayerAssigned: 'Kazdy dolaczony gracz musi byc przypisany do zapisanego ludzkiego miejsca albo opuscic lobby.'
  }
} as const;
