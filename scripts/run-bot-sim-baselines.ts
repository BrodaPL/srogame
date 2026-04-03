import fs from 'node:fs';
import path from 'node:path';
import type { BotProfileId } from '../src/app/models/player.js';
import {
  runSimulationMatrix,
  type OverallProfileAggregateSummary,
  type ProfileComparisonSummary,
  type SimulationCliOptions,
  type SimulationPresetKey
} from './run-bot-simulations.js';

type NumericMetricKey =
  | 'avgPlanetsOwned'
  | 'avgCombatActions'
  | 'avgDiplomacyActions'
  | 'avgColonizeActions'
  | 'avgMoveActions'
  | 'avgTransportActions'
  | 'avgTotalResourceValue';

type BaselineMetricSnapshot = Record<NumericMetricKey, number>;

type BotSimulationBaselineDefinition = {
  id: string;
  description: string;
  options: {
    presetKeys: SimulationPresetKey[];
    profileFilter: BotProfileId[];
    comparePair: [BotProfileId, BotProfileId];
  };
  expected: {
    profiles: Record<BotProfileId, {
      metrics: BaselineMetricSnapshot;
      proposalStateCounts: Record<string, number>;
    }>;
    comparison: BaselineMetricSnapshot;
  };
};

type BaselineDefinitionsFile = {
  baselines: BotSimulationBaselineDefinition[];
};

type BaselineMetricDrift = {
  metric: NumericMetricKey;
  expected: number;
  actual: number;
  delta: number;
  withinTolerance: boolean;
  tolerance: number;
};

type BaselineProfileComparison = {
  profileId: BotProfileId;
  metricDrifts: BaselineMetricDrift[];
  proposalStateDrift: Record<string, number>;
};

type BaselineRunResult = {
  id: string;
  description: string;
  options: SimulationCliOptions;
  profileResults: BaselineProfileComparison[];
  comparisonMetricDrifts: BaselineMetricDrift[];
  notes: string[];
};

type BaselineComparisonSummary = {
  startedAt: string;
  finishedAt: string;
  results: BaselineRunResult[];
};

const DEFINITIONS_PATH = path.resolve(process.cwd(), 'scripts', 'bot-simulation-baselines.json');
const OUTPUT_PATH = path.resolve(process.cwd(), 'tmp', 'bot-simulation-baseline-results.json');

const METRIC_TOLERANCES: Record<NumericMetricKey, number> = {
  avgPlanetsOwned: 2,
  avgCombatActions: 1,
  avgDiplomacyActions: 6,
  avgColonizeActions: 3,
  avgMoveActions: 10,
  avgTransportActions: 6,
  avgTotalResourceValue: 5000
};

