import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../../src/app/models/enums/defence-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { createDiplomaticRelation } from '../../../../../src/app/models/diplomacy/diplomatic-relation.js';
import { EspionageReportGenerator } from '../../../../../src/app/generators/espionage-report-generator.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotWeightManagerSubsystem } from './bot-weight-manager-subsystem.js';

describe('BotWeightManagerSubsystem', () => {
  it('pushes immature planets strongly toward local economic growth', () => {
    const { galaxy, bot, immaturePlanet, matureHubPlanet } = createWeightManagerWorld();
    configureIndustryPlanet(immaturePlanet, 2);
    configureIndustryPlanet(matureHubPlanet, 7);

    const result = runWeightManagerSubsystem(galaxy, bot);
    const immatureEntry = result.memory.weightManager.planets.find((planet) =>
      sameCoordinates(planet.coordinates, immaturePlanet)
    );
    const matureHubEntry = result.memory.weightManager.planets.find((planet) =>
      sameCoordinates(planet.coordinates, matureHubPlanet)
    );

    expect(immatureEntry?.immaturePlanet).toBe(true);
    expect(immatureEntry?.economicWeight).toBeGreaterThanOrEqual(80);
    expect(immatureEntry?.warfareWeight).toBeLessThanOrEqual(15);
    expect(matureHubEntry?.maturePlanet).toBe(true);
    expect(matureHubEntry?.industryHubPlanet).toBe(true);
  });

  it('marks poor war-discovered planets as in danger and raises war emergency mode', () => {
    const { galaxy, bot, enemy, weakPlanet, defenceHubPlanet } = createWeightManagerWorld();
    configureIndustryPlanet(weakPlanet, 5);
    configureIndustryPlanet(defenceHubPlanet, 6);
    defenceHubPlanet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 6);
    defenceHubPlanet.rBDSFTQ.defences.addUndamaged(DefenceType.SAM_SITE, 10);
    weakPlanet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 0);
    markPlanetDiscoveredByForeignPlayer(weakPlanet, bot, enemy, galaxy.currentTurn);
    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, enemy.playerId, DiplomaticStatus.WAR)
    );

    const result = runWeightManagerSubsystem(galaxy, bot);
    const weakEntry = result.memory.weightManager.planets.find((planet) =>
      sameCoordinates(planet.coordinates, weakPlanet)
    );

    expect(result.memory.weightManager.selectedMode).toBe('WAR_EMERGENCY');
    expect(weakEntry?.knownByWarFaction).toBe(true);
    expect(weakEntry?.inDangerPlanet).toBe(true);
    expect(weakEntry?.defensiveWeight).toBeGreaterThan(weakEntry?.economicWeight ?? 0);
  });

  it('marks a planet as damaged when a crucial building breaches its emergency threshold even below total damage threshold', () => {
    const { galaxy, bot, matureHubPlanet } = createWeightManagerWorld();
    configureIndustryPlanet(matureHubPlanet, 12);
    matureHubPlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 24);
    matureHubPlanet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 8);
    matureHubPlanet.setBuildingLevel(BuildingType.FUSION_REACTOR, 4);
    matureHubPlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 10);
    matureHubPlanet.setBuildingLevel(BuildingType.ALLIANCE_DEPOT, 10);
    matureHubPlanet.setBuildingLevel(BuildingType.BOMB_DEPOT, 10);
    matureHubPlanet.setBuildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT, 10);
    matureHubPlanet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 10);
    applyBuildingDamagePercent(matureHubPlanet, BuildingType.SOLAR_WIND_GEOTHERMAL, 75);

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
        strategicDiplomatic: false,
        weightManager: true
      },
      allowSupervisorAcceptance: false,
      allowExecution: false
    });
    const damagedSnapshot = snapshot.planets.find((planet) =>
      sameCoordinates(planet.coordinates, matureHubPlanet)
    );

    expect(damagedSnapshot?.infrastructure.totalDamagePercent ?? 100).toBeLessThan(25);
    expect(damagedSnapshot?.infrastructure.emergencyRepairTriggered).toBe(true);

    const result = runWeightManagerSubsystem(galaxy, bot);
    const damagedEntry = result.memory.weightManager.planets.find((planet) =>
      sameCoordinates(planet.coordinates, matureHubPlanet)
    );

    expect(damagedEntry?.damagedPlanet).toBe(true);
  });

  it('removes industry focus during active war without forcing a replacement focus', () => {
    const { galaxy, bot, enemy, matureLaggingPlanet, matureHubPlanet } = createWeightManagerWorld();
    configureIndustryPlanet(matureHubPlanet, 9);
    matureHubPlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 3);
    matureHubPlanet.setBuildingLevel(BuildingType.SENSOR_PHALANX, 3);
    configureIndustryPlanet(matureLaggingPlanet, 5);
    matureLaggingPlanet.setBuildingLevel(BuildingType.RESEARCH_LAB, 3);
    matureLaggingPlanet.setBuildingLevel(BuildingType.SENSOR_PHALANX, 3);

    const peacetimeResult = runWeightManagerSubsystem(galaxy, bot);
    const peacetimeEntry = peacetimeResult.memory.weightManager.planets.find((planet) =>
      sameCoordinates(planet.coordinates, matureLaggingPlanet)
    );
    expect(peacetimeEntry?.industryFocused).toBe(true);
    expect(peacetimeEntry?.selectedFocus).toBe('INDUSTRY');

    galaxy.diplomaticRelations.push(
      createDiplomaticRelation(bot.playerId, enemy.playerId, DiplomaticStatus.WAR)
    );

    const wartimeResult = runWeightManagerSubsystem(galaxy, bot, peacetimeResult.memory);
    const wartimeEntry = wartimeResult.memory.weightManager.planets.find((planet) =>
      sameCoordinates(planet.coordinates, matureLaggingPlanet)
    );

    expect(wartimeEntry?.industryFocused).toBe(false);
    expect(wartimeEntry?.selectedFocus).toBeNull();
  });
});

function runWeightManagerSubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory = createDefaultBotMemoryV2()
): {
  result: ReturnType<BotWeightManagerSubsystem['generate']>;
  memory: ReturnType<typeof createDefaultBotMemoryV2>;
} {
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
      strategicDiplomatic: false,
      weightManager: true
    },
    allowSupervisorAcceptance: false,
    allowExecution: false
  });

  return {
    result: new BotWeightManagerSubsystem().generate({
      snapshot,
      memory
    }),
    memory
  };
}

function createWeightManagerWorld(): {
  galaxy: Galaxy;
  bot: Player;
  enemy: Player;
  immaturePlanet: Planet;
  matureLaggingPlanet: Planet;
  matureHubPlanet: Planet;
  weakPlanet: Planet;
  defenceHubPlanet: Planet;
} {
  const botSystemA = new SolarSystem('WeightA', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const botSystemB = new SolarSystem('WeightB', 2, false, false, { x: 1, y: 0 }, new Set(), new Map());
  const enemySystem = new SolarSystem('WeightEnemy', 3, false, false, { x: 2, y: 0 }, new Set(), new Map());

  const immaturePlanet = Planet.createStartingPlanet('WeightA I', 1, botSystemA, 1);
  const matureLaggingPlanet = Planet.createStartingPlanet('WeightA II', 2, botSystemA, 1);
  botSystemA.planets[0] = immaturePlanet;
  botSystemA.planets[1] = matureLaggingPlanet;

  const matureHubPlanet = Planet.createStartingPlanet('WeightB I', 1, botSystemB, 1);
  const defenceHubPlanet = Planet.createStartingPlanet('WeightB II', 2, botSystemB, 1);
  botSystemB.planets[0] = matureHubPlanet;
  botSystemB.planets[1] = defenceHubPlanet;

  const weakPlanet = Planet.createStartingPlanet('WeightB III', 3, botSystemB, 1);
  botSystemB.planets[2] = weakPlanet;

  const enemyPlanet = Planet.createStartingPlanet('WeightEnemy I', 1, enemySystem, 2);
  enemySystem.planets[0] = enemyPlanet;

  const bot = new Player(1, 'WeightBot', [
    immaturePlanet,
    matureLaggingPlanet,
    matureHubPlanet,
    defenceHubPlanet,
    weakPlanet
  ], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const enemy = new Player(2, 'WeightEnemy', [enemyPlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));

  for (const planet of bot.planets) {
    planet.info.ownerId = bot.playerId;
    configureIndustryPlanet(planet, 5);
    planet.rBDSFTQ.resources.metal = 1000;
    planet.rBDSFTQ.resources.crystal = 1000;
    planet.rBDSFTQ.resources.deuterium = 1000;
  }
  enemyPlanet.info.ownerId = enemy.playerId;
  configureIndustryPlanet(enemyPlanet, 5);

  const galaxy = new Galaxy(
    'Weight Test',
    [bot, enemy],
    [[botSystemA, botSystemB, enemySystem]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot], [enemy.playerId, enemy]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId], [enemy.playerName, enemy.playerId]])
  );

  return {
    galaxy,
    bot,
    enemy,
    immaturePlanet,
    matureLaggingPlanet,
    matureHubPlanet,
    weakPlanet,
    defenceHubPlanet
  };
}

function configureIndustryPlanet(planet: Planet, level: number): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, level);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, level);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, level);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, level);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, level);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, level);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, level + 1);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, Math.max(1, level - 1));
  planet.setBuildingLevel(BuildingType.SHIPYARD, Math.max(1, level - 1));
  planet.setBuildingLevel(BuildingType.NANITE_FACTORY, level >= 6 ? 1 : 0);
}

function markPlanetDiscoveredByForeignPlayer(
  targetPlanet: Planet,
  targetOwner: Player,
  foreignViewer: Player,
  createdTurn: number
): void {
  const report = new EspionageReportGenerator().createEspionageReport(
    foreignViewer,
    targetOwner,
    targetPlanet,
    6,
    { createdTurn }
  );
  targetPlanet.lastReportData.set(foreignViewer.playerId, report);
}

function sameCoordinates(
  coordinates: { x: number; y: number; z: number },
  planet: Planet
): boolean {
  return coordinates.x === planet.basicInfo.solarSystem.coordinates.x
    && coordinates.y === planet.basicInfo.solarSystem.coordinates.y
    && coordinates.z === planet.basicInfo.order;
}

function applyBuildingDamagePercent(planet: Planet, buildingType: BuildingType, remainingPercent: number): void {
  const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(buildingType);
  planet.setCurrentBuildingStructuralPoints(
    buildingType,
    Math.floor(maxStructuralPoints * Math.max(0, Math.min(100, remainingPercent)) / 100)
  );
}
