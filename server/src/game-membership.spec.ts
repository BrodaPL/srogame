import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isAccountMemberOfGame,
  listMembershipsForAccount,
  listMembershipsForGame,
  loadGameMemberships,
  removeMembership,
  upsertMembership
} from './game-membership.js';

describe('game-membership', () => {
  it('creates an empty membership file when missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-game-memberships-'));
    const membershipPath = path.join(tempDir, 'game-memberships.json');

    try {
      expect(loadGameMemberships(membershipPath).memberships).toEqual([]);
      expect(fs.existsSync(membershipPath)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists memberships and lists them by game and account', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-game-memberships-'));
    const membershipPath = path.join(tempDir, 'game-memberships.json');

    try {
      upsertMembership(membershipPath, {
        gameId: 'game-1',
        accountId: 7,
        playerName: 'Alpha',
        role: 'OWNER',
        joinedAt: '2026-04-09T10:00:00.000Z',
        lastSeenAt: '2026-04-09T10:10:00.000Z',
        isActive: true
      });
      upsertMembership(membershipPath, {
        gameId: 'game-2',
        accountId: 7,
        playerName: 'Alpha',
        role: 'MEMBER',
        joinedAt: '2026-04-09T11:00:00.000Z',
        lastSeenAt: null,
        isActive: true
      });
      upsertMembership(membershipPath, {
        gameId: 'game-1',
        accountId: 8,
        playerName: 'Beta',
        role: 'MEMBER',
        joinedAt: '2026-04-09T10:05:00.000Z',
        lastSeenAt: null,
        isActive: true
      });

      expect(listMembershipsForGame(membershipPath, 'game-1').map((entry) => entry.accountId)).toEqual([7, 8]);
      expect(listMembershipsForAccount(membershipPath, 7).map((entry) => entry.gameId)).toEqual(['game-1', 'game-2']);
      expect(isAccountMemberOfGame(membershipPath, 'game-1', 8)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('upserts without duplication and removes memberships', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-game-memberships-'));
    const membershipPath = path.join(tempDir, 'game-memberships.json');

    try {
      upsertMembership(membershipPath, {
        gameId: 'game-1',
        accountId: 7,
        playerName: 'Alpha',
        role: 'MEMBER',
        joinedAt: '2026-04-09T10:00:00.000Z',
        lastSeenAt: null,
        isActive: true
      });
      upsertMembership(membershipPath, {
        gameId: 'game-1',
        accountId: 7,
        playerName: 'Alpha Prime',
        role: 'HOST',
        joinedAt: '2026-04-09T10:00:00.000Z',
        lastSeenAt: '2026-04-09T11:00:00.000Z',
        isActive: true
      });

      const memberships = loadGameMemberships(membershipPath).memberships;
      expect(memberships).toHaveLength(1);
      expect(memberships[0].playerName).toBe('Alpha Prime');
      expect(memberships[0].role).toBe('HOST');

      expect(removeMembership(membershipPath, 'game-1', 7)).toBe(true);
      expect(removeMembership(membershipPath, 'game-1', 7)).toBe(false);
      expect(isAccountMemberOfGame(membershipPath, 'game-1', 7)).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
