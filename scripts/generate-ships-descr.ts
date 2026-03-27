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

type ShipMetrics = {
  ship: ShipBlueprint;
  buildCost: number;
  travelCost: number;
  operatingCost: number;
  baseAlpha: number;
  loadedAlpha: number;
  loadedCost: number;
  hangarLoadLabel: string;
  durability: number;
  siege: number;
  cargo: number;
  hangar: number;
  baseAlphaPerOperatingCost: number;
  loadedAlphaPerLoadedCost: number;
  cargoPerOperatingCost: number;
};

const projectRoot = process.cwd();
const blueprintsDir = join(projectRoot, 'src', 'app', 'blueprints');
const shipBlueprintPath = join(blueprintsDir, 'ship-blueprints.json');
const shipsDescrPath = join(blueprintsDir, 'SHIPS_DESCR.md');

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
    .reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(2).replace(/\.?0+$/, '');
}

function calculateWeightedCost(ship: ShipBlueprint): number {
  return ship.cost.metal + (ship.cost.crystal * 2) + (ship.cost.deuterium * 3);
}

function calculateSpaceAlpha(ship: ShipBlueprint): number {
  const beam = sumWeaponDamage(ship.weapons, 'BEAM');
  const missile = sumWeaponDamage(ship.weapons, 'MISSILE');
  const railGun = sumWeaponDamage(ship.weapons, 'RAIL_GUN');
  const bombardment = sumWeaponDamage(ship.weapons, 'BOMBARDMENT_WEAPONS');

  return beam + missile + (railGun * 1.4) + (bombardment * 0.33);
}

function calculateDurability(ship: ShipBlueprint): number {
  const baseDurability = ship.hullPointsCapacity + (ship.shieldCapacity * 0.5);
  const armorFactor = 1 + (ship.armor * 0.12);
  const criticalFactor = 1 + ((50 - ship.criticalThreshold) * 0.01);
  return baseDurability * armorFactor * criticalFactor;
}

function createHangarLoadCalculator(shipsByType: Map<string, ShipBlueprint>) {
  const fighter = shipsByType.get('FIGHTER');
  const assaultFighter = shipsByType.get('ASSAULT_FIGHTER');

  if (!fighter || !assaultFighter) {
    throw new Error('Required fighter blueprints are missing.');
  }

  const fighterAlpha = calculateSpaceAlpha(fighter);
  const assaultAlpha = calculateSpaceAlpha(assaultFighter);
  const fighterCost = calculateWeightedCost(fighter);
  const assaultCost = calculateWeightedCost(assaultFighter);

  return {
    fighter: {
      alpha: fighterAlpha,
      cost: fighterCost
    },
    assault: {
      alpha: assaultAlpha,
      cost: assaultCost,
      size: assaultFighter.size
    },
    calculate(capacity: number): { addedAlpha: number; addedCost: number; label: string } {
      const assaultCount = Math.floor(capacity / assaultFighter.size);
      const remainingCapacity = capacity % assaultFighter.size;
      const fighterCount = remainingCapacity;

      return {
        addedAlpha: (assaultCount * assaultAlpha) + (fighterCount * fighterAlpha),
        addedCost: (assaultCount * assaultCost) + (fighterCount * fighterCost),
        label: fighterCount > 0 ? `${assaultCount}A+${fighterCount}F` : `${assaultCount}A`
      };
    }
  };
}

function calculateShipMetrics(
  ship: ShipBlueprint,
  hangarLoadCalculator: ReturnType<typeof createHangarLoadCalculator>
): ShipMetrics {
  const buildCost = calculateWeightedCost(ship);
  const travelCost = ship.jumpCost * 3;
  const operatingCost = buildCost + travelCost;
  const baseAlpha = calculateSpaceAlpha(ship);
  const hangarLoad = hangarLoadCalculator.calculate(ship.hangarCapacity);
  const durability = calculateDurability(ship);
  const siege = sumWeaponDamage(ship.weapons, 'BOMBARDMENT_WEAPONS');

  return {
    ship,
    buildCost,
    travelCost,
    operatingCost,
    baseAlpha,
    loadedAlpha: baseAlpha + hangarLoad.addedAlpha,
    loadedCost: operatingCost + hangarLoad.addedCost,
    hangarLoadLabel: hangarLoad.label,
    durability,
    siege,
    cargo: ship.cargoCapacity,
    hangar: ship.hangarCapacity,
    baseAlphaPerOperatingCost: operatingCost > 0 ? baseAlpha / operatingCost : 0,
    loadedAlphaPerLoadedCost: (operatingCost + hangarLoad.addedCost) > 0
      ? (baseAlpha + hangarLoad.addedAlpha) / (operatingCost + hangarLoad.addedCost)
      : 0,
    cargoPerOperatingCost: operatingCost > 0 ? ship.cargoCapacity / operatingCost : 0
  };
}

