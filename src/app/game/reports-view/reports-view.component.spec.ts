import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { ReportsViewComponent } from './reports-view.component';
import { ProductionReport } from '../../models/reports/production-report';
import { encodeRuntimeText } from '../../i18n/runtime-text.utils';

describe('ReportsViewComponent', () => {
  it('navigates to Galaxy View from report coordinates', () => {
    const router = createRouter();
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn(),
      } as never,
      {
        autoOpenTutorial: vi.fn(),
      } as never,
      {} as never,
      router as never,
      createGameState() as never,
    );

    const report = {
      sourceCoordinates: {
        x: 7,
        y: 8,
        z: 9,
      },
    };

    (component as { openInGalaxy(report: unknown): void }).openInGalaxy(report);

    expect(router.navigate).toHaveBeenCalledWith(['/game/galactic'], {
      queryParams: {
        x: 7,
        y: 8,
        z: 9,
      },
    });
  });

  it('navigates to Galaxy View from report origin coordinates', () => {
    const router = createRouter();
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn(),
      } as never,
      {
        autoOpenTutorial: vi.fn(),
      } as never,
      {} as never,
      router as never,
      createGameState() as never,
    );

    const report = {
      originCoordinates: {
        x: 3,
        y: 4,
        z: 5,
      },
    };

    (component as { openOriginInGalaxy(report: unknown): void }).openOriginInGalaxy(report);

    expect(router.navigate).toHaveBeenCalledWith(['/game/galactic'], {
      queryParams: {
        x: 3,
        y: 4,
        z: 5,
      },
    });
  });

  it('converts report planet order to client planet index when previewing a location', () => {
    const getClientPlanet = vi.fn(() =>
      of({
        info: {
          ownerId: null,
        },
      }),
    );
    const component = new ReportsViewComponent(
      { getClientPlanet } as never,
      { load: vi.fn(() => ({ token: 'token' })) } as never,
      {
        markForCheck: vi.fn(),
      } as never,
      {
        autoOpenTutorial: vi.fn(),
      } as never,
      {} as never,
      createRouter() as never,
      createGameState() as never,
      createI18n() as never,
    );
    const report = {
      sourceCoordinates: {
        x: 15,
        y: 17,
        z: 2,
      },
    };

    (component as { previewLocation(report: unknown): void }).previewLocation(report);

    expect(getClientPlanet).toHaveBeenCalledWith(15, 17, 1, 'token');
  });

  it('selects all visible reports except favourites', () => {
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn(),
      } as never,
      {
        autoOpenTutorial: vi.fn(),
      } as never,
      {} as never,
      createRouter() as never,
      createGameState() as never,
      createI18n() as never,
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
        markForCheck: vi.fn(),
      } as never,
      {
        autoOpenTutorial: vi.fn(),
      } as never,
      {} as never,
      createRouter() as never,
      createGameState() as never,
      createI18n() as never,
    );
    const report = createProductionReport(
      7,
      'Production Report',
      false,
      'Resources: M 10, C 20, D 30\nProduction finished successfully.',
    );

    const view = (
      component as {
        plainReportView(report: ProductionReport): {
          metadataRows: Array<{ label: string; value: string }>;
          bodySections: Array<{
            title: string;
            rows: Array<{ label: string; value: string }>;
            notes: string[];
          }>;
        };
      }
    ).plainReportView(report);

    expect(report.show()).toContain('Resources: M 10, C 20, D 30');
    expect(
      view.metadataRows.some((row) => row.label === 'Title' && row.value === 'Production Report'),
    ).toBe(true);
    expect(view.bodySections[0].rows).toEqual([
      { label: 'Resources', value: 'M 10, C 20, D 30', tone: 'neutral' },
    ]);
    expect(view.bodySections[0].notes).toEqual(['Production finished successfully.']);
  });

  it('decodes encoded metadata values inside plain report rows', () => {
    const component = new ReportsViewComponent(
      {} as never,
      {} as never,
      {
        markForCheck: vi.fn(),
      } as never,
      {
        autoOpenTutorial: vi.fn(),
      } as never,
      {} as never,
      createRouter() as never,
      createGameState() as never,
      createI18n() as never,
    );
    const report = createProductionReport(
      8,
      encodeRuntimeText('generated.reports.espionageTitle', {
        planet: 'Delta',
        x: 1,
        y: 2,
        z: 3,
      }),
      false,
      'Body',
    );

    const view = (
      component as {
        plainReportView(report: ProductionReport): {
          metadataRows: Array<{ label: string; value: string }>;
        };
      }
    ).plainReportView(report);

    expect(
      view.metadataRows.some(
        (row) => row.label === 'Title' && row.value === 'Espionage Report: Delta (1:2:3)',
      ),
    ).toBe(true);
  });
});

function createRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true),
  };
}

function createGameState() {
  return {
    diplomacyResolver: vi.fn(() => ({
      getStatus: vi.fn(() => 'SELF'),
    })),
  };
}

function createI18n() {
  return {
    t: vi.fn((key: string, params?: Record<string, unknown>) => {
      const templates: Record<string, string> = {
        'generated.reportMetadata.title': 'Title: {{value}}',
        'generated.reportMetadata.type': 'Type: {{value}}',
        'generated.reportMetadata.turn': 'Turn: {{value}}',
        'communications.reports.reportTypes.Production Report': 'Production Report',
        'generated.reports.espionageTitle': 'Espionage Report: {{planet}} ({{x}}:{{y}}:{{z}})',
      };

      const template = templates[key] ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
        const value = params?.[token];
        return value === undefined || value === null ? '' : String(value);
      });
    }),
  };
}

function createProductionReport(
  reportId: number,
  title: string,
  isFavourite = false,
  body = title,
): ProductionReport {
  return new ProductionReport(
    {
      reportId,
      createdTurn: reportId,
      title,
      isFavourite,
    },
    body,
  );
}
