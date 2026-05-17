import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  BOT_PROFILE_IDS,
  type BotProfileId,
  type Player
} from '../src/app/models/player.js';
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

type SimulationScenarioKey = 'initial' | 'advanced';

type SimulationScenario = {
  key: SimulationScenarioKey;
  description: string;
  width: number;
  height: number;
  turns: number;
  seed: number;
  setup: GalaxySetup;
};

type SimulationCliOptions = {
  scenario: SimulationScenarioKey;
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
    tracesJsonl: string;
    turnSummaryJsonl: string;
    anomaliesJson: string;
  };
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
    setup: createScenarioSetup(10, 10)
  },
  advanced: {
    key: 'advanced',
    description: 'Advanced 100-turn bot-only validation run on a 12x12 galaxy with one full set of V2 bot profiles.',
    width: 12,
    height: 12,
    turns: 100,
    seed: 2026051702,
    setup: createScenarioSetup(12, 12)
  }
};

function createScenarioSetup(width: number, height: number): GalaxySetup {
  const botProfileCounts = createEmptyBotProfileCounts();
  for (const profileId of BOT_PROFILE_IDS) {
    botProfileCounts[profileId] = 1;
  }

  return normalizeGalaxySetup({
    gameType: 'Sandbox',
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

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const scenario = SCENARIOS[options.scenario];
  const turnLimit = options.turnsOverride ?? scenario.turns;
  const seed = options.seedOverride ?? scenario.seed;
  const outputDir = options.outputDir
    ? path.resolve(process.cwd(), options.outputDir)
    : path.join(DEFAULT_OUTPUT_ROOT, `${timestampSlug()}-${scenario.key}-${turnLimit}t-seed-${seed}`);

  fs.mkdirSync(outputDir, { recursive: true });
  clearBotDecisionTracesV2();

  const startedAt = new Date().toISOString();
  const context = buildSimulationContext(scenario, options.saveId, seed);
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
  const rawTraces: BotDecisionTraceV2[] = [];
  const compactTurnTraces: CompactTurnTrace[] = [];
  const acceptedActionCounts = new Map<number, number>();
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
          rawTraces.push(trace);
          acceptedActions += trace.supervisorDecision.acceptedProposalIds.length;
          pendingActions += trace.supervisorDecision.pendingProposalIds.length;
          rejectedActions += trace.supervisorDecision.rejectedCount;

          const acceptedProposalIds = new Set(trace.supervisorDecision.acceptedProposalIds);
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

          compactTurnTraces.push({
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
          });
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

  const artifactPaths = {
    summaryJson: path.join(outputDir, 'summary.json'),
    tracesJsonl: path.join(outputDir, 'traces.jsonl'),
    turnSummaryJsonl: path.join(outputDir, 'turn-summary.jsonl'),
    anomaliesJson: path.join(outputDir, 'anomalies.json')
  };
  writeJsonl(artifactPaths.tracesJsonl, rawTraces);
  writeJsonl(artifactPaths.turnSummaryJsonl, compactTurnTraces);
  fs.writeFileSync(artifactPaths.anomaliesJson, `${JSON.stringify(anomalies, null, 2)}\n`, 'utf8');

  const summary: SimulationSummary = {
    scenario: scenario.key,
    description: scenario.description,
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
      failedExecutions
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

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && !Number.isNaN(value);
}

function expirePendingDiplomaticProposalsForSimulation(
  galaxy: SimulationContext['galaxy'],
  resolvedTurnNumber: number
): void {
  for (const proposal of galaxy.diplomaticProposals) {
    if (proposal.state !== 'PENDING' || proposal.expiresOnTurn > resolvedTurnNumber) {
      continue;
    }
    proposal.state = 'EXPIRED';
  }
}

function writeJsonl(filePath: string, entries: unknown[]): void {
  const lines = entries.map((entry) => JSON.stringify(entry));
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`, 'utf8');
}

function printConsoleSummary(summary: SimulationSummary, anomalies: SimulationAnomalyReport): void {
  console.log(`Scenario: ${summary.scenario}`);
  console.log(`Description: ${summary.description}`);
  console.log(`Seed: ${summary.seed}`);
  console.log(`Turns: ${summary.turnsCompleted}/${summary.turnsRequested}`);
  console.log(`Bots: ${summary.botCount}`);
  console.log(`Accepted actions: ${summary.totals.acceptedActions}`);
  console.log(`Execution failures: ${summary.totals.failedExecutions}`);
  console.log(`Unexpected command failures: ${anomalies.unexpectedCommandFailures.length}`);
  console.log(`Hard failures: ${anomalies.hardFailures.length}`);
  console.log(`Activity failures: ${anomalies.activityFailures.length}`);
  console.log(`Summary: ${summary.artifactPaths.summaryJson}`);
  console.log(`Traces: ${summary.artifactPaths.tracesJsonl}`);
  console.log(`Turn summaries: ${summary.artifactPaths.turnSummaryJsonl}`);
  console.log(`Anomalies: ${summary.artifactPaths.anomaliesJson}`);
}

function parseCliOptions(args: string[]): SimulationCliOptions {
  let scenario: SimulationScenarioKey = 'initial';
  let turnsOverride: number | null = null;
  let seedOverride: number | null = null;
  let saveId: string | null = null;
  let outputDir: string | null = null;
  let verbose = false;

  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      const rawScenario = arg.slice('--scenario='.length).trim() as SimulationScenarioKey;
      if (rawScenario !== 'initial' && rawScenario !== 'advanced') {
        throw new Error(`Unknown scenario '${rawScenario}'. Use --scenario=initial or --scenario=advanced.`);
      }
      scenario = rawScenario;
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
