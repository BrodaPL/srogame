import { describe, expect, it } from 'vitest';
import { Player } from '../../player';
import { PlayerType } from '../../enums/player-type';
import { EspionageReportData } from '../espionage-report-data';
import { PlanetaryParameters } from '../../planets/planetary-parameters';
import { ResourcesPack } from '../../resources-pack';
import { ShipyardQueue } from '../shipyard-queue';
import { DefencesQueue } from '../defences-queue';
import { ResearchQueue } from '../research-queue';
import { BuildingQueue } from '../building-queue';
import { BuildingType } from '../../enums/building-type';
import { ProductionReport } from '../production-report';

describe('PlayerReport domain', () => {
  it('marks reports as read and deletes selected reports', () => {
    const player = new Player(1, 'Tester', [], new Map(), [], PlayerType.PLAYER);
    const firstReport = new ProductionReport(
      {
        reportId: player.createReportId(),
        createdTurn: 5,
        title: 'First report'
      },
      'Alpha'
    );
    const secondReport = new ProductionReport(
      {
        reportId: player.createReportId(),
        createdTurn: 6,
        title: 'Second report'
      },
      'Beta'
    );

    player.addReport(firstReport);
    player.addReport(secondReport);

    expect(player.markReportAsRead(firstReport.reportId)).toBe(true);
    expect(firstReport.isRead).toBe(true);
    expect(player.deleteReports([secondReport.reportId])).toBe(1);
    expect(player.reports.map((report) => report.reportId)).toEqual([firstReport.reportId]);
  });

  it('copies espionage reports without sharing mutable resources or maps', () => {
    const report = new EspionageReportData(
      {
        reportId: 7,
        createdTurn: 9,
        title: 'Espionage Report: Test (1:2:3)',
        sourceCoordinates: { x: 1, y: 2, z: 3 },
        sourcePlanetName: 'Test',
        sourceSystemName: 'System'
      },
      3,
      160,
      new PlanetaryParameters(1, 1, 1, 1, 1, 1, 1, 1, 1),
      2,
      300,
      4,
      0,
      1,
      new Map([[BuildingType.METAL_MINE, 4]]),
      new ResourcesPack(100, 200, 300),
      new ResourcesPack(10, 20, 30),
      new Map(),
      [],
      new Map(),
      new ShipyardQueue(),
      new DefencesQueue(),
      new ResearchQueue(),
      new BuildingQueue()
    );

    const copy = report.copy();
    copy.resourcesAmount.metal = 999;
    copy.spaceDebrisAmount.crystal = 999;
    copy.buildingsLevels.set(BuildingType.METAL_MINE, 10);
    copy.size = 220;

    expect(report.resourcesAmount.metal).toBe(100);
    expect(report.spaceDebrisAmount.crystal).toBe(20);
    expect(report.buildingsLevels.get(BuildingType.METAL_MINE)).toBe(4);
    expect(report.size).toBe(160);
  });
});
