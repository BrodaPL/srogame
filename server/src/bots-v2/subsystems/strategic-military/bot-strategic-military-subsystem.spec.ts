import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { EspionageReportGenerator } from '../../../../../src/app/generators/espionage-report-generator.js';
import { ManyDefences } from '../../../../../src/app/models/defences/many-defences.js';
import { Destination } from '../../../../../src/app/models/fleets/destination.js';
import { Fleet, FleetOrbitActivity, FleetReturnReason, FleetState } from '../../../../../src/app/models/fleets/fleet.js';
import { ManyShips } from '../../../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import type { BotMemoryV2 } from '../../../../../src/app/models/player.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { FleetReport } from '../../../../../src/app/models/reports/fleet-report.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import type { BotProposal } from '../../bot-v2-types.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotStrategicMilitarySubsystem } from './bot-strategic-military-subsystem.js';

describe('BotStrategicMilitarySubsystem', () => {
  it('emits spy missions for unscanned foreign planets', () => {
    const { galaxy, bot, homePlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 2);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
    )).toBe(true);
  });

  it('does not duplicate a spy target already claimed by an earlier subsystem', () => {
    const { galaxy, bot, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 2);

    const result = runStrategicMilitarySubsystem(galaxy, bot, createDefaultBotMemoryV2(), [{
      proposalId: 'prior:spy',
      subsystemId: 'STRATEGIC_DEVELOPMENT',
      kind: 'FLEET_MISSION',
      status: 'PROPOSED',
      goalKey: 'prior:spy',
      dedupeKey: 'prior:spy',
      summary: 'Prior spy.',
      planetId: null,
      targetCoordinates: {
        x: neutralPlanet.basicInfo.solarSystem.coordinates.x,
        y: neutralPlanet.basicInfo.solarSystem.coordinates.y,
        z: neutralPlanet.basicInfo.order
      },
      expectedValue: 1,
      urgency: 1,
      risk: 1,
      confidence: 1,
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      requestPayload: {
        missionType: FleetMissionType.SPY
      },
      blockers: [],
      expiresOnTurn: galaxy.currentTurn + 1,
      debug: {}
    }]);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
      && proposal.targetCoordinates?.z === neutralPlanet.basicInfo.order
    )).toBe(false);
  });

  it('caps farm-intel output to one spy mission at a time across neutral farms', () => {
    const { galaxy, bot, humanEnemy, neutralOwner, homePlanet, neutralPlanet, foreignPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 4);
    humanEnemy.planets = [];
    foreignPlanet.info.ownerId = neutralOwner.playerId;
    neutralOwner.planets.push(foreignPlanet);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const spyProposals = result.proposals.filter((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
    );

    expect(spyProposals).toHaveLength(1);
    expect(spyProposals[0]?.targetCoordinates?.z).toBe(neutralPlanet.basicInfo.order);
  });

  it('emits a break attack for scanned neutral planets with remaining defenders', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const attackProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
    );

    expect(attackProposal).toBeDefined();
    expect(attackProposal?.debug.missionPhase).toBe('BREAK');
    expect(attackProposal?.requestPayload.origin).toEqual({ x: 0, y: 0, z: 1 });
    expect(attackProposal?.requestPayload.target).toEqual({ x: 0, y: 0, z: 2 });
  });

  it('emits a one-ship probing attack when spy intel is insufficient for neutral defense estimation', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 2);
    markPlanetScannedWithLowIntel(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const probeProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'INTEL'
    );

    expect(probeProposal).toBeDefined();
    expect(probeProposal?.requestPayload.ships).toEqual([{
      type: ShipType.CRUISER,
      undamagedAmount: 1,
      damagedAmount: 0
    }]);
  });

  it('does not use a single transporter as a neutral-farm probe ship', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 2);
    markPlanetScannedWithLowIntel(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'INTEL'
    )).toBe(false);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
      && proposal.requestPayload.shipType === ShipType.CRUISER
    )).toBe(true);
  });

  it('does not fall back to repeated spy when farm memory already shows a prior spy and a cruiser probe is available', () => {
    const memory = createDefaultBotMemoryV2();
    const { galaxy, bot, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    memory.strategicMilitary.farmLedger.push({
      coordinates: {
        x: neutralPlanet.basicInfo.solarSystem.coordinates.x,
        y: neutralPlanet.basicInfo.solarSystem.coordinates.y,
        z: neutralPlanet.basicInfo.order
      },
      intelPhase: 'SPY_SENT',
      lastSpyTurn: galaxy.currentTurn - 1,
      lastAttackTurn: null,
      lastSuccessfulPlunderTurn: null,
      knownMineLevels: {
        metalMineLevel: 0,
        crystalMineLevel: 0,
        deuteriumSynthesizerLevel: 0
      },
      knownStorageCapacity: { metal: 0, crystal: 0, deuterium: 0 },
      knownIncome: { metal: 0, crystal: 0, deuterium: 0 },
      knownBunkerReductionPercent: 0,
      knownPlanetaryModifiers: {
        industryModifier: 1,
        metalModifier: 1,
        crystalModifier: 1,
        deuteriumModifier: 1
      },
      knownShipCountsByType: {},
      knownDefenceCountsByType: {},
      farmIntelEnough: false,
      initialDefenseBroken: false,
      lastObservedResources: { metal: 0, crystal: 0, deuterium: 0 },
      lastResourceObservationTurn: null,
      lastCombatObservationTurn: null,
      estimatedNextGoodAttackTurn: null,
      preferredPlunderTransporterCount: 6,
      preferredOriginCoordinates: null
    });

    const result = runStrategicMilitarySubsystem(galaxy, bot, memory);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
      && proposal.targetCoordinates?.z === neutralPlanet.basicInfo.order
    )).toBe(false);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'INTEL'
      && proposal.targetCoordinates?.z === neutralPlanet.basicInfo.order
    )).toBe(true);
  });

  it('does not queue another farm attack when a matching zero-based active attack fleet is already outbound', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 2);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.activeFleets.push(createActiveNeutralFarmAttackFleet(bot.playerId, homePlanet, neutralPlanet));

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.targetCoordinates?.z === neutralPlanet.basicInfo.order
    )).toBe(false);
  });

  it('seeds break intel from a spy report that reveals neutral defenders', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 2);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'BREAK'
      && proposal.targetCoordinates?.z === neutralPlanet.basicInfo.order
    )).toBe(true);
  });

  it('emits a plunder attack for opened neutral farms with enough loot at arrival', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.currentTurn = 2;
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const attackProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'PLUNDER'
    );

    expect(attackProposal).toBeDefined();
    expect(attackProposal?.requestPayload.ships.some((ship: { type: ShipType }) => ship.type === ShipType.TRANSPORTER)).toBe(true);
    expect(attackProposal?.requestPayload.ships.some((ship: { type: ShipType }) => ship.type === ShipType.CRUISER)).toBe(true);
  });

  it('treats scanned neutral planets with confirmed zero defenders as raid-ready intel', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const plunderProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'PLUNDER'
    );

    expect(plunderProposal).toBeDefined();
  });

  it('emits a ship-need request when current fleets cannot clear a scanned neutral target', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 4);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const shipNeedProposal = result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    );

    expect(shipNeedProposal).toBeDefined();
    expect(shipNeedProposal?.debug.queueType).toBe('SHIP_NEED');
    expect(shipNeedProposal?.requestPayload.shipType).toBe(ShipType.CRUISER);
    expect(shipNeedProposal?.requestPayload.amount).toBeGreaterThan(0);
  });

  it('uses report-derived farm resources instead of live hidden planet resources', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.currentTurn = 2;
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'PLUNDER'
    )).toBe(true);
  });

  it('uses battle reports to open a neutral farm for plunder without reading live defenders', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 2);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.currentTurn = 2;
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const attackProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'PLUNDER'
    );

    expect(attackProposal).toBeDefined();
  });

  it('requests a spy on an opened farm when combat intel exists but no resource model is known yet', () => {
    const { galaxy, bot, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const spyProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
      && proposal.targetCoordinates?.x === neutralPlanet.basicInfo.solarSystem.coordinates.x
      && proposal.targetCoordinates?.y === neutralPlanet.basicInfo.solarSystem.coordinates.y
      && proposal.targetCoordinates?.z === neutralPlanet.basicInfo.order
    );

    expect(spyProposal).toBeDefined();
  });

  it('produces a spy probe for an opened farm when combat intel exists but no probe can launch', () => {
    const { galaxy, bot, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    bot.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 1);
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const shipyardProposal = result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.itemKind === 'ship'
      && proposal.requestPayload.shipType === ShipType.SPY_PROBE
      && proposal.requestPayload.amount === 1
    );

    expect(shipyardProposal).toBeDefined();
  });

  it('uses plunder reports to suppress immediate re-plunder after a farm was drained', () => {
    const memory = createDefaultBotMemoryV2();
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.currentTurn = 2;
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });
    addPlunderReport(bot, neutralPlanet, galaxy.currentTurn, new ResourcesPack(300, 300, 300));
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);

    const result = runStrategicMilitarySubsystem(galaxy, bot, memory);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'PLUNDER'
    )).toBe(false);
  });

  it('keeps BREAK as a hard gate before PLUNDER is considered', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(900, 900, 900);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'PLUNDER'
    )).toBe(false);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'BREAK'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
    )).toBe(true);
  });

  it('does not send a lone defended BREAK ship when more real warships are needed', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'BREAK'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
    )).toBe(false);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    )).toBe(true);
  });

  it('emits MOVE relocation requests before SHIP_NEED when multiple origins can satisfy BREAK together', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    const supportPlanet = addOwnedSupportPlanet(galaxy, bot, 'BotSupport', { x: 0, y: 1 }, 1);
    configureOriginPlanet(supportPlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const moveProposals = result.proposals.filter((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.MOVE
      && proposal.debug.missionPhase === 'BREAK'
    );

    expect(moveProposals.length).toBeGreaterThan(0);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    )).toBe(false);
  });

  it('falls back to SHIP_NEED when relocation still cannot satisfy BREAK', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    const supportPlanet = addOwnedSupportPlanet(galaxy, bot, 'BotSupport', { x: 0, y: 1 }, 1);
    configureOriginPlanet(supportPlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 4);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.MOVE
    )).toBe(false);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    )).toBe(true);
  });

  it('caps ship-need output to one shortage request per origin planet', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet, foreignPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 4);
    foreignPlanet.info.ownerId = neutralOwner.playerId;
    neutralOwner.planets.push(foreignPlanet);
    foreignPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 5);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    markPlanetScanned(bot, neutralOwner, foreignPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const shipNeedProposals = result.proposals.filter((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    );

    expect(shipNeedProposals).toHaveLength(1);
  });
});

function runStrategicMilitarySubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory: BotMemoryV2 = createDefaultBotMemoryV2(),
  priorProposals: BotProposal[] = []
) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: false,
      strategicDevelopment: false,
      strategicMilitary: true,
      strategicDiplomatic: false,
      weightManager: false
    },
  });

  return new BotStrategicMilitarySubsystem().generate({
    snapshot,
    memory,
    priorProposals
  });
}

function createStrategicMilitaryWorld() {
  const system = new SolarSystem('BotSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  const neutralPlanet = Planet.createStartingPlanet('BotSys II', 2, system, 1);
  const foreignPlanet = Planet.createStartingPlanet('BotSys III', 3, system, 1);
  system.planets[0] = homePlanet;
  system.planets[1] = neutralPlanet;
  system.planets[2] = foreignPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [homePlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  setBasicShipTech(bot);
  const humanEnemy = new Player(
    2,
    'Human-2',
    [foreignPlanet],
    new Map(),
    [],
    PlayerType.PLAYER,
    createTutorialReadState(true)
  );
  const neutralOwner = new Player(
    3,
    'Neutral-3',
    [neutralPlanet],
    new Map(),
    [],
    PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );
  homePlanet.info.ownerId = bot.playerId;
  neutralPlanet.info.ownerId = neutralOwner.playerId;
  foreignPlanet.info.ownerId = humanEnemy.playerId;

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, humanEnemy, neutralOwner],
    [[system]],
    1,
    [],
    1,
    new Map([[humanEnemy.playerId, humanEnemy]]),
    new Map([[bot.playerId, bot]]),
    new Map([[neutralOwner.playerId, neutralOwner]]),
    new Map([
      [bot.playerName, bot.playerId],
      [humanEnemy.playerName, humanEnemy.playerId],
      [neutralOwner.playerName, neutralOwner.playerId]
    ])
  );

  return { galaxy, bot, humanEnemy, neutralOwner, homePlanet, neutralPlanet, foreignPlanet };
}

