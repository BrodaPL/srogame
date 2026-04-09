import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createGameRecord,
  getGameById,
  loadGameRegistry,
  updateGameRecord,
  upsertGameRecord
} from './game-registry.js';

describe('game-registry', () => {
  it('creates an empty registry file when missing', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-game-registry-'));
    const registryPath = path.join(tempDir, 'games.json');

    try {
      const data = loadGameRegistry(registryPath);
      expect(data.games).toEqual([]);
      expect(fs.existsSync(registryPath)).toBe(true);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('persists and reloads game records', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-game-registry-'));
    const registryPath = path.join(tempDir, 'games.json');
    const record = createGameRecord({
      gameId: 'game-1',
      kind: 'SINGLEPLAYER',
      status: 'RUNNING',
      name: 'Alpha Sector',
      ownerAccountId: 7,
      ownerPlayerName: 'Alpha',
      hostAccountId: 7,
      hostPlayerName: 'Alpha',
      currentTurn: 3,
      currentSaveId: null,
      lastStartedAt: '2026-04-09T10:00:00.000Z',
      lastSavedAt: '2026-04-09T10:05:00.000Z',
      createdAt: '2026-04-09T10:00:00.000Z',
      updatedAt: '2026-04-09T10:05:00.000Z'
    });

    try {
      upsertGameRecord(registryPath, record);

      expect(getGameById(registryPath, 'game-1')).toEqual(record);
      expect(loadGameRegistry(registryPath).games).toEqual([record]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('updates an existing game and keeps newest updatedAt first', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-game-registry-'));
    const registryPath = path.join(tempDir, 'games.json');

    try {
      upsertGameRecord(registryPath, createGameRecord({
        gameId: 'older-game',
        kind: 'SINGLEPLAYER',
        status: 'OFFLINE',
        name: 'Older',
        ownerAccountId: 1,
        ownerPlayerName: 'A',
        hostAccountId: 1,
        hostPlayerName: 'A',
        currentTurn: 4,
        currentSaveId: 'older-save',
        lastStartedAt: '2026-04-09T09:00:00.000Z',
        lastSavedAt: '2026-04-09T09:10:00.000Z',
        createdAt: '2026-04-09T09:00:00.000Z',
        updatedAt: '2026-04-09T09:10:00.000Z'
      }));
      upsertGameRecord(registryPath, createGameRecord({
        gameId: 'newer-game',
        kind: 'MULTIPLAYER',
        status: 'RUNNING',
        name: 'Newer',
        ownerAccountId: 2,
        ownerPlayerName: 'B',
        hostAccountId: 2,
        hostPlayerName: 'B',
        currentTurn: 8,
        currentSaveId: null,
        lastStartedAt: '2026-04-09T11:00:00.000Z',
        lastSavedAt: null,
        createdAt: '2026-04-09T11:00:00.000Z',
        updatedAt: '2026-04-09T11:00:00.000Z'
      }));

      const updated = updateGameRecord(registryPath, 'older-game', {
        status: 'RUNNING',
        currentTurn: 5,
        updatedAt: '2026-04-09T12:00:00.000Z'
      });

      expect(updated?.status).toBe('RUNNING');
      expect(updated?.currentTurn).toBe(5);
      expect(loadGameRegistry(registryPath).games.map((entry) => entry.gameId)).toEqual([
        'older-game',
        'newer-game'
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
