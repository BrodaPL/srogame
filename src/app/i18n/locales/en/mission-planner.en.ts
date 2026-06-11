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
  errors: {
    noSession: 'No player session found.',
    targetFormat: 'Target coordinates must have format x:y:z.',
    createMission: 'Unable to create fleet mission.',
    loadData: 'Unable to load mission planner data.',
    targetResolve: 'Target planet could not be resolved.',
  },
} as const;
