import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import type { DiplomaticProposal } from '../../../src/app/models/diplomacy/diplomatic-proposal.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { BotProfile } from './bot-profile.ts';
import { buildBotDiplomacyContexts, type BotDiplomacyContext } from './bot-diplomacy-awareness.js';

export type BotDiplomaticProposalDecision = {
  approve: boolean;
  utility: number;
  reason: string;
  traceKind: 'approve-peace' | 'reject-peace' | 'approve-alliance' | 'reject-alliance';
};

export function decideIncomingDiplomaticProposal(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  proposal: DiplomaticProposal
): BotDiplomaticProposalDecision {
  const contexts = buildBotDiplomacyContexts(galaxy, player);
  const context = contexts.get(proposal.fromPlayerId) ?? {
    otherPlayerId: proposal.fromPlayerId,
    currentStatus: DiplomaticStatus.NEUTRAL,
    relativeStrengthRatio: 1,
    sharesBorder: false,
    borderPressure: 0,
    recentConflictScore: 0,
    strategicValue: 0
  };

  return decideIncomingDiplomaticProposalWithContext(profile, proposal.requestedStatus, context);
}

export function decideIncomingDiplomaticProposalWithContext(
  profile: BotProfile,
  requestedStatus: DiplomaticStatus,
  context: BotDiplomacyContext
): BotDiplomaticProposalDecision {
  if (requestedStatus === DiplomaticStatus.PEACE) {
    return decideIncomingPeaceProposal(profile, context);
  }

  if (requestedStatus === DiplomaticStatus.ALLIED) {
    return decideIncomingAllianceProposal(profile, context);
  }

  return {
    approve: false,
    utility: Number.NEGATIVE_INFINITY,
    reason: 'Rejected unsupported diplomacy proposal.',
    traceKind: 'reject-peace'
  };
}

function decideIncomingPeaceProposal(
  profile: BotProfile,
  context: BotDiplomacyContext
): BotDiplomaticProposalDecision {
  const losingPressureBonus = context.relativeStrengthRatio < 0.95
    ? (0.95 - context.relativeStrengthRatio) * 6
    : 0;
  const growthStabilityBonus = (profile.economyWeight * 1.5) + context.strategicValue;
  const dominancePenalty = context.relativeStrengthRatio > 1.35
    ? (context.relativeStrengthRatio - 1.35) * 5
    : 0;
  const utility = profile.peaceAcceptanceBias
    + (context.borderPressure * profile.borderThreatSensitivity)
    + losingPressureBonus
    + growthStabilityBonus
    - dominancePenalty
    - (context.recentConflictScore * profile.recentConflictPenaltyScale)
    - profile.warPersistenceBias;
  const approve = utility >= profile.diplomacyActionThreshold;

  return {
    approve,
    utility,
    reason: approve
      ? `Accepted PEACE due to border pressure ${context.borderPressure.toFixed(1)} and strength ratio ${context.relativeStrengthRatio.toFixed(2)}.`
      : `Rejected PEACE with utility ${utility.toFixed(2)} at strength ratio ${context.relativeStrengthRatio.toFixed(2)}.`,
    traceKind: approve ? 'approve-peace' : 'reject-peace'
  };
}

function decideIncomingAllianceProposal(
  profile: BotProfile,
  context: BotDiplomacyContext
): BotDiplomaticProposalDecision {
  if (context.currentStatus !== DiplomaticStatus.PEACE) {
    return {
      approve: false,
      utility: Number.NEGATIVE_INFINITY,
      reason: 'Rejected ALLIED proposal because the current relation is not PEACE.',
      traceKind: 'reject-alliance'
    };
  }

  const sharedSecurityValue = (context.borderPressure * 0.6) + (context.sharesBorder ? 1.5 : 0.4);
  const utility = profile.allianceAcceptanceBias
    + sharedSecurityValue
    + context.strategicValue
    - (context.recentConflictScore * profile.recentConflictPenaltyScale)
    - (profile.warPersistenceBias * 0.5);
  const approve = utility >= (profile.diplomacyActionThreshold + 1.5);

  return {
    approve,
    utility,
    reason: approve
      ? `Accepted ALLIED due to strategic value ${context.strategicValue.toFixed(1)} and border pressure ${context.borderPressure.toFixed(1)}.`
      : `Rejected ALLIED with utility ${utility.toFixed(2)}.`,
    traceKind: approve ? 'approve-alliance' : 'reject-alliance'
  };
}
