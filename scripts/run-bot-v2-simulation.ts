import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BOT_PROFILE_IDS,
  type BotProfileId,
  type Player
} from '../src/app/models/player.js';
import { DiplomaticProposalState } from '../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { GameType } from '../src/app/models/enums/game-type.js';
import { ReportType } from '../src/app/models/enums/report-type.js';
import {
  createEmptyBotProfileCounts,
  normalizeGalaxySetup,
  type BotProfileCountMap,
  type GalaxySetup
} from '../src/app/models/game-api-types.js';
import { StartingHomeworldPreset } from '../src/app/models/enums/starting-homeworld-preset.js';
import { PlayerType } from '../src/app/models/enums/player-type.js';
import { GalaxyCreator } from '../src/app/models/planets/galaxy-creator.js';
import { resolvePhaseOneTurn } from '../src/app/models/turns/phase-one-turn-resolver.js';
import {
  clearBotDecisionTracesV2,
  getBotDecisionTracesV2
} from '../server/src/bots-v2/bot-v2-trace.js';
import { runBotTurnPhaseV2 } from '../server/src/bots-v2/bot-v2-shadow-runner.js';
import type {
  BotDecisionTraceV2
} from '../server/src/bots-v2/bot-v2-types.js';
import {
  hydrateGameSave,
  readGameSaveById,
  type HydratedGameSave
} from '../server/src/game-save.js';

type SimulationScenarioKey = 'initial' | 'advanced' | 'benchmark20x20';
type SimulationLogMode = 'full' | 'compact' | 'summary';

type SimulationScenario = {
  key: SimulationScenarioKey;
  description: string;
  width: number;
  height: number;
  turns: number;
  seed: number;
  defaultLogMode: SimulationLogMode;
  setup: GalaxySetup;
};

type SimulationCliOptions = {
  scenario: SimulationScenarioKey;
  logModeOverride: SimulationLogMode | null;
  turnsOverride: number | null;
  seedOverride: number | null;
  saveId: string | null;
  outputDir: string | null;
  verbose: boolean;
};

type CompactTurnTrace = {
  turn: number;
  playerId: number;
  playerName: string;
  acceptedProposalIds: string[];
  acceptedProposalKinds: string[];
  pendingProposalIds: string[];
  rejectedCount: number;
  subsystemDebug: Record<string, Record<string, string | number | boolean | null>>;
  supervisorDebug: Record<string, string | number | boolean | null>;
  execution: {
    attemptedCount: number;
    successCount: number;
    failureCount: number;
    commandErrorCodes: string[];
  };
};

type SimulationAnomalyReport = {
  hardFailures: string[];
  activityFailures: string[];
  unexpectedCommandFailures: Array<{
    turn: number;
    playerId: number;
    playerName: string;
    proposalId: string;
    commandErrorCode: string | null;
    message: string | null;
  }>;
  commandErrorFrequency: Record<string, number>;
  missingTraceTurns: Array<{
    turn: number;
    missingPlayerIds: number[];
  }>;
  zeroAcceptedActionBots: Array<{
    playerId: number;
    playerName: string;
  }>;
  repeatedPendingProposalIds: Array<{
    proposalId: string;
    occurrences: number;
  }>;
  repeatedDedupeKeys: Array<{
    dedupeKey: string;
    occurrences: number;
  }>;
};

type SimulationSummary = {
  scenario: SimulationScenarioKey;
  description: string;
  logMode: SimulationLogMode;
  seed: number;
  startedAt: string;
  finishedAt: string;
  turnsRequested: number;
  turnsCompleted: number;
  loadedFromSaveId: string | null;
  passed: boolean;
  botCount: number;
  activeFleetCount: number;
  totals: {
    acceptedActions: number;
    pendingActions: number;
    rejectedActions: number;
    successfulExecutions: number;
    failedExecutions: number;
    resourceConcentrationSignals: number;
    resourceConcentrationTargetsSelected: number;
    resourceConcentrationTransportsProposed: number;
    resourceConcentrationTransportsAccepted: number;
    resourceConcentrationTransportsExecuted: number;
    resourceConcentrationReservationsCreated: number;
    resourceConcentrationReservationsExpired: number;
    resourceConcentrationInvestmentsStarted: number;
  };
  players: Array<{
    playerId: number;
    playerName: string;
    profileId: BotProfileId | null;
    planetsOwned: number;
    activeFleetCount: number;
    acceptedActionCount: number;
  }>;
  artifactPaths: {
    summaryJson: string;
    tracesJsonl: string | null;
    turnSummaryJsonl: string | null;
    anomaliesJson: string;
    finalStateSummaryJson: string;
    battleSummaryJson: string;
    resourceConcentrationSummaryJson: string;
  };
};

type ResourceConcentrationPlayerSummary = {
  playerId: number;
  playerName: string;
  profileId: BotProfileId | null;
  signalsEmitted: number;
  targetSelections: number;
  transportsProposed: number;
  transportsAccepted: number;
  transportsExecuted: number;
  reservationsCreated: number;
  reservationsExpired: number;
  matchingInvestmentsStarted: number;
  activeReservationCount: number;
  activeLockedResources: { metal: number; crystal: number; deuterium: number };
  activeTargets: string[];
};

type ResourceConcentrationSummary = {
  scenario: SimulationScenarioKey;
  seed: number;
  finalTurn: number;
  totals: {
    signalsEmitted: number;
    targetSelections: number;
    transportsProposed: number;
    transportsAccepted: number;
    transportsExecuted: number;
    reservationsCreated: number;
    reservationsExpired: number;
    matchingInvestmentsStarted: number;
    activeReservationCount: number;
    activeLockedResources: { metal: number; crystal: number; deuterium: number };
  };
  players: ResourceConcentrationPlayerSummary[];
};

