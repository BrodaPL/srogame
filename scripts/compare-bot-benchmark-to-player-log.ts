import fs from 'node:fs';
import path from 'node:path';

type ResourceAmounts = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type FamilyTotal = {
  actionCount: number;
  weightedValue: number;
  resources: ResourceAmounts;
};

type NullableFamilyTotal = {
  actionCount: number;
  weightedValue: number | null;
  resources: ResourceAmounts | null;
};

type PlayerAnalysis = {
  inputPath: string;
  entryCount: number;
  spendingActionCount: number;
  turnRange: { first: number | null; last: number | null };
  totalsByFamily: Record<string, FamilyTotal>;
  actionCountsByKind: Record<string, number>;
  actions: Array<{
    turn: number;
    kind: string;
    family: string;
    item: string;
    weightedValue: number;
    resources: ResourceAmounts;
  }>;
};

type PlayerLogEntry = {
  turn: number;
  kind: string;
  payload: Record<string, unknown>;
};

type BotBudgetAnalysis = {
  artifactDir: string;
  sourceMode: string;
  caveat: string | null;
  summary: {
    turnsCompleted?: number;
    totals?: {
      acceptedActions?: number;
      failedExecutions?: number;
    };
  } | null;
  battleSummary: {
    totalUniqueEvents?: number;
    countsByCategory?: Record<string, number>;
  } | null;
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
  totalsByPlayer: Record<string, Record<string, NullableFamilyTotal>>;
};

type FinalStateSummary = {
  players: Array<{
    playerName: string;
    profileId: string | null;
    techLevels: Record<string, number>;
    totalShips: Record<string, number>;
    totalDefences: Record<string, number>;
  }>;
};

type BattleSummary = {
  countsByCategory?: Record<string, number>;
  events?: Array<{
    category: string;
    observers?: Array<{
      playerName: string;
      profileId: string | null;
    }>;
  }>;
};

type CliOptions = {
  playerAnalysisPath: string | null;
  botAnalysisPath: string | null;
  botArtifactDir: string | null;
  outputDir: string | null;
};

const DEFAULT_PLAYER_ANALYSIS = path.resolve(
  process.cwd(),
  'tmp',
  'analysis',
  'kurvix5-player-log',
  'kurvix3-analysis.json'
);
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'analysis', 'bot-human-comparison');
const EXCLUDED_HUMAN_SHARE_FAMILIES = new Set(['REFUND', 'INCOME_PLUNDER']);

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const playerAnalysisPath = path.resolve(options.playerAnalysisPath ?? DEFAULT_PLAYER_ANALYSIS);
  const botAnalysisPath = path.resolve(options.botAnalysisPath ?? findLatestBotAnalysisPath());
  const playerAnalysis = readJson<PlayerAnalysis>(playerAnalysisPath);
  const botAnalysis = readJson<BotBudgetAnalysis>(botAnalysisPath);
  const botArtifactDir = path.resolve(options.botArtifactDir ?? botAnalysis.artifactDir);
  const finalStatePath = path.join(botArtifactDir, 'final-state-summary.json');
  const battleSummaryPath = path.join(botArtifactDir, 'battle-summary.json');
  const finalState = fs.existsSync(finalStatePath)
    ? readJson<FinalStateSummary>(finalStatePath)
    : { players: [] };
  const battleSummary = fs.existsSync(battleSummaryPath)
    ? readJson<BattleSummary>(battleSummaryPath)
    : { countsByCategory: {}, events: [] };
  const playerLogEntries = fs.existsSync(playerAnalysis.inputPath)
    ? readPlayerLogEntries(playerAnalysis.inputPath)
    : [];

  const report = {
    generatedAt: new Date().toISOString(),
    playerAnalysisPath,
    botAnalysisPath,
    botArtifactDir,
    caveats: buildCaveats(botAnalysis),
    human: buildHumanSummary(playerAnalysis, playerLogEntries),
    bot: buildBotSummary(botAnalysis, finalState),
    comparison: buildComparison(playerAnalysis, playerLogEntries, botAnalysis, finalState, battleSummary)
  };

  const outputDir = path.resolve(options.outputDir ?? DEFAULT_OUTPUT_DIR);
  fs.mkdirSync(outputDir, { recursive: true });
  const baseName = `${path.basename(botArtifactDir)}-vs-${path.basename(playerAnalysis.inputPath, path.extname(playerAnalysis.inputPath))}`;
  const jsonPath = path.join(outputDir, `${baseName}.json`);
  const markdownPath = path.join(outputDir, `${baseName}.md`);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

  console.log(`Bot vs human comparison JSON: ${jsonPath}`);
  console.log(`Bot vs human comparison Markdown: ${markdownPath}`);
}

