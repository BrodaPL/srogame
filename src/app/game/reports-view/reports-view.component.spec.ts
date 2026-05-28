import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { ReportsViewComponent } from './reports-view.component';
import { ProductionReport } from '../../models/reports/production-report';

describe('ReportsViewComponent', () => {
  it('navigates to Galaxy View from report coordinates', () => {
    const router = createRouter();
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never,
      {} as never,
      router as never
    );

    const report = {
      sourceCoordinates: {
        x: 7,
        y: 8,
        z: 9
      }
    };

    (component as { openInGalaxy(report: unknown): void }).openInGalaxy(report);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/game/galactic'],
      {
        queryParams: {
          x: 7,
          y: 8,
          z: 9
        }
      }
    );
  });

  it('navigates to Galaxy View from report origin coordinates', () => {
    const router = createRouter();
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never,
      {} as never,
      router as never
    );

    const report = {
      originCoordinates: {
        x: 3,
        y: 4,
        z: 5
      }
    };

    (component as { openOriginInGalaxy(report: unknown): void }).openOriginInGalaxy(report);

    expect(router.navigate).toHaveBeenCalledWith(
      ['/game/galactic'],
      {
        queryParams: {
          x: 3,
          y: 4,
          z: 5
        }
      }
    );
  });

  it('selects all visible reports except favourites', () => {
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never,
      {} as never,
      createRouter() as never
    );
    const regularReport = createProductionReport(1, 'Regular report');
    const favouriteReport = createProductionReport(2, 'Favourite report', true);
    (component as { reports: ProductionReport[] }).reports = [regularReport, favouriteReport];

    (component as { selectAllVisible(): void }).selectAllVisible();

    const selectedIds = (component as { selectedReportIds: Set<number> }).selectedReportIds;
    expect([...selectedIds]).toEqual([regularReport.reportId]);
    expect(selectedIds.has(favouriteReport.reportId)).toBe(false);
  });

  it('formats plain report text for display without changing report content', () => {
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn()
      } as never,
      {
        autoOpenTutorial: vi.fn()
      } as never,
      {} as never,
      createRouter() as never
    );
    const report = createProductionReport(
      7,
      'Production Report',
      false,
      'Resources: M 10, C 20, D 30\nProduction finished successfully.'
    );

    const view = (component as {
      plainReportView(report: ProductionReport): {
        metadataRows: Array<{ label: string; value: string }>;
        bodySections: Array<{ title: string; rows: Array<{ label: string; value: string }>; notes: string[] }>;
      };
    }).plainReportView(report);

    expect(report.show()).toContain('Resources: M 10, C 20, D 30');
    expect(view.metadataRows.some((row) => row.label === 'Title' && row.value === 'Production Report')).toBe(true);
    expect(view.bodySections[0].rows).toEqual([{ label: 'Resources', value: 'M 10, C 20, D 30', tone: 'neutral' }]);
    expect(view.bodySections[0].notes).toEqual(['Production finished successfully.']);
  });
});

function createRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true)
  };
}

function createProductionReport(
  reportId: number,
  title: string,
  isFavourite = false,
  body = title
): ProductionReport {
  return new ProductionReport(
    {
      reportId,
      createdTurn: reportId,
      title,
      isFavourite
    },
    body
  );
}