type MutableResourceConcentrationPlayerSummary = ResourceConcentrationPlayerSummary & {
  knownTargetKeys: Set<string>;
};

type FinalStateSummary = {
  scenario: SimulationScenarioKey;
  seed: number;
  finalTurn: number;
  galaxyName: string;
  activeFleetCount: number;
  players: Array<{
    playerId: number;
    playerName: string;
    profileId: BotProfileId | null;
    planetsOwned: number;
    activeFleetCount: number;
    techLevels: Record<string, number>;
    totalShips: Record<string, number>;
    totalDefences: Record<string, number>;
    planets: Array<{
      name: string;
      coordinates: { x: number; y: number; z: number };
      size: number;
      resources: { metal: number; crystal: number; deuterium: number };
      buildings: Record<string, number>;
      ships: Record<string, number>;
      defences: Record<string, number>;
    }>;
  }>;
};

type BattleSummary = {
  scenario: SimulationScenarioKey;
  seed: number;
  finalTurn: number;
  totalUniqueEvents: number;
  countsByCategory: Record<string, number>;
  events: Array<{
    eventKey: string;
    category: 'BATTLE' | 'BOMBARDMENT' | 'PLUNDER';
    reportType: string;
    createdTurn: number;
    title: string;
    senderPlayerName: string | null;
    sourcePlanetName: string | null;
    sourceSystemName: string | null;
    sourceCoordinates: { x: number; y: number; z: number } | null;
    observers: Array<{
      playerId: number;
      playerName: string;
      profileId: BotProfileId | null;
    }>;
    body: string;
  }>;
};

type SimulationContext = {
  hydrated: HydratedGameSave | null;
  galaxy: ReturnType<GalaxyCreator['createGalaxy']> | HydratedGameSave['galaxy'];
  setup: GalaxySetup;
  contenders: Player[];
};

const SAVE_DIRECTORY = path.resolve(process.cwd(), 'server', 'data', 'saves');
const DEFAULT_OUTPUT_ROOT = path.resolve(process.cwd(), 'tmp', 'bot-v2-sim');
const KNOWN_TRANSIENT_COMMAND_ERRORS = new Set<string>([
  'INSUFFICIENT_RESOURCES',
  'QUEUE_FULL',
  'ACTIVE_FLEET_LIMIT',
  'CONFLICT'
]);

const SCENARIOS: Record<SimulationScenarioKey, SimulationScenario> = {
  initial: {
    key: 'initial',
    description: 'Initial 20-turn bot-only stabilization run on a 10x10 galaxy with one full set of V2 bot profiles.',
    width: 10,
    height: 10,
    turns: 20,
    seed: 2026051701,
    defaultLogMode: 'full',
    setup: createScenarioSetup(10, 10)
  },
  advanced: {
    key: 'advanced',
    description: 'Advanced 100-turn bot-only validation run on a 12x12 galaxy with one full set of V2 bot profiles.',
    width: 12,
    height: 12,
    turns: 100,
    seed: 2026051702,
    defaultLogMode: 'full',
    setup: createScenarioSetup(12, 12)
  },
  benchmark20x20: {
    key: 'benchmark20x20',
    description: '170-turn bot-only benchmark on a 20x20 galaxy with 5% neutral bots, star modifier -1..3, 5% voids, medium homeworlds, and low starting resources.',
    width: 20,
    height: 20,
    turns: 170,
    seed: 2026052001,
    defaultLogMode: 'compact',
    setup: createBenchmark20x20Setup()
  }
};

function createScenarioSetup(width: number, height: number): GalaxySetup {
  const botProfileCounts = createEmptyBotProfileCounts();
  for (const profileId of BOT_PROFILE_IDS) {
    botProfileCounts[profileId] = 1;
  }

  return normalizeGalaxySetup({
    gameType: GameType.SANDBOX,
    galaxyName: `Bot V2 Sim ${width}x${height}`,
    galaxyWidth: width,
    galaxyHeight: height,
    galaxyCenterSize: Math.max(4, Math.floor(Math.min(width, height) / 2)),
    voidChance: 0,
    starsAmountModifier: [1, 2],
    playerAmount: 1,
    botsAmount: BOT_PROFILE_IDS.length - 1,
    botDifficulty: 25,
    botProfileCounts,
    neutralBotsAmount: 0,
    neutralBotsDifficulty: 0,
    autoSaveTurns: 0,
    startingHomeworldPreset: StartingHomeworldPreset.MEDIUM,
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    startingResources: {
      metal: 800,
      crystal: 500,
      deuterium: 250
    }
  });
}

