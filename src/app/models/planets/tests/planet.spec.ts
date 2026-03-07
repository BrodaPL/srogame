import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from '../planet';
import { PlanetType } from '../../enums/planet-type';
import { SolarSystem } from '../solar-system';
import { ResourcesPack } from '../../resources-pack';
import { PlanetaryParameters } from '../planetary-parameters';
import { BuildingType } from '../../enums/building-type';

describe('Planet', () => {
  const createPlanet = (overrides?: {
    metalModifier?: number;
    crystalModifier?: number;
    deuteriumModifier?: number;
  }): Planet => {
    const system = new SolarSystem(
      'Test System',
      -10,
      false,
      false,
      { x: 0, y: 0 },
      new Set(),
      new Map()
    );
    const modifiers = new PlanetaryParameters(
      overrides?.metalModifier ?? 1,
      overrides?.crystalModifier ?? 1,
      overrides?.deuteriumModifier ?? 1,
      1,
      1,
      1,
      1,
      0,
      0
    );

    return new Planet(
      new PlanetBasicInfo('Test Planet', PlanetType.BARREN, 0, 1, system, '', 100),
      new PlanetInfo(null, modifiers),
      new rBDSFTQ(
        new ResourcesPack(0, 0, 0),
        new Map(),
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        new ResourcesPack(0, 0, 0)
      ),
      new Map()
    );
  };

  it('returns production1 values for building levels and 0 for missing levels', () => {
    const planet = createPlanet();

    expect(planet.getBuildingProductionValue1(BuildingType.METAL_MINE)).toBe(0);

    planet.setBuildingLevel(BuildingType.METAL_MINE, 1);
    const levelOneValue = planet.getBuildingProductionValue1(BuildingType.METAL_MINE);
    console.log('getBuildingProductionValue1', { level: 1, levelOneValue });

    expect(levelOneValue).toBe(90);

    planet.setBuildingLevel(BuildingType.METAL_MINE, 99);
    const outOfRangeValue = planet.getBuildingProductionValue1(BuildingType.METAL_MINE);
    console.log('getBuildingProductionValue1', { level: 99, outOfRangeValue });

    expect(outOfRangeValue).toBe(0);
  });

  it('calculates resource gains with adaptive tech and planetary modifiers', () => {
    const planet = createPlanet({ metalModifier: 1.2, crystalModifier: 0.8, deuteriumModifier: 1.1 });

    planet.setBuildingLevel(BuildingType.METAL_MINE, 2);
    planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 1);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);

    const adaptiveTechLevel = 50;
    const multiplier = 1 + adaptiveTechLevel / 100;

    const metalGain = planet.getMetalGain(adaptiveTechLevel);
    const crystalGain = planet.getCrystalGain(adaptiveTechLevel);
    const deuteriumGain = planet.getDeuteriumGain(adaptiveTechLevel);

    console.log('resource gains', {
      adaptiveTechLevel,
      multiplier,
      metalGain,
      crystalGain,
      deuteriumGain
    });

    expect(metalGain).toBeCloseTo(140 * multiplier * 1.2, 8);
    expect(crystalGain).toBeCloseTo(60 * multiplier * 0.8, 8);
    expect(deuteriumGain).toBeCloseTo(60 * multiplier * 1.1, 8);
  });
});

