import { Galaxy } from './galaxy';
import { Planet } from './planet';
import { SolarSystem } from './solar-system';
import { defaultBotProfileIdForPlayerId, Player } from '../player';
import { GameType } from '../enums/game-type';
import { PlayerType } from '../enums/player-type';
import { PlanetType } from '../enums/planet-type';
import { expandBotProfileCounts } from '../game-api-types';
import type { GalaxySetup } from '../game-api-types';
import { RngBuildingGenerator } from '../../generators/rng-building-generator';
import { RngTechnologyGenerator } from '../../generators/rng-technology-generator';
import { RngShipsGenerator } from '../../generators/rng-ships-generator';
import { RngResourceGenerator } from '../../generators/rng-resource-generator';
import { ShipBlueprintsFactory } from '../../factories/ship-blueprints.factory';
import { BuildingType } from '../enums/building-type';
import { DefenceType } from '../enums/defence-type';
import { StartingHomeworldPreset } from '../enums/starting-homeworld-preset';
import { TechnologyType } from '../enums/technology-type';
import { ShipType } from '../enums/ship-type';
import { ManyShips } from '../fleets/many-ships';
import { ResourcesPack } from '../resources-pack';
import { ShipInstance } from '../fleets/ship-instance';
import { ManyDefences } from '../defences/many-defences';
import { createTutorialReadState } from '../../tutorial/tutorial-types';


export class GalaxyCreator {
  private static readonly TEST_RANDOM_PLANETS_COUNT = 3;
  private static readonly TEST_STARTING_SHIPS_PER_TYPE = 10;
  private static readonly HOME_SYSTEM_NEUTRAL_LEVEL = 3;
  private static readonly TEST_RANDOM_PLANET_LEVEL_MIN = 4;
  private static readonly TEST_RANDOM_PLANET_LEVEL_MAX = 12;
  private static readonly TEST_RANDOM_TECH_LEVEL_MIN = 4;
  private static readonly TEST_RANDOM_TECH_LEVEL_MAX = 12;
  private static readonly TEST_RANDOM_PLANET_STARTING_RESOURCES = 10000;

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
            new Set(),
            new Map()
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
    this.assignStartingBots(galaxy);
    this.applyTestingSetupOptions(galaxy, playerNames);

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
            if (planet.info.ownerId !== null) {
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
            const ships = shipGenerator.generate(level, targetShipsValue);

            planet.info.ownerId = nextPlayerId;
            this.applyBuildingLevelsToPlanet(planet, buildingGenerator.generate(level));
            planet.rBDSFTQ.ships = ManyShips.fromShipInstances(ships);

            const player = new Player(
              nextPlayerId,
              playerName,
              [planet],
              tech,
              [],
              PlayerType.NEUTRAL,
              createTutorialReadState(true)
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

  private applyTestingSetupOptions(galaxy: Galaxy, playerNames: string[]): void {
    if (!this.setup.createRandomPlanets && !this.setup.createStartingShips) {
      return;
    }

    const player = this.resolvePrimaryPlayerForTesting(galaxy, playerNames);
    if (!player) {
      return;
    }

    if (this.setup.createRandomPlanets) {
      this.assignRandomPlanetsToPlayer(galaxy, player, GalaxyCreator.TEST_RANDOM_PLANETS_COUNT);
      this.assignRandomTechToPlayer(player);
    }

    if (this.setup.createStartingShips) {
      this.assignStartingShipsToPlayerPlanets(player, GalaxyCreator.TEST_STARTING_SHIPS_PER_TYPE);
    }
  }

  private resolvePrimaryPlayerForTesting(galaxy: Galaxy, playerNames: string[]): Player | null {
    const primaryName = playerNames[0]?.trim();
    if (primaryName) {
      for (const player of galaxy.humanPlayerMap.values()) {
        if (player.playerName === primaryName) {
          return player;
        }
      }
    }

    return galaxy.humanPlayerMap.values().next().value ?? null;
  }

  private assignRandomPlanetsToPlayer(galaxy: Galaxy, player: Player, amount: number): void {
    const availablePlanets = this.collectAvailablePlanets(galaxy)
      .filter((slot) => slot.planet.basicInfo.type !== PlanetType.ASTEROIDS);
    const targetAmount = Math.max(0, Math.floor(amount));
    const randomBuildingGenerator = new RngBuildingGenerator();

    for (let index = 0; index < targetAmount; index += 1) {
      if (availablePlanets.length === 0) {
        return;
      }

      const candidateIndex = this.randomInt(0, availablePlanets.length - 1);
      const slot = availablePlanets.splice(candidateIndex, 1)[0];
      slot.planet.info.ownerId = player.playerId;

      const randomLevel = this.randomInt(
        GalaxyCreator.TEST_RANDOM_PLANET_LEVEL_MIN,
        GalaxyCreator.TEST_RANDOM_PLANET_LEVEL_MAX
      );
      this.applyBuildingLevelsToPlanet(slot.planet, randomBuildingGenerator.generate(randomLevel));
      slot.planet.rBDSFTQ.resources = new ResourcesPack(
        GalaxyCreator.TEST_RANDOM_PLANET_STARTING_RESOURCES,
        GalaxyCreator.TEST_RANDOM_PLANET_STARTING_RESOURCES,
        GalaxyCreator.TEST_RANDOM_PLANET_STARTING_RESOURCES
      );
      slot.planet.rBDSFTQ.ships = ManyShips.empty();
      player.planets.push(slot.planet);
    }
  }

  private assignRandomTechToPlayer(player: Player): void {
    const randomTechGenerator = new RngTechnologyGenerator();
    const randomLevel = this.randomInt(
      GalaxyCreator.TEST_RANDOM_TECH_LEVEL_MIN,
      GalaxyCreator.TEST_RANDOM_TECH_LEVEL_MAX
    );
    const randomTech = randomTechGenerator.generate(randomLevel);

    player.tech.clear();
    for (const [techType, level] of randomTech.entries()) {
      if (level <= 0) {
        continue;
      }

      player.tech.set(techType, level);
    }
  }

  private assignStartingShipsToPlayerPlanets(player: Player, amountPerType: number): void {
    const normalizedAmount = Math.max(0, Math.floor(amountPerType));
    if (normalizedAmount <= 0) {
      return;
    }

    const blueprints = ShipBlueprintsFactory.fromDefaultJson();
    const shipsByType = Array.from(blueprints.shipsMap.values());
    if (shipsByType.length === 0) {
      return;
    }

    for (const planet of player.planets) {
      const ships: ShipInstance[] = [];
      for (const ship of shipsByType) {
        for (let count = 0; count < normalizedAmount; count += 1) {
          ships.push(new ShipInstance(
            ship,
            ship.hullPointsCapacity,
            ship.shieldCapacity,
            ship.cargoCapacity,
            []
          ));
        }
      }

      planet.rBDSFTQ.ships = ManyShips.fromShipInstances(ships);
    }
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
      const playerId = this.nextAvailablePlayerId(galaxy);

      const previousOwner = slot.planet.info.ownerId !== null
        ? playersById.get(slot.planet.info.ownerId) ?? null
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
        slot.planet.basicInfo.name,
        slot.planet.basicInfo.order,
        slot.system,
        playerId
      );
      startingPlanet.basicInfo.name = this.buildPlanetName(
        slot.system.name,
        slot.planet.basicInfo.order,
        startingPlanet.basicInfo.type
      );
      this.applyStartingHomeworldPreset(startingPlanet);

      slot.system.planets[slot.index] = startingPlanet;

      const player = new Player(
        playerId,
        name,
        [startingPlanet],
        this.createStartingTechLevels(),
        [],
        PlayerType.PLAYER,
        createTutorialReadState(this.setup.skipTutorial === true)
      );

      galaxy.players.push(player);
      galaxy.humanPlayerMap.set(playerId, player);
      galaxy.playerNameMap.set(player.playerName, playerId);

      this.ensureHomeSystemNeutralPlanet(galaxy, player);
    }
  }

