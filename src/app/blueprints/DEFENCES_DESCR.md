# Planetary Defence Balance Comparison Template

This file is a lightweight balance reference for `defence-blueprints.json`.

The same basic weighted-cost logic is used as in the ship reference, but the markers are simpler because defences do not move, do not carry hangars, and do not pay travel cost.

## Core Cost Marker

```text
weightedCost = metal * 1 + crystal * 2 + deuterium * 3
```

## Combat Markers

```text
spaceAlpha = beamDamage + missileDamage + railGunDamage * 1.4
bombAlpha = orbitToSurfaceBombDamage
durabilityScore = (hull * 1.0 + shield * 0.5) * (1 + armor * 0.12) * (1 + (50 - criticalThreshold) * 0.01)
```

Interpretation:

- `spaceAlpha` is for defence-vs-ship combat
- `bombAlpha` is only for the bomb stockpile entries
- `durabilityScore` uses the same rough comparison marker as ships
- `canShootToOrbit` matters a lot; surface-only entries should not be judged like orbital cannons

## Main Efficiency Ratios

```text
spaceCombatEfficiency = spaceAlpha / weightedCost
bombEfficiency = bombAlpha / weightedCost
durabilityEfficiency = durabilityScore / weightedCost
```

## Review Rules

- Orbit-capable defences should usually be a bit more efficient than comparable mobile ships
- Surface-only defences and bombs should be judged by their niche, not by orbit combat
- Rail-gun defences are expected to look stronger than raw damage suggests
- Planetary bombs are consumable attack stockpile, not line defences

## Current Military Ship Hull Benchmarks

These are pulled from the live ship blueprint file and use only ships with the `MILITARY` purpose.
They use the same weighted-cost and durability formulas and serve only as comparison anchors for the "defences should be a little more effective than ships" target.

| Ship Hull Class | Avg SpaceA/OpCost | Avg Dur/OpCost |
| --- | ---: | ---: |
| BIG | 0.09 | 0.52 |
| MEDIUM | 0.12 | 0.57 |
| SMALL | 0.19 | 0.49 |
| STATION | 0.06 | 0.6 |
| TITAN | 0.08 | 0.5 |

## Current Blueprint Calculations

### Orbit-Capable Planetary Defences

| Defence | Hull | Orbit Fire | Build | Space Alpha | Bomb Alpha | Durability | SpaceA/Cost | Bomb/Cost | Dur/Cost | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BEAM_CANNON | MEDIUM | Yes | 110 | 20 | 0 | 107.14 | 0.18 | 0 | 0.97 | anti-orbit |
| HEAVY_BEAM_CANNON | BIG | Yes | 380 | 40 | 0 | 341.88 | 0.11 | 0 | 0.9 | anti-orbit |
| ORBITAL_MISSILE_LAUNCHER | MEDIUM | Yes | 150 | 30 | 0 | 93.74 | 0.2 | 0 | 0.62 | anti-orbit |
| HEAVY_ORBITAL_MISSILE_LAUNCHER | BIG | Yes | 540 | 100 | 0 | 293.04 | 0.19 | 0 | 0.54 | anti-orbit |

### Surface-Only Defences

| Defence | Hull | Orbit Fire | Build | Space Alpha | Bomb Alpha | Durability | SpaceA/Cost | Bomb/Cost | Dur/Cost | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| LIGHT_BEAM_CANNON | SMALL | No | 35 | 10 | 0 | 35 | 0.29 | 0 | 1 | surface/local only |
| SAM_SITE | SMALL | No | 25 | 20 | 0 | 26.88 | 0.8 | 0 | 1.08 | surface/local only |
| RAIL_GUN_CANNON | BIG | No | 310 | 42 | 0 | 364.48 | 0.14 | 0 | 1.18 | surface/local only |

### Planetary Bomb Stockpile

| Defence | Hull | Orbit Fire | Build | Space Alpha | Bomb Alpha | Durability | SpaceA/Cost | Bomb/Cost | Dur/Cost | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| SMALL_BOMB | PLANETARY_BOMB | No | 10 | 0 | 100 | 5 | 0 | 10 | 0.5 | planetary bombardment |
| CLUSTER_BOMB | PLANETARY_BOMB | No | 40 | 0 | 200 | 5 | 0 | 5 | 0.13 | planetary bombardment |
| MEDIUM_BOMB | PLANETARY_BOMB | No | 150 | 0 | 600 | 5 | 0 | 4 | 0.03 | planetary bombardment |
| HEAVY_BOMB | PLANETARY_BOMB | No | 1000 | 0 | 2500 | 10 | 0 | 2.5 | 0.01 | planetary bombardment |

