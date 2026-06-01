import type { Galaxy } from '../../../../src/app/models/planets/galaxy.ts';
import type { Planet } from '../../../../src/app/models/planets/planet.ts';
import type { Player } from '../../../../src/app/models/player.ts';
import * as buildingTypeModule from '../../../../src/app/models/enums/building-type.js';
import * as diplomaticStatusModule from '../../../../src/app/models/diplomacy/diplomatic-status.js';
import * as diplomacyResolverModule from '../../../../src/app/models/diplomacy/diplomacy-resolver.js';
import * as fleetMissionTypeModule from '../../../../src/app/models/enums/fleet-mission-type.js';
import * as playerTypeModule from '../../../../src/app/models/enums/player-type.js';
import * as technologyTypeModule from '../../../../src/app/models/enums/technology-type.js';
import * as destinationModule from '../../../../src/app/models/fleets/destination.js';
import * as fleetModule from '../../../../src/app/models/fleets/fleet.js';
import type { CreateFleetMissionCommand } from '../../game-commands/fleet-commands.ts';
import { startBuildingConstruction } from '../../game-commands/building-commands.js';
import {
  approveDiplomaticProposalCommand,
  createDiplomaticProposalCommand,
  cancelDiplomaticProposalCommand,
  rejectDiplomaticProposalCommand
} from '../../game-commands/diplomacy-commands.js';
import { createFleetMission } from '../../game-commands/fleet-commands.js';
import { returnActiveFleetCommand } from '../../game-commands/fleet-lifecycle-commands.js';
import { startTechnologyResearch, updateResearchHelpers } from '../../game-commands/research-commands.js';
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
  calculateFleetTravelTurns,
  calculateTravelDistance,
  calculatePlayerFuelCost,
  calculateMaxLabsPerTechnology,
  isJumpGateAutoApprovedStatus,
  isJumpGateMissionAllowed,
  resolvePlanetOrError,
  resolvePlayerById,
  sameCoordinates,
  TECHNOLOGY_BLUEPRINTS,
  toShipAmountEntriesFromSelections,
  validateJumpGateLaunchAccess
} from '../../game-commands/command-helpers.js';
import type { BotExecutionOutcome, BotExecutor, BotProposal } from '../bot-v2-types.ts';
import { estimateShipCountsAntiFleetStrength } from '../ship-payload-planning.js';
import { evaluateJumpGateOperatingCostPolicy } from '../jump-gate-operating-cost-policy.js';
import { normalizeFleetExecutionProposal } from './bot-fleet-execution-adapters.js';
import { normalizeQueueExecutionProposal } from './bot-execution-adapters.js';
import { normalizeRequestDecisionProposal } from './bot-request-decision-adapters.js';
import { normalizeRequestCreationProposal } from './bot-request-creation-adapters.js';
import { normalizeDiplomacyDecisionProposal } from './bot-diplomacy-decision-adapters.js';
import { normalizeDiplomacyProposal } from './bot-diplomacy-proposal-adapters.js';
import { resolveModule } from '../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../src/app/models/enums/building-type.js');
const { DiplomaticStatus } = resolveModule(diplomaticStatusModule) as typeof import('../../../../src/app/models/diplomacy/diplomatic-status.js');
const { DiplomacyResolver } = resolveModule(diplomacyResolverModule) as typeof import('../../../../src/app/models/diplomacy/diplomacy-resolver.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeModule) as typeof import('../../../../src/app/models/enums/fleet-mission-type.js');
const { PlayerType } = resolveModule(playerTypeModule) as typeof import('../../../../src/app/models/enums/player-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../src/app/models/enums/technology-type.js');
const { Destination } = resolveModule(destinationModule) as typeof import('../../../../src/app/models/fleets/destination.js');
const { FleetOrbitActivity, FleetReturnReason, FleetState } = resolveModule(fleetModule) as typeof import('../../../../src/app/models/fleets/fleet.js');

type DiplomaticStatusT = diplomaticStatusModule.DiplomaticStatus;
type FleetMissionTypeT = fleetMissionTypeModule.MissionType;

const RECALLABLE_OFFENSIVE_MISSIONS = new Set<FleetMissionTypeT>([
  FleetMissionType.ATTACK,
  FleetMissionType.BOMBARD,
  FleetMissionType.SIEGE,
  FleetMissionType.SPY
]);

const RELATIONS_REQUIRING_OFFENSIVE_RECALL = new Set<DiplomaticStatusT>([
  DiplomaticStatus.NEUTRAL,
  DiplomaticStatus.PEACE,
  DiplomaticStatus.ALLIED
]);

const UNSAFE_BOMBARDMENT_RECALL_RATIO = 0.8;

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
    const sameTurnRemoteOriginFleetIds = this.collectAcceptedRemoteOriginFleetIds(accepted);

    const diplomacyDecisions = accepted.filter((proposal) => proposal.kind === 'DIPLOMACY_DECISION');
    for (const proposal of diplomacyDecisions) {
      outcomes.push(this.executeAcceptedTask(proposal));
    }

    outcomes.push(...this.recallInvalidOffensiveFleets());
    outcomes.push(...this.recallUnsafeBombardmentFleets());

    for (const proposal of accepted) {
      if (proposal.kind === 'DIPLOMACY_DECISION') {
        continue;
      }
      outcomes.push(this.executeAcceptedTask(proposal));
    }
    outcomes.push(...this.recallIdleRemoteOriginFleetsHome(sameTurnRemoteOriginFleetIds));
    outcomes.push(...this.assignIdleResearchHelpers());
    return outcomes;
  }

  private collectAcceptedRemoteOriginFleetIds(accepted: BotProposal[]): Set<number> {
    const fleetIds = new Set<number>();
    for (const proposal of accepted) {
      if (proposal.kind !== 'FLEET_MISSION') {
        continue;
      }

      const originFleetId = Number(proposal.requestPayload.originFleetId);
      if (Number.isInteger(originFleetId) && originFleetId > 0) {
        fleetIds.add(originFleetId);
      }
    }

    return fleetIds;
  }

  private executeAcceptedTask(proposal: BotProposal): BotExecutionOutcome {
    if (proposal.kind === 'DIPLOMACY_DECISION') {
      return this.executeAcceptedDiplomacyDecision(proposal);
    }

    if (proposal.kind === 'DIPLOMACY_PROPOSAL') {
      return this.executeAcceptedDiplomacyProposal(proposal);
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
        message,
        commandErrorCode: result.error.code
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

  private executeAcceptedDiplomacyProposal(proposal: BotProposal): BotExecutionOutcome {
    const normalized = normalizeDiplomacyProposal(proposal);
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
    const result = createDiplomaticProposalCommand(context, {
      targetPlayerId: request.targetPlayerId,
      requestedStatus: request.requestedStatus
    });

    if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Diplomacy proposal failed for proposal ${proposal.proposalId}: ${result.error.code} ${message}`
      );
      return {
        proposalId: proposal.proposalId,
        executed: true,
        success: false,
        message,
        targetPlayerId: request.targetPlayerId,
        requestedStatus: request.requestedStatus,
        commandErrorCode: result.error.code
      };
    }

    return {
      proposalId: proposal.proposalId,
      executed: true,
      success: true,
      message: null,
      diplomacyProposalId: result.value.proposal.proposalId,
      targetPlayerId: request.targetPlayerId,
      requestedStatus: request.requestedStatus
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
      travelTurns: result.value.fleet.travelTurns,
      fleetSlotsUsed: command.originFleetId && result.value.fleet.fleetId === command.originFleetId ? 0 : 1,
      missionType: command.missionType,
      originCoordinates: command.origin,
      targetCoordinates: command.target
    };
  }

  private shouldUseOwnJumpGate(command: CreateFleetMissionCommand): boolean {
    if (!isJumpGateMissionAllowed(command.missionType)) {
      return false;
    }

    const originResult = resolvePlanetOrError(this.galaxy, command.origin);
    const targetResult = resolvePlanetOrError(this.galaxy, command.target);
    if (!originResult.ok || !targetResult.ok || targetResult.value.info.ownerId !== this.playerId) {
      return false;
    }

    const player = resolvePlayerById(this.galaxy, this.playerId);
    if (!player) {
      return false;
    }

    const selectedShipEntries = toShipAmountEntriesFromSelections(command.ships);
    const totalSelectedShips = selectedShipEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const jumpGateAccess = validateJumpGateLaunchAccess(
      this.galaxy,
      this.playerId,
      command.missionType,
      originResult.value,
      targetResult.value,
      totalSelectedShips
    );
    if ('error' in jumpGateAccess || !isJumpGateAutoApprovedStatus(jumpGateAccess.status)) {
      return false;
    }

    const travelDistance = calculateTravelDistance(command.origin, command.target);
    const operatingCostDecision = evaluateJumpGateOperatingCostPolicy({
      missionType: command.missionType,
      selectedShipCount: totalSelectedShips,
      normalTravelTurns: calculateFleetTravelTurns(travelDistance, player, selectedShipEntries),
      jumpGateTravelTurns: 1,
      fuelCost: calculatePlayerFuelCost(selectedShipEntries, travelDistance, 1, player)
    });
    return operatingCostDecision.allowed;
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
      const targetPlayer = this.galaxy.players.find((entry) => entry.playerId === targetPlayerId) ?? null;
      if (targetPlayer?.type === PlayerType.NEUTRAL) {
        continue;
      }
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

  private recallUnsafeBombardmentFleets(): BotExecutionOutcome[] {
    const diplomacyResolver = new DiplomacyResolver(this.galaxy.diplomaticRelations);
    const outcomes: BotExecutionOutcome[] = [];
    const candidates = [...this.galaxy.activeFleets]
      .filter((fleet) =>
        fleet.ownerId === this.playerId
        && (fleet.missionType === FleetMissionType.BOMBARD || fleet.missionType === FleetMissionType.SIEGE)
        && (fleet.state === FleetState.MOVING_TO_TARGET || fleet.state === FleetState.PENDING_JUMP_GATE)
      )
      .sort((left, right) => left.fleetId - right.fleetId);

    for (const fleet of candidates) {
      const targetResult = resolvePlanetOrError(this.galaxy, fleet.target);
      if (!targetResult.ok || targetResult.value.info.ownerId === null) {
        continue;
      }

      const targetPlayerId = targetResult.value.info.ownerId;
      const targetPlayer = this.galaxy.players.find((entry) => entry.playerId === targetPlayerId) ?? null;
      if (!targetPlayer || targetPlayer.type === PlayerType.NEUTRAL) {
        continue;
      }
      if (diplomacyResolver.getStatus(this.playerId, targetPlayerId) !== DiplomaticStatus.WAR) {
        continue;
      }

      const report = targetResult.value.lastReportData.get(this.playerId) ?? null;
      if (!report || report.createdTurn <= fleet.createdAtTurn || !report.hasTotalShipsIntel) {
        continue;
      }

      const ownStrength = estimateShipCountsAntiFleetStrength(fleet.ships.undamagedShipsCount);
      const enemyStrength = estimateShipCountsAntiFleetStrength(Object.fromEntries(report.ships.entries()));
      const recallThreshold = ownStrength * UNSAFE_BOMBARDMENT_RECALL_RATIO;
      if (ownStrength <= 0 || enemyStrength <= recallThreshold) {
        continue;
      }

      const outcomeBase = {
        proposalId: `lifecycle:bombardment-safety-recall:${fleet.fleetId}:${this.galaxy.currentTurn}`,
        lifecycleAction: 'FLEET_RECALL' as const,
        fleetId: fleet.fleetId,
        missionType: fleet.missionType,
        targetCoordinates: {
          x: fleet.target.x,
          y: fleet.target.y,
          z: fleet.target.z
        },
        targetPlayerId,
        currentStatus: DiplomaticStatus.WAR
      };
      const result = returnActiveFleetCommand(
        {
          galaxy: this.galaxy,
          playerId: this.playerId
        },
        { fleetId: fleet.fleetId }
      );
      if (!result.ok) {
        outcomes.push({
          ...outcomeBase,
          executed: true,
          success: false,
          message: result.error.message,
          commandErrorCode: result.error.code
        });
        continue;
      }

      outcomes.push({
        ...outcomeBase,
        executed: true,
        success: true,
        message: `Bombardment fleet recalled after fresh intel found stronger anti-fleet defenders (${Math.round(enemyStrength)} > ${Math.round(recallThreshold)}).`
      });
    }

    return outcomes;
  }

  private recallIdleRemoteOriginFleetsHome(skipFleetIds: ReadonlySet<number>): BotExecutionOutcome[] {
    const player = this.galaxy.players.find((entry) => entry.playerId === this.playerId) ?? null;
    if (!player || player.planets.length <= 0) {
      return [];
    }

    const outcomes: BotExecutionOutcome[] = [];
    const candidates = [...this.galaxy.activeFleets]
      .filter((fleet) =>
        fleet.ownerId === this.playerId
        && fleet.isRemoteOrigin === true
        && !skipFleetIds.has(fleet.fleetId)
        && fleet.state === FleetState.ORBITING
        && fleet.pendingMaintenanceRequestId === null
        && (
          fleet.orbitActivity === FleetOrbitActivity.IDLE
          || fleet.orbitActivity === FleetOrbitActivity.PASSIVE_HOLD
        )
      )
      .sort((left, right) => left.fleetId - right.fleetId);

    for (const fleet of candidates) {
      const currentCoordinates = {
        x: fleet.target.x,
        y: fleet.target.y,
        z: fleet.target.z
      };
      const currentPlanetResult = resolvePlanetOrError(this.galaxy, currentCoordinates);
      if (currentPlanetResult.ok && currentPlanetResult.value.info.ownerId === this.playerId) {
        continue;
      }

      const homePlanet = this.resolveNearestOwnedPlanet(player, currentCoordinates);
      if (!homePlanet) {
        continue;
      }

      const homeCoordinates = {
        x: homePlanet.basicInfo.solarSystem.coordinates.x,
        y: homePlanet.basicInfo.solarSystem.coordinates.y,
        z: Math.max(0, homePlanet.basicInfo.order - 1)
      };
      const shipAmounts = [...fleet.ships.countByType().entries()]
        .map(([type, amount]) => ({ type, amount }))
        .filter((entry) => entry.amount > 0);
      if (shipAmounts.length <= 0) {
        continue;
      }

      const travelDistance = calculateTravelDistance(currentCoordinates, homeCoordinates);
      const travelTurns = calculateFleetTravelTurns(travelDistance, player, shipAmounts);
      fleet.origin = new Destination(homeCoordinates.x, homeCoordinates.y, homeCoordinates.z);
      fleet.originPlanetName = homePlanet.basicInfo.name;
      fleet.state = FleetState.RETURNING;
      fleet.orbitActivity = FleetOrbitActivity.IDLE;
      fleet.suspendedMissionType = null;
      fleet.returnReason = FleetReturnReason.MANUAL_RECALL;
      fleet.createdAtTurn = this.galaxy.currentTurn;
      fleet.travelTurns = travelTurns;
      fleet.returnTurns = travelTurns;

      outcomes.push({
        proposalId: `lifecycle:remote-origin-home-recall:${fleet.fleetId}:${this.galaxy.currentTurn}`,
        executed: true,
        success: true,
        message: `Remote-origin fleet recalled home to ${homePlanet.basicInfo.name} after idle remote work completed.`,
        lifecycleAction: 'FLEET_RECALL',
        fleetId: fleet.fleetId,
        missionType: fleet.missionType,
        originCoordinates: homeCoordinates,
        targetCoordinates: currentCoordinates
      });
    }

    return outcomes;
  }

  private resolveNearestOwnedPlanet(
    player: Player,
    from: { x: number; y: number; z: number }
  ): Planet | null {
    return [...player.planets]
      .sort((left, right) => {
        const leftCoordinates = {
          x: left.basicInfo.solarSystem.coordinates.x,
          y: left.basicInfo.solarSystem.coordinates.y,
          z: Math.max(0, left.basicInfo.order - 1)
        };
        const rightCoordinates = {
          x: right.basicInfo.solarSystem.coordinates.x,
          y: right.basicInfo.solarSystem.coordinates.y,
          z: Math.max(0, right.basicInfo.order - 1)
        };
        return calculateTravelDistance(from, leftCoordinates) - calculateTravelDistance(from, rightCoordinates)
          || leftCoordinates.x - rightCoordinates.x
          || leftCoordinates.y - rightCoordinates.y
          || leftCoordinates.z - rightCoordinates.z;
      })[0] ?? null;
  }

  private assignIdleResearchHelpers(): BotExecutionOutcome[] {
    const player = this.galaxy.players.find((entry) => entry.playerId === this.playerId) ?? null;
    if (!player) {
      return [];
    }

    const outcomes: BotExecutionOutcome[] = [];
    const runningResearchPlanets = [...player.planets]
      .filter((planet) => planet.rBDSFTQ.currentResearchQueue !== null)
      .sort((left, right) =>
        left.rBDSFTQ.currentResearchQueue!.helperLabs.length - right.rBDSFTQ.currentResearchQueue!.helperLabs.length
        || left.basicInfo.solarSystem.coordinates.x - right.basicInfo.solarSystem.coordinates.x
        || left.basicInfo.solarSystem.coordinates.y - right.basicInfo.solarSystem.coordinates.y
        || left.basicInfo.order - right.basicInfo.order
      );

    for (const mainPlanet of runningResearchPlanets) {
      const currentResearchQueue = mainPlanet.rBDSFTQ.currentResearchQueue;
      if (!currentResearchQueue) {
        continue;
      }

      const maxHelpers = Math.max(0, calculateMaxLabsPerTechnology(player) - 1);
      if (currentResearchQueue.helperLabs.length >= maxHelpers) {
        continue;
      }

      const researchBlueprint = TECHNOLOGY_BLUEPRINTS.get(currentResearchQueue.technologyType);
      if (!researchBlueprint) {
        continue;
      }

      const availableIdleHelpers = this.resolveAvailableIdleResearchHelpers(
        player,
        mainPlanet,
        researchBlueprint.getCostForLevel(currentResearchQueue.nextLevel)
      );
      if (availableIdleHelpers.length <= 0) {
        continue;
      }

      const additionalHelpers = availableIdleHelpers.slice(
        0,
        Math.max(0, maxHelpers - currentResearchQueue.helperLabs.length)
      );
      if (additionalHelpers.length <= 0) {
        continue;
      }

      const targetCoordinates = {
        x: mainPlanet.basicInfo.solarSystem.coordinates.x,
        y: mainPlanet.basicInfo.solarSystem.coordinates.y,
        z: Math.max(0, mainPlanet.basicInfo.order - 1)
      };
      const result = updateResearchHelpers(
        {
          galaxy: this.galaxy,
          playerId: this.playerId
        },
        {
          ...targetCoordinates,
          helperPlanets: [
            ...currentResearchQueue.helperLabs,
            ...additionalHelpers.map((planet) => ({
              x: planet.basicInfo.solarSystem.coordinates.x,
              y: planet.basicInfo.solarSystem.coordinates.y,
              z: Math.max(0, planet.basicInfo.order - 1)
            }))
          ]
        }
      );

      if (!result.ok) {
      const message = result.error.message;
      console.warn(
        `[BotV2 Supervisor] Research helper update failed for ${mainPlanet.basicInfo.name}: ${result.error.code} ${message}`
      );
        outcomes.push({
          proposalId: `maintenance:research-helpers:${targetCoordinates.x}:${targetCoordinates.y}:${targetCoordinates.z}:${this.galaxy.currentTurn}`,
          executed: true,
          success: false,
          message,
          commandErrorCode: result.error.code,
          targetCoordinates
        });
        continue;
      }

      outcomes.push({
        proposalId: `maintenance:research-helpers:${targetCoordinates.x}:${targetCoordinates.y}:${targetCoordinates.z}:${this.galaxy.currentTurn}`,
        executed: true,
        success: true,
        message: `Assigned ${additionalHelpers.length} free helper labs to active research.`,
        targetCoordinates
      });
    }

    return outcomes;
  }

  private resolveAvailableIdleResearchHelpers(
    player: Player,
    mainPlanet: Planet,
    researchCost: { metal: number; crystal: number; deuterium: number }
  ): Planet[] {
    const mainCoordinates = {
      x: mainPlanet.basicInfo.solarSystem.coordinates.x,
      y: mainPlanet.basicInfo.solarSystem.coordinates.y,
      z: Math.max(0, mainPlanet.basicInfo.order - 1)
    };

    return [...player.planets]
      .filter((planet) =>
        !sameCoordinates(
          {
            x: planet.basicInfo.solarSystem.coordinates.x,
            y: planet.basicInfo.solarSystem.coordinates.y,
            z: Math.max(0, planet.basicInfo.order - 1)
          },
          mainCoordinates
        )
        && planet.getBuildingLevel(BuildingType.RESEARCH_LAB) > 0
        && planet.rBDSFTQ.currentResearchQueue === null
        && planet.rBDSFTQ.researchHelperFor === null
      )
      .sort((left, right) =>
        Number(resolveResearchAffordabilityEta(right, player, researchCost) > 5)
        - Number(resolveResearchAffordabilityEta(left, player, researchCost) > 5)
        || left.getBuildingProductionValue1(BuildingType.RESEARCH_LAB)
        - right.getBuildingProductionValue1(BuildingType.RESEARCH_LAB)
        || left.basicInfo.solarSystem.coordinates.x - right.basicInfo.solarSystem.coordinates.x
        || left.basicInfo.solarSystem.coordinates.y - right.basicInfo.solarSystem.coordinates.y
        || left.basicInfo.order - right.basicInfo.order
      );
  }
}

function resolveResearchAffordabilityEta(
  planet: Planet,
  player: Player,
  cost: { metal: number; crystal: number; deuterium: number }
): number {
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  return Math.max(
    resolveResourceAffordabilityEta(planet.rBDSFTQ.resources.metal, planet.getMetalGain(adaptiveTechnologyLevel), cost.metal),
    resolveResourceAffordabilityEta(planet.rBDSFTQ.resources.crystal, planet.getCrystalGain(adaptiveTechnologyLevel), cost.crystal),
    resolveResourceAffordabilityEta(planet.rBDSFTQ.resources.deuterium, planet.getDeuteriumGain(adaptiveTechnologyLevel), cost.deuterium)
  );
}

function resolveResourceAffordabilityEta(current: number, income: number, required: number): number {
  if (current >= required) {
    return 0;
  }
  if (income <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(1, Math.ceil((required - current) / income));
}
