export const missionPlannerEn = {
  loading: {
    title: 'Loading Mission Planner',
    body: 'Owned planets are being loaded.',
  },
  status: {
    unavailable: 'Mission Planner unavailable',
  },
  sections: {
    missionType: 'Mission type',
    target: 'Target',
    missionDetails: 'Mission Details',
    bombardPriorities: 'Bombard Priorities',
    travelSummary: 'Travel Summary',
    launchSummary: 'Launch Summary',
    requirementsWarnings: 'Requirements and Warnings',
    fleetComposition: 'Fleet Composition',
    bombLoadout: 'Bomb Loadout',
    origin: 'Origin',
    remoteOrigins: 'Remote Origins',
  },
  target: {
    microcopy: 'Paste coordinates like {{example}} or use the planet rail.',
    placeholder: 'x:y:z',
    resolve: 'Resolve',
    noneResolved: 'No target planet resolved yet.',
  },
  details: {
    originMicrocopy: 'Origins can be owned planets or orbiting fleets with fuel in cargo.',
    origin: 'Origin',
    activeFleets: 'Active fleets',
    shipRepairCapability: 'Ship repair capability',
    droneRepairCapability: 'Drone repair capability',
    cargoDisabled: 'Cargo is disabled for this mission.',
    carriedBombs: 'Carried bombs',
    bomberHangars: 'Bomber hangars',
    speedSelectorLater: 'Speed selector (later)',
    fleetTemplateLater: 'Save as fleet template (later)',
  },
  resources: {
    metal: 'Metal',
    crystal: 'Crystal',
    deuterium: 'Deuterium',
  },
  jumpGate: {
    title: 'Jump Gate',
    use: 'Use Jump Gate',
    hintUnsupported: 'Jump Gate is available only for Move, Guard, Transport, and Repair.',
    hintSelectTarget: 'Select a target planet to check Jump Gate availability.',
    hintRemoteOrigin: 'Remote-origin launches cannot use Jump Gate travel yet.',
    hintNoTargetGate: 'Target planet has no known Jump Gate.',
    hintSelectOrigin: 'Select an origin planet to use Jump Gate travel.',
    hintNoOriginGate: 'Origin planet has no Jump Gate.',
    hintForeignApproval:
      'Foreign-owned targets require approval unless diplomacy auto-approves it.',
    hintReady: 'Jump Gate travel uses 1 turn. Capacity is checked on both endpoints.',
    warningOriginCapacity:
      'Origin Jump Gate capacity is {{capacity}}, but {{selected}} jump-capable ships are selected.',
    warningTargetCapacity:
      'Target Jump Gate capacity is {{capacity}}, but {{selected}} jump-capable ships are selected.',
    warningKnownTargetCapacity:
      'Known target Jump Gate capacity is at most {{capacity}}, but {{selected}} jump-capable ships are selected.',
    warningForeignRecheck:
      'Foreign target Jump Gate approval and live capacity are checked again on the server.',
  },
  bombardment: {
    body: 'Empty priorities keep current random targeting. Used options are disabled in the other dropdowns.',
    main: 'Main',
    secondary: 'Secondary',
    tertiary: 'Tertiary',
    random: 'Random',
    labels: {
      defences: 'Defences',
      defencesCanShootToOrbit: 'Defences canShootToOrbit=true',
      defencesCannotShootToOrbit: 'Defences canShootToOrbit=false',
      resourceBuildings: 'Resource buildings',
      facilities: 'Facilities',
    },
    groups: {
      categories: 'Categories',
      resourceBuildings: 'Resource buildings',
      facilities: 'Facilities',
    },
  },
  travel: {
    distance: 'Distance',
    eta: 'ETA',
    returnEta: 'Return ETA',
    fuelReserve: 'Fuel reserve',
    cargoUsed: 'Cargo used',
    cargoFree: 'Cargo free',
    hangarUsed: 'Hangar used',
    hangarTotal: 'Hangar total',
    bomberHangars: 'Bomber hangars',
    formulaJumpGate: 'Jump Gate override: travel time is fixed at 1 turn.',
    formulaEta:
      'ETA formula: ceil((4 / (1 + Fusion Drive / 3) + distance / (1 + Hyperspace Drive / 6) - Graviton Technology) * ship modifier)',
    formulaDriveIgnored: 'Drive technologies do not change Jump Gate travel time.',
    formulaCurrent:
      'Current: ceil(({{startup}} + {{distance}} - {{graviton}}) * {{multiplier}}) = {{turns}} turns',
    techSummary:
      'Tech levels: Fusion Drive {{fusion}} | Hyperspace Drive {{hyperspaceDrive}} | Graviton Technology {{graviton}}',
    shipModifierNeutral: 'Fleet speed modifier: 0% (Big hull baseline).',
    shipModifier:
      'Fleet speed modifier: slowest selected ship applies {{modifier}} to the full ETA.',
  },
  launch: {
    summary: 'Mission: {{mission}} | Ships: {{ships}} | Cargo: {{cargo}} | Fuel reserve: {{fuel}}',
    route: 'From {{origin}} to {{target}} ({{coordinates}})',
    launch: 'Launch mission',
    launching: 'Launching...',
  },
  warnings: {
    bomberHangar: 'Insufficient bomber hangar space for carried bombs.',
    noRepairCapacity: 'No repair capacity selected.',
  },
  fleet: {
    subtitle: 'Mission type highlights the ships that are useful or required.',
    clearAll: 'Clear all',
    noMatches: 'No ships match the current purpose filters.',
    available:
      'Available: {{available}} (Damaged: {{damaged}}) | Cargo: {{cargo}} | Hangar: {{hangar}}',
    noHyperspaceDrive: 'No hyperspace drive.',
    ready: 'Ready',
    damaged: 'Damaged',
    max: 'Max',
    clear: 'Clear',
  },
  bombs: {
    subtitle: 'Bomber hangars can carry PLANETARY_BOMB units from the origin planet.',
    clearAll: 'Clear bombs',
    tag: 'Planetary bomb',
    loaded: 'Loaded',
    noAvailable: 'No PLANETARY_BOMB units are available on the selected origin planet.',
    rowMeta:
      'Available: {{available}} | Size: {{size}} | Hull: {{hull}} | Payload: {{damage}} x {{shots}}',
  },
  origin: {
    coordinates: 'Coordinates',
    useAsTarget: 'Use as target',
    subtitle: 'Select the active origin planet from your empire.',
    selected: 'Selected',
    select: 'Select',
  },
  remoteOrigins: {
    subtitle:
      'Orbiting fleets can launch follow-up missions from their current location. Fuel is taken from fleet cargo.',
    fleetSummary: 'Fleet #{{fleetId}} orbiting {{targetPlanet}}',
    fleetStats: 'Ships: {{ships}} | Cargo fuel: {{fuel}}',
    noneAvailable: 'No orbiting fleets are available as remote origins yet.',
  },
  missions: {
    descriptions: {
      ATTACK:
        'Attack hostile or passive planets, steal resources after victory, then return automatically.',
      MOVE: 'Relocate ships to your own planets, friendly orbit, or an unowned planet. Cargo is allowed.',
      DEFEND:
        'Send a military fleet to non-hostile orbit. It stays there and joins the local defense when that orbit is attacked.',
      TRANSPORT:
        'Send resources and ships to your own or friendly planets, then return automatically.',
      ARMAMENT_DELIVERY:
        'Deliver resources, PLANETARY_BOMB units, and carried small ships to your own or allied planets, then return automatically.',
      SPY: 'Send only Spy Probes. Cargo is disabled for this mission.',
      BOMBARD:
        'Fight through hostile orbit, strike buildings once with bombardment weapons, then return automatically.',
      SIEGE:
        'Fight through hostile orbit, stay over the target, and continue bombardment every turn until the fleet leaves orbit.',
      REPAIR:
        'Move to a non-hostile planet or orbit and stay there until all friendly damage is repaired, then return automatically.',
      RECYCLE:
        'Move to orbit, gather debris with recycle equipment each turn, and return once the fleet is full or the debris field is empty.',
      COLONIZE: 'Send a Colonizer to an unowned planet.',
      HOLD: 'Keep a fleet parked in orbit without running mission logic until a new order is issued.',
    },
  },
  checks: {
    selectOrigin: 'Select origin planet.',
    selectTarget: 'Select or resolve target planet.',
    selectShip: 'Select at least one ship.',
    insufficientCargo: 'Insufficient cargo space.',
    insufficientHangar: 'Insufficient hangar space.',
    activeFleetLimit:
      'Active fleet limit reached ({{active}}/{{max}}). Upgrade COMPUTER_TECHNOLOGY to control more fleets.',
    missionCannotCarryCargo: '{{mission}} mission cannot carry cargo.',
    missionRequiresCargo: '{{mission}} mission requires cargo.',
    missionTargetCannotBeUnowned: '{{mission}} mission target cannot be unowned.',
    missionTargetOwnershipInvalid: '{{mission}} mission target ownership is not valid.',
    missionRequiredShipType: '{{shipType}} is required for {{mission}} mission.',
    missionExclusiveShipTypes: '{{mission}} mission accepts only {{shipTypes}}.',
    noMilitaryShipAssigned: 'No military ship has been assigned!',
    hangarCapacityRemaining: 'Hangar capacity remaining: {{remaining}}.',
    insufficientDeuterium: 'Insufficient deuterium for cargo and fuel.',
    attackInvalidTarget: 'Attack mission target must be a WAR, NEUTRAL, or PASSIVE owned planet.',
    bombardInvalidTarget: 'Bombard mission target must be a hostile owned planet.',
    bombardRequiresBomber: 'BOMBARD requires at least one Bomber ship.',
    colonizeInvalidTarget:
      'Colonize mission can target only unowned planets or passive neutral planets.',
    ownedPlanetLimit:
      'Owned planet limit reached ({{owned}}/{{max}}). Upgrade ADAPTIVE_TECHNOLOGY to colonize more planets.',
    defendInvalidTarget:
      'Guard mission target must be your planet, a non-hostile orbit, or an unowned planet.',
    defendRequiresMilitaryShip: 'Guard requires at least one military ship.',
    moveInvalidTarget:
      'Move mission target must be your planet, a friendly orbit, or an unowned planet.',
    repairInvalidTarget: 'Repair mission target cannot be hostile.',
    repairRequiresDrone: 'Select at least one Repair Drone.',
    recycleNoDebris: 'No debris detected at target. The fleet will return immediately on arrival.',
    recycleRequiresEquipment: 'Select at least one ship with Recycle equipment.',
    recycleRequiresCargo: 'Recycle mission requires cargo space to store recovered debris.',
    siegeInvalidTarget: 'Siege mission target must be a hostile owned planet.',
    siegeRequiresBomber: 'SIEGE requires at least one Bomber ship.',
    spyOwnTarget: 'Target is your own planet.',
    spyNoProbes: 'No espionage probes selected.',
    transportInvalidTarget:
      'Transport mission target must be one of your planets or a friendly planet.',
    armamentDeliveryInvalidTarget:
      'Armament Delivery mission target must be one of your planets or an allied planet.',
    armamentDeliveryRequiresPayload:
      'Armament Delivery mission requires at least one PLANETARY_BOMB or one deliverable small ship.',
    armamentDeliveryRequiresCarrier:
      'Armament Delivery mission requires at least one carrier ship with hangar capacity.',
    armamentDeliveryExceedsHangar: 'Selected armament payload exceeds the fleet hangar capacity.',
  },
  errors: {
    noSession: 'No player session found.',
    targetFormat: 'Target coordinates must have format x:y:z.',
    createMission: 'Unable to create fleet mission.',
    loadData: 'Unable to load mission planner data.',
    targetResolve: 'Target planet could not be resolved.',
  },
} as const;
