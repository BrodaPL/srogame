const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

type DefenceWeaponType =
  | 'BEAM'
  | 'MISSILE'
  | 'RAIL_GUN'
  | 'ORBIT_TO_SURFACE_BOMB';

type DefenceHullClass = 'SMALL' | 'MEDIUM' | 'BIG' | 'PLANETARY_BOMB';

type DefenceBlueprint = {
  type: string;
  hullClass: DefenceHullClass;
  canShootToOrbit: boolean;
  size: number;
  criticalThreshold: number;
  shieldCapacity: number;
  armor: number;
  hullPointsCapacity: number;
  cost: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  weapons: Array<{
    type: DefenceWeaponType;
    dmg: number;
    shots: number;
  }>;
};

type DefenceBlueprintFile = {
  defences: DefenceBlueprint[];
};

type ShipWeaponType =
  | 'BEAM'
  | 'MISSILE'
  | 'RAIL_GUN'
  | 'BOMBARDMENT_WEAPONS';

type ShipHullClass = 'SMALL' | 'MEDIUM' | 'BIG' | 'TITAN' | 'STATION';

type ShipBlueprint = {
  type: string;
  hullClass: ShipHullClass;
  purposes: string[];
  criticalThreshold: number;
  shieldCapacity: number;
  armor: number;
  hullPointsCapacity: number;
  jumpCost: number;
  cost: {
    metal: number;
    crystal: number;
    deuterium: number;
  };
  weapons: Array<{
    type: ShipWeaponType;
    dmg: number;
    shots: number;
  }>;
};

type ShipBlueprintFile = {
  ships: ShipBlueprint[];
};

type BucketDefinition = {
  name: string;
  defences: string[];
};

type DefenceMetrics = {
  defence: DefenceBlueprint;
  buildCost: number;
  spaceAlpha: number;
  bombAlpha: number;
  durability: number;
  spaceAlphaPerCost: number;
  durabilityPerCost: number;
  bombAlphaPerCost: number;
};

type ShipHullBenchmark = {
  hullClass: ShipHullClass;
  averageSpaceAlphaPerOperatingCost: number;
  averageDurabilityPerOperatingCost: number;
};

const projectRoot = process.cwd();
const blueprintsDir = join(projectRoot, 'src', 'app', 'blueprints');
const defenceBlueprintPath = join(blueprintsDir, 'defence-blueprints.json');
const shipBlueprintPath = join(blueprintsDir, 'ship-blueprints.json');
const defencesDescrPath = join(blueprintsDir, 'DEFENCES_DESCR.md');

const bucketDefinitions: BucketDefinition[] = [
  {
    name: 'Orbit-Capable Planetary Defences',
    defences: [
      'LIGHT_BEAM_CANNON',
      'BEAM_CANNON',
      'HEAVY_BEAM_CANNON',
      'ORBITAL_MISSILE_LAUNCHER',
      'HEAVY_ORBITAL_MISSILE_LAUNCHER',
      'RAIL_GUN_CANNON'
    ]
  },
  {
    name: 'Surface-Only Defences',
    defences: ['SAM_SITE']
  },
  {
    name: 'Planetary Bomb Stockpile',
    defences: ['SMALL_BOMB', 'CLUSTER_BOMB', 'MEDIUM_BOMB', 'HEAVY_BOMB']
  }
];

function sumWeaponDamage<TWeaponType extends string>(
  weapons: Array<{ type: TWeaponType; dmg: number; shots: number }>,
  type: TWeaponType
): number {
  return weapons
    .filter((weapon) => weapon.type === type)
    .reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, '');
}

function calculateWeightedCost(cost: { metal: number; crystal: number; deuterium: number }): number {
  return cost.metal + (cost.crystal * 2) + (cost.deuterium * 3);
}

function calculateDefenceSpaceAlpha(defence: DefenceBlueprint): number {
  const beam = sumWeaponDamage(defence.weapons, 'BEAM');
  const missile = sumWeaponDamage(defence.weapons, 'MISSILE');
  const railGun = sumWeaponDamage(defence.weapons, 'RAIL_GUN');

  return beam + missile + (railGun * 1.4);
}

