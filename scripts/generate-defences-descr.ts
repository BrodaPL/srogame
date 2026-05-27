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
  | 'BOMBARDMENT_WEAPONS'
  | 'REPAIR_EQUIPMENT'
  | 'RECYCLE_EQUIPMENT';

type ShipHullClass = 'SMALL' | 'MEDIUM' | 'BIG' | 'TITAN' | 'STATION';

type ShipBlueprint = {
  type: string;
  hullClass: ShipHullClass;
  purposes: string[];
  evasionChance: number;
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

type DefenceMetrics = {
  defence: DefenceBlueprint;
  buildCost: number;
  orbitFireAlpha: number;
  localAntiBomberAlpha: number;
  bombPayloadAlpha: number;
  antiDefenceBattleBombAlpha: number;
  nonRailEhpToCrit: number;
  nonRailEhpToZero: number;
  railEhpToCrit: number;
  railEhpToZero: number;
  criticalHull: number;
  orbitFirePerCost: number;
  localAntiBomberPerCost: number;
  antiDefenceBattleBombPerCost: number;
  nonRailEhpPerCost: number;
};

type ShipHullBenchmark = {
  hullClass: ShipHullClass;
  averageShipAlphaPerOperatingCost: number;
  averageNonRailEhpPerOperatingCost: number;
};

const projectRoot = process.cwd();
const blueprintsDir = join(projectRoot, 'src', 'app', 'blueprints');
const defenceBlueprintPath = join(blueprintsDir, 'defence-blueprints.json');
const shipBlueprintPath = join(blueprintsDir, 'ship-blueprints.json');
const defencesDescrPath = join(blueprintsDir, 'DEFENCES_DESCR.md');

const BOMBARDMENT_SHIP_HIT_CHANCE = 0.1;

const defenceOrder = [
  'LIGHT_BEAM_CANNON',
  'BEAM_CANNON',
  'HEAVY_BEAM_CANNON',
  'SAM_SITE',
  'ORBITAL_MISSILE_LAUNCHER',
  'HEAVY_ORBITAL_MISSILE_LAUNCHER',
  'RAIL_GUN_CANNON',
  'SMALL_BOMB',
  'CLUSTER_BOMB',
  'MEDIUM_BOMB',
  'HEAVY_BOMB'
];

function sumWeaponDamage<TWeaponType extends string>(
  weapons: Array<{ type: TWeaponType; dmg: number; shots: number }>,
  type: TWeaponType
): number {
  return weapons
    .filter((weapon) => weapon.type === type)
    .reduce((sum, weapon) => sum + Math.max(0, weapon.dmg) * Math.max(0, Math.floor(weapon.shots)), 0);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Math.abs(value) >= 100) {
    return String(Math.round(value));
  }

  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(3).replace(/\.?0+$/, '');
}

function calculateWeightedCost(cost: { metal: number; crystal: number; deuterium: number }): number {
  return cost.metal + cost.crystal * 2 + cost.deuterium * 3;
}

function calculateDefenceFire(defence: DefenceBlueprint): number {
  return sumWeaponDamage(defence.weapons, 'BEAM')
    + sumWeaponDamage(defence.weapons, 'MISSILE')
    + sumWeaponDamage(defence.weapons, 'RAIL_GUN');
}

function calculateOrbitFireAlpha(defence: DefenceBlueprint): number {
  return defence.canShootToOrbit ? calculateDefenceFire(defence) : 0;
}

function calculateLocalAntiBomberAlpha(defence: DefenceBlueprint): number {
  return defence.canShootToOrbit ? 0 : calculateDefenceFire(defence);
}

function calculateBombPayloadAlpha(defence: DefenceBlueprint): number {
  return sumWeaponDamage(defence.weapons, 'ORBIT_TO_SURFACE_BOMB');
}

function calculateAntiDefenceBattleBombAlpha(defence: DefenceBlueprint): number {
  if (defence.hullClass !== 'PLANETARY_BOMB' || defence.size !== 1) {
    return 0;
  }

  return calculateBombPayloadAlpha(defence);
}

function criticalHull(defence: DefenceBlueprint): number {
  return defence.hullPointsCapacity * (defence.criticalThreshold / 100);
}

function calculateNonRailEhpToCrit(defence: DefenceBlueprint): number {
  const protectedHull = Math.max(0, defence.hullPointsCapacity - criticalHull(defence));
  return defence.shieldCapacity + protectedHull * 2;
}

