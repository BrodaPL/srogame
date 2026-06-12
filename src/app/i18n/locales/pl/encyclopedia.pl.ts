export const encyclopediaPl = {
  menu: {
    eyebrow: 'Encyklopedia',
    title: 'Encyklopedia',
    subtitle: 'Przewodniki referencyjne o statkach, obronie, budynkach, technologiach i mechanikach obejmujace misje, dyplomacje, samouczki, skanowanie i zasady tur.',
    actions: {
      ships: 'Statki',
      defences: 'Obrona',
      buildings: 'Budynki',
      technologies: 'Technologie',
      mechanics: 'Mechaniki',
      backToMainMenu: 'Powrot do menu glownego'
    }
  },
  shared: {
    eyebrow: 'Encyklopedia',
    actions: {
      backToEncyclopedia: 'Powrot do encyklopedii',
      close: 'Zamknij'
    },
    dialog: {
      ariaLabel: 'Podglad obrazu {{title}}',
      imageAlt: 'Obraz {{title}}',
      loadingRaw: 'Wczytywanie surowego obrazu...',
      rawLoadFailed: 'Nie udalo sie wczytac surowego obrazu. Wyswietlany jest zoptymalizowany podglad.',
      showingRaw: 'Wyswietlany jest surowy obraz.'
    },
    tooltips: {
      openLargeImage: 'Otworz duzy obraz dla {{title}}'
    },
    counts: {
      shipsOne: 'Zarchiwizowano {{count}} statek',
      shipsMany: 'Zarchiwizowano {{count}} statkow',
      defencesOne: 'Zarchiwizowano {{count}} jednostke obrony',
      defencesMany: 'Zarchiwizowano {{count}} jednostek obrony',
      buildingsOne: 'Zarchiwizowano {{count}} budynek',
      buildingsMany: 'Zarchiwizowano {{count}} budynkow',
      technologiesOne: 'Zarchiwizowano {{count}} technologie',
      technologiesMany: 'Zarchiwizowano {{count}} technologii',
      topicsShown: 'Pokazano {{shown}} / {{total}} tematow'
    },
    stats: {
      size: 'Rozmiar',
      evasion: 'Unik',
      hull: 'Kadlub',
      critical: 'Krytyczny',
      shield: 'Tarcza',
      armor: 'Pancerz',
      cargo: 'Ladownia',
      hangar: 'Hangar',
      jumpCost: 'Koszt skoku',
      jump: 'Skok',
      level: 'Poziom',
      power: 'Energia',
      damageMultiplier: 'Mnoznik obrazen',
      research: 'Badania',
      orbitFire: 'Ostrzal orbity'
    },
    sections: {
      weapons: 'Bronie',
      requirements: 'Wymagania',
      buildings: 'Budynki',
      technologies: 'Technologie',
      cost: 'Koszt',
      output: 'Wynik',
      howItWorks: 'Jak to dziala',
      formulas: 'Wzory',
      notes: 'Uwagi'
    },
    labels: {
      yes: 'Tak',
      no: 'Nie',
      noInactive: 'Nie (nieaktywne)',
      level: 'Poziom {{level}}',
      baseValue: 'Wartosc bazowa: {{value}}'
    },
    empty: {
      unarmed: 'Nieuzbrojone',
      noBuildingRequirements: 'Brak wymagan budynkow',
      noTechRequirements: 'Brak wymagan technologii',
      noHyperJumpAbility: 'Brak zdolnosci hiperskoku',
      noOutputValue: 'Brak wartosci wyjsciowej',
      noMatchingMechanics: 'Zadna mechanika nie pasuje do wybranych filtrow.'
    },
    resources: {
      metal: 'Metal',
      crystal: 'Krysztal',
      deuterium: 'Deuter'
    }
  },
  ships: {
    title: 'Statki',
    subtitle: 'Szczegolowe dane kadlubow pochodzace z blueprintow statkow.'
  },
  defences: {
    title: 'Obrona',
    subtitle: 'Planetarne instalacje obronne, zasady celowania i wymagania budowy.',
    descriptions: {
      planetaryBomb: 'Przechowywane w Skladzie Bomb i przewozone przez floty w misjach Bombardowania, Oblezenia oraz Dostawy Uzbrojenia.',
      orbitCapable: 'Moze atakowac statki na orbicie.',
      atmosphereOnly: 'Moze atakowac tylko male statki bombardujace wchodzace w atmosfere.'
    }
  },
  buildings: {
    title: 'Budynki',
    subtitle: 'Podstawowa infrastruktura planetarna i wyspecjalizowane obiekty.',
    structureNote: 'Punkty strukturalne uzywaja kosztu biezacego poziomu, a integralnosc zmniejsza teraz rzeczywista skutecznosc budynku.'
  },
  technologies: {
    title: 'Technologie',
    subtitle: 'Sciezki badan, napedy i nauka walki.'
  },
  mechanics: {
    title: 'Mechaniki',
    subtitle: 'Podrecznik aktualnych systemow rozgrywki. Statusy, wzory i ograniczenia sa tutaj zgodne z aktywnym kodem klienta i serwera.',
    overview: {
      live: 'Aktywne',
      partial: 'Czesciowe',
      planned: 'Planowane',
      notPlanned: 'Nieplanowane'
    },
    filters: {
      status: 'Filtr statusu',
      category: 'Filtr kategorii',
      all: 'Wszystkie'
    },
    statuses: {
      Live: 'Aktywne',
      Partial: 'Czesciowe',
      Planned: 'Planowane',
      'Not Planned': 'Nieplanowane'
    },
    categories: {
      Economy: 'Ekonomia',
      Queues: 'Kolejki',
      Research: 'Badania',
      Planets: 'Planety',
      Galaxy: 'Galaktyka',
      Intel: 'Wywiad',
      'Core Loop': 'Petla gry'
    }
  }
} as const;
