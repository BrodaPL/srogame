import { describe, expect, it } from 'vitest';
import { EspionageReportGenerator } from '../espionage-report-generator';
import { Player } from '../../models/player';
import { PlayerType } from '../../models/enums/player-type';
import { TechnologyType } from '../../models/enums/technology-type';
import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from '../../models/planets/planet';
import { PlanetType } from '../../models/enums/planet-type';
import { SolarSystem } from '../../models/planets/solar-system';
import { ResourcesPack } from '../../models/resources-pack';
import { PlanetaryParameters } from '../../models/planets/planetary-parameters';
import { BuildingType } from '../../models/enums/building-type';
import { Ship } from '../../models/fleets/ship';
import { ShipInstance } from '../../models/fleets/ship-instance';
import { ShipType } from '../../models/enums/ship-type';
import { ShipPurpose } from '../../models/enums/ship-purpose';
import { HullClass } from '../../models/enums/hull-class';
import { ManyShips } from '../../models/fleets/many-ships';
import { DefenceBuildingInstances } from '../../models/reports/defence-building-instances';
import { DefenceType } from '../../models/enums/defence-type';
import { ManyDefences } from '../../models/defences/many-defences';
import { createTutorialReadState } from '../../tutorial/tutorial-types';

describe('EspionageReportGenerator', () => {
  const createPlayer = (
    playerId: number,
    playerName: string,
    techLevels: Map<TechnologyType, number>
  ): Player => new Player(playerId, playerName, [], techLevels, [], PlayerType.PLAYER, createTutorialReadState(true));

  const createPlanet = (system: SolarSystem, ships: ShipInstance[]): Planet => new Planet(
    new PlanetBasicInfo('Test', PlanetType.JUNGLE, 1, 1, system, '', 100),
    new PlanetInfo(2, new PlanetaryParameters(0, 0, 0, 0, 0, 0, 0, 0, 0)),
    new rBDSFTQ(
      new ResourcesPack(100, 200, 300),
      new Map<BuildingType, number>([
        [BuildingType.METAL_MINE, 4],
        [BuildingType.BUNKER_NETWORK, 9],
        [BuildingType.SHIPYARD, 2]
      ]),
      new Map<BuildingType, number>(),
      null,
      new Map<BuildingType, number>(),
      ManyDefences.fromData({
        undamagedDefencesCount: {
          [DefenceType.LIGHT_BEAM_CANNON]: 3,
          [DefenceType.SAM_SITE]: 2
        },
        damagedDefences: []
      }),
      ManyShips.fromShipInstances(ships),
      null,
      null,
      [],
      [],
      [],
      new ResourcesPack(0, 0, 0)
    ),
    new Map()
  );

  it('includes detailed data for high report levels', () => {
    const generator = new EspionageReportGenerator();
    const system = SolarSystem.createVoid({ x: 0, y: 0 });
    const ship = new Ship(
      ShipType.FIGHTER,
      '',
      HullClass.SMALL,
      false,
      1,
      0,
      10,
      30,
      5,
      0,
      [],
      0,
      0,
      new Set<ShipPurpose>([ShipPurpose.MILITARY]),
      0,
      new ResourcesPack(0, 0, 0),
      [],
      []
    );
    const ships = [
      new ShipInstance(ship, 10, 5, 0, []),
      new ShipInstance(ship, 10, 5, 0, [])
    ];
    const planet = createPlanet(system, ships);
    const attackerTech = new Map<TechnologyType, number>([
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 20]
    ]);
    const defenderTech = new Map<TechnologyType, number>([
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 4],
      [TechnologyType.ENERGY_TECHNOLOGY, 2]
    ]);
    const attacker = createPlayer(1, 'Attacker', attackerTech);
    const defender = createPlayer(2, 'Defender', defenderTech);

    const report = generator.createEspionageReport(attacker, defender, planet, 16);

    console.log('report-level-high', {
      createdTurn: report.createdTurn,
      planetaryParameters: report.planetaryParameters,
      averageBuildingLevel: report.averageBuildingLevel,
      averageTotalResources: report.averageTotalResources,
      averageTechLevel: report.averageTechLevel,
      totalDefencesAmount: report.totalDefencesAmount,
      totalShipsAmount: report.totalShipsAmount,
      buildingsLevels: Array.from(report.buildingsLevels.entries()),
      resourcesAmount: report.resourcesAmount,
      techLevels: Array.from(report.techLevels.entries()),
      defences: report.defences,
      ships: Array.from(report.ships.entries())
    });

    expect(report.planetaryParameters).not.toBe(planet.info.planetaryParameters);
    expect(report.size).toBe(100);
    expect(report.diff).toBe(1);
    expect(report.planetaryParameters.metalModifier).toBe(0);
    expect(report.planetaryParameters.anomaliesAndNoise).toBe(0);
    expect(report.averageBuildingLevel).toBeCloseTo((4 + 9 + 2) / 3, 6);
    expect(report.averageTotalResources).toBe(600);
    expect(report.averageTechLevel).toBeCloseTo((4 + 2) / 2, 6);
    expect(report.totalDefencesAmount).toBe(5);
    expect(report.totalShipsAmount).toBe(2);
    expect(report.buildingsLevels.size).toBe(3);
    expect(report.resourcesAmount.getTotalResourceAmount()).toBe(600);
    expect(report.techLevels.get(TechnologyType.ENERGY_TECHNOLOGY)).toBe(2);
    expect(report.defences.map((entry) => [entry.type, entry.amount])).toEqual([
      [DefenceType.LIGHT_BEAM_CANNON, 3],
      [DefenceType.SAM_SITE, 2]
    ]);
    expect(report.ships.get(ShipType.FIGHTER)).toBe(2);
  });

  it('returns only planetary parameters for low report levels', () => {
    const generator = new EspionageReportGenerator();
    const system = SolarSystem.createVoid({ x: 0, y: 0 });
    const planet = createPlanet(system, []);
    const attackerTech = new Map<TechnologyType, number>([
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 0]
    ]);
    const defenderTech = new Map<TechnologyType, number>([
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 10]
    ]);
    const attacker = createPlayer(1, 'Attacker', attackerTech);
    const defender = createPlayer(2, 'Defender', defenderTech);
    planet.info.planetaryParameters.metalModifier = 0.8;
    planet.info.planetaryParameters.crystalModifier = 0.95;
    planet.info.planetaryParameters.deuteriumModifier = 1.1;
    planet.info.planetaryParameters.scienceModifier = 0.92;
    planet.info.planetaryParameters.industryModifier = 0.4;
    planet.info.planetaryParameters.anomaliesAndNoise = 0.35;
    planet.info.planetaryParameters.hyperspaceParameters = 0.55;
    planet.setBuildingLevel(BuildingType.TERRAFORMER, 10);

    const report = generator.createEspionageReport(attacker, defender, planet, 1);

    console.log('report-level-low', {
      createdTurn: report.createdTurn,
      planetaryParameters: report.planetaryParameters,
      averageBuildingLevel: report.averageBuildingLevel,
      averageTotalResources: report.averageTotalResources,
      averageTechLevel: report.averageTechLevel,
      totalDefencesAmount: report.totalDefencesAmount,
      totalShipsAmount: report.totalShipsAmount,
      buildingsLevels: Array.from(report.buildingsLevels.entries()),
      resourcesAmount: report.resourcesAmount,
      techLevels: Array.from(report.techLevels.entries()),
      defences: report.defences,
      ships: Array.from(report.ships.entries())
    });

    expect(report.planetaryParameters).not.toBe(planet.info.planetaryParameters);
    expect(report.size).toBe(140);
    expect(report.diff).toBe(1);
    expect(report.planetaryParameters.metalModifier).toBeCloseTo(0.9, 8);
    expect(report.planetaryParameters.crystalModifier).toBe(1);
    expect(report.planetaryParameters.deuteriumModifier).toBe(1.1);
    expect(report.planetaryParameters.scienceModifier).toBe(1);
    expect(report.planetaryParameters.industryModifier).toBeCloseTo(0.5, 8);
    expect(report.planetaryParameters.anomaliesAndNoise).toBeCloseTo(0.35, 8);
    expect(report.planetaryParameters.hyperspaceParameters).toBeCloseTo(0.55, 8);
    expect(report.averageBuildingLevel).toBe(0);
    expect(report.averageTotalResources).toBe(0);
    expect(report.averageTechLevel).toBe(0);
    expect(report.totalDefencesAmount).toBe(0);
    expect(report.totalShipsAmount).toBe(0);
    expect(report.buildingsLevels.size).toBe(0);
    expect(report.resourcesAmount.getTotalResourceAmount()).toBe(0);
    expect(report.techLevels.size).toBe(0);
    expect(report.ships.size).toBe(0);
  });

  it('applies an explicit report level bonus when requested', () => {
    const generator = new EspionageReportGenerator();
    const system = SolarSystem.createVoid({ x: 0, y: 0 });
    const planet = createPlanet(system, []);
    const attacker = createPlayer(1, 'Attacker', new Map<TechnologyType, number>([
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 2]
    ]));
    const defender = createPlayer(2, 'Defender', new Map<TechnologyType, number>([
      [TechnologyType.ESPIONAGE_TECHNOLOGY, 0]
    ]));

    const baseReport = generator.createEspionageReport(attacker, defender, planet, 1);
    const boostedReport = generator.createEspionageReport(attacker, defender, planet, 1, {
      reportLevelBonus: 10
    });

    expect(baseReport.totalDefencesAmount).toBe(0);
    expect(baseReport.resourcesAmount.getTotalResourceAmount()).toBe(0);
    expect(boostedReport.totalDefencesAmount).toBe(5);
    expect(boostedReport.resourcesAmount.getTotalResourceAmount()).toBe(600);
    expect(boostedReport.defences.map((entry) => [entry.type, entry.amount])).toEqual([
      [DefenceType.LIGHT_BEAM_CANNON, 3],
      [DefenceType.SAM_SITE, 2]
    ]);
  });
});

