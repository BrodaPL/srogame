export const setupPl = {
  eyebrow: 'SroGame Core',
  title: 'Inicjalizacja Galaktyki',
  subtitle: 'Skonfiguruj uklad galaktyki, populacje i zasoby startowe.',
  fields: {
    playerName: 'Nazwa gracza',
    galaxyName: 'Nazwa galaktyki',
    gameType: 'Typ gry',
    galaxyWidth: 'Szerokosc galaktyki',
    galaxyHeight: 'Wysokosc galaktyki',
    galaxyCenterSize: 'Rozmiar centrum galaktyki (%)',
    voidChance: 'Szansa pustki (%)',
    starsAmountModifierMin: 'Minimalny modyfikator liczby gwiazd',
    starsAmountModifierMax: 'Maksymalny modyfikator liczby gwiazd',
    playerAmount: 'Liczba graczy',
    botsAmount: 'Liczba botow',
    botDifficulty: 'Poziom trudnosci botow (%)',
    neutralBotsAmount: 'Liczba neutralnych botow (%)',
    neutralBotsDifficulty: 'Poziom trudnosci neutralnych botow (%)',
    autoSaveTurns: 'Autozapis co N tur',
    playerActionLogging: 'Logowanie akcji gracza',
    startingHomeworldPreset: 'Preset planety startowej',
    testingOptions: 'Opcje testowe',
    startingResources: 'Zasoby startowe',
    botPersonalities: 'Osobowosci botow',
    botDiplomacy: 'Dyplomacja botow'
  },
  placeholders: {
    galaxyName: 'Aetheria'
  },
  gameTypes: {
    PvP: 'PvP',
    PvPvE: 'PvPvE',
    PvE: 'PvE',
    Sandbox: 'Sandbox'
  },
  actions: {
    goToLogin: 'Przejdz do logowania',
    startNewGame: 'Rozpocznij nowa gre',
    starting: 'Uruchamianie...'
  },
  errors: {
    localAdminRequiredServer: 'Do uruchomienia gry jednoosobowej na tym serwerze wymagane sa uprawnienia localAdmin.',
    loginRequired: 'Aby rozpocza gre, musisz sie zalogowac.',
    loginRequiredToStart: 'Aby rozpocza gre, musisz sie zalogowac.',
    localAdminRequiredToStart: 'Do rozpoczecia gry jednoosobowej wymagane sa uprawnienia localAdmin.',
    startFailed: 'Nie udalo sie polaczyc z serwerem gry.'
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
  autoSave: {
    hint: 'Uzyj 0, aby wylaczyc autozapis po zakonczeniu tury.',
    disabled: 'wylaczony',
    everyTurns: 'co {{turns}} tur'
  },
  playerActionLogging: {
    enable: 'Zapisuj udane lokalne akcje gracza na dysku',
    hint: 'Zapisuje akcje budynkow, stoczni, badan i flot do server/data/player-action-logs/.'
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
    deuterium: 'Deuter'
  },
  savedConfig: {
    title: 'Zapisana konfiguracja',
    summary: '{{name}} ({{width}}x{{height}}) z {{players}} graczami i {{bots}} botami. Autozapis: {{autoSave}}. Preset planety startowej: {{preset}}. Zasoby startowe: {{metal}} metalu, {{crystal}} krysztalu, {{deuterium}} deuteru.'
  }
} as const;
