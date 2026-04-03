import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { ShipBlueprintsFactory } from '../src/app/factories/ship-blueprints.factory.js';
import { EspionageReportGenerator } from '../src/app/generators/espionage-report-generator.js';
import { createDiplomaticRelation } from '../src/app/models/diplomacy/diplomatic-relation.js';
import { DiplomaticProposalState } from '../src/app/models/diplomacy/diplomatic-proposal-state.js';
import { DiplomaticStatus } from '../src/app/models/diplomacy/diplomatic-status.js';
import { PlanetType } from '../src/app/models/enums/planet-type.js';
import { PlayerType } from '../src/app/models/enums/player-type.js';
import {
  normalizeGalaxySetup,
  type GalaxySetup
} from '../src/app/models/game-api-types.js';
import { ManyShips } from '../src/app/models/fleets/many-ships.js';
import { GalaxyCreator } from '../src/app/models/planets/galaxy-creator.js';
import { ResourcesPack } from '../src/app/models/resources-pack.js';
import { BOT_PROFILE_IDS, type BotProfileId, type Player } from '../src/app/models/player.js';
import { clearBotDecisionTraces, getBotDecisionTraces } from '../server/src/bots/bot-debug-store.js';
import { runBotTurnPhase } from '../server/src/bots/bot-turn-runner.js';
import { resolvePhaseOneTurn } from '../src/app/models/turns/phase-one-turn-resolver.js';

export type SimulationPresetKey = 'baselineMixed' | 'frontierPressure' | 'warHotspot';

type SimulationPreset = {
  key: SimulationPresetKey;
  description: string;
  turnTargets: number[];
  setup: GalaxySetup;
  profileOrder: BotProfileId[];
  startingShipsPerType: number;
  planetResourceFloor: ResourcesPack;
  occupyRemainingPlanets?: boolean;
  mutualWarIntel?: boolean;
  shipsPerTypeByIndex?: number[];
};

type TurnSample = {
  turn: number;
  activeFleetCount: number;
  pendingProposalCount: number;
  acceptedProposalCount: number;
  botOwnedPlanets: number;
  diplomacyActions: number;
  combatActions: number;
  colonizeActions: number;
};

type PlayerSimulationSummary = {
  playerId: number;
  playerName: string;
  profileId: BotProfileId | null;
  planetsOwned: number;
  activeFleetCount: number;
  currentGoal: string | null;
  totalResources: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  proposalCounts: Record<string, number>;
  chosenActionCounts: Record<string, number>;
};

type ProfileAggregateSummary = {
  profileId: BotProfileId;
  playerCount: number;
  avgPlanetsOwned: number;
  avgActiveFleetCount: number;
  avgTotalResourceValue: number;
  avgCombatActions: number;
  avgDiplomacyActions: number;
  avgColonizeActions: number;
  avgTransportActions: number;
  avgMoveActions: number;
  avgBuildingActions: number;
  avgResearchActions: number;
  proposalStateCounts: Record<string, number>;
};

type SimulationRunResult = {
  preset: SimulationPresetKey;
  description: string;
  targetTurns: number;
  startedAt: string;
  durationMs: number;
  passed: boolean;
  contenderCount: number;
  difficultyPercent: number;
  finalTurn: number;
  finalSummary: {
    totalBotPlanets: number;
    totalNeutralPlanets: number;
    activeFleetCount: number;
    maxActiveFleetCount: number;
    turnsWithActiveFleets: number;
    turnsWithDiplomacyActions: number;
    turnsWithCombatActions: number;
    firstTurnWithFleetActivity: number | null;
    firstTurnWithDiplomacyAction: number | null;
    firstTurnWithCombatAction: number | null;
    proposalStateCounts: Record<string, number>;
    actionCounts: Record<string, number>;
  };
  turnSamples: TurnSample[];
  players: PlayerSimulationSummary[];
  profileSummary: ProfileAggregateSummary[];
  notes: string[];
  error?: string;
};

export type OverallProfileAggregateSummary = {
  profileId: BotProfileId;
  runCount: number;
  playerCount: number;
  avgPlanetsOwned: number;
  avgActiveFleetCount: number;
  avgTotalResourceValue: number;
  avgCombatActions: number;
  avgDiplomacyActions: number;
  avgColonizeActions: number;
  avgTransportActions: number;
  avgMoveActions: number;
  avgBuildingActions: number;
  avgResearchActions: number;
  proposalStateCounts: Record<string, number>;
};

