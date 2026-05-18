import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeGalaxySetup } from '../../src/app/models/game-api-types.js';
import {
  appendPlayerActionLogEntry,
  ensurePlayerActionLogFile,
  resolvePlayerActionLogFilePath
} from './player-action-log.js';

describe('player-action-log', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('creates a deterministic per-game log file when enabled', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-player-log-'));
    tempDirs.push(dir);
    const setup = normalizeGalaxySetup({
      gameType: 'Sandbox',
      galaxyName: 'Player Logging Test',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: 1,
      botsAmount: 0,
      botDifficulty: 0,
      neutralBotsAmount: 0,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 5,
      enablePlayerActionLogging: true,
      startingResources: { metal: 6, crystal: 3, deuterium: 1 }
    });

    const filePath = ensurePlayerActionLogFile('game-123', setup, 'Tester', dir);

    expect(filePath).toBe(resolvePlayerActionLogFilePath('game-123', setup.galaxyName, dir));
    expect(filePath && fs.existsSync(filePath)).toBe(true);
    expect(filePath ? fs.readFileSync(filePath, 'utf8') : '').toContain('# gameId=game-123');
  });

  it('appends human-readable and JSON lines for successful actions', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-player-log-'));
    tempDirs.push(dir);
    const setup = normalizeGalaxySetup({
      gameType: 'Sandbox',
      galaxyName: 'Action Playback',
      galaxyWidth: 25,
      galaxyHeight: 20,
      galaxyCenterSize: 10,
      voidChance: 5,
      starsAmountModifier: [-1, 4],
      playerAmount: 1,
      botsAmount: 0,
      botDifficulty: 0,
      neutralBotsAmount: 0,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 5,
      enablePlayerActionLogging: true,
      startingResources: { metal: 6, crystal: 3, deuterium: 1 }
    });

    appendPlayerActionLogEntry('game-456', setup, 'Tester', {
      turn: 12,
      playerId: 1,
      kind: 'BUILDING_QUEUE_ADD',
      summary: 'Tester queued Metal Mine level 6 on 3:4:1',
      coordinates: { x: 3, y: 4, z: 1 },
      payload: { buildingType: 'Metal Mine', targetLevel: 6 },
      deltas: { buildingQueueLength: 2 }
    }, dir);

    const filePath = resolvePlayerActionLogFilePath('game-456', setup.galaxyName, dir);
    const contents = fs.readFileSync(filePath, 'utf8');
    expect(contents).toContain('[T12] Tester queued Metal Mine level 6 on 3:4:1');
    expect(contents).toContain('"kind":"BUILDING_QUEUE_ADD"');
    expect(contents).toContain('"buildingQueueLength":2');
  });
});
