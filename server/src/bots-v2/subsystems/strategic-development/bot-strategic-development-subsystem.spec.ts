import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
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
}
