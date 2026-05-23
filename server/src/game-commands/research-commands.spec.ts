import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../src/app/models/enums/building-type.js';
import { PlayerType } from '../../../src/app/models/enums/player-type.js';
import { TechnologyType } from '../../../src/app/models/enums/technology-type.js';
import { Galaxy } from '../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../src/app/models/player.js';
import { ResearchHelperFor } from '../../../src/app/models/tech/research-helper-for.js';
import { TechnologyQueueEntry } from '../../../src/app/models/tech/technology-queue-entry.js';
import { updateResearchHelpers } from './research-commands.js';

describe('research commands', () => {
  it('replaces helper labs for active research without resetting invested progress', () => {
    const { galaxy, mainPlanet, helperA, helperB, helperC } = createResearchGalaxy();
    assignResearch(mainPlanet, TechnologyType.ENERGY_TECHNOLOGY, 1, 123, [helperA, helperB]);

    const result = updateResearchHelpers(
      { galaxy, playerId: 1 },
      {
        x: mainPlanet.basicInfo.solarSystem.coordinates.x,
        y: mainPlanet.basicInfo.solarSystem.coordinates.y,
        z: mainPlanet.basicInfo.order - 1,
        helperPlanets: [planetCoordinates(helperB), planetCoordinates(helperC)]
      }
    );

    expect(result.ok).toBe(true);
    expect(mainPlanet.rBDSFTQ.currentResearchQueue?.helperLabs).toEqual([
      planetCoordinates(helperB),
      planetCoordinates(helperC)
    ]);
    expect(mainPlanet.rBDSFTQ.currentResearchQueue?.investedResearchPower).toBe(123);
    expect(helperA.rBDSFTQ.researchHelperFor).toBeNull();
    expect(helperB.rBDSFTQ.researchHelperFor?.mainResearchCoordinates).toEqual(planetCoordinates(mainPlanet));
    expect(helperC.rBDSFTQ.researchHelperFor?.mainResearchCoordinates).toEqual(planetCoordinates(mainPlanet));
  });

  it('allows unassigning all helper labs from active research', () => {
    const { galaxy, mainPlanet, helperA, helperB } = createResearchGalaxy();
    assignResearch(mainPlanet, TechnologyType.ENERGY_TECHNOLOGY, 1, 80, [helperA, helperB]);

    const result = updateResearchHelpers(
      { galaxy, playerId: 1 },
      {
        ...planetCoordinates(mainPlanet),
        helperPlanets: []
      }
    );

    expect(result.ok).toBe(true);
    expect(mainPlanet.rBDSFTQ.currentResearchQueue?.helperLabs).toEqual([]);
    expect(mainPlanet.rBDSFTQ.currentResearchQueue?.investedResearchPower).toBe(80);
    expect(helperA.rBDSFTQ.researchHelperFor).toBeNull();
    expect(helperB.rBDSFTQ.researchHelperFor).toBeNull();
  });

  it('rejects helper labs already assigned to another active research', () => {
    const { galaxy, mainPlanet, helperA, otherMainPlanet, helperC } = createResearchGalaxy();
    assignResearch(mainPlanet, TechnologyType.ENERGY_TECHNOLOGY, 1, 10, [helperA]);
    assignResearch(otherMainPlanet, TechnologyType.COMPUTER_TECHNOLOGY, 1, 20, [helperC]);

    const result = updateResearchHelpers(
      { galaxy, playerId: 1 },
      {
        ...planetCoordinates(mainPlanet),
        helperPlanets: [planetCoordinates(helperC)]
      }
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain('busy');
    }
    expect(mainPlanet.rBDSFTQ.currentResearchQueue?.helperLabs).toEqual([planetCoordinates(helperA)]);
    expect(helperC.rBDSFTQ.researchHelperFor?.mainResearchCoordinates).toEqual(planetCoordinates(otherMainPlanet));
  });
});

function createResearchGalaxy(): {
  galaxy: Galaxy;
  mainPlanet: Planet;
  helperA: Planet;
  helperB: Planet;
  helperC: Planet;
  otherMainPlanet: Planet;
} {
  const system = new SolarSystem('Research Test', 5, false, false, { x: 2, y: 4 }, new Set<number>(), new Map());
  for (const planet of system.planets) {
    planet.info.ownerId = 1;
    planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 4);
  }

  const [mainPlanet, helperA, helperB, helperC, otherMainPlanet] = system.planets;
  const alpha = new Player(1, 'Alpha', [mainPlanet, helperA, helperB, helperC, otherMainPlanet], new Map(), [], PlayerType.PLAYER);
  alpha.setTechLevel(TechnologyType.INTERGALACTIC_RESEARCH_NETWORK, 2);
  const stars = Array.from({ length: 5 }, (_, y) =>
    Array.from({ length: 5 }, (_, x) => SolarSystem.createVoid({ x, y }))
  );
  stars[4]![2] = system;

  const galaxy = new Galaxy(
    'Research Galaxy',
    [alpha],
    stars,
    12,
    [],
    1
  );

  return {
    galaxy,
    mainPlanet,
    helperA,
    helperB,
    helperC,
    otherMainPlanet
  };
}

function assignResearch(
  mainPlanet: Planet,
  technologyType: TechnologyType,
  nextLevel: number,
  investedResearchPower: number,
  helperPlanets: Planet[]
): void {
  mainPlanet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
    technologyType,
    nextLevel,
    investedResearchPower,
    helperPlanets.map((planet) => planetCoordinates(planet))
  );

  for (const helperPlanet of helperPlanets) {
    helperPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(
      planetCoordinates(mainPlanet),
      technologyType
    );
  }
}

function planetCoordinates(planet: Planet) {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: planet.basicInfo.order - 1
  };
}
