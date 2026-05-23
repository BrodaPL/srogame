import { describe, expect, it } from 'vitest';
import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from '../planet';
import { PlanetType } from '../../enums/planet-type';
import { SolarSystem } from '../solar-system';
import { ResourcesPack } from '../../resources-pack';
import { PlanetaryParameters } from '../planetary-parameters';
import { BuildingType } from '../../enums/building-type';
import { ManyShips } from '../../fleets/many-ships';
import { ManyDefences } from '../../defences/many-defences';
import { calculateTradePortCapacity } from '../../trade/trade-port-capacity';

describe('Planet', () => {
  const createSystem = (): SolarSystem => new SolarSystem(
    'Test System',
    -10,
    false,
    false,
    { x: 0, y: 0 },
    new Set(),
    new Map()
  );

  const createPlanet = (overrides?: {
    metalModifier?: number;
    crystalModifier?: number;
    deuteriumModifier?: number;
    scienceModifier?: number;
    industryModifier?: number;
    anomaliesAndNoise?: number;
    hyperspaceParameters?: number;
  }): Planet => {
    const system = createSystem();
    const modifiers = new PlanetaryParameters(
      overrides?.metalModifier ?? 1,
      overrides?.crystalModifier ?? 1,
      overrides?.deuteriumModifier ?? 1,
      1,
      1,
      overrides?.scienceModifier ?? 1,
      overrides?.industryModifier ?? 1,
      overrides?.anomaliesAndNoise ?? 0,
      overrides?.hyperspaceParameters ?? 0
    );

    return new Planet(
      new PlanetBasicInfo('Test Planet', PlanetType.BARREN, 0, 1, system, '', 100),
      new PlanetInfo(null, modifiers),
      new rBDSFTQ(
        new ResourcesPack(0, 0, 0),
        new Map(),
        new Map(),
        null,
        new Map(),
        ManyDefences.empty(),
        ManyShips.empty(),
        null,
        null,
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

    expect(levelOneValue).toBe(60);

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

    expect(metalGain).toBe(Math.floor(90 * multiplier * 1.2));
    expect(crystalGain).toBe(Math.floor(40 * multiplier * 0.8));
    expect(deuteriumGain).toBe(Math.floor(40 * multiplier * 1.1));
  });

  it('clamps fusion reactor effective stage by gross deuterium income while keeping the selected stage', () => {
    const planet = createPlanet({ deuteriumModifier: 0.1 });
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 10);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 4);
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 4);

    const operation = planet.resolveFusionReactorOperation(0, 0);

    expect(planet.getFusionReactorSelectedStage()).toBe(4);
    expect(operation.selectedStage).toBe(4);
    expect(operation.effectiveStage).toBe(2);
    expect(operation.deuteriumUpkeep).toBe(4);
    expect(operation.grossDeuteriumIncome).toBe(6);
    expect(operation.netDeuteriumIncome).toBe(2);
    expect(operation.isClamped).toBe(true);
  });

  it('resets fusion reactor selected stage to the new max when the reactor levels up', () => {
    const planet = createPlanet();
    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 2);
    planet.setFusionReactorSelectedStage(1);

    planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 3);

    expect(planet.getFusionReactorSelectedStage()).toBe(3);
  });

  it('preserves deuterium synthesizer income when fusion reactor is absent', () => {
    const planet = createPlanet();
    planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 10);
    planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 1);

    const operation = planet.resolveFusionReactorOperation(0, 0);

    expect(operation.selectedStage).toBe(0);
    expect(operation.effectiveStage).toBe(0);
    expect(operation.grossDeuteriumIncome).toBe(20);
    expect(operation.netDeuteriumIncome).toBe(20);
    expect(operation.deuteriumUpkeep).toBe(0);
    expect(operation.powerOutput).toBe(0);
  });

  it('scales building production by current power utilization and floors results', () => {
    const planet = createPlanet();
    planet.setBuildingLevel(BuildingType.METAL_MINE, 5);
    const fullProduction = planet.getBuildingProductionValue1(BuildingType.METAL_MINE);

    expect(planet.getMaxBuildingPowerConsumption(BuildingType.METAL_MINE)).toBe(5);
    expect(fullProduction).toBeGreaterThan(0);

    planet.setCurrentBuildingPowerConsumption(BuildingType.METAL_MINE, 3);

    expect(planet.getBuildingPowerUtilization(BuildingType.METAL_MINE)).toBeCloseTo(0.6, 8);
    expect(planet.getBuildingProductionValue1(BuildingType.METAL_MINE)).toBe(Math.floor(fullProduction * 0.6));
    expect(planet.getMetalGain(0)).toBe(Math.floor(fullProduction * 0.6));
  });

  it('applies the bunker-backed structural productivity floor to damaged buildings', () => {
    const planet = createPlanet();
    planet.setBuildingLevel(BuildingType.METAL_MINE, 1);

    planet.setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, 0);
    expect(planet.getBuildingProductionValue1(BuildingType.METAL_MINE)).toBe(1);

    planet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 3);
    expect(planet.getBuildingProductionValue1(BuildingType.METAL_MINE)).toBe(3);
  });

  it('preserves structural health percentage when a damaged building levels up', () => {
    const planet = createPlanet();
    planet.setBuildingLevel(BuildingType.METAL_MINE, 1);

    const levelOneMax = planet.getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);
    planet.setCurrentBuildingStructuralPoints(BuildingType.METAL_MINE, Math.floor(levelOneMax / 2));

    planet.setBuildingLevel(BuildingType.METAL_MINE, 2);

    const levelTwoMax = planet.getMaxBuildingStructuralPoints(BuildingType.METAL_MINE);
    expect(planet.getCurrentBuildingStructuralPoints(BuildingType.METAL_MINE)).toBe(Math.floor(levelTwoMax * 0.5));
  });

  it('applies terraformer penalty reduction only to penalized planetary parameters and caps them at 1', () => {
    const planet = createPlanet({
      metalModifier: 0.8,
      crystalModifier: 0.95,
      deuteriumModifier: 1.1,
      scienceModifier: 0.92,
      industryModifier: 0.4,
      anomaliesAndNoise: 0.35,
      hyperspaceParameters: 0.55
    });

    planet.setBuildingLevel(BuildingType.TERRAFORMER, 10);

    const effective = planet.getEffectivePlanetaryParameters();

    expect(effective.metalModifier).toBeCloseTo(0.9, 8);
    expect(effective.crystalModifier).toBe(1);
    expect(effective.deuteriumModifier).toBe(1.1);
    expect(effective.scienceModifier).toBe(1);
    expect(effective.industryModifier).toBeCloseTo(0.5, 8);
    expect(effective.anomaliesAndNoise).toBeCloseTo(0.35, 8);
    expect(effective.hyperspaceParameters).toBeCloseTo(0.55, 8);
  });

  it('scales terraformer penalty reduction with power and structural utilization', () => {
    const planet = createPlanet({ metalModifier: 0.8 });
    planet.setBuildingLevel(BuildingType.TERRAFORMER, 10);

    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(BuildingType.TERRAFORMER);
    planet.setCurrentBuildingPowerConsumption(BuildingType.TERRAFORMER, 15);
    planet.setCurrentBuildingStructuralPoints(BuildingType.TERRAFORMER, Math.floor(maxStructuralPoints / 2));

    expect(planet.getTerraformerPenaltyReduction()).toBeCloseTo(0.025, 8);
    expect(planet.getEffectivePlanetaryParameters().metalModifier).toBeCloseTo(0.825, 8);
  });

  it('keeps terraformer planet size increases permanently after completion', () => {
    const planet = createPlanet();

    expect(planet.basicInfo.size).toBe(100);

    planet.setBuildingLevel(BuildingType.TERRAFORMER, 1);
    expect(planet.basicInfo.size).toBe(104);

    planet.setCurrentBuildingPowerConsumption(BuildingType.TERRAFORMER, 0);
    planet.setCurrentBuildingStructuralPoints(BuildingType.TERRAFORMER, 0);
    expect(planet.basicInfo.size).toBe(104);

    planet.setBuildingLevel(BuildingType.TERRAFORMER, 10);
    expect(planet.basicInfo.size).toBe(140);

    planet.setBuildingLevel(BuildingType.TERRAFORMER, 0);
    expect(planet.basicInfo.size).toBe(140);
  });

  it('calculates live jump gate capacity from level, power, damage, hyperspace parameters, and tech', () => {
    const planet = createPlanet({ hyperspaceParameters: 1.2 });
    planet.setBuildingLevel(BuildingType.JUMP_GATE, 4);

    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(BuildingType.JUMP_GATE);
    planet.setCurrentBuildingPowerConsumption(BuildingType.JUMP_GATE, 10);
    planet.setCurrentBuildingStructuralPoints(BuildingType.JUMP_GATE, Math.floor(maxStructuralPoints / 2));

    expect(planet.getJumpGateCapacity(3)).toBe(34);
  });

  it('preserves fractional nanite production for multiplier-based calculations', () => {
    const planet = createPlanet();
    planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 1);

    expect(planet.getBuildingProductionValue1(BuildingType.NANITE_FACTORY)).toBe(1);
    expect(planet.getBuildingProductionValue1Exact(BuildingType.NANITE_FACTORY)).toBe(1.5);
  });

  it('calculates live trade port capacity from level, power, damage, hyperspace modifiers, tech, and jump gate bonus', () => {
    const planet = createPlanet({ hyperspaceParameters: 1.1 });
    planet.setBuildingLevel(BuildingType.INTERSTELLAR_TRADE_PORT, 2);
    planet.setBuildingLevel(BuildingType.JUMP_GATE, 1);

    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(BuildingType.INTERSTELLAR_TRADE_PORT);
    planet.setCurrentBuildingPowerConsumption(BuildingType.INTERSTELLAR_TRADE_PORT, 2);
    planet.setCurrentBuildingStructuralPoints(
      BuildingType.INTERSTELLAR_TRADE_PORT,
      Math.floor(maxStructuralPoints / 2)
    );

    expect(planet.getTradePortCapacity(2, 1)).toBe(calculateTradePortCapacity(
      2,
      1.1,
      2,
      1,
      1,
      0.25
    ));
  });

  it('calculates sensor phalanx range, half-range scan distance, and scan count from live effectiveness', () => {
    const planet = createPlanet({ anomaliesAndNoise: 1.5 });
    planet.setBuildingLevel(BuildingType.SENSOR_PHALANX, 4);

    const maxStructuralPoints = planet.getMaxBuildingStructuralPoints(BuildingType.SENSOR_PHALANX);
    planet.setCurrentBuildingPowerConsumption(BuildingType.SENSOR_PHALANX, 8);
    planet.setCurrentBuildingStructuralPoints(BuildingType.SENSOR_PHALANX, Math.floor(maxStructuralPoints / 2));

    expect(planet.getSensorPhalanxNormalRange()).toBe(3);
    expect(planet.getSensorPhalanxActiveScanRange()).toBe(1);
    expect(planet.getSensorPhalanxScansPerTurn()).toBe(1);
    expect(planet.getSensorPhalanxScanCost()).toBe(80);
  });

  it('tracks sensor phalanx scans per turn and resets on a new turn', () => {
    const planet = createPlanet({ anomaliesAndNoise: 1 });
    planet.setBuildingLevel(BuildingType.SENSOR_PHALANX, 9);

    expect(planet.getRemainingSensorPhalanxScans(5)).toBe(3);
    expect(planet.consumeSensorPhalanxScan(5)).toBe(true);
    expect(planet.getRemainingSensorPhalanxScans(5)).toBe(2);
    expect(planet.consumeSensorPhalanxScan(5)).toBe(true);
    expect(planet.consumeSensorPhalanxScan(5)).toBe(true);
    expect(planet.consumeSensorPhalanxScan(5)).toBe(false);
    expect(planet.getRemainingSensorPhalanxScans(6)).toBe(3);
  });

  it('creates starting planets with neutral multiplier parameters set to 1', () => {
    const system = createSystem();
    const startingPlanet = Planet.createStartingPlanet('Home', 1, system, 1);
    const parameters = startingPlanet.info.planetaryParameters;

    expect(parameters.metalModifier).toBe(1);
    expect(parameters.crystalModifier).toBe(1);
    expect(parameters.deuteriumModifier).toBe(1);
    expect(parameters.energyModifierRES).toBe(1);
    expect(parameters.energyModifierNuclear).toBe(1);
    expect(parameters.scienceModifier).toBe(1);
    expect(parameters.industryModifier).toBe(1);
    expect(parameters.anomaliesAndNoise).toBe(1);
    expect(parameters.hyperspaceParameters).toBe(1);
  });

  it('uses direct multiplier ranges for forced BARREN random planets', () => {
    const system = createSystem();
    for (let index = 0; index < 60; index += 1) {
      const planet = Planet.createRandomEmpty(`Barren-${index}`, 1, system, null, PlanetType.BARREN);
      const parameters = planet.info.planetaryParameters;

      expect(parameters.metalModifier).toBeGreaterThanOrEqual(0.7);
      expect(parameters.metalModifier).toBeLessThanOrEqual(1.5);
      expect(parameters.scienceModifier).toBeGreaterThanOrEqual(0.9);
      expect(parameters.scienceModifier).toBeLessThanOrEqual(1.5);
      expect(parameters.anomaliesAndNoise).toBeGreaterThanOrEqual(0.8);
      expect(parameters.anomaliesAndNoise).toBeLessThanOrEqual(1.6);
      expect(parameters.hyperspaceParameters).toBeGreaterThanOrEqual(0.2);
      expect(parameters.hyperspaceParameters).toBeLessThanOrEqual(1.5);
    }
  });

  it('uses the updated random planet base-size range', () => {
    const system = createSystem();
    for (let index = 0; index < 60; index += 1) {
      const planet = Planet.createRandomEmpty(`Sized-${index}`, 1, system, null);
      expect(planet.basicInfo.baseSize).toBeGreaterThanOrEqual(100);
      expect(planet.basicInfo.baseSize).toBeLessThanOrEqual(220);
    }
  });
});

