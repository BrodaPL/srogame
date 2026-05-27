# Ship Battle Balance Reference

This file is generated from `ship-blueprints.json` by `scripts/generate-ships-descr.ts`.
The formulas below mirror the live space battle resolver in `src/app/models/battles/space-battle-resolver.ts` at the blueprint, no-tech level.

## Live Battle Rules Captured

- Battles run for up to 4 rounds.
- Every living unit refills all combat weapon shots each round.
- `BEAM`, `MISSILE`, and `RAIL_GUN` can hit ships; ships can hit defences only with `BOMBARDMENT_WEAPONS`.
- `BOMBARDMENT_WEAPONS` have a 10% hit chance against ships and a 100% hit chance against defences.
- Target evasion applies to non-bombardment ship targets. Defences have no evasion.
- `RAIL_GUN` applies full damage directly to hull and ignores shield and armor.
- Other weapons remove shield first, then only half of spillover can become hull damage.
- Armor is subtracted from hull spillover; missiles subtract double armor.
- Critical destruction is checked only after hull damage in a round. Below the critical hull threshold, destruction chance scales with missing hull inside that critical band.

## Cost And Output Markers

```text
weightedCost = metal * 1 + crystal * 2 + deuterium * 3
travelCost = jumpCost * 3
operatingCost = weightedCost + travelCost
normalShipFire = beamDamage + missileDamage + railGunDamage
bombVsShip = bombardmentDamage * 0.1
shipAlpha = normalShipFire + bombVsShip
antiDefenceAlpha = bombardmentDamage
```

Important: `shipAlpha` is an outgoing pressure marker before shield, armor, random target choice, and critical rolls. It is intentionally not a full simulator.

## Durability Markers

```text
hitChanceAgainstShip = 1 - evasionChance
criticalHull = hullPointsCapacity * criticalThreshold / 100
nonRailEhpToZero = (shieldCapacity + hullPointsCapacity * 2) / hitChanceAgainstShip
railEhpToZero = hullPointsCapacity / hitChanceAgainstShip
```

The non-rail marker reflects the live half-spillover rule. Armor is not baked into EHP because its value depends heavily on enemy shot size and weapon type.

## Hangar Loading

Loaded carrier alpha uses whole-ship packing with the current best small military ships under the same `shipAlpha` formula:

- ASSAULT_FIGHTER: size 2, shipAlpha 36, weighted cost 85
- CORVETTE: size 3, shipAlpha 30, weighted cost 190
- FIGHTER: size 1, shipAlpha 9, weighted cost 25
- ATMOSPHERIC_BOMBER: size 3, shipAlpha 6, weighted cost 190
- ATMOSPHERIC_FIGHTER: size 1, shipAlpha 2, weighted cost 60

## Automated Balance Watchlist

- FIGHTER: high ship-alpha efficiency in Small Combat And Local Assault (0.36 vs median 0.158). This is expected for cheap local disposable craft, but still worth tracking.
- FIGHTER: high non-rail durability efficiency (2.462 vs median 1.256).
- FIGHTER: local-only hull; good efficiency may be acceptable because it needs carriers or local production.
- ASSAULT_FIGHTER: high ship-alpha efficiency in Small Combat And Local Assault (0.424 vs median 0.158). This is expected for cheap local disposable craft, but still worth tracking.
- ASSAULT_FIGHTER: local-only hull; good efficiency may be acceptable because it needs carriers or local production.
- ATMOSPHERIC_FIGHTER: bomber-specialist profile; low ship combat is expected because normal ship combat only gets the live 10% bombardment hit chance.
- ATMOSPHERIC_FIGHTER: local-only hull; good efficiency may be acceptable because it needs carriers or local production.
- ATMOSPHERIC_BOMBER: bomber-specialist profile; low ship combat is expected because normal ship combat only gets the live 10% bombardment hit chance.
- ATMOSPHERIC_BOMBER: local-only hull; good efficiency may be acceptable because it needs carriers or local production.
- CORVETTE: local-only hull; good efficiency may be acceptable because it needs carriers or local production.
- ORBITAL_BOMBER: bomber-specialist profile; low ship combat is expected because normal ship combat only gets the live 10% bombardment hit chance.
- ARMAGEDDON_BOMBER: bomber-specialist profile; low ship combat is expected because normal ship combat only gets the live 10% bombardment hit chance.
- BEHEMOTH: high ship-alpha efficiency in Titan And Prestige (0.127 vs median 0.062).
- FLEET_CARRIER: low ship-alpha efficiency for a military hull (0.017 vs median 0.062).

## Current Blueprint Calculations

### Small Combat And Local Assault

