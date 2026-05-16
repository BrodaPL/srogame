import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import { DiplomaticStatus } from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import { DiplomacyResolver } from '../../../../src/app/models/diplomacy/diplomacy-resolver.js';
import { FleetMissionType } from '../../../../src/app/models/enums/fleet-mission-type.js';
import { FleetState } from '../../../../src/app/models/fleets/fleet.js';
import type { CreateFleetMissionCommand } from '../../game-commands/fleet-commands.ts';
import { startBuildingConstruction } from '../../game-commands/building-commands.js';
import {
  approveDiplomaticProposalCommand,
  cancelDiplomaticProposalCommand,
  rejectDiplomaticProposalCommand
} from '../../game-commands/diplomacy-commands.js';
import { createFleetMission } from '../../game-commands/fleet-commands.js';
import { returnActiveFleetCommand } from '../../game-commands/fleet-lifecycle-commands.js';
import { startTechnologyResearch } from '../../game-commands/research-commands.js';
import { startShipyardConstruction } from '../../game-commands/shipyard-commands.js';
import {
  approveJumpGateRequestCommand,
  rejectJumpGateRequestCommand
} from '../../game-commands/jump-gate-request-commands.js';
import {
  approveFleetMaintenanceRequest,
  rejectFleetMaintenanceRequest
} from '../../game-commands/maintenance-commands.js';
import {
  createSupportRequestCommand,
  approveSupportRequestCommand,
  rejectSupportRequestCommand
} from '../../game-commands/support-request-commands.js';
import {
  isJumpGateAutoApprovedStatus,
  isJumpGateMissionAllowed,
  resolvePlanetOrError,
  toShipAmountEntriesFromSelections,
  validateJumpGateLaunchAccess
} from '../../game-commands/command-helpers.js';
import type { BotExecutionOutcome, BotExecutor, BotProposal } from '../bot-v2-types.ts';
import { normalizeFleetExecutionProposal } from './bot-fleet-execution-adapters.js';
import { normalizeQueueExecutionProposal } from './bot-execution-adapters.js';
import { normalizeRequestDecisionProposal } from './bot-request-decision-adapters.js';
import { normalizeRequestCreationProposal } from './bot-request-creation-adapters.js';
import { normalizeDiplomacyDecisionProposal } from './bot-diplomacy-decision-adapters.js';

const RECALLABLE_OFFENSIVE_MISSIONS = new Set<FleetMissionType>([
  FleetMissionType.ATTACK,
  FleetMissionType.BOMBARD,
  FleetMissionType.SIEGE,
  FleetMissionType.SPY
]);

