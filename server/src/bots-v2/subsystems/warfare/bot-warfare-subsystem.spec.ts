import { describe, expect, it } from 'vitest';
import { BuildingQueueEntry } from '../../../../../src/app/models/buildings/building-queue-entry.js';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { createDiplomaticRelation } from '../../../../../src/app/models/diplomacy/diplomatic-relation.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { EspionageReportGenerator } from '../../../../../src/app/generators/espionage-report-generator.js';
import { ManyShips } from '../../../../../src/app/models/fleets/many-ships.js';
import { ShipyardQueueEntry } from '../../../../../src/app/models/fleets/shipyard-queue-entry.js';
import { FleetReport } from '../../../../../src/app/models/reports/fleet-report.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { TechnologyQueueEntry } from '../../../../../src/app/models/tech/technology-queue-entry.js';
import { Player } from '../../../../../src/app/models/player.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { BotProposal } from '../../bot-v2-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotWarfareSubsystem } from './bot-warfare-subsystem.js';

describe('BotWarfareSubsystem', () => {
  it('emits a structural unlock research request when fighter tech is missing', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);

    const result = runWarfareSubsystem(galaxy, bot);
    const fighterGoal = result.goals?.find((goal) =>
      goal.goalFamily === 'UNLOCK'
      && goal.finalShipType === ShipType.FIGHTER
    );

    expect(result.planetResults?.[0]?.branch).toBe('UNLOCK');
    expect(fighterGoal).toBeDefined();
    expect(result.proposals[0]?.kind).toBe('RESEARCH');
    expect(result.proposals[0]?.debug?.goalFamily).toBe('UNLOCK');
    expect([
      ShipType.FIGHTER,
      ShipType.ASSAULT_FIGHTER
    ]).toContain(result.proposals[0]?.debug?.finalShipType as ShipType);
  });

  it('does not emit actual ship production on immature planets', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 5);
    setBaselineShipTech(bot, 5);

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) => proposal.kind === 'SHIPYARD')).toBe(false);
  });

  it('emits a shipyard capacity request when shipyard is below avg-industry target', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    setBaselineShipTech(bot, 2);

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'CAPACITY'
      && goal.finalBuildingType === BuildingType.SHIPYARD
    )).toBe(true);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'BUILDING'
      && (proposal.requestPayload as { buildingType?: BuildingType }).buildingType === BuildingType.SHIPYARD
    )).toBe(true);
  });

  it('prefers cruiser unlock pressure once avgIndustry rises above 3.8 and cruiser is not unlocked yet', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 2);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
    bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 1);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 1);
    bot.setTechLevel(TechnologyType.RAILGUNS_WEAPONS, 1);

    const result = runWarfareSubsystem(galaxy, bot);
    const cruiserUnlockGoal = result.goals?.find((goal) =>
      goal.goalFamily === 'UNLOCK'
      && goal.finalShipType === ShipType.CRUISER
    );

    expect(cruiserUnlockGoal).toBeDefined();
    expect(cruiserUnlockGoal?.debug.bonusFactor).toBeGreaterThan(1);
  });

  it('shifts follow-through pressure toward battle ships once a cruiser break fleet already exists', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 6);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 7);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 4);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);
    setBaselineShipTech(bot, 5);
    bot.setTechLevel(TechnologyType.FUSION_DRIVE, 3);
    bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 2);
    bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 3);
    bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
    bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, 2);
    addInstalledShips(planet, {
      [ShipType.CRUISER]: 8
    });

    const result = runWarfareSubsystem(galaxy, bot);
    const battleShipGoal = result.goals?.find((goal) =>
      goal.goalFamily === 'PRODUCTION'
      && goal.finalShipType === ShipType.BATTLE_SHIP
    );

    expect(battleShipGoal).toBeDefined();
    expect(battleShipGoal?.debug.bonusFactor).toBeGreaterThan(1);
    expect(result.goals?.find((goal) =>
      goal.goalFamily === 'PRODUCTION'
      && goal.finalShipType === ShipType.FIGHTER
    )?.debug.postCruiserSmallShipPenaltyMultiplier).toBeGreaterThan(1);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { shipType?: ShipType }).shipType === ShipType.BATTLE_SHIP
    )).toBe(true);
  });

  it('reserves capped cargo production requests when cargo ships are unlocked', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 5);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 2);
    setBaselineShipTech(bot, 4);
    bot.setTechLevel(TechnologyType.RAILGUNS_WEAPONS, 2);
    addInstalledShips(planet, {
      [ShipType.FIGHTER]: 20,
      [ShipType.ASSAULT_FIGHTER]: 10,
      [ShipType.CORVETTE]: 8,
      [ShipType.CRUISER]: 4,
      [ShipType.TRANSPORTER]: 2
    });

    const result = runWarfareSubsystem(galaxy, bot);
    const cargoProposals = result.proposals.filter((proposal) => {
      const shipType = (proposal.requestPayload as { shipType?: ShipType }).shipType;
      return shipType === ShipType.TRANSPORTER
        || shipType === ShipType.MASS_HAULER
        || shipType === ShipType.CARGO_SUPPORT;
    });
    const productionProposals = result.proposals.filter((proposal) => proposal.kind === 'SHIPYARD');

    expect(result.goals?.length).toBeGreaterThanOrEqual(5);
    expect(result.proposals.length).toBeGreaterThan(5);
    expect(result.proposals.length).toBeLessThanOrEqual(12);
    expect(productionProposals.length).toBeGreaterThanOrEqual(3);
    expect(cargoProposals.length).toBeGreaterThan(0);
    expect(cargoProposals.length).toBeLessThanOrEqual(2);
  });

  it('does not emit transporter production only because one transporter is installed when build prerequisites are missing', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
    addInstalledShips(planet, {
      [ShipType.TRANSPORTER]: 1
    });
    bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 1);
    bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 1);

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { shipType?: ShipType }).shipType === ShipType.TRANSPORTER
    )).toBe(false);
    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'UNLOCK'
      && goal.finalShipType === ShipType.TRANSPORTER
    )).toBe(true);
  });

  it('suppresses transporter production when local transporter count already exceeds the soft cap', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 7);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 7);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 7);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 6);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 8);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 6);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 6);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 2);
    setBaselineShipTech(bot, 5);
    addInstalledShips(planet, {
      [ShipType.TRANSPORTER]: 40,
      [ShipType.CRUISER]: 4,
      [ShipType.BATTLE_SHIP]: 2
    });

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { shipType?: ShipType }).shipType === ShipType.TRANSPORTER
    )).toBe(false);
  });

  it('emits a first-class no-action planet result when local queues block all requests', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    setBaselineShipTech(bot, 3);
    planet.rBDSFTQ.buildingQueue = Array.from({ length: 10 }, (_, index) => new BuildingQueueEntry(
      BuildingType.SHIPYARD,
      planet.getBuildingLevel(BuildingType.SHIPYARD) + index + 1,
      0
    ));
    planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
      TechnologyType.FUSION_DRIVE,
      1,
      0,
      []
    );
    planet.rBDSFTQ.shipyardQueue = Array.from({ length: 10 }, () => ShipyardQueueEntry.ship(
      ShipType.FIGHTER,
      1,
      0
    ));

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals).toHaveLength(0);
    expect(result.planetResults?.[0]?.emittedRequestCount).toBe(0);
    expect(result.planetResults?.[0]?.noActionReason).not.toBeNull();
  });

  it('emits a recycle mission for valuable debris on an owned planet', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.rBDSFTQ.ships.addUndamaged(ShipType.RECYCLER, 2);
    planet.rBDSFTQ.spaceDebris = new ResourcesPack(900, 400, 200);

    const result = runWarfareSubsystem(galaxy, bot);
    const recycleProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.RECYCLE
    );
    const recyclePayload = recycleProposal ? getFleetMissionPayload(recycleProposal) : null;

    expect(recycleProposal).toBeDefined();
    expect(recycleProposal?.debug.branch).toBe('RECOVERY');
    expect(recyclePayload?.origin).toEqual({ x: 0, y: 0, z: 1 });
    expect(recyclePayload?.target).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('emits escorted recycle missions for neutral foreign debris with fresh intel', () => {
    const { galaxy, bot, homePlanet, foreignPlayer, foreignPlanet } = createRecoveryWorld();
    configureBaseWarfarePlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.RECYCLER, 10);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    foreignPlanet.rBDSFTQ.spaceDebris = new ResourcesPack(6000, 4000, 2000);
    markPlanetScanned(bot, foreignPlayer, foreignPlanet, galaxy.currentTurn);

    const result = runWarfareSubsystem(galaxy, bot);
    const recycleProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.RECYCLE
      && proposal.targetCoordinates?.z === foreignPlanet.basicInfo.order
    );
    const recyclePayload = recycleProposal ? getFleetMissionPayload(recycleProposal) : null;

    expect(recycleProposal).toBeDefined();
    expect(recycleProposal?.debug.recycleScope).toBe('NEUTRAL_FOREIGN');
    expect(recyclePayload?.ships.some((entry) => entry.type === ShipType.RECYCLER)).toBe(true);
    expect(recyclePayload?.ships.some((entry) => entry.type === ShipType.CRUISER)).toBe(true);
  });

  it('does not recycle foreign debris that is only visible in live planet state', () => {
    const { galaxy, bot, homePlanet, foreignPlayer, foreignPlanet } = createRecoveryWorld();
    configureBaseWarfarePlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.RECYCLER, 10);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    markPlanetScanned(bot, foreignPlayer, foreignPlanet, galaxy.currentTurn);
    foreignPlanet.rBDSFTQ.spaceDebris = new ResourcesPack(6000, 4000, 2000);

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.RECYCLE
      && proposal.targetCoordinates?.z === foreignPlanet.basicInfo.order
    )).toBe(false);
  });

  it('uses newer battle report debris over older espionage debris for foreign recycle', () => {
    const { galaxy, bot, homePlanet, foreignPlayer, foreignPlanet } = createRecoveryWorld();
    configureBaseWarfarePlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.RECYCLER, 10);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 1);
    markPlanetScanned(bot, foreignPlayer, foreignPlanet, galaxy.currentTurn - 2);
    addBattleDebrisReport(bot, foreignPlayer, foreignPlanet, galaxy.currentTurn - 1, {
      metal: 6000,
      crystal: 4000,
      deuterium: 2000
    });

    const result = runWarfareSubsystem(galaxy, bot);
    const recycleProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.RECYCLE
      && proposal.targetCoordinates?.z === foreignPlanet.basicInfo.order
    );

    expect(recycleProposal).toBeDefined();
    expect(recycleProposal?.debug.recycleScope).toBe('NEUTRAL_FOREIGN');
    expect(recycleProposal?.debug.debrisValue).toBeGreaterThan(0);
  });

  it('emits recycler ship-need pressure when debris is valuable and no recyclers exist', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.rBDSFTQ.spaceDebris = new ResourcesPack(900, 400, 200);

    const result = runWarfareSubsystem(galaxy, bot);
    const shipNeedProposal = result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
      && proposal.requestPayload.shipType === ShipType.RECYCLER
    );

    expect(shipNeedProposal).toBeDefined();
    expect(shipNeedProposal?.debug.queueType).toBe('SHIP_NEED');
    expect(shipNeedProposal?.debug.goalFamily).toBe('RECOVERY');
  });

  it('does not emit new recycle missions when two recycle slots are already occupied', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.rBDSFTQ.ships.addUndamaged(ShipType.RECYCLER, 2);
    planet.rBDSFTQ.spaceDebris = new ResourcesPack(900, 400, 200);
    const memory = createDefaultBotMemoryV2();
    memory.supervisor.pendingCommitments.push({
      commitmentKey: 'warfare:recycle:1',
      dedupeKey: 'warfare:recycle:1',
      proposalId: 'warfare:recycle:1',
      subsystemId: 'WARFARE',
      kind: 'FLEET_MISSION',
      targetCoordinates: { x: 0, y: 0, z: 1 },
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      weightedResourceValue: 0,
      budgetScope: 'PLANETARY',
      budgetPlanetKey: '0:0:1',
      budgetIntentSubsystemId: 'WARFARE',
      score: 1,
      status: 'PENDING_SHIPS_NEXT_TURN',
      createdTurn: galaxy.currentTurn,
      updatedTurn: galaxy.currentTurn,
      expiresOnTurn: galaxy.currentTurn + 1,
      executionPayload: { missionType: FleetMissionType.RECYCLE },
      cancelReason: null
    });
    memory.supervisor.pendingCommitments.push({
      commitmentKey: 'warfare:recycle:2',
      dedupeKey: 'warfare:recycle:2',
      proposalId: 'warfare:recycle:2',
      subsystemId: 'WARFARE',
      kind: 'FLEET_MISSION',
      targetCoordinates: { x: 0, y: 0, z: 1 },
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      weightedResourceValue: 0,
      budgetScope: 'PLANETARY',
      budgetPlanetKey: '0:0:1',
      budgetIntentSubsystemId: 'WARFARE',
      score: 1,
      status: 'PENDING_SHIPS_NEXT_TURN',
      createdTurn: galaxy.currentTurn,
      updatedTurn: galaxy.currentTurn,
      expiresOnTurn: galaxy.currentTurn + 1,
      executionPayload: { missionType: FleetMissionType.RECYCLE },
      cancelReason: null
    });

    const result = runWarfareSubsystem(galaxy, bot, memory);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.RECYCLE
    )).toBe(false);
  });

  it('penalizes additional small-ship production when local small-ship capacity already exceeds the target', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 6);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 7);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 6);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 2);
    setBaselineShipTech(bot, 5);
    addInstalledShips(planet, {
      [ShipType.FIGHTER]: 20,
      [ShipType.ASSAULT_FIGHTER]: 20,
      [ShipType.CORVETTE]: 10,
      [ShipType.CRUISER]: 1
    });

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { shipType?: ShipType }).shipType === ShipType.BATTLE_SHIP
    )).toBe(true);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && ((proposal.debug.smallShipPenaltyMultiplier as number | undefined) ?? 1) > 1
    )).toBe(true);
  });

  it('keeps small-ship production eligible when local hangar capacity still exceeds current small-ship capacity', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 6);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 7);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 6);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 2);
    setBaselineShipTech(bot, 5);
    addInstalledShips(planet, {
      [ShipType.CARRIER]: 2,
      [ShipType.FLEET_CARRIER]: 1,
      [ShipType.FIGHTER]: 2
    });

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'SHIPYARD'
      && (proposal.requestPayload as { shipType?: ShipType }).shipType === ShipType.FIGHTER
    )).toBe(true);
  });
});

function runWarfareSubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory = createDefaultBotMemoryV2()
) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: true,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      },
  });

  return new BotWarfareSubsystem().generate({
    snapshot,
    memory
  });
}

function getFleetMissionPayload(proposal: BotProposal): {
  origin: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
  ships: Array<{ type: ShipType; amount: number }>;
} {
  return proposal.requestPayload as {
    origin: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    ships: Array<{ type: ShipType; amount: number }>;
  };
}

function createBotWorld() {
  const system = new SolarSystem('BotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const planet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  system.planets[0] = planet;

  const bot = new Player(
    1,
    'Bot-1',
    [planet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const galaxy = new Galaxy(
    'Bot Test',
    [bot],
    [[system]],
    1,
    [],
    1,
    new Map(),
    new Map([[1, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, planet };
}

function createRecoveryWorld() {
  const system = new SolarSystem('RecoverySys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('RecoverySys I', 1, system, 1);
  const foreignPlanet = Planet.createStartingPlanet('RecoverySys II', 2, system, 1);
  system.planets[0] = homePlanet;
  system.planets[1] = foreignPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [homePlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const foreignPlayer = new Player(
    2,
    'Foreign-2',
    [foreignPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  foreignPlanet.info.ownerId = foreignPlayer.playerId;

  const galaxy = new Galaxy(
    'Recovery Test',
    [bot, foreignPlayer],
    [[system]],
    12,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot], [foreignPlayer.playerId, foreignPlayer]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId], [foreignPlayer.playerName, foreignPlayer.playerId]]),
    [createDiplomaticRelation(bot.playerId, foreignPlayer.playerId, DiplomaticStatus.NEUTRAL)]
  );

  return { galaxy, bot, homePlanet, foreignPlayer, foreignPlanet };
}

function configureBaseWarfarePlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 0);
  planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 0);
  planet.rBDSFTQ.resources = new ResourcesPack(10000, 10000, 10000);
  planet.rBDSFTQ.ships = ManyShips.empty();
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
}

function setBaselineShipTech(bot: Player, tier: number): void {
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, Math.max(1, tier));
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 1);
}

function addInstalledShips(
  planet: Planet,
  counts: Partial<Record<ShipType, number>>
): void {
  const ships = ManyShips.empty();
  for (const [shipType, amount] of Object.entries(counts) as Array<[ShipType, number]>) {
    ships.addUndamaged(shipType, amount);
  }

  planet.rBDSFTQ.ships = ships;
}

function markPlanetScanned(
  bot: Player,
  owner: Player,
  planet: Planet,
  createdTurn: number
): void {
  const report = new EspionageReportGenerator().createEspionageReport(bot, owner, planet, 5, {
    createdTurn,
    forcedReportLevel: 12
  });
  planet.lastReportData.set(bot.playerId, report);
}

function addBattleDebrisReport(
  bot: Player,
  owner: Player,
  planet: Planet,
  createdTurn: number,
  debris: { metal: number; crystal: number; deuterium: number }
): void {
  bot.addReport(new FleetReport(
    {
      reportId: 10000 + createdTurn,
      createdTurn,
      title: `Battle Report: ${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`,
      sourceCoordinates: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order
      },
      sourcePlanetName: planet.basicInfo.name,
      sourceSystemName: planet.basicInfo.solarSystem.name,
      senderPlayerName: owner.playerName
    },
    [
      'Battle result: Attacker',
      'Enemy survivors by type: none',
      'Enemy defense survivors by type: none',
      'Own survivors by type: Cruiser x1',
      'Own ship losses by type: none',
      `Current debris field: Metal ${debris.metal}, Crystal ${debris.crystal}, Deuterium ${debris.deuterium}`
    ].join('\n')
  ));
}