| Ship | Build | Travel | OpCost | Hull/Sh/Arm | Evade | Crit Hull | Normal Fire | Rail | Bomb vs Ship | Ship Alpha | Anti-Def | Loaded Alpha | Loaded Cost | Hangar Load | NonRail EHP0 | Rail EHP0 | ShipA/Op | LoadedA/Cost | AntiDef/Op | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| FIGHTER | 25 | 0 | 25 | 20/0/0 | 0.35 | 10 | 9 | 0 | 0 | 9 | 0 | 9 | 25 | - | 61.538 | 30.769 | 0.36 | 0.36 | 0 | 0 | local, MILITARY |
| ASSAULT_FIGHTER | 85 | 0 | 85 | 30/0/0 | 0.2 | 15 | 36 | 0 | 0 | 36 | 0 | 36 | 85 | - | 75 | 37.5 | 0.424 | 0.424 | 0 | 0 | local, MILITARY |
| ATMOSPHERIC_FIGHTER | 60 | 0 | 60 | 30/0/1 | 0.22 | 16.5 | 0 | 0 | 2 | 2 | 20 | 2 | 60 | - | 76.923 | 38.462 | 0.033 | 0.033 | 0.333 | 0 | local, MILITARY, BOMBER |
| ATMOSPHERIC_BOMBER | 190 | 0 | 190 | 90/30/2 | 0.12 | 45 | 0 | 0 | 6 | 6 | 60 | 6 | 190 | - | 239 | 102 | 0.032 | 0.032 | 0.316 | 0.105 | local, MILITARY, BOMBER |
| CORVETTE | 190 | 0 | 190 | 80/40/2 | 0.1 | 36 | 30 | 0 | 0 | 30 | 0 | 30 | 190 | - | 222 | 88.889 | 0.158 | 0.158 | 0 | 0.053 | local, MILITARY |

### Medium Combat

| Ship | Build | Travel | OpCost | Hull/Sh/Arm | Evade | Crit Hull | Normal Fire | Rail | Bomb vs Ship | Ship Alpha | Anti-Def | Loaded Alpha | Loaded Cost | Hangar Load | NonRail EHP0 | Rail EHP0 | ShipA/Op | LoadedA/Cost | AntiDef/Op | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CRUISER | 300 | 3 | 303 | 100/40/3 | 0 | 45 | 40 | 10 | 0 | 40 | 0 | 49 | 328 | 1x FIGHTER | 240 | 100 | 0.132 | 0.149 | 0 | 0.165 | jump, MILITARY |
| BATTLE_SHIP | 500 | 6 | 506 | 140/80/3 | 0 | 56 | 50 | 0 | 0 | 50 | 0 | 122 | 676 | 2x ASSAULT_FIGHTER | 360 | 140 | 0.099 | 0.18 | 0 | 0.237 | jump, MILITARY, CARRIER |
| FRIGATE | 490 | 3 | 493 | 160/70/4 | 0 | 64 | 60 | 20 | 0 | 60 | 0 | 60 | 493 | - | 390 | 160 | 0.122 | 0.122 | 0 | 0.081 | jump, MILITARY |

### Big Combat And Siege

| Ship | Build | Travel | OpCost | Hull/Sh/Arm | Evade | Crit Hull | Normal Fire | Rail | Bomb vs Ship | Ship Alpha | Anti-Def | Loaded Alpha | Loaded Cost | Hangar Load | NonRail EHP0 | Rail EHP0 | ShipA/Op | LoadedA/Cost | AntiDef/Op | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BATTLE_CRUISER | 1020 | 6 | 1026 | 300/120/4 | 0 | 120 | 100 | 10 | 3 | 103 | 30 | 103 | 1026 | - | 720 | 300 | 0.1 | 0.1 | 0.029 | 0.097 | jump, MILITARY |
| DESTROYER | 1100 | 6 | 1106 | 250/160/4 | 0 | 100 | 90 | 60 | 0 | 90 | 0 | 90 | 1106 | - | 660 | 250 | 0.081 | 0.081 | 0 | 0.09 | jump, MILITARY |
| DREADNOUGHT | 1540 | 9 | 1549 | 220/220/5 | 0 | 88 | 160 | 0 | 6 | 166 | 60 | 166 | 1549 | - | 660 | 220 | 0.107 | 0.107 | 0.039 | 0.065 | jump, MILITARY |
| ORBITAL_BOMBER | 1260 | 18 | 1278 | 220/180/6 | 0 | 77 | 20 | 0 | 32 | 52 | 320 | 124 | 1448 | 2x ASSAULT_FIGHTER | 620 | 220 | 0.041 | 0.086 | 0.25 | 0.047 | jump, MILITARY, BOMBER |

