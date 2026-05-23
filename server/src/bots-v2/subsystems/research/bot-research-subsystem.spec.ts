import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { ResearchHelperFor } from '../../../../../src/app/models/tech/research-helper-for.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import type { BotProposal } from '../../bot-v2-types.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { TECHNOLOGY_BLUEPRINTS } from '../../../game-commands/command-helpers.js';
import { BotResearchSubsystem } from './bot-research-subsystem.js';

describe('BotResearchSubsystem', () => {
  it('emits one global research proposal and prefers unaffordable weaker helpers first', () => {
    const { galaxy, bot, planets } = createResearchWorld(3, new Map([
      [TechnologyType.INTERGALACTIC_RESEARCH_NETWORK, 1]
    ]));
    const [mainPlanet, weakHelperPlanet, strongReservePlanet] = planets;
    configureResearchPlanet(mainPlanet, {
      researchLabLevel: 3,
      resources: new ResourcesPack(5000, 5000, 20)
    });
    configureResearchPlanet(weakHelperPlanet, {
      researchLabLevel: 1,
      resources: new ResourcesPack(0, 0, 0)
    });
    weakHelperPlanet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 0);
    configureResearchPlanet(strongReservePlanet, {
      researchLabLevel: 2,
      resources: new ResourcesPack(5000, 5000, 20)
    });

    const result = runResearchSubsystem(galaxy, bot);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.kind).toBe('RESEARCH');
    expect(result.proposals[0]?.requestPayload.x).toBe(mainPlanet.basicInfo.solarSystem.coordinates.x);
    expect(result.proposals[0]?.requestPayload.z).toBe(mainPlanet.basicInfo.order);
    expect(result.proposals[0]?.requestPayload.helperPlanets).toEqual([
      {
        x: weakHelperPlanet.basicInfo.solarSystem.coordinates.x,
        y: weakHelperPlanet.basicInfo.solarSystem.coordinates.y,
        z: weakHelperPlanet.basicInfo.order
      }
    ]);
  });

  it('widens the affordability window by one turn when no research is affordable within five turns', () => {
    const { galaxy, bot, planets } = createResearchWorld(1, new Map([
      [TechnologyType.ENERGY_TECHNOLOGY, 4],
      [TechnologyType.MATERIAL_TECHNOLOGY, 4],
      [TechnologyType.HYPERSPACE_TECHNOLOGY, 4],
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 4],
      [TechnologyType.COMPUTER_TECHNOLOGY, 4],
      [TechnologyType.ASTROPHYSICS_TECHNOLOGY, 4],
      [TechnologyType.ADAPTIVE_TECHNOLOGY, 4],
      [TechnologyType.INTERGALACTIC_RESEARCH_NETWORK, 4],
      [TechnologyType.SHIELDING_TECHNOLOGY, 4],
      [TechnologyType.ARMOUR_TECHNOLOGY, 4],
      [TechnologyType.RAILGUNS_WEAPONS, 4],
      [TechnologyType.BEAMS_WEAPONS, 4],
      [TechnologyType.MISSILES_WEAPONS, 4],
      [TechnologyType.FUSION_DRIVE, 4],
      [TechnologyType.HYPERSPACE_DRIVE, 4]
    ]));
    const [planet] = planets;
    configureResearchPlanet(planet, {
      researchLabLevel: 10,
      resources: new ResourcesPack(0, 0, 0)
    });

    const memory = createDefaultBotMemoryV2();
    const initialSnapshot = buildSnapshot(galaxy, bot);
    const researchCost = TECHNOLOGY_BLUEPRINTS.get(TechnologyType.ASTROPHYSICS_TECHNOLOGY)!.getCostForLevel(5);
    const deuteriumIncome = Math.max(1, initialSnapshot.planets[0]!.economy.income.deuterium);
    planet.rBDSFTQ.resources = new ResourcesPack(
      researchCost.metal,
      researchCost.crystal,
      Math.max(0, researchCost.deuterium - (deuteriumIncome * 6))
    );

    const result = runResearchSubsystem(galaxy, bot, memory);

    expect(result.proposals).toHaveLength(1);
    expect(memory.research.affordabilityWindowTurns).toBe(6);
    expect(memory.research.lastWindowIncreaseTurn).toBe(galaxy.currentTurn);
  });

  it('does not use planets already assigned as research helpers as main labs', () => {
    const { galaxy, bot, planets } = createResearchWorld(2);
    const [occupiedHelperPlanet, fallbackMainPlanet] = planets;
    configureResearchPlanet(occupiedHelperPlanet, {
      researchLabLevel: 3,
      resources: new ResourcesPack(5000, 5000, 20)
    });
    configureResearchPlanet(fallbackMainPlanet, {
      researchLabLevel: 2,
      resources: new ResourcesPack(5000, 5000, 20)
    });
    occupiedHelperPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(
      { x: 9, y: 9, z: 9 },
      TechnologyType.ENERGY_TECHNOLOGY
    );

    const result = runResearchSubsystem(galaxy, bot);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]?.requestPayload.z).toBe(fallbackMainPlanet.basicInfo.order);
    expect(result.proposals[0]?.requestPayload.helperPlanets).toEqual([]);
  });

  it('biases toward Adaptive Technology when colonization pressure is reported by Strategic Development', () => {
    const { galaxy, bot, planets } = createResearchWorld(1);
    const [planet] = planets;
    configureResearchPlanet(planet, {
      researchLabLevel: 5,
      resources: new ResourcesPack(20000, 20000, 20000)
    });
    bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.ASTROPHYSICS_TECHNOLOGY, 1);
    bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 1);

    const result = runResearchSubsystem(galaxy, bot, createDefaultBotMemoryV2(), [{
      proposalId: 'strategic-development:pressure',
      subsystemId: 'STRATEGIC_DEVELOPMENT',
      kind: 'BUILDING',
      status: 'PROPOSED',
      goalKey: 'strategic-development:pressure',
      dedupeKey: 'strategic-development:pressure',
      summary: 'Pressure marker.',
      planetId: null,
      targetCoordinates: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order
      },
      expectedValue: 1,
      urgency: 1,
      risk: 1,
      confidence: 1,
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      requestPayload: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order,
        buildingType: BuildingType.METAL_MINE
      },
      blockers: [],
      expiresOnTurn: galaxy.currentTurn + 1,
      debug: {
        adaptiveColonizationPressureActive: true,
        adaptiveColonizationBlockedCandidateCount: 1
      }
    }]);

    expect(result.proposals[0]?.requestPayload.technologyType).toBe(TechnologyType.ADAPTIVE_TECHNOLOGY);
    expect(result.proposals[0]?.debug.adaptiveColonizationBias).toBeGreaterThan(0);
  });
});

function runResearchSubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory = createDefaultBotMemoryV2(),
  priorProposals: BotProposal[] = []
) {
  const subsystem = new BotResearchSubsystem();
  return subsystem.generate({
    snapshot: buildSnapshot(galaxy, bot),
    memory,
    priorProposals
  });
}

function buildSnapshot(galaxy: Galaxy, bot: Player) {
  return buildBotWorldSnapshot(galaxy, bot, {
    mode: 'SHADOW',
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      research: true,
      critical: false,
      strategicDevelopment: false,
      strategicMilitary: false,
      strategicDiplomatic: false,
      weightManager: false
    }
  });
}

function createResearchWorld(
  planetCount: number,
  tech = new Map<TechnologyType, number>()
): {
  galaxy: Galaxy;
  bot: Player;
  planets: Planet[];
} {
  const systems: SolarSystem[] = [];
  const planets: Planet[] = [];
  for (let index = 0; index < planetCount; index += 1) {
    const order = index + 1;
    const localSystem = new SolarSystem(
      `ResearchSys ${order}`,
      1,
      false,
      false,
      { x: index, y: 0 },
      new Set(),
      new Map()
    );
    const planet = Planet.createStartingPlanet(`Research ${order}`, 1, localSystem, 1);
    localSystem.planets[1] = planet;
    systems.push(localSystem);
    planets.push(planet);
  }

  const bot = new Player(
    1,
    'Bot-Research',
    planets,
    tech,
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const galaxy = new Galaxy(
    'Research Test',
    [bot],
    [systems],
    1,
    [],
    1,
    new Map(),
    new Map([[1, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return { galaxy, bot, planets };
}

function configureResearchPlanet(
  planet: Planet,
  options: {
    researchLabLevel: number;
    resources: ResourcesPack;
  }
): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 2);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, options.researchLabLevel);
  planet.rBDSFTQ.resources = options.resources;
}
