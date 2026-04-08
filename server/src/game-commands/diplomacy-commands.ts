import * as diplomaticStatusEnumModule from '../../../src/app/models/diplomacy/diplomatic-status.js';
import * as diplomacyResolverModule from '../../../src/app/models/diplomacy/diplomacy-resolver.js';
import * as diplomaticProposalStateModule from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import * as diplomaticProposalModule from '../../../src/app/models/diplomacy/diplomatic-proposal.js';
import * as diplomaticProposalRulesModule from '../../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import * as playerTypeEnumModule from '../../../src/app/models/enums/player-type.js';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../../src/app/models/diplomacy/diplomatic-status.ts';
import type { DiplomaticProposal } from '../../../src/app/models/diplomacy/diplomatic-proposal.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Player } from '../../../src/app/models/player.ts';
import type { GameCommandContext } from './command-context.ts';
import type { CommandResult } from './command-result.ts';
import {
  commandError,
  commandOk,
  resolvePlayerById,
  resolvePlayerOrError
} from './command-helpers.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { DiplomaticStatus } = resolveModule(diplomaticStatusEnumModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-status.js');
const { DiplomacyResolver } = resolveModule(diplomacyResolverModule) as typeof import('../../../src/app/models/diplomacy/diplomacy-resolver.js');
const { DiplomaticProposalState } = resolveModule(diplomaticProposalStateModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-state.js');
const {
  createDiplomaticProposal,
  isPendingDiplomaticProposalForPair
} = resolveModule(diplomaticProposalModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal.js');
const {
  allowedDiplomaticProposalStatuses,
  isDiplomaticProposalRequestedStatus
} = resolveModule(diplomaticProposalRulesModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-rules.js');
const { PlayerType } = resolveModule(playerTypeEnumModule) as typeof import('../../../src/app/models/enums/player-type.js');

export type CreateDiplomaticProposalCommand = {
  targetPlayerId: number;
  requestedStatus: DiplomaticStatusType;
};

export type ResolveDiplomaticProposalCommand = {
  proposalId: number;
};

export type CreateDiplomaticProposalResult = {
  proposal: DiplomaticProposal;
};

export type ResolveDiplomaticProposalResult = {
  proposal: DiplomaticProposal;
};

export function isPlayerVisibleInDiplomacy(
  galaxy: Galaxy,
  viewerPlayerId: number,
  targetPlayerId: number
): boolean {
  if (viewerPlayerId === targetPlayerId) {
    return false;
  }

  const targetPlayer = resolvePlayerById(galaxy, targetPlayerId);
  if (!targetPlayer) {
    return false;
  }

  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        if (planet.info.ownerId === targetPlayerId && planet.lastReportData.has(viewerPlayerId)) {
          return true;
        }
      }
    }
  }

  return false;
}

export function hasOutgoingProposalSentThisTurn(
  galaxy: Galaxy,
  playerId: number,
  turnNumber: number
): boolean {
  return galaxy.diplomaticProposals.some((proposal) =>
    proposal.fromPlayerId === playerId && proposal.createdTurn === turnNumber
  );
}

export function currentDiplomaticStatusForPair(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number
): DiplomaticStatusType {
  return new DiplomacyResolver(galaxy.diplomaticRelations).getStatus(leftPlayerId, rightPlayerId);
}

export function createDiplomaticProposalCommand(
  context: GameCommandContext,
  command: CreateDiplomaticProposalCommand
): CommandResult<CreateDiplomaticProposalResult> {
  const sourcePlayerResult = resolvePlayerOrError(context);
  if (!sourcePlayerResult.ok) {
    return sourcePlayerResult;
  }

  const sourcePlayer = sourcePlayerResult.value;
  const targetPlayer = resolvePlayerById(context.galaxy, command.targetPlayerId);
  if (!targetPlayer || targetPlayer.playerId === sourcePlayer.playerId) {
    return {
      ok: false,
      error: commandError(404, 'PLAYER_NOT_FOUND', 'Diplomacy target not found.')
    };
  }

  const validationError = validateDiplomaticProposalCreation(
    context.galaxy,
    sourcePlayer,
    targetPlayer,
    command.requestedStatus
  );
  if (validationError) {
    return {
      ok: false,
      error: validationError
    };
  }

  const proposal = createDiplomaticProposal(
    context.galaxy.nextDiplomaticProposalId,
    sourcePlayer.playerId,
    targetPlayer.playerId,
    command.requestedStatus,
    context.galaxy.currentTurn,
    context.galaxy.currentTurn + 1
  );
  context.galaxy.nextDiplomaticProposalId += 1;
  context.galaxy.diplomaticProposals.push(proposal);

  return commandOk({ proposal });
}

