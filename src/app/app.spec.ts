import '@angular/compiler';
import { describe, expect, it, vi } from 'vitest';
import { App } from './app';

describe('App', () => {
  it('initializes auth state and i18n on startup', () => {
    const authState = {
      init: vi.fn()
    };
    const i18n = {
      init: vi.fn()
    };

    const app = new App(authState as never, i18n as never);

    expect(app).toBeTruthy();
    expect(authState.init).toHaveBeenCalledOnce();
    expect(i18n.init).toHaveBeenCalledOnce();
  });
});
