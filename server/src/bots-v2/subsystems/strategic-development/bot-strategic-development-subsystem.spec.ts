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
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
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

    expect(result.proposals.some((proposal) => proposal.debug.queueType === 'BUILDING')).toBe(true);
    expect(result.proposals.some((proposal) => proposal.debug.queueType === 'PRODUCTION')).toBe(true);
    expect(result.planetResults?.[0]?.emittedBuildingRequestCount).toBeGreaterThan(0);
    expect(result.planetResults?.[0]?.emittedProductionRequestCount).toBeGreaterThan(0);
    expect(result.planetResults?.[0]?.buildingGoalKeys.length).toBeGreaterThan(0);
    expect(result.planetResults?.[0]?.productionGoalKeys.length).toBeGreaterThan(0);
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

  it('allows repair-drone production on low-industry planets once unlocked', () => {
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
    expect(colonizeProposal?.requestPayload.cargo).toEqual({ metal: 133, crystal: 133, deuterium: 133 });
    randomSpy.mockRestore();
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

    expect(colonizeProposal?.requestPayload.target).toEqual({ x: 0, y: 0, z: 4 });
    randomSpy.mockRestore();
  });
});

function runStrategicDevelopmentSubsystem(galaxy: Galaxy, bot: Player) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
    enabled: true,
    shadowMode: true,
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: false,
      strategicDevelopment: true,
      strategicMilitary: false,
      strategicDiplomatic: false
    },
    allowSupervisorAcceptance: false,
    allowExecution: false
  });

  return new BotStrategicDevelopmentSubsystem().generate({
    snapshot,
    memory: createDefaultBotMemoryV2()
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
