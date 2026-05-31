import { describe, expect, it, vi } from 'vitest';
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
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { Player } from '../../../../../src/app/models/player.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { TechnologyQueueEntry } from '../../../../../src/app/models/tech/technology-queue-entry.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import type { BotProposal, BotStrategicDevelopmentPlanetResult } from '../../bot-v2-types.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotStrategicDevelopmentSubsystem } from './bot-strategic-development-subsystem.js';

describe('BotStrategicDevelopmentSubsystem', () => {
  it('emits separate building and production requests for the same planet', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseStrategicDevelopmentPlanet(planet);
    planet.info.planetaryParameters.metalModifier = 1.5;
    planet.info.planetaryParameters.crystalModifier = 0.7;
    planet.info.planetaryParameters.deuteriumModifier = 0.8;
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 1);
    setSupportShipTech(bot);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const planetResult = result.planetResults?.find(
      (entry): entry is BotStrategicDevelopmentPlanetResult => entry.subsystemId === 'STRATEGIC_DEVELOPMENT'
    );

    expect(result.proposals.some((proposal) => proposal.debug.queueType === 'BUILDING')).toBe(true);
    expect(result.proposals.some((proposal) => proposal.debug.queueType === 'PRODUCTION')).toBe(true);
    expect(planetResult?.emittedBuildingRequestCount).toBeGreaterThan(0);
    expect(planetResult?.emittedProductionRequestCount).toBeGreaterThan(0);
    expect(planetResult?.buildingGoalKeys.length).toBeGreaterThan(0);
    expect(planetResult?.productionGoalKeys.length).toBeGreaterThan(0);
  });

  it('can emit a research request for a sensor phalanx building goal', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseStrategicDevelopmentPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 6);
    planet.setBuildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT, 4);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const phalanxGoal = result.goals?.find((goal) => goal.finalBuildingType === BuildingType.SENSOR_PHALANX);

    expect(phalanxGoal).toBeDefined();
    expect(phalanxGoal?.blockers).toHaveLength(0);
    expect(result.proposals.some((proposal) => proposal.kind === 'RESEARCH')).toBe(true);
  });

  it('does not consider colonizer production when already at colony cap', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseStrategicDevelopmentPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    setSupportShipTech(bot);
    bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 0);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) => goal.finalShipType === ShipType.COLONIZER)).toBe(false);
  });

  it('allows baseline repair-drone production on a one-planet empire when unlocked', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseStrategicDevelopmentPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 2);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 2);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 2);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 2);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 2);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 2);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 2);
    bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 3);
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'PRODUCTION'
      && goal.finalShipType === ShipType.REPAIR_DRONE
    )).toBe(true);
  });

  it('emits an armament-delivery mission for repair support from a developed planet', () => {
    const { galaxy, bot, sourcePlanet, targetPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    configureLowIndustrySupportTarget(targetPlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 2);
    targetPlanet.setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, 1);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const missionProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
    );

    expect(missionProposal).toBeDefined();
    expect(missionProposal?.requestPayload.origin).toEqual({ x: 0, y: 0, z: 1 });
    expect(missionProposal?.requestPayload.target).toEqual({ x: 0, y: 0, z: 2 });
  });

  it('does not emit strategic-development logistics missions for a one-planet empire', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureDevelopedSupportSource(planet);
    setSupportShipTech(bot);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && (
        proposal.requestPayload.missionType === FleetMissionType.TRANSPORT
        || proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
      )
    )).toBe(false);
  });

  it('emits resource concentration transport from surplus planets for blocked research', () => {
    const { galaxy, bot, sourcePlanet, targetPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    configureLowIndustrySupportTarget(targetPlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.resources = new ResourcesPack(250000, 200000, 180000);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 100);
    targetPlanet.rBDSFTQ.resources = new ResourcesPack(100, 100, 100);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot, [{
      proposalId: 'research:concentration:test',
      subsystemId: 'RESEARCH',
      kind: 'NO_OP',
      status: 'PROPOSED',
      goalKey: `research:${TechnologyType.ASTROPHYSICS_TECHNOLOGY}:6`,
      dedupeKey: `research:concentration:${TechnologyType.ASTROPHYSICS_TECHNOLOGY}`,
      summary: 'Research concentration marker.',
      planetId: null,
      targetCoordinates: {
        x: targetPlanet.basicInfo.solarSystem.coordinates.x,
        y: targetPlanet.basicInfo.solarSystem.coordinates.y,
        z: targetPlanet.basicInfo.order
      },
      expectedValue: 1,
      urgency: 1,
      risk: 1,
      confidence: 1,
      requestedResources: { metal: 10000, crystal: 8000, deuterium: 5000 },
      requestPayload: {
        concentrationSignal: true,
        targetKind: 'RESEARCH',
        x: targetPlanet.basicInfo.solarSystem.coordinates.x,
        y: targetPlanet.basicInfo.solarSystem.coordinates.y,
        z: targetPlanet.basicInfo.order,
        technologyType: TechnologyType.ASTROPHYSICS_TECHNOLOGY,
        nextLevel: 6,
        requiredResources: { metal: 10000, crystal: 8000, deuterium: 5000 }
      },
      blockers: [],
      expiresOnTurn: galaxy.currentTurn + 1,
      debug: {
        resourceConcentrationRequest: true,
        concentrationTargetKind: 'RESEARCH'
      }
    }]);
    const transport = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.TRANSPORT
      && proposal.debug.resourceConcentrationTransport === true
    );

    expect(transport).toBeDefined();
    expect(transport?.budgetAttribution?.intentSubsystemId).toBe('RESEARCH');
    expect(transport?.requestPayload.origin).toEqual({ x: 0, y: 0, z: 1 });
    expect(transport?.requestPayload.target).toEqual({ x: 0, y: 0, z: 2 });
  });

  it('does not produce support cargo hulls for a one-planet empire', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureDevelopedSupportSource(planet);
    setSupportShipTech(bot);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'PRODUCTION'
      && (
        goal.finalShipType === ShipType.TRANSPORTER
        || goal.finalShipType === ShipType.MASS_HAULER
        || goal.finalShipType === ShipType.CARGO_SUPPORT
      )
    )).toBe(false);
  });

  it('does not emit an armament-delivery mission without a valid hangar carrier', () => {
    const { galaxy, bot, sourcePlanet, targetPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    configureLowIndustrySupportTarget(targetPlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 2);
    targetPlanet.setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, 1);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
    )).toBe(false);
  });

  it('does not produce more support cargo hulls once local transfer capacity is already sufficient', () => {
    const { galaxy, bot, sourcePlanet, targetPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    configureLowIndustrySupportTarget(targetPlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 20);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 6);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'PRODUCTION'
      && (
        goal.finalShipType === ShipType.TRANSPORTER
        || goal.finalShipType === ShipType.MASS_HAULER
        || goal.finalShipType === ShipType.CARGO_SUPPORT
      )
    )).toBe(false);
  });

  it('does not emit logistics support when an active logistics fleet already fills the cap', () => {
    const { galaxy, bot, sourcePlanet, targetPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    configureLowIndustrySupportTarget(targetPlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 2);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 2);
    targetPlanet.setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, 1);
    galaxy.activeFleets.push(createActiveTransportFleet(bot.playerId, sourcePlanet, targetPlanet));

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && (
        proposal.requestPayload.missionType === FleetMissionType.TRANSPORT
        || proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
      )
    )).toBe(false);
  });

  it('emits spy missions for eligible unscanned colonization targets', () => {
    const { galaxy, bot, sourcePlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 2);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
    )).toBe(true);
  });

  it('does not duplicate a colonization-intel spy target already claimed by an earlier subsystem', () => {
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 2);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot, [{
      proposalId: 'prior:spy',
      subsystemId: 'STRATEGIC_MILITARY',
      kind: 'FLEET_MISSION',
      status: 'PROPOSED',
      goalKey: 'prior:spy',
      dedupeKey: 'prior:spy',
      summary: 'Prior spy.',
      planetId: null,
      targetCoordinates: {
        x: unownedPlanet.basicInfo.solarSystem.coordinates.x,
        y: unownedPlanet.basicInfo.solarSystem.coordinates.y,
        z: unownedPlanet.basicInfo.order
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
      && proposal.targetCoordinates?.z === unownedPlanet.basicInfo.order
    )).toBe(false);
  });

  it('annotates adaptive colonization pressure when a scanned target is blocked by exactly one adaptive level', () => {
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 2);
    unownedPlanet.basicInfo.colonizationDifficulty = 3;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.debug.adaptiveColonizationPressureActive === true
      && proposal.debug.adaptiveColonizationBlockedCandidateCount === 1
      && proposal.debug.adaptiveColonizationRequiredLevel === 3
    )).toBe(true);
  });

  it('emits one colonize mission with bootstrap cargo for a fresh valid scanned target', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const colonizeProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    );

    expect(colonizeProposal).toBeDefined();
    expect(colonizeProposal?.requestPayload.origin).toEqual({ x: 0, y: 0, z: 1 });
    expect(colonizeProposal?.requestPayload.target).toEqual({ x: 0, y: 0, z: 3 });
    expect(colonizeProposal?.requestPayload.cargo).toEqual({ metal: 200, crystal: 120, deuterium: 80 });
    randomSpy.mockRestore();
  });

  it('does not consider more colonizer production while one idle colonizer already exists', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseStrategicDevelopmentPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    setSupportShipTech(bot);
    bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 3);
    planet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) => goal.finalShipType === ShipType.COLONIZER)).toBe(false);
  });

  it('does not emit a colonize mission while an active colonize fleet already exists', () => {
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);
    galaxy.activeFleets.push(createActiveColonizeFleet(bot.playerId, sourcePlanet));

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    )).toBe(false);
  });

  it('chooses randomly between the top two valid scanned colonization targets', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    sourcePlanet.rBDSFTQ.resources = new ResourcesPack(80000, 80000, 80000);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    unownedPlanet.info.planetaryParameters.industryModifier = 1.2;
    unownedPlanet.basicInfo.baseSize = 170;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const secondTarget = Planet.createRandomEmpty('BotSys IV', 4, sourcePlanet.basicInfo.solarSystem, null);
    secondTarget.basicInfo.baseSize = 165;
    secondTarget.basicInfo.colonizationDifficulty = 1;
    secondTarget.info.planetaryParameters.industryModifier = 1.15;
    sourcePlanet.basicInfo.solarSystem.planets[3] = secondTarget;
    markPlanetScanned(bot, secondTarget, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const colonizeProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    );

    expect(colonizeProposal).toBeDefined();
    randomSpy.mockRestore();
  });

  it('forces the best valid colonization target after turn 100', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    galaxy.currentTurn = 101;
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    sourcePlanet.rBDSFTQ.resources = new ResourcesPack(80000, 80000, 80000);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    unownedPlanet.info.planetaryParameters.industryModifier = 1.05;
    unownedPlanet.basicInfo.baseSize = 150;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const betterTarget = Planet.createRandomEmpty('BotSys IV', 4, sourcePlanet.basicInfo.solarSystem, null);
    betterTarget.basicInfo.baseSize = 180;
    betterTarget.basicInfo.colonizationDifficulty = 1;
    betterTarget.info.planetaryParameters.industryModifier = 1.25;
    sourcePlanet.basicInfo.solarSystem.planets[3] = betterTarget;
    markPlanetScanned(bot, betterTarget, galaxy.currentTurn);

    const thirdTarget = Planet.createRandomEmpty('BotSys V', 5, sourcePlanet.basicInfo.solarSystem, null);
    thirdTarget.basicInfo.baseSize = 145;
    thirdTarget.basicInfo.colonizationDifficulty = 1;
    thirdTarget.info.planetaryParameters.industryModifier = 1.02;
    sourcePlanet.basicInfo.solarSystem.planets[4] = thirdTarget;
    markPlanetScanned(bot, thirdTarget, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const colonizeProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    );

    expect(colonizeProposal).toBeDefined();
    randomSpy.mockRestore();
  });

  it('forces colonization for one-planet empires after turn 100 with two valid targets', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    galaxy.currentTurn = 101;
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    sourcePlanet.rBDSFTQ.resources = new ResourcesPack(80000, 80000, 80000);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    unownedPlanet.info.planetaryParameters.industryModifier = 1.05;
    unownedPlanet.basicInfo.baseSize = 150;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const betterTarget = Planet.createRandomEmpty('BotSys IV', 4, sourcePlanet.basicInfo.solarSystem, null);
    betterTarget.basicInfo.baseSize = 180;
    betterTarget.basicInfo.colonizationDifficulty = 1;
    betterTarget.info.planetaryParameters.industryModifier = 1.25;
    sourcePlanet.basicInfo.solarSystem.planets[3] = betterTarget;
    markPlanetScanned(bot, betterTarget, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);
    const colonizeProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    );

    expect(colonizeProposal).toBeDefined();
    randomSpy.mockRestore();
  });

  it('waits on forced colonization when Adaptive Technology is already proposed this turn', () => {
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    galaxy.currentTurn = 101;
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const secondTarget = Planet.createRandomEmpty('BotSys IV', 4, sourcePlanet.basicInfo.solarSystem, null);
    secondTarget.basicInfo.baseSize = 165;
    secondTarget.basicInfo.colonizationDifficulty = 1;
    sourcePlanet.basicInfo.solarSystem.planets[3] = secondTarget;
    markPlanetScanned(bot, secondTarget, galaxy.currentTurn);

    const thirdTarget = Planet.createRandomEmpty('BotSys V', 5, sourcePlanet.basicInfo.solarSystem, null);
    thirdTarget.basicInfo.baseSize = 155;
    thirdTarget.basicInfo.colonizationDifficulty = 1;
    sourcePlanet.basicInfo.solarSystem.planets[4] = thirdTarget;
    markPlanetScanned(bot, thirdTarget, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot, [{
      proposalId: 'prior:research:adaptive',
      subsystemId: 'RESEARCH',
      kind: 'RESEARCH',
      status: 'PROPOSED',
      goalKey: 'research:Adaptive Technology',
      dedupeKey: 'research:Adaptive Technology',
      summary: 'Research Adaptive Technology.',
      planetId: null,
      requestPayload: {
        x: 0,
        y: 0,
        z: 1,
        technologyType: TechnologyType.ADAPTIVE_TECHNOLOGY,
        helperPlanets: []
      },
      targetCoordinates: { x: 0, y: 0, z: 1 },
      expectedValue: 1,
      urgency: 1,
      risk: 1,
      confidence: 1,
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      blockers: [],
      expiresOnTurn: galaxy.currentTurn + 1,
      debug: {}
    }]);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    )).toBe(false);
  });

  it('waits on forced colonization when Adaptive Technology is already in active research', () => {
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    galaxy.currentTurn = 101;
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const secondTarget = Planet.createRandomEmpty('BotSys IV', 4, sourcePlanet.basicInfo.solarSystem, null);
    secondTarget.basicInfo.baseSize = 165;
    secondTarget.basicInfo.colonizationDifficulty = 1;
    sourcePlanet.basicInfo.solarSystem.planets[3] = secondTarget;
    markPlanetScanned(bot, secondTarget, galaxy.currentTurn);

    const thirdTarget = Planet.createRandomEmpty('BotSys V', 5, sourcePlanet.basicInfo.solarSystem, null);
    thirdTarget.basicInfo.baseSize = 155;
    thirdTarget.basicInfo.colonizationDifficulty = 1;
    sourcePlanet.basicInfo.solarSystem.planets[4] = thirdTarget;
    markPlanetScanned(bot, thirdTarget, galaxy.currentTurn);

    sourcePlanet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
      TechnologyType.ADAPTIVE_TECHNOLOGY,
      2,
      0,
      []
    );

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    )).toBe(false);
  });

  it('accepts colonization targets down to size 110', () => {
    const { galaxy, bot, sourcePlanet, unownedPlanet } = createSupportWorld();
    configureDevelopedSupportSource(sourcePlanet);
    setSupportShipTech(bot);
    sourcePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
    sourcePlanet.rBDSFTQ.resources = new ResourcesPack(80000, 80000, 80000);
    unownedPlanet.basicInfo.colonizationDifficulty = 1;
    unownedPlanet.basicInfo.baseSize = 115;
    markPlanetScanned(bot, unownedPlanet, galaxy.currentTurn);

    const result = runStrategicDevelopmentSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.COLONIZE
    )).toBe(true);
  });
});

