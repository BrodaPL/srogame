import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Player } from '../../../src/app/models/player.ts';
import { DiplomaticStatus } from '../../../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../../../src/app/models/enums/fleet-mission-type.js';
import type { SupportRequestType } from '../../../src/app/models/requests/support-request.ts';
import { defaultBotProfileIdForPlayerId } from '../../../src/app/models/player.js';
import { isBotPaused } from '../bots/bot-admin.js';
import { ensureBotMemoryV2 } from './bot-v2-memory.js';
import type {
  BotDecisionTraceV2,
  BotExecutionOutcome,
  BotProposal,
  BotSubsystem,
  BotV2FeatureFlags
} from './bot-v2-types.ts';
import { recordBotDecisionTraceV2 } from './bot-v2-trace.js';
import { buildBotWorldSnapshot } from './snapshot/build-bot-world-snapshot.js';
import { LiveQueueBotExecutor, NoopBotExecutor } from './execution/bot-executor.js';
import { BotDefensiveSubsystem } from './subsystems/defensive/bot-defensive-subsystem.js';
import { BotCriticalSubsystem } from './subsystems/critical/bot-critical-subsystem.js';
import { BotEconomicSubsystem } from './subsystems/economic/bot-economic-subsystem.js';
import { BotResearchSubsystem } from './subsystems/research/bot-research-subsystem.js';
import { BotStrategicDevelopmentSubsystem } from './subsystems/strategic-development/bot-strategic-development-subsystem.js';
import { BotStrategicDiplomaticSubsystem } from './subsystems/strategic-diplomatic/bot-strategic-diplomatic-subsystem.js';
import { BotStrategicMilitarySubsystem } from './subsystems/strategic-military/bot-strategic-military-subsystem.js';
import { BotWarfareSubsystem } from './subsystems/warfare/bot-warfare-subsystem.js';
import { BotWeightManagerSubsystem } from './subsystems/weight-manager/bot-weight-manager-subsystem.js';
import { BotSupervisorV2 } from './supervisor/bot-supervisor.js';

export class BotBrainV2 {
  private readonly supervisor;
  private readonly subsystems;

  constructor(private readonly flags: BotV2FeatureFlags) {
    this.supervisor = new BotSupervisorV2(flags);
    this.subsystems = buildEnabledSubsystems(flags);
  }

  public runTurn(galaxy: Galaxy): void {
    if (this.flags.mode === 'DISABLED') {
      return;
    }

    const bots = [...galaxy.botPlayerMap.values()]
      .sort((left, right) => left.playerId - right.playerId);

    for (const bot of bots) {
      if (bot.planets.length === 0 || isBotPaused(bot.playerId)) {
        continue;
      }

      this.runTurnForBot(galaxy, bot);
    }
  }

  private runTurnForBot(galaxy: Galaxy, player: Player): void {
    player.botProfileId = player.botProfileId ?? defaultBotProfileIdForPlayerId(player.playerId);
    const memory = ensureBotMemoryV2(player);
    const snapshot = buildBotWorldSnapshot(galaxy, player, this.flags);
    const subsystemResults = [];
    const proposals = [];

    for (const subsystem of this.subsystems) {
      const result = subsystem.generate({
        snapshot,
        memory,
        priorProposals: [...proposals]
      });
      subsystemResults.push(result);
      proposals.push(...result.proposals);
    }

    const supervisorDecision = this.supervisor.decide(snapshot, memory, proposals);
    const executor = this.flags.mode === 'LIVE'
      ? new LiveQueueBotExecutor(galaxy, player.playerId)
      : new NoopBotExecutor();
    const executionOutcomes = executor.executeAcceptedTasks(supervisorDecision.accepted);
    recordExecutedSpending(memory, supervisorDecision.accepted, executionOutcomes, galaxy.currentTurn);
    applyRecycleHostilitySideEffects(galaxy, player, supervisorDecision.accepted, executionOutcomes, galaxy.currentTurn);
    const trace: BotDecisionTraceV2 = {
      playerId: player.playerId,
      playerName: player.playerName,
      turn: galaxy.currentTurn,
      shadowMode: this.flags.mode === 'SHADOW',
      snapshotSummary: {
        planetCount: snapshot.planets.length,
        totalResources: { ...snapshot.empire.totalResources },
        atWar: snapshot.empire.atWar
      },
      subsystemResults: subsystemResults.map((result) => ({
        subsystemId: result.subsystemId,
        proposalCount: result.proposals.length,
        goalCount: result.goals?.length,
        planetResultCount: result.planetResults?.length,
        debug: { ...result.debug }
      })),
      proposals: proposals.map((proposal) => ({
        proposalId: proposal.proposalId,
        subsystemId: proposal.subsystemId,
        proposalKind: proposal.kind,
        summary: proposal.summary,
        expectedValue: proposal.expectedValue,
        urgency: proposal.urgency,
        risk: proposal.risk,
        confidence: proposal.confidence,
        dedupeKey: proposal.dedupeKey
      })),
      goals: subsystemResults.flatMap((result) =>
        (result.goals ?? []).map((goal) => ({
          goalKey: goal.goalKey,
          subsystemId: goal.subsystemId,
          goalFamily: goal.goalFamily,
          branch: goal.branch,
          finalTargetKind: goal.finalTargetKind,
          finalBuildingType: goal.finalBuildingType,
          finalTechnologyType: goal.finalTechnologyType,
          finalDefenceType: goal.finalDefenceType,
          finalShipType: goal.finalShipType,
          finalLevel: goal.finalLevel,
          finalAmount: goal.finalAmount,
          weightedEtc: goal.weightedEtc,
          totalEtc: goal.totalEtc,
          bonusFactor: goal.bonusFactor,
          blockers: [...goal.blockers]
        }))
      ),
      planetResults: subsystemResults.flatMap((result) =>
        (result.planetResults ?? []).map((planetResult) => ({
          subsystemId: planetResult.subsystemId,
          branch: planetResult.branch,
          targetCoordinates: { ...planetResult.targetCoordinates },
          emittedRequestCount: planetResult.emittedRequestCount,
          primaryGoalKey: planetResult.primaryGoalKey,
          secondaryGoalKey: planetResult.secondaryGoalKey,
          noActionReason: planetResult.noActionReason,
          blockedGoalCount: planetResult.blockedGoalCount
        }))
      ),
      supervisorDecision: {
        acceptedProposalIds: supervisorDecision.accepted.map((proposal) => proposal.proposalId),
        pendingProposalIds: supervisorDecision.pending.map((proposal) => proposal.proposalId),
        rejectedCount: supervisorDecision.rejected.length,
        mode: this.flags.mode === 'LIVE' ? 'LIVE' : 'SHADOW',
        debug: { ...supervisorDecision.debug }
      },
      executionOutcomes
    };
    recordBotDecisionTraceV2(trace);
  }
}

