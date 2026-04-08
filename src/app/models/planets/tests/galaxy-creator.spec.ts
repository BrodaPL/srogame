import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../enums/building-type';
import { DefenceType } from '../../enums/defence-type';
import { GalaxyCreator } from '../galaxy-creator';
import { GameType } from '../../enums/game-type';
import { StartingHomeworldPreset } from '../../enums/starting-homeworld-preset';
import { PlayerType } from '../../enums/player-type';
import { PlanetType } from '../../enums/planet-type';
import { ShipType } from '../../enums/ship-type';
import { TechnologyType } from '../../enums/technology-type';
import { ManyDefences } from '../../defences/many-defences';
import { ManyShips } from '../../fleets/many-ships';
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
    startingHomeworldPreset: StartingHomeworldPreset.MEDIUM,
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

  it('applies the configured homeworld preset to both human and bot starts', () => {
    const galaxy = new GalaxyCreator(createSetup({
      botsAmount: 1,
      neutralBotsAmount: 0,
      startingHomeworldPreset: StartingHomeworldPreset.HIGH
    })).createGalaxy(['Human']);

    const human = galaxy.players.find((entry) => entry.type === PlayerType.PLAYER);
    const bot = galaxy.players.find((entry) => entry.type === PlayerType.BOT);

    expect(human).toBeTruthy();
    expect(bot).toBeTruthy();

    const humanHome = human!.planets[0];
    const botHome = bot!.planets[0];
    const humanShips = ManyShips.countByType(humanHome.rBDSFTQ.ships);
    const botShips = ManyShips.countByType(botHome.rBDSFTQ.ships);
    const humanDefences = ManyDefences.undamagedCountByType(humanHome.rBDSFTQ.defences);
    const botDefences = ManyDefences.undamagedCountByType(botHome.rBDSFTQ.defences);

    expect(humanHome.getBuildingLevel(BuildingType.METAL_STORAGE)).toBe(2);
    expect(humanHome.getBuildingLevel(BuildingType.METAL_MINE)).toBe(3);
    expect(humanHome.getBuildingLevel(BuildingType.FUSION_REACTOR)).toBe(1);
    expect(humanHome.getBuildingLevel(BuildingType.SHIPYARD)).toBe(2);
    expect(humanHome.getBuildingLevel(BuildingType.RESEARCH_LAB)).toBe(1);
    expect(humanShips.get(ShipType.FIGHTER)).toBe(8);
    expect(humanShips.get(ShipType.SPY_PROBE)).toBe(16);
    expect(humanShips.get(ShipType.BATTLE_SHIP)).toBe(1);
    expect(humanShips.get(ShipType.TRANSPORTER)).toBe(1);
    expect(humanShips.get(ShipType.COLONIZER)).toBe(1);
    expect(humanDefences.get(DefenceType.SAM_SITE)).toBe(10);
    expect(human!.getTechLevel(TechnologyType.FUSION_DRIVE)).toBe(1);
    expect(human!.getTechLevel(TechnologyType.HYPERSPACE_DRIVE)).toBe(1);
    expect(human!.getTechLevel(TechnologyType.COMPUTER_TECHNOLOGY)).toBe(1);
    expect(human!.getTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY)).toBe(2);
    expect(human!.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY)).toBe(1);

    expect(botHome.getBuildingLevel(BuildingType.METAL_STORAGE)).toBe(2);
    expect(botShips.get(ShipType.FIGHTER)).toBe(8);
    expect(botShips.get(ShipType.COLONIZER)).toBe(1);
    expect(botDefences.get(DefenceType.SAM_SITE)).toBe(10);
    expect(bot!.getTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY)).toBe(2);
  });

  it('keeps player ids unique when guaranteed home-system neutrals are enabled for multiple humans', () => {
    const galaxy = new GalaxyCreator(createSetup({
      playerAmount: 2,
      neutralBotsAmount: 1
    })).createGalaxy(['Human-A', 'Human-B']);

    const playerIds = galaxy.players.map((player) => player.playerId);
    const humanPlayers = galaxy.players.filter((player) => player.type === PlayerType.PLAYER);

    expect(new Set(playerIds).size).toBe(playerIds.length);
    expect(humanPlayers).toHaveLength(2);

    for (const player of humanPlayers) {
      expect(player.planets).toHaveLength(1);

      const ownedPlanets = galaxy.stars
        .flatMap((row) => row.flatMap((system) => system.planets))
        .filter((planet) => planet.info.ownerId === player.playerId);

      expect(ownedPlanets).toHaveLength(1);
      expect(ownedPlanets[0]).toBe(player.planets[0]);
    }
  });
});
