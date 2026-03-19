import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../enums/building-type';
import { GameType } from '../../enums/game-type';
import { PlayerType } from '../../enums/player-type';
import { ShipType } from '../../enums/ship-type';
import { TechnologyType } from '../../enums/technology-type';
import type { GalaxySetup } from '../../game-api-types';
import { ManyShips } from '../../fleets/many-ships';
import { GalaxyCreator } from '../../planets/galaxy-creator';
import { resolvePhaseOneTurn } from '../../turns/phase-one-turn-resolver';
import { applySmokeTestScenario } from '../smoke-test-scenarios';

function createSetup(): GalaxySetup {
  return {
    gameType: GameType.SANDBOX,
    galaxyName: 'Smoke Spec',
    galaxyWidth: 10,
    galaxyHeight: 10,
    galaxyCenterSize: 5,
    voidChance: 0,
    starsAmountModifier: [0, 1],
    playerAmount: 1,
    botsAmount: 0,
    botDifficulty: 0,
    neutralBotsAmount: 0,
    neutralBotsDifficulty: 0,
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    startingResources: {
      metal: 500,
      crystal: 500,
      deuterium: 500
    }
  };
}

function createGalaxy() {
  return new GalaxyCreator(createSetup()).createGalaxy(['Tester']);
}

describe('smoke test scenarios', () => {
  it('seeds turn progression that completes after one turn', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'turnProgression');

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const homePlanet = player.planets[0];
    const resourcesBefore = {
      metal: homePlanet.rBDSFTQ.resources.metal,
      crystal: homePlanet.rBDSFTQ.resources.crystal,
      deuterium: homePlanet.rBDSFTQ.resources.deuterium
    };
    const shipyardLevelBefore = homePlanet.getBuildingLevel(BuildingType.SHIPYARD);

    resolvePhaseOneTurn(galaxy, galaxy.currentTurn + 1);

    expect(homePlanet.rBDSFTQ.resources.metal).toBeGreaterThan(resourcesBefore.metal);
    expect(homePlanet.rBDSFTQ.resources.crystal).toBeGreaterThan(resourcesBefore.crystal);
    expect(homePlanet.rBDSFTQ.resources.deuterium).toBeGreaterThan(resourcesBefore.deuterium);
    expect(homePlanet.rBDSFTQ.buildingQueue).toHaveLength(0);
    expect(homePlanet.rBDSFTQ.shipyardQueue).toHaveLength(0);
    expect(homePlanet.rBDSFTQ.currentResearchQueue).toBeNull();
    expect(homePlanet.getBuildingLevel(BuildingType.SHIPYARD)).toBe(shipyardLevelBefore + 1);
    expect(ManyShips.countByType(homePlanet.rBDSFTQ.ships).get(ShipType.FIGHTER)).toBe(1);
    expect(player.getTechLevel(TechnologyType.ENERGY_TECHNOLOGY)).toBe(1);
  });

  it('seeds fleet lifecycle with remote owned target and spy probes', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'fleetLifecycle');

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const homePlanet = player.planets[0];
    const remoteOwnedPlanets = player.planets.filter((planet) =>
      planet.basicInfo.solarSystem !== homePlanet.basicInfo.solarSystem
    );
    const sameSystemForeignTargets = homePlanet.basicInfo.solarSystem.planets.filter((planet) =>
      planet !== homePlanet && planet.info.ownerId !== player.playerId
    );

    expect(remoteOwnedPlanets.length).toBeGreaterThan(0);
    expect(ManyShips.countByType(homePlanet.rBDSFTQ.ships).get(ShipType.TRANSPORTER)).toBeGreaterThanOrEqual(8);
    expect(ManyShips.countByType(homePlanet.rBDSFTQ.ships).get(ShipType.SPY_PROBE)).toBeGreaterThanOrEqual(4);
    expect(player.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY)).toBeGreaterThanOrEqual(2);
    expect(sameSystemForeignTargets.length).toBeGreaterThan(0);
  });

  it('seeds a battle debris scenario that creates debris on the next turn', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'battleDebris');

    const activeFleet = galaxy.activeFleets[0];
    expect(activeFleet).toBeDefined();

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const targetPlanet = player.planets[0];
    expect(activeFleet.target.x).toBe(targetPlanet.basicInfo.solarSystem.coordinates.x);
    expect(activeFleet.target.y).toBe(targetPlanet.basicInfo.solarSystem.coordinates.y);
    expect(activeFleet.target.z).toBe(targetPlanet.basicInfo.order - 1);
    expect(targetPlanet.rBDSFTQ.spaceDebris.getTotalResourceAmount()).toBe(0);

    resolvePhaseOneTurn(galaxy, galaxy.currentTurn + 1);

    expect(galaxy.activeFleets).toHaveLength(0);
    expect(targetPlanet.rBDSFTQ.spaceDebris.getTotalResourceAmount()).toBeGreaterThan(0);
  });

  it('seeds damaged ship UI data with mixed ready and damaged ships', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'damagedShipsUi');

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const homePlanet = player.planets[0];
    const shipCounts = ManyShips.countByType(homePlanet.rBDSFTQ.ships);

    expect(homePlanet.rBDSFTQ.ships.damagedShips.length).toBe(3);
    expect(shipCounts.get(ShipType.TRANSPORTER)).toBeGreaterThanOrEqual(5);
    expect(shipCounts.get(ShipType.CRUISER)).toBeGreaterThanOrEqual(2);
  });
});