function buildEnabledSubsystems(flags: BotV2FeatureFlags): BotSubsystem[] {
  const subsystems: BotSubsystem[] = [];
  if (flags.enabledSubsystems.economic) {
    subsystems.push(new BotEconomicSubsystem());
  }
  if (flags.enabledSubsystems.defensive) {
    subsystems.push(new BotDefensiveSubsystem());
  }
  if (flags.enabledSubsystems.warfare) {
    subsystems.push(new BotWarfareSubsystem());
  }
  if (flags.enabledSubsystems.research ?? true) {
    subsystems.push(new BotResearchSubsystem());
  }
  if (flags.enabledSubsystems.strategicDevelopment) {
    subsystems.push(new BotStrategicDevelopmentSubsystem());
  }
  if (flags.enabledSubsystems.strategicMilitary) {
    subsystems.push(new BotStrategicMilitarySubsystem());
  }
  if (flags.enabledSubsystems.strategicDiplomatic) {
    subsystems.push(new BotStrategicDiplomaticSubsystem());
  }
  if (flags.enabledSubsystems.weightManager) {
    subsystems.push(new BotWeightManagerSubsystem());
  }
  if (flags.enabledSubsystems.critical) {
    subsystems.push(new BotCriticalSubsystem());
  }
  return subsystems;
}

function recordExecutedSpending(
  memory: ReturnType<typeof ensureBotMemoryV2>,
  accepted: BotProposal[],
  outcomes: BotExecutionOutcome[],
  turn: number
): void {
  const proposalById = new Map(accepted.map((proposal) => [proposal.proposalId, proposal]));
  for (const outcome of outcomes) {
    const proposal = proposalById.get(outcome.proposalId);
    if (!proposal) {
      continue;
    }

    if (
      proposal.kind === 'REQUEST_CREATION'
      && outcome.success
      && outcome.requestType === 'SUPPORT'
      && outcome.requestId !== undefined
      && outcome.targetPlayerId !== undefined
      && outcome.targetCoordinates
      && isSupportRequestType(outcome.supportType)
    ) {
      memory.strategicDiplomatic.outgoingSupportRequests.push({
        requestId: outcome.requestId,
        supportType: outcome.supportType,
        targetPlayerId: outcome.targetPlayerId,
        targetCoordinates: { ...outcome.targetCoordinates },
        createdTurn: turn
      });
      memory.strategicDiplomatic.outgoingSupportRequests = memory.strategicDiplomatic.outgoingSupportRequests.slice(-100);
    }

    if (!outcome.success || !outcome.spent) {
      continue;
    }

    memory.supervisor.spendingHistory.push({
      turn,
      proposalId: proposal.proposalId,
      dedupeKey: proposal.dedupeKey,
      subsystemId: proposal.subsystemId,
      kind: proposal.kind,
      targetCoordinates: proposal.targetCoordinates,
      resources: { ...outcome.spent },
      weightedResourceValue: outcome.spent.metal + (outcome.spent.crystal * 1.8) + (outcome.spent.deuterium * 2.6)
    });
    if (proposal.kind === 'FLEET_MISSION' && outcome.fleetSlotsUsed && outcome.missionType) {
      memory.supervisor.fleetSlotHistory.push({
        missionKey: `${proposal.subsystemId}:${outcome.missionType}:${proposal.dedupeKey}`,
        proposalId: proposal.proposalId,
        subsystemId: proposal.subsystemId,
        createdTurn: turn,
        expiresOnTurn: null,
        active: true
      });
    }
    if (proposal.kind === 'FLEET_MISSION' && outcome.fuelSpent !== undefined && outcome.missionType) {
      memory.supervisor.fuelSpendingHistory.push({
        turn,
        proposalId: proposal.proposalId,
        subsystemId: proposal.subsystemId,
        missionType: outcome.missionType,
        originCoordinates: outcome.originCoordinates ? { ...outcome.originCoordinates } : null,
        targetCoordinates: outcome.targetCoordinates ? { ...outcome.targetCoordinates } : null,
        fleetId: outcome.fleetId ?? null,
        deuterium: Math.max(0, Math.floor(outcome.fuelSpent))
      });
    }
    memory.supervisor.pendingCommitments = memory.supervisor.pendingCommitments
      .filter((commitment) =>
        commitment.dedupeKey !== proposal.dedupeKey
        || (commitment.status !== 'PENDING_RESOURCES' && commitment.status !== 'PENDING_QUEUE')
      );
  }
}

