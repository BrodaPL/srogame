import { Galaxy } from './galaxy';
import { Planet } from './planet';
import { SolarSystem } from './solar-system';
import { Player } from '../player';
import { GameType } from '../enums/game-type';
import { PlayerType } from '../enums/player-type';
import { PlanetType } from '../enums/planet-type';
import type { GalaxySetup } from '../game-api-types';
import { RngBuildingGenerator } from '../../generators/rng-building-generator';
import { RngTechnologyGenerator } from '../../generators/rng-technology-generator';
import { RngShipsGenerator } from '../../generators/rng-ships-generator';
import { RngResourceGenerator } from '../../generators/rng-resource-generator';
import { BuildingType } from '../enums/building-type';


export class GalaxyCreator {
  public readonly galaxyCenterRadius: number;

  /**
   * All methods in this class should use internal galaxyWidth and galaxyHeight
   * GalaxySetup galaxyWidth galaxyHeight should be avoided (except in constructor).
   */
  public readonly galaxyRadius: number;
  public readonly galaxyWidth: number;
  public readonly galaxyHeight: number;

  constructor(private readonly setup: GalaxySetup) {
    this.galaxyWidth = setup.galaxyWidth + 2;
    this.galaxyHeight = setup.galaxyHeight + 2;
    this.galaxyCenterRadius = Math.ceil(
      ((this.galaxyWidth - 2) / 2) * (setup.galaxyCenterSize / 100)
    );
    this.galaxyRadius = (this.galaxyWidth - 2) / 2;
  }

  public createEmptyGalaxy(): Galaxy {
    const stars = this.buildVoidStars();
    return new Galaxy(this.setup.galaxyName, [], stars);
  }

  public createGalaxy(playerNames: string[] = []): Galaxy {
    //1. Start with a void-filled galaxy grid sized for the configured width/height.
    const galaxy = this.createEmptyGalaxy();
    //1.1 Build a shuffled pool of system names to assign deterministically as we fill.
    const namePool = Galaxy.buildSolarSystemNamePool(true);
    let nameIndex = 0;

    //2. create actual StarSystems with planets in the circle field.
    for (let y = 0; y < this.galaxyHeight; y += 1) {
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        // Only place systems inside the circular galaxy radius; leave the rest as void.
        if (this.distanceFromCenter(x, y) <= this.galaxyRadius) {
          const name = namePool[nameIndex % namePool.length]; //this is clever!
          nameIndex++;
          // Pick a planet count within the configured stars amount modifier range.
          const planetNumber = this.randomInt(
            this.setup.starsAmountModifier[0],
            this.setup.starsAmountModifier[1]
          );
          // Replace the void tile with a generated SolarSystem at these coordinates.
          galaxy.stars[y][x] = new SolarSystem(
            name,
            planetNumber,
            false,
            false,
            { x, y },
            new Set()
          );
        }
      }
    }

