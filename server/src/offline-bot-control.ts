import * as playerTypeEnumModule from '../../src/app/models/enums/player-type.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type { BotProfileId } from '../../src/app/models/player.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { PlayerType } = resolveModule(playerTypeEnumModule) as typeof import('../../src/app/models/enums/player-type.js');

const BOT_PROFILE_IDS: BotProfileId[] = [
  'BALANCED',
  'AGGRESSOR',
  'TURTLE',
  'MINER',
  'AVOIDER',
  'BUNKERER'
];

export type OfflineBotControlAccount = {
  id: number;
  replaceWithBotOnLogout: boolean;
  logoutBotProfileId: BotProfileId | null;
};

export type OfflineBotControlSession = {
  accountId: number;
  currentGameId: string | null;
};

export type OfflineBotControlMembership = {
  accountId: number;
  playerName: string;
  isActive: boolean;
};

export type OfflineBotControlReconcileResult = {
  changed: boolean;
  offlineBotControlledPlayerIds: Set<number>;
};

export function reconcileOfflineBotControlledSeats(
  galaxy: Galaxy,
  gameId: string,
  memberships: OfflineBotControlMembership[],
  accounts: OfflineBotControlAccount[],
  sessions: OfflineBotControlSession[],
  currentOfflineBotControlledPlayerIds: ReadonlySet<number>
): OfflineBotControlReconcileResult {
  const nextOfflineBotControlledPlayerIds = new Set(currentOfflineBotControlledPlayerIds);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const activeAccountIdsForGame = new Set(
    sessions
      .filter((session) => session.currentGameId === gameId)
      .map((session) => session.accountId)
  );

  let changed = false;

  for (const membership of memberships) {
    if (!membership.isActive) {
      continue;
    }

    const account = accountById.get(membership.accountId);
    if (!account) {
      continue;
    }

    const playerId = galaxy.playerNameMap.get(membership.playerName) ?? null;
    if (playerId === null) {
      continue;
    }

    const player = galaxy.players.find((entry) => entry.playerId === playerId) ?? null;
    if (!player) {
      continue;
    }

    const shouldBeOfflineBotControlled = account.replaceWithBotOnLogout
      && !activeAccountIdsForGame.has(membership.accountId);

    if (shouldBeOfflineBotControlled) {
      if (!nextOfflineBotControlledPlayerIds.has(playerId) || player.type !== PlayerType.BOT) {
        changed = true;
      }
      nextOfflineBotControlledPlayerIds.add(playerId);
      player.type = PlayerType.BOT;
      player.botProfileId = account.logoutBotProfileId ?? player.botProfileId ?? defaultBotProfileIdForPlayerId(player.playerId);
      player.botMemory = null;
      continue;
    }

    if (nextOfflineBotControlledPlayerIds.delete(playerId) || player.type !== PlayerType.PLAYER) {
      changed = true;
    }
    player.type = PlayerType.PLAYER;
  }

  for (const playerId of [...nextOfflineBotControlledPlayerIds]) {
    const isStillTrackedMembership = memberships.some((membership) => {
      if (!membership.isActive) {
        return false;
      }
      return galaxy.playerNameMap.get(membership.playerName) === playerId;
    });
    if (!isStillTrackedMembership) {
      nextOfflineBotControlledPlayerIds.delete(playerId);
      changed = true;
    }
  }

  if (changed) {
    rebuildGalaxyPlayerMaps(galaxy);
  }

  return {
    changed,
    offlineBotControlledPlayerIds: nextOfflineBotControlledPlayerIds
  };
}

export function rebuildGalaxyPlayerMaps(galaxy: Galaxy): void {
  galaxy.humanPlayerMap = new Map();
  galaxy.botPlayerMap = new Map();
  galaxy.neutralPlayerMap = new Map();
  galaxy.playerNameMap = new Map();

  for (const player of galaxy.players) {
    galaxy.playerNameMap.set(player.playerName, player.playerId);
    if (player.type === PlayerType.PLAYER) {
      galaxy.humanPlayerMap.set(player.playerId, player);
      continue;
    }

    if (player.type === PlayerType.BOT) {
      galaxy.botPlayerMap.set(player.playerId, player);
      continue;
    }

    galaxy.neutralPlayerMap.set(player.playerId, player);
  }
}

function defaultBotProfileIdForPlayerId(playerId: number): BotProfileId {
  const normalizedPlayerId = Number.isInteger(playerId) ? Math.abs(playerId) : 0;
  return BOT_PROFILE_IDS[normalizedPlayerId % BOT_PROFILE_IDS.length] ?? 'BALANCED';
}