export type SimulationSummary = {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  presets: SimulationRunResult[];
  overallProfileSummary: OverallProfileAggregateSummary[];
  comparisonSummary: ProfileComparisonSummary | null;
};

export type SimulationCliOptions = {
  presetKeys: SimulationPresetKey[];
  profileFilter: BotProfileId[] | null;
  comparePair: [BotProfileId, BotProfileId] | null;
};

type SimulationRunExecutionOptions = {
  logProgress?: boolean;
};

export type ProfileComparisonSummary = {
  leftProfileId: BotProfileId;
  rightProfileId: BotProfileId;
  left: OverallProfileAggregateSummary;
  right: OverallProfileAggregateSummary;
  deltas: {
    avgPlanetsOwned: number;
    avgActiveFleetCount: number;
    avgTotalResourceValue: number;
    avgCombatActions: number;
    avgDiplomacyActions: number;
    avgColonizeActions: number;
    avgTransportActions: number;
    avgMoveActions: number;
    avgBuildingActions: number;
    avgResearchActions: number;
  };
};

const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const ESPIONAGE_REPORT_GENERATOR = new EspionageReportGenerator();
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp', 'bot-simulation-results.json');

const SIMULATION_PRESETS: Record<SimulationPresetKey, SimulationPreset> = {
  baselineMixed: {
    key: 'baselineMixed',
    description: 'Four comparable bot empires on a medium sandbox map with modest seeded fleets.',
    turnTargets: [20, 50, 100],
    setup: normalizeGalaxySetup({
      gameType: 'Sandbox',
      galaxyName: 'Bot Sim Baseline',
      galaxyWidth: 18,
      galaxyHeight: 14,
      galaxyCenterSize: 6,
      voidChance: 3,
      starsAmountModifier: [0, 2],
      playerAmount: 1,
      botsAmount: 3,
      botDifficulty: 25,
      neutralBotsAmount: 0,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 0,
      createRandomPlanets: false,
      createStartingShips: false,
      skipTutorial: true,
      startingResources: {
        metal: 800,
        crystal: 500,
        deuterium: 250
      }
    }),
    profileOrder: ['BALANCED', 'MINER', 'TURTLE', 'AVOIDER'],
    startingShipsPerType: 1,
    planetResourceFloor: new ResourcesPack(900, 550, 275)
  },
  frontierPressure: {
    key: 'frontierPressure',
    description: 'Dense six-bot sandbox with extra fleets/resources to surface frontier contact, combat, and diplomacy sooner.',
    turnTargets: [20, 50, 100],
    setup: normalizeGalaxySetup({
      gameType: 'Sandbox',
      galaxyName: 'Bot Sim Pressure',
      galaxyWidth: 10,
      galaxyHeight: 10,
      galaxyCenterSize: 5,
      voidChance: 0,
      starsAmountModifier: [1, 2],
      playerAmount: 1,
      botsAmount: 5,
      botDifficulty: 50,
      neutralBotsAmount: 0,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 0,
      createRandomPlanets: false,
      createStartingShips: false,
      skipTutorial: true,
      startingResources: {
        metal: 1400,
        crystal: 900,
        deuterium: 500
      }
    }),
    profileOrder: ['AGGRESSOR', 'BALANCED', 'AVOIDER', 'BUNKERER', 'MINER', 'TURTLE'],
    startingShipsPerType: 2,
    planetResourceFloor: new ResourcesPack(1600, 1000, 600)
  },
  warHotspot: {
    key: 'warHotspot',
    description: 'Dense six-bot war preset with full mutual intel and occupied frontiers to force early military contact.',
    turnTargets: [20, 50, 100],
    setup: normalizeGalaxySetup({
      gameType: 'Sandbox',
      galaxyName: 'Bot Sim War Hotspot',
      galaxyWidth: 10,
      galaxyHeight: 10,
      galaxyCenterSize: 5,
      voidChance: 0,
      starsAmountModifier: [1, 2],
      playerAmount: 1,
      botsAmount: 5,
      botDifficulty: 50,
      neutralBotsAmount: 0,
      neutralBotsDifficulty: 0,
      autoSaveTurns: 0,
      createRandomPlanets: false,
      createStartingShips: false,
      skipTutorial: true,
      startingResources: {
        metal: 1000,
        crystal: 700,
        deuterium: 400
      }
    }),
    profileOrder: ['AGGRESSOR', 'AGGRESSOR', 'BALANCED', 'BALANCED', 'TURTLE', 'MINER'],
    startingShipsPerType: 1,
    shipsPerTypeByIndex: [4, 3, 2, 2, 1, 1],
    planetResourceFloor: new ResourcesPack(1200, 800, 450),
    occupyRemainingPlanets: true,
    mutualWarIntel: true
  }
};

