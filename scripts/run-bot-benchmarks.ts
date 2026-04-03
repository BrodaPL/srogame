import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { DiplomaticProposalState } from '../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { DiplomacyResolver } from '../src/app/models/diplomacy/diplomacy-resolver.js';
import { DiplomaticStatus } from '../src/app/models/diplomacy/diplomatic-status.js';
import { FleetMissionType } from '../src/app/models/enums/fleet-mission-type.js';
import {
  BOT_BENCHMARK_SCENARIO_KEYS,
  createBotBenchmarkScenario,
  type BotBenchmarkScenarioKey
} from '../src/app/models/testing/bot-benchmark-scenarios.js';
import { clearBotDecisionTraces, getBotDecisionTraces } from '../server/src/bots/bot-debug-store.js';
import { runBotTurnPhase } from '../server/src/bots/bot-turn-runner.js';

type BenchmarkOutcome = {
  signalMet: boolean;
  summary: string;
};

type BenchmarkScenarioResult = {
  scenario: BotBenchmarkScenarioKey;
  passed: boolean;
  advisorySignalMet: boolean | null;
  startedAt: string;
  durationMs: number;
  notes: string;
  focusBot: {
    playerId: number;
    playerName: string;
    profileId: string | null;
  };
  chosenActionKinds: string[];
  rejectedActionCount: number;
  stopReason: string | null;
  launchedFleetMissionTypes: string[];
  outgoingProposalStatuses: string[];
  incomingProposalStates: string[];
  queueSummary: {
    building: number;
    shipyard: number;
    research: number;
  };
  outcomeSummary: string | null;
  error?: string;
};

type BenchmarkSummary = {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  scenarios: BenchmarkScenarioResult[];
};

const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp', 'bot-benchmark-results.json');

