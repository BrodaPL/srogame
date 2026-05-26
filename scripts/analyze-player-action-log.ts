import fs from 'node:fs';
import path from 'node:path';

type Resources = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type Coordinates = {
  x: number;
  y: number;
  z: number;
};

type PlayerLogEntry = {
  turn: number;
  kind: string;
  summary: string;
  coordinates: Coordinates | null;
  targetCoordinates?: Coordinates | null;
  payload: Record<string, unknown>;
  deltas?: Record<string, unknown>;
};

type BudgetFamily =
  | 'ECONOMY_MINES'
  | 'ECONOMY_ENERGY_BUILDINGS'
  | 'ECONOMY_STORAGE'
  | 'ECONOMY_INFRASTRUCTURE'
  | 'RESEARCH'
  | 'SHIP_PRODUCTION_COMBAT'
  | 'SHIP_PRODUCTION_CARGO'
  | 'SHIP_PRODUCTION_UTILITY'
  | 'DEFENCE_PRODUCTION'
  | 'FLEET_INTEL'
  | 'FLEET_ATTACK'
  | 'FLEET_COLONIZATION'
  | 'FLEET_LOGISTICS'
  | 'FLEET_RECOVERY'
  | 'REFUND'
  | 'INCOME_PLUNDER'
  | 'OTHER';

type AnalyzedAction = {
  turn: number;
  kind: string;
  family: BudgetFamily;
  item: string;
  planetKey: string | null;
  targetKey: string | null;
  resources: Resources;
  weightedValue: number;
  summary: string;
};

type FamilyTotal = {
  actionCount: number;
  weightedValue: number;
  resources: Resources;
};

type RollingSnapshot = {
  turn: number;
  avgIndustry: number;
  dynamicWindow: number;
  simpleDynamicWindow: number;
  windows: Record<string, Record<string, number>>;
};

const DEFAULT_LOG_PATH = path.resolve(
  process.cwd(),
  'server',
  'server',
  'data',
  'player-action-logs',
  'kurvix3-6d85cc94-bc6c-48b4-8513-ef508d85a3ab.log'
);
const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), 'tmp', 'analysis', 'player-action-log');
const FIXED_WINDOWS = [10, 20, 40, 50, 100] as const;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const logPath = path.resolve(args.logPath ?? DEFAULT_LOG_PATH);
  const outputDir = path.resolve(args.outputDir ?? DEFAULT_OUTPUT_DIR);
  const entries = readPlayerLogEntries(logPath);
  const actions = analyzeEntries(entries);
  const turns = collectTurns(entries);
  const avgIndustryByTurn = buildAvgIndustryByTurn(entries, turns);
  const rolling = buildRollingSnapshots(actions, turns, avgIndustryByTurn);
  const report = {
    inputPath: logPath,
    generatedAt: new Date().toISOString(),
    entryCount: entries.length,
    spendingActionCount: actions.filter((action) => action.weightedValue !== 0).length,
    turnRange: {
      first: turns[0] ?? null,
      last: turns[turns.length - 1] ?? null
    },
    totalsByFamily: summarizeByFamily(actions),
    totalsByPhase: summarizeByPhase(actions),
    totalsByPlanet: summarizeByPlanet(actions),
    actionCountsByKind: countBy(entries, (entry) => entry.kind),
    dynamicWindow: {
      formula: 'clamp(5 + Fibonacci(floor(avgIndustry * 1.5)) + floor(avgIndustry * 4), 10, 100)',
      simpleFormula: 'clamp(10 + floor(avgIndustry * 5), 10, 100)',
      snapshots: rolling.map((entry) => ({
        turn: entry.turn,
        avgIndustry: entry.avgIndustry,
        dynamicWindow: entry.dynamicWindow,
        simpleDynamicWindow: entry.simpleDynamicWindow
      }))
    },
    rolling,
    actions
  };

  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'kurvix3-analysis.json');
  const markdownPath = path.join(outputDir, 'kurvix3-analysis.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(report), 'utf8');

  console.log(`Player log analysis JSON: ${jsonPath}`);
  console.log(`Player log analysis Markdown: ${markdownPath}`);
}

function parseArgs(args: string[]): { logPath: string | null; outputDir: string | null } {
  let logPath: string | null = null;
  let outputDir: string | null = null;
  for (const arg of args) {
    if (arg.startsWith('--log=')) {
      logPath = arg.slice('--log='.length);
    } else if (arg.startsWith('--out=')) {
      outputDir = arg.slice('--out='.length);
    }
  }
  return { logPath, outputDir };
}

