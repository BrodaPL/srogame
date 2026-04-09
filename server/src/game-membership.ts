import fs from 'node:fs';
import path from 'node:path';
import type {
  GameId,
  GameMembershipRole
} from '../../src/app/models/game-api-types.ts';

export type GameMembershipRecord = {
  gameId: GameId;
  accountId: number;
  playerName: string;
  role: GameMembershipRole;
  joinedAt: string;
  lastSeenAt: string | null;
  isActive: boolean;
};

export type GameMembershipData = {
  memberships: GameMembershipRecord[];
};

const EMPTY_MEMBERSHIPS: GameMembershipData = { memberships: [] };

export function loadGameMemberships(membershipPath: string): GameMembershipData {
  ensureMembershipDirectory(membershipPath);

  try {
    const raw = fs.readFileSync(membershipPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<GameMembershipData> | null;
    const memberships = Array.isArray(parsed?.memberships) ? parsed.memberships : [];
    return {
      memberships: memberships
        .map((entry) => normalizeMembershipRecord(entry))
        .filter((entry): entry is GameMembershipRecord => !!entry)
    };
  } catch {
    saveGameMemberships(membershipPath, EMPTY_MEMBERSHIPS);
    return { ...EMPTY_MEMBERSHIPS, memberships: [] };
  }
}

export function saveGameMemberships(membershipPath: string, data: GameMembershipData): void {
  ensureMembershipDirectory(membershipPath);
  fs.writeFileSync(
    membershipPath,
    JSON.stringify({ memberships: data.memberships }, null, 2),
    'utf-8'
  );
}

export function listMembershipsForGame(
  membershipPath: string,
  gameId: GameId
): GameMembershipRecord[] {
  return loadGameMemberships(membershipPath).memberships.filter((entry) => entry.gameId === gameId);
}

export function listMembershipsForAccount(
  membershipPath: string,
  accountId: number
): GameMembershipRecord[] {
  return loadGameMemberships(membershipPath).memberships.filter((entry) => entry.accountId === accountId);
}

export function upsertMembership(
  membershipPath: string,
  record: GameMembershipRecord
): GameMembershipRecord {
  const data = loadGameMemberships(membershipPath);
  const existingIndex = data.memberships.findIndex((entry) =>
    entry.gameId === record.gameId && entry.accountId === record.accountId
  );
  const normalized = normalizeMembershipRecord(record) ?? record;
  if (existingIndex >= 0) {
    data.memberships[existingIndex] = normalized;
  } else {
    data.memberships.push(normalized);
  }

  saveGameMemberships(membershipPath, data);
  return normalized;
}

export function removeMembership(
  membershipPath: string,
  gameId: GameId,
  accountId: number
): boolean {
  const data = loadGameMemberships(membershipPath);
  const nextMemberships = data.memberships.filter((entry) =>
    !(entry.gameId === gameId && entry.accountId === accountId)
  );
  if (nextMemberships.length === data.memberships.length) {
    return false;
  }

  saveGameMemberships(membershipPath, { memberships: nextMemberships });
  return true;
}

export function isAccountMemberOfGame(
  membershipPath: string,
  gameId: GameId,
  accountId: number
): boolean {
  return loadGameMemberships(membershipPath).memberships.some((entry) =>
    entry.gameId === gameId && entry.accountId === accountId && entry.isActive
  );
}

function normalizeMembershipRecord(value: unknown): GameMembershipRecord | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Partial<GameMembershipRecord>;
  if (typeof record.gameId !== 'string' || !record.gameId.trim()) {
    return null;
  }

  if (typeof record.accountId !== 'number' || !Number.isInteger(record.accountId)) {
    return null;
  }

  return {
    gameId: record.gameId,
    accountId: record.accountId,
    playerName: typeof record.playerName === 'string' ? record.playerName : '',
    role: normalizeRole(record.role),
    joinedAt: typeof record.joinedAt === 'string' ? record.joinedAt : new Date(0).toISOString(),
    lastSeenAt: typeof record.lastSeenAt === 'string' ? record.lastSeenAt : null,
    isActive: record.isActive !== false
  };
}

function normalizeRole(value: unknown): GameMembershipRole {
  switch (value) {
    case 'OWNER':
    case 'HOST':
    case 'MEMBER':
      return value;
    default:
      return 'MEMBER';
  }
}

function ensureMembershipDirectory(membershipPath: string): void {
  fs.mkdirSync(path.dirname(membershipPath), { recursive: true });
}
