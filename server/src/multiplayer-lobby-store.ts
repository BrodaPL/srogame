import fs from 'node:fs';
import path from 'node:path';
import type {
  MultiplayerLobbyMode,
  MultiplayerLobbyState
} from './multiplayer-lobby.js';
import { reconcileLobbyState } from './multiplayer-lobby.js';
import type { GameSaveSummary, GalaxySetup } from '../../src/app/models/game-api-types.ts';

export type MultiplayerLobbyRecord = MultiplayerLobbyState & {
  gameId: string;
  createdAt: string;
  updatedAt: string;
};

export type MultiplayerLobbyStoreData = {
  lobbies: MultiplayerLobbyRecord[];
};

const EMPTY_LOBBY_STORE: MultiplayerLobbyStoreData = {
  lobbies: []
};

export function loadMultiplayerLobbyStore(storePath: string): MultiplayerLobbyStoreData {
  ensureLobbyStoreDirectory(storePath);

  try {
    const raw = fs.readFileSync(storePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MultiplayerLobbyStoreData> | null;
    const lobbies = Array.isArray(parsed?.lobbies) ? parsed.lobbies : [];
    return {
      lobbies: lobbies
        .map((entry) => normalizeMultiplayerLobbyRecord(entry))
        .filter((entry): entry is MultiplayerLobbyRecord => !!entry)
        .sort(compareLobbiesDesc)
    };
  } catch {
    saveMultiplayerLobbyStore(storePath, EMPTY_LOBBY_STORE);
    return { ...EMPTY_LOBBY_STORE, lobbies: [] };
  }
}

export function saveMultiplayerLobbyStore(storePath: string, data: MultiplayerLobbyStoreData): void {
  ensureLobbyStoreDirectory(storePath);
  fs.writeFileSync(
    storePath,
    JSON.stringify({ lobbies: [...data.lobbies].sort(compareLobbiesDesc) }, null, 2),
    'utf-8'
  );
}

export function listMultiplayerLobbies(storePath: string): MultiplayerLobbyRecord[] {
  return loadMultiplayerLobbyStore(storePath).lobbies;
}

export function getMultiplayerLobbyByGameId(
  storePath: string,
  gameId: string
): MultiplayerLobbyRecord | null {
  return loadMultiplayerLobbyStore(storePath).lobbies.find((entry) => entry.gameId === gameId) ?? null;
}

export function upsertMultiplayerLobby(
  storePath: string,
  record: MultiplayerLobbyRecord
): MultiplayerLobbyRecord {
  const data = loadMultiplayerLobbyStore(storePath);
  const existingIndex = data.lobbies.findIndex((entry) => entry.gameId === record.gameId);
  const normalized = normalizeMultiplayerLobbyRecord(record) ?? record;
  if (existingIndex >= 0) {
    data.lobbies[existingIndex] = normalized;
  } else {
    data.lobbies.push(normalized);
  }

  saveMultiplayerLobbyStore(storePath, data);
  return normalized;
}

export function updateMultiplayerLobby(
  storePath: string,
  gameId: string,
  patch: Partial<Omit<MultiplayerLobbyRecord, 'gameId' | 'createdAt'>>
): MultiplayerLobbyRecord | null {
  const current = getMultiplayerLobbyByGameId(storePath, gameId);
  if (!current) {
    return null;
  }

  return upsertMultiplayerLobby(storePath, {
    ...current,
    ...patch,
    gameId: current.gameId,
    createdAt: current.createdAt,
    updatedAt: patch.updatedAt ?? new Date().toISOString()
  });
}

export function deleteMultiplayerLobby(storePath: string, gameId: string): boolean {
  const data = loadMultiplayerLobbyStore(storePath);
  const nextLobbies = data.lobbies.filter((entry) => entry.gameId !== gameId);
  if (nextLobbies.length === data.lobbies.length) {
    return false;
  }

  saveMultiplayerLobbyStore(storePath, { lobbies: nextLobbies });
  return true;
}

function normalizeMultiplayerLobbyRecord(value: unknown): MultiplayerLobbyRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<MultiplayerLobbyRecord>;
  if (typeof record.gameId !== 'string' || !record.gameId.trim()) {
    return null;
  }

  if (typeof record.hostAccountId !== 'number' || !Number.isInteger(record.hostAccountId)) {
    return null;
  }

  if (typeof record.hostPlayerName !== 'string' || !record.hostPlayerName.trim()) {
    return null;
  }

  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : new Date(0).toISOString();
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : createdAt;
  const mode: MultiplayerLobbyMode = record.mode === 'LOAD_SAVE' ? 'LOAD_SAVE' : 'NEW_GAME';
  const setup = record.setup as GalaxySetup | undefined;
  const boundSave = record.boundSave as GameSaveSummary | null | undefined;

  if (!setup) {
    return null;
  }

  const lobby = reconcileLobbyState({
    hostAccountId: record.hostAccountId,
    hostPlayerName: record.hostPlayerName,
    mode,
    setup,
    members: Array.isArray(record.members) ? record.members : [],
    boundSaveId: typeof record.boundSaveId === 'string' && record.boundSaveId.trim() ? record.boundSaveId : null,
    boundSave: boundSave ?? null,
    loadSeats: Array.isArray(record.loadSeats) ? record.loadSeats : []
  });

  return {
    gameId: record.gameId,
    createdAt,
    updatedAt,
    ...lobby
  };
}

function compareLobbiesDesc(left: MultiplayerLobbyRecord, right: MultiplayerLobbyRecord): number {
  return right.updatedAt.localeCompare(left.updatedAt) || right.gameId.localeCompare(left.gameId);
}

function ensureLobbyStoreDirectory(storePath: string): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
}
