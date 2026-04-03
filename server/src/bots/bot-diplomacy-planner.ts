import * as diplomaticStatusEnumModule from '../../../src/app/models/diplomacy/diplomatic-status.js';
import * as diplomaticProposalStateModule from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import * as diplomaticProposalRulesModule from '../../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import { hasOutgoingProposalSentThisTurn, isPlayerVisibleInDiplomacy } from '../game-commands/diplomacy-commands.js';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { BotProfile } from './bot-profile.ts';
import { buildBotDiplomacyContexts, type BotDiplomacyContext } from './bot-diplomacy-awareness.js';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { DiplomaticStatus } = resolveModule(diplomaticStatusEnumModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-status.js');
const { DiplomaticProposalState } = resolveModule(diplomaticProposalStateModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-state.js');
const { allowedDiplomaticProposalStatuses } = resolveModule(diplomaticProposalRulesModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-rules.js');

export type BotDiplomacyProposalCandidate = {
  requestedStatus: DiplomaticStatusType;
  targetPlayerId: number;
  utility: number;
  reason: string;
};

const PEACE_PROPOSAL_THRESHOLD = 3;
const ALLIANCE_PROPOSAL_THRESHOLD = 5;
const DIPLOMACY_PROPOSAL_COOLDOWN_TURNS = 4;

export function buildBotDiplomacyProposalCandidate(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): BotDiplomacyProposalCandidate | null {
  if (hasOutgoingProposalSentThisTurn(galaxy, player.playerId, galaxy.currentTurn)) {
    return null;
  }

  const contexts = buildBotDiplomacyContexts(galaxy, player);
  const candidates: BotDiplomacyProposalCandidate[] = [];

  for (const otherPlayer of galaxy.players) {
    if (otherPlayer.playerId === player.playerId || otherPlayer.type === 'NEUTRAL') {
      continue;
    }
    if (!isPlayerVisibleInDiplomacy(galaxy, player.playerId, otherPlayer.playerId)) {
      continue;
    }
    if (galaxy.diplomaticProposals.some((proposal) =>
      proposal.state === DiplomaticProposalState.PENDING
      && (
        (proposal.fromPlayerId === player.playerId && proposal.toPlayerId === otherPlayer.playerId)
        || (proposal.fromPlayerId === otherPlayer.playerId && proposal.toPlayerId === player.playerId)
      )
    )) {
      continue;
    }

    const context = contexts.get(otherPlayer.playerId) ?? null;
    if (!context) {
      continue;
    }

    for (const requestedStatus of allowedDiplomaticProposalStatuses(context.currentStatus)) {
      if (requestedStatus !== DiplomaticStatus.PEACE && requestedStatus !== DiplomaticStatus.ALLIED) {
        continue;
      }
      if (wasRecentlyProposedTo(player, otherPlayer.playerId, requestedStatus, galaxy.currentTurn)) {
        continue;
      }

      const candidate = requestedStatus === DiplomaticStatus.PEACE
        ? buildPeaceProposalCandidate(otherPlayer.playerId, profile, context)
        : buildAllianceProposalCandidate(otherPlayer.playerId, profile, context);
      if (candidate) {
        candidates.push(candidate);
      }
    }
  }

  return candidates.sort((left, right) => right.utility - left.utility || left.targetPlayerId - right.targetPlayerId)[0] ?? null;
}

function buildPeaceProposalCandidate(
  targetPlayerId: number,
  profile: BotProfile,
  context: BotDiplomacyContext
): BotDiplomacyProposalCandidate | null {
  const conflictFatigue = context.currentStatus === DiplomaticStatus.WAR
    ? context.recentConflictScore * 0.8
    : context.recentConflictScore * 0.4;
  const economicStabilityValue = (profile.economyWeight * 1.4) + context.strategicValue;
  const offensiveMomentum = Math.max(0, (context.relativeStrengthRatio - 1.15) * 4) + (profile.militaryWeight * 0.75);
  const utility = profile.peaceInitiationBias
    + (context.borderPressure * profile.borderThreatSensitivity)
    + conflictFatigue
    + economicStabilityValue
    - offensiveMomentum
    - (context.recentConflictScore * 0.5)
    - profile.warPersistenceBias;
  if (utility < PEACE_PROPOSAL_THRESHOLD) {
    return null;
  }

  return {
    requestedStatus: DiplomaticStatus.PEACE,
    targetPlayerId,
    utility,
    reason: `Offer PEACE to stabilize a ${context.currentStatus} border with pressure ${context.borderPressure.toFixed(1)}.`
  };
}

function buildAllianceProposalCandidate(
  targetPlayerId: number,
  profile: BotProfile,
  context: BotDiplomacyContext
): BotDiplomacyProposalCandidate | null {
  if (context.currentStatus !== DiplomaticStatus.PEACE) {
    return null;
  }

  const sharedSecurityValue = (context.borderPressure * 0.4) + (context.sharesBorder ? 1.5 : 0.5);
  const safeGrowthValue = (profile.economyWeight * 0.9) + context.strategicValue;
  const mistrustPenalty = context.recentConflictScore * 0.9;
  const utility = profile.allianceInitiationBias
    + sharedSecurityValue
    + safeGrowthValue
    - mistrustPenalty
    - (profile.warPersistenceBias * 0.4);
  if (utility < ALLIANCE_PROPOSAL_THRESHOLD) {
    return null;
  }

  return {
    requestedStatus: DiplomaticStatus.ALLIED,
    targetPlayerId,
    utility,
    reason: `Offer ALLIED to formalize a stable PEACE border with strategic value ${context.strategicValue.toFixed(1)}.`
  };
}

function wasRecentlyProposedTo(
  player: Player,
  targetPlayerId: number,
  requestedStatus: 'PEACE' | 'ALLIED',
  currentTurn: number
): boolean {
  return (player.botMemory?.recentDiplomacyTargets ?? []).some((entry) =>
    entry.playerId === targetPlayerId
    && entry.requestedStatus === requestedStatus
    && (currentTurn - entry.turn) < DIPLOMACY_PROPOSAL_COOLDOWN_TURNS
  );
}