function createBenchmark20x20Setup(): GalaxySetup {
  const botProfileCounts = createEmptyBotProfileCounts();
  for (const profileId of BOT_PROFILE_IDS) {
    botProfileCounts[profileId] = 1;
  }

  return normalizeGalaxySetup({
    gameType: GameType.SANDBOX,
    galaxyName: 'Bot V2 Benchmark 20x20',
    galaxyWidth: 20,
    galaxyHeight: 20,
    galaxyCenterSize: 10,
    voidChance: 5,
    starsAmountModifier: [-1, 3],
    playerAmount: 1,
    botsAmount: BOT_PROFILE_IDS.length - 1,
    botDifficulty: 25,
    botProfileCounts,
    neutralBotsAmount: 5,
    neutralBotsDifficulty: 0,
    autoSaveTurns: 0,
    startingHomeworldPreset: StartingHomeworldPreset.MEDIUM,
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    startingResources: {
      metal: 200,
      crystal: 150,
      deuterium: 100
    }
  });
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const scenario = SCENARIOS[options.scenario];
  const logMode = options.logModeOverride ?? scenario.defaultLogMode;
  const turnLimit = options.turnsOverride ?? scenario.turns;
  const seed = options.seedOverride ?? scenario.seed;
  const outputDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.join(DEFAULT_OUTPUT_ROOT, `${timestampSlug()}-${scenario.key}-${turnLimit}t-seed-${seed}`);

  fs.mkdirSync(outputDir, { recursive: true });
  clearBotDecisionTracesV2();

  const startedAt = new Date().toISOString();
  const context = withSeededRandom(seed, () => buildSimulationContext(scenario, options.saveId, seed));
  const anomalies: SimulationAnomalyReport = {
    hardFailures: [],
    activityFailures: [],
    unexpectedCommandFailures: [],
    commandErrorFrequency: {},
    missingTraceTurns: [],
    zeroAcceptedActionBots: [],
    repeatedPendingProposalIds: [],
    repeatedDedupeKeys: []
  };
  const artifactPaths = {
    summaryJson: path.join(outputDir, 'summary.json'),
    tracesJsonl: logMode === 'full' ? path.join(outputDir, 'traces.jsonl') : null,
    turnSummaryJsonl: logMode !== 'summary' ? path.join(outputDir, 'turn-summary.jsonl') : null,
    anomaliesJson: path.join(outputDir, 'anomalies.json'),
    finalStateSummaryJson: path.join(outputDir, 'final-state-summary.json'),
    battleSummaryJson: path.join(outputDir, 'battle-summary.json'),
    resourceConcentrationSummaryJson: path.join(outputDir, 'resource-concentration-summary.json')
  };
  initializeJsonlArtifacts(artifactPaths.tracesJsonl, artifactPaths.turnSummaryJsonl);
  const acceptedActionCounts = new Map<number, number>();
  const concentrationSummaries = initializeResourceConcentrationSummaries(context.contenders);
  const pendingProposalCounts = new Map<string, number>();
  const dedupeKeyCounts = new Map<string, number>();
  let turnsCompleted = 0;
  let acceptedActions = 0;
  let pendingActions = 0;
  let rejectedActions = 0;
  let successfulExecutions = 0;
  let failedExecutions = 0;

  try {
    withSeededRandom(seed, () => {
      for (let turnIndex = 0; turnIndex < turnLimit; turnIndex += 1) {
        const activeTurn = context.galaxy.currentTurn;
        runBotTurnPhaseV2(context.galaxy, { mode: 'LIVE' });
        const tracesForTurn = getBotDecisionTracesV2()
          .filter((trace) => trace.turn === activeTurn)
          .sort((left, right) => left.playerId - right.playerId);

        recordMissingTraceTurn(anomalies, context.contenders, activeTurn, tracesForTurn);

        for (const trace of tracesForTurn) {
          acceptedActions += trace.supervisorDecision.acceptedProposalIds.length;
          pendingActions += trace.supervisorDecision.pendingProposalIds.length;
          rejectedActions += trace.supervisorDecision.rejectedCount;

          const acceptedProposalIds = new Set(trace.supervisorDecision.acceptedProposalIds);
          recordResourceConcentrationTrace(concentrationSummaries, trace, acceptedProposalIds);
          const acceptedProposalKinds = trace.proposals
            .filter((proposal) => acceptedProposalIds.has(proposal.proposalId))
            .map((proposal) => proposal.proposalKind);
          acceptedActionCounts.set(
            trace.playerId,
            (acceptedActionCounts.get(trace.playerId) ?? 0) + acceptedProposalIds.size
          );

          for (const proposalId of trace.supervisorDecision.pendingProposalIds) {
            pendingProposalCounts.set(proposalId, (pendingProposalCounts.get(proposalId) ?? 0) + 1);
          }
          for (const proposal of trace.proposals) {
            dedupeKeyCounts.set(proposal.dedupeKey, (dedupeKeyCounts.get(proposal.dedupeKey) ?? 0) + 1);
          }

          const subsystemDebug: CompactTurnTrace['subsystemDebug'] = {};
          for (const result of trace.subsystemResults) {
            subsystemDebug[result.subsystemId] = result.debug;
          }

          const executionErrorCodes: string[] = [];
          for (const outcome of trace.executionOutcomes) {
            if (outcome.success) {
              successfulExecutions += 1;
            } else {
              failedExecutions += 1;
              const code = outcome.commandErrorCode ?? 'UNKNOWN';
              anomalies.commandErrorFrequency[code] = (anomalies.commandErrorFrequency[code] ?? 0) + 1;
              executionErrorCodes.push(code);
              if (!KNOWN_TRANSIENT_COMMAND_ERRORS.has(code)) {
                anomalies.unexpectedCommandFailures.push({
                  turn: trace.turn,
                  playerId: trace.playerId,
                  playerName: trace.playerName,
                  proposalId: outcome.proposalId,
                  commandErrorCode: outcome.commandErrorCode ?? null,
                  message: outcome.message
                });
              }
            }
          }

          const compactTurnTrace: CompactTurnTrace = {
            turn: trace.turn,
            playerId: trace.playerId,
            playerName: trace.playerName,
            acceptedProposalIds: trace.supervisorDecision.acceptedProposalIds,
            acceptedProposalKinds,
            pendingProposalIds: trace.supervisorDecision.pendingProposalIds,
            rejectedCount: trace.supervisorDecision.rejectedCount,
            subsystemDebug,
            supervisorDebug: trace.supervisorDecision.debug ?? {},
            execution: {
              attemptedCount: trace.executionOutcomes.length,
              successCount: trace.executionOutcomes.filter((entry) => entry.success).length,
              failureCount: trace.executionOutcomes.filter((entry) => !entry.success).length,
              commandErrorCodes: executionErrorCodes
            }
          };

          appendTurnArtifacts(logMode, artifactPaths, trace, compactTurnTrace);
        }

        const resolvedTurnNumber = context.galaxy.currentTurn + 1;
        resolvePhaseOneTurn(context.galaxy, resolvedTurnNumber, {
          botDifficultyPercent: context.setup.botDifficulty
        });
        context.galaxy.currentTurn = resolvedTurnNumber;
        expirePendingDiplomaticProposalsForSimulation(context.galaxy, resolvedTurnNumber);
        turnsCompleted += 1;

        validateGalaxyState(context, activeTurn, anomalies);

        if (options.verbose) {
          console.log(
            `turn ${resolvedTurnNumber}: traces=${tracesForTurn.length} accepted=${acceptedActions} failedExec=${failedExecutions}`
          );
        }
      }
    });
  } catch (error) {
    anomalies.hardFailures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  }

  const repeatedPendingProposalIds = [...pendingProposalCounts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([proposalId, occurrences]) => ({ proposalId, occurrences }));
  const repeatedDedupeKeys = [...dedupeKeyCounts.entries()]
    .filter(([, count]) => count >= 5)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 50)
    .map(([dedupeKey, occurrences]) => ({ dedupeKey, occurrences }));
  anomalies.repeatedPendingProposalIds = repeatedPendingProposalIds;
  anomalies.repeatedDedupeKeys = repeatedDedupeKeys;
  anomalies.zeroAcceptedActionBots = context.contenders
    .filter((player) => (acceptedActionCounts.get(player.playerId) ?? 0) === 0)
    .map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName
    }));
  appendActivityFailures(
    anomalies,
    context.contenders,
    turnLimit,
    acceptedActions,
    successfulExecutions,
    acceptedActionCounts
  );
  fs.writeFileSync(artifactPaths.anomaliesJson, `${JSON.stringify(anomalies, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    artifactPaths.finalStateSummaryJson,
    `${JSON.stringify(buildFinalStateSummary(scenario.key, seed, context), null, 2)}\n`,
    'utf8'
  );
  fs.writeFileSync(
    artifactPaths.battleSummaryJson,
    `${JSON.stringify(buildBattleSummary(scenario.key, seed, context.contenders, context.galaxy.currentTurn), null, 2)}\n`,
    'utf8'
  );
  const resourceConcentrationSummary = buildResourceConcentrationSummary(
    scenario.key,
    seed,
    context,
    concentrationSummaries
  );
  fs.writeFileSync(
    artifactPaths.resourceConcentrationSummaryJson,
    `${JSON.stringify(resourceConcentrationSummary, null, 2)}\n`,
    'utf8'
  );

  const summary: SimulationSummary = {
    scenario: scenario.key,
    description: scenario.description,
    logMode,
    seed,
    startedAt,
    finishedAt: new Date().toISOString(),
    turnsRequested: turnLimit,
    turnsCompleted,
    loadedFromSaveId: options.saveId,
    passed: anomalies.hardFailures.length === 0
      && anomalies.activityFailures.length === 0
      && anomalies.unexpectedCommandFailures.length === 0,
    botCount: context.contenders.length,
    activeFleetCount: context.galaxy.activeFleets.length,
    totals: {
      acceptedActions,
      pendingActions,
      rejectedActions,
      successfulExecutions,
      failedExecutions,
      resourceConcentrationSignals: resourceConcentrationSummary.totals.signalsEmitted,
      resourceConcentrationTargetsSelected: resourceConcentrationSummary.totals.targetSelections,
      resourceConcentrationTransportsProposed: resourceConcentrationSummary.totals.transportsProposed,
      resourceConcentrationTransportsAccepted: resourceConcentrationSummary.totals.transportsAccepted,
      resourceConcentrationTransportsExecuted: resourceConcentrationSummary.totals.transportsExecuted,
      resourceConcentrationReservationsCreated: resourceConcentrationSummary.totals.reservationsCreated,
      resourceConcentrationReservationsExpired: resourceConcentrationSummary.totals.reservationsExpired,
      resourceConcentrationInvestmentsStarted: resourceConcentrationSummary.totals.matchingInvestmentsStarted
    },
    players: context.contenders.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      profileId: player.botProfileId,
      planetsOwned: player.planets.length,
      activeFleetCount: context.galaxy.activeFleets.filter((fleet) => fleet.ownerId === player.playerId).length,
      acceptedActionCount: acceptedActionCounts.get(player.playerId) ?? 0
    })),
    artifactPaths
  };
  fs.writeFileSync(artifactPaths.summaryJson, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  printConsoleSummary(summary, anomalies);

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

function buildSimulationContext(
  scenario: SimulationScenario,
  saveId: string | null,
  _seed: number
): SimulationContext {
  if (saveId) {
    const save = readGameSaveById(SAVE_DIRECTORY, saveId);
    if (!save) {
      throw new Error(`Save '${saveId}' was not found in ${SAVE_DIRECTORY}.`);
    }
    const hydrated = hydrateGameSave(save);
    const contenders = hydrated.galaxy.players
      .filter((player) => player.type !== PlayerType.NEUTRAL)
      .sort((left, right) => left.playerId - right.playerId);
    return {
      hydrated,
      galaxy: hydrated.galaxy,
      setup: hydrated.setup,
      contenders
    };
  }

  const galaxy = new GalaxyCreator(scenario.setup).createGalaxy(['SimHost']);
  const contenders = galaxy.players
    .filter((player) => player.type !== PlayerType.NEUTRAL)
    .sort((left, right) => left.playerId - right.playerId);

  galaxy.humanPlayerMap.clear();
  galaxy.botPlayerMap.clear();
  for (const [index, player] of contenders.entries()) {
    player.type = PlayerType.BOT;
    player.botProfileId = BOT_PROFILE_IDS[index] ?? 'BALANCED';
    player.botMemory = null;
    player.botMemoryV2 = null;
    galaxy.botPlayerMap.set(player.playerId, player);
  }

  return {
    hydrated: null,
    galaxy,
    setup: scenario.setup,
    contenders
  };
}

function recordMissingTraceTurn(
  anomalies: SimulationAnomalyReport,
  contenders: Player[],
  turn: number,
  tracesForTurn: BotDecisionTraceV2[]
): void {
  const tracedPlayerIds = new Set(tracesForTurn.map((trace) => trace.playerId));
  const missingPlayerIds = contenders
    .map((player) => player.playerId)
    .filter((playerId) => !tracedPlayerIds.has(playerId));
  if (missingPlayerIds.length > 0) {
    anomalies.missingTraceTurns.push({ turn, missingPlayerIds });
    anomalies.hardFailures.push(`Turn ${turn}: missing V2 traces for bot player ids ${missingPlayerIds.join(', ')}.`);
  }
}

function validateGalaxyState(
  context: SimulationContext,
  turn: number,
  anomalies: SimulationAnomalyReport
): void {
  for (const player of context.galaxy.players) {
    for (const planet of player.planets) {
      const resources = planet.rBDSFTQ.resources;
      if (!isFiniteNumber(resources.metal) || !isFiniteNumber(resources.crystal) || !isFiniteNumber(resources.deuterium)) {
        anomalies.hardFailures.push(`Turn ${turn}: non-finite resources on ${planet.basicInfo.name}.`);
      }
      if (resources.metal < 0 || resources.crystal < 0 || resources.deuterium < 0) {
        anomalies.hardFailures.push(`Turn ${turn}: negative resources on ${planet.basicInfo.name}.`);
      }
      if (planet.info.ownerId !== player.playerId) {
        anomalies.hardFailures.push(
          `Turn ${turn}: owner mismatch on ${planet.basicInfo.name}; player ${player.playerId} list contains owner ${planet.info.ownerId}.`
        );
      }
    }
  }

  for (const fleet of context.galaxy.activeFleets) {
    const ownerExists = context.galaxy.players.some((player) => player.playerId === fleet.ownerId);
    if (!ownerExists) {
      anomalies.hardFailures.push(`Turn ${turn}: active fleet ${fleet.fleetId} has missing owner ${fleet.ownerId}.`);
    }
  }
}

function appendActivityFailures(
  anomalies: SimulationAnomalyReport,
  contenders: Player[],
  turnsRequested: number,
  acceptedActions: number,
  successfulExecutions: number,
  acceptedActionCounts: Map<number, number>
): void {
  if (turnsRequested < 20) {
    return;
  }

  if (acceptedActions <= 0) {
    anomalies.activityFailures.push(
      `No proposals were accepted across ${turnsRequested} turns.`
    );
  }
  if (successfulExecutions <= 0) {
    anomalies.activityFailures.push(
      `No bot action executed successfully across ${turnsRequested} turns.`
    );
  }

  const inactiveBots = contenders
    .filter((player) => (acceptedActionCounts.get(player.playerId) ?? 0) === 0)
    .map((player) => `${player.playerName}#${player.playerId}`);
  if (inactiveBots.length > 0) {
    anomalies.activityFailures.push(
      `Bots with zero accepted actions across ${turnsRequested} turns: ${inactiveBots.join(', ')}.`
    );
  }
}

