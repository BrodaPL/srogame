import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { BuildingQueueEntry } from '../../../../../src/app/models/buildings/building-queue-entry.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { TechnologyQueueEntry } from '../../../../../src/app/models/tech/technology-queue-entry.js';
import { Player } from '../../../../../src/app/models/player.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotEconomicSubsystem } from './bot-economic-subsystem.js';

describe('BotEconomicSubsystem', () => {
  it('prefers a crystal-mine request on a crystal-rich planet in the economy branch', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 2);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 2);
    planet.info.planetaryParameters.crystalModifier = 1.6;

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.proposals[0]?.requestPayload).toMatchObject({
      buildingType: BuildingType.CRYSTAL_MINE
    });
    expect(result.proposals[0]?.debug?.branch).toBe('ECONOMY');
    expect(result.proposals[0]?.debug?.goalRole).toBe('Primary goal');
  });

  it('switches to the energy branch when energy is below target', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.setCurrentBuildingPowerConsumption(BuildingType.METAL_MINE, planet.getMaxBuildingPowerConsumption(BuildingType.METAL_MINE));
    planet.setCurrentBuildingPowerConsumption(BuildingType.CRYSTAL_MINE, planet.getMaxBuildingPowerConsumption(BuildingType.CRYSTAL_MINE));
    planet.setCurrentBuildingPowerConsumption(BuildingType.DEUTERIUM_SYNTHESIZER, planet.getMaxBuildingPowerConsumption(BuildingType.DEUTERIUM_SYNTHESIZER));

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.proposals[0]?.debug?.branch).toBe('ENERGY');
    expect([
      BuildingType.SOLAR_WIND_GEOTHERMAL,
      BuildingType.NUCLEAR_PLANT,
      BuildingType.FUSION_REACTOR
    ]).toContain((result.proposals[0]?.requestPayload as { buildingType?: BuildingType })?.buildingType);
  });

  it('selects the most deficient storage type first', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 6);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 6);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 6);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 3);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.debug?.branch).toBe('STORAGE');
    expect(result.proposals[0]?.requestPayload).toMatchObject({
      buildingType: BuildingType.METAL_STORAGE
    });
    expect(result.planetResults?.[0]).toMatchObject({
      emittedRequestCount: 1,
      secondaryGoalKey: null
    });
  });

  it('can emit a research request when fusion is the remaining actionable energy goal step', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 4);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.setCurrentBuildingPowerConsumption(BuildingType.METAL_MINE, planet.getMaxBuildingPowerConsumption(BuildingType.METAL_MINE));
    planet.setCurrentBuildingPowerConsumption(BuildingType.CRYSTAL_MINE, planet.getMaxBuildingPowerConsumption(BuildingType.CRYSTAL_MINE));
    planet.setCurrentBuildingPowerConsumption(BuildingType.DEUTERIUM_SYNTHESIZER, planet.getMaxBuildingPowerConsumption(BuildingType.DEUTERIUM_SYNTHESIZER));
    planet.rBDSFTQ.buildingQueue = [
      new BuildingQueueEntry(BuildingType.SOLAR_WIND_GEOTHERMAL, planet.getBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL) + 1, 999999),
      new BuildingQueueEntry(BuildingType.NUCLEAR_PLANT, planet.getBuildingLevel(BuildingType.NUCLEAR_PLANT) + 1, 999999)
    ];
    planet.info.planetaryParameters.scienceModifier = 0.1;
    bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 3);

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.proposals[0]?.kind).toBe('RESEARCH');
    expect(result.proposals[0]?.requestPayload).toMatchObject({
      technologyType: TechnologyType.ENERGY_TECHNOLOGY
    });
    expect(result.proposals[0]?.debug?.finalGoalBuildingType).toBe(BuildingType.FUSION_REACTOR);
  });

  it('deduplicates shared immediate requests while keeping both goal links', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 8);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 8);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 8);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 0);
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.planetResults?.[0]?.primaryGoalKey).not.toBeNull();
    expect(result.planetResults?.[0]?.secondaryGoalKey).not.toBeNull();
    expect(result.planetResults?.[0]?.emittedRequestCount).toBe(1);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.requestPayload).toMatchObject({
      buildingType: BuildingType.ROBOTICS_FACTORY
    });
    expect(result.proposals[0]?.debug?.sharedImmediateRequest).toBe(true);
    expect(result.proposals[0]?.debug?.secondaryGoalKey).toBe(result.planetResults?.[0]?.secondaryGoalKey);
  });

  it('can emit material-technology research for nanite when the building queue is saturated', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 8);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 8);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 8);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 20);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 20);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 20);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 20);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 0);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
    planet.rBDSFTQ.buildingQueue = [
      new BuildingQueueEntry(BuildingType.METAL_MINE, planet.getBuildingLevel(BuildingType.METAL_MINE) + 1, 0),
      new BuildingQueueEntry(BuildingType.CRYSTAL_MINE, planet.getBuildingLevel(BuildingType.CRYSTAL_MINE) + 1, 0)
    ];
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 0);

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.proposals[0]?.kind).toBe('RESEARCH');
    expect(result.proposals[0]?.requestPayload).toMatchObject({
      technologyType: TechnologyType.MATERIAL_TECHNOLOGY
    });
    expect(result.proposals[0]?.debug?.finalGoalBuildingType).toBe(BuildingType.NANITE_FACTORY);
  });

  it('records blocked fusion goals when research-lab prerequisites are missing', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 0);
    planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.setCurrentBuildingPowerConsumption(BuildingType.METAL_MINE, planet.getMaxBuildingPowerConsumption(BuildingType.METAL_MINE));
    planet.setCurrentBuildingPowerConsumption(BuildingType.CRYSTAL_MINE, planet.getMaxBuildingPowerConsumption(BuildingType.CRYSTAL_MINE));
    planet.setCurrentBuildingPowerConsumption(BuildingType.DEUTERIUM_SYNTHESIZER, planet.getMaxBuildingPowerConsumption(BuildingType.DEUTERIUM_SYNTHESIZER));
    planet.rBDSFTQ.buildingQueue = [
      new BuildingQueueEntry(BuildingType.SOLAR_WIND_GEOTHERMAL, planet.getBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL) + 1, 0),
      new BuildingQueueEntry(BuildingType.NUCLEAR_PLANT, planet.getBuildingLevel(BuildingType.NUCLEAR_PLANT) + 1, 0)
    ];

    const result = runEconomicSubsystem(galaxy, bot);
    const fusionGoal = result.goals?.find((goal) => goal.finalBuildingType === BuildingType.FUSION_REACTOR);

    expect(fusionGoal).toBeDefined();
    expect(fusionGoal?.blockers).toContain(`RESEARCH_BUILDING_REQUIREMENT_NOT_MET:${BuildingType.RESEARCH_LAB}`);
  });

  it('emits a first-class no-action planet result when both queues are blocked', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseEconomyPlanet(planet);
    planet.rBDSFTQ.buildingQueue = Array.from({ length: 10 }, (_, index) => new BuildingQueueEntry(
      BuildingType.METAL_MINE,
      planet.getBuildingLevel(BuildingType.METAL_MINE) + index + 1,
      0
    ));
    planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
      TechnologyType.ENERGY_TECHNOLOGY,
      1,
      0,
      []
    );

    const result = runEconomicSubsystem(galaxy, bot);

    expect(result.proposals).toHaveLength(0);
    expect(result.planetResults?.[0]?.emittedRequestCount).toBe(0);
    expect(result.planetResults?.[0]?.noActionReason).not.toBeNull();
  });
});

function runEconomicSubsystem(galaxy: Galaxy, bot: Player) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
      mode: 'SHADOW',
    enabledSubsystems: {
      economic: true,
      defensive: false,
      warfare: false,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      },
  });

  return new BotEconomicSubsystem().generate({
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

function configureBaseEconomyPlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 10);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 10);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 10);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.rBDSFTQ.resources = new ResourcesPack(5000, 5000, 5000);
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
}
