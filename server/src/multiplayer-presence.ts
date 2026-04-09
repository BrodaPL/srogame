import fs from 'node:fs';
import path from 'node:path';
import type {
  GameId,
  MultiplayerPresenceState
} from '../../src/app/models/game-api-types.ts';

export type MultiplayerPresenceRecord = {
  gameId: GameId;
  accountId: number;
  lastSeenAt: string;
  state: MultiplayerPresenceState;
  autoSkipTurnEnabled: boolean;
  autoSkipTurnActivatedAt: string | null;
  returnNoticePending: boolean;
};

export type MultiplayerPresenceData = {
  presences: MultiplayerPresenceRecord[];
};

const EMPTY_PRESENCE_DATA: MultiplayerPresenceData = {
  presences: []
};

export function loadMultiplayerPresenceStore(presencePath: string): MultiplayerPresenceData {
  ensurePresenceDirectory(presencePath);

  try {
    const raw = fs.readFileSync(presencePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<MultiplayerPresenceData> | null;
    const presences = Array.isArray(parsed?.presences) ? parsed.presences : [];
    return {
      presences: presences
        .map((entry) => normalizePresenceRecord(entry))
        .filter((entry): entry is MultiplayerPresenceRecord => !!entry)
    };
  } catch {
    saveMultiplayerPresenceStore(presencePath, EMPTY_PRESENCE_DATA);
    return { ...EMPTY_PRESENCE_DATA, presences: [] };
  }
}

export function saveMultiplayerPresenceStore(presencePath: string, data: MultiplayerPresenceData): void {
  ensurePresenceDirectory(presencePath);
  fs.writeFileSync(
    presencePath,
    JSON.stringify({ presences: data.presences }, null, 2),
    'utf-8'
  );
}

export function listPresenceForGame(
  presencePath: string,
  gameId: GameId
): MultiplayerPresenceRecord[] {
  return loadMultiplayerPresenceStore(presencePath).presences.filter((entry) => entry.gameId === gameId);
}

export function getPresenceForGameAccount(
  presencePath: string,
  gameId: GameId,
  accountId: number
): MultiplayerPresenceRecord | null {
  return loadMultiplayerPresenceStore(presencePath).presences.find((entry) =>
    entry.gameId === gameId && entry.accountId === accountId
  ) ?? null;
}

export function upsertPresence(
  presencePath: string,
  record: MultiplayerPresenceRecord
): MultiplayerPresenceRecord {
  const data = loadMultiplayerPresenceStore(presencePath);
  const normalized = normalizePresenceRecord(record) ?? record;
  const existingIndex = data.presences.findIndex((entry) =>
    entry.gameId === normalized.gameId && entry.accountId === normalized.accountId
  );
  if (existingIndex >= 0) {
    data.presences[existingIndex] = normalized;
  } else {
    data.presences.push(normalized);
  }

  saveMultiplayerPresenceStore(presencePath, data);
  return normalized;
}

export function removePresence(
  presencePath: string,
  gameId: GameId,
  accountId: number
): boolean {
  const data = loadMultiplayerPresenceStore(presencePath);
  const nextPresences = data.presences.filter((entry) =>
    !(entry.gameId === gameId && entry.accountId === accountId)
  );
  if (nextPresences.length === data.presences.length) {
    return false;
  }

  saveMultiplayerPresenceStore(presencePath, { presences: nextPresences });
  return true;
}

export function removePresenceForGame(presencePath: string, gameId: GameId): void {
  const data = loadMultiplayerPresenceStore(presencePath);
  const nextPresences = data.presences.filter((entry) => entry.gameId !== gameId);
  if (nextPresences.length === data.presences.length) {
    return;
  }

  saveMultiplayerPresenceStore(presencePath, { presences: nextPresences });
}

export function ensurePresence(
  presencePath: string,
  gameId: GameId,
  accountId: number,
  seenAt = new Date().toISOString()
): MultiplayerPresenceRecord {
  const existing = getPresenceForGameAccount(presencePath, gameId, accountId);
  if (existing) {
    return existing;
  }

  return upsertPresence(presencePath, {
    gameId,
    accountId,
    lastSeenAt: seenAt,
    state: 'ACTIVE',
    autoSkipTurnEnabled: false,
    autoSkipTurnActivatedAt: null,
    returnNoticePending: false
  });
}

export function markPresenceSeen(
  presencePath: string,
  gameId: GameId,
  accountId: number,
  seenAt = new Date().toISOString()
): MultiplayerPresenceRecord {
  const existing = ensurePresence(presencePath, gameId, accountId, seenAt);
  return upsertPresence(presencePath, {
    ...existing,
    lastSeenAt: seenAt
  });
}

export function setAutoSkipTurnEnabled(
  presencePath: string,
  gameId: GameId,
  accountId: number,
  enabled: boolean,
  seenAt = new Date().toISOString()
): MultiplayerPresenceRecord {
  const existing = ensurePresence(presencePath, gameId, accountId, seenAt);
  return upsertPresence(presencePath, {
    ...existing,
    lastSeenAt: seenAt,
    autoSkipTurnEnabled: enabled,
    state: enabled ? existing.state : 'ACTIVE',
    autoSkipTurnActivatedAt: enabled ? existing.autoSkipTurnActivatedAt : null,
    returnNoticePending: enabled ? existing.returnNoticePending : false
  });
}

export function activateAutoSkipTurn(
  presencePath: string,
  gameId: GameId,
  accountId: number,
  seenAt = new Date().toISOString()
): MultiplayerPresenceRecord {
  const existing = ensurePresence(presencePath, gameId, accountId, seenAt);
  return upsertPresence(presencePath, {
    ...existing,
    lastSeenAt: seenAt,
    state: 'AUTO_SKIP_TURN',
    autoSkipTurnEnabled: true,
    autoSkipTurnActivatedAt: existing.autoSkipTurnActivatedAt ?? seenAt,
    returnNoticePending: true
  });
}

export function acknowledgeAutoSkipTurnNotice(
  presencePath: string,
  gameId: GameId,
  accountId: number,
  seenAt = new Date().toISOString()
): MultiplayerPresenceRecord {
  const existing = ensurePresence(presencePath, gameId, accountId, seenAt);
  return upsertPresence(presencePath, {
    ...existing,
    lastSeenAt: seenAt,
    returnNoticePending: false
  });
}

function normalizePresenceRecord(value: unknown): MultiplayerPresenceRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<MultiplayerPresenceRecord>;
  if (typeof record.gameId !== 'string' || !record.gameId.trim()) {
    return null;
  }
  if (typeof record.accountId !== 'number' || !Number.isInteger(record.accountId)) {
    return null;
  }

  return {
    gameId: record.gameId,
    accountId: record.accountId,
    lastSeenAt: typeof record.lastSeenAt === 'string' && record.lastSeenAt.trim()
      ? record.lastSeenAt
      : new Date(0).toISOString(),
    state: record.state === 'AUTO_SKIP_TURN' ? record.state : 'ACTIVE',
    autoSkipTurnEnabled: record.autoSkipTurnEnabled === true,
    autoSkipTurnActivatedAt: typeof record.autoSkipTurnActivatedAt === 'string' && record.autoSkipTurnActivatedAt.trim()
      ? record.autoSkipTurnActivatedAt
      : null,
    returnNoticePending: record.returnNoticePending === true
  };
}

function ensurePresenceDirectory(presencePath: string): void {
  fs.mkdirSync(path.dirname(presencePath), { recursive: true });
}
