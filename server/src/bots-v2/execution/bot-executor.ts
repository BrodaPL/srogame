import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import type { CreateFleetMissionCommand } from '../../game-commands/fleet-commands.ts';
import { startBuildingConstruction } from '../../game-commands/building-commands.js';
import { createFleetMission } from '../../game-commands/fleet-commands.js';
import { startTechnologyResearch } from '../../game-commands/research-commands.js';
import { startShipyardConstruction } from '../../game-commands/shipyard-commands.js';
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
      useJumpGate: this.shouldUseOwnJumpGate(normalized.value)
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
        message
      };
    }

    const spent = {
      metal: command.cargo.metal,
      crystal: command.cargo.crystal,
      deuterium: command.cargo.deuterium + result.value.fleet.fuelCost
    };

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: result.value.message,
      spent,
      fleetSlotsUsed: 1,
      missionType: command.missionType
    };
  }

  private shouldUseOwnJumpGate(command: CreateFleetMissionCommand): boolean {
    // TODO: Future Supervisor phases should account for Jump Gate operating costs once they exist.
    // TODO: Foreign/allied Jump Gate request creation is deferred to the request-handling phase.
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
}