export async function runSimulationMatrix(
  options: SimulationCliOptions,
  executionOptions: SimulationRunExecutionOptions = {}
): Promise<SimulationSummary> {
  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();
  const results: SimulationRunResult[] = [];
  const logProgress = executionOptions.logProgress ?? true;

  for (const presetKey of options.presetKeys) {
    const preset = SIMULATION_PRESETS[presetKey];
    for (const targetTurns of preset.turnTargets) {
      const result = runSimulation(preset, targetTurns);
      results.push(result);

      if (logProgress) {
        const status = result.passed ? 'OK' : 'ERR';
        const proposalSummary = summarizeCounts(result.finalSummary.proposalStateCounts);
        console.log(
          `${status} ${preset.key} ${targetTurns}t ${result.durationMs.toFixed(1)}ms `
          + `fleets:max=${result.finalSummary.maxActiveFleetCount} `
          + `diplomacyTurns=${result.finalSummary.turnsWithDiplomacyActions} `
          + `combatTurns=${result.finalSummary.turnsWithCombatActions} `
          + `proposals=${proposalSummary || 'none'}`
        );
        const topCombatProfile = result.profileSummary
          .slice()
          .sort((left, right) => right.avgCombatActions - left.avgCombatActions || right.avgPlanetsOwned - left.avgPlanetsOwned)[0] ?? null;
        if (topCombatProfile) {
          console.log(
            `  top-profile ${topCombatProfile.profileId} `
            + `combat=${topCombatProfile.avgCombatActions.toFixed(2)} `
            + `diplomacy=${topCombatProfile.avgDiplomacyActions.toFixed(2)} `
            + `planets=${topCombatProfile.avgPlanetsOwned.toFixed(2)}`
          );
        }
        if (result.error) {
          console.log(`  ${result.error}`);
        }
      }
    }
  }

  const overallProfileSummary = buildOverallProfileSummary(results);
  const filteredOverallProfileSummary = filterProfileSummaries(overallProfileSummary, options.profileFilter);
  const comparisonSummary = buildProfileComparisonSummary(
    overallProfileSummary,
    options.comparePair
  );

  const summary: SimulationSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalDurationMs: roundDuration(performance.now() - startedAtPerf),
    presets: results,
    overallProfileSummary: filteredOverallProfileSummary,
    comparisonSummary
  };

  return summary;
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  const summary = await runSimulationMatrix(options);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  printOverallProfileSummary(summary.overallProfileSummary);
  printProfileComparisonSummary(summary.comparisonSummary);
  console.log(`Saved advisory simulation results to ${OUTPUT_PATH}`);
}