function runStrategicDevelopmentSubsystem(
  galaxy: Galaxy,
  bot: Player,
  priorProposals: BotProposal[] = []
) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: false,
      strategicDevelopment: true,
      strategicMilitary: false,
      strategicDiplomatic: false,
      weightManager: false
    },
  });

  return new BotStrategicDevelopmentSubsystem().generate({
    snapshot,
    memory: createDefaultBotMemoryV2(),
    priorProposals
  });
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

function createSupportWorld() {
  const system = new SolarSystem('BotSys', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const sourcePlanet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  const targetPlanet = Planet.createStartingPlanet('BotSys II', 2, system, 1);
  const unownedPlanet = Planet.createRandomEmpty('BotSys III', 3, system, null);
  unownedPlanet.basicInfo.baseSize = 160;
  system.planets[0] = sourcePlanet;
  system.planets[1] = targetPlanet;
  system.planets[2] = unownedPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [sourcePlanet, targetPlanet],
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

  return { galaxy, bot, sourcePlanet, targetPlanet, unownedPlanet };
}

function configureBaseStrategicDevelopmentPlanet(planet: Planet): void {
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
  planet.rBDSFTQ.resources = new ResourcesPack(20000, 20000, 20000);
  planet.rBDSFTQ.ships = ManyShips.empty();
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
}

function configureDevelopedSupportSource(planet: Planet): void {
  configureBaseStrategicDevelopmentPlanet(planet);
  planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 3);
  planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 4);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 2);
  planet.rBDSFTQ.resources = new ResourcesPack(60000, 50000, 40000);
  planet.info.planetaryParameters.industryModifier = 1.5;
}

