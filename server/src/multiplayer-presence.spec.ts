import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  acknowledgeAutoSkipTurnNotice,
  activateAutoSkipTurn,
  getPresenceForGameAccount,
  loadMultiplayerPresenceStore,
  markPresenceSeen,
  removePresence,
  removePresenceForGame,
  setAutoSkipTurnEnabled
} from './multiplayer-presence.js';

describe('multiplayer-presence', () => {
  const tempDirectories: string[] = [];

  afterEach(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop();
      if (directory) {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('creates an empty store when the file is missing', () => {
    const presencePath = createPresencePath(tempDirectories);

    const data = loadMultiplayerPresenceStore(presencePath);

    expect(data).toEqual({ presences: [] });
    expect(fs.existsSync(presencePath)).toBe(true);
  });

  it('marks presence seen and persists per game/account', () => {
    const presencePath = createPresencePath(tempDirectories);

    markPresenceSeen(presencePath, 'game-1', 7, '2026-04-10T10:00:00.000Z');

    expect(getPresenceForGameAccount(presencePath, 'game-1', 7)).toEqual({
      gameId: 'game-1',
      accountId: 7,
      lastSeenAt: '2026-04-10T10:00:00.000Z',
      state: 'ACTIVE',
      autoSkipTurnEnabled: false,
      autoSkipTurnActivatedAt: null,
      returnNoticePending: false
    });
  });

  it('activates auto skip turn and keeps a return notice pending until acknowledged', () => {
    const presencePath = createPresencePath(tempDirectories);

    setAutoSkipTurnEnabled(presencePath, 'game-1', 7, true, '2026-04-10T10:00:00.000Z');
    activateAutoSkipTurn(presencePath, 'game-1', 7, '2026-04-10T10:05:00.000Z');

    expect(getPresenceForGameAccount(presencePath, 'game-1', 7)).toEqual({
      gameId: 'game-1',
      accountId: 7,
      lastSeenAt: '2026-04-10T10:05:00.000Z',
      state: 'AUTO_SKIP_TURN',
      autoSkipTurnEnabled: true,
      autoSkipTurnActivatedAt: '2026-04-10T10:05:00.000Z',
      returnNoticePending: true
    });

    acknowledgeAutoSkipTurnNotice(presencePath, 'game-1', 7, '2026-04-10T10:06:00.000Z');

    expect(getPresenceForGameAccount(presencePath, 'game-1', 7)?.returnNoticePending).toBe(false);
  });

  it('removes one presence or an entire game slice', () => {
    const presencePath = createPresencePath(tempDirectories);

    markPresenceSeen(presencePath, 'game-1', 7, '2026-04-10T10:00:00.000Z');
    markPresenceSeen(presencePath, 'game-1', 8, '2026-04-10T10:01:00.000Z');
    markPresenceSeen(presencePath, 'game-2', 9, '2026-04-10T10:02:00.000Z');

    expect(removePresence(presencePath, 'game-1', 7)).toBe(true);
    expect(getPresenceForGameAccount(presencePath, 'game-1', 7)).toBeNull();

    removePresenceForGame(presencePath, 'game-1');
    expect(getPresenceForGameAccount(presencePath, 'game-1', 8)).toBeNull();
    expect(getPresenceForGameAccount(presencePath, 'game-2', 9)).not.toBeNull();
  });
});

function createPresencePath(tempDirectories: string[]): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-multiplayer-presence-'));
  tempDirectories.push(directory);
  return path.join(directory, 'multiplayer-presence.json');
}
