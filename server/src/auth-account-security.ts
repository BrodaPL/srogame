import type { AccountStatus } from '../../src/app/models/game-api-types.ts';

export const DEFAULT_MAX_PASSWORD_RETRY_ATTEMPTS = 5;
export const DEFAULT_LOGIN_LOCKOUT_MS = 10 * 60 * 1000;
export const DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS = 10 * 60 * 1000;

export type AuthAccountSecurityState = {
  id: number;
  status: AccountStatus;
  confirmationExpiresAt: string | null;
  lastConfirmationSentAt?: string | null;
  failedLoginAttempts: number;
  loginLockedUntil: string | null;
};

export type AuthSessionAccountLink = {
  accountId: number;
};

export function isExpiredPendingConfirmation(
  account: Pick<AuthAccountSecurityState, 'status' | 'confirmationExpiresAt'>,
  now = Date.now()
): boolean {
  if (account.status !== 'PENDING_CONFIRMATION') {
    return false;
  }

  if (!account.confirmationExpiresAt) {
    return false;
  }

  const expiresAt = Date.parse(account.confirmationExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function cleanupExpiredPendingAccounts<
  TAccount extends Pick<AuthAccountSecurityState, 'id' | 'status' | 'confirmationExpiresAt'>,
  TSession extends AuthSessionAccountLink
>(
  data: { accounts: TAccount[]; sessions: TSession[] },
  now = Date.now()
): boolean {
  const expiredAccountIds = new Set(
    data.accounts
      .filter((account) => isExpiredPendingConfirmation(account, now))
      .map((account) => account.id)
  );

  if (expiredAccountIds.size === 0) {
    return false;
  }

  data.accounts = data.accounts.filter((account) => !expiredAccountIds.has(account.id));
  data.sessions = data.sessions.filter((session) => !expiredAccountIds.has(session.accountId));
  return true;
}

export function clearExpiredLoginLock(
  account: Pick<AuthAccountSecurityState, 'failedLoginAttempts' | 'loginLockedUntil'>,
  now = Date.now()
): boolean {
  if (!account.loginLockedUntil) {
    return false;
  }

  const lockedUntilMs = Date.parse(account.loginLockedUntil);
  if (!Number.isFinite(lockedUntilMs) || lockedUntilMs > now) {
    return false;
  }

  account.loginLockedUntil = null;
  account.failedLoginAttempts = 0;
  return true;
}

export function isAccountLoginLocked(
  account: Pick<AuthAccountSecurityState, 'loginLockedUntil'>,
  now = Date.now()
): boolean {
  if (!account.loginLockedUntil) {
    return false;
  }

  const lockedUntilMs = Date.parse(account.loginLockedUntil);
  return Number.isFinite(lockedUntilMs) && lockedUntilMs > now;
}

export function registerFailedPasswordAttempt(
  account: Pick<AuthAccountSecurityState, 'failedLoginAttempts' | 'loginLockedUntil'>,
  now = Date.now(),
  maxAttempts = DEFAULT_MAX_PASSWORD_RETRY_ATTEMPTS,
  lockoutMs = DEFAULT_LOGIN_LOCKOUT_MS
): string | null {
  clearExpiredLoginLock(account, now);
  account.failedLoginAttempts = Math.max(0, Math.floor(account.failedLoginAttempts)) + 1;
  if (account.failedLoginAttempts < maxAttempts) {
    return null;
  }

  account.loginLockedUntil = new Date(now + lockoutMs).toISOString();
  return account.loginLockedUntil;
}

export function clearLoginFailureState(
  account: Pick<AuthAccountSecurityState, 'failedLoginAttempts' | 'loginLockedUntil'>
): void {
  account.failedLoginAttempts = 0;
  account.loginLockedUntil = null;
}

export function buildLockedAccountMessage(
  account: Pick<AuthAccountSecurityState, 'loginLockedUntil'>,
  now = Date.now(),
  lockoutMs = DEFAULT_LOGIN_LOCKOUT_MS
): string {
  const lockedUntilMs = account.loginLockedUntil ? Date.parse(account.loginLockedUntil) : Number.NaN;
  const retryAfterMs = Number.isFinite(lockedUntilMs)
    ? Math.max(0, lockedUntilMs - now)
    : lockoutMs;
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `Account login is locked due to too many wrong passwords. Try again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`;
}

export function getLoginBlockResponse(
  account: Pick<AuthAccountSecurityState, 'status' | 'loginLockedUntil'>,
  now = Date.now()
): { status: 403 | 423; error: string } | null {
  if (account.status !== 'ACTIVE') {
    return { status: 403, error: 'Account is not confirmed yet.' };
  }

  if (isAccountLoginLocked(account, now)) {
    return { status: 423, error: buildLockedAccountMessage(account, now) };
  }

  return null;
}

export function getResendConfirmationNextAllowedAt(
  account: Pick<AuthAccountSecurityState, 'lastConfirmationSentAt'>,
  cooldownMs = DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS
): string | null {
  if (!account.lastConfirmationSentAt) {
    return null;
  }

  const sentAtMs = Date.parse(account.lastConfirmationSentAt);
  if (!Number.isFinite(sentAtMs)) {
    return null;
  }

  return new Date(sentAtMs + cooldownMs).toISOString();
}

export function canResendConfirmation(
  account: Pick<AuthAccountSecurityState, 'status' | 'lastConfirmationSentAt'>,
  now = Date.now(),
  cooldownMs = DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS
): boolean {
  if (account.status !== 'PENDING_CONFIRMATION') {
    return false;
  }

  const nextAllowedAt = getResendConfirmationNextAllowedAt(account, cooldownMs);
  if (!nextAllowedAt) {
    return true;
  }

  const nextAllowedAtMs = Date.parse(nextAllowedAt);
  return !Number.isFinite(nextAllowedAtMs) || nextAllowedAtMs <= now;
}

export function markConfirmationResent(
  account: Pick<AuthAccountSecurityState, 'confirmationExpiresAt' | 'lastConfirmationSentAt'>,
  now = Date.now(),
  confirmationLifetimeMs: number
): { confirmationExpiresAt: string; lastConfirmationSentAt: string } {
  const sentAt = new Date(now).toISOString();
  const confirmationExpiresAt = new Date(now + confirmationLifetimeMs).toISOString();
  account.lastConfirmationSentAt = sentAt;
  account.confirmationExpiresAt = confirmationExpiresAt;
  return {
    confirmationExpiresAt,
    lastConfirmationSentAt: sentAt
  };
}

export function buildResendConfirmationCooldownMessage(
  account: Pick<AuthAccountSecurityState, 'lastConfirmationSentAt'>,
  now = Date.now(),
  cooldownMs = DEFAULT_RESEND_CONFIRMATION_COOLDOWN_MS
): string {
  const nextAllowedAt = getResendConfirmationNextAllowedAt(account, cooldownMs);
  const nextAllowedAtMs = nextAllowedAt ? Date.parse(nextAllowedAt) : Number.NaN;
  const retryAfterMs = Number.isFinite(nextAllowedAtMs)
    ? Math.max(0, nextAllowedAtMs - now)
    : cooldownMs;
  const retryAfterMinutes = Math.max(1, Math.ceil(retryAfterMs / 60000));
  return `Confirmation can be resent again in ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`;
}