async function main(): Promise<void> {
  const selectedScenarios = resolveScenarioSelection(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();
  const results: BenchmarkScenarioResult[] = [];

  for (const scenarioKey of selectedScenarios) {
    const result = runScenario(scenarioKey);
    results.push(result);

    const status = result.passed ? 'OK' : 'ERR';
    const signal = result.advisorySignalMet === null
      ? 'n/a'
      : result.advisorySignalMet
        ? 'signal'
        : 'signal-miss';
    console.log(`${status} ${scenarioKey} ${result.durationMs.toFixed(1)}ms ${signal}`);
    if (result.outcomeSummary) {
      console.log(`  ${result.outcomeSummary}`);
    }
    if (result.error) {
      console.log(`  ${result.error}`);
    }
  }

  const summary: BenchmarkSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalDurationMs: roundDuration(performance.now() - startedAtPerf),
    scenarios: results
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Saved advisory benchmark results to ${OUTPUT_PATH}`);
}

function runScenario(scenarioKey: BotBenchmarkScenarioKey): BenchmarkScenarioResult {
  const scenario = createBotBenchmarkScenario(scenarioKey);
  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();
  clearBotDecisionTraces();

  try {
    runBotTurnPhase(scenario.galaxy);
    const trace = getBotDecisionTraces(scenario.focusBot.playerId)[0] ?? null;
    const outcome = evaluateScenarioOutcome(scenarioKey, scenario.focusBot.playerId, scenario.galaxy);
    const focusBotFleets = scenario.galaxy.activeFleets.filter((fleet) => fleet.ownerId === scenario.focusBot.playerId);
    const outgoingProposals = scenario.galaxy.diplomaticProposals.filter((proposal) => proposal.fromPlayerId === scenario.focusBot.playerId);
    const incomingProposals = scenario.galaxy.diplomaticProposals.filter((proposal) => proposal.toPlayerId === scenario.focusBot.playerId);

    return {
      scenario: scenarioKey,
      passed: true,
      advisorySignalMet: outcome.signalMet,
      startedAt,
      durationMs: roundDuration(performance.now() - startedAtPerf),
      notes: scenario.notes,
      focusBot: {
        playerId: scenario.focusBot.playerId,
        playerName: scenario.focusBot.playerName,
        profileId: scenario.focusBot.botProfileId
      },
      chosenActionKinds: trace?.chosenActions.map((entry) => entry.kind) ?? [],
      rejectedActionCount: trace?.rejectedActions.length ?? 0,
      stopReason: trace?.actionBudget.stopReason ?? null,
      launchedFleetMissionTypes: focusBotFleets.map((fleet) => fleet.missionType),
      outgoingProposalStatuses: outgoingProposals.map((proposal) => proposal.requestedStatus),
      incomingProposalStates: incomingProposals.map((proposal) => proposal.state),
      queueSummary: summarizeQueues(scenario.focusBot),
      outcomeSummary: outcome.summary
    };
  } catch (error) {
    return {
      scenario: scenarioKey,
      passed: false,
      advisorySignalMet: null,
      startedAt,
      durationMs: roundDuration(performance.now() - startedAtPerf),
      notes: scenario.notes,
      focusBot: {
        playerId: scenario.focusBot.playerId,
        playerName: scenario.focusBot.playerName,
        profileId: scenario.focusBot.botProfileId
      },
      chosenActionKinds: [],
      rejectedActionCount: 0,
      stopReason: null,
      launchedFleetMissionTypes: [],
      outgoingProposalStatuses: [],
      incomingProposalStates: [],
      queueSummary: summarizeQueues(scenario.focusBot),
      outcomeSummary: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function evaluateScenarioOutcome(
  scenarioKey: BotBenchmarkScenarioKey,
  botPlayerId: number,
  galaxy: ReturnType<typeof createBotBenchmarkScenario>['galaxy']
): BenchmarkOutcome {
  switch (scenarioKey) {
    case 'botEconomyBootstrap': {
      const planets = galaxy.players.find((player) => player.playerId === botPlayerId)?.planets ?? [];
      const queueCount = planets.reduce((sum, planet) =>
        sum
        + planet.rBDSFTQ.buildingQueue.length
        + planet.rBDSFTQ.shipyardQueue.length
        + (planet.rBDSFTQ.currentResearchQueue ? 1 : 0), 0);
      return {
        signalMet: queueCount > 0,
        summary: `Economy queue count after one bot phase: ${queueCount}.`
      };
    }
    case 'botColonizeNearby': {
      const launched = galaxy.activeFleets.some((fleet) =>
        fleet.ownerId === botPlayerId && fleet.missionType === FleetMissionType.COLONIZE
      );
      return {
        signalMet: launched,
        summary: launched ? 'Colonize fleet launched.' : 'No colonize fleet launched.'
      };
    }
    case 'botRejectRiskyAttack': {
      const launched = galaxy.activeFleets.some((fleet) =>
        fleet.ownerId === botPlayerId && fleet.missionType === FleetMissionType.ATTACK
      );
      return {
        signalMet: !launched,
        summary: launched ? 'Attack launched despite risky setup.' : 'Risky attack correctly avoided.'
      };
    }
    case 'botFrontierReinforce': {
      const launched = galaxy.activeFleets.some((fleet) =>
        fleet.ownerId === botPlayerId && fleet.missionType === FleetMissionType.DEFEND
      );
      return {
        signalMet: launched,
        summary: launched ? 'Guard fleet launched for the frontier.' : 'No guard fleet launched.'
      };
    }
    case 'botAcceptPeaceUnderPressure': {
      const proposal = galaxy.diplomaticProposals[0] ?? null;
      return {
        signalMet: proposal?.state === DiplomaticProposalState.ACCEPTED,
        summary: `Incoming peace proposal state: ${proposal?.state ?? 'missing'}.`
      };
    }
    case 'botRejectPeaceWhenDominant': {
      const proposal = galaxy.diplomaticProposals[0] ?? null;
      return {
        signalMet: proposal?.state === DiplomaticProposalState.REJECTED,
        summary: `Incoming peace proposal state: ${proposal?.state ?? 'missing'}.`
      };
    }
    case 'botProposePeaceWhenOverextended': {
      const proposal = galaxy.diplomaticProposals.find((entry) =>
        entry.fromPlayerId === botPlayerId && entry.requestedStatus === DiplomaticStatus.PEACE
      ) ?? null;
      return {
        signalMet: proposal !== null,
        summary: proposal ? `Outgoing PEACE proposal created with state ${proposal.state}.` : 'No outgoing PEACE proposal created.'
      };
    }
    case 'botProposeAllianceFromPeaceOnly': {
      const proposal = galaxy.diplomaticProposals.find((entry) =>
        entry.fromPlayerId === botPlayerId && entry.requestedStatus === DiplomaticStatus.ALLIED
      ) ?? null;
      return {
        signalMet: proposal !== null,
        summary: proposal ? `Outgoing ALLIED proposal created with state ${proposal.state}.` : 'No outgoing ALLIED proposal created.'
      };
    }
  }
}

function summarizeQueues(player: ReturnType<typeof createBotBenchmarkScenario>['focusBot']): {
  building: number;
  shipyard: number;
  research: number;
} {
  let building = 0;
  let shipyard = 0;
  let research = 0;

  for (const planet of player.planets) {
    building += planet.rBDSFTQ.buildingQueue.length;
    shipyard += planet.rBDSFTQ.shipyardQueue.length;
    research += planet.rBDSFTQ.currentResearchQueue ? 1 : 0;
  }

  return { building, shipyard, research };
}

function resolveScenarioSelection(args: string[]): BotBenchmarkScenarioKey[] {
  if (args.length === 0) {
    return [...BOT_BENCHMARK_SCENARIO_KEYS];
  }

  const invalid = args.filter((arg) => !BOT_BENCHMARK_SCENARIO_KEYS.includes(arg as BotBenchmarkScenarioKey));
  if (invalid.length > 0) {
    throw new Error(`Unknown benchmark scenario(s): ${invalid.join(', ')}`);
  }

  return args as BotBenchmarkScenarioKey[];
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