function readPlayerLogEntries(logPath: string): PlayerLogEntry[] {
  if (!fs.existsSync(logPath)) {
    throw new Error(`Log file not found: ${logPath}`);
  }
  return fs.readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('JSON '))
    .map((line) => JSON.parse(line.slice('JSON '.length)) as PlayerLogEntry)
    .filter((entry) => Number.isInteger(entry.turn));
}

function analyzeEntries(entries: PlayerLogEntry[]): AnalyzedAction[] {
  const actions: AnalyzedAction[] = [];
  for (const entry of entries) {
    const spent = readResources(entry.deltas?.spent);
    const refund = readResources(entry.deltas?.refund);
    const plunder = readResources(entry.deltas?.stolenResources);
    if (spent) {
      actions.push(createAction(entry, classifyEntry(entry), spent));
    }
    if (refund) {
      actions.push(createAction(entry, { family: 'REFUND', item: readItem(entry) }, negateResources(refund)));
    }
    if (plunder) {
      actions.push(createAction(entry, { family: 'INCOME_PLUNDER', item: readItem(entry) }, plunder));
    }
  }
  return actions;
}

function createAction(
  entry: PlayerLogEntry,
  classification: { family: BudgetFamily; item: string },
  resources: Resources
): AnalyzedAction {
  return {
    turn: entry.turn,
    kind: entry.kind,
    family: classification.family,
    item: classification.item,
    planetKey: entry.coordinates ? toKey(entry.coordinates) : null,
    targetKey: entry.targetCoordinates ? toKey(entry.targetCoordinates) : null,
    resources,
    weightedValue: weightedValue(resources),
    summary: entry.summary
  };
}

function classifyEntry(entry: PlayerLogEntry): { family: BudgetFamily; item: string } {
  const item = readItem(entry);
  if (entry.kind === 'RESEARCH_START') {
    return { family: 'RESEARCH', item };
  }
  if (entry.kind === 'BUILDING_QUEUE_ADD') {
    return { family: classifyBuilding(String(entry.payload.buildingType ?? '')), item };
  }
  if (entry.kind === 'SHIPYARD_QUEUE_ADD') {
    if (entry.payload.itemKind === 'defence') {
      return { family: 'DEFENCE_PRODUCTION', item };
    }
    return { family: classifyShip(String(entry.payload.shipType ?? '')), item };
  }
  if (entry.kind === 'FLEET_MISSION_CREATE') {
    return { family: classifyMission(String(entry.payload.missionType ?? '')), item };
  }
  return { family: 'OTHER', item };
}

function classifyBuilding(buildingType: string): BudgetFamily {
  if (['Metal Mine', 'Crystal Mine', 'Deuterium Synthesizer'].includes(buildingType)) {
    return 'ECONOMY_MINES';
  }
  if (['Solar, Wind and Geothermal power plants', 'Nuclear Plant', 'Fusion Reactor'].includes(buildingType)) {
    return 'ECONOMY_ENERGY_BUILDINGS';
  }
  if (['Metal Storage', 'Crystal Storage', 'Deuterium Tank'].includes(buildingType)) {
    return 'ECONOMY_STORAGE';
  }
  if (['Bunker Network'].includes(buildingType)) {
    return 'DEFENCE_PRODUCTION';
  }
  return 'ECONOMY_INFRASTRUCTURE';
}

function classifyShip(shipType: string): BudgetFamily {
  if (['Transporter', 'Cargo Support', 'Mass Hauler', 'Colonizer'].includes(shipType)) {
    return shipType === 'Colonizer' ? 'FLEET_COLONIZATION' : 'SHIP_PRODUCTION_CARGO';
  }
  if (['Spy Probe', 'Repair Drone', 'Recycler'].includes(shipType)) {
    return 'SHIP_PRODUCTION_UTILITY';
  }
  return 'SHIP_PRODUCTION_COMBAT';
}

function classifyMission(missionType: string): BudgetFamily {
  if (missionType === 'Spy') {
    return 'FLEET_INTEL';
  }
  if (missionType === 'Attack' || missionType === 'Bombard' || missionType === 'Siege') {
    return 'FLEET_ATTACK';
  }
  if (missionType === 'Colonize') {
    return 'FLEET_COLONIZATION';
  }
  if (missionType === 'Recycle' || missionType === 'Repair') {
    return 'FLEET_RECOVERY';
  }
  if (missionType === 'Transport' || missionType === 'Move' || missionType === 'Guard' || missionType === 'Armament Delivery') {
    return 'FLEET_LOGISTICS';
  }
  return 'OTHER';
}