function initializeResourceConcentrationSummaries(
  contenders: Player[]
): Map<number, MutableResourceConcentrationPlayerSummary> {
  return new Map(contenders.map((player) => [player.playerId, {
    playerId: player.playerId,
    playerName: player.playerName,
    profileId: player.botProfileId,
    signalsEmitted: 0,
    targetSelections: 0,
    transportsProposed: 0,
    transportsAccepted: 0,
    transportsExecuted: 0,
    reservationsCreated: 0,
    reservationsExpired: 0,
    matchingInvestmentsStarted: 0,
    activeReservationCount: 0,
    activeLockedResources: { metal: 0, crystal: 0, deuterium: 0 },
    activeTargets: [],
    knownTargetKeys: new Set<string>()
  }]));
}

function recordResourceConcentrationTrace(
  summaries: Map<number, MutableResourceConcentrationPlayerSummary>,
  trace: BotDecisionTraceV2,
  acceptedProposalIds: Set<string>
): void {
  const summary = summaries.get(trace.playerId);
  if (!summary) {
    return;
  }

  const proposalById = new Map(trace.proposals.map((proposal) => [proposal.proposalId, proposal]));
  for (const proposal of trace.proposals) {
    if (proposal.debug.resourceConcentrationRequest === true) {
      summary.signalsEmitted += 1;
      const key = resolveConcentrationKeyFromProposal(proposal);
      if (key) {
        summary.knownTargetKeys.add(key);
      }
    }
    if (proposal.debug.resourceConcentrationTransport === true) {
      summary.transportsProposed += 1;
      const key = typeof proposal.debug.resourceConcentrationTargetKey === 'string'
        ? proposal.debug.resourceConcentrationTargetKey
        : null;
      if (key) {
        summary.knownTargetKeys.add(key);
      }
      if (acceptedProposalIds.has(proposal.proposalId)) {
        summary.transportsAccepted += 1;
      }
    }
    if (acceptedProposalIds.has(proposal.proposalId)) {
      const key = resolveConcentrationKeyFromProposal(proposal);
      if (key && summary.knownTargetKeys.has(key)) {
        summary.matchingInvestmentsStarted += 1;
      }
    }
  }

  const strategicDevelopmentDebug = trace.subsystemResults.find((result) =>
    result.subsystemId === 'STRATEGIC_DEVELOPMENT'
  )?.debug;
  if (strategicDevelopmentDebug?.resourceConcentrationTargetActive === true) {
    summary.targetSelections += 1;
    if (typeof strategicDevelopmentDebug.resourceConcentrationTargetKey === 'string') {
      summary.knownTargetKeys.add(strategicDevelopmentDebug.resourceConcentrationTargetKey);
    }
  }

  summary.reservationsExpired += Math.max(
    0,
    Math.floor(Number(trace.supervisorDecision.debug?.expiredIncomingResourceReservationCount ?? 0))
  );

  for (const outcome of trace.executionOutcomes) {
    const proposal = proposalById.get(outcome.proposalId);
    if (outcome.success && proposal?.debug.resourceConcentrationTransport === true) {
      summary.transportsExecuted += 1;
      summary.reservationsCreated += 1;
    }
  }
}