    //3. Create galaxyCenter systems in the radius of the of this.galaxyCenterRadius
    for (let y = 0; y < this.galaxyHeight; y += 1) {
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        if (this.distanceFromCenter(x, y) <= this.galaxyCenterRadius) {
          galaxy.stars[y][x] = SolarSystem.createGalaxyCenter({ x, y });
        }
      }
    }

    //4. Apply void chance to non-void, non-center systems (with higher odds at the edge).
    for (let y = 0; y < this.galaxyHeight; y += 1) {
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        const system = galaxy.stars[y][x];
        const distance = this.distanceFromCenter(x, y);
        const isEdge = Math.abs(distance - this.galaxyRadius) <= 0.75;
        const isCenterEdge = Math.abs(distance - this.galaxyCenterRadius) <= 0.75;

        system.isCenterEdge = isCenterEdge;

        if (system.isVoid || system.isGalaxyCenter) {
          continue;
        }

        if (isEdge && Math.random() < 0.5) {
          const voidSystem = SolarSystem.createVoid({ x, y });
          voidSystem.isCenterEdge = isCenterEdge;
          galaxy.stars[y][x] = voidSystem;
          continue;
        }

        const baseVoidChance = this.setup.voidChance / 100;
        const adjustedVoidChance = isCenterEdge ? baseVoidChance * 0.5 : baseVoidChance;

        if (Math.random() < adjustedVoidChance) {
          const voidSystem = SolarSystem.createVoid({ x, y });
          voidSystem.isCenterEdge = isCenterEdge;
          galaxy.stars[y][x] = voidSystem;
        }
      }
    }

    this.assignStartingPlayers(galaxy, playerNames);

    //5. GameType specific modifications
    if (this.setup.gameType === GameType.SANDBOX) {
      const neutralChance = Math.max(0, Math.min(1, this.setup.neutralBotsAmount / 100));
      const minLevelRaw = 1 * (1 + (this.setup.neutralBotsDifficulty * 2) / 100);
      const maxLevelRaw = 12 * (1 + this.setup.neutralBotsDifficulty / 100);
      const minLevel = Math.max(1, Math.floor(minLevelRaw));
      const maxLevel = Math.max(minLevel, Math.floor(maxLevelRaw));

      const buildingGenerator = new RngBuildingGenerator();
      const techGenerator = new RngTechnologyGenerator();
      const shipGenerator = new RngShipsGenerator();
      const resourceGenerator = new RngResourceGenerator();

      let nextPlayerId = galaxy.players.reduce(
        (maxId, player) => Math.max(maxId, player.playerId),
        0
      ) + 1;

      for (const row of galaxy.stars) {
        for (const system of row) {
          if (system.isVoid) {
            continue;
          }

          for (const planet of system.planets) {
            if (planet.Info.ownerId !== null) {
              continue;
            }

            if (neutralChance <= 0 || Math.random() >= neutralChance) {
              continue;
            }

            const level = this.randomInt(minLevel, maxLevel);
            const playerName = `N-${nextPlayerId}`;
            const tech = techGenerator.generate(level);
            const targetShipsValue = resourceGenerator
              .generateSimple(level)
              .getTotalValuedResourceAmount();
            const orbitShips = shipGenerator.generate(level, targetShipsValue);

            planet.Info.ownerId = nextPlayerId;
            planet.Objects.buildingsLevels = buildingGenerator.generate(level);
            planet.Objects.orbitShips = orbitShips;

            const player = new Player(
              nextPlayerId,
              playerName,
              [planet],
              tech,
              [],
              PlayerType.NEUTRAL,
              new Map()
            );

            galaxy.players.push(player);
            galaxy.neutralPlayerMap.set(player.playerId, player);
            galaxy.playerNameMap.set(player.playerName, player.playerId);
            nextPlayerId += 1;
          }
        }
      }
    }

    return galaxy;
  }

  public buildVoidStars(): SolarSystem[][] {
    const stars: SolarSystem[][] = [];

    for (let y = 0; y < this.galaxyHeight; y += 1) {
      const row: SolarSystem[] = [];
      for (let x = 0; x < this.galaxyWidth; x += 1) {
        row.push(SolarSystem.createVoid({ x, y }));
      }
      stars.push(row);
    }

    return stars;
  }

  public distanceFromCenter(x: number, y: number): number {
    const centerX = (this.galaxyWidth - 1) / 2;
    const centerY = (this.galaxyHeight - 1) / 2;
    return Math.hypot(x - centerX, y - centerY);
  }

  private randomInt(min: number, max: number): number {
    const low = Math.min(min, max);
    const high = Math.max(min, max);
    return Math.floor(Math.random() * (high - low + 1)) + low;
  }

  private assignStartingPlayers(galaxy: Galaxy, playerNames: string[]): void {
    const targetCount = Math.max(0, Math.floor(this.setup.playerAmount));
    if (targetCount <= 0) {
      return;
    }

    const availablePlanets = this.collectAvailablePlanets(galaxy);
    if (availablePlanets.length === 0) {
      return;
    }

    const normalizedNames = playerNames
      .map((name) => (typeof name === 'string' ? name.trim() : ''))
      .filter((name) => name.length > 0);

    const playersById = new Map<number, Player>(
      galaxy.players.map((player) => [player.playerId, player])
    );

    for (let index = 0; index < targetCount; index += 1) {
      if (availablePlanets.length === 0) {
        return;
      }

      const name = normalizedNames[index] ?? `Player-${index + 1}`;
      const candidateIndex = this.randomInt(0, availablePlanets.length - 1);
      const slot = availablePlanets.splice(candidateIndex, 1)[0];
      const playerId = index + 1;

      const previousOwner = slot.planet.Info.ownerId !== null
        ? playersById.get(slot.planet.Info.ownerId) ?? null
        : null;
      if (previousOwner) {
        previousOwner.planets = previousOwner.planets.filter((planet) => planet !== slot.planet);
        if (previousOwner.planets.length === 0) {
          galaxy.players = galaxy.players.filter((player) => player !== previousOwner);
          galaxy.humanPlayerMap.delete(previousOwner.playerId);
          galaxy.botPlayerMap.delete(previousOwner.playerId);
          galaxy.neutralPlayerMap.delete(previousOwner.playerId);
          galaxy.playerNameMap.delete(previousOwner.playerName);
          playersById.delete(previousOwner.playerId);
        }
      }

      const startingPlanet = Planet.createStartingPlanet(
        slot.planet.BasicInfo.name,
        slot.planet.BasicInfo.order,
        slot.system,
        playerId
      );
      startingPlanet.BasicInfo.name = this.buildPlanetName(
        slot.system.name,
        slot.planet.BasicInfo.order,
        startingPlanet.BasicInfo.type
      );
      startingPlanet.Objects.buildingsLevels = this.createStartingBuildings();
      startingPlanet.Objects.orbitShips = [];

      slot.system.planets[slot.index] = startingPlanet;

      const player = new Player(
        playerId,
        name,
        [startingPlanet],
        new Map(),
        [],
        PlayerType.PLAYER,
        new Map()
      );

      galaxy.players.push(player);
      galaxy.humanPlayerMap.set(playerId, player);
      galaxy.playerNameMap.set(player.playerName, playerId);
    }
  }

  private collectAvailablePlanets(
    galaxy: Galaxy
  ): Array<{ system: SolarSystem; planet: Planet; index: number }> {
    const planets: Array<{ system: SolarSystem; planet: Planet; index: number }> = [];
    const playersById = new Map<number, Player>(
      galaxy.players.map((player) => [player.playerId, player])
    );

    for (const row of galaxy.stars) {
      for (const system of row) {
        if (system.isVoid || system.isGalaxyCenter) {
          continue;
        }

        system.planets.forEach((planet, index) => {
          if (planet.Info.ownerId === null) {
            planets.push({ system, planet, index });
            return;
          }

          const owner = playersById.get(planet.Info.ownerId);
          if (!owner) {
            planets.push({ system, planet, index });
            return;
          }

          if (owner.type === PlayerType.NEUTRAL || owner.type === PlayerType.ABANDONED) {
            planets.push({ system, planet, index });
          }
        });
      }
    }

    return planets;
  }

  private createStartingBuildings(): Map<BuildingType, number> {
    const map = new Map<BuildingType, number>();
    const starters: BuildingType[] = [
      BuildingType.METAL_MINE,
      BuildingType.CRYSTAL_MINE,
      BuildingType.SOLAR_WIND_GEOTHERMAL,
      BuildingType.NUCLEAR_PLANT,
      BuildingType.METAL_STORAGE,
      BuildingType.CRYSTAL_STORAGE,
      BuildingType.DEUTERIUM_TANK,
      BuildingType.ROBOTICS_FACTORY
    ];

    for (const type of starters) {
      map.set(type, 1);
    }

    return map;
  }

  private buildPlanetName(
    systemName: string,
    index: number,
    planetType: PlanetType
  ): string {
    const typeInitial = planetType.charAt(0);
    return `${systemName} ${index}-${typeInitial}`;
  }
}
