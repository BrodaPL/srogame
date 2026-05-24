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
});

function createRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true)
  };
}

function createProductionReport(reportId: number, title: string, isFavourite = false): ProductionReport {
  return new ProductionReport(
    {
      reportId,
      createdTurn: reportId,
      title,
      isFavourite
    },
    title
  );
}
