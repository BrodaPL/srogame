import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../../src/app/models/enums/defence-type.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { BuildingsReport } from '../../../../../src/app/models/reports/buildings-report.js';
import { createDiplomaticRelation } from '../../../../../src/app/models/diplomacy/diplomatic-relation.js';
import { createDiplomaticProposal } from '../../../../../src/app/models/diplomacy/diplomatic-proposal.js';
import { FleetReport } from '../../../../../src/app/models/reports/fleet-report.js';
import { EspionageReportGenerator } from '../../../../../src/app/generators/espionage-report-generator.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import { createJumpGateRequest } from '../../../../../src/app/models/requests/jump-gate-request.js';
import { createMaintenanceRequest } from '../../../../../src/app/models/requests/maintenance-request.js';
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

  it('does not emit outgoing diplomacy proposals against undiscovered factions', () => {
    const { galaxy, bot, botPlanet, playerEnemy } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'BALANCED';
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 20);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const diplomacyProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.actionType === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
    );

    expect(diplomacyProposal).toBeUndefined();
  });

  it('prefers peace-oriented diplomatic changes for miner profile', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'MINER';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const peaceProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.actionType === 'DIPLOMACY_PROPOSAL'
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
      proposal.kind === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.WAR
    )).toBe(false);

    addBattleReport(bot, playerEnemyPlanet, galaxy.currentTurn + 1);
    addBattleReport(bot, playerEnemyPlanet, galaxy.currentTurn + 2);
    galaxy.currentTurn += 2;

    const secondResult = runStrategicDiplomaticSubsystem(galaxy, bot, firstResult.memory);
    expect(secondResult.result.proposals.some((proposal) =>
      proposal.kind === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.actionType === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.WAR
    )).toBe(true);
  });

  it('can propose war against a way weaker neutral faction', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'BALANCED';
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 20);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const warProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.WAR
    );

    expect(warProposal).toBeDefined();
  });

  it('emits only the best outgoing diplomacy proposal per turn', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const secondEnemy = addForeignPlayer(galaxy, 4, 'Human-4', { x: 1, y: 1 }, 1);
    bot.botProfileId = 'BALANCED';
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 20);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);
    markPlanetScanned(bot, secondEnemy, secondEnemy.planets[0]!, galaxy.currentTurn);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);

    expect(result.result.proposals.filter((proposal) => proposal.kind === 'DIPLOMACY_PROPOSAL')).toHaveLength(1);
  });

  it('cancels an outgoing war proposal when its utility turns negative', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'AVOIDER';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);
    galaxy.diplomaticProposals.push(
      createDiplomaticProposal(1, bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR, galaxy.currentTurn, galaxy.currentTurn + 1)
    );

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const cancelProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_DECISION'
      && proposal.requestPayload.actionType === 'DIPLOMACY_DECISION'
      && proposal.requestPayload.decision === 'CANCEL'
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.WAR
    );

    expect(cancelProposal).toBeDefined();
  });

  it('emits executable diplomacy approval for incoming peace proposal', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'MINER';
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);
    galaxy.diplomaticProposals.push(
      createDiplomaticProposal(1, playerEnemy.playerId, bot.playerId, DiplomaticStatus.PEACE, galaxy.currentTurn, galaxy.currentTurn + 3)
    );

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const decisionProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_DECISION'
      && proposal.requestPayload.actionType === 'DIPLOMACY_DECISION'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
    );

    expect(decisionProposal).toBeDefined();
    expect(decisionProposal?.requestPayload.decision).toBe('ACCEPT');
    expect(decisionProposal?.requestPayload.proposalId).toBe(1);
  });

  it('rejects incoming allied proposal when current relation is still neutral', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn);
    galaxy.diplomaticProposals.push(
      createDiplomaticProposal(1, playerEnemy.playerId, bot.playerId, DiplomaticStatus.ALLIED, galaxy.currentTurn, galaxy.currentTurn + 1)
    );

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const decisionProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_DECISION'
      && proposal.requestPayload.actionType === 'DIPLOMACY_DECISION'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
    );

    expect(decisionProposal).toBeDefined();
    expect(decisionProposal?.requestPayload.decision).toBe('REJECT');
    expect(decisionProposal?.requestPayload.requestedStatus).toBe(DiplomaticStatus.ALLIED);
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

  it('requests foreign repair help when a crucial building breaches threshold even below total damage ratio threshold', () => {
    const { galaxy, bot, botPlanet, botEnemy } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, botEnemy.playerId, DiplomaticStatus.ALLIED)
    );
    botPlanet.setBuildingLevel(BuildingType.METAL_MINE, 12);
    botPlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 12);
    botPlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 12);
    botPlanet.setBuildingLevel(BuildingType.METAL_STORAGE, 10);
    botPlanet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 10);
    botPlanet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 10);
    botPlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 24);
    botPlanet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 8);
    botPlanet.setBuildingLevel(BuildingType.FUSION_REACTOR, 4);
    botPlanet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
    botPlanet.setBuildingLevel(BuildingType.SHIPYARD, 0);
    applyBuildingDamagePercent(botPlanet, BuildingType.SOLAR_WIND_GEOTHERMAL, 70);
    markPlanetScanned(bot, botEnemy, botEnemy.planets[0]!, galaxy.currentTurn, { forcedReportLevel: 10 });

    const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
      enabledSubsystems: {
        economic: false,
        defensive: false,
        warfare: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: true,
        weightManager: false
      },
    });
    const botSnapshot = snapshot.planets.find((planet) => planet.name === botPlanet.basicInfo.name);
    expect(botSnapshot?.infrastructure.totalDamagePercent ?? 100).toBeLessThan(35);
    expect(botSnapshot?.infrastructure.emergencyRepairTriggered).toBe(true);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const supportRequest = result.result.proposals.find((proposal) =>
      proposal.kind === 'REQUEST_CREATION'
      && proposal.requestPayload.actionType === 'REQUEST_CREATION'
      && proposal.requestPayload.requestType === 'SUPPORT'
      && proposal.requestPayload.supportType === 'PLANET_REPAIR'
    );

    expect(supportRequest).toBeDefined();
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

  it('stops post-break raid pressure immediately once war status ends', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    const memory = createDefaultBotMemoryV2();
    memory.strategicDiplomatic.openedWarTargets.push(createOpenedWarTargetSeed(playerEnemyPlanet, playerEnemy.playerId));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const raidProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
    );

    expect(raidProposal).toBeUndefined();
    expect(result.memory.strategicDiplomatic.openedWarTargets).toHaveLength(0);
  });

  it('emits at most one post-break raid target per enemy per turn', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const secondEnemyPlanet = addPlanetToPlayer(galaxy, playerEnemy, 'Human-2 II', { x: 1, y: 0 }, 1);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 6);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    secondEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(18000, 12000, 8000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    markPlanetScanned(bot, playerEnemy, secondEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const raidProposals = result.result.proposals.filter((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
      && proposal.debug.targetPlayerId === playerEnemy.playerId
    );

    expect(raidProposals).toHaveLength(1);
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

  it('refreshes stale opened war targets with spy instead of blind raids', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 40);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 12 });
    galaxy.currentTurn = 12;

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const raidProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
    );
    const spyProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
      && proposal.requestPayload.target.x === playerEnemyPlanet.basicInfo.solarSystem.coordinates.x
      && proposal.requestPayload.target.y === playerEnemyPlanet.basicInfo.solarSystem.coordinates.y
      && proposal.requestPayload.target.z === playerEnemyPlanet.basicInfo.order
    );

    expect(raidProposal).toBeUndefined();
    expect(spyProposal).toBeDefined();
  });

  it('pauses post-break raids earlier when the current war advantage is strongly negative', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    const memory = createDefaultBotMemoryV2();
    const factionLedger = createFactionLedgerSeed(playerEnemy.playerId, 60, -2);
    factionLedger.lastWarEvaluationTurn = galaxy.currentTurn;
    memory.strategicDiplomatic.factionLedger.push(factionLedger);
    memory.strategicDiplomatic.openedWarTargets.push({
      ...createOpenedWarTargetSeed(playerEnemyPlanet, playerEnemy.playerId),
      currentAmbushRiskScore: 60
    });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const raidProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
    );
    const openedTarget = result.memory.strategicDiplomatic.openedWarTargets[0] ?? null;

    expect(raidProposal).toBeUndefined();
    expect(openedTarget?.currentAmbushRiskScore).toBeGreaterThanOrEqual(60);
    expect((openedTarget?.pausedUntilTurn ?? 0)).toBeGreaterThan(galaxy.currentTurn);
  });

  it('keeps post-break raids active at the same ambush risk when the war advantage is strongly positive', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 4);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 3);
    playerEnemyPlanet.rBDSFTQ.resources = new ResourcesPack(12000, 9000, 6000);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    const memory = createDefaultBotMemoryV2();
    const factionLedger = createFactionLedgerSeed(playerEnemy.playerId, 60, 2);
    factionLedger.lastWarEvaluationTurn = galaxy.currentTurn;
    memory.strategicDiplomatic.factionLedger.push(factionLedger);
    memory.strategicDiplomatic.openedWarTargets.push({
      ...createOpenedWarTargetSeed(playerEnemyPlanet, playerEnemy.playerId),
      currentAmbushRiskScore: 60
    });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const raidProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.attackKind === 'RAID'
    );
    const openedTarget = result.memory.strategicDiplomatic.openedWarTargets[0] ?? null;

    expect(raidProposal).toBeDefined();
    expect(openedTarget?.pausedUntilTurn ?? null).toBeNull();
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
    const memory = createDefaultBotMemoryV2();
    memory.strategicDiplomatic.factionLedger.push(createFactionLedgerSeed(playerEnemy.playerId, 40));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const bombardProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.BOMBARD
    );

    expect(bombardProposal).toBeDefined();
    expect(bombardProposal?.debug.missionType).toBe(FleetMissionType.BOMBARD);
  });

  it('does not emit bombardment below the hostility threshold even during war', () => {
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

    expect(bombardProposal).toBeUndefined();
  });

  it('falls back to bombard instead of siege until siege hostility threshold is reached', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.ORBITAL_BOMBER, 2);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    const memory = createDefaultBotMemoryV2();
    memory.strategicDiplomatic.factionLedger.push(createFactionLedgerSeed(playerEnemy.playerId, 40));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const bombardProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.BOMBARD
    );
    const siegeProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SIEGE
    );

    expect(bombardProposal).toBeDefined();
    expect(siegeProposal).toBeUndefined();
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
    const memory = createDefaultBotMemoryV2();
    memory.strategicDiplomatic.factionLedger.push(createFactionLedgerSeed(playerEnemy.playerId, 40));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
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

  it('lets successful bombardment pressure reopen neutral deescalation proposals during war', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'MINER';
    galaxy.currentTurn = 20;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 12 });
    addBombardmentReport(bot, playerEnemyPlanet, 18, FleetMissionType.BOMBARD, 9000);

    const memory = createDefaultBotMemoryV2();
    memory.strategicDiplomatic.factionLedger.push({
      playerId: playerEnemy.playerId,
      hostilityScore: 80,
      warAdvantageLevel: 0,
      lastSuccessfulBombardTurn: null,
      lastSuccessfulSiegeTickTurn: null,
      recentOutgoingCoercionPressure: 0,
      recentIncomingCoercionPressure: 0,
      lastWarEvaluationTurn: 0,
      shortWindowWarScore: 0,
      longWindowWarScore: 0,
      currentWarExitPressure: 0,
      lastComputedStanceScore: 0,
      lastComputedStrengthEstimate: 0,
      lastKnownStatus: DiplomaticStatus.WAR,
      lastSeenTurn: 0,
      nonAggressionUntilTurn: null,
      nonAggressionStartedTurn: null,
      nonAggressionReason: null
    });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const neutralProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.actionType === 'DIPLOMACY_PROPOSAL'
      && proposal.requestPayload.targetPlayerId === playerEnemy.playerId
      && proposal.requestPayload.requestedStatus === DiplomaticStatus.NEUTRAL
    );
    const ledgerEntry = result.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === playerEnemy.playerId
    );

    expect(neutralProposal).toBeDefined();
    expect((ledgerEntry?.currentWarExitPressure ?? 0)).toBeGreaterThan(0);
    expect(ledgerEntry?.lastSuccessfulBombardTurn).toBe(18);
  });

  it('stores negative war-window scores when war pressure turns against the bot empire', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    bot.botProfileId = 'BALANCED';
    galaxy.currentTurn = 20;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    addOwnedPlanet(galaxy, playerEnemy, 'DipEnemy2', { x: 1, y: 1 }, 1);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 12 });
    botPlanet.setCurrentBuildingStructuralPoints(
      BuildingType.METAL_MINE,
      Math.max(1, botPlanet.getMaxBuildingStructuralPoints(BuildingType.METAL_MINE) - 600)
    );
    addBattleReport(bot, botPlanet, 19);

    const memory = createDefaultBotMemoryV2();
    memory.strategicDiplomatic.factionLedger.push({
      playerId: playerEnemy.playerId,
      hostilityScore: 50,
      warAdvantageLevel: 0,
      lastSuccessfulBombardTurn: null,
      lastSuccessfulSiegeTickTurn: null,
      recentOutgoingCoercionPressure: 0,
      recentIncomingCoercionPressure: 0,
      lastWarEvaluationTurn: 0,
      shortWindowWarScore: 0,
      longWindowWarScore: 0,
      currentWarExitPressure: 0,
      lastComputedStanceScore: 0,
      lastComputedStrengthEstimate: 0,
      lastKnownStatus: DiplomaticStatus.WAR,
      lastSeenTurn: 0,
      nonAggressionUntilTurn: null,
      nonAggressionStartedTurn: null,
      nonAggressionReason: null
    });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot, memory);
    const ledgerEntry = result.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === playerEnemy.playerId
    );

    expect(ledgerEntry).toBeDefined();
    expect((ledgerEntry?.shortWindowWarScore ?? 0)).toBeLessThan(0);
    expect((ledgerEntry?.longWindowWarScore ?? 0)).toBeLessThan(0);
    expect(ledgerEntry?.lastWarEvaluationTurn).toBe(20);
  });

  it('stores positive war advantage when recent enemy ship losses clearly outweigh our own', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.currentTurn = 20;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 12 });
    addBattleReportWithLosses(bot, playerEnemyPlanet, galaxy.currentTurn, 'none', 'Battle Ship x10');

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const ledgerEntry = result.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === playerEnemy.playerId
    );

    expect((ledgerEntry?.warAdvantageLevel ?? 0)).toBeGreaterThan(0);
  });

  it('reduces hostility after meaningful successful plunder against a war target', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.currentTurn = 20;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, 0, { forcedReportLevel: 12 });

    const baselineMemory = createDefaultBotMemoryV2();
    baselineMemory.strategicDiplomatic.factionLedger.push(createFactionLedgerSeed(playerEnemy.playerId, 60));

    const baselineResult = runStrategicDiplomaticSubsystem(galaxy, bot, structuredClone(baselineMemory));
    addPlunderReport(bot, playerEnemyPlanet, galaxy.currentTurn, new ResourcesPack(700, 700, 700));
    const plunderResult = runStrategicDiplomaticSubsystem(galaxy, bot, baselineMemory);
    const baselineLedger = baselineResult.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === playerEnemy.playerId
    );
    const plunderLedger = plunderResult.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === playerEnemy.playerId
    );

    expect((plunderLedger?.hostilityScore ?? 999)).toBeLessThan(baselineLedger?.hostilityScore ?? 0);
  });

  it('weights allied-shared hostile activity stronger than peace-shared activity', () => {
    const alliedWorld = createStrategicDiplomaticWorld();
    const alliedContact = addForeignPlayer(alliedWorld.galaxy, 4, 'Ally-4', { x: 1, y: 1 }, 1);
    alliedWorld.galaxy.diplomaticRelations.push(
      createDiplomaticRelation(alliedWorld.bot.playerId, alliedContact.playerId, DiplomaticStatus.ALLIED)
    );
    markPlanetScanned(alliedWorld.bot, alliedWorld.playerEnemy, alliedWorld.playerEnemyPlanet, alliedWorld.galaxy.currentTurn, { forcedReportLevel: 12 });
    addDirectVictimBattleReport(alliedContact, alliedWorld.playerEnemy, alliedContact.planets[0]!, alliedWorld.galaxy.currentTurn, 6, 3);

    const alliedResult = runStrategicDiplomaticSubsystem(alliedWorld.galaxy, alliedWorld.bot);
    const alliedLedger = alliedResult.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === alliedWorld.playerEnemy.playerId
    );

    const peaceWorld = createStrategicDiplomaticWorld();
    const peaceContact = addForeignPlayer(peaceWorld.galaxy, 4, 'Peace-4', { x: 1, y: 1 }, 1);
    peaceWorld.galaxy.diplomaticRelations.push(
      createDiplomaticRelation(peaceWorld.bot.playerId, peaceContact.playerId, DiplomaticStatus.PEACE)
    );
    markPlanetScanned(peaceWorld.bot, peaceWorld.playerEnemy, peaceWorld.playerEnemyPlanet, peaceWorld.galaxy.currentTurn, { forcedReportLevel: 12 });
    addDirectVictimBattleReport(peaceContact, peaceWorld.playerEnemy, peaceContact.planets[0]!, peaceWorld.galaxy.currentTurn, 6, 3);

    const peaceResult = runStrategicDiplomaticSubsystem(peaceWorld.galaxy, peaceWorld.bot);
    const peaceLedger = peaceResult.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === peaceWorld.playerEnemy.playerId
    );

    expect(alliedLedger).toBeDefined();
    expect(peaceLedger).toBeDefined();
    expect((alliedLedger?.hostilityScore ?? 0)).toBeGreaterThan(0);
    expect((alliedLedger?.hostilityScore ?? 0)).toBeGreaterThan(peaceLedger?.hostilityScore ?? 0);
  });

  it('ignores shared hostile activity older than 40 turns', () => {
    const { galaxy, bot, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const alliedContact = addForeignPlayer(galaxy, 4, 'Ally-4', { x: 1, y: 1 }, 1);
    galaxy.currentTurn = 50;
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, alliedContact.playerId, DiplomaticStatus.ALLIED)
    );
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    addDirectVictimBattleReport(alliedContact, playerEnemy, alliedContact.planets[0]!, 9, 6, 3);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const ledger = result.memory.strategicDiplomatic.factionLedger.find((entry) =>
      entry.playerId === playerEnemy.playerId
    );

    expect((ledger?.hostilityScore ?? 0)).toBe(0);
  });

  it('uses allied-shared hostile activity to trigger support for an attacked allied planet', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const alliedContact = addForeignPlayer(galaxy, 4, 'Ally-4', { x: 1, y: 1 }, 1);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, alliedContact.playerId, DiplomaticStatus.ALLIED)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    botPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });
    markPlanetScanned(bot, alliedContact, alliedContact.planets[0]!, galaxy.currentTurn, { forcedReportLevel: 10 });
    addDirectVictimBattleReport(alliedContact, playerEnemy, alliedContact.planets[0]!, galaxy.currentTurn, 5, 2);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const supportProposal = result.result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.DEFEND
      && proposal.requestPayload.target.x === alliedContact.planets[0]!.basicInfo.solarSystem.coordinates.x
      && proposal.requestPayload.target.y === alliedContact.planets[0]!.basicInfo.solarSystem.coordinates.y
      && proposal.requestPayload.target.z === alliedContact.planets[0]!.basicInfo.order
    );

    expect(supportProposal).toBeDefined();
    expect(result.memory.strategicDiplomatic.sharedHostileEvents.some((entry) =>
      entry.sharedFromPlayerId === alliedContact.playerId
      && entry.attackerPlayerId === playerEnemy.playerId
    )).toBe(true);
  });

  it('emits one outgoing repair support request and can choose a stronger peace helper for non-offensive aid', () => {
    const { galaxy, bot, botPlanet } = createStrategicDiplomaticWorld();
    const alliedContact = addForeignPlayer(galaxy, 4, 'Ally-4', { x: 2, y: 0 }, 1);
    const peaceContact = addForeignPlayer(galaxy, 5, 'Peace-5', { x: 1, y: 0 }, 1);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, alliedContact.playerId, DiplomaticStatus.ALLIED),
      createDiplomaticRelation(bot.playerId, peaceContact.playerId, DiplomaticStatus.PEACE)
    );
    enableAdvancedWarProduction(peaceContact.planets[0]!, peaceContact);
    markPlanetScanned(bot, alliedContact, alliedContact.planets[0]!, galaxy.currentTurn, { forcedReportLevel: 10 });
    markPlanetScanned(bot, peaceContact, peaceContact.planets[0]!, galaxy.currentTurn, { forcedReportLevel: 12 });
    botPlanet.setBuildingLevel(BuildingType.METAL_MINE, 8);
    botPlanet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 8);
    botPlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 8);
    botPlanet.setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, 1);
    botPlanet.setCurrentBuildingStructuralPoints(BuildingType.CRYSTAL_MINE, 1);
    botPlanet.setCurrentBuildingStructuralPoints(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
    botPlanet.rBDSFTQ.ships.removeShipsByType([{ type: ShipType.REPAIR_DRONE, amount: 999 }]);

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const supportRequests = result.result.proposals.filter((proposal) =>
      proposal.kind === 'REQUEST_CREATION'
      && proposal.requestPayload.actionType === 'REQUEST_CREATION'
      && proposal.requestPayload.requestType === 'SUPPORT'
    );
    const repairRequest = supportRequests.find((proposal) =>
      proposal.requestPayload.supportType === 'PLANET_REPAIR'
    );

    expect(supportRequests.length).toBe(1);
    expect(repairRequest).toBeDefined();
    expect(repairRequest?.requestPayload.targetPlayerId).toBe(peaceContact.playerId);
  });

  it('emits partial incoming resource-support preference when visible surplus cannot fully cover the request', () => {
    const { galaxy, bot, botPlanet, botEnemy, botEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, botEnemy.playerId, DiplomaticStatus.ALLIED)
    );
    markPlanetScanned(bot, botEnemy, botEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 10 });
    botPlanet.rBDSFTQ.resources = new ResourcesPack(350, 260, 210);
    galaxy.supportRequests.push(createSupportRequest(
      1,
      botEnemy.playerId,
      bot.playerId,
      'RESOURCE_SUPPORT',
      botEnemyPlanet.basicInfo.name,
      {
        x: botEnemyPlanet.basicInfo.solarSystem.coordinates.x,
        y: botEnemyPlanet.basicInfo.solarSystem.coordinates.y,
        z: botEnemyPlanet.basicInfo.order
      },
      galaxy.currentTurn,
      galaxy.currentTurn + 5,
      new ResourcesPack(600, 500, 450)
    ));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const preferenceProposal = result.result.proposals.find((proposal) =>
      proposal.requestPayload.actionType === 'REQUEST_DECISION'
      && proposal.requestPayload.supportType === 'RESOURCE_SUPPORT'
    );

    expect(preferenceProposal).toBeDefined();
    expect(preferenceProposal?.requestPayload.decision).toBe('PARTIAL_APPROVE');
    expect(Number((preferenceProposal?.requestPayload.approvedResources as { metal: number }).metal ?? 0)).toBeGreaterThan(0);
  });

  it('emits an approval decision for allied Jump Gate requests with valid mission type', () => {
    const { galaxy, bot, botPlanet, botEnemy, botEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, botEnemy.playerId, DiplomaticStatus.ALLIED)
    );
    markPlanetScanned(bot, botEnemy, botEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 10 });
    galaxy.jumpGateRequests.push(createJumpGateRequest(
      1,
      77,
      botEnemy.playerId,
      bot.playerId,
      botEnemyPlanet.basicInfo.name,
      {
        x: botEnemyPlanet.basicInfo.solarSystem.coordinates.x,
        y: botEnemyPlanet.basicInfo.solarSystem.coordinates.y,
        z: botEnemyPlanet.basicInfo.order
      },
      botPlanet.basicInfo.name,
      {
        x: botPlanet.basicInfo.solarSystem.coordinates.x,
        y: botPlanet.basicInfo.solarSystem.coordinates.y,
        z: botPlanet.basicInfo.order
      },
      FleetMissionType.DEFEND,
      3,
      galaxy.currentTurn,
      galaxy.currentTurn + 1
    ));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const decisionProposal = result.result.proposals.find((proposal) =>
      proposal.requestPayload.actionType === 'REQUEST_DECISION'
      && proposal.requestPayload.requestType === 'JUMP_GATE'
    );

    expect(decisionProposal).toBeDefined();
    expect(decisionProposal?.kind).toBe('REQUEST_DECISION');
    expect(decisionProposal?.requestPayload.decision).toBe('APPROVE');
  });

  it('emits fuel-only partial maintenance approval for peace requests', () => {
    const { galaxy, bot, botPlanet, botEnemy, botEnemyPlanet } = createStrategicDiplomaticWorld();
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, botEnemy.playerId, DiplomaticStatus.PEACE)
    );
    markPlanetScanned(bot, botEnemy, botEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 10 });
    botPlanet.rBDSFTQ.resources = new ResourcesPack(500, 500, 500);
    galaxy.maintenanceRequests.push(createMaintenanceRequest(
      1,
      78,
      botEnemy.playerId,
      bot.playerId,
      botPlanet.basicInfo.name,
      {
        x: botPlanet.basicInfo.solarSystem.coordinates.x,
        y: botPlanet.basicInfo.solarSystem.coordinates.y,
        z: botPlanet.basicInfo.order
      },
      galaxy.currentTurn,
      galaxy.currentTurn + 1,
      {
        fuel: 300,
        ships: [{ type: ShipType.TRANSPORTER, amount: 1 }],
        bombs: [{ type: DefenceType.SMALL_BOMB, amount: 1 }]
      }
    ));

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const decisionProposal = result.result.proposals.find((proposal) =>
      proposal.requestPayload.actionType === 'REQUEST_DECISION'
      && proposal.requestPayload.requestType === 'MAINTENANCE'
    );
    const approval = decisionProposal?.requestPayload.maintenanceApproval as {
      fuel: number;
      ships: unknown[];
      bombs: unknown[];
    } | null | undefined;

    expect(decisionProposal).toBeDefined();
    expect(decisionProposal?.requestPayload.decision).toBe('PARTIAL_APPROVE');
    expect(approval?.fuel).toBeGreaterThan(0);
    expect(approval?.ships).toEqual([]);
    expect(approval?.bombs).toEqual([]);
  });

  it('emits outgoing allied offensive support request for a blocked war attack on a still-breakable target', () => {
    const { galaxy, bot, botPlanet, playerEnemy, playerEnemyPlanet } = createStrategicDiplomaticWorld();
    const alliedContact = addForeignPlayer(galaxy, 4, 'Ally-4', { x: 1, y: 0 }, 1);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, alliedContact.playerId, DiplomaticStatus.ALLIED),
      createDiplomaticRelation(bot.playerId, playerEnemy.playerId, DiplomaticStatus.WAR)
    );
    enableAdvancedWarProduction(botPlanet, bot);
    markPlanetScanned(bot, alliedContact, alliedContact.planets[0]!, galaxy.currentTurn, { forcedReportLevel: 10 });
    enableAdvancedWarProduction(alliedContact.planets[0]!, alliedContact);
    botPlanet.rBDSFTQ.ships.removeShipsByType([
      { type: ShipType.CRUISER, amount: 999 },
      { type: ShipType.FIGHTER, amount: 999 },
      { type: ShipType.FRIGATE, amount: 999 },
      { type: ShipType.BATTLE_SHIP, amount: 999 }
    ]);
    playerEnemyPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 2);
    playerEnemyPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 1);
    markPlanetScanned(bot, playerEnemy, playerEnemyPlanet, galaxy.currentTurn, { forcedReportLevel: 12 });

    const result = runStrategicDiplomaticSubsystem(galaxy, bot);
    const offensiveRequest = result.result.proposals.find((proposal) =>
      proposal.kind === 'REQUEST_CREATION'
      && proposal.requestPayload.actionType === 'REQUEST_CREATION'
      && proposal.requestPayload.requestType === 'SUPPORT'
      && (
        proposal.requestPayload.supportType === 'ATTACK_TARGET'
        || proposal.requestPayload.supportType === 'BOMBARD_TARGET'
        || proposal.requestPayload.supportType === 'SIEGE_TARGET'
      )
    );

    expect(offensiveRequest).toBeDefined();
    expect(offensiveRequest?.requestPayload.targetPlayerId).toBe(alliedContact.playerId);
    expect((offensiveRequest?.requestPayload.minimumShips as Array<{ amount: number }>).length).toBeGreaterThan(0);
  });
});

function runStrategicDiplomaticSubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory = createDefaultBotMemoryV2()
): { result: ReturnType<BotStrategicDiplomaticSubsystem['generate']>; memory: ReturnType<typeof createDefaultBotMemoryV2> } {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: false,
      strategicDevelopment: false,
      strategicMilitary: false,
      strategicDiplomatic: true,
      weightManager: false
    },
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

function addBattleReportWithLosses(
  bot: Player,
  planet: Planet,
  createdTurn: number,
  ownShipLosses: string,
  enemyShipLosses: string
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
      `Own ship losses by type: ${ownShipLosses}`,
      'Own defense losses by type: none',
      `Enemy ship losses by type: ${enemyShipLosses}`,
      'Enemy defense losses by type: none',
      'Enemy survivors by type: none',
      'Enemy defense survivors by type: none'
    ].join('\n')
  ));
}

function addBombardmentReport(
  bot: Player,
  targetPlanet: Planet,
  createdTurn: number,
  missionType: FleetMissionType.BOMBARD | FleetMissionType.SIEGE,
  totalStructuralDamage: number
): void {
  bot.addReport(new BuildingsReport(
    {
      reportId: bot.createReportId(),
      createdTurn,
      title: `Bombardment Report: ${missionType} at ${targetPlanet.basicInfo.name}`,
      sourceCoordinates: {
        x: targetPlanet.basicInfo.solarSystem.coordinates.x,
        y: targetPlanet.basicInfo.solarSystem.coordinates.y,
        z: targetPlanet.basicInfo.order
      },
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: bot.playerName
    },
    [
      `Bombardment mission: ${missionType}`,
      `Target: ${targetPlanet.basicInfo.name}`,
      'Shots: 4',
      'Hits: 3',
      `Total structural damage: ${totalStructuralDamage}`,
      'Planetary bombs launched: 0',
      'Planetary bombs activated: 0',
      'Planetary bombs intercepted: 0',
      'Planetary bombs lost: 0',
      'Priorities: random',
      'Buildings engaged: 1',
      'Defences engaged: 0',
      'Building damage summary:',
      `${BuildingType.METAL_MINE}: hits 3, damage ${totalStructuralDamage}`,
      'Defence damage summary:',
      'No lasting defence damage recorded.'
    ].join('\n')
  ));
}