function parseArgs(args: string[]): CliOptions {
  let playerAnalysisPath: string | null = null;
  let botAnalysisPath: string | null = null;
  let botArtifactDir: string | null = null;
  let outputDir: string | null = null;

  for (const arg of args) {
    if (arg.startsWith('--player-analysis=')) {
      playerAnalysisPath = arg.slice('--player-analysis='.length);
    } else if (arg.startsWith('--bot-analysis=')) {
      botAnalysisPath = arg.slice('--bot-analysis='.length);
    } else if (arg.startsWith('--bot-artifact=')) {
      botArtifactDir = arg.slice('--bot-artifact='.length);
    } else if (arg.startsWith('--out=')) {
      outputDir = arg.slice('--out='.length);
    }
  }

  return {
    playerAnalysisPath,
    botAnalysisPath,
    botArtifactDir,
    outputDir
  };
}

function findLatestBotAnalysisPath(): string {
  const root = path.resolve(process.cwd(), 'tmp', 'analysis');
  const matches = collectFiles(root)
    .filter((filePath) => filePath.endsWith('-budget-analysis.json'))
    .filter((filePath) =>
      filePath.includes('benchmark16x16-320') || filePath.includes('benchmark20x20-320')
    )
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
  const latest = matches[0];
  if (!latest) {
    throw new Error(`No benchmark16x16-320 budget analysis found under ${root}. Run analyze:bot-budget first or pass --bot-analysis=...`);
  }
  return latest;
}

function collectFiles(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }

  const result: string[] = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectFiles(entryPath));
    } else {
      result.push(entryPath);
    }
  }
  return result;
}

function readJson<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readPlayerLogEntries(logPath: string): PlayerLogEntry[] {
  return fs.readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('JSON '))
    .map((line) => JSON.parse(line.slice('JSON '.length)) as PlayerLogEntry)
    .filter((entry) => Number.isInteger(entry.turn));
}

function buildCaveats(botAnalysis: BotBudgetAnalysis): string[] {
  const caveats = [
    'Human families are weighted resource spend/income families; bot families are V2 subsystem buckets.',
    'Mission counts are directly comparable only by broad activity shape, not by resource value.'
  ];
  if (botAnalysis.caveat) {
    caveats.push(botAnalysis.caveat);
  }
  if (botAnalysis.sourceMode !== 'full-trace-spending') {
    caveats.push('Bot subsystem values are accepted-action counts because this benchmark artifact is compact.');
  }
  return caveats;
}

function buildHumanSummary(playerAnalysis: PlayerAnalysis, playerLogEntries: PlayerLogEntry[]): {
  turns: { first: number | null; last: number | null };
  entryCount: number;
  positiveSpendWeightedValue: number;
  spendShares: Array<{ family: string; value: number; sharePercent: number; actions: number }>;
  missionCounts: Record<string, number>;
  topItems: Array<{ item: string; family: string; value: number; actions: number }>;
} {
  const positiveSpendWeightedValue = positiveHumanSpendTotal(playerAnalysis);
  return {
    turns: playerAnalysis.turnRange,
    entryCount: playerAnalysis.entryCount,
    positiveSpendWeightedValue,
    spendShares: Object.entries(playerAnalysis.totalsByFamily)
      .filter(([family, total]) => !EXCLUDED_HUMAN_SHARE_FAMILIES.has(family) && total.weightedValue > 0)
      .map(([family, total]) => ({
        family,
        value: round(total.weightedValue),
        sharePercent: percent(total.weightedValue, positiveSpendWeightedValue),
        actions: total.actionCount
      }))
      .sort((left, right) => right.value - left.value),
    missionCounts: countMissionItems(playerLogEntries),
    topItems: summarizeHumanItems(playerAnalysis).slice(0, 20)
  };
}