### Logistics And Support

| Ship | Build | Travel | OpCost | Hull/Sh/Arm | Evade | Crit Hull | Normal Fire | Rail | Bomb vs Ship | Ship Alpha | Anti-Def | Loaded Alpha | Loaded Cost | Hangar Load | NonRail EHP0 | Rail EHP0 | ShipA/Op | LoadedA/Cost | AntiDef/Op | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| SPY_PROBE | 70 | 0 | 70 | 10/0/0 | 0 | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 70 | - | 20 | 10 | 0 | 0 | 0 | 0 | jump, UTILITY |
| REPAIR_DRONE | 105 | 3 | 108 | 10/0/0 | 0 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 108 | - | 20 | 10 | 0 | 0 | 0 | 0 | local, UTILITY |
| RECYCLER | 820 | 9 | 829 | 120/80/4 | 0 | 48 | 0 | 0 | 0 | 0 | 0 | 0 | 829 | - | 320 | 120 | 0 | 0 | 0 | 1.448 | jump, CARGO, UTILITY, RECYCLING |
| TRANSPORTER | 240 | 3 | 243 | 60/20/2 | 0 | 27 | 6 | 0 | 0 | 6 | 0 | 6 | 243 | - | 140 | 60 | 0.025 | 0.025 | 0 | 2.469 | jump, CARGO |
| CARGO_SUPPORT | 650 | 6 | 656 | 150/150/5 | 0 | 60 | 20 | 0 | 0 | 20 | 0 | 20 | 656 | - | 450 | 150 | 0.03 | 0.03 | 0 | 1.524 | jump, CARGO, UTILITY |
| MASS_HAULER | 740 | 9 | 749 | 120/100/3 | 0 | 54 | 12 | 0 | 0 | 12 | 0 | 12 | 749 | - | 340 | 120 | 0.016 | 0.016 | 0 | 3.338 | jump, CARGO |
| CARRIER | 780 | 9 | 789 | 220/180/5 | 0 | 77 | 20 | 0 | 0 | 20 | 0 | 344 | 1554 | 9x ASSAULT_FIGHTER | 620 | 220 | 0.025 | 0.221 | 0 | 0.507 | jump, MILITARY, CARGO, CARRIER |
| COLONIZER | 1700 | 30 | 1730 | 200/80/2 | 0 | 80 | 10 | 0 | 0 | 10 | 0 | 82 | 1900 | 2x ASSAULT_FIGHTER | 480 | 200 | 0.006 | 0.043 | 0 | 0.289 | jump, UTILITY |

### Titan And Prestige

| Ship | Build | Travel | OpCost | Hull/Sh/Arm | Evade | Crit Hull | Normal Fire | Rail | Bomb vs Ship | Ship Alpha | Anti-Def | Loaded Alpha | Loaded Cost | Hangar Load | NonRail EHP0 | Rail EHP0 | ShipA/Op | LoadedA/Cost | AntiDef/Op | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| TITAN | 5400 | 27 | 5427 | 800/1000/7 | 0 | 240 | 520 | 80 | 10 | 530 | 100 | 746 | 5937 | 6x ASSAULT_FIGHTER | 2600 | 800 | 0.098 | 0.126 | 0.018 | 0.184 | jump, MILITARY, CARRIER |
| ARMAGEDDON_BOMBER | 6100 | 24 | 6124 | 700/700/7 | 0 | 210 | 20 | 0 | 95 | 115 | 950 | 259 | 6464 | 4x ASSAULT_FIGHTER | 2100 | 700 | 0.019 | 0.04 | 0.155 | 0.163 | jump, MILITARY, BOMBER |
| BEHEMOTH | 6600 | 30 | 6630 | 800/800/7 | 0 | 240 | 840 | 40 | 0 | 840 | 0 | 840 | 6630 | - | 2400 | 800 | 0.127 | 0.127 | 0 | 0.151 | jump, MILITARY |
| FLEET_CARRIER | 4000 | 24 | 4024 | 800/1000/6 | 0 | 240 | 70 | 0 | 0 | 70 | 0 | 1690 | 7849 | 45x ASSAULT_FIGHTER | 2600 | 800 | 0.017 | 0.215 | 0 | 0.149 | jump, MILITARY, UTILITY, CARRIER |
| MOTHER_SHIP | 82000 | 300 | 82300 | 10000/20000/8 | 0 | 2500 | 4820 | 280 | 250 | 5070 | 2500 | 7230 | 87400 | 60x ASSAULT_FIGHTER | 40000 | 10000 | 0.062 | 0.083 | 0.03 | 0.122 | jump, MILITARY, BOMBER, CARGO, UTILITY, CARRIER |

