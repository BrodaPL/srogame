import { describe, expect, it } from 'vitest';
import {
  buildResendConfirmationCooldownMessage,
  buildLockedAccountMessage,
  canResendConfirmation,
  clearExpiredLoginLock,
  clearLoginFailureState,
  cleanupExpiredPendingAccounts,
  getLoginBlockResponse,
  getResendConfirmationNextAllowedAt,
  markConfirmationResent,
  registerFailedPasswordAttempt
} from './auth-account-security.js';

describe('auth-account-security', () => {
  it('removes expired pending accounts and their sessions', () => {
    const data = {
      accounts: [
        {
          id: 1,
          status: 'PENDING_CONFIRMATION' as const,
          confirmationExpiresAt: '2026-04-09T10:00:00.000Z'
        },
        {
          id: 2,
          status: 'ACTIVE' as const,
          confirmationExpiresAt: null
        }
      ],
      sessions: [
        { accountId: 1 },
        { accountId: 2 }
      ]
    };

    const changed = cleanupExpiredPendingAccounts(data, Date.parse('2026-04-09T10:30:00.000Z'));

    expect(changed).toBe(true);
    expect(data.accounts.map((account) => account.id)).toEqual([2]);
    expect(data.sessions.map((session) => session.accountId)).toEqual([2]);
  });

  it('blocks pending-confirmation accounts from login', () => {
    const block = getLoginBlockResponse({
      status: 'PENDING_CONFIRMATION',
      loginLockedUntil: null
    });

    expect(block).toEqual({
      status: 403,
      error: 'Account is not confirmed yet.'
    });
  });

  it('locks an account for 10 minutes after 5 wrong passwords', () => {
    const state = {
      failedLoginAttempts: 0,
      loginLockedUntil: null as string | null
    };
    const now = Date.parse('2026-04-09T12:00:00.000Z');

    for (let attempt = 1; attempt < 5; attempt += 1) {
      const lockedUntil = registerFailedPasswordAttempt(state, now);
      expect(lockedUntil).toBeNull();
      expect(state.failedLoginAttempts).toBe(attempt);
      expect(state.loginLockedUntil).toBeNull();
    }

    const lockedUntil = registerFailedPasswordAttempt(state, now);

    expect(lockedUntil).toBe('2026-04-09T12:10:00.000Z');
    expect(state.failedLoginAttempts).toBe(5);
    expect(buildLockedAccountMessage(state, now)).toContain('10 minutes');
    expect(getLoginBlockResponse({
      status: 'ACTIVE',
      loginLockedUntil: state.loginLockedUntil
    }, now)).toEqual({
      status: 423,
      error: 'Account login is locked due to too many wrong passwords. Try again in 10 minutes.'
    });
  });

  it('clears lockout after expiry and on successful login reset', () => {
    const state = {
      failedLoginAttempts: 5,
      loginLockedUntil: '2026-04-09T12:10:00.000Z'
    };

    expect(clearExpiredLoginLock(state, Date.parse('2026-04-09T12:09:59.000Z'))).toBe(false);
    expect(state.failedLoginAttempts).toBe(5);

    expect(clearExpiredLoginLock(state, Date.parse('2026-04-09T12:10:00.000Z'))).toBe(true);
    expect(state.failedLoginAttempts).toBe(0);
    expect(state.loginLockedUntil).toBeNull();

    state.failedLoginAttempts = 3;
    state.loginLockedUntil = '2026-04-09T12:12:00.000Z';
    clearLoginFailureState(state);
    expect(state.failedLoginAttempts).toBe(0);
    expect(state.loginLockedUntil).toBeNull();
  });

  it('enforces resend-confirmation cooldown and refreshes expiry when resent', () => {
    const account = {
      status: 'PENDING_CONFIRMATION' as const,
      confirmationExpiresAt: '2026-04-09T12:30:00.000Z',
      lastConfirmationSentAt: '2026-04-09T12:00:00.000Z'
    };

    expect(getResendConfirmationNextAllowedAt(account)).toBe('2026-04-09T12:10:00.000Z');
    expect(canResendConfirmation(account, Date.parse('2026-04-09T12:09:59.000Z'))).toBe(false);
    expect(buildResendConfirmationCooldownMessage(account, Date.parse('2026-04-09T12:00:00.000Z'))).toBe(
      'Confirmation can be resent again in 10 minutes.'
    );
    expect(canResendConfirmation(account, Date.parse('2026-04-09T12:10:00.000Z'))).toBe(true);

    const refreshed = markConfirmationResent(
      account,
      Date.parse('2026-04-09T12:11:00.000Z'),
      30 * 60 * 1000
    );
    expect(refreshed).toEqual({
      confirmationExpiresAt: '2026-04-09T12:41:00.000Z',
      lastConfirmationSentAt: '2026-04-09T12:11:00.000Z'
    });
    expect(account.confirmationExpiresAt).toBe('2026-04-09T12:41:00.000Z');
    expect(account.lastConfirmationSentAt).toBe('2026-04-09T12:11:00.000Z');
  });
});