function addPlunderReport(
  bot: Player,
  targetPlanet: Planet,
  createdTurn: number,
  stolenResources: ResourcesPack
): void {
  bot.addReport(new FleetReport(
    {
      reportId: bot.createReportId(),
      createdTurn,
      title: `Plunder Report: ${targetPlanet.basicInfo.name}`,
      sourceCoordinates: {
        x: targetPlanet.basicInfo.solarSystem.coordinates.x,
        y: targetPlanet.basicInfo.solarSystem.coordinates.y,
        z: targetPlanet.basicInfo.order
      },
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name
    },
    [
      `Attack mission reached ${targetPlanet.basicInfo.name}.`,
      `Resources stolen: Metal ${stolenResources.metal}, Crystal ${stolenResources.crystal}, Deuterium ${stolenResources.deuterium}.`
    ].join('\n')
  ));
}

function addDirectVictimBattleReport(
  victim: Player,
  attacker: Player,
  targetPlanet: Planet,
  createdTurn: number,
  ownShipsLost: number,
  ownDefencesLost: number
): void {
  victim.addReport(new FleetReport(
    {
      reportId: victim.createReportId(),
      createdTurn,
      title: `Battle Report: ${targetPlanet.basicInfo.solarSystem.coordinates.x}:${targetPlanet.basicInfo.solarSystem.coordinates.y}:${targetPlanet.basicInfo.order}`,
      sourceCoordinates: {
        x: targetPlanet.basicInfo.solarSystem.coordinates.x,
        y: targetPlanet.basicInfo.solarSystem.coordinates.y,
        z: targetPlanet.basicInfo.order
      },
      sourcePlanetName: targetPlanet.basicInfo.name,
      sourceSystemName: targetPlanet.basicInfo.solarSystem.name,
      senderPlayerName: attacker.playerName
    },
    [
      'Battle result: Attacker',
      `Perspective: ${victim.playerName}`,
      `Own ships (${victim.playerName}): 0/0 survived, ${ownShipsLost} lost.`,
      `Own defenses (${victim.playerName}): 0/0 survived, ${ownDefencesLost} lost.`,
      'Enemy ships (Enemy): 2/2 survived, 0 lost.',
      'Enemy defenses (Enemy): 0/0 survived, 0 lost.',
      'Own ship losses by type: FIGHTER x1',
      'Own defense losses by type: SAM_SITE x1',
      'Enemy ship losses by type: none',
      'Enemy defense losses by type: none',
      'Own survivors by type: none',
      'Own defense survivors by type: none',
      'Enemy survivors by type: CRUISER x2',
      'Enemy defense survivors by type: none'
    ].join('\n')
  ));
}

