const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

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
  canJump: boolean;
  size: number;
  evasionChance: number;
  criticalThreshold: number;
  shieldCapacity: number;
  armor: number;
  hullPointsCapacity: number;
  cargoCapacity: number;
  hangarCapacity: number;
  jumpCost: number;
  purposes: string[];
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
  ships: string[];
};

type HangarLoad = {
  addedAlpha: number;
  addedCost: number;
  label: string;
};

type ShipMetrics = {
  ship: ShipBlueprint;
  buildCost: number;
  travelCost: number;
  operatingCost: number;
  normalShipFire: number;
  railFire: number;
  expectedBombardmentVsShips: number;
  shipAlpha: number;
  loadedShipAlpha: number;
  loadedCost: number;
  antiDefenceAlpha: number;
  nonRailEhpToCrit: number;
  nonRailEhpToZero: number;
  railEhpToCrit: number;
  railEhpToZero: number;
  criticalHull: number;
  hangarLoadLabel: string;
  shipAlphaPerOperatingCost: number;
  loadedAlphaPerLoadedCost: number;
  antiDefenceAlphaPerOperatingCost: number;
  nonRailEhpPerOperatingCost: number;
  cargoPerOperatingCost: number;
};

const projectRoot = process.cwd();
const blueprintsDir = join(projectRoot, 'src', 'app', 'blueprints');
const shipBlueprintPath = join(blueprintsDir, 'ship-blueprints.json');
const shipsDescrPath = join(blueprintsDir, 'SHIPS_DESCR.md');

const BOMBARDMENT_SHIP_HIT_CHANCE = 0.1;

const bucketDefinitions: BucketDefinition[] = [
  {
    name: 'Small Combat And Local Assault',
    ships: ['FIGHTER', 'ASSAULT_FIGHTER', 'ATMOSPHERIC_FIGHTER', 'ATMOSPHERIC_BOMBER', 'CORVETTE']
  },
  {
    name: 'Medium Combat',
    ships: ['CRUISER', 'BATTLE_SHIP', 'FRIGATE']
  },
  {
    name: 'Big Combat And Siege',
    ships: ['BATTLE_CRUISER', 'DESTROYER', 'DREADNOUGHT', 'ORBITAL_BOMBER']
  },
  {
    name: 'Logistics And Support',
    ships: ['SPY_PROBE', 'REPAIR_DRONE', 'RECYCLER', 'TRANSPORTER', 'CARGO_SUPPORT', 'MASS_HAULER', 'CARRIER', 'COLONIZER']
  },
  {
    name: 'Titan And Prestige',
    ships: ['TITAN', 'ARMAGEDDON_BOMBER', 'BEHEMOTH', 'FLEET_CARRIER', 'MOTHER_SHIP']
  }
];

