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

export function areAllHumanPlayersReady(galaxy: Galaxy, readyPlayerIds: ReadonlySet<number>): boolean {
  const humans = activeHumanPlayers(galaxy);
  return humans.length > 1 && humans.every((player) => readyPlayerIds.has(player.playerId));
}

export function buildTurnStatusResponse(
  galaxy: Galaxy,
  readyPlayerIds: ReadonlySet<number>,
  currentPlayerId: number,
  isProcessing: boolean
): TurnStatusResponse {
  const humans = activeHumanPlayers(galaxy);
  const readyPlayers = humans.filter((player) => readyPlayerIds.has(player.playerId));
  const waitingPlayers = humans.filter((player) => !readyPlayerIds.has(player.playerId));

  return {
    currentTurn: galaxy.currentTurn,
    requiresAllPlayersReady: humans.length > 1,
    isProcessing,
    currentPlayerReady: readyPlayerIds.has(currentPlayerId),
    readyPlayerIds: readyPlayers.map((player) => player.playerId),
    readyPlayerNames: readyPlayers.map((player) => player.playerName),
    waitingForPlayerIds: waitingPlayers.map((player) => player.playerId),
    waitingForPlayerNames: waitingPlayers.map((player) => player.playerName)
  };
}
