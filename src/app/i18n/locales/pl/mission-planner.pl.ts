export const missionPlannerPl = {
  loading: {
    title: 'Wczytywanie planera misji',
    body: 'Trwa wczytywanie wlasnych planet.',
  },
  status: {
    unavailable: 'Planer misji niedostepny',
  },
  sections: {
    missionType: 'Typ misji',
    target: 'Cel',
    missionDetails: 'Szczegoly misji',
    bombardPriorities: 'Priorytety bombardowania',
    travelSummary: 'Podsumowanie lotu',
    launchSummary: 'Podsumowanie startu',
    requirementsWarnings: 'Wymagania i ostrzezenia',
    fleetComposition: 'Sklad floty',
    bombLoadout: 'Ladunek bomb',
    origin: 'Pochodzenie',
    remoteOrigins: 'Zdalne pochodzenia',
  },
  target: {
    microcopy: 'Wklej wspolrzedne jak {{example}} albo uzyj listy planet.',
    placeholder: 'x:y:z',
    resolve: 'Rozpoznaj',
    noneResolved: 'Nie rozpoznano jeszcze planety celu.',
  },
  details: {
    originMicrocopy:
      'Pochodzeniem moga byc wlasne planety albo floty na orbicie z paliwem w ladowni.',
    origin: 'Pochodzenie',
    activeFleets: 'Aktywne floty',
    shipRepairCapability: 'Naprawa statkow',
    droneRepairCapability: 'Naprawa dronami',
    cargoDisabled: 'Ladunek jest wylaczony dla tej misji.',
    carriedBombs: 'Przenoszone bomby',
    bomberHangars: 'Hangary bombowcow',
    speedSelectorLater: 'Wybornik predkosci (pozniej)',
    fleetTemplateLater: 'Zapisz jako szablon floty (pozniej)',
  },
  resources: {
    metal: 'Metal',
    crystal: 'Krysztal',
    deuterium: 'Deuter',
  },
  jumpGate: {
    title: 'Jump Gate',
    use: 'Uzyj Jump Gate',
    hintUnsupported: 'Jump Gate jest dostepny tylko dla Move, Guard, Transport i Repair.',
    hintSelectTarget: 'Wybierz planete celu, aby sprawdzic dostepnosc Jump Gate.',
    hintRemoteOrigin: 'Starty ze zdalnego pochodzenia nie moga jeszcze uzywac Jump Gate.',
    hintNoTargetGate: 'Planeta celu nie ma znanego Jump Gate.',
    hintSelectOrigin: 'Wybierz planete pochodzenia, aby uzyc lotu Jump Gate.',
    hintNoOriginGate: 'Planeta pochodzenia nie ma Jump Gate.',
    hintForeignApproval:
      'Cele nalezace do obcych wymagaja zgody, chyba ze dyplomacja zatwierdza je automatycznie.',
    hintReady: 'Lot Jump Gate trwa 1 ture. Pojemnosc jest sprawdzana po obu stronach.',
    warningOriginCapacity:
      'Pojemnosc Jump Gate na pochodzeniu to {{capacity}}, ale wybrano {{selected}} statkow zdolnych do skoku.',
    warningTargetCapacity:
      'Pojemnosc Jump Gate na celu to {{capacity}}, ale wybrano {{selected}} statkow zdolnych do skoku.',
    warningKnownTargetCapacity:
      'Znana pojemnosc Jump Gate na celu wynosi maksymalnie {{capacity}}, ale wybrano {{selected}} statkow zdolnych do skoku.',
    warningForeignRecheck:
      'Zgoda obcego Jump Gate i rzeczywista pojemnosc sa ponownie sprawdzane na serwerze.',
  },
  bombardment: {
    body: 'Puste priorytety zachowuja obecne losowe celowanie. Uzyte opcje sa wylaczone w pozostalych listach.',
    main: 'Glowny',
    secondary: 'Drugorzedny',
    tertiary: 'Trzeciorzedny',
    random: 'Losowy',
    groups: {
      categories: 'Kategorie',
      resourceBuildings: 'Budynki surowcowe',
      facilities: 'Infrastruktura',
    },
  },
  travel: {
    distance: 'Dystans',
    eta: 'ETA',
    returnEta: 'Powrot ETA',
    fuelReserve: 'Rezerwa paliwa',
    cargoUsed: 'Zuzyty ladunek',
    cargoFree: 'Wolny ladunek',
    hangarUsed: 'Zuzyty hangar',
    hangarTotal: 'Calkowity hangar',
    bomberHangars: 'Hangary bombowcow',
    formulaJumpGate: 'Nadpisanie Jump Gate: czas lotu jest staly i wynosi 1 ture.',
    formulaEta:
      'Wzor ETA: ceil((4 / (1 + Fusion Drive / 3) + distance / (1 + Hyperspace Drive / 6) - Graviton Technology) * modyfikator statku)',
    formulaDriveIgnored: 'Technologie napedu nie zmieniaja czasu lotu Jump Gate.',
    formulaCurrent:
      'Obecnie: ceil(({{startup}} + {{distance}} - {{graviton}}) * {{multiplier}}) = {{turns}} tur',
    techSummary:
      'Poziomy technologii: Fusion Drive {{fusion}} | Hyperspace Drive {{hyperspaceDrive}} | Graviton Technology {{graviton}}',
    shipModifierNeutral: 'Modyfikator predkosci floty: 0% (bazowo duzy kadlub).',
    shipModifier:
      'Modyfikator predkosci floty: najwolniejszy wybrany statek daje {{modifier}} do calego ETA.',
  },
  launch: {
    summary:
      'Misja: {{mission}} | Statki: {{ships}} | Ladunek: {{cargo}} | Rezerwa paliwa: {{fuel}}',
    route: 'Z {{origin}} do {{target}} ({{coordinates}})',
    launch: 'Wystrzel misje',
    launching: 'Wystrzeliwanie...',
  },
  warnings: {
    bomberHangar: 'Za malo miejsca w hangarach bombowcow na przenoszone bomby.',
    noRepairCapacity: 'Nie wybrano zadnej zdolnosci naprawczej.',
  },
  fleet: {
    subtitle: 'Typ misji podswietla statki przydatne albo wymagane.',
    clearAll: 'Wyczysc wszystko',
    noMatches: 'Zaden statek nie pasuje do aktualnych filtrow przeznaczenia.',
    available:
      'Dostepne: {{available}} (Uszkodzone: {{damaged}}) | Ladownosc: {{cargo}} | Hangar: {{hangar}}',
    noHyperspaceDrive: 'Brak napedu nadprzestrzennego.',
    ready: 'Gotowe',
    damaged: 'Uszkodzone',
    max: 'Max',
    clear: 'Wyczysc',
  },
  bombs: {
    subtitle: 'Hangary bombowcow moga przewozic jednostki PLANETARY_BOMB z planety pochodzenia.',
    clearAll: 'Wyczysc bomby',
    tag: 'Bomba planetarna',
    loaded: 'Zaladowane',
    noAvailable: 'Na wybranej planecie pochodzenia nie ma dostepnych jednostek PLANETARY_BOMB.',
    rowMeta:
      'Dostepne: {{available}} | Rozmiar: {{size}} | Kadlub: {{hull}} | Ladunek: {{damage}} x {{shots}}',
  },
  origin: {
    coordinates: 'Wspolrzedne',
    useAsTarget: 'Uzyj jako celu',
    subtitle: 'Wybierz aktywna planete pochodzenia ze swojego imperium.',
    selected: 'Wybrana',
    select: 'Wybierz',
  },
  remoteOrigins: {
    subtitle:
      'Floty na orbicie moga rozpoczynac kolejne misje z biezacej pozycji. Paliwo jest pobierane z ladunku floty.',
    fleetSummary: 'Flota #{{fleetId}} na orbicie {{targetPlanet}}',
    fleetStats: 'Statki: {{ships}} | Paliwo w ladunku: {{fuel}}',
    noneAvailable: 'Nie ma jeszcze flot na orbicie dostepnych jako zdalne pochodzenie.',
  },
  errors: {
    noSession: 'Nie znaleziono sesji gracza.',
    targetFormat: 'Wspolrzedne celu musza miec format x:y:z.',
    createMission: 'Nie udalo sie utworzyc misji floty.',
    loadData: 'Nie udalo sie wczytac danych planera misji.',
    targetResolve: 'Nie udalo sie rozpoznac planety celu.',
  },
} as const;
