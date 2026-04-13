import type { BotDecisionTrace } from './bot-debug.ts';

class BotDebugStore {
  private readonly traces: BotDecisionTrace[] = [];

  constructor(private readonly maxEntries: number) {}

  public addTrace(trace: BotDecisionTrace): void {
    this.traces.push(trace);
    while (this.traces.length > this.maxEntries) {
      this.traces.shift();
    }
  }

  public getTraces(playerId?: number): BotDecisionTrace[] {
    const filtered = playerId === undefined
      ? this.traces
      : this.traces.filter((entry) => entry.playerId === playerId);
    return filtered.map((entry) => ({
      ...entry,
      actionBudget: { ...entry.actionBudget },
      chosenActions: entry.chosenActions.map((action) => ({
        ...action,
        details: { ...action.details }
      })),
      rejectedActions: entry.rejectedActions.map((action) => ({
        ...action,
        details: { ...action.details }
      }))
    }));
  }

  public clear(): void {
    this.traces.length = 0;
  }
}

export const BOT_DEBUG_STORE = new BotDebugStore(50);

export function recordBotDecisionTrace(trace: BotDecisionTrace): void {
  BOT_DEBUG_STORE.addTrace(trace);
}

export function getBotDecisionTraces(playerId?: number): BotDecisionTrace[] {
  return BOT_DEBUG_STORE.getTraces(playerId);
}

export function clearBotDecisionTraces(): void {
  BOT_DEBUG_STORE.clear();
}