export function approveDiplomaticProposalCommand(
  context: GameCommandContext,
  command: ResolveDiplomaticProposalCommand
): CommandResult<ResolveDiplomaticProposalResult> {
  const playerResult = resolvePlayerOrError(context);
  if (!playerResult.ok) {
    return playerResult;
  }

  const proposal = context.galaxy.diplomaticProposals.find((entry) => entry.proposalId === command.proposalId);
  if (!proposal || proposal.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Pending diplomacy proposal not found.')
    };
  }

  if (proposal.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the target player can accept this proposal.')
    };
  }

  proposal.state = DiplomaticProposalState.ACCEPTED;
  upsertDiplomaticRelation(context.galaxy, proposal.fromPlayerId, proposal.toPlayerId, proposal.requestedStatus);
  return commandOk({ proposal });
}

export function rejectDiplomaticProposalCommand(
  context: GameCommandContext,
  command: ResolveDiplomaticProposalCommand
): CommandResult<ResolveDiplomaticProposalResult> {
  const playerResult = resolvePlayerOrError(context);
  if (!playerResult.ok) {
    return playerResult;
  }

  const proposal = context.galaxy.diplomaticProposals.find((entry) => entry.proposalId === command.proposalId);
  if (!proposal || proposal.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Pending diplomacy proposal not found.')
    };
  }

  if (proposal.toPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the target player can reject this proposal.')
    };
  }

  proposal.state = DiplomaticProposalState.REJECTED;
  return commandOk({ proposal });
}

export function cancelDiplomaticProposalCommand(
  context: GameCommandContext,
  command: ResolveDiplomaticProposalCommand
): CommandResult<ResolveDiplomaticProposalResult> {
  const playerResult = resolvePlayerOrError(context);
  if (!playerResult.ok) {
    return playerResult;
  }

  const proposal = context.galaxy.diplomaticProposals.find((entry) => entry.proposalId === command.proposalId);
  if (!proposal || proposal.state !== DiplomaticProposalState.PENDING) {
    return {
      ok: false,
      error: commandError(404, 'CONFLICT', 'Pending diplomacy proposal not found.')
    };
  }

  if (proposal.fromPlayerId !== context.playerId) {
    return {
      ok: false,
      error: commandError(403, 'FORBIDDEN', 'Only the proposing player can cancel this proposal.')
    };
  }

  proposal.state = DiplomaticProposalState.CANCELLED;
  return commandOk({ proposal });
}

function validateDiplomaticProposalCreation(
  galaxy: Galaxy,
  sourcePlayer: Player,
  targetPlayer: Player,
  requestedStatus: DiplomaticStatusType
) {
  if (targetPlayer.type === PlayerType.NEUTRAL) {
    return commandError(403, 'FORBIDDEN', 'Neutral factions do not participate in treaty proposals.');
  }

  if (!isDiplomaticProposalRequestedStatus(requestedStatus)) {
    return commandError(400, 'INVALID_INPUT', 'Requested diplomacy status is not proposeable.');
  }

  const currentStatus = currentDiplomaticStatusForPair(galaxy, sourcePlayer.playerId, targetPlayer.playerId);
  const allowedStatuses = allowedDiplomaticProposalStatuses(currentStatus);
  if (allowedStatuses.length <= 0) {
    return commandError(409, 'CONFLICT', 'No treaty proposal is available from the current diplomacy status.');
  }

  if (!allowedStatuses.includes(requestedStatus)) {
    return commandError(409, 'CONFLICT', 'Requested diplomacy status is not available from the current diplomacy status.');
  }

  if (galaxy.diplomaticProposals.some((proposal) =>
    isPendingDiplomaticProposalForPair(proposal, sourcePlayer.playerId, targetPlayer.playerId)
  )) {
    return commandError(409, 'CONFLICT', 'A diplomacy proposal for this player pair is already pending.');
  }

  if (hasOutgoingProposalSentThisTurn(galaxy, sourcePlayer.playerId, galaxy.currentTurn)) {
    return commandError(409, 'CONFLICT', 'You have already sent a diplomacy proposal this turn.');
  }

  return null;
}

function upsertDiplomaticRelation(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number,
  status: DiplomaticStatusType
): void {
  const resolver = new DiplomacyResolver(galaxy.diplomaticRelations);
  resolver.setStatus(leftPlayerId, rightPlayerId, status);
  galaxy.diplomaticRelations = resolver.toRelations();
}
