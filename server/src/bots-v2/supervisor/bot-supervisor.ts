import type {
  BotProposal,
  BotSupervisor,
  BotSupervisorDecision,
  BotV2FeatureFlags,
  BotWorldSnapshot
} from '../bot-v2-types.ts';
import type { BotMemoryV2 } from '../../../../src/app/models/player.ts';

export class ShadowBotSupervisor implements BotSupervisor {
  constructor(private readonly flags: BotV2FeatureFlags) {}

  public decide(
    _snapshot: BotWorldSnapshot,
    _memory: BotMemoryV2,
    proposals: BotProposal[]
  ): BotSupervisorDecision {
    if (!this.flags.allowSupervisorAcceptance || proposals.length === 0) {
      return {
        accepted: [],
        rejected: proposals.map((proposal) => ({
          proposalId: proposal.proposalId,
          reason: 'shadow_mode_no_execution'
        }))
      };
    }

    const accepted = proposals
      .filter((proposal) => proposal.status !== 'BLOCKED' && proposal.blockers.length === 0)
      .sort((left, right) =>
        scoreForAcceptance(right) - scoreForAcceptance(left) || left.proposalId.localeCompare(right.proposalId)
      )
      .slice(0, 1)
      .map((proposal) => ({
        ...proposal,
        status: 'ACCEPTED' as const
      }));
    const acceptedIds = new Set(accepted.map((proposal) => proposal.proposalId));

    return {
      accepted,
      rejected: proposals
        .filter((proposal) => !acceptedIds.has(proposal.proposalId))
        .map((proposal) => ({
          proposalId: proposal.proposalId,
          reason: accepted.length === 0 ? 'shadow_mode_no_acceptable_proposal' : 'shadow_mode_not_selected'
        }))
    };
  }
}

function scoreForAcceptance(proposal: BotProposal): number {
  return proposal.expectedValue + (proposal.urgency * 0.5) + (proposal.confidence * 0.25) - (proposal.risk * 0.25);
}