function isSupportRequestType(value: string | undefined): value is SupportRequestType {
  return value === 'RESOURCE_SUPPORT'
    || value === 'PLANET_REPAIR'
    || value === 'PLANET_DEFENSE'
    || value === 'ATTACK_TARGET'
    || value === 'BOMBARD_TARGET'
    || value === 'SIEGE_TARGET';
}

function applyRecycleHostilitySideEffects(
  galaxy: Galaxy,
  attacker: Player,
  accepted: BotProposal[],
  outcomes: BotExecutionOutcome[],
  turn: number
): void {
  const acceptedById = new Map(accepted.map((proposal) => [proposal.proposalId, proposal]));
  for (const outcome of outcomes) {
    if (!outcome.success || outcome.missionType !== FleetMissionType.RECYCLE) {
      continue;
    }

    const proposal = acceptedById.get(outcome.proposalId);
    if (!proposal || proposal.kind !== 'FLEET_MISSION') {
      continue;
    }

    const targetOwnerId = Number(proposal.debug.hostilityTargetPlayerId);
    if (!Number.isInteger(targetOwnerId) || targetOwnerId === attacker.playerId || !outcome.targetCoordinates) {
      continue;
    }

    const targetOwner = galaxy.players.find((player) => player.playerId === targetOwnerId);
    if (!targetOwner || targetOwner.type !== 'BOT') {
      continue;
    }

    const targetMemory = ensureBotMemoryV2(targetOwner);
    const currentStatus = isDiplomaticStatus(proposal.debug.targetStatus)
      ? proposal.debug.targetStatus
      : DiplomaticStatus.NEUTRAL;
    const existingLedger = targetMemory.strategicDiplomatic.factionLedger.find((entry) => entry.playerId === attacker.playerId);
    if (existingLedger) {
      existingLedger.hostilityScore = Math.min(120, Math.max(0, existingLedger.hostilityScore + 1));
      existingLedger.lastKnownStatus = currentStatus;
      existingLedger.lastSeenTurn = turn;
    } else {
      targetMemory.strategicDiplomatic.factionLedger.push({
        playerId: attacker.playerId,
        hostilityScore: 1,
        lastSuccessfulBombardTurn: null,
        lastSuccessfulSiegeTickTurn: null,
        recentOutgoingCoercionPressure: 0,
        recentIncomingCoercionPressure: 0,
        lastWarEvaluationTurn: null,
        shortWindowWarScore: 0,
        longWindowWarScore: 0,
        currentWarExitPressure: 0,
        lastComputedStanceScore: 0,
        lastComputedStrengthEstimate: 0,
        lastKnownStatus: currentStatus,
        lastSeenTurn: turn,
        nonAggressionUntilTurn: null,
        nonAggressionStartedTurn: null,
        nonAggressionReason: null
      });
    }

    targetMemory.strategicDiplomatic.sharedHostileEvents.push({
      attackerPlayerId: attacker.playerId,
      victimPlayerId: targetOwner.playerId,
      targetCoordinates: { ...outcome.targetCoordinates },
      eventType: 'RECYCLE',
      eventTurn: turn,
      sharedFromPlayerId: targetOwner.playerId,
      sharedFromStatus: currentStatus,
      severity: Math.max(1, Math.floor(Number(proposal.debug.hostilitySeverity) || 1)),
      propagatedOnTurn: turn
    });
    targetMemory.strategicDiplomatic.sharedHostileEvents = targetMemory.strategicDiplomatic.sharedHostileEvents.slice(-400);
  }
}

function isDiplomaticStatus(value: unknown): value is DiplomaticStatus {
  return typeof value === 'string' && Object.values(DiplomaticStatus).includes(value as DiplomaticStatus);
}