  private assignStartingBots(galaxy: Galaxy): void {
    const targetCount = Math.max(0, Math.floor(this.setup.botsAmount));
    if (targetCount <= 0) {
      return;
    }

    const availablePlanets = this.collectAvailablePlanets(galaxy);
    if (availablePlanets.length === 0) {
      return;
    }

    const configuredProfiles = expandBotProfileCounts(this.setup.botProfileCounts);

    for (let index = 0; index < targetCount; index += 1) {
      if (availablePlanets.length === 0) {
        return;
      }

      const candidateIndex = this.randomInt(0, availablePlanets.length - 1);
      const slot = availablePlanets.splice(candidateIndex, 1)[0];
      const playerId = this.nextAvailablePlayerId(galaxy);
      const botName = `Bot-${index + 1}`;

      const startingPlanet = Planet.createStartingPlanet(
        slot.planet.basicInfo.name,
        slot.planet.basicInfo.order,
        slot.system,
        playerId
      );
      startingPlanet.basicInfo.name = this.buildPlanetName(
        slot.system.name,
        slot.planet.basicInfo.order,
        startingPlanet.basicInfo.type
      );
      this.applyStartingHomeworldPreset(startingPlanet);

      slot.system.planets[slot.index] = startingPlanet;

      const player = new Player(
        playerId,
        botName,
        [startingPlanet],
        this.createStartingTechLevels(),
        [],
        PlayerType.BOT,
        createTutorialReadState(true),
        [],
        1,
        [],
        1,
        {
          botProfileId: configuredProfiles[index] ?? defaultBotProfileIdForPlayerId(playerId),
          botMemory: null
        }
      );

      galaxy.players.push(player);
      galaxy.botPlayerMap.set(playerId, player);
      galaxy.playerNameMap.set(player.playerName, playerId);

      this.ensureHomeSystemNeutralPlanet(galaxy, player);
    }
  }