function calculateNonRailEhpToZero(defence: DefenceBlueprint): number {
  return defence.shieldCapacity + defence.hullPointsCapacity * 2;
}

function calculateRailEhpToCrit(defence: DefenceBlueprint): number {
  return Math.max(0, defence.hullPointsCapacity - criticalHull(defence));
}

function calculateRailEhpToZero(defence: DefenceBlueprint): number {
  return defence.hullPointsCapacity;
}

function calculateDefenceMetrics(defence: DefenceBlueprint): DefenceMetrics {
  const buildCost = calculateWeightedCost(defence.cost);
  const orbitFireAlpha = calculateOrbitFireAlpha(defence);
  const localAntiBomberAlpha = calculateLocalAntiBomberAlpha(defence);
  const antiDefenceBattleBombAlpha = calculateAntiDefenceBattleBombAlpha(defence);
  const nonRailEhpToZero = calculateNonRailEhpToZero(defence);

  return {
    defence,
    buildCost,
    orbitFireAlpha,
    localAntiBomberAlpha,
    bombPayloadAlpha: calculateBombPayloadAlpha(defence),
    antiDefenceBattleBombAlpha,
    nonRailEhpToCrit: calculateNonRailEhpToCrit(defence),
    nonRailEhpToZero,
    railEhpToCrit: calculateRailEhpToCrit(defence),
    railEhpToZero: calculateRailEhpToZero(defence),
    criticalHull: criticalHull(defence),
    orbitFirePerCost: buildCost > 0 ? orbitFireAlpha / buildCost : 0,
    localAntiBomberPerCost: buildCost > 0 ? localAntiBomberAlpha / buildCost : 0,
    antiDefenceBattleBombPerCost: buildCost > 0 ? antiDefenceBattleBombAlpha / buildCost : 0,
    nonRailEhpPerCost: buildCost > 0 ? nonRailEhpToZero / buildCost : 0
  };
}

function calculateShipAlpha(ship: ShipBlueprint): number {
  const normalShipFire = sumWeaponDamage(ship.weapons, 'BEAM')
    + sumWeaponDamage(ship.weapons, 'MISSILE')
    + sumWeaponDamage(ship.weapons, 'RAIL_GUN');
  const expectedBombardmentVsShips =
    sumWeaponDamage(ship.weapons, 'BOMBARDMENT_WEAPONS') * BOMBARDMENT_SHIP_HIT_CHANCE;

  return normalShipFire + expectedBombardmentVsShips;
}

function hitChance(ship: ShipBlueprint): number {
  return Math.max(0.01, 1 - Math.max(0, Math.min(0.99, ship.evasionChance)));
}

function calculateShipNonRailEhpToZero(ship: ShipBlueprint): number {
  return (ship.shieldCapacity + ship.hullPointsCapacity * 2) / hitChance(ship);
}

function calculateShipBenchmarks(blueprints: ShipBlueprintFile): ShipHullBenchmark[] {
  const grouped = new Map<ShipHullClass, Array<{ alpha: number; durability: number; operatingCost: number }>>();

  for (const ship of blueprints.ships) {
    if (!ship.purposes.includes('MILITARY')) {
      continue;
    }

    const buildCost = calculateWeightedCost(ship.cost);
    const operatingCost = buildCost + ship.jumpCost * 3;
    if (operatingCost <= 0) {
      continue;
    }

    if (!grouped.has(ship.hullClass)) {
      grouped.set(ship.hullClass, []);
    }

    grouped.get(ship.hullClass)!.push({
      alpha: calculateShipAlpha(ship),
      durability: calculateShipNonRailEhpToZero(ship),
      operatingCost
    });
  }

  return Array.from(grouped.entries()).map(([hullClass, values]) => {
    const averageShipAlphaPerOperatingCost =
      values.reduce((sum, value) => sum + value.alpha / value.operatingCost, 0) / values.length;
    const averageNonRailEhpPerOperatingCost =
      values.reduce((sum, value) => sum + value.durability / value.operatingCost, 0) / values.length;

    return {
      hullClass,
      averageShipAlphaPerOperatingCost,
      averageNonRailEhpPerOperatingCost
    };
  });
}

function targetingLabel(defence: DefenceBlueprint, metrics: DefenceMetrics): string {
  if (defence.canShootToOrbit) {
    return 'all orbit ships';
  }

  if (metrics.localAntiBomberAlpha > 0) {
    return 'small bombers only';
  }

  if (defence.hullClass === 'PLANETARY_BOMB') {
    return defence.size === 1 ? 'anti-defence or building bomb' : 'building bomb';
  }

  return '-';
}