function resolveConcentrationKeyFromProposal(
  proposal: BotDecisionTraceV2['proposals'][number]
): string | null {
  if (!proposal.targetCoordinates) {
    return null;
  }
  const coordinateKey = `${proposal.targetCoordinates.x}:${proposal.targetCoordinates.y}:${proposal.targetCoordinates.z}`;
  if (proposal.proposalKind === 'BUILDING' && typeof proposal.debug.finalBuildingType === 'string') {
    const level = Math.floor(Number(proposal.debug.finalLevel ?? 0));
    return level > 0 ? `old-building:${coordinateKey}:${proposal.debug.finalBuildingType}:${level}` : null;
  }
  if (proposal.proposalKind === 'RESEARCH') {
    const technologyType = typeof proposal.debug.technologyType === 'string'
      ? proposal.debug.technologyType
      : typeof proposal.debug.finalTechnologyType === 'string'
        ? proposal.debug.finalTechnologyType
        : null;
    const level = Math.floor(Number(proposal.debug.nextLevel ?? proposal.debug.finalLevel ?? 0));
    return technologyType && level > 0 ? `research:${coordinateKey}:${technologyType}:${level}` : null;
  }
  return null;
}

function buildResourceConcentrationSummary(
  scenario: SimulationScenarioKey,
  seed: number,
  context: SimulationContext,
  summaries: Map<number, MutableResourceConcentrationPlayerSummary>
): ResourceConcentrationSummary {
  const players = context.contenders.map((player) => {
    const summary = summaries.get(player.playerId) ?? initializeResourceConcentrationSummaries([player]).get(player.playerId)!;
    const activeReservations = player.botMemoryV2?.supervisor.incomingResourceReservations
      .filter((reservation) => reservation.active && reservation.expiresOnTurn >= context.galaxy.currentTurn)
      ?? [];
    const activeLockedResources = activeReservations.reduce(
      (sum, reservation) => ({
        metal: sum.metal + reservation.resources.metal,
        crystal: sum.crystal + reservation.resources.crystal,
        deuterium: sum.deuterium + reservation.resources.deuterium
      }),
      { metal: 0, crystal: 0, deuterium: 0 }
    );
    const activeTarget = player.botMemoryV2?.strategicDevelopment.activeResourceConcentrationTarget;

    return {
      playerId: summary.playerId,
      playerName: summary.playerName,
      profileId: summary.profileId,
      signalsEmitted: summary.signalsEmitted,
      targetSelections: summary.targetSelections,
      transportsProposed: summary.transportsProposed,
      transportsAccepted: summary.transportsAccepted,
      transportsExecuted: summary.transportsExecuted,
      reservationsCreated: summary.reservationsCreated,
      reservationsExpired: summary.reservationsExpired,
      matchingInvestmentsStarted: summary.matchingInvestmentsStarted,
      activeReservationCount: activeReservations.length,
      activeLockedResources,
      activeTargets: activeTarget ? [activeTarget.targetKey] : []
    };
  });

  const totals = players.reduce(
    (sum, player) => ({
      signalsEmitted: sum.signalsEmitted + player.signalsEmitted,
      targetSelections: sum.targetSelections + player.targetSelections,
      transportsProposed: sum.transportsProposed + player.transportsProposed,
      transportsAccepted: sum.transportsAccepted + player.transportsAccepted,
      transportsExecuted: sum.transportsExecuted + player.transportsExecuted,
      reservationsCreated: sum.reservationsCreated + player.reservationsCreated,
      reservationsExpired: sum.reservationsExpired + player.reservationsExpired,
      matchingInvestmentsStarted: sum.matchingInvestmentsStarted + player.matchingInvestmentsStarted,
      activeReservationCount: sum.activeReservationCount + player.activeReservationCount,
      activeLockedResources: {
        metal: sum.activeLockedResources.metal + player.activeLockedResources.metal,
        crystal: sum.activeLockedResources.crystal + player.activeLockedResources.crystal,
        deuterium: sum.activeLockedResources.deuterium + player.activeLockedResources.deuterium
      }
    }),
    {
      signalsEmitted: 0,
      targetSelections: 0,
      transportsProposed: 0,
      transportsAccepted: 0,
      transportsExecuted: 0,
      reservationsCreated: 0,
      reservationsExpired: 0,
      matchingInvestmentsStarted: 0,
      activeReservationCount: 0,
      activeLockedResources: { metal: 0, crystal: 0, deuterium: 0 }
    }
  );

  return {
    scenario,
    seed,
    finalTurn: context.galaxy.currentTurn,
    totals,
    players
  };
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function expirePendingDiplomaticProposalsForSimulation(
  galaxy: SimulationContext['galaxy'],
  resolvedTurnNumber: number
): void {
  for (const proposal of galaxy.diplomaticProposals) {
    if (proposal.state !== DiplomaticProposalState.PENDING || proposal.expiresOnTurn > resolvedTurnNumber) {
      continue;
    }
    proposal.state = DiplomaticProposalState.EXPIRED;
  }
}

function initializeJsonlArtifacts(...filePaths: Array<string | null>): void {
  for (const filePath of filePaths) {
    if (!filePath) {
      continue;
    }
    fs.writeFileSync(filePath, '', 'utf8');
  }
}

function appendJsonlEntry(filePath: string | null, entry: unknown): void {
  if (!filePath) {
    return;
  }
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function appendTurnArtifacts(
  logMode: SimulationLogMode,
  artifactPaths: SimulationSummary['artifactPaths'],
  trace: BotDecisionTraceV2,
  compactTurnTrace: CompactTurnTrace
): void {
  if (logMode === 'full') {
    appendJsonlEntry(artifactPaths.tracesJsonl, trace);
  }

  if (logMode !== 'summary') {
    appendJsonlEntry(artifactPaths.turnSummaryJsonl, compactTurnTrace);
  }
}

function printConsoleSummary(summary: SimulationSummary, anomalies: SimulationAnomalyReport): void {
  console.log(`Scenario: ${summary.scenario}`);
  console.log(`Description: ${summary.description}`);
  console.log(`Log mode: ${summary.logMode}`);
  console.log(`Seed: ${summary.seed}`);
  console.log(`Turns: ${summary.turnsCompleted}/${summary.turnsRequested}`);
  console.log(`Bots: ${summary.botCount}`);
  console.log(`Accepted actions: ${summary.totals.acceptedActions}`);
  console.log(`Execution failures: ${summary.totals.failedExecutions}`);
  console.log(`Unexpected command failures: ${anomalies.unexpectedCommandFailures.length}`);
  console.log(`Hard failures: ${anomalies.hardFailures.length}`);
  console.log(`Activity failures: ${anomalies.activityFailures.length}`);
  console.log(`Summary: ${summary.artifactPaths.summaryJson}`);
  console.log(`Traces: ${summary.artifactPaths.tracesJsonl ?? '(disabled)'}`);
  console.log(`Turn summaries: ${summary.artifactPaths.turnSummaryJsonl ?? '(disabled)'}`);
  console.log(`Anomalies: ${summary.artifactPaths.anomaliesJson}`);
  console.log(`Final state: ${summary.artifactPaths.finalStateSummaryJson}`);
  console.log(`Battle summary: ${summary.artifactPaths.battleSummaryJson}`);
  console.log(`Resource concentration: ${summary.artifactPaths.resourceConcentrationSummaryJson}`);
}

function parseCliOptions(args: string[]): SimulationCliOptions {
  let scenario: SimulationScenarioKey = 'initial';
  let logModeOverride: SimulationLogMode | null = null;
  let turnsOverride: number | null = null;
  let seedOverride: number | null = null;
  let saveId: string | null = null;
  let outputDir: string | null = null;
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      const rawScenario = arg.slice('--scenario='.length).trim() as SimulationScenarioKey;
      if (rawScenario !== 'initial' && rawScenario !== 'advanced' && rawScenario !== 'benchmark20x20') {
        throw new Error(`Unknown scenario '${rawScenario}'. Use --scenario=initial, --scenario=advanced, or --scenario=benchmark20x20.`);
      }
      scenario = rawScenario;
      continue;
    }
    if (arg.startsWith('--log-mode=')) {
      const rawLogMode = arg.slice('--log-mode='.length).trim() as SimulationLogMode;
      if (rawLogMode !== 'full' && rawLogMode !== 'compact' && rawLogMode !== 'summary') {
        throw new Error(`Unknown log mode '${rawLogMode}'. Use --log-mode=full, --log-mode=compact, or --log-mode=summary.`);
      }
      logModeOverride = rawLogMode;
      continue;
    }
    if (arg.startsWith('--turns=')) {
      turnsOverride = parsePositiveInteger(arg.slice('--turns='.length), '--turns');
      continue;
    }
    if (arg.startsWith('--seed=')) {
      seedOverride = parsePositiveInteger(arg.slice('--seed='.length), '--seed');
      continue;
    }
    if (arg.startsWith('--load-save-id=')) {
      saveId = arg.slice('--load-save-id='.length).trim() || null;
      continue;
    }
    if (arg.startsWith('--output-dir=')) {
      outputDir = arg.slice('--output-dir='.length).trim() || null;
      continue;
    }
    if (arg === '--verbose') {
      verbose = true;
      continue;
    }

    throw new Error(`Unknown CLI argument '${arg}'.`);
  }

  return {
    scenario,
    logModeOverride,
    turnsOverride,
    seedOverride,
    saveId,
    outputDir,
    verbose
  };
}

