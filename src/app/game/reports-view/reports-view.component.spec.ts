import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { ReportsViewComponent } from './reports-view.component';

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
});

function createRouter() {
  return {
    navigate: vi.fn().mockResolvedValue(true)
  };
}