function calculateShipSpaceAlpha(ship: ShipBlueprint): number {
  const beam = sumWeaponDamage(ship.weapons, 'BEAM');
  const missile = sumWeaponDamage(ship.weapons, 'MISSILE');
  const railGun = sumWeaponDamage(ship.weapons, 'RAIL_GUN');
  const bombardment = sumWeaponDamage(ship.weapons, 'BOMBARDMENT_WEAPONS');

  return beam + missile + (railGun * 1.4) + (bombardment * 0.33);
}

function calculateDurability(
  hullPointsCapacity: number,
  shieldCapacity: number,
  armor: number,
  criticalThreshold: number
): number {
  const baseDurability = hullPointsCapacity + (shieldCapacity * 0.5);
  const armorFactor = 1 + (armor * 0.12);
  const criticalFactor = 1 + ((50 - criticalThreshold) * 0.01);
  return baseDurability * armorFactor * criticalFactor;
}

function calculateDefenceMetrics(defence: DefenceBlueprint): DefenceMetrics {
  const buildCost = calculateWeightedCost(defence.cost);
  const spaceAlpha = calculateDefenceSpaceAlpha(defence);
  const bombAlpha = sumWeaponDamage(defence.weapons, 'ORBIT_TO_SURFACE_BOMB');
  const durability = calculateDurability(
    defence.hullPointsCapacity,
    defence.shieldCapacity,
    defence.armor,
    defence.criticalThreshold
  );

  return {
    defence,
    buildCost,
    spaceAlpha,
    bombAlpha,
    durability,
    spaceAlphaPerCost: buildCost > 0 ? spaceAlpha / buildCost : 0,
    durabilityPerCost: buildCost > 0 ? durability / buildCost : 0,
    bombAlphaPerCost: buildCost > 0 ? bombAlpha / buildCost : 0
  };
}

function calculateShipBenchmarks(blueprints: ShipBlueprintFile): ShipHullBenchmark[] {
  const grouped = new Map<ShipHullClass, Array<{ space: number; durability: number; operatingCost: number }>>();

  for (const ship of blueprints.ships) {
    if (!ship.purposes.includes('MILITARY')) {
      continue;
    }

    const buildCost = calculateWeightedCost(ship.cost);
    const operatingCost = buildCost + (ship.jumpCost * 3);
    const spaceAlpha = calculateShipSpaceAlpha(ship);
    const durability = calculateDurability(
      ship.hullPointsCapacity,
      ship.shieldCapacity,
      ship.armor,
      ship.criticalThreshold
    );

    if (!grouped.has(ship.hullClass)) {
      grouped.set(ship.hullClass, []);
    }

    grouped.get(ship.hullClass)!.push({ space: spaceAlpha, durability, operatingCost });
  }

  return Array.from(grouped.entries()).map(([hullClass, values]) => {
    const averageSpaceAlphaPerOperatingCost = values.reduce((sum, value) => sum + (value.space / value.operatingCost), 0) / values.length;
    const averageDurabilityPerOperatingCost = values.reduce((sum, value) => sum + (value.durability / value.operatingCost), 0) / values.length;

    return {
      hullClass,
      averageSpaceAlphaPerOperatingCost,
      averageDurabilityPerOperatingCost
    };
  });
}

