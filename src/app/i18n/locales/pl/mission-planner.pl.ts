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
    labels: {
      defences: 'Obrony',
      defencesCanShootToOrbit: 'Obrony canShootToOrbit=true',
      defencesCannotShootToOrbit: 'Obrony canShootToOrbit=false',
      resourceBuildings: 'Budynki surowcowe',
      facilities: 'Infrastruktura',
    },
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
  missions: {
    descriptions: {
      ATTACK:
        'Atakuj wrogie albo pasywne planety, po zwyciestwie zrabuj surowce i automatycznie wroc.',
      MOVE: 'Przemiesc statki na wlasne planety, przyjazna orbite albo nieposiadana planete. Ladunek jest dozwolony.',
      DEFEND:
        'Wyslij flote wojskowa na niewroga orbite. Zostanie tam i dolaczy do lokalnej obrony, gdy ta orbita zostanie zaatakowana.',
      TRANSPORT:
        'Wyslij surowce i statki na wlasne albo przyjazne planety, a potem automatycznie wroc.',
      ARMAMENT_DELIVERY:
        'Dostarcz surowce, jednostki PLANETARY_BOMB i przenoszone male statki na wlasne albo sojusznicze planety, a potem automatycznie wroc.',
      SPY: 'Wyslij tylko Spy Probes. Ladunek jest wylaczony dla tej misji.',
      BOMBARD:
        'Przebij sie przez wroga orbite, raz uderz budynki bronia bombardujaca i automatycznie wroc.',
      SIEGE:
        'Przebij sie przez wroga orbite, zostan nad celem i kontynuuj bombardowanie co ture, dopoki flota nie opusczy orbity.',
      REPAIR:
        'Przemiesc sie na niewroga planete albo orbite i zostan tam, az wszystkie przyjazne uszkodzenia zostana naprawione, a potem automatycznie wroc.',
      RECYCLE:
        'Przemiesc sie na orbite, zbieraj szczatki sprzetem recyklingowym co ture i wroc, gdy flota bedzie pelna albo pole szczatkow sie skonczy.',
      COLONIZE: 'Wyslij Colonizer na nieposiadana planete.',
      HOLD: 'Utrzymuj flote zaparkowana na orbicie bez logiki misji, dopoki nie dostanie nowego rozkazu.',
    },
  },
  checks: {
    selectOrigin: 'Wybierz planete pochodzenia.',
    selectTarget: 'Wybierz albo rozpoznaj planete celu.',
    selectShip: 'Wybierz co najmniej jeden statek.',
    insufficientCargo: 'Za malo miejsca na ladunek.',
    insufficientHangar: 'Za malo miejsca w hangarze.',
    activeFleetLimit:
      'Osiagnieto limit aktywnych flot ({{active}}/{{max}}). Ulepsz COMPUTER_TECHNOLOGY, aby kontrolowac wiecej flot.',
    missionCannotCarryCargo: 'Misja {{mission}} nie moze przewozic ladunku.',
    missionRequiresCargo: 'Misja {{mission}} wymaga ladunku.',
    missionTargetCannotBeUnowned: 'Cel misji {{mission}} nie moze byc nieposiadany.',
    missionTargetOwnershipInvalid: 'Wlasnosc celu dla misji {{mission}} jest nieprawidlowa.',
    missionRequiredShipType: '{{shipType}} jest wymagany dla misji {{mission}}.',
    missionExclusiveShipTypes: 'Misja {{mission}} przyjmuje tylko {{shipTypes}}.',
    noMilitaryShipAssigned: 'Nie przydzielono zadnego statku wojskowego!',
    hangarCapacityRemaining: 'Pozostale miejsce w hangarze: {{remaining}}.',
    insufficientDeuterium: 'Za malo deuteru na ladunek i paliwo.',
    attackInvalidTarget:
      'Cel misji Attack musi byc posiadana planeta o statusie WAR, NEUTRAL albo PASSIVE.',
    bombardInvalidTarget: 'Cel misji Bombard musi byc wroga posiadana planeta.',
    bombardRequiresBomber: 'BOMBARD wymaga co najmniej jednego Bombers.',
    colonizeInvalidTarget:
      'Misja Colonize moze celowac tylko w nieposiadane planety albo pasywne neutralne planety.',
    ownedPlanetLimit:
      'Osiagnieto limit posiadanych planet ({{owned}}/{{max}}). Ulepsz ADAPTIVE_TECHNOLOGY, aby kolonizowac wiecej planet.',
    defendInvalidTarget:
      'Cel misji Guard musi byc twoja planeta, niewroga orbita albo nieposiadana planeta.',
    defendRequiresMilitaryShip: 'Guard wymaga co najmniej jednego statku wojskowego.',
    moveInvalidTarget:
      'Cel misji Move musi byc twoja planeta, przyjazna orbita albo nieposiadana planeta.',
    repairInvalidTarget: 'Cel misji Repair nie moze byc wrogi.',
    repairRequiresDrone: 'Wybierz co najmniej jednego Repair Drone.',
    recycleNoDebris: 'Na celu nie wykryto szczatkow. Flota natychmiast zawroci po przylocie.',
    recycleRequiresEquipment: 'Wybierz co najmniej jeden statek wyposazony w sprzet recyklingowy.',
    recycleRequiresCargo: 'Misja Recycle wymaga ladownosci do przechowania odzyskanych szczatkow.',
    siegeInvalidTarget: 'Cel misji Siege musi byc wroga posiadana planeta.',
    siegeRequiresBomber: 'SIEGE wymaga co najmniej jednego Bombers.',
    spyOwnTarget: 'Cel jest twoja wlasna planeta.',
    spyNoProbes: 'Nie wybrano zadnych sond szpiegowskich.',
    transportInvalidTarget:
      'Cel misji Transport musi byc jedna z twoich planet albo przyjazna planeta.',
    armamentDeliveryInvalidTarget:
      'Cel misji Armament Delivery musi byc jedna z twoich planet albo planeta sojusznicza.',
    armamentDeliveryRequiresPayload:
      'Misja Armament Delivery wymaga co najmniej jednej jednostki PLANETARY_BOMB albo jednego dostarczalnego malego statku.',
    armamentDeliveryRequiresCarrier:
      'Misja Armament Delivery wymaga co najmniej jednego nosiciela z pojemnoscia hangaru.',
    armamentDeliveryExceedsHangar: 'Wybrany ladunek uzbrojenia przekracza pojemnosc hangaru floty.',
  },
  errors: {
    noSession: 'Nie znaleziono sesji gracza.',
    targetFormat: 'Wspolrzedne celu musza miec format x:y:z.',
    createMission: 'Nie udalo sie utworzyc misji floty.',
    loadData: 'Nie udalo sie wczytac danych planera misji.',
    targetResolve: 'Nie udalo sie rozpoznac planety celu.',
  },
} as const;