function sumWeaponDamage(weapons: ShipBlueprint['weapons'], type: ShipWeaponType): number {
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

function calculateWeightedCost(cost: ShipBlueprint['cost']): number {
  return cost.metal + cost.crystal * 2 + cost.deuterium * 3;
}

function calculateTravelCost(ship: ShipBlueprint): number {
  return ship.jumpCost * 3;
}

function calculateNormalShipFire(ship: ShipBlueprint): number {
  return sumWeaponDamage(ship.weapons, 'BEAM')
    + sumWeaponDamage(ship.weapons, 'MISSILE')
    + sumWeaponDamage(ship.weapons, 'RAIL_GUN');
}

function calculateExpectedBombardmentVsShips(ship: ShipBlueprint): number {
  return sumWeaponDamage(ship.weapons, 'BOMBARDMENT_WEAPONS') * BOMBARDMENT_SHIP_HIT_CHANCE;
}

function calculateShipAlpha(ship: ShipBlueprint): number {
  return calculateNormalShipFire(ship) + calculateExpectedBombardmentVsShips(ship);
}

function calculateAntiDefenceAlpha(ship: ShipBlueprint): number {
  return sumWeaponDamage(ship.weapons, 'BOMBARDMENT_WEAPONS');
}

function hitChance(ship: ShipBlueprint): number {
  return Math.max(0.01, 1 - Math.max(0, Math.min(0.99, ship.evasionChance)));
}

function criticalHull(ship: ShipBlueprint): number {
  return ship.hullPointsCapacity * (ship.criticalThreshold / 100);
}

function calculateNonRailEhpToCrit(ship: ShipBlueprint): number {
  const protectedHull = Math.max(0, ship.hullPointsCapacity - criticalHull(ship));
  return (ship.shieldCapacity + protectedHull * 2) / hitChance(ship);
}

function calculateNonRailEhpToZero(ship: ShipBlueprint): number {
  return (ship.shieldCapacity + ship.hullPointsCapacity * 2) / hitChance(ship);
}

function calculateRailEhpToCrit(ship: ShipBlueprint): number {
  return Math.max(0, ship.hullPointsCapacity - criticalHull(ship)) / hitChance(ship);
}

function calculateRailEhpToZero(ship: ShipBlueprint): number {
  return ship.hullPointsCapacity / hitChance(ship);
}

function createHangarLoadCalculator(shipsByType: Map<string, ShipBlueprint>) {
  const candidates = [...shipsByType.values()]
    .filter((ship) =>
      ship.hullClass === 'SMALL'
      && ship.size > 0
      && ship.purposes.includes('MILITARY')
      && ship.hangarCapacity <= 0
      && calculateShipAlpha(ship) > 0
    )
    .sort((left, right) => calculateShipAlpha(right) - calculateShipAlpha(left));

  if (candidates.length <= 0) {
    throw new Error('No small military ship candidates found for hangar packing.');
  }

  return {
    candidates,
    calculate(capacity: number): HangarLoad {
      const normalizedCapacity = Math.max(0, Math.floor(capacity));
      const best: Array<HangarLoad & { counts: Map<string, number> }> = Array.from(
        { length: normalizedCapacity + 1 },
        () => ({ addedAlpha: 0, addedCost: 0, label: '-', counts: new Map<string, number>() })
      );

      for (let size = 1; size <= normalizedCapacity; size += 1) {
        for (const candidate of candidates) {
          if (candidate.size > size) {
            continue;
          }

          const previous = best[size - candidate.size];
          const candidateAlpha = previous.addedAlpha + calculateShipAlpha(candidate);
          const candidateCost = previous.addedCost + calculateWeightedCost(candidate.cost);
          const current = best[size];
          if (
            candidateAlpha > current.addedAlpha
            || (candidateAlpha === current.addedAlpha && candidateCost < current.addedCost)
          ) {
            const counts = new Map(previous.counts);
            counts.set(candidate.type, (counts.get(candidate.type) ?? 0) + 1);
            best[size] = {
              addedAlpha: candidateAlpha,
              addedCost: candidateCost,
              label: '-',
              counts
            };
          }
        }
      }

      const load = best[normalizedCapacity];
      const label = [...load.counts.entries()]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([type, amount]) => `${amount}x ${type}`)
        .join(' + ');

      return {
        addedAlpha: load.addedAlpha,
        addedCost: load.addedCost,
        label: label || '-'
      };
    }
  };
}

function calculateShipMetrics(
  ship: ShipBlueprint,
  hangarLoadCalculator: ReturnType<typeof createHangarLoadCalculator>
): ShipMetrics {
  const buildCost = calculateWeightedCost(ship.cost);
  const travelCost = calculateTravelCost(ship);
  const operatingCost = buildCost + travelCost;
  const shipAlpha = calculateShipAlpha(ship);
  const hangarLoad = hangarLoadCalculator.calculate(ship.hangarCapacity);
  const loadedCost = operatingCost + hangarLoad.addedCost;
  const loadedShipAlpha = shipAlpha + hangarLoad.addedAlpha;
  const antiDefenceAlpha = calculateAntiDefenceAlpha(ship);
  const nonRailEhpToZero = calculateNonRailEhpToZero(ship);

  return {
    ship,
    buildCost,
    travelCost,
    operatingCost,
    normalShipFire: calculateNormalShipFire(ship),
    railFire: sumWeaponDamage(ship.weapons, 'RAIL_GUN'),
    expectedBombardmentVsShips: calculateExpectedBombardmentVsShips(ship),
    shipAlpha,
    loadedShipAlpha,
    loadedCost,
    antiDefenceAlpha,
    nonRailEhpToCrit: calculateNonRailEhpToCrit(ship),
    nonRailEhpToZero,
    railEhpToCrit: calculateRailEhpToCrit(ship),
    railEhpToZero: calculateRailEhpToZero(ship),
    criticalHull: criticalHull(ship),
    hangarLoadLabel: hangarLoad.label,
    shipAlphaPerOperatingCost: operatingCost > 0 ? shipAlpha / operatingCost : 0,
    loadedAlphaPerLoadedCost: loadedCost > 0 ? loadedShipAlpha / loadedCost : 0,
    antiDefenceAlphaPerOperatingCost: operatingCost > 0 ? antiDefenceAlpha / operatingCost : 0,
    nonRailEhpPerOperatingCost: operatingCost > 0 ? nonRailEhpToZero / operatingCost : 0,
    cargoPerOperatingCost: operatingCost > 0 ? ship.cargoCapacity / operatingCost : 0
  };
}