function buildBotSummary(botAnalysis: BotBudgetAnalysis, finalState: FinalStateSummary): {
  sourceMode: string;
  turnsCompleted: number | null;
  acceptedActions: number | null;
  failedExecutions: number | null;
  battleCounts: Record<string, number>;
  finalProfiles: Array<{
    playerName: string;
    profileId: string;
    planets: number;
    ships: number;
    defences: number;
    activeFleets: number;
    avgIndustry: number;
    shipMix: Record<string, number>;
    defenceMix: Record<string, number>;
    techLevels: Record<string, number>;
  }>;
  subsystemTotals: Array<{ subsystem: string; value: number; actions: number; sharePercent: number }>;
} {
  const subsystemTotals = aggregateBotSubsystemTotals(botAnalysis);
  const totalSubsystemValue = subsystemTotals.reduce((sum, entry) => sum + entry.value, 0);
  const finalByPlayer = new Map(finalState.players.map((player) => [player.playerName, player]));
  return {
    sourceMode: botAnalysis.sourceMode,
    turnsCompleted: botAnalysis.summary?.turnsCompleted ?? null,
    acceptedActions: botAnalysis.summary?.totals?.acceptedActions ?? null,
    failedExecutions: botAnalysis.summary?.totals?.failedExecutions ?? null,
    battleCounts: botAnalysis.battleSummary?.countsByCategory ?? {},
    finalProfiles: botAnalysis.finalPlayers.map((player) => {
      const final = finalByPlayer.get(player.playerName);
      return {
        playerName: player.playerName,
        profileId: player.profileId,
        planets: player.planetsOwned,
        ships: player.totalShips,
        defences: player.totalDefences,
        activeFleets: player.activeFleetCount,
        avgIndustry: player.avgIndustry,
        shipMix: final?.totalShips ?? {},
        defenceMix: final?.totalDefences ?? {},
        techLevels: final?.techLevels ?? {}
      };
    }),
    subsystemTotals: subsystemTotals
      .map((entry) => ({ ...entry, sharePercent: percent(entry.value, totalSubsystemValue) }))
      .sort((left, right) => right.value - left.value)
  };
}

function buildComparison(
  playerAnalysis: PlayerAnalysis,
  playerLogEntries: PlayerLogEntry[],
  botAnalysis: BotBudgetAnalysis,
  finalState: FinalStateSummary,
  battleSummary: BattleSummary
): {
  humanDefenceSpendSharePercent: number;
  botDefenceActionSharePercent: number;
  humanCombatShipSpendSharePercent: number;
  botWarfareActionSharePercent: number;
  humanMissionCounts: Record<string, number>;
  botBattleCounts: Record<string, number>;
  profileFinals: Array<{
    profileId: string;
    planets: number;
    ships: number;
    defences: number;
    repairDrones: number;
    transporters: number;
    colonizers: number;
    plunderEventsObserved: number;
  }>;
  notableGaps: string[];
} {
  const humanSpendTotal = positiveHumanSpendTotal(playerAnalysis);
  const botSubsystemTotals = aggregateBotSubsystemTotals(botAnalysis);
  const botSubsystemTotal = botSubsystemTotals.reduce((sum, entry) => sum + entry.value, 0);
  const botDefensive = botSubsystemTotals.find((entry) => entry.subsystem === 'DEFENSIVE')?.value ?? 0;
  const botWarfare = botSubsystemTotals.find((entry) => entry.subsystem === 'WARFARE')?.value ?? 0;
  const finalByPlayer = new Map(finalState.players.map((player) => [player.playerName, player]));
  const plundersByProfile = countBotPlundersByProfile(battleSummary);
  const profileFinals = botAnalysis.finalPlayers.map((player) => {
    const final = finalByPlayer.get(player.playerName);
    return {
      profileId: player.profileId,
      planets: player.planetsOwned,
      ships: player.totalShips,
      defences: player.totalDefences,
      repairDrones: final?.totalShips['Repair Drone'] ?? 0,
      transporters: final?.totalShips.Transporter ?? 0,
      colonizers: final?.totalShips.Colonizer ?? 0,
      plunderEventsObserved: plundersByProfile[player.profileId] ?? 0
    };
  });
  return {
    humanDefenceSpendSharePercent: percent(playerAnalysis.totalsByFamily.DEFENCE_PRODUCTION?.weightedValue ?? 0, humanSpendTotal),
    botDefenceActionSharePercent: percent(botDefensive, botSubsystemTotal),
    humanCombatShipSpendSharePercent: percent(playerAnalysis.totalsByFamily.SHIP_PRODUCTION_COMBAT?.weightedValue ?? 0, humanSpendTotal),
    botWarfareActionSharePercent: percent(botWarfare, botSubsystemTotal),
    humanMissionCounts: countMissionItems(playerLogEntries),
    botBattleCounts: botAnalysis.battleSummary?.countsByCategory ?? {},
    profileFinals,
    notableGaps: detectNotableGaps(playerAnalysis, playerLogEntries, botAnalysis, finalState)
  };
}

