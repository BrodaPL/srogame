export const imperiumPl = {
  loading: {
    title: 'Wczytywanie imperium',
    body: 'Planety i statystyki imperium sa agregowane.'
  },
  unavailable: {
    title: 'Imperium niedostepne'
  },
  summary: {
    viewName: 'Podsumowanie imperium: {{playerName}}',
    title: 'Suma imperium',
    subtitle: 'Najwazniejsze liczby dla planet, statkow i aktywnych kolejek.',
    ownedPlanets: 'Posiadane planety',
    totalShips: 'Lacznie statkow',
    buildingQueuesActive: 'Aktywne kolejki budynkow',
    shipyardQueuesActive: 'Aktywne kolejki stoczni',
    researchRolesActive: 'Aktywne role badawcze'
  },
  attention: {
    title: 'Wymaga uwagi',
    subtitle: 'Planety bez pracy, z brakiem energii albo obnizona moca.',
    none: 'Brak ostrzezen w tej chwili.',
    labels: {
      energyDeficit: 'Brak energii',
      energyReduction: 'Obnizenie energii',
      idleBuildingQueue: 'Pusta kolejka budynkow',
      idleShipyardQueue: 'Pusta kolejka stoczni',
      idleResearchRole: 'Brak aktywnej roli badawczej',
      limitedIndustryPower: 'Obnizona moc przemyslu',
      limitedShipyardPower: 'Obnizona moc stoczni',
      limitedResearchPower: 'Obnizona moc badan',
      damagedShipsPresent: 'Uszkodzone statki',
      damagedShipsNoRepair: 'Uszkodzone statki bez naprawy',
      damagedBuildingsPresent: 'Uszkodzone budynki',
      damagedBuildingsNoRepair: 'Uszkodzone budynki bez naprawy',
      damagedDefencesPresent: 'Uszkodzona obrona',
      damagedDefencesNoRepair: 'Uszkodzona obrona bez naprawy',
      damagedGroundNoRepair: 'Uszkodzone struktury bez naprawy'
    },
    descriptions: {
      energyDeficit: 'Zuzycie energii przekracza dostepna produkcje.',
      energyReduction: 'Co najmniej jeden budynek dziala ponizej maksymalnego poboru mocy.',
      idleBuildingQueue: 'Brak aktualnie zaplanowanej budowy.',
      idleShipyardQueue: 'Brak statkow w kolejce produkcji.',
      idleResearchRole: 'Planeta nie prowadzi badan ani nie pomaga innemu laboratorium.',
      limitedIndustryPower: 'Alokacja mocy Robotyki lub Nanitow jest ponizej wybranego maksimum.',
      limitedShipyardPower: 'Alokacja mocy Stoczni lub Nanitow jest ponizej wybranego maksimum.',
      limitedResearchPower: 'Alokacja mocy Laboratorium badawczego jest ponizej wybranego maksimum.',
      damagedShipsPresent: 'Stacjonujace albo bezczynne floty orbitalne nad tymi planetami maja uszkodzenia kadluba.',
      damagedShipsNoRepair: 'Sa uszkodzone statki, ale ta lokalizacja nie ma obecnie zdolnosci naprawy.',
      damagedBuildingsPresent: 'Infrastruktura planety jest uszkodzona i dziala ponizej pelnej wydajnosci.',
      damagedDefencesPresent: 'Obrona planetarna przetrwala walke, ale nadal wymaga napraw.',
      damagedGroundNoRepair: 'Budynki albo obrona sa uszkodzone, ale lokalizacja nie ma skutecznej naprawy przemyslowej ani dronow.'
    }
  },
  planets: {
    title: 'Posiadane planety',
    subtitle: 'Kompaktowe karty planet z kolejkami i lokalna produkcja.',
    sort: 'Sortuj',
    filter: 'Filtr',
    noMatches: 'Zadna planeta nie pasuje do aktualnego filtra.',
    sortOptions: {
      coordinates: 'Wspolrzedne',
      name: 'Nazwa',
      metalIncome: 'Przychod metalu',
      totalIncome: 'Laczny przychod',
      industryPower: 'Moc przemyslu'
    },
    filterOptions: {
      all: 'Wszystkie planety',
      attention: 'Wymaga uwagi',
      activeQueues: 'Aktywne kolejki',
      idleQueues: 'Puste kolejki'
    },
    stats: {
      metal: 'M',
      crystal: 'K',
      deuterium: 'D',
      energy: 'E',
      industry: 'P',
      drone: 'D',
      shipyard: 'S',
      research: 'B',
      shipRepair: 'Nap. statkow',
      industryRepair: 'Nap. przem.',
      droneRepair: 'Nap. dronow'
    },
    queues: {
      buildings: 'Budynki',
      shipyard: 'Stocznia',
      research: 'Badania',
      idle: 'Bezczynne'
    },
    actions: {
      title: 'Akcja planety',
      abandon: 'Porzuc planete',
      abandoning: 'Porzucanie...',
      keep: 'Zachowaj planete',
      confirm: 'Potwierdz: utrac planete, anuluj kolejki, zostaw zasoby'
    },
    abandon: {
      tooltip: 'Zmien te planete w pasywny neutralny swiat.',
      blocked: 'Nie mozna porzucic ostatniej posiadanej planety.',
      hint: 'Kolejki i badania zostana anulowane. Zasoby, statki i obrona pozostana na miejscu.',
      confirmBody: 'Ta planeta opusci twoje imperium, dostanie nowego neutralnego wlasciciela i stanie sie wobec ciebie PASYWNA.',
      confirmIntel: 'Aktywne floty pozostana przy obecnych wlascicielach. Zachowasz dane wywiadowcze i mozesz pozniej skolonizowac ten swiat Kolonizatorem.'
    }
  },
  fleetTotals: {
    title: 'Suma flot',
    subtitle: 'Laczna liczba posiadanych statkow wedlug typu na wszystkich planetach.'
  },
  buildingStats: {
    title: 'Statystyki budynkow',
    subtitle: 'Srednie, minimalne i maksymalne poziomy wszystkich typow budynkow, wlacznie z zerami.',
    building: 'Budynek',
    average: 'Srednio',
    min: 'Min',
    max: 'Maks'
  },
  errors: {
    noSession: 'Nie znaleziono sesji gracza.',
    load: 'Nie udalo sie wczytac posiadanych planet.',
    abandon: 'Nie udalo sie porzucic planety.'
  },
  energyTooltip: 'Srednia kara energii: {{penalty}}%.'
} as const;
