import fs from 'node:fs';
import path from 'node:path';

type Resources = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type FamilyTotal = {
  actionCount: number;
  weightedValue: number | null;
  resources: Resources | null;
};

type TurnSummaryEntry = {
  turn: number;
  playerId: number;
  playerName: string;
  acceptedProposalIds: string[];
  acceptedProposalKinds: string[];
  pendingProposalIds: string[];
  rejectedCount: number;
  subsystemDebug?: Record<string, Record<string, string | number | boolean | null>>;
};

type FullTraceEntry = {
  turn: number;
  playerId: number;
  playerName: string;
  proposals: Array<{
    proposalId: string;
    subsystemId: string;
    proposalKind: string;
    dedupeKey: string;
  }>;
  supervisorDecision: {
    acceptedProposalIds: string[];
    pendingProposalIds: string[];
    rejectedCount: number;
  };
  executionOutcomes: Array<{
    proposalId: string;
    success: boolean;
    spent?: Resources;
    fuelSpent?: number;
    missionType?: string;
  }>;
};

type PlayerFinalState = {
  playerId: number;
  playerName: string;
  profileId: string;
  planetsOwned: number;
  activeFleetCount: number;
  totalShips: Record<string, number>;
  totalDefences: Record<string, number>;
  planets: Array<{
    buildings: Record<string, number>;
  }>;
};

type RollingSnapshot = {
  turn: number;
  playerName: string;
  dynamicWindow: number;
  simpleDynamicWindow: number;
  totalsByFamily: Record<string, number>;
  simpleTotalsByFamily: Record<string, number>;
};

