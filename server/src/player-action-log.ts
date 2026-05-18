import fs from 'node:fs';
import path from 'node:path';
import type { GalaxySetup } from '../../src/app/models/game-api-types.ts';

export type PlayerActionLogKind =
  | 'BUILDING_QUEUE_ADD'
  | 'BUILDING_QUEUE_REORDER'
  | 'BUILDING_QUEUE_CANCEL'
  | 'SHIPYARD_QUEUE_ADD'
  | 'SHIPYARD_QUEUE_REORDER'
  | 'SHIPYARD_QUEUE_CANCEL'
  | 'RESEARCH_START'
  | 'FLEET_MISSION_CREATE';

export type PlayerActionLogCoordinates = {
  x: number;
  y: number;
  z: number;
};

export type PlayerActionLogEntry = {
  gameId: string;
  galaxyName: string;
  turn: number;
  timestamp: string;
  playerId: number;
  playerName: string;
  kind: PlayerActionLogKind;
  summary: string;
  coordinates: PlayerActionLogCoordinates | null;
  targetCoordinates?: PlayerActionLogCoordinates | null;
  payload: Record<string, unknown>;
  deltas?: Record<string, unknown>;
};

export const PLAYER_ACTION_LOGS_DIRECTORY_PATH = path.join(process.cwd(), 'server', 'data', 'player-action-logs');

export function isPlayerActionLoggingEnabled(setup: GalaxySetup | null | undefined): boolean {
  return setup?.enablePlayerActionLogging === true;
}

export function resolvePlayerActionLogFilePath(
  gameId: string,
  galaxyName: string,
  baseDir = PLAYER_ACTION_LOGS_DIRECTORY_PATH
): string {
  const safeGalaxyName = galaxyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'game';
  return path.join(baseDir, `${safeGalaxyName}-${gameId}.log`);
}

export function ensurePlayerActionLogFile(
  gameId: string,
  setup: GalaxySetup,
  playerName: string,
  baseDir = PLAYER_ACTION_LOGS_DIRECTORY_PATH
): string | null {
  if (!isPlayerActionLoggingEnabled(setup)) {
    return null;
  }

  const filePath = resolvePlayerActionLogFilePath(gameId, setup.galaxyName, baseDir);
  fs.mkdirSync(baseDir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    const header = [
      '# SroGame Player Action Log',
      `# gameId=${gameId}`,
      `# galaxyName=${setup.galaxyName}`,
      `# playerName=${playerName}`,
      `# createdAt=${new Date().toISOString()}`,
      ''
    ].join('\n');
    fs.writeFileSync(filePath, header, 'utf8');
  }

  return filePath;
}

export function appendPlayerActionLogEntry(
  gameId: string,
  setup: GalaxySetup,
  playerName: string,
  entry: Omit<PlayerActionLogEntry, 'gameId' | 'galaxyName' | 'timestamp' | 'playerName'>,
  baseDir = PLAYER_ACTION_LOGS_DIRECTORY_PATH
): void {
  if (!isPlayerActionLoggingEnabled(setup)) {
    return;
  }

  const filePath = ensurePlayerActionLogFile(gameId, setup, playerName, baseDir);
  if (!filePath) {
    return;
  }

  const timestamp = new Date().toISOString();
  const resolvedEntry: PlayerActionLogEntry = {
    ...entry,
    gameId,
    galaxyName: setup.galaxyName,
    timestamp,
    playerName
  };
  const lines = [
    `[${timestamp}][T${resolvedEntry.turn}] ${resolvedEntry.summary}`,
    `JSON ${JSON.stringify(resolvedEntry)}`,
    ''
  ];
  fs.appendFileSync(filePath, lines.join('\n'), 'utf8');
}
