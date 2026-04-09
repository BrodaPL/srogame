import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  deleteMultiplayerLobby,
  getMultiplayerLobbyByGameId,
  loadMultiplayerLobbyStore,
  upsertMultiplayerLobby
} from './multiplayer-lobby-store.js';
import { createDefaultMultiplayerLobbySetup, openMultiplayerLobby } from './multiplayer-lobby.js';

describe('multiplayer-lobby-store', () => {
  it('creates an empty store file when missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-multiplayer-lobby-store-'));
    const storePath = path.join(tempDir, 'multiplayer-lobbies.json');

    try {
      const data = loadMultiplayerLobbyStore(storePath);
      expect(data.lobbies).toEqual([]);
      expect(fs.existsSync(storePath)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists and reloads multiple lobbies newest first', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-multiplayer-lobby-store-'));
    const storePath = path.join(tempDir, 'multiplayer-lobbies.json');

    try {
      upsertMultiplayerLobby(storePath, {
        gameId: 'lobby-a',
        ...openMultiplayerLobby(1, 'Admin A', '2026-04-09T10:00:00.000Z', createDefaultMultiplayerLobbySetup()),
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:05:00.000Z'
      });
      upsertMultiplayerLobby(storePath, {
        gameId: 'lobby-b',
        ...openMultiplayerLobby(2, 'Admin B', '2026-04-09T11:00:00.000Z', createDefaultMultiplayerLobbySetup()),
        createdAt: '2026-04-09T11:00:00.000Z',
        updatedAt: '2026-04-09T11:05:00.000Z'
      });

      expect(loadMultiplayerLobbyStore(storePath).lobbies.map((entry) => entry.gameId)).toEqual([
        'lobby-b',
        'lobby-a'
      ]);
      expect(getMultiplayerLobbyByGameId(storePath, 'lobby-a')?.hostPlayerName).toBe('Admin A');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('deletes a lobby by gameId', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-multiplayer-lobby-store-'));
    const storePath = path.join(tempDir, 'multiplayer-lobbies.json');

    try {
      upsertMultiplayerLobby(storePath, {
        gameId: 'lobby-a',
        ...openMultiplayerLobby(1, 'Admin A', '2026-04-09T10:00:00.000Z', createDefaultMultiplayerLobbySetup()),
        createdAt: '2026-04-09T10:00:00.000Z',
        updatedAt: '2026-04-09T10:05:00.000Z'
      });

      expect(deleteMultiplayerLobby(storePath, 'lobby-a')).toBe(true);
      expect(getMultiplayerLobbyByGameId(storePath, 'lobby-a')).toBeNull();
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