function positiveHumanSpendTotal(playerAnalysis: PlayerAnalysis): number {
  return Object.entries(playerAnalysis.totalsByFamily)
    .filter(([family, total]) => !EXCLUDED_HUMAN_SHARE_FAMILIES.has(family) && total.weightedValue > 0)
    .reduce((sum, [, total]) => sum + total.weightedValue, 0);
}

function countMissionItems(playerLogEntries: PlayerLogEntry[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const entry of playerLogEntries) {
    if (entry.kind !== 'FLEET_MISSION_CREATE') {
      continue;
    }
    const missionType = String(entry.payload.missionType ?? 'UNKNOWN');
    result[missionType] = (result[missionType] ?? 0) + 1;
  }
  return sortRecordByValue(result);
}

function countBotPlundersByProfile(battleSummary: BattleSummary): Record<string, number> {
  const result: Record<string, number> = {};
  for (const event of battleSummary.events ?? []) {
    if (event.category !== 'PLUNDER') {
      continue;
    }
    for (const observer of event.observers ?? []) {
      const profileId = observer.profileId ?? 'UNKNOWN';
      result[profileId] = (result[profileId] ?? 0) + 1;
    }
  }
  return result;
}

function summarizeHumanItems(playerAnalysis: PlayerAnalysis): Array<{ item: string; family: string; value: number; actions: number }> {
  const totals = new Map<string, { item: string; family: string; value: number; actions: number }>();
  for (const action of playerAnalysis.actions) {
    if (EXCLUDED_HUMAN_SHARE_FAMILIES.has(action.family) || action.weightedValue <= 0) {
      continue;
    }
    const key = `${action.family}:${action.item}`;
    const total = totals.get(key) ?? { item: action.item, family: action.family, value: 0, actions: 0 };
    total.value += action.weightedValue;
    total.actions += 1;
    totals.set(key, total);
  }
  return [...totals.values()]
    .map((entry) => ({ ...entry, value: round(entry.value) }))
    .sort((left, right) => right.value - left.value);
}

function aggregateBotSubsystemTotals(botAnalysis: BotBudgetAnalysis): Array<{ subsystem: string; value: number; actions: number }> {
  const totals = new Map<string, { subsystem: string; value: number; actions: number }>();
  for (const playerTotals of Object.values(botAnalysis.totalsByPlayer)) {
    for (const [subsystem, total] of Object.entries(playerTotals)) {
      const entry = totals.get(subsystem) ?? { subsystem, value: 0, actions: 0 };
      entry.value += total.weightedValue ?? total.actionCount;
      entry.actions += total.actionCount;
      totals.set(subsystem, entry);
    }
  }
  return [...totals.values()].map((entry) => ({ ...entry, value: round(entry.value) }));
}

