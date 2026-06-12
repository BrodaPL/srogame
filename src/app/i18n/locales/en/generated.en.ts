export const generatedEn = {
  shared: {
    noResources: 'no resources',
    resourcesInline: '{{metal}} metal, {{crystal}} crystal, {{deuterium}} deuterium',
    none: 'none',
  },
  fleet: {
    launchSummary:
      '{{mission}} {{originX}}:{{originY}}:{{originZ}} -> {{targetX}}:{{targetY}}:{{targetZ}} (fleet {{fleetId}})',
    titles: {
      arrived: 'Fleet Arrived: {{mission}} to {{targetPlanet}}',
      returned: 'Fleet Returned: {{mission}} to {{originPlanet}}',
      failed: 'Fleet Failed: {{mission}} to {{targetPlanet}}',
      draw: 'Fleet Draw: {{mission}} at {{targetPlanet}}',
    },
    returnedBody: 'Fleet {{fleetId}} returned to {{originPlanet}}.',
    failedBody: '{{reason}}\n\nFleet turned around and started a failure return flight.',
    manifest: {
      ships: 'Fleet ships: {{ships}}',
      cargo: 'Fleet cargo: Metal {{metal}}, Crystal {{crystal}}, Deuterium {{deuterium}}',
    },
    result: {
      missionFailedDefault: 'Mission failed.',
      originOrTargetMissing:
        'Mission failed because the origin owner or target planet no longer existed.',
      fleetDestroyedAt: '{{mission}} fleet was destroyed at {{targetPlanet}}.',
      tickResolvedAt: '{{mission}} tick resolved at {{targetPlanet}}.',
      returnedTo: 'Fleet returned to {{originPlanet}}.',
    },
  },
  missionReports: {
    attack: {
      failedTargetUnavailable:
        'Attack mission failed because the target was no longer available on arrival.',
      failedTargetNotAttackable:
        'Attack mission failed because the target was no longer attackable on arrival.',
      failedRetreat: 'Attack mission encountered hostile resistance and was forced to retreat.',
    },
    bombard: {
      failedTargetUnavailable:
        'Bombard mission failed because the target was no longer available on arrival.',
      failedTargetNotHostile:
        'Bombard mission failed because the target was no longer hostile on arrival.',
      successHit: 'Bombard mission struck {{targetPlanet}} and started the return flight.',
      failedRetreat: 'Bombard mission encountered hostile resistance and was forced to retreat.',
    },
    colonize: {
      failedTargetUnavailable:
        'Colonize mission failed because the target was no longer available.',
      failedTargetOccupied:
        'Colonize mission failed because the target became occupied before arrival.',
      successEstablished: 'Colonize mission established a new colony on {{targetPlanet}}.',
    },
    defend: {
      successOrbit: 'Guard mission entered orbit over {{targetPlanet}}.',
      failedTargetHostile:
        'Guard mission failed because the destination became hostile before arrival.',
      failedRetreat:
        'Guard mission encountered hostile ships and was forced to retreat after the battle.',
    },
    move: {
      successCompleted: '{{mission}} mission completed successfully at {{targetPlanet}}.',
      successFriendlyOrbit: 'Move mission entered friendly orbit over {{targetPlanet}}.',
      failedTargetOwned:
        'Move mission failed because the destination became owned by another player before arrival.',
      failedRetreat:
        'Move mission encountered hostile ships and was forced to retreat after the battle.',
    },
    recycle: {
      failedTargetUnavailable: 'Recycle mission failed because the target was no longer available.',
      failedNoEquipment:
        'Recycle mission can no longer operate because no recycle equipment survived.',
      successCargoFull:
        'Recycle mission filled its cargo holds over {{targetPlanet}} and started the return flight.',
      successDebrisCleared:
        'Recycle mission cleared the debris field over {{targetPlanet}} and started the return flight.',
      successDebrisExhausted:
        'Recycle mission exhausted the debris field over {{targetPlanet}} and started the return flight.',
      failedTargetUnavailableArrival:
        'Recycle mission failed because the target was no longer available on arrival.',
      failedNoEquipmentArrival:
        'Recycle mission failed because no recycle equipment survived the approach.',
      successNoDebris:
        'Recycle mission found no debris over {{targetPlanet}} and started the return flight.',
      successSalvageOrbit: 'Recycle mission established salvage orbit over {{targetPlanet}}.',
      failedRetreat: 'Recycle mission encountered hostile resistance and was forced to retreat.',
    },
    repair: {
      failedTargetUnavailable:
        'Repair mission failed because the target was no longer available on arrival.',
      failedTargetHostile: 'Repair mission failed because the target was hostile on arrival.',
      successOrbit: 'Repair mission established orbit over {{targetPlanet}}.',
    },
    siege: {
      failedTargetUnavailable:
        'Siege mission failed because the target was no longer available on arrival.',
      failedTargetNotHostile:
        'Siege mission failed because the target was no longer hostile on arrival.',
      successOrbit: 'Siege mission established orbit over {{targetPlanet}}.',
      failedRetreat: 'Siege mission encountered hostile resistance and was forced to retreat.',
    },
    spy: {
      launchedFromOrigin: 'Spy mission launched from {{origin}}.',
      solarSystemLaunched: 'Star system espionage launched across {{coordinates}}.',
    },
    transport: {
      failedRetreat:
        'Transport mission encountered hostile ships, kept its undelivered cargo, and was forced to retreat after the battle.',
      failedTargetUnavailable:
        'Transport mission failed because the target was no longer available on arrival.',
      failedTargetNotFriendly:
        'Transport mission failed because the target was no longer friendly on arrival.',
      successCompleted: '{{mission}} mission completed successfully at {{targetPlanet}}.',
    },
    armamentDelivery: {
      failedRetreat:
        'Armament Delivery mission encountered hostile ships, kept its undelivered cargo and armaments, and was forced to retreat after the battle.',
      failedTargetUnavailable:
        'Armament Delivery mission failed because the target was no longer available on arrival.',
      failedTargetInvalid:
        'Armament Delivery mission failed because the target was no longer valid on arrival.',
      successDelivered:
        '{{mission}} mission delivered resources and armaments to {{targetPlanet}}.',
    },
  },
  reports: {
    researchCompletedTitle: 'Research Completed: {{technology}} L{{level}}',
    researchCompletedBody: '{{technology}} reached level {{level}} on {{planet}}.',
    espionageTitle: 'Espionage Report: {{planet}} ({{x}}:{{y}}:{{z}})',
    plunderTitle: 'Plunder Report: {{targetPlanet}}',
    incomingAttackTitle: 'Incoming Attack Report: {{targetPlanet}}',
    bombardmentTitle: 'Bombardment Report: {{mission}} at {{targetPlanet}}',
    incomingBombardmentTitle: 'Incoming Bombardment Report: {{mission}} at {{targetPlanet}}',
    sharedBombardmentTitle: 'Shared Bombardment Report: {{mission}} at {{targetPlanet}}',
    repairTitle: 'Repair Report: {{targetPlanet}} stabilized',
    body: {
      attackOutcomeSummary:
        'Attack resolved at {{targetPlanet}}.{{battleFragment}}{{plunderFragment}}',
      battleWinnerFragment: ' Battle winner: {{winner}}.',
      stolenResourcesFragment: ' Stolen {{resources}}.',
      noResourcesStolenFragment: ' No resources were stolen.',
      attackResolvedAt: 'Attack resolved at {{targetPlanet}}.',
      battleWinner: 'Battle winner: {{winner}}.',
      stolenResources: 'Stolen {{resources}}.',
      noResourcesStolen: 'No resources were stolen.',
      attackReachedTarget: 'Attack mission reached {{targetPlanet}}.',
      plunderSummary: 'Plunder summary:',
      enemyPlunderSummary: 'Enemy plunder summary:',
      basePlunder: 'Base plunder: {{percent}}%',
      bunkerReduction: 'Bunker reduction: {{percent}}%',
      effectivePlunder: 'Effective plunder: {{percent}}%',
      freeCargoBeforeLooting: 'Free cargo space before looting: {{value}}',
      fleetCargoAfterLooting: 'Fleet cargo after looting: {{current}}/{{total}}',
      attackingFleetCargoAfterLooting: 'Attacking fleet cargo after looting: {{current}}/{{total}}',
      noStealableResources: 'No stealable resources remained on the target.',
      noFreeCargoNoStolen: 'No free cargo space remained, so no resources were stolen.',
      attackerNoFreeCargoNoStolen:
        'Attacking fleet had no free cargo space, so no resources were stolen.',
      lootAttemptFailed: 'Loot attempt failed to secure any resources.',
      attackerFailedSecureResources: 'Attacking fleet failed to secure any resources.',
      resourcesStolenLine: 'Resources stolen: {{resources}}.',
      resourcesLostLine: 'Resources lost: {{resources}}.',
      resourcesLostNone: 'Resources lost: none.',
      target: 'Target: {{targetPlanet}}',
      bombardmentMission: 'Bombardment mission: {{mission}}',
      hostileFleetOwner: 'Hostile fleet owner: {{owner}}',
      shots: 'Shots: {{value}}',
      hits: 'Hits: {{value}}',
      totalStructuralDamage: 'Total structural damage: {{value}}',
      bombsLaunched: 'Planetary bombs launched: {{value}}',
      bombsActivated: 'Planetary bombs activated: {{value}}',
      bombsIntercepted: 'Planetary bombs intercepted: {{value}}',
      bombsLost: 'Planetary bombs lost: {{value}}',
      priorities: 'Priorities: Main {{main}}, Secondary {{secondary}}, Tertiary {{tertiary}}',
      prioritiesRandom: 'Priorities: random',
      buildingsEngaged: 'Buildings engaged: {{value}}',
      defencesEngaged: 'Defences engaged: {{value}}',
      buildingDamageSummary: 'Building damage summary:',
      noBuildingDamage: 'No lasting building damage recorded.',
      defenceDamageSummary: 'Defence damage summary:',
      noDefenceDamage: 'No lasting defence damage recorded.',
      buildingDamageEntry:
        '{{type}}: hits {{hits}}, damage {{damage}}{{zeroSuffix}}{{floorSuffix}}',
      buildingZeroSuffix: ', reduced to 0 SP x{{count}}',
      buildingFloorSuffix: ', bunker floor active at {{percent}}%',
      defenceDamageEntry: '{{type}}: hits {{hits}}, damage {{damage}}{{destroyedSuffix}}',
      defenceDestroyedSuffix: ', destroyed x{{count}}',
      planetAttackedStolen: 'Your planet was attacked and resources were stolen.',
      planetAttackedNoStolen: 'Your planet was attacked but no resources were stolen.',
      hostileBombardmentPressure: 'Your planet sustained hostile bombardment pressure.',
      repairMissionCompletedAt: 'Repair mission completed at {{targetPlanet}}.',
      repairNothingLeft:
        'No non-hostile damaged ships, buildings, or defences remained at the target.',
      fleetReturningToOrigin: 'Fleet {{fleetId}} is returning to {{originPlanet}}.',
      currentDebrisField:
        'Current debris field: Metal {{metal}}, Crystal {{crystal}}, Deuterium {{deuterium}}',
      missionResolvedAt: '{{mission}} resolved at {{targetPlanet}}.',
    },
  },
  battleReport: {
    titles: {
      coordinates: 'Battle Report: {{x}}:{{y}}:{{z}}',
      versus: 'Battle Report: {{attacker}} vs {{defender}}',
      sharedCoordinates: 'Shared Battle Report: {{x}}:{{y}}:{{z}}',
      sharedVersus: 'Shared Battle Report: {{attacker}} vs {{defender}}',
    },
    winners: {
      Attacker: 'Attacker',
      Defender: 'Defender',
      Draw: 'Draw',
    },
    body: {
      battleResult: 'Battle result: {{winner}}',
      perspective: 'Perspective: {{label}}',
      roundsFought: 'Rounds fought: {{rounds}} / {{maxRounds}}',
      ownShips: 'Own ships ({{label}}): {{surviving}}/{{initial}} survived, {{destroyed}} lost.',
      ownDefences:
        'Own defences ({{label}}): {{surviving}}/{{initial}} survived, {{destroyed}} lost.',
      enemyShips:
        'Enemy ships ({{label}}): {{surviving}}/{{initial}} survived, {{destroyed}} lost.',
      enemyDefences:
        'Enemy defences ({{label}}): {{surviving}}/{{initial}} survived, {{destroyed}} lost.',
      ownShipLossesByType: 'Own ship losses by type: {{summary}}',
      ownDefenceLossesByType: 'Own defence losses by type: {{summary}}',
      enemyShipLossesByType: 'Enemy ship losses by type: {{summary}}',
      enemyDefenceLossesByType: 'Enemy defence losses by type: {{summary}}',
      ownSurvivorsByType: 'Own survivors by type: {{summary}}',
      ownDefenceSurvivorsByType: 'Own defence survivors by type: {{summary}}',
      enemySurvivorsByType: 'Enemy survivors by type: {{summary}}',
      enemyDefenceSurvivorsByType: 'Enemy defence survivors by type: {{summary}}',
      roundSummaries: 'Round summaries:',
      roundSummary:
        'Round {{round}}: {{attackerLabel}} shots {{attackerShots}}, {{defenderLabel}} shots {{defenderShots}}, {{attackerLabel}} losses {{attackerLosses}}, {{defenderLabel}} losses {{defenderLosses}}.',
      planetaryBombs: '  Planetary bombs: {{summary}}',
      planetaryBombSummary:
        'launched {{launched}}, activated {{activated}}, intercepted {{intercepted}}, lost {{lost}}, damage {{damage}}',
      noRounds: 'No rounds were fought.',
    },
  },
  systemMail: {
    hostileAttackTitle: 'Hostile attack alert: {{attacker}} attacked {{targetPlanet}}',
    hostileAttackStolen: '{{attacker}} attacked {{targetPlanet}} and stole {{resources}}.',
    hostileAttackNoStolen: '{{attacker}} attacked {{targetPlanet}}, but no resources were stolen.',
    hostileAttackFleet: '{{attacker}} attacked {{targetPlanet}} with a hostile fleet.',
    sharedAttackTitle: 'Shared attack alert: {{attacker}} attacked {{victim}} at {{targetPlanet}}',
    sharedAttackBody: "{{attacker}} attacked {{victim}}'s planet {{targetPlanet}}.",
    hostileBombardmentTitle: 'Hostile {{mission}} alert: {{attacker}} targeted {{targetPlanet}}',
    hostileBombardmentBody:
      '{{attacker}} used {{missionUpper}} on {{targetPlanet}}, causing {{damage}} structural damage.',
    sharedBombardmentTitle: 'Shared {{mission}} alert: {{attacker}} targeted {{victim}}',
    sharedBombardmentBody:
      "{{attacker}} used {{missionUpper}} on {{victim}}'s planet {{targetPlanet}}.",
    espionageTitle: 'Espionage alert: {{attacker}} spied {{targetPlanet}}',
    espionageBody: '{{attacker}} sent {{probeCount}} spy {{probeWord}} to {{targetPlanet}}.',
    spyProbeSingular: 'probe',
    spyProbePlural: 'probes',
  },
  spyDialog: {
    solarSystem: {
      ariaLabel: 'Spy solar system {{name}}',
      eyebrow: 'Spy',
      title: 'Spy Solar System',
      subtitle: 'System: {{name}} ({{coordinates}})',
      activeFleets: 'Active fleets {{value}}',
      close: 'Close',
      unavailable: 'Star system espionage unavailable',
      loadingOrigins: 'Loading available probe origins.',
      targets: 'Targets',
      requiredProbes: 'Required probes',
      requiredFleetSlots: 'Required fleet slots',
      freeFleetSlots: 'Free fleet slots',
      targetsList: 'Targets: {{value}}',
      noTargets: 'No non-owned, non-asteroid planets are available in this star system.',
      noOrigins:
        'No owned planets or orbiting fleets with at least {{count}} espionage probes are available.',
      missionOrigin: 'Mission origin',
      originMeta: 'Total distance: {{totalDistance}} | Max distance: {{maxDistance}}{{damaged}}',
      damagedSuffix: ' | Damaged: {{count}}',
      cancel: 'Cancel',
      launching: 'Launching...',
      launch: 'Launch',
      noSession: 'No player session found.',
      launchFailed: 'Unable to launch star system espionage.',
      starSystemUnavailable: 'Star system is unavailable.',
      loadOriginsFailed: 'Unable to load star system spy origins.',
      fleetSlotsBlocked:
        'Spy solar system needs {{required}} free fleet slots, but only {{available}} are available.',
      probeLabelOne: '{{count}} probe',
      probeLabelMany: '{{count}} probes',
      probeLabelDamaged: '{{count}} probes ({{damaged}} damaged)',
      fleetOriginLabel:
        'Fleet #{{fleetId}} orbiting {{targetPlanet}} ({{coordinates}}) | {{probeLabel}}',
      planetOriginLabel: '{{planet}} ({{coordinates}}) | {{probeLabel}}',
    },
    launch: {
      ariaLabel: 'Spy {{name}}',
      eyebrow: 'Spy',
      title: 'Launch Espionage Probes',
      subtitle: 'Target: {{name}} ({{coordinates}})',
      activeFleets: 'Active fleets {{value}}',
      close: 'Close',
      unavailable: 'Spy mission unavailable',
      loadingOrigins: 'Loading available probe origins.',
      noOrigins: 'No owned planets or orbiting fleets with espionage probes are available.',
      missionOrigin: 'Mission origin',
      originMeta: 'Distance: {{distance}} | Available: {{available}}{{damaged}}',
      damagedSuffix: ' | Damaged: {{count}}',
      probeAmount: 'Probe amount',
      maxFromOrigin: 'Max from selected origin: {{count}}',
      cancel: 'Cancel',
      launching: 'Launching...',
      launch: 'Launch',
      noSession: 'No player session found.',
      launchFailed: 'Unable to launch spy mission.',
      targetUnavailable: 'Target planet is unavailable.',
      loadOriginsFailed: 'Unable to load spy launch origins.',
      probeLabelOne: '{{count}} probe',
      probeLabelMany: '{{count}} probes',
      probeLabelDamaged: '{{count}} probes ({{damaged}} damaged)',
      fleetOriginLabel:
        'Fleet #{{fleetId}} orbiting {{targetPlanet}} ({{coordinates}}) | {{probeLabel}}',
      planetOriginLabel: '{{planet}} ({{coordinates}}) | {{probeLabel}}',
    },
  },
  miniPlanet: {
    unknownPlanet: 'Unknown planet',
    imageAlt: '{{name}} image',
    ownedBy: 'Owned by: {{owner}}',
    ownerNoData: 'NO DATA',
    ownerYou: 'YOU',
    ownerUnknown: 'UNKNOWN',
    ownerNeutral: 'NEUTRAL',
    ownerFree: 'FREE',
    actions: {
      setOrigin: 'Set origin',
      setTarget: 'Set target',
      copyCoordinates: 'Copy coordinates',
      viewPlanet: 'View Planet',
      missionOrigin: 'Mission: origin',
      missionTarget: 'Mission: target',
      spy: 'Spy',
      sensorScan: 'Sensor scan',
    },
    tooltips: {
      copyCoordinates: 'Copy: {{coordinates}}',
      openPlanetView: 'Open planet intel view',
      planetIntelUnavailable: 'Planet intel is unavailable',
      openMissionOrigin: 'Open Mission Planner with origin {{coordinates}}',
      missionOriginUnavailable: 'Only owned planets can be used as mission origin here',
      openMissionTarget: 'Open Mission Planner with target {{coordinates}}',
      openSpy: 'Launch espionage probes at {{coordinates}}',
      openSensorScan: 'Open Sensor Phalanx scan for {{coordinates}}',
    },
    tags: {
      basicInfo: 'Basic Info',
      planetParameters: 'Planet Parameters',
      resources: 'Resources',
      debris: 'Debris',
      buildings: 'Buildings',
      technology: 'Technology',
      defences: 'Defences',
      ships: 'Ships',
      queues: 'Queues',
    },
    rows: {
      name: 'Name',
      order: 'Order',
      type: 'Type',
      size: 'Size',
      colonizationDifficulty: 'Colonization difficulty',
      metal: 'Metal',
      crystal: 'Crystal',
      deuterium: 'Deuterium',
      energyRes: 'Energy (RES)',
      energyNuclear: 'Energy (Nuclear)',
      science: 'Science',
      industry: 'Industry',
      anomaliesAndNoise: 'Anomalies/Noise',
      hyperspace: 'Hyperspace',
      averageTotalResources: 'Average total resources',
      averageBuildingLevel: 'Average building Level',
      averageTechnologyLevel: 'Average technology Level',
      totalDefences: 'Total defences',
      defenceEntries: 'Defence entries',
      totalShips: 'Total ships',
      shipEntries: 'Ship entries',
      shipyard: 'Shipyard',
      defencesQueue: 'Defences',
      research: 'Research',
      buildingsQueue: 'Buildings',
      empty: 'Empty',
    },
  },
} as const;