function readItem(entry: PlayerLogEntry): string {
  return String(
    entry.payload.buildingType
      ?? entry.payload.technologyType
      ?? entry.payload.shipType
      ?? entry.payload.defenceType
      ?? entry.payload.missionType
      ?? entry.kind
  );
}

function readResources(value: unknown): Resources | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const source = value as Partial<Resources>;
  const resources = {
    metal: Number(source.metal ?? 0),
    crystal: Number(source.crystal ?? 0),
    deuterium: Number(source.deuterium ?? 0)
  };
  return resources.metal === 0 && resources.crystal === 0 && resources.deuterium === 0
    ? null
    : resources;
}

function weightedValue(resources: Resources): number {
  return resources.metal + (resources.crystal * 1.8) + (resources.deuterium * 2.6);
}

function negateResources(resources: Resources): Resources {
  return {
    metal: -resources.metal,
    crystal: -resources.crystal,
    deuterium: -resources.deuterium
  };
}

function collectTurns(entries: PlayerLogEntry[]): number[] {
  const maxTurn = Math.max(0, ...entries.map((entry) => entry.turn));
  return Array.from({ length: maxTurn }, (_, index) => index + 1);
}

function buildAvgIndustryByTurn(entries: PlayerLogEntry[], turns: number[]): Map<number, number> {
  const mineLevels = new Map<string, { metal: number; crystal: number; deuterium: number }>();
  const result = new Map<number, number>();
  for (const turn of turns) {
    for (const entry of entries.filter((candidate) => candidate.turn === turn)) {
      if (entry.kind !== 'BUILDING_QUEUE_ADD' || !entry.coordinates) {
        continue;
      }
      const buildingType = String(entry.payload.buildingType ?? '');
      const targetLevel = Number(entry.payload.targetLevel ?? 0);
      if (!Number.isFinite(targetLevel) || targetLevel <= 0) {
        continue;
      }
      const key = toKey(entry.coordinates);
      const levels = mineLevels.get(key) ?? { metal: 1, crystal: 1, deuterium: 1 };
      if (buildingType === 'Metal Mine') {
        levels.metal = Math.max(levels.metal, targetLevel);
      } else if (buildingType === 'Crystal Mine') {
        levels.crystal = Math.max(levels.crystal, targetLevel);
      } else if (buildingType === 'Deuterium Synthesizer') {
        levels.deuterium = Math.max(levels.deuterium, targetLevel);
      }
      mineLevels.set(key, levels);
    }
    result.set(turn, averageIndustry(mineLevels));
  }
  return result;
}

function averageIndustry(mineLevels: Map<string, { metal: number; crystal: number; deuterium: number }>): number {
  const entries = [...mineLevels.values()];
  if (entries.length === 0) {
    return 0;
  }
  const total = entries.reduce((sum, entry) => sum + entry.metal + entry.crystal + entry.deuterium, 0);
  return round(total / (entries.length * 3), 2);
}

function buildRollingSnapshots(
  actions: AnalyzedAction[],
  turns: number[],
  avgIndustryByTurn: Map<number, number>
): RollingSnapshot[] {
  return turns
    .filter((turn) => turn === turns[turns.length - 1] || turn % 10 === 0)
    .map((turn) => {
      const avgIndustry = avgIndustryByTurn.get(turn) ?? 0;
      const dynamicWindow = dynamicWindowForAvgIndustry(avgIndustry);
      const simpleDynamicWindow = simpleDynamicWindowForAvgIndustry(avgIndustry);
      const windows: Record<string, Record<string, number>> = {};
      for (const window of [...new Set([...FIXED_WINDOWS, dynamicWindow, simpleDynamicWindow])]) {
        windows[String(window)] = summarizeWindow(actions, turn, window);
      }
      return {
        turn,
        avgIndustry,
        dynamicWindow,
        simpleDynamicWindow,
        windows
      };
    });
}