function runSimulation(preset: SimulationPreset, targetTurns: number): SimulationRunResult {
  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();

  try {
    clearBotDecisionTraces();
    const { galaxy, contenders } = createSimulationGalaxy(preset);
    const actionCounts: Record<string, number> = {};
    const actionCountsByPlayer = new Map<number, Record<string, number>>();
    const turnSamples: TurnSample[] = [];
    let turnsWithActiveFleets = 0;
    let turnsWithDiplomacyActions = 0;
    let turnsWithCombatActions = 0;
    let maxActiveFleetCount = 0;
    let firstTurnWithFleetActivity: number | null = null;
    let firstTurnWithDiplomacyAction: number | null = null;
    let firstTurnWithCombatAction: number | null = null;

    for (let turnIndex = 0; turnIndex < targetTurns; turnIndex += 1) {
      runBotTurnPhase(galaxy);
      const tracesForTurn = getBotDecisionTraces().filter((trace) => trace.turn === galaxy.currentTurn);
      let diplomacyActions = 0;
      let combatActions = 0;
      let colonizeActions = 0;

      for (const trace of tracesForTurn) {
        const playerActionCounts = actionCountsByPlayer.get(trace.playerId) ?? {};
        for (const action of trace.chosenActions) {
          actionCounts[action.kind] = (actionCounts[action.kind] ?? 0) + 1;
          playerActionCounts[action.kind] = (playerActionCounts[action.kind] ?? 0) + 1;
          if (isDiplomacyAction(action.kind)) {
            diplomacyActions += 1;
          }
          if (isCombatAction(action.kind)) {
            combatActions += 1;
          }
          if (action.kind === 'colonize') {
            colonizeActions += 1;
          }
        }
        actionCountsByPlayer.set(trace.playerId, playerActionCounts);
      }

      const resolvedTurnNumber = galaxy.currentTurn + 1;
      resolvePhaseOneTurn(galaxy, resolvedTurnNumber, {
        botDifficultyPercent: preset.setup.botDifficulty
      });
      galaxy.currentTurn = resolvedTurnNumber;
      expirePendingDiplomaticProposalsForSimulation(galaxy, galaxy.currentTurn);

      const activeFleetCount = galaxy.activeFleets.length;
      const pendingProposalCount = galaxy.diplomaticProposals.filter((proposal) =>
        proposal.state === DiplomaticProposalState.PENDING
      ).length;
      const acceptedProposalCount = galaxy.diplomaticProposals.filter((proposal) =>
        proposal.state === DiplomaticProposalState.ACCEPTED
      ).length;
      const botOwnedPlanets = contenders.reduce((sum, player) => sum + player.planets.length, 0);

      if (activeFleetCount > 0) {
        turnsWithActiveFleets += 1;
        if (firstTurnWithFleetActivity === null) {
          firstTurnWithFleetActivity = galaxy.currentTurn;
        }
      }
      if (diplomacyActions > 0) {
        turnsWithDiplomacyActions += 1;
        if (firstTurnWithDiplomacyAction === null) {
          firstTurnWithDiplomacyAction = galaxy.currentTurn;
        }
      }
      if (combatActions > 0) {
        turnsWithCombatActions += 1;
        if (firstTurnWithCombatAction === null) {
          firstTurnWithCombatAction = galaxy.currentTurn;
        }
      }
      maxActiveFleetCount = Math.max(maxActiveFleetCount, activeFleetCount);

      if (shouldRecordSample(galaxy.currentTurn, targetTurns)) {
        turnSamples.push({
          turn: galaxy.currentTurn,
          activeFleetCount,
          pendingProposalCount,
          acceptedProposalCount,
          botOwnedPlanets,
          diplomacyActions,
          combatActions,
          colonizeActions
        });
      }
    }

    const totalNeutralPlanets = countOwnedPlanetsByType(galaxy, PlayerType.NEUTRAL);
    const proposalStateCounts = countProposalStates(galaxy.diplomaticProposals);
    const players = contenders.map((player) =>
      summarizePlayer(player, galaxy.activeFleets.length, galaxy, actionCountsByPlayer.get(player.playerId) ?? {})
    );
    const profileSummary = buildProfileSummary(players);

    return {
      preset: preset.key,
      description: preset.description,
      targetTurns,
      startedAt,
      durationMs: roundDuration(performance.now() - startedAtPerf),
      passed: true,
      contenderCount: contenders.length,
      difficultyPercent: preset.setup.botDifficulty,
      finalTurn: galaxy.currentTurn,
      finalSummary: {
        totalBotPlanets: contenders.reduce((sum, player) => sum + player.planets.length, 0),
        totalNeutralPlanets,
        activeFleetCount: galaxy.activeFleets.length,
        maxActiveFleetCount,
        turnsWithActiveFleets,
        turnsWithDiplomacyActions,
        turnsWithCombatActions,
        firstTurnWithFleetActivity,
        firstTurnWithDiplomacyAction,
        firstTurnWithCombatAction,
        proposalStateCounts,
        actionCounts
      },
      turnSamples,
      players,
      profileSummary,
      notes: [
        'Standalone simulation mirrors bot phase + phase-one turn resolution plus proposal expiry.',
        'Jump Gate/maintenance sync and trade-port refresh are not separately replayed here.'
      ]
    };
  } catch (error) {
    return {
      preset: preset.key,
      description: preset.description,
      targetTurns,
      startedAt,
      durationMs: roundDuration(performance.now() - startedAtPerf),
      passed: false,
      contenderCount: 0,
      difficultyPercent: preset.setup.botDifficulty,
      finalTurn: 0,
      finalSummary: {
        totalBotPlanets: 0,
        totalNeutralPlanets: 0,
        activeFleetCount: 0,
        maxActiveFleetCount: 0,
        turnsWithActiveFleets: 0,
        turnsWithDiplomacyActions: 0,
        turnsWithCombatActions: 0,
        firstTurnWithFleetActivity: null,
        firstTurnWithDiplomacyAction: null,
        firstTurnWithCombatAction: null,
        proposalStateCounts: {},
        actionCounts: {}
      },
      turnSamples: [],
      players: [],
      profileSummary: [],
      notes: [preset.description],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function createSimulationGalaxy(preset: SimulationPreset): {
  galaxy: ReturnType<GalaxyCreator['createGalaxy']>;
  contenders: Player[];
} {
  const galaxy = new GalaxyCreator(preset.setup).createGalaxy(['SimHost']);
  const contenders = galaxy.players
    .filter((player) => player.type !== PlayerType.NEUTRAL)
    .sort((left, right) => left.playerId - right.playerId);

  galaxy.humanPlayerMap.clear();
  galaxy.botPlayerMap.clear();

  for (const [index, player] of contenders.entries()) {
    player.type = PlayerType.BOT;
    player.botProfileId = preset.profileOrder[index % preset.profileOrder.length] ?? 'BALANCED';
    player.botMemory = null;
    galaxy.botPlayerMap.set(player.playerId, player);
    seedPlayerPlanets(
      player,
      preset.shipsPerTypeByIndex?.[index] ?? preset.startingShipsPerType,
      preset.planetResourceFloor
    );
  }

  if (preset.occupyRemainingPlanets) {
    occupyRemainingPlanets(galaxy, contenders, preset.planetResourceFloor);
  }

  if (preset.mutualWarIntel) {
    seedMutualWarIntel(galaxy, contenders);
  }

  return {
    galaxy,
    contenders
  };
}

function buildProfileSummary(players: PlayerSimulationSummary[]): ProfileAggregateSummary[] {
  const grouped = new Map<BotProfileId, PlayerSimulationSummary[]>();
  for (const player of players) {
    if (!player.profileId) {
      continue;
    }
    const entries = grouped.get(player.profileId) ?? [];
    entries.push(player);
    grouped.set(player.profileId, entries);
  }

  return [...grouped.entries()]
    .map(([profileId, entries]) => {
      const playerCount = entries.length;
      const proposalStateCounts = mergeCountMaps(entries.map((entry) => entry.proposalCounts));
      return {
        profileId,
        playerCount,
        avgPlanetsOwned: average(entries.map((entry) => entry.planetsOwned)),
        avgActiveFleetCount: average(entries.map((entry) => entry.activeFleetCount)),
        avgTotalResourceValue: average(entries.map((entry) => totalResourceValue(entry.totalResources))),
        avgCombatActions: average(entries.map((entry) => countActionSubset(entry.chosenActionCounts, isCombatAction))),
        avgDiplomacyActions: average(entries.map((entry) => countActionSubset(entry.chosenActionCounts, isDiplomacyAction))),
        avgColonizeActions: average(entries.map((entry) => entry.chosenActionCounts['colonize'] ?? 0)),
        avgTransportActions: average(entries.map((entry) => entry.chosenActionCounts['transport'] ?? 0)),
        avgMoveActions: average(entries.map((entry) => entry.chosenActionCounts['move'] ?? 0)),
        avgBuildingActions: average(entries.map((entry) => entry.chosenActionCounts['building'] ?? 0)),
        avgResearchActions: average(entries.map((entry) => entry.chosenActionCounts['research'] ?? 0)),
        proposalStateCounts
      };
    })
    .sort((left, right) => left.profileId.localeCompare(right.profileId));
}

function buildOverallProfileSummary(results: SimulationRunResult[]): OverallProfileAggregateSummary[] {
  const grouped = new Map<BotProfileId, Array<{ run: SimulationRunResult; summary: ProfileAggregateSummary }>>();

  for (const result of results) {
    for (const summary of result.profileSummary) {
      const entries = grouped.get(summary.profileId) ?? [];
      entries.push({ run: result, summary });
      grouped.set(summary.profileId, entries);
    }
  }

  return [...grouped.entries()]
    .map(([profileId, entries]) => ({
      profileId,
      runCount: entries.length,
      playerCount: entries.reduce((sum, entry) => sum + entry.summary.playerCount, 0),
      avgPlanetsOwned: average(entries.map((entry) => entry.summary.avgPlanetsOwned)),
      avgActiveFleetCount: average(entries.map((entry) => entry.summary.avgActiveFleetCount)),
      avgTotalResourceValue: average(entries.map((entry) => entry.summary.avgTotalResourceValue)),
      avgCombatActions: average(entries.map((entry) => entry.summary.avgCombatActions)),
      avgDiplomacyActions: average(entries.map((entry) => entry.summary.avgDiplomacyActions)),
      avgColonizeActions: average(entries.map((entry) => entry.summary.avgColonizeActions)),
      avgTransportActions: average(entries.map((entry) => entry.summary.avgTransportActions)),
      avgMoveActions: average(entries.map((entry) => entry.summary.avgMoveActions)),
      avgBuildingActions: average(entries.map((entry) => entry.summary.avgBuildingActions)),
      avgResearchActions: average(entries.map((entry) => entry.summary.avgResearchActions)),
      proposalStateCounts: mergeCountMaps(entries.map((entry) => entry.summary.proposalStateCounts))
    }))
    .sort((left, right) => left.profileId.localeCompare(right.profileId));
}

function filterProfileSummaries<T extends { profileId: BotProfileId }>(
  summaries: T[],
  profileFilter: BotProfileId[] | null
): T[] {
  if (!profileFilter || profileFilter.length === 0) {
    return summaries;
  }

  const allowed = new Set(profileFilter);
  return summaries.filter((summary) => allowed.has(summary.profileId));
}

function buildProfileComparisonSummary(
  summaries: OverallProfileAggregateSummary[],
  comparePair: [BotProfileId, BotProfileId] | null
): ProfileComparisonSummary | null {
  if (!comparePair) {
    return null;
  }

  const left = summaries.find((summary) => summary.profileId === comparePair[0]) ?? null;
  const right = summaries.find((summary) => summary.profileId === comparePair[1]) ?? null;
  if (!left || !right) {
    return null;
  }

  return {
    leftProfileId: left.profileId,
    rightProfileId: right.profileId,
    left,
    right,
    deltas: {
      avgPlanetsOwned: roundDuration(left.avgPlanetsOwned - right.avgPlanetsOwned),
      avgActiveFleetCount: roundDuration(left.avgActiveFleetCount - right.avgActiveFleetCount),
      avgTotalResourceValue: roundDuration(left.avgTotalResourceValue - right.avgTotalResourceValue),
      avgCombatActions: roundDuration(left.avgCombatActions - right.avgCombatActions),
      avgDiplomacyActions: roundDuration(left.avgDiplomacyActions - right.avgDiplomacyActions),
      avgColonizeActions: roundDuration(left.avgColonizeActions - right.avgColonizeActions),
      avgTransportActions: roundDuration(left.avgTransportActions - right.avgTransportActions),
      avgMoveActions: roundDuration(left.avgMoveActions - right.avgMoveActions),
      avgBuildingActions: roundDuration(left.avgBuildingActions - right.avgBuildingActions),
      avgResearchActions: roundDuration(left.avgResearchActions - right.avgResearchActions)
    }
  };
}

function seedPlayerPlanets(player: Player, startingShipsPerType: number, resourceFloor: ResourcesPack): void {
  for (const planet of player.planets) {
    const ships = ManyShips.fromData(planet.rBDSFTQ.ships);
    for (const shipType of SHIP_BLUEPRINTS.shipsMap.keys()) {
      ships.addUndamaged(shipType, startingShipsPerType);
    }
    planet.rBDSFTQ.ships = ships;
    planet.rBDSFTQ.resources = new ResourcesPack(
      Math.max(planet.rBDSFTQ.resources.metal, resourceFloor.metal),
      Math.max(planet.rBDSFTQ.resources.crystal, resourceFloor.crystal),
      Math.max(planet.rBDSFTQ.resources.deuterium, resourceFloor.deuterium)
    );
  }
}

function occupyRemainingPlanets(
  galaxy: ReturnType<GalaxyCreator['createGalaxy']>,
  contenders: Player[],
  resourceFloor: ResourcesPack
): void {
  if (contenders.length === 0) {
    return;
  }

  const availablePlanets = galaxy.stars.flatMap((row) =>
    row.flatMap((system) =>
      system.planets.filter((planet) =>
        planet.info.ownerId === null && planet.basicInfo.type !== PlanetType.ASTEROIDS
      )
    )
  );

  let contenderIndex = 0;
  for (const planet of availablePlanets) {
    const contender = contenders[contenderIndex % contenders.length];
    contenderIndex += 1;
    planet.info.ownerId = contender.playerId;
    planet.rBDSFTQ.resources = new ResourcesPack(
      Math.max(planet.rBDSFTQ.resources.metal, resourceFloor.metal / 2),
      Math.max(planet.rBDSFTQ.resources.crystal, resourceFloor.crystal / 2),
      Math.max(planet.rBDSFTQ.resources.deuterium, resourceFloor.deuterium / 2)
    );
    planet.rBDSFTQ.ships = ManyShips.empty();
    contender.planets.push(planet);
  }
}

function seedMutualWarIntel(
  galaxy: ReturnType<GalaxyCreator['createGalaxy']>,
  contenders: Player[]
): void {
  galaxy.diplomaticRelations = [];
  for (let index = 0; index < contenders.length; index += 1) {
    const left = contenders[index];
    for (let otherIndex = index + 1; otherIndex < contenders.length; otherIndex += 1) {
      const right = contenders[otherIndex];
      galaxy.diplomaticRelations.push(createDiplomaticRelation(left.playerId, right.playerId, DiplomaticStatus.WAR));
    }
  }

  for (const viewer of contenders) {
    for (const owner of contenders) {
      if (viewer.playerId === owner.playerId) {
        continue;
      }

      for (const planet of owner.planets) {
        planet.lastReportData.set(
          viewer.playerId,
          ESPIONAGE_REPORT_GENERATOR.createEspionageReport(viewer, owner, planet, 999, {
            forcedReportLevel: 12,
            createdTurn: galaxy.currentTurn
          })
        );
      }
    }
  }
}

function summarizePlayer(
  player: Player,
  _totalActiveFleets: number,
  galaxy: ReturnType<GalaxyCreator['createGalaxy']>,
  chosenActionCounts: Record<string, number>
): PlayerSimulationSummary {
  const activeFleetCount = galaxy.activeFleets.filter((fleet) => fleet.ownerId === player.playerId).length;
  const proposalCounts = countProposalStates(galaxy.diplomaticProposals.filter((proposal) =>
    proposal.fromPlayerId === player.playerId
  ));
  const totalResources = player.planets.reduce((sum, planet) => ({
    metal: sum.metal + planet.rBDSFTQ.resources.metal,
    crystal: sum.crystal + planet.rBDSFTQ.resources.crystal,
    deuterium: sum.deuterium + planet.rBDSFTQ.resources.deuterium
  }), { metal: 0, crystal: 0, deuterium: 0 });

  return {
    playerId: player.playerId,
    playerName: player.playerName,
    profileId: player.botProfileId,
    planetsOwned: player.planets.length,
    activeFleetCount,
    currentGoal: player.botMemory?.currentGoal ?? null,
    totalResources,
    proposalCounts,
    chosenActionCounts
  };
}

function shouldRecordSample(turn: number, targetTurns: number): boolean {
  return turn <= 5 || turn % 10 === 0 || turn === targetTurns;
}

function countOwnedPlanetsByType(
  galaxy: ReturnType<GalaxyCreator['createGalaxy']>,
  playerType: PlayerType
): number {
  return galaxy.players
    .filter((player) => player.type === playerType)
    .reduce((sum, player) => sum + player.planets.length, 0);
}

function countProposalStates(
  proposals: Array<{ state: DiplomaticProposalState }>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const proposal of proposals) {
    counts[proposal.state] = (counts[proposal.state] ?? 0) + 1;
  }
  return counts;
}

function mergeCountMaps(countMaps: Record<string, number>[]): Record<string, number> {
  const merged: Record<string, number> = {};
  for (const countMap of countMaps) {
    for (const [key, value] of Object.entries(countMap)) {
      merged[key] = (merged[key] ?? 0) + value;
    }
  }
  return merged;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function totalResourceValue(resources: { metal: number; crystal: number; deuterium: number }): number {
  return resources.metal + (resources.crystal * 2) + (resources.deuterium * 3);
}

function countActionSubset(
  counts: Record<string, number>,
  predicate: (kind: string) => boolean
): number {
  return Object.entries(counts).reduce((sum, [kind, count]) =>
    predicate(kind) ? sum + count : sum, 0
  );
}

function isDiplomacyAction(kind: string): boolean {
  return kind.startsWith('propose-') || kind.startsWith('approve-') || kind.startsWith('reject-');
}

function isCombatAction(kind: string): boolean {
  return kind === 'attack' || kind === 'bombard' || kind === 'siege';
}

function summarizeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([key, value]) => `${key}:${value}`)
    .join(', ');
}

function printOverallProfileSummary(profileSummaries: OverallProfileAggregateSummary[]): void {
  if (profileSummaries.length === 0) {
    return;
  }

  console.log('Overall profile summary:');
  for (const summary of profileSummaries) {
    console.log(
      `  ${summary.profileId} `
      + `runs=${summary.runCount} `
      + `planets=${summary.avgPlanetsOwned.toFixed(2)} `
      + `combat=${summary.avgCombatActions.toFixed(2)} `
      + `diplomacy=${summary.avgDiplomacyActions.toFixed(2)} `
      + `colonize=${summary.avgColonizeActions.toFixed(2)} `
      + `move=${summary.avgMoveActions.toFixed(2)} `
      + `transport=${summary.avgTransportActions.toFixed(2)} `
      + `resources=${summary.avgTotalResourceValue.toFixed(0)} `
      + `proposals=${summarizeCounts(summary.proposalStateCounts) || 'none'}`
    );
  }
}

function printProfileComparisonSummary(summary: ProfileComparisonSummary | null): void {
  if (!summary) {
    return;
  }

  console.log(
    `Comparison ${summary.leftProfileId} vs ${summary.rightProfileId}: `
    + `planets=${formatSigned(summary.deltas.avgPlanetsOwned)} `
    + `combat=${formatSigned(summary.deltas.avgCombatActions)} `
    + `diplomacy=${formatSigned(summary.deltas.avgDiplomacyActions)} `
    + `colonize=${formatSigned(summary.deltas.avgColonizeActions)} `
    + `move=${formatSigned(summary.deltas.avgMoveActions)} `
    + `transport=${formatSigned(summary.deltas.avgTransportActions)} `
    + `resources=${formatSigned(summary.deltas.avgTotalResourceValue)}`
  );
}

export function parseCliOptions(args: string[]): SimulationCliOptions {
  const presetKeys: SimulationPresetKey[] = [];
  let profileFilter: BotProfileId[] | null = null;
  let comparePair: [BotProfileId, BotProfileId] | null = null;

  for (const arg of args) {
    if (arg.startsWith('--profiles=')) {
      profileFilter = parseProfileList(arg.slice('--profiles='.length));
      continue;
    }
    if (arg.startsWith('--compare=')) {
      const pair = parseProfileList(arg.slice('--compare='.length));
      if (pair.length !== 2) {
        throw new Error('--compare requires exactly two comma-separated bot profiles.');
      }
      comparePair = [pair[0], pair[1]];
      continue;
    }
    presetKeys.push(arg as SimulationPresetKey);
  }

  return {
    presetKeys: resolvePresetSelection(presetKeys),
    profileFilter,
    comparePair
  };
}

function parseProfileList(rawValue: string): BotProfileId[] {
  const profileIds = rawValue
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
  const invalid = profileIds.filter((entry) => !BOT_PROFILE_IDS.includes(entry as BotProfileId));
  if (invalid.length > 0) {
    throw new Error(`Unknown bot profile(s): ${invalid.join(', ')}`);
  }

  return profileIds as BotProfileId[];
}

function formatSigned(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

function expirePendingDiplomaticProposalsForSimulation(
  galaxy: ReturnType<GalaxyCreator['createGalaxy']>,
  resolvedTurnNumber: number
): void {
  for (const proposal of galaxy.diplomaticProposals) {
    if (proposal.state !== DiplomaticProposalState.PENDING || proposal.expiresOnTurn > resolvedTurnNumber) {
      continue;
    }

    proposal.state = DiplomaticProposalState.EXPIRED;
  }
}

function resolvePresetSelection(args: string[]): SimulationPresetKey[] {
  if (args.length === 0) {
    return Object.keys(SIMULATION_PRESETS) as SimulationPresetKey[];
  }

  const invalid = args.filter((arg) => !(arg in SIMULATION_PRESETS));
  if (invalid.length > 0) {
    throw new Error(`Unknown simulation preset(s): ${invalid.join(', ')}`);
  }

  return args as SimulationPresetKey[];
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100;
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