function addOwnedSupportPlanet(
  galaxy: Galaxy,
  bot: Player,
  systemName: string,
  coordinates: { x: number; y: number },
  order: number
): Planet {
  const system = new SolarSystem(systemName, 1, false, false, coordinates, new Set(), new Map());
  const supportPlanet = Planet.createStartingPlanet(`${systemName} I`, order, system, 1);
  system.planets[0] = supportPlanet;
  supportPlanet.info.ownerId = bot.playerId;
  bot.planets.push(supportPlanet);
  galaxy.stars.push([system]);
  return supportPlanet;
}

function createActiveNeutralFarmAttackFleet(ownerId: number, originPlanet: Planet, targetPlanet: Planet): Fleet {
  return new Fleet(
    101,
    ownerId,
    FleetMissionType.ATTACK,
    new Destination(
      originPlanet.basicInfo.solarSystem.coordinates.x,
      originPlanet.basicInfo.solarSystem.coordinates.y,
      originPlanet.basicInfo.order - 1
    ),
    new Destination(
      targetPlanet.basicInfo.solarSystem.coordinates.x,
      targetPlanet.basicInfo.solarSystem.coordinates.y,
      targetPlanet.basicInfo.order - 1
    ),
    originPlanet.basicInfo.name,
    targetPlanet.basicInfo.name,
    ManyShips.empty(),
    new ResourcesPack(0, 0, 0),
    1,
    0,
    0,
    2,
    2,
    FleetState.MOVING_TO_TARGET,
    1,
    ManyDefences.empty(),
    FleetOrbitActivity.IDLE,
    null,
    FleetReturnReason.NORMAL
  );
}

function configureOriginPlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
  planet.rBDSFTQ.resources = new ResourcesPack(30000, 30000, 30000);
  planet.rBDSFTQ.ships = ManyShips.empty();
}

function markPlanetScanned(
  bot: Player,
  owner: Player,
  planet: Planet,
  createdTurn: number
): void {
  const report = new EspionageReportGenerator().createEspionageReport(bot, owner, planet, 4, {
    createdTurn,
    reportLevelBonus: 10
  });
  planet.lastReportData.set(bot.playerId, report);
}

function markPlanetScannedWithLowIntel(
  bot: Player,
  owner: Player,
  planet: Planet,
  createdTurn: number
): void {
  const report = new EspionageReportGenerator().createEspionageReport(bot, owner, planet, 1, {
    createdTurn,
    forcedReportLevel: 4
  });
  planet.lastReportData.set(bot.playerId, report);
}

function addBattleReport(
  bot: Player,
  planet: Planet,
  createdTurn: number,
  lines: {
    survivingShipsLine: string;
    survivingDefencesLine: string;
  }
): void {
  bot.addReport(new FleetReport(
    {
      reportId: bot.createReportId(),
      createdTurn,
      title: `Battle Report: ${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`,
      sourceCoordinates: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order
      },
      sourcePlanetName: planet.basicInfo.name,
      sourceSystemName: planet.basicInfo.solarSystem.name
    },
    [
      'Battle result: ATTACKER',
      lines.survivingShipsLine,
      lines.survivingDefencesLine
    ].join('\n')
  ));
}

function addPlunderReport(
  bot: Player,
  planet: Planet,
  createdTurn: number,
  stolenResources: ResourcesPack
): void {
  bot.addReport(new FleetReport(
    {
      reportId: bot.createReportId(),
      createdTurn,
      title: `Plunder Report: ${planet.basicInfo.name}`,
      sourceCoordinates: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order
      },
      sourcePlanetName: planet.basicInfo.name,
      sourceSystemName: planet.basicInfo.solarSystem.name
    },
    `Resources stolen: Metal ${stolenResources.metal}, Crystal ${stolenResources.crystal}, Deuterium ${stolenResources.deuterium}.`
  ));
}

function setBasicShipTech(bot: Player): void {
  bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, 2);
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 2);
  bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
  bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 1);
  bot.setTechLevel(TechnologyType.RAILGUNS_WEAPONS, 1);
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
}