function parsePositiveInteger(rawValue: string, label: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return parsed;
}

function timestampSlug(): string {
  const now = new Date();
  const year = now.getFullYear().toString();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hours = `${now.getHours()}`.padStart(2, '0');
  const minutes = `${now.getMinutes()}`.padStart(2, '0');
  const seconds = `${now.getSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function buildFinalStateSummary(
  scenario: SimulationScenarioKey,
  seed: number,
  context: SimulationContext
): FinalStateSummary {
  return {
    scenario,
    seed,
    finalTurn: context.galaxy.currentTurn,
    galaxyName: context.galaxy.name,
    activeFleetCount: context.galaxy.activeFleets.length,
    players: context.contenders.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      profileId: player.botProfileId,
      planetsOwned: player.planets.length,
      activeFleetCount: context.galaxy.activeFleets.filter((fleet) => fleet.ownerId === player.playerId).length,
      techLevels: extractPositiveRecord(player.tech),
      totalShips: sumPlanetShipCounts(player),
      totalDefences: sumPlanetDefenceCounts(player),
      planets: [...player.planets]
        .sort((left, right) =>
          left.basicInfo.solarSystem.coordinates.y - right.basicInfo.solarSystem.coordinates.y
          || left.basicInfo.solarSystem.coordinates.x - right.basicInfo.solarSystem.coordinates.x
          || left.basicInfo.order - right.basicInfo.order
        )
        .map((planet) => ({
          name: planet.basicInfo.name,
          coordinates: {
            x: planet.basicInfo.solarSystem.coordinates.x,
            y: planet.basicInfo.solarSystem.coordinates.y,
            z: planet.basicInfo.order
          },
          size: planet.basicInfo.size,
          resources: {
            metal: planet.rBDSFTQ.resources.metal,
            crystal: planet.rBDSFTQ.resources.crystal,
            deuterium: planet.rBDSFTQ.resources.deuterium
          },
          buildings: extractPositiveRecord(planet.rBDSFTQ.buildingsLevels),
          ships: extractPositiveRecord(planet.rBDSFTQ.ships.countByType()),
          defences: extractPositiveRecord(planet.rBDSFTQ.defences.countByType())
        }))
    }))
  };
}

function buildBattleSummary(
  scenario: SimulationScenarioKey,
  seed: number,
  contenders: Player[],
  finalTurn: number
): BattleSummary {
  const uniqueEvents = new Map<string, BattleSummary['events'][number]>();

  for (const player of contenders) {
    for (const report of player.reports) {
      if (
        report.reportType !== ReportType.FLEET_REPORT
        && report.reportType !== ReportType.BUILDINGS_REPORT
      ) {
        continue;
      }
      const category = classifyCombatReport(report.title);
      if (!category || !('body' in report) || typeof report.body !== 'string') {
        continue;
      }

      const eventKey = [
        category,
        report.reportType,
        report.createdTurn,
        report.title,
        report.senderPlayerName ?? '',
        report.coordinatesLabel() ?? '',
        report.body
      ].join('|');
      const existing = uniqueEvents.get(eventKey);
      if (existing) {
        if (!existing.observers.some((observer) => observer.playerId === player.playerId)) {
          existing.observers.push({
            playerId: player.playerId,
            playerName: player.playerName,
            profileId: player.botProfileId
          });
        }
        continue;
      }

      uniqueEvents.set(eventKey, {
        eventKey,
        category,
        reportType: report.reportType,
        createdTurn: report.createdTurn,
        title: report.title,
        senderPlayerName: report.senderPlayerName,
        sourcePlanetName: report.sourcePlanetName,
        sourceSystemName: report.sourceSystemName,
        sourceCoordinates: report.sourceCoordinates ? { ...report.sourceCoordinates } : null,
        observers: [{
          playerId: player.playerId,
          playerName: player.playerName,
          profileId: player.botProfileId
        }],
        body: report.body
      });
    }
  }

  const events = [...uniqueEvents.values()].sort((left, right) =>
    left.createdTurn - right.createdTurn
    || left.title.localeCompare(right.title)
    || left.eventKey.localeCompare(right.eventKey)
  );
  const countsByCategory: Record<string, number> = {
    BATTLE: 0,
    BOMBARDMENT: 0,
    PLUNDER: 0
  };
  for (const event of events) {
    countsByCategory[event.category] = (countsByCategory[event.category] ?? 0) + 1;
  }

  return {
    scenario,
    seed,
    finalTurn,
    totalUniqueEvents: events.length,
    countsByCategory,
    events
  };
}

function classifyCombatReport(title: string): BattleSummary['events'][number]['category'] | null {
  if (title.startsWith('Battle Report:')) {
    return 'BATTLE';
  }
  if (title.startsWith('Bombardment Report:')) {
    return 'BOMBARDMENT';
  }
  if (title.startsWith('Plunder Report:')) {
    return 'PLUNDER';
  }
  return null;
}

function extractPositiveRecord(entries: Map<string | number, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of entries.entries()) {
    if (!Number.isFinite(value) || value <= 0) {
      continue;
    }
    result[String(key)] = value;
  }
  return result;
}

function sumPlanetShipCounts(player: Player): Record<string, number> {
  const totals = new Map<string, number>();
  for (const planet of player.planets) {
    for (const [shipType, amount] of planet.rBDSFTQ.ships.countByType().entries()) {
      totals.set(String(shipType), (totals.get(String(shipType)) ?? 0) + amount);
    }
  }
  return extractPositiveRecord(totals);
}

function sumPlanetDefenceCounts(player: Player): Record<string, number> {
  const totals = new Map<string, number>();
  for (const planet of player.planets) {
    for (const [defenceType, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
      totals.set(String(defenceType), (totals.get(String(defenceType)) ?? 0) + amount);
    }
  }
  return extractPositiveRecord(totals);
}

function withSeededRandom<T>(seed: number, callback: () => T): T {
  const previousRandom = Math.random;
  let state = seed >>> 0;
  Math.random = () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  try {
    return callback();
  } finally {
    Math.random = previousRandom;
  }
}

const isDirectExecution = process.argv[1]
  ? pathToFileURL(process.argv[1]).href === import.meta.url
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