function median(values: number[]): number {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (sorted.length <= 0) {
    return 0;
  }

  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }

  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function createBucketWatchlist(bucket: BucketDefinition, metricsByType: Map<string, ShipMetrics>): string[] {
  const metrics = bucket.ships
    .map((type) => metricsByType.get(type))
    .filter((entry): entry is ShipMetrics => Boolean(entry));
  const combatMetrics = metrics.filter((entry) => entry.shipAlpha > 0 || entry.antiDefenceAlpha > 0);
  const shipAlphaMedian = median(combatMetrics.map((entry) => entry.shipAlphaPerOperatingCost));
  const durabilityMedian = median(combatMetrics.map((entry) => entry.nonRailEhpPerOperatingCost));
  const notes: string[] = [];

  for (const entry of combatMetrics) {
    if (shipAlphaMedian > 0 && entry.shipAlphaPerOperatingCost >= shipAlphaMedian * 1.6) {
      const localDisposableNote = !entry.ship.canJump && entry.ship.hullClass === 'SMALL'
        ? ' This is expected for cheap local disposable craft, but still worth tracking.'
        : '';
      notes.push(`${entry.ship.type}: high ship-alpha efficiency in ${bucket.name} (${formatNumber(entry.shipAlphaPerOperatingCost)} vs median ${formatNumber(shipAlphaMedian)}).${localDisposableNote}`);
    }

    if (
      entry.ship.purposes.includes('MILITARY')
      && entry.antiDefenceAlpha <= 0
      && shipAlphaMedian > 0
      && entry.shipAlphaPerOperatingCost <= shipAlphaMedian * 0.45
    ) {
      notes.push(`${entry.ship.type}: low ship-alpha efficiency for a military hull (${formatNumber(entry.shipAlphaPerOperatingCost)} vs median ${formatNumber(shipAlphaMedian)}).`);
    }

    if (durabilityMedian > 0 && entry.nonRailEhpPerOperatingCost >= durabilityMedian * 1.6) {
      notes.push(`${entry.ship.type}: high non-rail durability efficiency (${formatNumber(entry.nonRailEhpPerOperatingCost)} vs median ${formatNumber(durabilityMedian)}).`);
    }

    if (entry.antiDefenceAlpha > 0 && entry.shipAlpha <= entry.antiDefenceAlpha * 0.2) {
      notes.push(`${entry.ship.type}: bomber-specialist profile; low ship combat is expected because normal ship combat only gets the live 10% bombardment hit chance.`);
    }

    if (!entry.ship.canJump && entry.operatingCost > 0 && !entry.ship.purposes.includes('UTILITY')) {
      notes.push(`${entry.ship.type}: local-only hull; good efficiency may be acceptable because it needs carriers or local production.`);
    }
  }

  return notes;
}