function createFactionLedgerSeed(
  playerId: number,
  hostilityScore: number,
  warAdvantageLevel: -2 | -1 | 0 | 1 | 2 = 0
) {
  return {
    playerId,
    hostilityScore,
    warAdvantageLevel,
    lastSuccessfulBombardTurn: null,
    lastSuccessfulSiegeTickTurn: null,
    recentOutgoingCoercionPressure: 0,
    recentIncomingCoercionPressure: 0,
    lastWarEvaluationTurn: 0,
    shortWindowWarScore: 0,
    longWindowWarScore: 0,
    currentWarExitPressure: 0,
    lastComputedStanceScore: 0,
    lastComputedStrengthEstimate: 0,
    lastKnownStatus: DiplomaticStatus.WAR,
    lastSeenTurn: 0,
    nonAggressionUntilTurn: null,
    nonAggressionStartedTurn: null,
    nonAggressionReason: null
  };
}

function createOpenedWarTargetSeed(planet: Planet, targetPlayerId: number) {
  return {
    targetPlayerId,
    coordinates: {
      x: planet.basicInfo.solarSystem.coordinates.x,
      y: planet.basicInfo.solarSystem.coordinates.y,
      z: planet.basicInfo.order
    },
    lastPostBreakAttackTurn: null,
    recentRaidCount: 0,
    recentRaidTurns: [],
    currentAmbushRiskScore: 0,
    pausedUntilTurn: null,
    preferredRaidOriginCoordinates: null,
    lastEstimatedPlunderValue: 0
  };
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

function applyBuildingDamagePercent(planet: Planet, buildingType: BuildingType, remainingPercent: number): void {
  const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(buildingType);
  planet.setCurrentBuildingStructuralPoints(
    buildingType,
    Math.floor(maxStructuralPoints * Math.max(0, Math.min(100, remainingPercent)) / 100)
  );
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

function addForeignPlayer(
  galaxy: Galaxy,
  playerId: number,
  playerName: string,
  coordinates: { x: number; y: number },
  order: number
): Player {
  const system = new SolarSystem(`${playerName}-System`, order + 4, false, false, coordinates, new Set(), new Map());
  const planet = Planet.createStartingPlanet(`${playerName} I`, 1, system, 1);
  system.planets[0] = planet;
  const player = new Player(playerId, playerName, [planet], new Map(), [], PlayerType.PLAYER, createTutorialReadState(true));
  planet.info.ownerId = player.playerId;
  configureKnownPlanet(planet);
  setBasicShipTech(player);
  galaxy.players.push(player);
  galaxy.playerNameMap.set(player.playerName, player.playerId);
  galaxy.humanPlayerMap.set(player.playerId, player);
  galaxy.stars[coordinates.y] ??= [];
  galaxy.stars[coordinates.y]?.push(system);
  return player;
}

function addPlanetToPlayer(
  galaxy: Galaxy,
  player: Player,
  planetName: string,
  coordinates: { x: number; y: number },
  order: number
): Planet {
  const system = new SolarSystem(`${planetName}-System`, order + 10, false, false, coordinates, new Set(), new Map());
  const planet = Planet.createStartingPlanet(planetName, 1, system, 1);
  system.planets[0] = planet;
  planet.info.ownerId = player.playerId;
  configureKnownPlanet(planet);
  player.planets.push(planet);
  galaxy.stars[coordinates.y] ??= [];
  galaxy.stars[coordinates.y]?.push(system);
  return planet;
}
