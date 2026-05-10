import { describe, expect, it } from 'vitest';
import { BuildingQueueEntry } from '../../../../../src/app/models/buildings/building-queue-entry.js';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { ManyShips } from '../../../../../src/app/models/fleets/many-ships.js';
import { ShipyardQueueEntry } from '../../../../../src/app/models/fleets/shipyard-queue-entry.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { TechnologyQueueEntry } from '../../../../../src/app/models/tech/technology-queue-entry.js';
import { Player } from '../../../../../src/app/models/player.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotWarfareSubsystem } from './bot-warfare-subsystem.js';

describe('BotWarfareSubsystem', () => {
  it('emits a structural unlock research request when fighter tech is missing', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);

    const result = runWarfareSubsystem(galaxy, bot);
    const fighterGoal = result.goals?.find((goal) =>
      goal.goalFamily === 'UNLOCK'
      && goal.finalShipType === ShipType.FIGHTER
    );

    expect(result.planetResults?.[0]?.branch).toBe('UNLOCK');
    expect(fighterGoal).toBeDefined();
    expect(result.proposals[0]?.kind).toBe('RESEARCH');
    expect(result.proposals[0]?.debug?.goalFamily).toBe('UNLOCK');
    expect([
      ShipType.FIGHTER,
      ShipType.ASSAULT_FIGHTER
    ]).toContain(result.proposals[0]?.debug?.finalShipType as ShipType);
  });

  it('emits a shipyard capacity request when shipyard is below avg-industry target', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    setBaselineShipTech(bot, 2);

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.goals?.some((goal) =>
      goal.goalFamily === 'CAPACITY'
      && goal.finalBuildingType === BuildingType.SHIPYARD
    )).toBe(true);
    expect(result.proposals.some((proposal) =>
      proposal.kind === 'BUILDING'
      && (proposal.requestPayload as { buildingType?: BuildingType }).buildingType === BuildingType.SHIPYARD
    )).toBe(true);
  });

  it('reserves exactly one cargo production request when cargo ships are unlocked', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 5);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 5);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 5);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 6);
    planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 5);
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 2);
    setBaselineShipTech(bot, 4);
    bot.setTechLevel(TechnologyType.RAILGUNS_WEAPONS, 2);
    addInstalledShips(planet, {
      [ShipType.FIGHTER]: 20,
      [ShipType.ASSAULT_FIGHTER]: 10,
      [ShipType.CORVETTE]: 8,
      [ShipType.CRUISER]: 4,
      [ShipType.TRANSPORTER]: 2
    });

    const result = runWarfareSubsystem(galaxy, bot);
    const cargoProposals = result.proposals.filter((proposal) => {
      const shipType = (proposal.requestPayload as { shipType?: ShipType }).shipType;
      return shipType === ShipType.TRANSPORTER
        || shipType === ShipType.MASS_HAULER
        || shipType === ShipType.CARGO_SUPPORT;
    });
    const productionProposals = result.proposals.filter((proposal) => proposal.kind === 'SHIPYARD');

    expect(result.goals?.length).toBeGreaterThanOrEqual(5);
    expect(result.proposals).toHaveLength(5);
    expect(productionProposals.length).toBeGreaterThanOrEqual(3);
    expect(cargoProposals).toHaveLength(1);
  });

  it('emits a first-class no-action planet result when local queues block all requests', () => {
    const { galaxy, bot, planet } = createBotWorld();
    configureBaseWarfarePlanet(planet);
    planet.setBuildingLevel(BuildingType.METAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.METAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 4);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 4);
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
    planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
    setBaselineShipTech(bot, 3);
    planet.rBDSFTQ.buildingQueue = Array.from({ length: 10 }, (_, index) => new BuildingQueueEntry(
      BuildingType.SHIPYARD,
      planet.getBuildingLevel(BuildingType.SHIPYARD) + index + 1,
      0
    ));
    planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
      TechnologyType.FUSION_DRIVE,
      1,
      0,
      []
    );
    planet.rBDSFTQ.shipyardQueue = Array.from({ length: 10 }, () => ShipyardQueueEntry.ship(
      ShipType.FIGHTER,
      1,
      0
    ));

    const result = runWarfareSubsystem(galaxy, bot);

    expect(result.proposals).toHaveLength(0);
    expect(result.planetResults?.[0]?.emittedRequestCount).toBe(0);
    expect(result.planetResults?.[0]?.noActionReason).not.toBeNull();
  });
});

function runWarfareSubsystem(galaxy: Galaxy, bot: Player) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
    enabled: true,
    shadowMode: true,
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: true,
        critical: false,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      },
    allowSupervisorAcceptance: false,
    allowExecution: false
  });

  return new BotWarfareSubsystem().generate({
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

function configureBaseWarfarePlanet(planet: Planet): void {
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
  planet.rBDSFTQ.resources = new ResourcesPack(10000, 10000, 10000);
  planet.rBDSFTQ.ships = ManyShips.empty();
  planet.rBDSFTQ.buildingQueue = [];
  planet.rBDSFTQ.shipyardQueue = [];
  planet.rBDSFTQ.currentResearchQueue = null;
}

function setBaselineShipTech(bot: Player, tier: number): void {
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, Math.max(1, tier));
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.MISSILES_WEAPONS, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, Math.max(1, tier - 1));
  bot.setTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY, 1);
}

function addInstalledShips(
  planet: Planet,
  counts: Partial<Record<ShipType, number>>
): void {
  const ships = ManyShips.empty();
  for (const [shipType, amount] of Object.entries(counts) as Array<[ShipType, number]>) {
    ships.addUndamaged(shipType, amount);
  }

  planet.rBDSFTQ.ships = ships;
}