function createWatchlist(metricsByType: Map<string, ShipMetrics>): string {
  const lines: string[] = ['## Automated Balance Watchlist', ''];
  const notes = bucketDefinitions.flatMap((bucket) => createBucketWatchlist(bucket, metricsByType));

  if (notes.length <= 0) {
    lines.push('No large ratio outliers were detected by the simple bucket checks.');
  } else {
    for (const note of notes) {
      lines.push(`- ${note}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

function createTable(bucket: BucketDefinition, metricsByType: Map<string, ShipMetrics>): string {
  const lines: string[] = [];
  lines.push(`### ${bucket.name}`);
  lines.push('');
  lines.push('| Ship | Build | Travel | OpCost | Hull/Sh/Arm | Evade | Crit Hull | Normal Fire | Rail | Bomb vs Ship | Ship Alpha | Anti-Def | Loaded Alpha | Loaded Cost | Hangar Load | NonRail EHP0 | Rail EHP0 | ShipA/Op | LoadedA/Cost | AntiDef/Op | Cargo/Op | Notes |');
  lines.push('| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');

  for (const shipType of bucket.ships) {
    const metrics = metricsByType.get(shipType);
    if (!metrics) {
      continue;
    }

    const ship = metrics.ship;
    const notes = [
      ship.canJump ? 'jump' : 'local',
      ...ship.purposes
    ].join(', ');

    lines.push(
      `| ${ship.type} | ${formatNumber(metrics.buildCost)} | ${formatNumber(metrics.travelCost)} | ${formatNumber(metrics.operatingCost)} | `
      + `${formatNumber(ship.hullPointsCapacity)}/${formatNumber(ship.shieldCapacity)}/${formatNumber(ship.armor)} | `
      + `${formatNumber(ship.evasionChance)} | ${formatNumber(metrics.criticalHull)} | ${formatNumber(metrics.normalShipFire)} | `
      + `${formatNumber(metrics.railFire)} | ${formatNumber(metrics.expectedBombardmentVsShips)} | ${formatNumber(metrics.shipAlpha)} | `
      + `${formatNumber(metrics.antiDefenceAlpha)} | ${formatNumber(metrics.loadedShipAlpha)} | ${formatNumber(metrics.loadedCost)} | ${metrics.hangarLoadLabel} | `
      + `${formatNumber(metrics.nonRailEhpToZero)} | ${formatNumber(metrics.railEhpToZero)} | ${formatNumber(metrics.shipAlphaPerOperatingCost)} | `
      + `${formatNumber(metrics.loadedAlphaPerLoadedCost)} | ${formatNumber(metrics.antiDefenceAlphaPerOperatingCost)} | ${formatNumber(metrics.cargoPerOperatingCost)} | ${notes} |`
    );
  }

  lines.push('');
  return lines.join('\n');
}

function buildMarkdown(blueprints: ShipBlueprintFile): string {
  const shipsByType = new Map(blueprints.ships.map((ship) => [ship.type, ship]));
  const hangarLoadCalculator = createHangarLoadCalculator(shipsByType);
  const metricsByType = new Map<string, ShipMetrics>(
    blueprints.ships.map((ship) => [ship.type, calculateShipMetrics(ship, hangarLoadCalculator)])
  );

  const hangarCandidateLines = hangarLoadCalculator.candidates
    .map((ship) => `- ${ship.type}: size ${ship.size}, shipAlpha ${formatNumber(calculateShipAlpha(ship))}, weighted cost ${formatNumber(calculateWeightedCost(ship.cost))}`)
    .join('\n');

  const sections: string[] = [
    '# Ship Battle Balance Reference',
    '',
    'This file is generated from `ship-blueprints.json` by `scripts/generate-ships-descr.ts`.',
    'The formulas below mirror the live space battle resolver in `src/app/models/battles/space-battle-resolver.ts` at the blueprint, no-tech level.',
    '',
    '## Live Battle Rules Captured',
    '',
    '- Battles run for up to 4 rounds.',
    '- Every living unit refills all combat weapon shots each round.',
    '- `BEAM`, `MISSILE`, and `RAIL_GUN` can hit ships; ships can hit defences only with `BOMBARDMENT_WEAPONS`.',
    '- `BOMBARDMENT_WEAPONS` have a 10% hit chance against ships and a 100% hit chance against defences.',
    '- Target evasion applies to non-bombardment ship targets. Defences have no evasion.',
    '- `RAIL_GUN` applies full damage directly to hull and ignores shield and armor.',
    '- Other weapons remove shield first, then only half of spillover can become hull damage.',
    '- Armor is subtracted from hull spillover; missiles subtract double armor.',
    '- Critical destruction is checked only after hull damage in a round. Below the critical hull threshold, destruction chance scales with missing hull inside that critical band.',
    '',
    '## Cost And Output Markers',
    '',
    '```text',
    'weightedCost = metal * 1 + crystal * 2 + deuterium * 3',
    'travelCost = jumpCost * 3',
    'operatingCost = weightedCost + travelCost',
    'normalShipFire = beamDamage + missileDamage + railGunDamage',
    'bombVsShip = bombardmentDamage * 0.1',
    'shipAlpha = normalShipFire + bombVsShip',
    'antiDefenceAlpha = bombardmentDamage',
    '```',
    '',
    'Important: `shipAlpha` is an outgoing pressure marker before shield, armor, random target choice, and critical rolls. It is intentionally not a full simulator.',
    '',
    '## Durability Markers',
    '',
    '```text',
    'hitChanceAgainstShip = 1 - evasionChance',
    'criticalHull = hullPointsCapacity * criticalThreshold / 100',
    'nonRailEhpToZero = (shieldCapacity + hullPointsCapacity * 2) / hitChanceAgainstShip',
    'railEhpToZero = hullPointsCapacity / hitChanceAgainstShip',
    '```',
    '',
    'The non-rail marker reflects the live half-spillover rule. Armor is not baked into EHP because its value depends heavily on enemy shot size and weapon type.',
    '',
    '## Hangar Loading',
    '',
    'Loaded carrier alpha uses whole-ship packing with the current best small military ships under the same `shipAlpha` formula:',
    '',
    hangarCandidateLines,
    '',
    createWatchlist(metricsByType),
    '## Current Blueprint Calculations',
    ''
  ];

  for (const bucket of bucketDefinitions) {
    sections.push(createTable(bucket, metricsByType));
  }

  return `${sections.join('\n')}\n`;
}

const blueprintData = JSON.parse(readFileSync(shipBlueprintPath, 'utf8')) as ShipBlueprintFile;
writeFileSync(shipsDescrPath, buildMarkdown(blueprintData), 'utf8');
