import type { BotDecisionTraceV2 } from './bot-v2-types.ts';

class BotDebugStoreV2 {
  private readonly traces: BotDecisionTraceV2[] = [];

  constructor(private readonly maxEntries: number) {}

  public addTrace(trace: BotDecisionTraceV2): void {
    this.traces.push(trace);
    while (this.traces.length > this.maxEntries) {
      this.traces.shift();
    }
  }

  public getTraces(playerId?: number): BotDecisionTraceV2[] {
    const filtered = playerId === undefined
      ? this.traces
      : this.traces.filter((entry) => entry.playerId === playerId);
    return filtered.map((entry) => ({
      ...entry,
      snapshotSummary: {
        ...entry.snapshotSummary,
        totalResources: { ...entry.snapshotSummary.totalResources }
      },
      subsystemResults: entry.subsystemResults.map((result) => ({
        ...result,
        debug: { ...result.debug }
      })),
      proposals: entry.proposals.map((proposal) => ({ ...proposal })),
      supervisorDecision: {
        ...entry.supervisorDecision,
        acceptedProposalIds: [...entry.supervisorDecision.acceptedProposalIds],
        pendingProposalIds: [...entry.supervisorDecision.pendingProposalIds],
        debug: entry.supervisorDecision.debug ? { ...entry.supervisorDecision.debug } : undefined
      },
      executionOutcomes: entry.executionOutcomes.map((outcome) => ({ ...outcome }))
    }));
  }

  public clear(): void {
    this.traces.length = 0;
  }
}

const BOT_DEBUG_STORE_V2 = new BotDebugStoreV2(100);

export function recordBotDecisionTraceV2(trace: BotDecisionTraceV2): void {
  BOT_DEBUG_STORE_V2.addTrace(trace);
}

export function getBotDecisionTracesV2(playerId?: number): BotDecisionTraceV2[] {
  return BOT_DEBUG_STORE_V2.getTraces(playerId);
}

export function clearBotDecisionTracesV2(): void {
  BOT_DEBUG_STORE_V2.clear();
}
