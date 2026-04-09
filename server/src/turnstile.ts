export type TurnstileConfig = {
  siteKey: string | null;
  secretKey: string | null;
  bypassForLocalDev: boolean;
};

export type TurnstileVerificationResult = {
  ok: boolean;
  error: string | null;
};

export function readTurnstileConfig(): TurnstileConfig {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim() || null;
  const secretKey = process.env.TURNSTILE_SECRET_KEY?.trim() || null;
  const bypassForLocalDev = process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV === 'true';

  return {
    siteKey,
    secretKey,
    bypassForLocalDev
  };
}

export function buildRegisterConfigResponse() {
  const config = readTurnstileConfig();
  if (config.bypassForLocalDev) {
    return {
      registerEnabled: true,
      requiresTurnstile: false,
      turnstileSiteKey: null,
      registerUnavailableReason: null
    };
  }

  const configured = !!config.siteKey && !!config.secretKey;
  return {
    registerEnabled: configured,
    requiresTurnstile: configured,
    turnstileSiteKey: configured ? config.siteKey : null,
    registerUnavailableReason: configured
      ? null
      : 'Registration is temporarily unavailable until CAPTCHA is configured on the server.'
  };
}

export async function verifyTurnstileToken(
  token: string | null,
  remoteIp: string | null
): Promise<TurnstileVerificationResult> {
  const config = readTurnstileConfig();
  if (config.bypassForLocalDev) {
    return { ok: true, error: null };
  }

  if (!config.siteKey || !config.secretKey) {
    return { ok: false, error: 'Registration is temporarily unavailable until CAPTCHA is configured on the server.' };
  }

  if (!token?.trim()) {
    return { ok: false, error: 'CAPTCHA verification is required.' };
  }

  const body = new URLSearchParams();
  body.set('secret', config.secretKey);
  body.set('response', token.trim());
  if (remoteIp?.trim()) {
    body.set('remoteip', remoteIp.trim());
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    if (!response.ok) {
      return { ok: false, error: 'CAPTCHA verification failed.' };
    }

    const payload = await response.json() as { success?: boolean; 'error-codes'?: string[] };
    if (payload.success === true) {
      return { ok: true, error: null };
    }

    const errorCode = Array.isArray(payload['error-codes']) && payload['error-codes'].length > 0
      ? payload['error-codes'][0]
      : null;
    return {
      ok: false,
      error: errorCode ? `CAPTCHA verification failed (${errorCode}).` : 'CAPTCHA verification failed.'
    };
  } catch {
    return { ok: false, error: 'CAPTCHA verification failed.' };
  }
}
