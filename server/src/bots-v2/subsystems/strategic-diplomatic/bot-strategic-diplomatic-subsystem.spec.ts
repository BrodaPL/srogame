import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../../src/app/models/enums/defence-type.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { createDiplomaticRelation } from '../../../../../src/app/models/diplomacy/diplomatic-relation.js';
import { createDiplomaticProposal } from '../../../../../src/app/models/diplomacy/diplomatic-proposal.js';
import { FleetReport } from '../../../../../src/app/models/reports/fleet-report.js';
import { EspionageReportGenerator } from '../../../../../src/app/generators/espionage-report-generator.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import { createSupportRequest } from '../../../../../src/app/models/requests/support-request.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotStrategicDiplomaticSubsystem } from './bot-strategic-diplomatic-subsystem.js';

describe('BotStrategicDiplomaticSubsystem', () => {
  it('tracks only discovered non-neutral factions', () => {
    const { galaxy, bot, playerEnemy, botEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'BALANCED';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);

    expect(result.result.debug.discoveredFactionCount).toBe(1);
    expect(result.result.proposals.every((proposal) =>
      proposal.requestPayload.targetPlayerId === playerEnemy.playerId
    )).toBe(true);
    expect(result.result.proposals.some((proposal) =>
      proposal.requestPayload.targetPlayerId === botEnemy.playerId
    )).toBe(false);
  });

  it('prefers peace-oriented diplomatic changes for miner profile', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'MINER';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const peaceProposal = result.result.proposals.find((proposal) =>
      proposal.requestPayload.actionType === 'RELATION_CHANGE'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
    );

    expect(peaceProposal).toBeDefined();
    expect(peaceProposal?.requestPayload.requestedStatus).toBe(DiplomaticStatus.PEACE);
  });

  it('requires repeated hostility before escalating from neutral to war', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'AGGRESSOR';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);
    addBattleReport(bot, playerEnemyPlanet, galaxy.currentTurn);

    const firstResult = runStrategicDiplomaticSubsystem(galaxy, bot);
    expect(firstResult.result.proposals.some((proposal) =>
      proposal.requestPayload.actionType === 'RELATION_CHANGE'
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.WAR
    )).toBe(false);

    addBattleReport(bot, playerEnemyPlanet, galaxy.currentTurn + 1);
    addBattleReport(bot, playerEnemyPlanet, galaxy.currentTurn + 2);
    galaxy.currentTurn += 2;

    const secondResult = runStrategicDiplomaticSubsystem(galaxy, bot, firstResult.memory);
    expect(secondResult.result.proposals.some((proposal) =>
      proposal.requestPayload.actionType === 'RELATION_CHANGE'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.WAR
    )).toBe(true);
  });

  it('emits proposal-management preference for incoming peace proposal', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'MINER';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);
    galaxy.diplomaticProposals.push(
      createDiplomaticProposal(1, playerEnemy.playerId, bot.playerId, DiplomaticStatus.PEACE, galaxy.currentTurn, galaxy.currentTurn + 3)
    );

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const preferenceProposal = result.result.proposals.find((proposal) =>
      proposal.requestPayload.actionType === 'PROPOSAL_PREFERENCE'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
    );

    expect(preferenceProposal).toBeDefined();
    expect(preferenceProposal?.requestPayload.preference).toBe('APPROVE');
  });

  it('prioritizes war espionage over allied coverage when intel is insufficient', () => {
    const { galaxy, bot, playerEnemy, botEnemy, botPlanet, playerEnemyPlanet, botEnemyPlanet } = createStrategicDiplomaticWorld();
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 24);
    galaxy.currentTurn = 220;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR),
      createDiplomaticRelation(bot.playerId, botEnemy.playerId, DiplomaticStatus.ALLIED)
    );
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 4 });
    markPlanetScanned(bot, botEnemy, botEnemyPlanet, 0, { forcedReportLevel: 4 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const spyProposals = result.result.proposals.filter((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
    );

    expect(spyProposals.length).toBeGreaterThan(0);
    expect(spyProposals[0]?.requestPayload.target).toEqual({ x: 0, y: 0, z: 2 });
    expect(spyProposals[0]?.debug.targetStatus).toBe(DiplomaticStatus.WAR);
  });

  it('emits up to two per-planet probe ship-need requests from global diplomatic deficit', () => {
    const { galaxy, bot, playerEnemy, botPlanet, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const secondSystem = new SolarSystem('DipAux', 4, false, false, { x: 1, y: 0 }, new Set(), new Map());
    const secondBotPlanet = Planet.createStartingPlanet('DipAux I', 1, secondSystem, 1);
    secondSystem.planets[0] = secondBotPlanet;
    secondBotPlanet.info.ownerId = bot.playerId;
    configureKnownPlanet(secondBotPlanet);
    bot.planets.push(secondBotPlanet);
    galaxy.stars[0]?.push(secondSystem);
    galaxy.currentTurn = 220;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 3 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const probeNeeds = result.result.proposals.filter((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.shipType === ShipType.SPY_PROBE
    );
    const totalRequested = probeNeeds.reduce((sum, proposal) =>
      sum + Number(proposal.requestPayload.amount ?? 0), 0);

    expect(probeNeeds.length).toBeGreaterThan(0);
    expect(probeNeeds.length).toBeLessThanOrEqual(2);
    expect(totalRequested).toBeLessThanOrEqual(Number(result.result.debug.globalProbeNeedCap));
    expect(Number(result.result.debug.globalProbeNeedCap)).toBeGreaterThan(0);
  });

  it('emits diplomatic attack mission proposals against war targets with valid intel', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 2);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const attackProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.requestPayload.target.x === playerEnemyPlanet.basicInfo.solarSystem.coordinates.x
      && proposal.requestPayload.target.y === playerEnemyPlanet.basicInfo.solarSystem.coordinates.y
      && proposal.requestPayload.target.z === playerEnemyPlanet.basicInfo.order
    );

    expect(attackProposal).toBeDefined();
    expect(attackProposal?.debug.attackKind).toBe('FULL');
  });

  it('persists one primary war-break target across turns while it stays valid', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 6);
    playerEnemyPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 3);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const firstResult = runStrategicDiplomaticSubsystem(galaxy, bot);
    const firstTarget = firstResult.memory.strategicDiplomatic.primaryWarBreakTarget;
    expect(firstTarget).not.toBeNull();

    galaxy.currentTurn += 1;
    const secondResult = runStrategicDiplomaticSubsystem(galaxy, bot, firstResult.memory);
    const secondTarget = secondResult.memory.strategicDiplomatic.primaryWarBreakTarget;

    expect(secondTarget).not.toBeNull();
    expect(secondTarget?.targetPlayerId).toBe(playerEnemy.playerId);
    expect(secondTarget?.coordinates).toEqual(firstTarget?.coordinates);
    expect(secondTarget?.holdUntilTurn).toBe(firstTarget?.holdUntilTurn);
  });

  it('emits allied repair support missions for explicit repair requests', () => {
    const { galaxy, bot, botPlanet, botEnemy, botEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, botEnemy.playerId, DiplomaticStatus.ALLIED)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 2);
    markPlanetScanned(bot, botEnemy, botEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 10 });
    galaxy.supportRequests.push(createSupportRequest(
      1,
      botEnemy.playerId,
      bot.playerId,
      'PLANET_REPAIR',
      botEnemyPlanet.basicInfo.name,
      {
        x: botEnemyPlanet.basicInfo.solarSystem.coordinates.x,
        y: botEnemyPlanet.basicInfo.solarSystem.coordinates.y,
        z: botEnemyPlanet.basicInfo.order
      },
      galaxy.currentTurn,
      galaxy.currentTurn + 5
    ));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const repairProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.REPAIR
    );

    expect(repairProposal).toBeDefined();
    expect(repairProposal?.debug.supportReason).toBe('EXPLICIT_REQUEST');
  });

  it('emits exact-ship-type war-break ship need when direct attack and relocation are both unavailable', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.removeShipsByType([
      { type: ShipType.CRUISER, amount: 999 },
      { type: ShipType.FIGHTER, amount: 999 },
      { type: ShipType.FRIGATE, amount: 999 },
      { type: ShipType.BATTLE_SHIP, amount: 999 }
    ]);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 4);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const shipNeed = result.result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.shipType !== ShipType.SPY_PROBE
      && proposal.debug.needKind === 'MOVE'
    );

    expect(shipNeed).toBeDefined();
    expect(shipNeed?.debug.needKind).toBe('MOVE');
  });

  it('emits a pre-break relocation move before war-break ship need when concentration can improve a war target', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const reservePlanet = addOwnedPlanet(galaxy, bot, 'DipWarReserve', { x: 1, y: 0 }, 1);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    enableAdvancedWarProduction(reservePlanet, bot);
    reservePlanet.rBDSFTQ.resources.deuterium = 20000;
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    reservePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 80);
    playerEnemyPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 60);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const moveProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.MOVE
      && proposal.debug.moveRole === 'WAR_BREAK_STAGING'
    );
    const shipNeed = result.result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.debug.needKind === 'MOVE'
    );

    expect(moveProposal).toBeDefined();
    expect(shipNeed).toBeUndefined();
  });

  it('emits post-break raid attack proposals for opened war targets with cargo support', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 3);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const raidProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
    );

    expect(raidProposal).toBeDefined();
    expect(Number(raidProposal?.debug.estimatedPlunder)).toBeGreaterThan(0);
    expect(Number(raidProposal?.debug.cargoCapacity)).toBeGreaterThan(0);
  });

  it('pauses repeated post-break raids when ambush risk grows too high', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 12 });

    let memory = createDefaultBotMemoryV2();
    for (let turn = 1; turn <= 4; turn += 1) {
      galaxy.currentTurn = turn;
      addBattleReport(bot, playerEnemyPlanet, turn);
      memory = runStrategicDiplomaticSubsystem(galaxy, bot, memory).memory;
    }

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const raidProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
    );
    const openedTarget = result.memory.strategicDiplomatic.openedWarTargets[0] ?? null;

    expect(raidProposal).toBeUndefined();
    expect(openedTarget).not.toBeNull();
    expect((openedTarget?.currentAmbushRiskScore ?? 0)).toBeGreaterThanOrEqual(70);
    expect((openedTarget?.pausedUntilTurn ?? 0)).toBeGreaterThan(galaxy.currentTurn);
  });

  it('emits bombardment mission proposals for war targets when bombardment pressure is available', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.ORBITAL_BOMBER, 2);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const bombardProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.BOMBARD
    );

    expect(bombardProposal).toBeDefined();
    expect(bombardProposal?.debug.missionType).toBe(FleetMissionType.BOMBARD);
  });

  it('emits relocation move proposals before bombardment ship need when one origin cannot satisfy war pressure alone', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const reservePlanet = addOwnedPlanet(galaxy, bot, 'DipReserve', { x: 1, y: 0 }, 1);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    enableAdvancedWarProduction(reservePlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.ATMOSPHERIC_BOMBER, 1);
    reservePlanet.rBDSFTQ.ships.addUndamaged(ShipType.ATMOSPHERIC_BOMBER, 1);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 60);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const moveProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.MOVE
      && proposal.debug.moveRole === 'BOMBARDMENT_STAGING'
    );
    const bombardNeed = result.result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.debug.needKind === 'BOMBARD'
    );

    expect(moveProposal).toBeDefined();
    expect(bombardNeed).toBeUndefined();
  });

  it('emits armament-delivery proposals for own strategic hubs with low bomb stock', () => {
    const { galaxy, bot, botPlanet } = createStrategicDiplomaticWorld();
    const forwardHub = addOwnedPlanet(galaxy, bot, 'DipForward', { x: 2, y: 0 }, 1);
    enableAdvancedWarProduction(botPlanet, bot);
    enableAdvancedWarProduction(forwardHub, bot);
    botPlanet.setBuildingLevel(BuildingType.BOMB_DEPOT, 4);
    forwardHub.setBuildingLevel(BuildingType.BOMB_DEPOT, 4);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CARRIER, 1);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 1);
    botPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.SMALL_BOMB, 2);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const armamentProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
      && proposal.requestPayload.target.x === forwardHub.basicInfo.solarSystem.coordinates.x
    );

    expect(armamentProposal).toBeDefined();
    expect(armamentProposal?.debug.targetKind).toBe('OWN');
  });

  it('emits diplomatic building and bomb-production pressure under war readiness', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.setBuildingLevel(BuildingType.BOMB_DEPOT, 4);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const buildingProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'BUILDING'
      && (
        proposal.requestPayload.buildingType === BuildingType.JUMP_GATE
        || proposal.requestPayload.buildingType === BuildingType.ALLIANCE_DEPOT
      )
    );
    const bombProductionProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.itemKind === 'defence'
      && proposal.requestPayload.defenceType !== undefined
    );

    expect(buildingProposal).toBeDefined();
    expect(bombProductionProposal).toBeDefined();
    expect(bombProductionProposal?.debug.itemKind).toBe('defence');
  });
});

function runStrategicDiplomaticSubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory = createDefaultBotMemoryV2()
): { result: ReturnType<BotStrategicDiplomaticSubsystem['generate']>; memory: ReturnType<typeof createDefaultBotMemoryV2> } {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
    enabled: true,
    shadowMode: true,
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: false,
      strategicDevelopment: false,
      strategicMilitary: false,
      strategicDiplomatic: true
    },
    allowSupervisorAcceptance: false,
    allowExecution: false
  });

  return {
    result: new BotStrategicDiplomaticSubsystem().generate({
      snapshot,
      memory
    }),
    memory
  };
}

function createStrategicDiplomaticWorld() {
  const system = new SolarSystem('DipSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const botPlanet = Planet.createStartingPlanet('DipSys I', 1, system, 1);
  const playerEnemyPlanet = Planet.createStartingPlanet('DipSys II', 2, system, 1);
  const botEnemyPlanet = Planet.createStartingPlanet('DipSys III', 3, system, 1);
  system.planets[0] = botPlanet;
  system.planets[1] = playerEnemyPlanet;
  system.planets[2] = botEnemyPlanet;

  const bot = new Player(1, 'Bot-1', [botPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const playerEnemy = new Player(2, 'Human-2', [playerEnemyPlanet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  const botEnemy = new Player(3, 'Bot-3', [botEnemyPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  botPlanet.info.ownerId = bot.playerId;
  playerEnemyPlanet.info.ownerId = playerEnemy.playerId;
  botEnemyPlanet.info.ownerId = botEnemy.playerId;
  configureKnownPlanet(botPlanet);
  configureKnownPlanet(playerEnemyPlanet);
  configureKnownPlanet(botEnemyPlanet);
  setBasicShipTech(bot);
  setBasicShipTech(playerEnemy);
  setBasicShipTech(botEnemy);

  const galaxy = new Galaxy(
    'Diplomatic Test',
    [bot, playerEnemy, botEnemy],
    [[system]],
    1,
    [],
    1,
    new Map([[playerEnemy.playerId, playerEnemy]]),
    new Map([[bot.playerId, bot], [botEnemy.playerId, botEnemy]]),
    new Map(),
    new Map([
      [bot.playerName, bot.playerId],
      [playerEnemy.playerName, playerEnemy.playerId],
      [botEnemy.playerName, botEnemy.playerId]
    ])
  );

  return { galaxy, bot, botPlanet, playerEnemy, botEnemy, playerEnemyPlanet, botEnemyPlanet };
}

function configureKnownPlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 2);
  planet.rBDSFTQ.resources = new ResourcesPack(5000, 4000, 3000);
}

function markPlanetScanned(
  bot: Player,
  owner: Player,
  planet: Planet,
  createdTurn: number,
  options: { forcedReportLevel?: number; reportLevelBonus?: number } = {}
): void {
  const report = new EspionageReportGenerator().createEspionageReport(bot, owner, planet, 6, {
    createdTurn,
    reportLevelBonus: options.reportLevelBonus ?? 10,
    forcedReportLevel: options.forcedReportLevel
  });
  planet.lastReportData.set(bot.playerId, report);
}

function addBattleReport(
  bot: Player,
  planet: Planet,
  createdTurn: number
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
      'Perspective: Attacker',
      'Enemy survivors by type: none',
      'Enemy defense survivors by type: none'
    ].join('\n')
  ));
}

function setBasicShipTech(player: Player): void {
  player.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);
  player.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);
  player.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
  player.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 2);
  player.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
  player.setTechLevel(TechnologyType.MISSILES_WEAPONS, 2);
}

function enableAdvancedWarProduction(planet: Planet, player: Player): void {
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 8);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 10);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 8);
  player.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 8);
  player.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 8);
  player.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 8);
  player.setTechLevel(TechnologyType.BEAMS_WEAPONS, 8);
  player.setTechLevel(TechnologyType.MISSILES_WEAPONS, 8);
  player.setTechLevel(TechnologyType.RAILGUNS_WEAPONS, 8);
  player.setTechLevel(TechnologyType.FUSION_DRIVE, 8);
  player.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 8);
  player.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 8);
}

function addOwnedPlanet(
  galaxy: Galaxy,
  owner: Player,
  systemName: string,
  coordinates: { x: number; y: number },
  order: number
): Planet {
  const system = new SolarSystem(systemName, order + 3, false, false, coordinates, new Set(), new Map());
  const planet = Planet.createStartingPlanet(`${systemName} I`, 1, system, 1);
  system.planets[0] = planet;
  planet.info.ownerId = owner.playerId;
  configureKnownPlanet(planet);
  owner.planets.push(planet);
  galaxy.stars[coordinates.y] ??= [];
  galaxy.stars[coordinates.y]?.push(system);
  return planet;
}