function createTable(title: string, defences: DefenceMetrics[]): string {
  const lines: string[] = [];
  lines.push(`### ${title}`);
  lines.push('');
  lines.push('| Defence | Hull | Targeting | Build | Hull/Sh/Arm | Crit Hull | Orbit Fire | Local Anti-Bomber | Ground Bomb Payload | Anti-Def Battle Bomb | NonRail EHP0 | Rail EHP0 | Orbit/Cost | Local/Cost | AntiDefBomb/Cost | EHP/Cost | Notes |');
  lines.push('| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');

  for (const metrics of defences) {
    const defence = metrics.defence;
    const notes: string[] = [];

    if (defence.canShootToOrbit) {
      notes.push('anti-orbit');
    } else if (metrics.localAntiBomberAlpha > 0) {
      notes.push('surface/local interception');
    }

    if (defence.hullClass === 'PLANETARY_BOMB') {
      notes.push(defence.size === 1
        ? 'can hit defences in space battle and buildings in bombardment'
        : 'building-focused bombardment payload');
    }

    if (sumWeaponDamage(defence.weapons, 'RAIL_GUN') > 0) {
      notes.push('rail ignores shield and armor');
    }

    lines.push(
      `| ${defence.type} | ${defence.hullClass} | ${targetingLabel(defence, metrics)} | ${formatNumber(metrics.buildCost)} | `
      + `${formatNumber(defence.hullPointsCapacity)}/${formatNumber(defence.shieldCapacity)}/${formatNumber(defence.armor)} | `
      + `${formatNumber(metrics.criticalHull)} | ${formatNumber(metrics.orbitFireAlpha)} | ${formatNumber(metrics.localAntiBomberAlpha)} | `
      + `${formatNumber(metrics.bombPayloadAlpha)} | ${formatNumber(metrics.antiDefenceBattleBombAlpha)} | `
      + `${formatNumber(metrics.nonRailEhpToZero)} | ${formatNumber(metrics.railEhpToZero)} | ${formatNumber(metrics.orbitFirePerCost)} | `
      + `${formatNumber(metrics.localAntiBomberPerCost)} | ${formatNumber(metrics.antiDefenceBattleBombPerCost)} | ${formatNumber(metrics.nonRailEhpPerCost)} | `
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
  lines.push('They use the same battle-aware alpha and non-rail EHP markers as the defence tables.');
  lines.push('');
  lines.push('| Ship Hull Class | Avg ShipAlpha/OpCost | Avg NonRailEHP/OpCost |');
  lines.push('| --- | ---: | ---: |');

  for (const benchmark of benchmarks.sort((a, b) => a.hullClass.localeCompare(b.hullClass))) {
    lines.push(
      `| ${benchmark.hullClass} | ${formatNumber(benchmark.averageShipAlphaPerOperatingCost)} | ${formatNumber(benchmark.averageNonRailEhpPerOperatingCost)} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

function createWatchlist(metrics: DefenceMetrics[], shipBenchmarks: ShipHullBenchmark[]): string {
  const lines: string[] = ['## Automated Balance Watchlist', ''];
  const averageShipAlphaBenchmark = shipBenchmarks.length > 0
    ? shipBenchmarks.reduce((sum, entry) => sum + entry.averageShipAlphaPerOperatingCost, 0) / shipBenchmarks.length
    : 0;

  let notes = 0;
  for (const metric of metrics) {
    const defence = metric.defence;
    if (
      defence.canShootToOrbit
      && averageShipAlphaBenchmark > 0
      && metric.orbitFirePerCost >= averageShipAlphaBenchmark * 1.6
    ) {
      lines.push(`- ${defence.type}: high orbit-fire efficiency compared with military ship averages (${formatNumber(metric.orbitFirePerCost)} vs ${formatNumber(averageShipAlphaBenchmark)}).`);
      notes += 1;
    }

    if (!defence.canShootToOrbit && metric.localAntiBomberAlpha > 0) {
      lines.push(`- ${defence.type}: live targeting is narrow; it can only shoot SMALL ships that carry bombardment weapons.`);
      notes += 1;
    }

    if (defence.hullClass === 'PLANETARY_BOMB' && defence.size !== 1 && metric.bombPayloadAlpha > 0) {
      lines.push(`- ${defence.type}: building-focused bomb payload ${formatNumber(metric.bombPayloadAlpha)}; it is intentionally skipped by the size-1 anti-defence space-battle bomb step.`);
      notes += 1;
    }
  }

  if (notes <= 0) {
    lines.push('No large ratio or live-rule outliers were detected by the simple checks.');
  }

  lines.push('');
  return lines.join('\n');
}

function buildMarkdown(defences: DefenceBlueprintFile, ships: ShipBlueprintFile): string {
  const metricsByType = new Map<string, DefenceMetrics>(
    defences.defences.map((defence) => [defence.type, calculateDefenceMetrics(defence)])
  );
  const shipBenchmarks = calculateShipBenchmarks(ships);
  const orderedMetrics = defenceOrder
    .map((type) => metricsByType.get(type))
    .filter((metrics): metrics is DefenceMetrics => Boolean(metrics));
  const orbitCapableDefences = orderedMetrics.filter(
    (metrics) => metrics.defence.hullClass !== 'PLANETARY_BOMB' && metrics.defence.canShootToOrbit
  );
  const surfaceOnlyDefences = orderedMetrics.filter(
    (metrics) => metrics.defence.hullClass !== 'PLANETARY_BOMB' && !metrics.defence.canShootToOrbit
  );
  const bombStockpile = orderedMetrics.filter(
    (metrics) => metrics.defence.hullClass === 'PLANETARY_BOMB'
  );

  const sections: string[] = [
    '# Planetary Defence Battle Balance Reference',
    '',
    'This file is generated from `defence-blueprints.json` by `scripts/generate-defences-descr.ts`.',
    'The formulas below mirror the live space battle resolver in `src/app/models/battles/space-battle-resolver.ts` at the blueprint, no-tech level.',
    '',
    '## Live Battle Rules Captured',
    '',
    '- Defences participate in the same 4-round space battle loop as ships.',
    '- Orbit-capable defences can target all ship hull classes.',
    '- Surface-only defences can target only `SMALL` ships that carry `BOMBARDMENT_WEAPONS`.',
    '- Defences cannot shoot other defences in normal space combat.',
    '- Ships can damage defences only with `BOMBARDMENT_WEAPONS`.',
    '- `BOMBARDMENT_WEAPONS` always hit defences once fired.',
    '- `RAIL_GUN` applies full damage directly to hull and ignores shield and armor.',
    '- Other weapons remove shield first, then only half of spillover can become hull damage.',
    '- Armor is subtracted from hull spillover; missiles subtract double armor.',
    '- Current planetary bomb activation inside the space battle resolver only considers size-1 planetary bombs for anti-defence battle damage.',
    '- Bombard and Siege building bombardment use all carried planetary bomb sizes through `applyBuildingBombardment(...)`.',
    '',
    '## Cost And Output Markers',
    '',
    '```text',
    'weightedCost = metal * 1 + crystal * 2 + deuterium * 3',
    'orbitFireAlpha = beamDamage + missileDamage + railGunDamage, only when canShootToOrbit',
    'localAntiBomberAlpha = beamDamage + missileDamage + railGunDamage, only for surface-only local anti-bomber fire',
    'groundBombPayloadAlpha = orbitToSurfaceBombDamage',
    'antiDefenceBattleBombAlpha = groundBombPayloadAlpha only for size-1 planetary bombs',
    '```',
    '',
    '## Durability Markers',
    '',
    '```text',
    'criticalHull = hullPointsCapacity * criticalThreshold / 100',
    'nonRailEhpToZero = shieldCapacity + hullPointsCapacity * 2',
    'railEhpToZero = hullPointsCapacity',
    '```',
    '',
    'The non-rail marker reflects the live half-spillover rule. Armor is reported separately because its value depends on enemy shot size and weapon type.',
    '',
    createShipBenchmarkTable(shipBenchmarks),
    createWatchlist(orderedMetrics, shipBenchmarks),
    '## Current Blueprint Calculations',
    ''
  ];

  sections.push(createTable('Orbit-Capable Planetary Defences', orbitCapableDefences));
  sections.push(createTable('Surface-Only Defences', surfaceOnlyDefences));
  sections.push(createTable('Planetary Bomb Stockpile', bombStockpile));

  return `${sections.join('\n')}\n`;
}

const defenceBlueprintData = JSON.parse(readFileSync(defenceBlueprintPath, 'utf8')) as DefenceBlueprintFile;
const shipBlueprintData = JSON.parse(readFileSync(shipBlueprintPath, 'utf8')) as ShipBlueprintFile;
writeFileSync(defencesDescrPath, buildMarkdown(defenceBlueprintData, shipBlueprintData), 'utf8');