function summarizeWindow(actions: AnalyzedAction[], turn: number, window: number): Record<string, number> {
  const start = Math.max(1, turn - window + 1);
  const totals: Record<string, number> = {};
  for (const action of actions) {
    if (action.turn < start || action.turn > turn) {
      continue;
    }
    totals[action.family] = round((totals[action.family] ?? 0) + action.weightedValue, 2);
  }
  return totals;
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

function summarizeByFamily(actions: AnalyzedAction[]): Record<string, FamilyTotal> {
  const totals: Record<string, FamilyTotal> = {};
  for (const action of actions) {
    addToTotal(totals, action.family, action.resources, action.weightedValue);
  }
  return totals;
}

function summarizeByPhase(actions: AnalyzedAction[]): Record<string, Record<string, FamilyTotal>> {
  const phases: Record<string, Record<string, FamilyTotal>> = {
    'T1-T30': {},
    'T31-T80': {},
    'T81-T130': {},
    'T131+': {}
  };
  for (const action of actions) {
    const phase = action.turn <= 30
      ? 'T1-T30'
      : action.turn <= 80
        ? 'T31-T80'
        : action.turn <= 130
          ? 'T81-T130'
          : 'T131+';
    addToTotal(phases[phase]!, action.family, action.resources, action.weightedValue);
  }
  return phases;
}

function summarizeByPlanet(actions: AnalyzedAction[]): Record<string, Record<string, FamilyTotal>> {
  const result: Record<string, Record<string, FamilyTotal>> = {};
  for (const action of actions) {
    const key = action.planetKey ?? 'NO_PLANET';
    result[key] ??= {};
    addToTotal(result[key]!, action.family, action.resources, action.weightedValue);
  }
  return result;
}

function addToTotal(
  totals: Record<string, FamilyTotal>,
  key: string,
  resources: Resources,
  value: number
): void {
  const total = totals[key] ?? {
    actionCount: 0,
    weightedValue: 0,
    resources: { metal: 0, crystal: 0, deuterium: 0 }
  };
  total.actionCount += 1;
  total.weightedValue = round(total.weightedValue + value, 2);
  total.resources.metal += resources.metal;
  total.resources.crystal += resources.crystal;
  total.resources.deuterium += resources.deuterium;
  totals[key] = total;
}

function countBy<T>(items: T[], keyFn: (item: T) => string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function toKey(coordinates: Coordinates): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function renderMarkdown(report: {
  inputPath: string;
  entryCount: number;
  spendingActionCount: number;
  turnRange: { first: number | null; last: number | null };
  totalsByFamily: Record<string, FamilyTotal>;
  totalsByPhase: Record<string, Record<string, FamilyTotal>>;
  dynamicWindow: { formula: string; simpleFormula: string };
  rolling: RollingSnapshot[];
}): string {
  const lines: string[] = [];
  lines.push('# Player Action Log Analysis');
  lines.push('');
  lines.push(`Input: \`${report.inputPath}\``);
  lines.push(`Turns: ${report.turnRange.first ?? 'n/a'}-${report.turnRange.last ?? 'n/a'}`);
  lines.push(`Entries: ${report.entryCount}`);
  lines.push(`Spending/refund/income actions: ${report.spendingActionCount}`);
  lines.push(`Dynamic window: \`${report.dynamicWindow.formula}\``);
  lines.push(`Simple candidate: \`${report.dynamicWindow.simpleFormula}\``);
  lines.push('');
  lines.push('## Totals By Family');
  lines.push('');
  lines.push('| Family | Actions | Weighted Value | Metal | Crystal | Deuterium |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [family, total] of sortTotals(report.totalsByFamily)) {
    lines.push(`| ${family} | ${total.actionCount} | ${round(total.weightedValue)} | ${total.resources.metal} | ${total.resources.crystal} | ${total.resources.deuterium} |`);
  }
  lines.push('');
  lines.push('## Phase Totals');
  for (const [phase, totals] of Object.entries(report.totalsByPhase)) {
    lines.push('');
    lines.push(`### ${phase}`);
    lines.push('| Family | Actions | Weighted Value |');
    lines.push('|---|---:|---:|');
    for (const [family, total] of sortTotals(totals).slice(0, 12)) {
      lines.push(`| ${family} | ${total.actionCount} | ${round(total.weightedValue)} |`);
    }
  }
  lines.push('');
  lines.push('## Rolling Dynamic Window Snapshots');
  lines.push('');
  lines.push('| Turn | Avg Industry | Fibonacci Window | Simple Window | Top Families |');
  lines.push('|---:|---:|---:|---:|---|');
  for (const snapshot of report.rolling) {
    const totals = snapshot.windows[String(snapshot.dynamicWindow)] ?? {};
    const top = Object.entries(totals)
      .sort((left, right) => Math.abs(right[1]) - Math.abs(left[1]))
      .slice(0, 4)
      .map(([family, value]) => `${family}: ${round(value)}`)
      .join(', ');
    lines.push(`| ${snapshot.turn} | ${snapshot.avgIndustry} | ${snapshot.dynamicWindow} | ${snapshot.simpleDynamicWindow} | ${top} |`);
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function sortTotals(totals: Record<string, FamilyTotal>): Array<[string, FamilyTotal]> {
  return Object.entries(totals)
    .sort((left, right) => Math.abs(right[1].weightedValue) - Math.abs(left[1].weightedValue));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
