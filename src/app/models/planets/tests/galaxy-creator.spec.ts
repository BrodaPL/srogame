import { describe, expect, it } from 'vitest';
import { GalaxyCreator } from '../galaxy-creator';
import { GameType } from '../../enums/game-type';
import { PlayerType } from '../../enums/player-type';
import { PlanetType } from '../../enums/planet-type';
import type { GalaxySetup } from '../../game-api-types';

describe('GalaxyCreator', () => {
  const createSetup = (overrides?: Partial<GalaxySetup>): GalaxySetup => ({
    gameType: GameType.PVE,
    galaxyName: 'Test Galaxy',
    galaxyWidth: 10,
    galaxyHeight: 10,
    galaxyCenterSize: 5,
    voidChance: 0,
    starsAmountModifier: [1, 1],
    playerAmount: 1,
    botsAmount: 0,
    botDifficulty: 0,
    neutralBotsAmount: 1,
    neutralBotsDifficulty: 0,
    startingResources: {
      metal: 1000,
      crystal: 1000,
      deuterium: 1000
    },
    ...overrides
  });

  it('adds a level-three neutral neighbor to the home system when neutral planets are enabled', () => {
    const galaxy = new GalaxyCreator(createSetup()).createGalaxy(['Human']);
    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER);

    expect(player).toBeTruthy();

    const homePlanet = player!.planets[0];
    const homeSystem = homePlanet.basicInfo.solarSystem;
    const neutralOwnerIds = new Set(
      galaxy.players
        .filter((entry) => entry.type === PlayerType.NEUTRAL)
        .map((entry) => entry.playerId)
    );
    const neutralPlanets = homeSystem.planets.filter((planet) =>
      planet !== homePlanet
      && planet.basicInfo.type !== PlanetType.ASTEROIDS
      && planet.info.ownerId !== null
      && neutralOwnerIds.has(planet.info.ownerId)
    );

    expect(homeSystem.planets.length).toBeGreaterThanOrEqual(2);
    expect(neutralPlanets.length).toBe(1);
    expect(neutralPlanets[0].rBDSFTQ.resources.metal).toBeGreaterThan(0);
    expect(neutralPlanets[0].rBDSFTQ.resources.crystal).toBeGreaterThan(0);
    expect(neutralPlanets[0].rBDSFTQ.resources.deuterium).toBeGreaterThan(0);
    expect(neutralPlanets[0].rBDSFTQ.ships.totalShipsCount()).toBeGreaterThan(0);
  });

  it('does not add a guaranteed home-system neutral when neutral planets are disabled', () => {
    const galaxy = new GalaxyCreator(createSetup({ neutralBotsAmount: 0 })).createGalaxy(['Human']);
    const player = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER);

    expect(player).toBeTruthy();

    const homePlanet = player!.planets[0];
    const homeSystem = homePlanet.basicInfo.solarSystem;
    const neutralOwnerIds = new Set(
      galaxy.players
        .filter((entry) => entry.type === PlayerType.NEUTRAL)
        .map((entry) => entry.playerId)
    );
    const homeSystemNeutralPlanets = homeSystem.planets.filter((planet) =>
      planet !== homePlanet
      && planet.info.ownerId !== null
      && neutralOwnerIds.has(planet.info.ownerId)
    );

    expect(homeSystem.planets.length).toBe(1);
    expect(homeSystemNeutralPlanets.length).toBe(0);
  });

  it('assigns requested bot profile counts exactly for fresh-game bots', () => {
    const galaxy = new GalaxyCreator(createSetup({
      botsAmount: 4,
      botProfileCounts: {
        BALANCED: 1,
        AGGRESSOR: 2,
        TURTLE: 0,
        MINER: 1,
        AVOIDER: 0,
        BUNKERER: 0
      }
    })).createGalaxy(['Human']);

    const botProfiles = galaxy.players
      .filter((entry) => entry.type === PlayerType.BOT)
      .map((entry) => entry.botProfileId);

    expect(botProfiles).toEqual([
      'BALANCED',
      'AGGRESSOR',
      'AGGRESSOR',
      'MINER'
    ]);
  });
});
