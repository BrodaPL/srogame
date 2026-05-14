import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import { startBuildingConstruction } from '../../game-commands/building-commands.js';
import { startTechnologyResearch } from '../../game-commands/research-commands.js';
import { startShipyardConstruction } from '../../game-commands/shipyard-commands.js';
import type { BotExecutionOutcome, BotExecutor, BotProposal } from '../bot-v2-types.ts';
import { normalizeQueueExecutionProposal } from './bot-execution-adapters.js';

export class NoopBotExecutor implements BotExecutor {
  public executeAcceptedTasks(accepted: BotProposal[]): BotExecutionOutcome[] {
    return accepted.map((proposal) => ({
      proposalId: proposal.proposalId,
      executed: false,
      success: false,
      message: 'Execution disabled in shadow mode.'
    }));
  }
}

export class LiveQueueBotExecutor implements BotExecutor {
  constructor(
    private readonly galaxy: Galaxy,
    private readonly playerId: number
  ) {}

  public executeAcceptedTasks(accepted: BotProposal[]): BotExecutionOutcome[] {
    const outcomes: BotExecutionOutcome[] = [];
    for (const proposal of accepted) {
      outcomes.push(this.executeAcceptedTask(proposal));
    }
    return outcomes;
  }

  private executeAcceptedTask(proposal: BotProposal): BotExecutionOutcome {
    const normalized = normalizeQueueExecutionProposal(proposal);
    if (!normalized.ok) {
      return {
        proposalId: proposal.proposalId,
        executed: false,
        success: false,
        message: normalized.reason
      };
    }

    const context = {
      galaxy: this.galaxy,
      playerId: this.playerId
    };
    const result = normalized.value.kind === 'BUILDING'
      ? startBuildingConstruction(context, normalized.value.command)
      : normalized.value.kind === 'RESEARCH'
        ? startTechnologyResearch(context, normalized.value.command)
        : startShipyardConstruction(context, normalized.value.command);

    if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Command failed for proposal ${proposal.proposalId}: ${result.error.code} ${message}`
      );
      return {
        proposalId: proposal.proposalId,
        executed: true,
        success: false,
        message
      };
    }

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: null,
      spent: {
        metal: result.value.spent.metal,
        crystal: result.value.spent.crystal,
        deuterium: result.value.spent.deuterium
      }
    };
  }
}