  private ensureHomeSystemNeutralPlanet(galaxy: Galaxy, player: Player): void {
    if (this.setup.neutralBotsAmount <= 0) {
      return;
    }

    if (player.type !== PlayerType.PLAYER && player.type !== PlayerType.BOT) {
      return;
    }

    const homePlanet = player.planets[0];
    const homeSystem = homePlanet?.basicInfo.solarSystem;
    if (!homePlanet || !homeSystem) {
      return;
    }

    const neutralPlanet = this.findOrCreateSecondaryHomeSystemPlanet(homeSystem, homePlanet);
    this.assignNeutralOwnerToPlanet(galaxy, neutralPlanet, GalaxyCreator.HOME_SYSTEM_NEUTRAL_LEVEL);
  }

  private findOrCreateSecondaryHomeSystemPlanet(system: SolarSystem, homePlanet: Planet): Planet {
    const existingPlanet = system.planets.find((planet) =>
      planet !== homePlanet
      && planet.basicInfo.type !== PlanetType.ASTEROIDS
      && planet.info.ownerId === null
    );

    if (existingPlanet) {
      return existingPlanet;
    }

    const nextOrder = system.planets.length + 1;
    let createdPlanet = Planet.createRandomEmpty('', nextOrder, system, null);
    while (createdPlanet.basicInfo.type === PlanetType.ASTEROIDS) {
      createdPlanet = Planet.createRandomEmpty('', nextOrder, system, null);
    }

    createdPlanet.basicInfo.name = this.buildPlanetName(
      system.name,
      nextOrder,
      createdPlanet.basicInfo.type
    );
    system.planets.push(createdPlanet);
    return createdPlanet;
  }

  private assignNeutralOwnerToPlanet(galaxy: Galaxy, planet: Planet, level: number): void {
    const normalizedLevel = Math.max(1, Math.floor(level));
    const buildingGenerator = new RngBuildingGenerator();
    const techGenerator = new RngTechnologyGenerator();
    const shipGenerator = new RngShipsGenerator();
    const resourceGenerator = new RngResourceGenerator();
    const targetShipsValue = resourceGenerator
      .generateSimple(normalizedLevel)
      .getTotalValuedResourceAmount();
    const ships = shipGenerator.generate(normalizedLevel, targetShipsValue);
    const playerId = this.nextAvailablePlayerId(galaxy);
    const playerName = `N-${playerId}`;

    planet.info.ownerId = playerId;
    this.applyBuildingLevelsToPlanet(planet, buildingGenerator.generate(normalizedLevel));
    planet.rBDSFTQ.resources = resourceGenerator.generateSimple(normalizedLevel);
    planet.rBDSFTQ.ships = ManyShips.fromShipInstances(ships);

    const player = new Player(
      playerId,
      playerName,
      [planet],
      techGenerator.generate(normalizedLevel),
      [],
      PlayerType.NEUTRAL,
      createTutorialReadState(true)
    );

    galaxy.players.push(player);
    galaxy.neutralPlayerMap.set(player.playerId, player);
    galaxy.playerNameMap.set(player.playerName, player.playerId);
  }