function createTable(bucket: BucketDefinition, metricsByType: Map<string, ShipMetrics>): string {
  const lines: string[] = [];
  lines.push(`### ${bucket.name}`);
  lines.push('');
  lines.push('| Ship | Build | Travel | OpCost | Base Alpha | Loaded Alpha | Loaded Cost | Hangar Load | Durability | Siege | Cargo | Hangar | BaseA/Op | LoadedA/LoadedCost | Cargo/Op | Notes |');
  lines.push('| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');

  for (const shipType of bucket.ships) {
    const metrics = metricsByType.get(shipType);
    if (!metrics) {
      continue;
    }

    lines.push(
      `| ${metrics.ship.type} | ${formatNumber(metrics.buildCost)} | ${formatNumber(metrics.travelCost)} | ${formatNumber(metrics.operatingCost)} | `
      + `${formatNumber(metrics.baseAlpha)} | ${formatNumber(metrics.loadedAlpha)} | ${formatNumber(metrics.loadedCost)} | ${metrics.hangarLoadLabel} | `
      + `${formatNumber(metrics.durability)} | ${formatNumber(metrics.siege)} | ${formatNumber(metrics.cargo)} | ${formatNumber(metrics.hangar)} | `
      + `${formatNumber(metrics.baseAlphaPerOperatingCost)} | ${formatNumber(metrics.loadedAlphaPerLoadedCost)} | ${formatNumber(metrics.cargoPerOperatingCost)} | `
      + `${metrics.ship.purposes.join(', ')} |`
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

  const sections: string[] = [
    '# Ship Balance Comparison Template',
    '',
    'This file is a lightweight balance reference for ships in `ship-blueprints.json`.',
    '',
    'The goal is not to calculate one perfect score. The goal is to compare ships in the same role bucket and quickly find suspicious numbers, likely traps, and likely overperformers.',
    '',
    '## Role Buckets',
    '',
    'Compare ships only inside the same bucket.',
    '',
    '- Local bombardment hulls',
    '- Small combat ships',
    '- Medium combat ships',
    '- Big combat ships',
    '- Cargo ships',
    '- Support ships',
    '- Prestige / titan ships',
    '',
    '## Core Cost Marker',
    '',
    'Use weighted resource cost instead of plain resource sum.',
    '',
    '```text',
    'weightedCost = metal * 1 + crystal * 2 + deuterium * 3',
    '```',
    '',
    '## Combat Markers',
    '',
    '### Space Alpha',
    '',
    'This is the rough ship-to-ship battle damage marker.',
    '',
    '```text',
    'spaceAlpha =',
    '  beamDamage',
    '  + missileDamage',
    '  + railGunDamage * 1.4',
    '  + bombardmentDamage * 0.33',
    '```',
    '',
    'Rules:',
    '',
    '- `BEAM` counts at full value',
    '- `MISSILE` counts at full value',
    '- `RAIL_GUN` counts above raw damage because it is shield and armor piercing',
    '- `BOMBARDMENT_WEAPONS` count only at `0.33` in space combat',
    '- `REPAIR_EQUIPMENT` counts as `0` in battle value',
    '- `RECYCLE_EQUIPMENT` counts as `0` in battle value',
    '',
    '### Siege Alpha',
    '',
    'This is the rough planetary attack marker.',
    '',
    '```text',
    'siegeAlpha = bombardmentDamage',
    '```',
    '',
    'Optional later extension:',
    '',
    '```text',
    'siegeAlpha = bombardmentDamage + planetaryBombSupportValue',
    '```',
    '',
    '### Durability',
    '',
    'Hull matters more than shield because hull damage persists while shield replenishes after battle.',
    'Armor matters because it reduces `BEAM` and `MISSILE` damage.',
    'Critical threshold matters because ships below threshold can be destroyed after a round.',
    '',
    '```text',
    'baseDurability = (hullPointsCapacity * 1.0 + shieldCapacity * 0.5)',
    'armorFactor = 1 + armor * 0.12',
    'criticalFactor = 1 + (50 - criticalThreshold) * 0.01',
    'durabilityScore = baseDurability * armorFactor * criticalFactor',
    '```',
    '',
    'Notes:',
    '',
    '- Lower `criticalThreshold` is better',
    '- Higher `armor` is better',
    '- This is a rough comparison marker, not a simulator replacement',
    '',
    '## Utility Markers',
    '',
    'These should stay separate from battle value.',
    '',
    '```text',
    'cargoValue = cargoCapacity',
    'hangarValue = hangarCapacity',
    'repairValue = totalRepairEquipmentDamage',
    'recycleValue = totalRecycleEquipmentDamage',
    '```',
    '',
    'Suggested ratios:',
    '',
    '```text',
    'cargoEfficiency = cargoValue / weightedCost',
    'hangarEfficiency = hangarValue / weightedCost',
    'repairEfficiency = repairValue / weightedCost',
    'recycleEfficiency = recycleValue / weightedCost',
    '```',
    '',
    '## Mobility Marker',
    '',
    'Mobility should not be hidden inside combat or utility scores.',
    '',
    'Rules:',
    '',
    '- `canJump == false` is a major strategic drawback',
    '- `jumpCost` is a deuterium operating cost and should be tracked separately',
    '- `size` matters mostly for carrier interactions',
    '',
    'Recommended interpretation:',
    '',
    '- Local-only ships can be numerically efficient and still be balanced',
    '- Independent jump-capable ships can be priced higher',
    '',
    '## Main Efficiency Ratios',
    '',
    'Use these for quick comparison inside the same role bucket.',
    '',
    '```text',
    'spaceCombatEfficiency = spaceAlpha / weightedCost',
    'durabilityEfficiency = durabilityScore / weightedCost',
    'siegeEfficiency = siegeAlpha / weightedCost',
    'cargoEfficiency = cargoValue / weightedCost',
    'hangarEfficiency = hangarValue / weightedCost',
    'repairEfficiency = repairValue / weightedCost',
    'recycleEfficiency = recycleValue / weightedCost',
    '```',
    '',
    '## Comparison Template',
    '',
    'Copy this block when reviewing a ship group.',
    '',
    '```text',
    'Bucket:',
    '',
    'Ships compared:',
    '',
    'Anchor ship:',
    '',
    'Formulas:',
    '- weightedCost = metal * 1 + crystal * 2 + deuterium * 3',
    '- spaceAlpha = beam + missile + railGun * 1.4 + bombardment * 0.33',
    '- durabilityScore = (hull * 1.0 + shield * 0.5) * (1 + armor * 0.12) * (1 + (50 - criticalThreshold) * 0.01)',
    '- travelCost = jumpCost * 3',
    '',
    'Table columns:',
    '- Ship',
    '- Build cost',
    '- Travel cost',
    '- Operating cost',
    '- Base alpha',
    '- Loaded alpha',
    '- Loaded cost',
    '- Hangar load',
    '- Durability score',
    '- Siege alpha',
    '- Cargo',
    '- Hangar',
    '- Notes',
    '',
    'Questions:',
    '- Is there an obvious direct upgrade with no real downside?',
    '- Is there a likely trap ship?',
    '- Is a specialist ship too good outside its specialty?',
    '- Does the ship match its intended role?',
    '- Does mobility justify the numbers?',
    '```',
    '',
    '## Quick Review Rules',
    '',
    '- Compare ships inside their own bucket only',
    '- Do not judge support ships by battle damage alone',
    '- Do not judge bombardment ships by normal fleet combat alone',
    '- Treat `canJump == false` as a real drawback',
    '- Treat `RAIL_GUN` as premium combat value',
    '- Treat `REPAIR_EQUIPMENT` as non-combat value',
    '- Use these markers to find suspicious numbers, not to replace judgment',
    '',
    '## Current Blueprint Calculations',
    '',
    'These tables are generated from the current `ship-blueprints.json` values using the formulas above, plus two extra assumptions:',
    '',
    '- `travelCost = jumpCost * 3`',
    '- `loadedAlpha` uses real whole-ship hangar packing with current combat-optimal small ships:',
    '  as many `ASSAULT_FIGHTER`s as fit, plus one `FIGHTER` if one hangar slot remains',
    '',
    'Benchmark used for loaded carriers:',
    '',
    '```text',
    `ASSAULT_FIGHTER: size ${hangarLoadCalculator.assault.size}, alpha ${formatNumber(hangarLoadCalculator.assault.alpha)}, weighted cost ${formatNumber(hangarLoadCalculator.assault.cost)}`,
    `FIGHTER: size 1, alpha ${formatNumber(hangarLoadCalculator.fighter.alpha)}, weighted cost ${formatNumber(hangarLoadCalculator.fighter.cost)}`,
    '```',
    ''
  ];

  for (const bucket of bucketDefinitions) {
    sections.push(createTable(bucket, metricsByType));
  }

  return `${sections.join('\n')}\n`;
}

const blueprintData = JSON.parse(readFileSync(shipBlueprintPath, 'utf8')) as ShipBlueprintFile;
writeFileSync(shipsDescrPath, buildMarkdown(blueprintData), 'utf8');
