export const generatedPl = {
  shared: {
    noResources: 'brak zasobow',
    resourcesInline: '{{metal}} metalu, {{crystal}} krysztalu, {{deuterium}} deuteru',
    none: 'brak',
  },
  fleet: {
    launchSummary:
      '{{mission}} {{originX}}:{{originY}}:{{originZ}} -> {{targetX}}:{{targetY}}:{{targetZ}} (flota {{fleetId}})',
    titles: {
      arrived: 'Flota dotarla: {{mission}} do {{targetPlanet}}',
      returned: 'Flota wrocila: {{mission}} do {{originPlanet}}',
      failed: 'Flota nie powiodla sie: {{mission}} do {{targetPlanet}}',
      draw: 'Flota remis: {{mission}} przy {{targetPlanet}}',
    },
    returnedBody: 'Flota {{fleetId}} wrocila do {{originPlanet}}.',
    failedBody: '{{reason}}\n\nFlota zawrocila i rozpoczela lot powrotny po niepowodzeniu.',
    manifest: {
      ships: 'Statki floty: {{ships}}',
      cargo: 'Ladunek floty: Metal {{metal}}, Krysztal {{crystal}}, Deuter {{deuterium}}',
    },
    result: {
      missionFailedDefault: 'Misja nie powiodla sie.',
      originOrTargetMissing:
        'Misja nie powiodla sie, poniewaz wlasciciel pochodzenia albo planeta celu juz nie istnialy.',
      fleetDestroyedAt: 'Flota {{mission}} zostala zniszczona przy {{targetPlanet}}.',
      tickResolvedAt: 'Tik misji {{mission}} zostal rozstrzygniety przy {{targetPlanet}}.',
      returnedTo: 'Flota wrocila do {{originPlanet}}.',
    },
  },
  missionReports: {
    attack: {
      failedTargetUnavailable:
        'Misja Attack nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedTargetNotAttackable:
        'Misja Attack nie powiodla sie, poniewaz celu nie mozna juz bylo zaatakowac po przylocie.',
      failedRetreat: 'Misja Attack napotkala wrogi opor i zostala zmuszona do odwrotu.',
    },
    bombard: {
      failedTargetUnavailable:
        'Misja Bombard nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedTargetNotHostile:
        'Misja Bombard nie powiodla sie, poniewaz cel nie byl juz wrogi po przylocie.',
      successHit: 'Misja Bombard uderzyla w {{targetPlanet}} i rozpoczela lot powrotny.',
      failedRetreat: 'Misja Bombard napotkala wrogi opor i zostala zmuszona do odwrotu.',
    },
    colonize: {
      failedTargetUnavailable:
        'Misja Colonize nie powiodla sie, poniewaz cel nie byl juz dostepny.',
      failedTargetOccupied:
        'Misja Colonize nie powiodla sie, poniewaz cel zostal zajety przed przylotem.',
      successEstablished: 'Misja Colonize zalozyla nowa kolonie na {{targetPlanet}}.',
    },
    defend: {
      successOrbit: 'Misja Guard weszla na orbite nad {{targetPlanet}}.',
      failedTargetHostile:
        'Misja Guard nie powiodla sie, poniewaz miejsce docelowe stalo sie wrogie przed przylotem.',
      failedRetreat: 'Misja Guard napotkala wrogie statki i zostala zmuszona do odwrotu po bitwie.',
    },
    move: {
      successCompleted: 'Misja {{mission}} zostala pomyslnie zakonczona przy {{targetPlanet}}.',
      successFriendlyOrbit: 'Misja Move weszla na przyjazna orbite nad {{targetPlanet}}.',
      failedTargetOwned:
        'Misja Move nie powiodla sie, poniewaz miejsce docelowe zostalo zajete przez innego gracza przed przylotem.',
      failedRetreat: 'Misja Move napotkala wrogie statki i zostala zmuszona do odwrotu po bitwie.',
    },
    recycle: {
      failedTargetUnavailable: 'Misja Recycle nie powiodla sie, poniewaz cel nie byl juz dostepny.',
      failedNoEquipment:
        'Misja Recycle nie moze juz dzialac, poniewaz nie przetrwal zaden sprzet recyklingowy.',
      successCargoFull:
        'Misja Recycle zapelnila ladownie nad {{targetPlanet}} i rozpoczela lot powrotny.',
      successDebrisCleared:
        'Misja Recycle oczyscila pole szczatkow nad {{targetPlanet}} i rozpoczela lot powrotny.',
      successDebrisExhausted:
        'Misja Recycle wyczerpala pole szczatkow nad {{targetPlanet}} i rozpoczela lot powrotny.',
      failedTargetUnavailableArrival:
        'Misja Recycle nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedNoEquipmentArrival:
        'Misja Recycle nie powiodla sie, poniewaz sprzet recyklingowy nie przetrwal podejscia.',
      successNoDebris:
        'Misja Recycle nie znalazla szczatkow nad {{targetPlanet}} i rozpoczela lot powrotny.',
      successSalvageOrbit: 'Misja Recycle ustanowila orbite odzysku nad {{targetPlanet}}.',
      failedRetreat: 'Misja Recycle napotkala wrogi opor i zostala zmuszona do odwrotu.',
    },
    repair: {
      failedTargetUnavailable:
        'Misja Repair nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedTargetHostile: 'Misja Repair nie powiodla sie, poniewaz cel byl wrogi po przylocie.',
      successOrbit: 'Misja Repair ustanowila orbite nad {{targetPlanet}}.',
    },
    siege: {
      failedTargetUnavailable:
        'Misja Siege nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedTargetNotHostile:
        'Misja Siege nie powiodla sie, poniewaz cel nie byl juz wrogi po przylocie.',
      successOrbit: 'Misja Siege ustanowila orbite nad {{targetPlanet}}.',
      failedRetreat: 'Misja Siege napotkala wrogi opor i zostala zmuszona do odwrotu.',
    },
    spy: {
      launchedFromOrigin: 'Misja Spy wystartowala z {{origin}}.',
      solarSystemLaunched: 'Szpiegowanie ukladu zostalo uruchomione dla {{coordinates}}.',
    },
    transport: {
      failedRetreat:
        'Misja Transport napotkala wrogie statki, zachowala niedostarczony ladunek i zostala zmuszona do odwrotu po bitwie.',
      failedTargetUnavailable:
        'Misja Transport nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedTargetNotFriendly:
        'Misja Transport nie powiodla sie, poniewaz cel nie byl juz przyjazny po przylocie.',
      successCompleted: 'Misja {{mission}} zostala pomyslnie zakonczona przy {{targetPlanet}}.',
    },
    armamentDelivery: {
      failedRetreat:
        'Misja Armament Delivery napotkala wrogie statki, zachowala niedostarczony ladunek i uzbrojenie oraz zostala zmuszona do odwrotu po bitwie.',
      failedTargetUnavailable:
        'Misja Armament Delivery nie powiodla sie, poniewaz cel nie byl juz dostepny po przylocie.',
      failedTargetInvalid:
        'Misja Armament Delivery nie powiodla sie, poniewaz cel nie byl juz prawidlowy po przylocie.',
      successDelivered: 'Misja {{mission}} dostarczyla zasoby i uzbrojenie do {{targetPlanet}}.',
    },
  },
  reports: {
    researchCompletedTitle: 'Badania zakonczone: {{technology}} L{{level}}',
    researchCompletedBody: '{{technology}} osiagnela poziom {{level}} na {{planet}}.',
    plunderTitle: 'Raport grabiezy: {{targetPlanet}}',
    incomingAttackTitle: 'Raport nadchodzacego ataku: {{targetPlanet}}',
    bombardmentTitle: 'Raport bombardowania: {{mission}} przy {{targetPlanet}}',
    incomingBombardmentTitle:
      'Raport nadchodzacego bombardowania: {{mission}} przy {{targetPlanet}}',
    sharedBombardmentTitle: 'Wspoldzielony raport bombardowania: {{mission}} przy {{targetPlanet}}',
    repairTitle: 'Raport napraw: {{targetPlanet}} ustabilizowana',
    body: {
      attackOutcomeSummary:
        'Atak zostal rozstrzygniety przy {{targetPlanet}}.{{battleFragment}}{{plunderFragment}}',
      battleWinnerFragment: ' Zwyciezca bitwy: {{winner}}.',
      stolenResourcesFragment: ' Zrabowano {{resources}}.',
      noResourcesStolenFragment: ' Nie zrabowano zadnych zasobow.',
      attackResolvedAt: 'Atak zostal rozstrzygniety przy {{targetPlanet}}.',
      battleWinner: 'Zwyciezca bitwy: {{winner}}.',
      stolenResources: 'Zrabowano {{resources}}.',
      noResourcesStolen: 'Nie zrabowano zadnych zasobow.',
      attackReachedTarget: 'Misja Attack dotarla do {{targetPlanet}}.',
      plunderSummary: 'Podsumowanie grabiezy:',
      enemyPlunderSummary: 'Podsumowanie grabiezy wroga:',
      basePlunder: 'Bazowa grabiez: {{percent}}%',
      bunkerReduction: 'Redukcja bunkra: {{percent}}%',
      effectivePlunder: 'Efektywna grabiez: {{percent}}%',
      freeCargoBeforeLooting: 'Wolna ladownosc przed grabieza: {{value}}',
      fleetCargoAfterLooting: 'Ladownosc floty po grabiezy: {{current}}/{{total}}',
      attackingFleetCargoAfterLooting:
        'Ladownosc atakujacej floty po grabiezy: {{current}}/{{total}}',
      noStealableResources: 'Na celu nie pozostaly zadne zasoby do kradziezy.',
      noFreeCargoNoStolen:
        'Nie pozostalo wolne miejsce w ladowni, wiec nie skradziono zadnych zasobow.',
      attackerNoFreeCargoNoStolen:
        'Atakujaca flota nie miala wolnej ladownosci, wiec nie skradziono zadnych zasobow.',
      lootAttemptFailed: 'Proba grabiezy nie przyniosla zadnych zasobow.',
      attackerFailedSecureResources: 'Atakujaca flota nie zdolala zdobyc zadnych zasobow.',
      resourcesStolenLine: 'Skradzione zasoby: {{resources}}.',
      resourcesLostLine: 'Utracone zasoby: {{resources}}.',
      resourcesLostNone: 'Utracone zasoby: brak.',
      target: 'Cel: {{targetPlanet}}',
      bombardmentMission: 'Misja bombardowania: {{mission}}',
      hostileFleetOwner: 'Wlasciciel wrogiej floty: {{owner}}',
      shots: 'Strzaly: {{value}}',
      hits: 'Trafienia: {{value}}',
      totalStructuralDamage: 'Laczne uszkodzenia strukturalne: {{value}}',
      bombsLaunched: 'Wystrzelone bomby planetarne: {{value}}',
      bombsActivated: 'Aktywowane bomby planetarne: {{value}}',
      bombsIntercepted: 'Przechwycone bomby planetarne: {{value}}',
      bombsLost: 'Utracone bomby planetarne: {{value}}',
      priorities:
        'Priorytety: Glowny {{main}}, Drugorzedny {{secondary}}, Trzeciorzedny {{tertiary}}',
      prioritiesRandom: 'Priorytety: losowe',
      buildingsEngaged: 'Zaangazowane budynki: {{value}}',
      defencesEngaged: 'Zaangazowana obrona: {{value}}',
      buildingDamageSummary: 'Podsumowanie uszkodzen budynkow:',
      noBuildingDamage: 'Nie odnotowano trwalych uszkodzen budynkow.',
      defenceDamageSummary: 'Podsumowanie uszkodzen obrony:',
      noDefenceDamage: 'Nie odnotowano trwalych uszkodzen obrony.',
      buildingDamageEntry:
        '{{type}}: trafienia {{hits}}, uszkodzenia {{damage}}{{zeroSuffix}}{{floorSuffix}}',
      buildingZeroSuffix: ', zredukowano do 0 SP x{{count}}',
      buildingFloorSuffix: ', aktywne minimum bunkra przy {{percent}}%',
      defenceDamageEntry: '{{type}}: trafienia {{hits}}, uszkodzenia {{damage}}{{destroyedSuffix}}',
      defenceDestroyedSuffix: ', zniszczono x{{count}}',
      planetAttackedStolen: 'Twoja planeta zostala zaatakowana i skradziono z niej zasoby.',
      planetAttackedNoStolen:
        'Twoja planeta zostala zaatakowana, ale nie skradziono z niej zadnych zasobow.',
      hostileBombardmentPressure: 'Twoja planeta byla poddana wrogiemu naciskowi bombardowania.',
      repairMissionCompletedAt: 'Misja Repair zostala zakonczona przy {{targetPlanet}}.',
      repairNothingLeft:
        'Na celu nie pozostaly zadne niewrogie uszkodzone statki, budynki ani obrona.',
      fleetReturningToOrigin: 'Flota {{fleetId}} wraca do {{originPlanet}}.',
      currentDebrisField:
        'Aktualne pole szczatkow: Metal {{metal}}, Krysztal {{crystal}}, Deuter {{deuterium}}',
      missionResolvedAt: 'Misja {{mission}} zostala rozstrzygnieta przy {{targetPlanet}}.',
    },
  },
  systemMail: {
    hostileAttackTitle: 'Alarm ataku: {{attacker}} zaatakowal {{targetPlanet}}',
    hostileAttackStolen: '{{attacker}} zaatakowal {{targetPlanet}} i zrabowal {{resources}}.',
    hostileAttackNoStolen:
      '{{attacker}} zaatakowal {{targetPlanet}}, ale nie zrabowal zadnych zasobow.',
    hostileAttackFleet: '{{attacker}} zaatakowal {{targetPlanet}} wroga flota.',
    sharedAttackTitle:
      'Wspoldzielony alarm ataku: {{attacker}} zaatakowal {{victim}} przy {{targetPlanet}}',
    sharedAttackBody: '{{attacker}} zaatakowal planete {{targetPlanet}} nalezaca do {{victim}}.',
    hostileBombardmentTitle: 'Alarm {{mission}}: {{attacker}} wybral cel {{targetPlanet}}',
    hostileBombardmentBody:
      '{{attacker}} uzyl misji {{missionUpper}} na {{targetPlanet}}, powodujac {{damage}} uszkodzen strukturalnych.',
    sharedBombardmentTitle: 'Wspoldzielony alarm {{mission}}: {{attacker}} wybral cel {{victim}}',
    sharedBombardmentBody:
      '{{attacker}} uzyl misji {{missionUpper}} na planecie {{targetPlanet}} nalezacej do {{victim}}.',
    espionageTitle: 'Alarm szpiegowski: {{attacker}} szpiegowal {{targetPlanet}}',
    espionageBody: '{{attacker}} wyslal {{probeCount}} sond {{probeWord}} do {{targetPlanet}}.',
    spyProbeSingular: 'szpiegowska',
    spyProbePlural: 'szpiegowskie',
  },
  spyDialog: {
    solarSystem: {
      ariaLabel: 'Szpieguj uklad {{name}}',
      eyebrow: 'Szpieg',
      title: 'Szpiegowanie ukladu',
      subtitle: 'Uklad: {{name}} ({{coordinates}})',
      activeFleets: 'Aktywne floty {{value}}',
      close: 'Zamknij',
      unavailable: 'Szpiegowanie ukladu jest niedostepne',
      loadingOrigins: 'Wczytywanie dostepnych zrodel sond.',
      targets: 'Cele',
      requiredProbes: 'Wymagane sondy',
      requiredFleetSlots: 'Wymagane sloty floty',
      freeFleetSlots: 'Wolne sloty floty',
      targetsList: 'Cele: {{value}}',
      noTargets: 'W tym ukladzie nie ma zadnych niewlasnych, nieasteroidalnych planet.',
      noOrigins:
        'Nie ma zadnych wlasnych planet ani flot na orbicie z co najmniej {{count}} sondami szpiegowskimi.',
      missionOrigin: 'Pochodzenie misji',
      originMeta:
        'Laczny dystans: {{totalDistance}} | Maksymalny dystans: {{maxDistance}}{{damaged}}',
      damagedSuffix: ' | Uszkodzone: {{count}}',
      cancel: 'Anuluj',
      launching: 'Uruchamianie...',
      launch: 'Uruchom',
      noSession: 'Nie znaleziono sesji gracza.',
      launchFailed: 'Nie udalo sie uruchomic szpiegowania ukladu.',
      starSystemUnavailable: 'Uklad jest niedostepny.',
      loadOriginsFailed: 'Nie udalo sie wczytac zrodel szpiegowania ukladu.',
      fleetSlotsBlocked:
        'Szpiegowanie ukladu wymaga {{required}} wolnych slotow floty, ale dostepne sa tylko {{available}}.',
      probeLabelOne: '{{count}} sonda',
      probeLabelMany: '{{count}} sond',
      probeLabelDamaged: '{{count}} sond (uszkodzone: {{damaged}})',
      fleetOriginLabel:
        'Flota #{{fleetId}} na orbicie {{targetPlanet}} ({{coordinates}}) | {{probeLabel}}',
      planetOriginLabel: '{{planet}} ({{coordinates}}) | {{probeLabel}}',
    },
    launch: {
      ariaLabel: 'Szpieguj {{name}}',
      eyebrow: 'Szpieg',
      title: 'Wystrzel sondy szpiegowskie',
      subtitle: 'Cel: {{name}} ({{coordinates}})',
      activeFleets: 'Aktywne floty {{value}}',
      close: 'Zamknij',
      unavailable: 'Misja szpiegowska niedostepna',
      loadingOrigins: 'Wczytywanie dostepnych zrodel sond.',
      noOrigins: 'Nie ma dostepnych wlasnych planet ani flot na orbicie z sondami szpiegowskimi.',
      missionOrigin: 'Pochodzenie misji',
      originMeta: 'Dystans: {{distance}} | Dostepne: {{available}}{{damaged}}',
      damagedSuffix: ' | Uszkodzone: {{count}}',
      probeAmount: 'Liczba sond',
      maxFromOrigin: 'Maksimum z wybranego pochodzenia: {{count}}',
      cancel: 'Anuluj',
      launching: 'Wystrzeliwanie...',
      launch: 'Wystrzel',
      noSession: 'Nie znaleziono sesji gracza.',
      launchFailed: 'Nie udalo sie wystrzelic misji szpiegowskiej.',
      targetUnavailable: 'Planeta celu jest niedostepna.',
      loadOriginsFailed: 'Nie udalo sie wczytac zrodel startu szpiegowania.',
      probeLabelOne: '{{count}} sonda',
      probeLabelMany: '{{count}} sond',
      probeLabelDamaged: '{{count}} sond (uszkodzone: {{damaged}})',
      fleetOriginLabel:
        'Flota #{{fleetId}} na orbicie {{targetPlanet}} ({{coordinates}}) | {{probeLabel}}',
      planetOriginLabel: '{{planet}} ({{coordinates}}) | {{probeLabel}}',
    },
  },
  miniPlanet: {
    unknownPlanet: 'Nieznana planeta',
    imageAlt: 'Obraz planety {{name}}',
    ownedBy: 'Wlasciciel: {{owner}}',
    ownerNoData: 'BRAK DANYCH',
    ownerYou: 'TY',
    ownerUnknown: 'NIEZNANY',
    ownerNeutral: 'NEUTRALNY',
    ownerFree: 'WOLNA',
    actions: {
      setOrigin: 'Ustaw pochodzenie',
      setTarget: 'Ustaw cel',
      copyCoordinates: 'Kopiuj wspolrzedne',
      viewPlanet: 'Zobacz planete',
      missionOrigin: 'Misja: pochodzenie',
      missionTarget: 'Misja: cel',
      spy: 'Szpieguj',
      sensorScan: 'Skan sensorow',
    },
    tooltips: {
      copyCoordinates: 'Kopiuj: {{coordinates}}',
      openPlanetView: 'Otworz widok danych planety',
      planetIntelUnavailable: 'Dane planety sa niedostepne',
      openMissionOrigin: 'Otworz Planer Misji z pochodzeniem {{coordinates}}',
      missionOriginUnavailable: 'Tylko wlasne planety moga byc tutaj uzyte jako pochodzenie misji',
      openMissionTarget: 'Otworz Planer Misji z celem {{coordinates}}',
      openSpy: 'Wystrzel sondy szpiegowskie na {{coordinates}}',
      openSensorScan: 'Otworz skan Sensor Phalanx dla {{coordinates}}',
    },
    tags: {
      basicInfo: 'Podstawowe informacje',
      planetParameters: 'Parametry planety',
      resources: 'Zasoby',
      debris: 'Szczatki',
      buildings: 'Budynki',
      technology: 'Technologia',
      defences: 'Obrona',
      ships: 'Statki',
      queues: 'Kolejki',
    },
    rows: {
      name: 'Nazwa',
      order: 'Pozycja',
      type: 'Typ',
      size: 'Rozmiar',
      colonizationDifficulty: 'Trudnosc kolonizacji',
      metal: 'Metal',
      crystal: 'Krysztal',
      deuterium: 'Deuterium',
      energyRes: 'Energia (RES)',
      energyNuclear: 'Energia (Nuclear)',
      science: 'Nauka',
      industry: 'Przemysl',
      anomaliesAndNoise: 'Anomalie/Szum',
      hyperspace: 'Nadprzestrzen',
      averageTotalResources: 'Srednie laczne zasoby',
      averageBuildingLevel: 'Sredni poziom budynkow',
      averageTechnologyLevel: 'Sredni poziom technologii',
      totalDefences: 'Laczna obrona',
      defenceEntries: 'Wpisy obrony',
      totalShips: 'Lacznie statkow',
      shipEntries: 'Wpisy statkow',
      shipyard: 'Stocznia',
      defencesQueue: 'Obrona',
      research: 'Badania',
      buildingsQueue: 'Budynki',
      empty: 'Pusta',
    },
  },
} as const;
