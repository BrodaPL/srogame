# Planetary Defence Battle Balance Reference

This file is generated from `defence-blueprints.json` by `scripts/generate-defences-descr.ts`.
The formulas below mirror the live space battle resolver in `src/app/models/battles/space-battle-resolver.ts` at the blueprint, no-tech level.

## Live Battle Rules Captured

- Defences participate in the same 4-round space battle loop as ships.
- Orbit-capable defences can target all ship hull classes.
- Surface-only defences can target only `SMALL` ships that carry `BOMBARDMENT_WEAPONS`.
- Defences cannot shoot other defences in normal space combat.
- Ships can damage defences only with `BOMBARDMENT_WEAPONS`.
- `BOMBARDMENT_WEAPONS` always hit defences once fired.
- `RAIL_GUN` applies full damage directly to hull and ignores shield and armor.
- Other weapons remove shield first, then only half of spillover can become hull damage.
- Armor is subtracted from hull spillover; missiles subtract double armor.
- Current planetary bomb activation inside the space battle resolver only considers size-1 planetary bombs for anti-defence battle damage.
- Bombard and Siege building bombardment use all carried planetary bomb sizes through `applyBuildingBombardment(...)`.

## Cost And Output Markers

```text
weightedCost = metal * 1 + crystal * 2 + deuterium * 3
orbitFireAlpha = beamDamage + missileDamage + railGunDamage, only when canShootToOrbit
localAntiBomberAlpha = beamDamage + missileDamage + railGunDamage, only for surface-only local anti-bomber fire
groundBombPayloadAlpha = orbitToSurfaceBombDamage
antiDefenceBattleBombAlpha = groundBombPayloadAlpha only for size-1 planetary bombs
```

## Durability Markers

```text
criticalHull = hullPointsCapacity * criticalThreshold / 100
nonRailEhpToZero = shieldCapacity + hullPointsCapacity * 2
railEhpToZero = hullPointsCapacity
```

The non-rail marker reflects the live half-spillover rule. Armor is reported separately because its value depends on enemy shot size and weapon type.

## Current Military Ship Hull Benchmarks

These are pulled from the live ship blueprint file and use only ships with the `MILITARY` purpose.
They use the same battle-aware alpha and non-rail EHP markers as the defence tables.

| Ship Hull Class | Avg ShipAlpha/OpCost | Avg NonRailEHP/OpCost |
| --- | ---: | ---: |
| BIG | 0.071 | 0.599 |
| MEDIUM | 0.118 | 0.765 |
| SMALL | 0.201 | 1.41 |
| STATION | 0.062 | 0.486 |
| TITAN | 0.065 | 0.458 |

## Automated Balance Watchlist

- LIGHT_BEAM_CANNON: live targeting is narrow; it can only shoot SMALL ships that carry bombardment weapons.
- BEAM_CANNON: high orbit-fire efficiency compared with military ship averages (0.2 vs 0.103).
- SAM_SITE: live targeting is narrow; it can only shoot SMALL ships that carry bombardment weapons.
- ORBITAL_MISSILE_LAUNCHER: high orbit-fire efficiency compared with military ship averages (0.214 vs 0.103).
- HEAVY_ORBITAL_MISSILE_LAUNCHER: high orbit-fire efficiency compared with military ship averages (0.185 vs 0.103).
- RAIL_GUN_CANNON: live targeting is narrow; it can only shoot SMALL ships that carry bombardment weapons.
- MEDIUM_BOMB: building-focused bomb payload 600; it is intentionally skipped by the size-1 anti-defence space-battle bomb step.
- HEAVY_BOMB: building-focused bomb payload 2500; it is intentionally skipped by the size-1 anti-defence space-battle bomb step.

## Current Blueprint Calculations

### Orbit-Capable Planetary Defences

| Defence | Hull | Targeting | Build | Hull/Sh/Arm | Crit Hull | Orbit Fire | Local Anti-Bomber | Ground Bomb Payload | Anti-Def Battle Bomb | NonRail EHP0 | Rail EHP0 | Orbit/Cost | Local/Cost | AntiDefBomb/Cost | EHP/Cost | Notes |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BEAM_CANNON | MEDIUM | all orbit ships | 100 | 60/30/2 | 13.2 | 20 | 0 | 0 | 0 | 150 | 60 | 0.2 | 0 | 0 | 1.5 | anti-orbit |
| HEAVY_BEAM_CANNON | BIG | all orbit ships | 380 | 150/50/4 | 27 | 40 | 0 | 0 | 0 | 350 | 150 | 0.105 | 0 | 0 | 0.921 | anti-orbit |
| ORBITAL_MISSILE_LAUNCHER | MEDIUM | all orbit ships | 140 | 70/0/2 | 16.8 | 30 | 0 | 0 | 0 | 140 | 70 | 0.214 | 0 | 0 | 1 | anti-orbit |
| HEAVY_ORBITAL_MISSILE_LAUNCHER | BIG | all orbit ships | 540 | 120/60/4 | 21.6 | 100 | 0 | 0 | 0 | 300 | 120 | 0.185 | 0 | 0 | 0.556 | anti-orbit |

### Surface-Only Defences

| Defence | Hull | Targeting | Build | Hull/Sh/Arm | Crit Hull | Orbit Fire | Local Anti-Bomber | Ground Bomb Payload | Anti-Def Battle Bomb | NonRail EHP0 | Rail EHP0 | Orbit/Cost | Local/Cost | AntiDefBomb/Cost | EHP/Cost | Notes |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| LIGHT_BEAM_CANNON | SMALL | small bombers only | 35 | 20/20/1 | 5 | 0 | 10 | 0 | 0 | 60 | 20 | 0 | 0.286 | 0 | 1.714 | surface/local interception |
| SAM_SITE | SMALL | small bombers only | 30 | 20/0/1 | 6 | 0 | 20 | 0 | 0 | 40 | 20 | 0 | 0.667 | 0 | 1.333 | surface/local interception |
| RAIL_GUN_CANNON | BIG | small bombers only | 350 | 160/80/5 | 25.6 | 0 | 30 | 0 | 0 | 400 | 160 | 0 | 0.086 | 0 | 1.143 | surface/local interception, rail ignores shield and armor |

### Planetary Bomb Stockpile

| Defence | Hull | Targeting | Build | Hull/Sh/Arm | Crit Hull | Orbit Fire | Local Anti-Bomber | Ground Bomb Payload | Anti-Def Battle Bomb | NonRail EHP0 | Rail EHP0 | Orbit/Cost | Local/Cost | AntiDefBomb/Cost | EHP/Cost | Notes |
| --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| SMALL_BOMB | PLANETARY_BOMB | anti-defence or building bomb | 10 | 10/0/0 | 10 | 0 | 0 | 100 | 100 | 20 | 10 | 0 | 0 | 10 | 2 | can hit defences in space battle and buildings in bombardment |
| CLUSTER_BOMB | PLANETARY_BOMB | anti-defence or building bomb | 40 | 10/0/0 | 10 | 0 | 0 | 200 | 200 | 20 | 10 | 0 | 0 | 5 | 0.5 | can hit defences in space battle and buildings in bombardment |
| MEDIUM_BOMB | PLANETARY_BOMB | building bomb | 150 | 10/0/0 | 10 | 0 | 0 | 600 | 0 | 20 | 10 | 0 | 0 | 0 | 0.133 | building-focused bombardment payload |
| HEAVY_BOMB | PLANETARY_BOMB | building bomb | 1000 | 20/0/0 | 20 | 0 | 0 | 2500 | 0 | 40 | 20 | 0 | 0 | 0 | 0.04 | building-focused bombardment payload |