  private nextAvailablePlayerId(galaxy: Galaxy): number {
    return galaxy.players.reduce(
      (maxId, player) => Math.max(maxId, player.playerId),
      0
    ) + 1;
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
          if (planet.info.ownerId === null) {
            planets.push({ system, planet, index });
            return;
          }

          const owner = playersById.get(planet.info.ownerId);
          if (!owner) {
            planets.push({ system, planet, index });
            return;
          }

          if (owner.type === PlayerType.NEUTRAL) {
            planets.push({ system, planet, index });
          }
        });
      }
    }

    return planets;
  }

  private createStartingBuildings(): Map<BuildingType, number> {
    const map = new Map<BuildingType, number>();
    switch (this.setup.startingHomeworldPreset) {
      case StartingHomeworldPreset.LOW:
        map.set(BuildingType.METAL_STORAGE, 1);
        map.set(BuildingType.CRYSTAL_STORAGE, 1);
        map.set(BuildingType.DEUTERIUM_TANK, 1);
        map.set(BuildingType.METAL_MINE, 1);
        map.set(BuildingType.CRYSTAL_MINE, 1);
        map.set(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
        map.set(BuildingType.NUCLEAR_PLANT, 1);
        map.set(BuildingType.ROBOTICS_FACTORY, 1);
        break;
      case StartingHomeworldPreset.HIGH:
        map.set(BuildingType.METAL_STORAGE, 2);
        map.set(BuildingType.CRYSTAL_STORAGE, 2);
        map.set(BuildingType.DEUTERIUM_TANK, 2);
        map.set(BuildingType.METAL_MINE, 3);
        map.set(BuildingType.CRYSTAL_MINE, 2);
        map.set(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
        map.set(BuildingType.SOLAR_WIND_GEOTHERMAL, 2);
        map.set(BuildingType.NUCLEAR_PLANT, 2);
        map.set(BuildingType.FUSION_REACTOR, 1);
        map.set(BuildingType.ROBOTICS_FACTORY, 3);
        map.set(BuildingType.SHIPYARD, 2);
        map.set(BuildingType.RESEARCH_LAB, 1);
        break;
      case StartingHomeworldPreset.MEDIUM:
      default:
        map.set(BuildingType.METAL_STORAGE, 1);
        map.set(BuildingType.CRYSTAL_STORAGE, 1);
        map.set(BuildingType.DEUTERIUM_TANK, 1);
        map.set(BuildingType.METAL_MINE, 2);
        map.set(BuildingType.CRYSTAL_MINE, 1);
        map.set(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
        map.set(BuildingType.SOLAR_WIND_GEOTHERMAL, 2);
        map.set(BuildingType.NUCLEAR_PLANT, 2);
        map.set(BuildingType.ROBOTICS_FACTORY, 2);
        map.set(BuildingType.SHIPYARD, 1);
        map.set(BuildingType.RESEARCH_LAB, 1);
        break;
    }

    return map;
  }

  private createStartingTechLevels(): Map<TechnologyType, number> {
    const map = new Map<TechnologyType, number>();

    switch (this.setup.startingHomeworldPreset) {
      case StartingHomeworldPreset.LOW:
        break;
      case StartingHomeworldPreset.HIGH:
        map.set(TechnologyType.FUSION_DRIVE, 1);
        map.set(TechnologyType.HYPERSPACE_DRIVE, 1);
        map.set(TechnologyType.COMPUTER_TECHNOLOGY, 1);
        map.set(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);
        map.set(TechnologyType.ADAPTIVE_TECHNOLOGY, 1);
        break;
      case StartingHomeworldPreset.MEDIUM:
      default:
        map.set(TechnologyType.FUSION_DRIVE, 1);
        map.set(TechnologyType.HYPERSPACE_DRIVE, 1);
        map.set(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
        break;
    }

    return map;
  }

  private createStartingShips(): ManyShips {
    const ships = ManyShips.empty();

    switch (this.setup.startingHomeworldPreset) {
      case StartingHomeworldPreset.LOW:
        break;
      case StartingHomeworldPreset.HIGH:
        ships.addUndamaged(ShipType.FIGHTER, 8);
        ships.addUndamaged(ShipType.SPY_PROBE, 16);
        ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
        ships.addUndamaged(ShipType.TRANSPORTER, 1);
        ships.addUndamaged(ShipType.COLONIZER, 1);
        break;
      case StartingHomeworldPreset.MEDIUM:
      default:
        ships.addUndamaged(ShipType.SPY_PROBE, 8);
        ships.addUndamaged(ShipType.TRANSPORTER, 1);
        break;
    }

    return ships;
  }

  private createStartingDefences(): ManyDefences {
    const defences = ManyDefences.empty();

    switch (this.setup.startingHomeworldPreset) {
      case StartingHomeworldPreset.LOW:
        break;
      case StartingHomeworldPreset.HIGH:
        defences.addUndamaged(DefenceType.SAM_SITE, 10);
        break;
      case StartingHomeworldPreset.MEDIUM:
      default:
        defences.addUndamaged(DefenceType.SAM_SITE, 4);
        break;
    }

    return defences;
  }

  private applyStartingHomeworldPreset(planet: Planet): void {
    this.applyBuildingLevelsToPlanet(planet, this.createStartingBuildings());
    planet.rBDSFTQ.resources = this.createStartingResources();
    planet.rBDSFTQ.defences = this.createStartingDefences();
    planet.rBDSFTQ.ships = this.createStartingShips();
  }

  private applyBuildingLevelsToPlanet(planet: Planet, buildingLevels: Map<BuildingType, number>): void {
    planet.rBDSFTQ.buildingsLevels.clear();
    planet.rBDSFTQ.buildingsCurrentPowerConsumption.clear();

    for (const [buildingType, level] of buildingLevels.entries()) {
      planet.setBuildingLevel(buildingType, level);
    }
  }

  private createStartingResources(): ResourcesPack {
    return new ResourcesPack(
      this.setup.startingResources.metal,
      this.setup.startingResources.crystal,
      this.setup.startingResources.deuterium
    );
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


