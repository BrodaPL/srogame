import type { BotProfileId, Player } from '../../../src/app/models/player.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import { BOT_PROFILE_IDS } from './bot-profile.js';

const pausedBotPlayerIds = new Set<number>();

export type BotAdminState = {
  playerId: number;
  playerName: string;
  profileId: BotProfileId | null;
  currentGoal: string | null;
  planetsOwned: number;
  activeFleetCount: number;
  paused: boolean;
};

export function listBotAdminStates(galaxy: Galaxy): BotAdminState[] {
  return [...galaxy.botPlayerMap.values()]
    .sort((left, right) => left.playerId - right.playerId)
    .map((player) => toBotAdminState(galaxy, player));
}

export function toBotAdminState(galaxy: Galaxy, player: Player): BotAdminState {
  return {
    playerId: player.playerId,
    playerName: player.playerName,
    profileId: player.botProfileId,
    currentGoal: player.botMemoryV2?.currentStance ?? null,
    planetsOwned: player.planets.length,
    activeFleetCount: galaxy.activeFleets.filter((fleet) => fleet.ownerId === player.playerId).length,
    paused: pausedBotPlayerIds.has(player.playerId)
  };
}

export function setBotProfile(player: Player, profileId: BotProfileId): void {
  if (!BOT_PROFILE_IDS.includes(profileId)) {
    throw new Error(`Unsupported bot profile: ${profileId}`);
  }

  player.botProfileId = profileId;
}

export function clearBotMemory(player: Player): void {
  player.botMemoryV2 = null;
}

export function pauseBot(playerId: number): void {
  pausedBotPlayerIds.add(playerId);
}

export function resumeBot(playerId: number): void {
  pausedBotPlayerIds.delete(playerId);
}

export function isBotPaused(playerId: number): boolean {
  return pausedBotPlayerIds.has(playerId);
}

export function resetBotAdminRuntimeState(): void {
  pausedBotPlayerIds.clear();
}