type DynamicWindowCandidates = {
  dynamicWindow: number;
  simpleDynamicWindow: number;
};

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'analysis', 'bot-budget-benchmark');
const FIXED_WINDOWS = [10, 20, 40, 50, 100] as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const artifactDir = path.resolve(args.artifactDir ?? findLatestBenchmarkArtifact());
  const outputDir = path.resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR);
  const summary = readJsonIfExists(path.join(artifactDir, 'summary.json'));
  const finalState = readJsonIfExists(path.join(artifactDir, 'final-state-summary.json'));
  const battleSummary = readJsonIfExists(path.join(artifactDir, 'battle-summary.json'));
  const turnSummaries = readJsonl<TurnSummaryEntry>(path.join(artifactDir, 'turn-summary.jsonl'));
  const fullTracesPath = path.join(artifactDir, 'traces.jsonl');
  const fullTraces = fs.existsSync(fullTracesPath)
    ? readJsonl<FullTraceEntry>(fullTracesPath)
    : [];
  const finalPlayers = readFinalPlayers(finalState);
  const dynamicWindowByPlayer = buildDynamicWindowByPlayer(finalPlayers);
  const countActions = analyzeAcceptedCounts(turnSummaries);
  const spendActions = fullTraces.length > 0 ? analyzeFullTraceSpending(fullTraces) : null;
  const rolling = buildRollingSnapshots(
    spendActions ?? countActions.map((entry) => ({ ...entry, weightedValue: 1 })),
    dynamicWindowByPlayer
  );

  const report = {
    artifactDir,
    generatedAt: new Date().toISOString(),
    sourceMode: fullTraces.length > 0 ? 'full-trace-spending' : 'compact-accepted-counts',
    caveat: fullTraces.length > 0
      ? null
      : 'Compact artifacts do not contain executed resource spending per proposal, so weighted values are accepted-action counts.',
    summary,
    battleSummary,
    finalPlayers: finalPlayers.map((player) => ({
      playerId: player.playerId,
      playerName: player.playerName,
      profileId: player.profileId,
      planetsOwned: player.planetsOwned,
      activeFleetCount: player.activeFleetCount,
      totalShips: sumRecord(player.totalShips),
      totalDefences: sumRecord(player.totalDefences),
      avgIndustry: estimateFinalAvgIndustry(player),
      dynamicWindow: dynamicWindowByPlayer.get(player.playerName)?.dynamicWindow ?? 10,
      simpleDynamicWindow: dynamicWindowByPlayer.get(player.playerName)?.simpleDynamicWindow ?? 10
    })),
    totalsByPlayer: summarizeByPlayer(spendActions ?? countActions.map((entry) => ({ ...entry, weightedValue: 1 }))),
    rolling,
    weightManagerSnapshots: summarizeWeightManager(turnSummaries)
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = path.basename(artifactDir);
  const jsonPath = path.join(outputDir, `${baseName}-budget-analysis.json`);
  const markdownPath = path.join(outputDir, `${baseName}-budget-analysis.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

  console.log(`Bot budget analysis JSON: ${jsonPath}`);
  console.log(`Bot budget analysis Markdown: ${markdownPath}`);
}

function parseArgs(args: string[]): { artifactDir: string | null; outputDir: string | null } {
  let artifactDir: string | null = null;
  let outputDir: string | null = null;
  for (const arg of args) {
    if (arg.startsWith('--artifact=')) {
      artifactDir = arg.slice('--artifact='.length);
    } else if (arg.startsWith('--out=')) {
      outputDir = arg.slice('--out='.length);
    }
  }
  return { artifactDir, outputDir };
}

function findLatestBenchmarkArtifact(): string {
  const root = path.resolve(process.cwd(), 'tmp', 'bot-v2-sim');
  if (!fs.existsSync(root)) {
    throw new Error(`No bot simulation artifact directory exists at ${root}`);
  }
  const candidates = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.includes('benchmark20x20'))
    .map((entry) => path.join(root, entry.name))
    .filter((entryPath) => fs.existsSync(path.join(entryPath, 'turn-summary.jsonl')))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  const latest = candidates[0];
  if (!latest) {
    throw new Error(`No benchmark20x20 artifacts found under ${root}`);
  }
  return latest;
}

function readJsonIfExists(filePath: string): unknown {
  return fs.existsSync(filePath)
    ? JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    : null;
}

function readJsonl<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function readFinalPlayers(finalState: unknown): PlayerFinalState[] {
  if (!finalState || typeof finalState !== 'object') {
    return [];
  }
  const players = (finalState as { players?: unknown }).players;
  return Array.isArray(players) ? players as PlayerFinalState[] : [];
}

function buildDynamicWindowByPlayer(players: PlayerFinalState[]): Map<string, DynamicWindowCandidates> {
  const result = new Map<string, DynamicWindowCandidates>();
  for (const player of players) {
    const avgIndustry = estimateFinalAvgIndustry(player);
    result.set(player.playerName, {
      dynamicWindow: dynamicWindowForAvgIndustry(avgIndustry),
      simpleDynamicWindow: simpleDynamicWindowForAvgIndustry(avgIndustry)
    });
  }
  return result;
}

function estimateFinalAvgIndustry(player: PlayerFinalState): number {
  const mineTriples = player.planets.map((planet) => {
    const buildings = planet.buildings ?? {};
    return [
      buildings['Metal Mine'] ?? 0,
      buildings['Crystal Mine'] ?? 0,
      buildings['Deuterium Synthesizer'] ?? 0
    ];
  });
  const values = mineTriples.flat();
  if (values.length === 0) {
    return 0;
  }
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 2);
}

function analyzeAcceptedCounts(entries: TurnSummaryEntry[]): Array<{
  turn: number;
  playerName: string;
  family: string;
  actionCount: number;
  weightedValue: number | null;
  resources: Resources | null;
}> {
  const result = [];
  for (const entry of entries) {
    for (const proposalId of entry.acceptedProposalIds ?? []) {
      result.push({
        turn: entry.turn,
        playerName: entry.playerName,
        family: familyFromProposalId(proposalId),
        actionCount: 1,
        weightedValue: null,
        resources: null
      });
    }
  }
  return result;
}

function analyzeFullTraceSpending(entries: FullTraceEntry[]): Array<{
  turn: number;
  playerName: string;
  family: string;
  actionCount: number;
  weightedValue: number;
  resources: Resources;
}> {
  const result = [];
  for (const entry of entries) {
    const proposalById = new Map(entry.proposals.map((proposal) => [proposal.proposalId, proposal]));
    for (const outcome of entry.executionOutcomes ?? []) {
      if (!outcome.success || !outcome.spent) {
        continue;
      }
      const proposal = proposalById.get(outcome.proposalId);
      result.push({
        turn: entry.turn,
        playerName: entry.playerName,
        family: proposal?.subsystemId ?? familyFromProposalId(outcome.proposalId),
        actionCount: 1,
        weightedValue: weightedValue(outcome.spent),
        resources: outcome.spent
      });
    }
  }
  return result;
}

function familyFromProposalId(proposalId: string): string {
  const prefix = proposalId.split(':', 1)[0] ?? 'unknown';
  switch (prefix) {
    case 'economic':
      return 'ECONOMIC';
    case 'defensive':
      return 'DEFENSIVE';
    case 'warfare':
      return 'WARFARE';
    case 'research':
      return 'RESEARCH';
    case 'strategic-development':
      return 'STRATEGIC_DEVELOPMENT';
    case 'strategic-military':
      return 'STRATEGIC_MILITARY';
    case 'strategic-diplomatic':
      return 'STRATEGIC_DIPLOMATIC';
    case 'critical':
      return 'CRITICAL';
    default:
      return prefix.toUpperCase();
  }
}

function summarizeByPlayer(actions: Array<{
  playerName: string;
  family: string;
  weightedValue: number | null;
  resources: Resources | null;
}>): Record<string, Record<string, FamilyTotal>> {
  const result: Record<string, Record<string, FamilyTotal>> = {};
  for (const action of actions) {
    result[action.playerName] ??= {};
    const playerTotals = result[action.playerName]!;
    const total = playerTotals[action.family] ?? {
      actionCount: 0,
      weightedValue: action.weightedValue === null ? null : 0,
      resources: action.resources === null ? null : { metal: 0, crystal: 0, deuterium: 0 }
    };
    total.actionCount += 1;
    if (action.weightedValue !== null && total.weightedValue !== null) {
      total.weightedValue = round(total.weightedValue + action.weightedValue, 2);
    }
    if (action.resources && total.resources) {
      total.resources.metal += action.resources.metal;
      total.resources.crystal += action.resources.crystal;
      total.resources.deuterium += action.resources.deuterium;
    }
    playerTotals[action.family] = total;
  }
  return result;
}

function buildRollingSnapshots(
  actions: Array<{ turn: number; playerName: string; family: string; weightedValue: number | null }>,
  dynamicWindowByPlayer: Map<string, DynamicWindowCandidates>
): RollingSnapshot[] {
  const maxTurn = Math.max(0, ...actions.map((action) => action.turn));
  const playerNames = [...new Set(actions.map((action) => action.playerName))].sort();
  const snapshots: RollingSnapshot[] = [];
  for (const turn of Array.from({ length: maxTurn }, (_, index) => index + 1).filter((entry) => entry % 10 === 0 || entry === maxTurn)) {
    for (const playerName of playerNames) {
      const windows = dynamicWindowByPlayer.get(playerName) ?? { dynamicWindow: 10, simpleDynamicWindow: 10 };
      snapshots.push({
        turn,
        playerName,
        dynamicWindow: windows.dynamicWindow,
        simpleDynamicWindow: windows.simpleDynamicWindow,
        totalsByFamily: summarizeWindow(actions, playerName, turn, windows.dynamicWindow),
        simpleTotalsByFamily: summarizeWindow(actions, playerName, turn, windows.simpleDynamicWindow)
      });
    }
  }
  return snapshots;
}

function summarizeWindow(
  actions: Array<{ turn: number; playerName: string; family: string; weightedValue: number | null }>,
  playerName: string,
  turn: number,
  window: number
): Record<string, number> {
  const start = Math.max(1, turn - window + 1);
  const result: Record<string, number> = {};
  for (const action of actions) {
    if (action.playerName !== playerName || action.turn < start || action.turn > turn) {
      continue;
    }
    result[action.family] = round((result[action.family] ?? 0) + (action.weightedValue ?? 1), 2);
  }
  return result;
}

function summarizeWeightManager(entries: TurnSummaryEntry[]): Record<string, Array<{
  turn: number;
  selectedMode: string | null;
  researchWeight: number | null;
  strategicDevelopmentWeight: number | null;
  strategicMilitaryWeight: number | null;
  strategicDiplomaticWeight: number | null;
  actionableFarmCount: number | null;
  breakNeedFarmCount: number | null;
  raidReadyFarmCount: number | null;
}>> {
  const result: Record<string, Array<{
    turn: number;
    selectedMode: string | null;
    researchWeight: number | null;
    strategicDevelopmentWeight: number | null;
    strategicMilitaryWeight: number | null;
    strategicDiplomaticWeight: number | null;
    actionableFarmCount: number | null;
    breakNeedFarmCount: number | null;
    raidReadyFarmCount: number | null;
  }>> = {};
  for (const entry of entries) {
    if (entry.turn % 10 !== 0) {
      continue;
    }
    const debug = entry.subsystemDebug?.WEIGHT_MANAGER ?? {};
    result[entry.playerName] ??= [];
    result[entry.playerName]!.push({
      turn: entry.turn,
      selectedMode: readString(debug.selectedMode),
      researchWeight: readNumber(debug.researchWeight),
      strategicDevelopmentWeight: readNumber(debug.strategicDevelopmentWeight),
      strategicMilitaryWeight: readNumber(debug.strategicMilitaryWeight),
      strategicDiplomaticWeight: readNumber(debug.strategicDiplomaticWeight),
      actionableFarmCount: readNumber(debug.actionableFarmCount),
      breakNeedFarmCount: readNumber(debug.breakNeedFarmCount),
      raidReadyFarmCount: readNumber(debug.raidReadyFarmCount)
    });
  }
  return result;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function weightedValue(resources: Resources): number {
  return resources.metal + (resources.crystal * 1.8) + (resources.deuterium * 2.6);
}

function dynamicWindowForAvgIndustry(avgIndustry: number): number {
  const normalizedAvgIndustry = Math.max(0, avgIndustry);
  return clamp(
    5 + fibonacci(Math.floor(normalizedAvgIndustry * 1.5)) + Math.floor(normalizedAvgIndustry * 4),
    10,
    100
  );
}

function simpleDynamicWindowForAvgIndustry(avgIndustry: number): number {
  return clamp(10 + Math.floor(Math.max(0, avgIndustry) * 5), 10, 100);
}

function fibonacci(index: number): number {
  if (index <= 0) {
    return 0;
  }
  let previous = 0;
  let current = 1;
  for (let i = 1; i < index; i += 1) {
    [previous, current] = [current, previous + current];
  }
  return current;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sumRecord(record: Record<string, number>): number {
  return Object.values(record ?? {}).reduce((sum, value) => sum + value, 0);
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function renderMarkdown(report: {
  artifactDir: string;
  sourceMode: string;
  caveat: string | null;
  finalPlayers: Array<{
    playerName: string;
    profileId: string;
    planetsOwned: number;
    activeFleetCount: number;
    totalShips: number;
    totalDefences: number;
    avgIndustry: number;
    dynamicWindow: number;
    simpleDynamicWindow: number;
  }>;
  totalsByPlayer: Record<string, Record<string, FamilyTotal>>;
  battleSummary: unknown;
  rolling: RollingSnapshot[];
}): string {
  const lines: string[] = [];
  lines.push('# Bot Budget Benchmark Analysis');
  lines.push('');
  lines.push(`Artifact: \`${report.artifactDir}\``);
  lines.push(`Source mode: \`${report.sourceMode}\``);
  if (report.caveat) {
    lines.push('');
    lines.push(`Caveat: ${report.caveat}`);
  }
  lines.push('');
  lines.push('## Final Players');
  lines.push('');
  lines.push('Dynamic window: `clamp(5 + Fibonacci(floor(avgIndustry * 1.5)) + floor(avgIndustry * 4), 10, 100)`');
  lines.push('Simple candidate: `clamp(10 + floor(avgIndustry * 5), 10, 100)`');
  lines.push('');
  lines.push('| Player | Profile | Planets | Active Fleets | Ships | Defences | Avg Industry | Fibonacci Window | Simple Window |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const player of report.finalPlayers) {
    lines.push(`| ${player.playerName} | ${player.profileId} | ${player.planetsOwned} | ${player.activeFleetCount} | ${player.totalShips} | ${player.totalDefences} | ${player.avgIndustry} | ${player.dynamicWindow} | ${player.simpleDynamicWindow} |`);
  }
  lines.push('');
  lines.push('## Totals By Player');
  for (const [playerName, totals] of Object.entries(report.totalsByPlayer)) {
    lines.push('');
    lines.push(`### ${playerName}`);
    lines.push('| Family | Actions | Value |');
    lines.push('|---|---:|---:|');
    for (const [family, total] of Object.entries(totals)
      .sort((left, right) => (right[1].weightedValue ?? right[1].actionCount) - (left[1].weightedValue ?? left[1].actionCount))) {
      lines.push(`| ${family} | ${total.actionCount} | ${total.weightedValue ?? total.actionCount} |`);
    }
  }
  lines.push('');
  lines.push('## Rolling Dynamic Windows');
  lines.push('');
  lines.push('| Turn | Player | Fibonacci Window | Simple Window | Top Families |');
  lines.push('|---:|---|---:|---:|---|');
  for (const snapshot of report.rolling.filter((entry) => entry.turn % 20 === 0 || entry.turn === report.rolling[report.rolling.length - 1]?.turn)) {
    const top = Object.entries(snapshot.totalsByFamily)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 4)
      .map(([family, value]) => `${family}: ${value}`)
      .join(', ');
    lines.push(`| ${snapshot.turn} | ${snapshot.playerName} | ${snapshot.dynamicWindow} | ${snapshot.simpleDynamicWindow} | ${top} |`);
  }
  lines.push('');
  const battle = report.battleSummary as { countsByCategory?: Record<string, number>; totalUniqueEvents?: number } | null;
  if (battle) {
    lines.push('## Battle Summary');
    lines.push('');
    lines.push(`Total unique events: ${battle.totalUniqueEvents ?? 'n/a'}`);
    if (battle.countsByCategory) {
      for (const [category, count] of Object.entries(battle.countsByCategory)) {
        lines.push(`- ${category}: ${count}`);
      }
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
