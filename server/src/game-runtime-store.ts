import type { GalaxySetup } from '../../src/app/models/game-api-types.ts';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type { GalaxyPresentationData } from '../../src/app/models/planets/galaxy-presentation-data.ts';

export type GameRuntimeState = {
  gameId: string;
  galaxy: Galaxy;
  setup: GalaxySetup;
  presentationByPlayer: Map<number, GalaxyPresentationData>;
  loadedAt: string;
  lastTouchedAt: string;
  isDirty: boolean;
  currentTurnReadyPlayerIds: Set<number>;
  isTurnProcessing: boolean;
  offlineBotControlledPlayerIds: Set<number>;
};

const runtimes = new Map<string, GameRuntimeState>();

export function setGameRuntime(runtime: GameRuntimeState): GameRuntimeState {
  runtimes.set(runtime.gameId, runtime);
  return runtime;
}

export function getGameRuntime(gameId: string): GameRuntimeState | null {
  return runtimes.get(gameId) ?? null;
}

export function hasGameRuntime(gameId: string): boolean {
  return runtimes.has(gameId);
}

export function deleteGameRuntime(gameId: string): boolean {
  return runtimes.delete(gameId);
}

export function listLoadedGameIds(): string[] {
  return [...runtimes.keys()];
}

export function touchGameRuntime(gameId: string, touchedAt = new Date().toISOString()): GameRuntimeState | null {
  const runtime = runtimes.get(gameId);
  if (!runtime) {
    return null;
  }

  const nextRuntime = {
    ...runtime,
    lastTouchedAt: touchedAt
  };
  runtimes.set(gameId, nextRuntime);
  return nextRuntime;
}

export function updateGameRuntime(
  gameId: string,
  patch: Partial<Omit<GameRuntimeState, 'gameId' | 'loadedAt'>>
): GameRuntimeState | null {
  const runtime = runtimes.get(gameId);
  if (!runtime) {
    return null;
  }

  const nextRuntime: GameRuntimeState = {
    ...runtime,
    ...patch,
    gameId: runtime.gameId,
    loadedAt: runtime.loadedAt,
    currentTurnReadyPlayerIds: patch.currentTurnReadyPlayerIds ?? runtime.currentTurnReadyPlayerIds,
    offlineBotControlledPlayerIds: patch.offlineBotControlledPlayerIds ?? runtime.offlineBotControlledPlayerIds,
    lastTouchedAt: patch.lastTouchedAt ?? new Date().toISOString()
  };
  runtimes.set(gameId, nextRuntime);
  return nextRuntime;
}

export function clearGameRuntimes(): void {
  runtimes.clear();
}
