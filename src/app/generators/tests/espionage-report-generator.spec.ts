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

describe('EspionageReportGenerator', () => {
  const createPlayer = (
    playerId: number,
    playerName: string,
    techLevels: Map<TechnologyType, number>
  ): Player => new Player(playerId, playerName, [], techLevels, [], PlayerType.PLAYER);

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
      [],
      ships,
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
      reportDate: report.reportDate,
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

    expect(report.planetaryParameters).toBe(planet.info.planetaryParameters);
    expect(report.averageBuildingLevel).toBeCloseTo((4 + 9 + 2) / 3, 6);
    expect(report.averageTotalResources).toBe(600);
    expect(report.averageTechLevel).toBeCloseTo((4 + 2) / 2, 6);
    expect(report.totalShipsAmount).toBe(2);
    expect(report.buildingsLevels.size).toBe(3);
    expect(report.resourcesAmount.getTotalResourceAmount()).toBe(600);
    expect(report.techLevels.get(TechnologyType.ENERGY_TECHNOLOGY)).toBe(2);
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

    const report = generator.createEspionageReport(attacker, defender, planet, 1);

    console.log('report-level-low', {
      reportDate: report.reportDate,
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

    expect(report.planetaryParameters).toBe(planet.info.planetaryParameters);
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
});

