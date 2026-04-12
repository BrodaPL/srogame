import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRegisterConfigResponse, verifyTurnstileToken } from './turnstile.js';

describe('turnstile', () => {
  const originalSiteKey = process.env.TURNSTILE_SITE_KEY;
  const originalSecretKey = process.env.TURNSTILE_SECRET_KEY;
  const originalBypass = process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV;

  afterEach(() => {
    process.env.TURNSTILE_SITE_KEY = originalSiteKey;
    process.env.TURNSTILE_SECRET_KEY = originalSecretKey;
    process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV = originalBypass;
    vi.unstubAllGlobals();
  });

  it('keeps registration enabled without Turnstile when no keys are configured', async () => {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV;

    expect(buildRegisterConfigResponse()).toEqual({
      registerEnabled: true,
      requiresTurnstile: false,
      turnstileSiteKey: null,
      registerUnavailableReason: null
    });

    await expect(verifyTurnstileToken(null, '127.0.0.1')).resolves.toEqual({
      ok: true,
      error: null
    });
  });

  it('allows local bypass when explicitly enabled', async () => {
    process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV = 'true';
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;

    expect(buildRegisterConfigResponse()).toEqual({
      registerEnabled: true,
      requiresTurnstile: false,
      turnstileSiteKey: null,
      registerUnavailableReason: null
    });

    await expect(verifyTurnstileToken(null, '127.0.0.1')).resolves.toEqual({
      ok: true,
      error: null
    });
  });

  it('requires configured keys and reports invalid verification responses', async () => {
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    process.env.TURNSTILE_SECRET_KEY = 'secret-key';
    delete process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV;

    expect(buildRegisterConfigResponse()).toEqual({
      registerEnabled: true,
      requiresTurnstile: true,
      turnstileSiteKey: 'site-key',
      registerUnavailableReason: null
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: false,
        'error-codes': ['invalid-input-response']
      })
    }));

    await expect(verifyTurnstileToken('bad-token', '127.0.0.1')).resolves.toEqual({
      ok: false,
      error: 'CAPTCHA verification failed (invalid-input-response).'
    });
  });
});
