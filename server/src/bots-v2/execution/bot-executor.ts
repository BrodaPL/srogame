import type { BotExecutionOutcome, BotExecutor, BotProposal } from '../bot-v2-types.ts';

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