function detectNotableGaps(
  playerAnalysis: PlayerAnalysis,
  playerLogEntries: PlayerLogEntry[],
  botAnalysis: BotBudgetAnalysis,
  finalState: FinalStateSummary
): string[] {
  const gaps: string[] = [];
  const finalByPlayer = new Map(finalState.players.map((player) => [player.playerName, player]));
  const onePlanetProfiles = botAnalysis.finalPlayers
    .filter((player) => player.planetsOwned <= 1)
    .map((player) => player.profileId);
  if (onePlanetProfiles.length > 0) {
    gaps.push(`One-planet bot profiles at benchmark end: ${onePlanetProfiles.join(', ')}.`);
  }

  const idleColonizerProfiles = botAnalysis.finalPlayers
    .filter((player) => (finalByPlayer.get(player.playerName)?.totalShips.Colonizer ?? 0) > 0 && player.planetsOwned <= 2)
    .map((player) => player.profileId);
  if (idleColonizerProfiles.length > 0) {
    gaps.push(`Profiles with colonizers but weak colony conversion: ${idleColonizerProfiles.join(', ')}.`);
  }

  const humanMissionCounts = countMissionItems(playerLogEntries);
  const humanAttackCount = (humanMissionCounts.Attack ?? 0) + (humanMissionCounts.Bombard ?? 0) + (humanMissionCounts.Siege ?? 0);
  const botPlunderCount = botAnalysis.battleSummary?.countsByCategory?.PLUNDER ?? 0;
  if (botPlunderCount < humanAttackCount) {
    gaps.push(`Bot plunder/combat-farm event count (${botPlunderCount}) is below human attack/bombard/siege mission count (${humanAttackCount}).`);
  }

  const lowRepairProfiles = botAnalysis.finalPlayers
    .filter((player) => (finalByPlayer.get(player.playerName)?.totalShips['Repair Drone'] ?? 0) < 10)
    .map((player) => player.profileId);
  if (lowRepairProfiles.length > 0) {
    gaps.push(`Low repair-drone profiles: ${lowRepairProfiles.join(', ')}.`);
  }

  return gaps;
}

function sortRecordByValue(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort((left, right) => right[1] - left[1]));
}