async function main(): Promise<void> {
  const definitions = loadBaselineDefinitions();
  const startedAt = new Date().toISOString();
  const results: BaselineRunResult[] = [];

  for (const baseline of definitions.baselines) {
    const runResult = await evaluateBaseline(baseline);
    results.push(runResult);
    printBaselineRunResult(runResult);
  }

  const summary: BaselineComparisonSummary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    results
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Saved advisory baseline comparison results to ${OUTPUT_PATH}`);
}

async function evaluateBaseline(
  baseline: BotSimulationBaselineDefinition
): Promise<BaselineRunResult> {
  const options: SimulationCliOptions = {
    presetKeys: baseline.options.presetKeys,
    profileFilter: baseline.options.profileFilter,
    comparePair: baseline.options.comparePair
  };
  const summary = await runSimulationMatrix(options, { logProgress: false });
  const profileResults = buildProfileResults(summary.overallProfileSummary, baseline.expected.profiles);
  const comparisonMetricDrifts = buildComparisonDrifts(summary.comparisonSummary, baseline.expected.comparison);

  return {
    id: baseline.id,
    description: baseline.description,
    options,
    profileResults,
    comparisonMetricDrifts,
    notes: [
      'Advisory-only comparison against checked-in simulation snapshots.',
      'Numeric drift uses broad tolerances intended for early tuning, not hard CI gating.'
    ]
  };
}

function loadBaselineDefinitions(): BaselineDefinitionsFile {
  const raw = fs.readFileSync(DEFINITIONS_PATH, 'utf8');
  return JSON.parse(raw) as BaselineDefinitionsFile;
}

function buildProfileResults(
  summaries: OverallProfileAggregateSummary[],
  expectedProfiles: BotSimulationBaselineDefinition['expected']['profiles']
): BaselineProfileComparison[] {
  return Object.entries(expectedProfiles).map(([profileId, expected]) => {
    const actual = summaries.find((summary) => summary.profileId === profileId) ?? null;
    if (!actual) {
      return {
        profileId: profileId as BotProfileId,
        metricDrifts: Object.keys(expected.metrics).map((metric) => ({
          metric: metric as NumericMetricKey,
          expected: expected.metrics[metric as NumericMetricKey],
          actual: Number.NaN,
          delta: Number.NaN,
          withinTolerance: false,
          tolerance: METRIC_TOLERANCES[metric as NumericMetricKey]
        })),
        proposalStateDrift: Object.fromEntries(
          Object.keys(expected.proposalStateCounts).map((state) => [state, Number.NaN])
        )
      };
    }

    return {
      profileId: profileId as BotProfileId,
      metricDrifts: buildMetricDrifts(toMetricSnapshot(actual), expected.metrics),
      proposalStateDrift: buildProposalStateDrift(actual.proposalStateCounts, expected.proposalStateCounts)
    };
  });
}

function buildComparisonDrifts(
  actual: ProfileComparisonSummary | null,
  expected: BaselineMetricSnapshot
): BaselineMetricDrift[] {
  if (!actual) {
    return Object.keys(expected).map((metric) => ({
      metric: metric as NumericMetricKey,
      expected: expected[metric as NumericMetricKey],
      actual: Number.NaN,
      delta: Number.NaN,
      withinTolerance: false,
      tolerance: METRIC_TOLERANCES[metric as NumericMetricKey]
    }));
  }

  return buildMetricDrifts(actual.deltas, expected);
}

function buildMetricDrifts(
  actual: BaselineMetricSnapshot,
  expected: BaselineMetricSnapshot
): BaselineMetricDrift[] {
  return (Object.keys(expected) as NumericMetricKey[]).map((metric) => {
    const expectedValue = expected[metric];
    const actualValue = actual[metric];
    const delta = actualValue - expectedValue;
    const tolerance = METRIC_TOLERANCES[metric];
    return {
      metric,
      expected: expectedValue,
      actual: actualValue,
      delta,
      withinTolerance: Math.abs(delta) <= tolerance,
      tolerance
    };
  });
}

function buildProposalStateDrift(
  actual: Record<string, number>,
  expected: Record<string, number>
): Record<string, number> {
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  const drift: Record<string, number> = {};
  for (const key of keys) {
    drift[key] = (actual[key] ?? 0) - (expected[key] ?? 0);
  }
  return drift;
}

function toMetricSnapshot(summary: OverallProfileAggregateSummary | ProfileComparisonSummary['deltas']): BaselineMetricSnapshot {
  return {
    avgPlanetsOwned: summary.avgPlanetsOwned,
    avgCombatActions: summary.avgCombatActions,
    avgDiplomacyActions: summary.avgDiplomacyActions,
    avgColonizeActions: summary.avgColonizeActions,
    avgMoveActions: summary.avgMoveActions,
    avgTransportActions: summary.avgTransportActions,
    avgTotalResourceValue: summary.avgTotalResourceValue
  };
}

function printBaselineRunResult(result: BaselineRunResult): void {
  console.log(`BASELINE ${result.id}`);
  for (const profileResult of result.profileResults) {
    const metricSummary = profileResult.metricDrifts
      .map((drift) =>
        `${drift.metric}=${formatSigned(drift.delta)}${drift.withinTolerance ? '' : ' !'}`
      )
      .join(' ');
    const proposalSummary = Object.entries(profileResult.proposalStateDrift)
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([state, delta]) => `${state}:${formatSigned(delta)}`)
      .join(' ');
    console.log(`  ${profileResult.profileId} ${metricSummary} proposals=${proposalSummary || 'none'}`);
  }

  const comparisonSummary = result.comparisonMetricDrifts
    .map((drift) =>
      `${drift.metric}=${formatSigned(drift.delta)}${drift.withinTolerance ? '' : ' !'}`
    )
    .join(' ');
  console.log(`  compare ${comparisonSummary}`);
}

function formatSigned(value: number): string {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }

  return `${value > 0 ? '+' : ''}${value.toFixed(2)}`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
