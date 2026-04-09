import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  GameId,
  GameKind,
  GameStatus
} from '../../src/app/models/game-api-types.ts';

export type GameRecord = {
  gameId: GameId;
  kind: GameKind;
  status: GameStatus;
  name: string;
  ownerAccountId: number | null;
  ownerPlayerName: string | null;
  hostAccountId: number | null;
  hostPlayerName: string | null;
  createdAt: string;
  updatedAt: string;
  lastStartedAt: string | null;
  lastSavedAt: string | null;
  currentTurn: number | null;
  currentSaveId: string | null;
};

export type GameRegistryData = {
  games: GameRecord[];
};

export type CreateGameRecordInput = Omit<GameRecord, 'gameId' | 'createdAt' | 'updatedAt'> & {
  gameId?: GameId;
  createdAt?: string;
  updatedAt?: string;
};

export type UpdateGameRecordPatch = Partial<Omit<GameRecord, 'gameId' | 'createdAt'>>;

const EMPTY_REGISTRY: GameRegistryData = { games: [] };

export function createGameId(): GameId {
  return randomUUID();
}

export function loadGameRegistry(registryPath: string): GameRegistryData {
  ensureRegistryDirectory(registryPath);

  try {
    const raw = fs.readFileSync(registryPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GameRegistryData> | null;
    const games = Array.isArray(parsed?.games) ? parsed.games : [];
    return {
      games: games
        .map((record) => normalizeGameRecord(record))
        .filter((record): record is GameRecord => !!record)
        .sort(compareGamesDesc)
    };
  } catch {
    saveGameRegistry(registryPath, EMPTY_REGISTRY);
    return { ...EMPTY_REGISTRY, games: [] };
  }
}

export function saveGameRegistry(registryPath: string, data: GameRegistryData): void {
  ensureRegistryDirectory(registryPath);
  fs.writeFileSync(
    registryPath,
    JSON.stringify({ games: [...data.games].sort(compareGamesDesc) }, null, 2),
    'utf-8'
  );
}

export function listGames(registryPath: string): GameRecord[] {
  return loadGameRegistry(registryPath).games;
}

export function getGameById(registryPath: string, gameId: GameId): GameRecord | null {
  return loadGameRegistry(registryPath).games.find((record) => record.gameId === gameId) ?? null;
}

export function createGameRecord(input: CreateGameRecordInput): GameRecord {
  const now = input.updatedAt ?? input.createdAt ?? new Date().toISOString();
  return {
    gameId: input.gameId ?? createGameId(),
    kind: input.kind,
    status: input.status,
    name: input.name.trim() || 'Unnamed Game',
    ownerAccountId: input.ownerAccountId ?? null,
    ownerPlayerName: input.ownerPlayerName ?? null,
    hostAccountId: input.hostAccountId ?? null,
    hostPlayerName: input.hostPlayerName ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    lastStartedAt: input.lastStartedAt ?? null,
    lastSavedAt: input.lastSavedAt ?? null,
    currentTurn: input.currentTurn ?? null,
    currentSaveId: input.currentSaveId ?? null
  };
}

export function upsertGameRecord(registryPath: string, record: GameRecord): GameRecord {
  const data = loadGameRegistry(registryPath);
  const existingIndex = data.games.findIndex((entry) => entry.gameId === record.gameId);
  const normalizedRecord = normalizeGameRecord(record) ?? record;
  if (existingIndex >= 0) {
    data.games[existingIndex] = normalizedRecord;
  } else {
    data.games.push(normalizedRecord);
  }

  data.games.sort(compareGamesDesc);
  saveGameRegistry(registryPath, data);
  return normalizedRecord;
}

export function updateGameRecord(
  registryPath: string,
  gameId: GameId,
  patch: UpdateGameRecordPatch
): GameRecord | null {
  const data = loadGameRegistry(registryPath);
  const existing = data.games.find((entry) => entry.gameId === gameId);
  if (!existing) {
    return null;
  }

  const updated = normalizeGameRecord({
    ...existing,
    ...patch,
    gameId: existing.gameId,
    createdAt: existing.createdAt,
    updatedAt: patch.updatedAt ?? new Date().toISOString()
  });
  if (!updated) {
    return null;
  }

  return upsertGameRecord(registryPath, updated);
}

function normalizeGameRecord(value: unknown): GameRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<GameRecord>;
  const gameId = typeof record.gameId === 'string' && record.gameId.trim()
    ? record.gameId
    : createGameId();

  const kind = record.kind === 'MULTIPLAYER' ? 'MULTIPLAYER' : 'SINGLEPLAYER';
  const status = normalizeStatus(record.status);
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString();
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : createdAt;

  return {
    gameId,
    kind,
    status,
    name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : 'Unnamed Game',
    ownerAccountId: normalizeIntegerOrNull(record.ownerAccountId),
    ownerPlayerName: typeof record.ownerPlayerName === 'string' ? record.ownerPlayerName : null,
    hostAccountId: normalizeIntegerOrNull(record.hostAccountId),
    hostPlayerName: typeof record.hostPlayerName === 'string' ? record.hostPlayerName : null,
    createdAt,
    updatedAt,
    lastStartedAt: typeof record.lastStartedAt === 'string' ? record.lastStartedAt : null,
    lastSavedAt: typeof record.lastSavedAt === 'string' ? record.lastSavedAt : null,
    currentTurn: normalizeIntegerOrNull(record.currentTurn),
    currentSaveId: typeof record.currentSaveId === 'string' && record.currentSaveId.trim() ? record.currentSaveId : null
  };
}

function normalizeStatus(value: unknown): GameStatus {
  switch (value) {
    case 'DRAFT':
    case 'RUNNING':
    case 'OFFLINE':
    case 'ARCHIVED':
      return value;
    default:
      return 'DRAFT';
  }
}

function normalizeIntegerOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function compareGamesDesc(left: GameRecord, right: GameRecord): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.gameId.localeCompare(left.gameId);
}

function ensureRegistryDirectory(registryPath: string): void {
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
}