function configureLowIndustrySupportTarget(planet: Planet): void {
  configureBaseStrategicDevelopmentPlanet(planet);
  planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 3);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
  planet.rBDSFTQ.resources = new ResourcesPack(50, 50, 50);
  planet.info.planetaryParameters.industryModifier = 0.4;
}

function setSupportShipTech(bot: Player): void {
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, 2);
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 2);
  bot.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ASTROPHYSICS_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
  bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 3);
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 2);
}

function markPlanetScanned(bot: Player, planet: Planet, createdTurn: number): void {
  const report = new EspionageReportGenerator().createEspionageReport(bot, null, planet, 1, { createdTurn });
  planet.lastReportData.set(bot.playerId, report);
}

function createActiveColonizeFleet(ownerId: number, originPlanet: Planet): Fleet {
  return new Fleet(
    99,
    ownerId,
    FleetMissionType.COLONIZE,
    new Destination(0, 0, 1),
    new Destination(0, 0, 3),
    originPlanet.basicInfo.name,
    'Target',
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

function createActiveTransportFleet(ownerId: number, originPlanet: Planet, targetPlanet: Planet): Fleet {
  return new Fleet(
    100,
    ownerId,
    FleetMissionType.TRANSPORT,
    new Destination(
      originPlanet.basicInfo.solarSystem.coordinates.x,
      originPlanet.basicInfo.solarSystem.coordinates.y,
      originPlanet.basicInfo.order
    ),
    new Destination(
      targetPlanet.basicInfo.solarSystem.coordinates.x,
      targetPlanet.basicInfo.solarSystem.coordinates.y,
      targetPlanet.basicInfo.order
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
    FleetState.RETURNING,
    1,
    ManyDefences.empty(),
    FleetOrbitActivity.IDLE,
    null,
    FleetReturnReason.NORMAL
  );
}
