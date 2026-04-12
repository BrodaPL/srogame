import * as playerTypeEnumModule from '../../src/app/models/enums/player-type.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type { TurnStatusResponse } from '../../src/app/models/game-api-types.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { PlayerType } = resolveModule(playerTypeEnumModule) as typeof import('../../src/app/models/enums/player-type.js');

export function activeHumanPlayers(galaxy: Galaxy) {
  return galaxy.players.filter((player) => player.type === PlayerType.PLAYER);
}

export function requiresAllPlayersReady(galaxy: Galaxy): boolean {
  return activeHumanPlayers(galaxy).length > 1;
}

export function areAllHumanPlayersReady(
  galaxy: Galaxy,
  readyPlayerIds: ReadonlySet<number>,
  blockingPlayerIds?: ReadonlySet<number>
): boolean {
  const humans = activeHumanPlayers(galaxy);
  const blockingHumans = blockingPlayerIds
    ? humans.filter((player) => blockingPlayerIds.has(player.playerId))
    : humans;
  return blockingHumans.length > 0 && blockingHumans.every((player) => readyPlayerIds.has(player.playerId));
}

export function buildTurnStatusResponse(
  galaxy: Galaxy,
  readyPlayerIds: ReadonlySet<number>,
  currentPlayerId: number,
  isProcessing: boolean,
  options: {
    onlineHumanCount?: number;
    minimumOnlineHumanCount?: number;
    progressionBlockedReason?: string | null;
    progressionBlockedReasonKey?: string | null;
    progressionBlockedReasonParams?: TurnStatusResponse['progressionBlockedReasonParams'];
    blockingPlayerIds?: ReadonlySet<number>;
    currentPlayerPresenceState?: TurnStatusResponse['currentPlayerPresenceState'];
    currentPlayerAutoSkipEnabled?: boolean;
    currentPlayerAutoSkipActivatedAt?: string | null;
    showAutoSkipReturnNotice?: boolean;
    showPresenceRemovedReturnNotice?: boolean;
  } = {}
): TurnStatusResponse {
  const humans = activeHumanPlayers(galaxy);
  const blockingPlayerIds = options.blockingPlayerIds;
  const blockingHumans = blockingPlayerIds
    ? humans.filter((player) => blockingPlayerIds.has(player.playerId))
    : humans;
  const readyPlayers = blockingHumans.filter((player) => readyPlayerIds.has(player.playerId));
  const waitingPlayers = blockingHumans.filter((player) => !readyPlayerIds.has(player.playerId));

  return {
    currentTurn: galaxy.currentTurn,
    requiresAllPlayersReady: humans.length > 1,
    onlineHumanCount: options.onlineHumanCount ?? humans.length,
    minimumOnlineHumanCount: options.minimumOnlineHumanCount ?? 1,
    progressionBlockedReason: options.progressionBlockedReason ?? null,
    progressionBlockedReasonKey: options.progressionBlockedReasonKey ?? null,
    progressionBlockedReasonParams: options.progressionBlockedReasonParams ?? null,
    currentPlayerPresenceState: options.currentPlayerPresenceState ?? null,
    currentPlayerAutoSkipEnabled: options.currentPlayerAutoSkipEnabled ?? false,
    currentPlayerAutoSkipActivatedAt: options.currentPlayerAutoSkipActivatedAt ?? null,
    showAutoSkipReturnNotice: options.showAutoSkipReturnNotice ?? false,
    showPresenceRemovedReturnNotice: options.showPresenceRemovedReturnNotice ?? false,
    isProcessing,
    currentPlayerReady: readyPlayerIds.has(currentPlayerId),
    readyPlayerIds: readyPlayers.map((player) => player.playerId),
    readyPlayerNames: readyPlayers.map((player) => player.playerName),
    waitingForPlayerIds: waitingPlayers.map((player) => player.playerId),
    waitingForPlayerNames: waitingPlayers.map((player) => player.playerName)
  };
}
