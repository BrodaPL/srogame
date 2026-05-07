import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { Player } from '../../../src/app/models/player.ts';
import { defaultBotProfileIdForPlayerId } from '../../../src/app/models/player.js';
import { isBotPaused } from '../bots/bot-admin.js';
import { ensureBotMemoryV2 } from './bot-v2-memory.js';
import type {
  BotDecisionTraceV2,
  BotExecutionOutcome,
  BotSubsystem,
  BotV2FeatureFlags
} from './bot-v2-types.ts';
import { recordBotDecisionTraceV2 } from './bot-v2-trace.js';
import { buildBotWorldSnapshot } from './snapshot/build-bot-world-snapshot.js';
import { NoopBotExecutor } from './execution/bot-executor.js';
import { BotDefensiveSubsystem } from './subsystems/defensive/bot-defensive-subsystem.js';
import { BotEconomicSubsystem } from './subsystems/economic/bot-economic-subsystem.js';
import { BotStrategicDevelopmentSubsystem } from './subsystems/strategic-development/bot-strategic-development-subsystem.js';
import { BotStrategicMilitarySubsystem } from './subsystems/strategic-military/bot-strategic-military-subsystem.js';
import { BotWarfareSubsystem } from './subsystems/warfare/bot-warfare-subsystem.js';
import { ShadowBotSupervisor } from './supervisor/bot-supervisor.js';

export class BotBrainV2 {
  private readonly supervisor;
  private readonly executor;
  private readonly subsystems;

  constructor(private readonly flags: BotV2FeatureFlags) {
    this.supervisor = new ShadowBotSupervisor(flags);
    this.executor = new NoopBotExecutor();
    this.subsystems = buildEnabledSubsystems(flags);
  }

  public runShadowTurn(galaxy: Galaxy): void {
    if (!this.flags.enabled || !this.flags.shadowMode) {
      return;
    }

    const bots = [...galaxy.botPlayerMap.values()]
      .sort((left, right) => left.playerId - right.playerId);

    for (const bot of bots) {
      if (bot.planets.length === 0 || isBotPaused(bot.playerId)) {
        continue;
      }

      this.runShadowTurnForBot(galaxy, bot);
    }
  }

  private runShadowTurnForBot(galaxy: Galaxy, player: Player): void {
    player.botProfileId = player.botProfileId ?? defaultBotProfileIdForPlayerId(player.playerId);
    const memory = ensureBotMemoryV2(player);
    const snapshot = buildBotWorldSnapshot(galaxy, player, this.flags);
    const subsystemResults = this.subsystems.map((subsystem) => subsystem.generate({ snapshot, memory }));
    const proposals = subsystemResults.flatMap((result) => result.proposals);
    const supervisorDecision = this.supervisor.decide(snapshot, memory, proposals);
    const executionOutcomes = resolveExecutionOutcomes(this.flags, this.executor.executeAcceptedTasks(
      supervisorDecision.accepted
    ));
    const trace: BotDecisionTraceV2 = {
      playerId: player.playerId,
      playerName: player.playerName,
      turn: galaxy.currentTurn,
      shadowMode: true,
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
        rejectedCount: supervisorDecision.rejected.length,
        mode: 'SHADOW'
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
  if (flags.enabledSubsystems.strategicDevelopment) {
    subsystems.push(new BotStrategicDevelopmentSubsystem());
  }
  if (flags.enabledSubsystems.strategicMilitary) {
    subsystems.push(new BotStrategicMilitarySubsystem());
  }
  return subsystems;
}

function resolveExecutionOutcomes(
  flags: BotV2FeatureFlags,
  outcomes: BotExecutionOutcome[]
): BotExecutionOutcome[] {
  if (flags.allowExecution) {
    return outcomes;
  }

  return outcomes.map((outcome) => ({
    ...outcome,
    executed: false,
    success: false,
    message: outcome.message ?? 'Execution disabled in shadow mode.'
  }));
}