function percent(value: number, total: number): number {
  return total > 0 ? round((value / total) * 100, 2) : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function renderMarkdown(report: ReturnType<typeof buildReportShape>): string {
  const lines: string[] = [];
  lines.push('# Bot 320 Benchmark vs Human Log');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Human analysis: \`${report.playerAnalysisPath}\``);
  lines.push(`Bot analysis: \`${report.botAnalysisPath}\``);
  lines.push(`Bot artifact: \`${report.botArtifactDir}\``);
  lines.push('');
  lines.push('## Caveats');
  for (const caveat of report.caveats) {
    lines.push(`- ${caveat}`);
  }
  lines.push('');
  lines.push('## Human Spend Shares');
  lines.push('');
  lines.push('| Family | Share | Weighted Value | Actions |');
  lines.push('|---|---:|---:|---:|');
  for (const entry of report.human.spendShares.slice(0, 12)) {
    lines.push(`| ${entry.family} | ${entry.sharePercent}% | ${entry.value} | ${entry.actions} |`);
  }
  lines.push('');
  lines.push('## Bot Subsystem Totals');
  lines.push('');
  lines.push('| Subsystem | Share | Value | Actions |');
  lines.push('|---|---:|---:|---:|');
  for (const entry of report.bot.subsystemTotals) {
    lines.push(`| ${entry.subsystem} | ${entry.sharePercent}% | ${entry.value} | ${entry.actions} |`);
  }
  lines.push('');
  lines.push('## Final Bot Profiles');
  lines.push('');
  for (const player of report.bot.finalProfiles) {
    const profileComparison = report.comparison.profileFinals.find((entry) => entry.profileId === player.profileId);
    lines.push(`### ${player.profileId}`);
    lines.push('');
    lines.push(`Planets: ${player.planets} | Ships: ${player.ships} | Defences: ${player.defences} | Active fleets: ${player.activeFleets} | Avg industry: ${player.avgIndustry} | Plunders: ${profileComparison?.plunderEventsObserved ?? 0}`);
    lines.push(`Ship types: ${countPositiveEntries(player.shipMix)}`);
    lines.push(`Ships: ${renderShipMix(player.shipMix) || 'none'}`);
    lines.push(`Key techs: ${renderKeyTechs(player.techLevels) || 'none'}`);
    lines.push('');
  }
  lines.push('');
  lines.push('## Activity Comparison');
  lines.push('');
  lines.push(`Human mission counts: ${renderRecord(report.comparison.humanMissionCounts)}`);
  lines.push(`Bot battle/plunder counts: ${renderRecord(report.comparison.botBattleCounts)}`);
  lines.push('');
  lines.push('## Share Comparison');
  lines.push('');
  lines.push(`Human defence spend share: ${report.comparison.humanDefenceSpendSharePercent}%`);
  lines.push(`Bot DEFENSIVE action/value share: ${report.comparison.botDefenceActionSharePercent}%`);
  lines.push(`Human combat-ship spend share: ${report.comparison.humanCombatShipSpendSharePercent}%`);
  lines.push(`Bot WARFARE action/value share: ${report.comparison.botWarfareActionSharePercent}%`);
  lines.push('');
  lines.push('## Notable Gaps');
  if (report.comparison.notableGaps.length <= 0) {
    lines.push('- No automatic gap flags were triggered.');
  } else {
    for (const gap of report.comparison.notableGaps) {
      lines.push(`- ${gap}`);
    }
  }
  lines.push('');
  lines.push('## Human Top Items');
  lines.push('');
  lines.push('| Item | Family | Weighted Value | Actions |');
  lines.push('|---|---|---:|---:|');
  for (const item of report.human.topItems.slice(0, 15)) {
    lines.push(`| ${item.item} | ${item.family} | ${item.value} | ${item.actions} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function buildReportShape() {
  const emptyPlayerLogEntries: PlayerLogEntry[] = [];
  return {
    generatedAt: '',
    playerAnalysisPath: '',
    botAnalysisPath: '',
    botArtifactDir: '',
    caveats: [] as string[],
    human: buildHumanSummary({
      inputPath: '',
      entryCount: 0,
      spendingActionCount: 0,
      turnRange: { first: null, last: null },
      totalsByFamily: {},
      actionCountsByKind: {},
      actions: []
    }, emptyPlayerLogEntries),
    bot: buildBotSummary({
      artifactDir: '',
      sourceMode: '',
      caveat: null,
      summary: null,
      battleSummary: null,
      finalPlayers: [],
      totalsByPlayer: {}
    }, { players: [] }),
    comparison: buildComparison({
      inputPath: '',
      entryCount: 0,
      spendingActionCount: 0,
      turnRange: { first: null, last: null },
      totalsByFamily: {},
      actionCountsByKind: {},
      actions: []
    }, emptyPlayerLogEntries, {
      artifactDir: '',
      sourceMode: '',
      caveat: null,
      summary: null,
      battleSummary: null,
      finalPlayers: [],
      totalsByPlayer: {}
    }, { players: [] }, { countsByCategory: {}, events: [] })
  };
}

function countPositiveEntries(record: Record<string, number>): number {
  return Object.values(record).filter((value) => value > 0).length;
}

function renderShipMix(shipMix: Record<string, number>): string {
  return Object.entries(shipMix)
    .filter(([, amount]) => amount > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([shipType, amount]) => `${shipType}: ${amount}`)
    .join(', ');
}

function renderKeyTechs(techLevels: Record<string, number>): string {
  return [
    'Adaptive Technology',
    'Computer Technology',
    'Hyperspace Technology',
    'Hyperspace Drive',
    'Intergalactic Research Network'
  ]
    .filter((technologyType) => (techLevels[technologyType] ?? 0) > 0)
    .map((technologyType) => `${technologyType}: ${techLevels[technologyType]}`)
    .join(', ');
}

function renderRecord(record: Record<string, number>): string {
  const entries = Object.entries(record);
  if (entries.length <= 0) {
    return 'none';
  }
  return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