const RELATIONS_REQUIRING_OFFENSIVE_RECALL = new Set<DiplomaticStatus>([
  DiplomaticStatus.NEUTRAL,
  DiplomaticStatus.PEACE,
  DiplomaticStatus.ALLIED
]);

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

    const diplomacyDecisions = accepted.filter((proposal) => proposal.kind === 'DIPLOMACY_DECISION');
    for (const proposal of diplomacyDecisions) {
      outcomes.push(this.executeAcceptedTask(proposal));
    }

    outcomes.push(...this.recallInvalidOffensiveFleets());

    for (const proposal of accepted) {
      if (proposal.kind === 'DIPLOMACY_DECISION') {
        continue;
      }
      outcomes.push(this.executeAcceptedTask(proposal));
    }
    return outcomes;
  }

  private executeAcceptedTask(proposal: BotProposal): BotExecutionOutcome {
    if (proposal.kind === 'DIPLOMACY_DECISION') {
      return this.executeAcceptedDiplomacyDecision(proposal);
    }

    if (proposal.kind === 'REQUEST_DECISION') {
      return this.executeAcceptedRequestDecision(proposal);
    }

    if (proposal.kind === 'REQUEST_CREATION') {
      return this.executeAcceptedRequestCreation(proposal);
    }

    if (proposal.kind === 'FLEET_MISSION') {
      return this.executeAcceptedFleetMission(proposal);
    }

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

  private executeAcceptedDiplomacyDecision(proposal: BotProposal): BotExecutionOutcome {
    const normalized = normalizeDiplomacyDecisionProposal(proposal);
    if (!normalized.ok) {
      return {
        proposalId: proposal.proposalId,
        executed: false,
        success: false,
        message: normalized.reason
      };
    }

    const decision = normalized.value;
    const context = {
      galaxy: this.galaxy,
      playerId: this.playerId
    };
    const result = decision.decision === 'ACCEPT'
      ? approveDiplomaticProposalCommand(context, { proposalId: decision.proposalId })
      : decision.decision === 'REJECT'
        ? rejectDiplomaticProposalCommand(context, { proposalId: decision.proposalId })
        : cancelDiplomaticProposalCommand(context, { proposalId: decision.proposalId });

    if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Diplomacy decision failed for proposal ${proposal.proposalId}: ${result.error.code} ${message}`
      );
      return {
        proposalId: proposal.proposalId,
        executed: true,
        success: false,
        message,
        diplomacyProposalId: decision.proposalId,
        diplomacyDecision: decision.decision,
        targetPlayerId: decision.targetPlayerId,
        requestedStatus: decision.requestedStatus,
        commandErrorCode: result.error.code
      };
    }

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: null,
      diplomacyProposalId: decision.proposalId,
      diplomacyDecision: decision.decision,
      targetPlayerId: decision.targetPlayerId,
      requestedStatus: decision.requestedStatus
    };
  }

  private executeAcceptedRequestDecision(proposal: BotProposal): BotExecutionOutcome {
    const normalized = normalizeRequestDecisionProposal(proposal);
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
    const request = normalized.value;
    if (request.decision === 'PARTIAL_APPROVE' && request.requestType === 'JUMP_GATE') {
      return {
        proposalId: proposal.proposalId,
        executed: false,
        success: false,
        message: 'Jump Gate requests do not support partial approval.',
        requestType: request.requestType,
        requestId: request.requestId,
        requestDecision: request.decision,
        commandErrorCode: 'INVALID_REQUEST_DECISION'
      };
    }

    const result = request.requestType === 'JUMP_GATE'
      ? request.decision === 'REJECT'
        ? rejectJumpGateRequestCommand(context, request.requestId)
        : approveJumpGateRequestCommand(context, request.requestId)
      : request.requestType === 'MAINTENANCE'
        ? request.decision === 'REJECT'
          ? rejectFleetMaintenanceRequest(context, request.requestId)
          : approveFleetMaintenanceRequest(context, request.requestId, request.maintenanceApproval)
        : request.decision === 'REJECT'
          ? rejectSupportRequestCommand(context, request.requestId)
          : approveSupportRequestCommand(context, request.requestId, request.approvedResources);

    if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Request decision failed for proposal ${proposal.proposalId}: ${result.error.code} ${message}`
      );
      return {
        proposalId: proposal.proposalId,
        executed: true,
        success: false,
        message,
        requestType: request.requestType,
        requestId: request.requestId,
        requestDecision: request.decision,
        commandErrorCode: result.error.code
      };
    }

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: null,
      requestType: request.requestType,
      requestId: request.requestId,
      requestDecision: request.decision
    };
  }

  private executeAcceptedRequestCreation(proposal: BotProposal): BotExecutionOutcome {
    const normalized = normalizeRequestCreationProposal(proposal);
    if (!normalized.ok) {
      return {
        proposalId: proposal.proposalId,
        executed: false,
        success: false,
        message: normalized.reason
      };
    }

    const request = normalized.value;
    const result = createSupportRequestCommand(
      {
        galaxy: this.galaxy,
        playerId: this.playerId
      },
      {
        targetPlayerId: request.targetPlayerId,
        supportType: request.supportType,
        targetCoordinates: request.targetCoordinates,
        requestedResources: request.requestedResources,
        missionType: request.missionType,
        minimumShips: request.minimumShips,
        bombardmentPriorities: request.bombardmentPriorities
      }
    );

    if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Request creation failed for proposal ${proposal.proposalId}: ${result.error.code} ${message}`
      );
      return {
        proposalId: proposal.proposalId,
        executed: true,
        success: false,
        message,
        requestType: request.requestType,
        supportType: request.supportType,
        targetPlayerId: request.targetPlayerId,
        commandErrorCode: result.error.code
      };
    }

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: null,
      requestType: request.requestType,
      requestId: result.value.request.requestId,
      supportType: request.supportType,
      targetPlayerId: request.targetPlayerId,
      targetCoordinates: request.targetCoordinates
    };
  }

  private executeAcceptedFleetMission(proposal: BotProposal): BotExecutionOutcome {
    const normalized = normalizeFleetExecutionProposal(proposal);
    if (!normalized.ok) {
      return {
        proposalId: proposal.proposalId,
        executed: false,
        success: false,
        message: normalized.reason
      };
    }

    const command = {
      ...normalized.value,
      useJumpGate: normalized.value.useJumpGate || this.shouldUseOwnJumpGate(normalized.value)
    };
    const result = createFleetMission(
      {
        galaxy: this.galaxy,
        playerId: this.playerId
      },
      command
    );

    if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Fleet command failed for proposal ${proposal.proposalId}: ${result.error.code} ${message}`
      );
      return {
        proposalId: proposal.proposalId,
        executed: true,
        success: false,
        message,
        commandErrorCode: result.error.code,
        missionType: command.missionType,
        originCoordinates: command.origin,
        targetCoordinates: command.target
      };
    }

    const spent = {
      metal: command.cargo.metal,
      crystal: command.cargo.crystal,
      deuterium: command.cargo.deuterium
    };

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: result.value.message,
      spent,
      fuelSpent: result.value.fleet.fuelCost,
      fleetId: result.value.fleet.fleetId,
      fleetSlotsUsed: 1,
      missionType: command.missionType,
      originCoordinates: command.origin,
      targetCoordinates: command.target
    };
  }

  private shouldUseOwnJumpGate(command: CreateFleetMissionCommand): boolean {
    // TODO: Future Supervisor phases should account for Jump Gate operating costs once they exist.
    if (!isJumpGateMissionAllowed(command.missionType)) {
      return false;
    }

    const originResult = resolvePlanetOrError(this.galaxy, command.origin);
    const targetResult = resolvePlanetOrError(this.galaxy, command.target);
    if (!originResult.ok || !targetResult.ok || targetResult.value.info.ownerId !== this.playerId) {
      return false;
    }

    const totalSelectedShips = toShipAmountEntriesFromSelections(command.ships)
      .reduce((sum, entry) => sum + entry.amount, 0);
    const jumpGateAccess = validateJumpGateLaunchAccess(
      this.galaxy,
      this.playerId,
      command.missionType,
      originResult.value,
      targetResult.value,
      totalSelectedShips
    );
    return !('error' in jumpGateAccess) && isJumpGateAutoApprovedStatus(jumpGateAccess.status);
  }

  private recallInvalidOffensiveFleets(): BotExecutionOutcome[] {
    const diplomacyResolver = new DiplomacyResolver(this.galaxy.diplomaticRelations);
    const outcomes: BotExecutionOutcome[] = [];

    const candidates = [...this.galaxy.activeFleets]
      .filter((fleet) =>
        fleet.ownerId === this.playerId
        && RECALLABLE_OFFENSIVE_MISSIONS.has(fleet.missionType)
        && (
          fleet.state === FleetState.MOVING_TO_TARGET
          || fleet.state === FleetState.PENDING_JUMP_GATE
          || fleet.state === FleetState.ORBITING
        )
      )
      .sort((left, right) => left.fleetId - right.fleetId);

    for (const fleet of candidates) {
      const targetResult = resolvePlanetOrError(this.galaxy, fleet.target);
      if (!targetResult.ok || targetResult.value.info.ownerId === null) {
        continue;
      }

      const targetPlayerId = targetResult.value.info.ownerId;
      const currentStatus = diplomacyResolver.getStatus(this.playerId, targetPlayerId);
      if (!RELATIONS_REQUIRING_OFFENSIVE_RECALL.has(currentStatus)) {
        continue;
      }

      const outcomeBase = {
        proposalId: `lifecycle:fleet-recall:${fleet.fleetId}:${this.galaxy.currentTurn}`,
        lifecycleAction: 'FLEET_RECALL' as const,
        fleetId: fleet.fleetId,
        missionType: fleet.missionType,
        targetCoordinates: {
          x: fleet.target.x,
          y: fleet.target.y,
          z: fleet.target.z
        },
        targetPlayerId,
        currentStatus
      };
      const result = returnActiveFleetCommand(
        {
          galaxy: this.galaxy,
          playerId: this.playerId
        },
        { fleetId: fleet.fleetId }
      );

      if (!result.ok) {
        const message = result.error.message;
        console.warn(
          `[BotV2 Supervisor] Fleet recall failed for fleet ${fleet.fleetId}: ${result.error.code} ${message}`
        );
        outcomes.push({
          ...outcomeBase,
          executed: true,
          success: false,
          message,
          commandErrorCode: result.error.code
        });
        continue;
      }

      outcomes.push({
        ...outcomeBase,
        executed: true,
        success: true,
        message: result.value.restoredToOrigin
          ? 'Pending Jump Gate fleet restored to origin.'
          : 'Fleet recalled because diplomacy no longer permits offensive action.'
      });
    }

    return outcomes;
  }
}
