import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../enums/building-type';
import { GameType } from '../../enums/game-type';
import { StartingHomeworldPreset } from '../../enums/starting-homeworld-preset';
import { PlayerType } from '../../enums/player-type';
import { ShipType } from '../../enums/ship-type';
import { TechnologyType } from '../../enums/technology-type';
import { FleetOrbitActivity } from '../../fleets/fleet';
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
    startingHomeworldPreset: StartingHomeworldPreset.MEDIUM,
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

  it('seeds ship repair turn so damaged stationed ships are repaired after one turn', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'shipRepairTurn');

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const homePlanet = player.planets[0];
    const missingHullBefore = ManyShips.totalMissingHull(homePlanet.rBDSFTQ.ships);

    resolvePhaseOneTurn(galaxy, galaxy.currentTurn + 1);

    expect(missingHullBefore).toBeGreaterThan(0);
    expect(ManyShips.totalMissingHull(homePlanet.rBDSFTQ.ships)).toBe(0);
    expect(ManyShips.hasDamagedShips(homePlanet.rBDSFTQ.ships)).toBe(false);
  });

  it('seeds orbit repair lifecycle so idle orbit fleets are repaired after planet ships', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'orbitRepairLifecycle');

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const homePlanet = player.planets[0];
    const fleetBefore = galaxy.activeFleets[0];

    expect(fleetBefore).toBeDefined();
    expect(ManyShips.hasDamagedShips(homePlanet.rBDSFTQ.ships)).toBe(true);
    expect(ManyShips.hasDamagedShips(fleetBefore.ships)).toBe(true);

    resolvePhaseOneTurn(galaxy, galaxy.currentTurn + 1);

    expect(ManyShips.hasDamagedShips(homePlanet.rBDSFTQ.ships)).toBe(false);
    expect(ManyShips.hasDamagedShips(galaxy.activeFleets[0].ships)).toBe(false);
  });

  it('seeds repair warnings UI with damaged ships but no ship repair capability', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'repairWarningsUi');

    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER)!;
    const homePlanet = player.planets[0];

    expect(ManyShips.hasDamagedShips(homePlanet.rBDSFTQ.ships)).toBe(true);
    expect(homePlanet.getBuildingLevel(BuildingType.SHIPYARD)).toBe(0);
    expect(homePlanet.rBDSFTQ.ships.undamagedShipsCount[ShipType.REPAIR_DRONE] ?? 0).toBe(0);
  });

  it('seeds guard orbit status with separate guarding and passive orbit fleets', () => {
    const galaxy = createGalaxy();
    applySmokeTestScenario(galaxy, 'guardOrbitStatus');

    expect(galaxy.activeFleets).toHaveLength(2);
    expect(galaxy.activeFleets[0].missionType).toBe('Defend');
    expect(galaxy.activeFleets[0].orbitActivity).toBe(FleetOrbitActivity.GUARDING);
    expect(galaxy.activeFleets[1].missionType).toBe('Hold');
    expect(galaxy.activeFleets[1].orbitActivity).toBe(FleetOrbitActivity.PASSIVE_HOLD);
  });
});