function createTable(bucket: BucketDefinition, metricsByType: Map<string, DefenceMetrics>): string {
  const lines: string[] = [];
  lines.push(`### ${bucket.name}`);
  lines.push('');
  lines.push('| Defence | Hull | Orbit Fire | Build | Space Alpha | Bomb Alpha | Durability | SpaceA/Cost | Bomb/Cost | Dur/Cost | Notes |');
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');

  for (const defenceType of bucket.defences) {
    const metrics = metricsByType.get(defenceType);
    if (!metrics) {
      continue;
    }

    const notes: string[] = [];
    if (metrics.defence.canShootToOrbit) {
      notes.push('anti-orbit');
    } else if (metrics.spaceAlpha > 0) {
      notes.push('surface/local only');
    }
    if (metrics.bombAlpha > 0) {
      notes.push('planetary bombardment');
    }

    lines.push(
      `| ${metrics.defence.type} | ${metrics.defence.hullClass} | ${metrics.defence.canShootToOrbit ? 'Yes' : 'No'} | ${formatNumber(metrics.buildCost)} | `
      + `${formatNumber(metrics.spaceAlpha)} | ${formatNumber(metrics.bombAlpha)} | ${formatNumber(metrics.durability)} | `
      + `${formatNumber(metrics.spaceAlphaPerCost)} | ${formatNumber(metrics.bombAlphaPerCost)} | ${formatNumber(metrics.durabilityPerCost)} | `
      + `${notes.join(', ')} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

function createShipBenchmarkTable(benchmarks: ShipHullBenchmark[]): string {
  const lines: string[] = [];
  lines.push('## Current Military Ship Hull Benchmarks');
  lines.push('');
  lines.push('These are pulled from the live ship blueprint file and use only ships with the `MILITARY` purpose.');
  lines.push('They use the same weighted-cost and durability formulas and serve only as comparison anchors for the "defences should be a little more effective than ships" target.');
  lines.push('');
  lines.push('| Ship Hull Class | Avg SpaceA/OpCost | Avg Dur/OpCost |');
  lines.push('| --- | ---: | ---: |');

  for (const benchmark of benchmarks.sort((a, b) => a.hullClass.localeCompare(b.hullClass))) {
    lines.push(
      `| ${benchmark.hullClass} | ${formatNumber(benchmark.averageSpaceAlphaPerOperatingCost)} | ${formatNumber(benchmark.averageDurabilityPerOperatingCost)} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

function buildMarkdown(defences: DefenceBlueprintFile, ships: ShipBlueprintFile): string {
  const metricsByType = new Map<string, DefenceMetrics>(
    defences.defences.map((defence) => [defence.type, calculateDefenceMetrics(defence)])
  );
  const shipBenchmarks = calculateShipBenchmarks(ships);

  const sections: string[] = [
    '# Planetary Defence Balance Comparison Template',
    '',
    'This file is a lightweight balance reference for `defence-blueprints.json`.',
    '',
    'The same basic weighted-cost logic is used as in the ship reference, but the markers are simpler because defences do not move, do not carry hangars, and do not pay travel cost.',
    '',
    '## Core Cost Marker',
    '',
    '```text',
    'weightedCost = metal * 1 + crystal * 2 + deuterium * 3',
    '```',
    '',
    '## Combat Markers',
    '',
    '```text',
    'spaceAlpha = beamDamage + missileDamage + railGunDamage * 1.4',
    'bombAlpha = orbitToSurfaceBombDamage',
    'durabilityScore = (hull * 1.0 + shield * 0.5) * (1 + armor * 0.12) * (1 + (50 - criticalThreshold) * 0.01)',
    '```',
    '',
    'Interpretation:',
    '',
    '- `spaceAlpha` is for defence-vs-ship combat',
    '- `bombAlpha` is only for the bomb stockpile entries',
    '- `durabilityScore` uses the same rough comparison marker as ships',
    '- `canShootToOrbit` matters a lot; surface-only entries should not be judged like orbital cannons',
    '',
    '## Main Efficiency Ratios',
    '',
    '```text',
    'spaceCombatEfficiency = spaceAlpha / weightedCost',
    'bombEfficiency = bombAlpha / weightedCost',
    'durabilityEfficiency = durabilityScore / weightedCost',
    '```',
    '',
    '## Review Rules',
    '',
    '- Orbit-capable defences should usually be a bit more efficient than comparable mobile ships',
    '- Surface-only defences and bombs should be judged by their niche, not by orbit combat',
    '- Rail-gun defences are expected to look stronger than raw damage suggests',
    '- Planetary bombs are consumable attack stockpile, not line defences',
    '',
    createShipBenchmarkTable(shipBenchmarks),
    '## Current Blueprint Calculations',
    ''
  ];

  for (const bucket of bucketDefinitions) {
    sections.push(createTable(bucket, metricsByType));
  }

  return `${sections.join('\n')}\n`;
}

const defenceBlueprintData = JSON.parse(readFileSync(defenceBlueprintPath, 'utf8')) as DefenceBlueprintFile;
const shipBlueprintData = JSON.parse(readFileSync(shipBlueprintPath, 'utf8')) as ShipBlueprintFile;
writeFileSync(defencesDescrPath, buildMarkdown(defenceBlueprintData, shipBlueprintData), 'utf8');
