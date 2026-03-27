# Ship Balance Comparison Template

This file is a lightweight balance reference for ships in `ship-blueprints.json`.

The goal is not to calculate one perfect score. The goal is to compare ships in the same role bucket and quickly find suspicious numbers, likely traps, and likely overperformers.

## Role Buckets

Compare ships only inside the same bucket.

- Local bombardment hulls
- Small combat ships
- Medium combat ships
- Big combat ships
- Cargo ships
- Support ships
- Prestige / titan ships

## Core Cost Marker

Use weighted resource cost instead of plain resource sum.

```text
weightedCost = metal * 1 + crystal * 2 + deuterium * 3
```

## Combat Markers

### Space Alpha

This is the rough ship-to-ship battle damage marker.

```text
spaceAlpha =
  beamDamage
  + missileDamage
  + railGunDamage * 1.4
  + bombardmentDamage * 0.33
```

Rules:

- `BEAM` counts at full value
- `MISSILE` counts at full value
- `RAIL_GUN` counts above raw damage because it is shield and armor piercing
- `BOMBARDMENT_WEAPONS` count only at `0.33` in space combat
- `REPAIR_EQUIPMENT` counts as `0` in battle value
- `RECYCLE_EQUIPMENT` counts as `0` in battle value

### Siege Alpha

This is the rough planetary attack marker.

```text
siegeAlpha = bombardmentDamage
```

Optional later extension:

```text
siegeAlpha = bombardmentDamage + planetaryBombSupportValue
```

### Durability

Hull matters more than shield because hull damage persists while shield replenishes after battle.
Armor matters because it reduces `BEAM` and `MISSILE` damage.
Critical threshold matters because ships below threshold can be destroyed after a round.

```text
baseDurability = (hullPointsCapacity * 1.0 + shieldCapacity * 0.5)
armorFactor = 1 + armor * 0.12
criticalFactor = 1 + (50 - criticalThreshold) * 0.01
durabilityScore = baseDurability * armorFactor * criticalFactor
```

Notes:

- Lower `criticalThreshold` is better
- Higher `armor` is better
- This is a rough comparison marker, not a simulator replacement

## Utility Markers

These should stay separate from battle value.

```text
cargoValue = cargoCapacity
hangarValue = hangarCapacity
repairValue = totalRepairEquipmentDamage
recycleValue = totalRecycleEquipmentDamage
```

Suggested ratios:

```text
cargoEfficiency = cargoValue / weightedCost
hangarEfficiency = hangarValue / weightedCost
repairEfficiency = repairValue / weightedCost
recycleEfficiency = recycleValue / weightedCost
```

## Mobility Marker

Mobility should not be hidden inside combat or utility scores.

Rules:

- `canJump == false` is a major strategic drawback
- `jumpCost` is a deuterium operating cost and should be tracked separately
- `size` matters mostly for carrier interactions

Recommended interpretation:

- Local-only ships can be numerically efficient and still be balanced
- Independent jump-capable ships can be priced higher

## Main Efficiency Ratios

Use these for quick comparison inside the same role bucket.

```text
spaceCombatEfficiency = spaceAlpha / weightedCost
durabilityEfficiency = durabilityScore / weightedCost
siegeEfficiency = siegeAlpha / weightedCost
cargoEfficiency = cargoValue / weightedCost
hangarEfficiency = hangarValue / weightedCost
repairEfficiency = repairValue / weightedCost
recycleEfficiency = recycleValue / weightedCost
```

## Comparison Template

Copy this block when reviewing a ship group.

```text
Bucket:

Ships compared:

Anchor ship:

Formulas:
- weightedCost = metal * 1 + crystal * 2 + deuterium * 3
- spaceAlpha = beam + missile + railGun * 1.4 + bombardment * 0.33
- durabilityScore = (hull * 1.0 + shield * 0.5) * (1 + armor * 0.12) * (1 + (50 - criticalThreshold) * 0.01)
- travelCost = jumpCost * 3

Table columns:
- Ship
- Build cost
- Travel cost
- Operating cost
- Base alpha
- Loaded alpha
- Loaded cost
- Hangar load
- Durability score
- Siege alpha
- Cargo
- Hangar
- Notes

Questions:
- Is there an obvious direct upgrade with no real downside?
- Is there a likely trap ship?
- Is a specialist ship too good outside its specialty?
- Does the ship match its intended role?
- Does mobility justify the numbers?
```

## Quick Review Rules

- Compare ships inside their own bucket only
- Do not judge support ships by battle damage alone
- Do not judge bombardment ships by normal fleet combat alone
- Treat `canJump == false` as a real drawback
- Treat `RAIL_GUN` as premium combat value
- Treat `REPAIR_EQUIPMENT` as non-combat value
- Use these markers to find suspicious numbers, not to replace judgment

## Current Blueprint Calculations

These tables are generated from the current `ship-blueprints.json` values using the formulas above, plus two extra assumptions:

- `travelCost = jumpCost * 3`
- `loadedAlpha` uses real whole-ship hangar packing with current combat-optimal small ships:
  as many `ASSAULT_FIGHTER`s as fit, plus one `FIGHTER` if one hangar slot remains

Benchmark used for loaded carriers:

```text
ASSAULT_FIGHTER: size 2, alpha 40, weighted cost 100
FIGHTER: size 1, alpha 10, weighted cost 40
```

### Small Combat And Local Assault

| Ship | Build | Travel | OpCost | Base Alpha | Loaded Alpha | Loaded Cost | Hangar Load | Durability | Siege | Cargo | Hangar | BaseA/Op | LoadedA/LoadedCost | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| FIGHTER | 40 | 0 | 40 | 10 | 10 | 40 | 0A | 20 | 0 | 0 | 0 | 0.25 | 0.25 | 0 | MILITARY, BOMBER |
| ASSAULT_FIGHTER | 100 | 0 | 100 | 40 | 40 | 100 | 0A | 30 | 0 | 0 | 0 | 0.4 | 0.4 | 0 | MILITARY, BOMBER |
| ATMOSPHERIC_FIGHTER | 120 | 0 | 120 | 6.6 | 6.6 | 120 | 0A | 31.92 | 20 | 0 | 0 | 0.06 | 0.06 | 0 | MILITARY, BOMBER |
| ATMOSPHERIC_BOMBER | 190 | 0 | 190 | 19.8 | 19.8 | 190 | 0A | 130.2 | 60 | 20 | 0 | 0.1 | 0.1 | 0.11 | MILITARY, BOMBER |
| CORVETTE | 190 | 0 | 190 | 30 | 30 | 190 | 0A | 130.2 | 0 | 10 | 0 | 0.16 | 0.16 | 0.05 | MILITARY |

### Medium Combat

| Ship | Build | Travel | OpCost | Base Alpha | Loaded Alpha | Loaded Cost | Hangar Load | Durability | Siege | Cargo | Hangar | BaseA/Op | LoadedA/LoadedCost | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| CRUISER | 300 | 3 | 303 | 44 | 54 | 343 | 0A+1F | 171.36 | 0 | 50 | 1 | 0.15 | 0.16 | 0.17 | MILITARY |
| BATTLE_SHIP | 540 | 6 | 546 | 50 | 130 | 746 | 2A | 293.04 | 0 | 120 | 4 | 0.09 | 0.17 | 0.22 | MILITARY, CARRIER |
| FRIGATE | 520 | 3 | 523 | 68 | 68 | 523 | 0A | 317.46 | 0 | 40 | 0 | 0.13 | 0.13 | 0.08 | MILITARY |

### Big Combat And Siege

| Ship | Build | Travel | OpCost | Base Alpha | Loaded Alpha | Loaded Cost | Hangar Load | Durability | Siege | Cargo | Hangar | BaseA/Op | LoadedA/LoadedCost | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| BATTLE_CRUISER | 1200 | 6 | 1206 | 133.9 | 133.9 | 1206 | 0A | 700.04 | 30 | 200 | 0 | 0.11 | 0.11 | 0.17 | MILITARY |
| DESTROYER | 1100 | 6 | 1106 | 124 | 124 | 1106 | 0A | 624.36 | 0 | 150 | 0 | 0.11 | 0.11 | 0.14 | MILITARY |
| DREADNOUGHT | 1590 | 9 | 1599 | 196.5 | 196.5 | 1599 | 0A | 624.36 | 50 | 100 | 0 | 0.12 | 0.12 | 0.06 | MILITARY |
| ORBITAL_BOMBER | 1260 | 18 | 1278 | 135.6 | 215.6 | 1478 | 2A | 570.4 | 320 | 60 | 4 | 0.11 | 0.15 | 0.05 | MILITARY |

### Logistics And Support

| Ship | Build | Travel | OpCost | Base Alpha | Loaded Alpha | Loaded Cost | Hangar Load | Durability | Siege | Cargo | Hangar | BaseA/Op | LoadedA/LoadedCost | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| SPY_PROBE | 70 | 0 | 70 | 0 | 0 | 70 | 0A | 8 | 0 | 0 | 0 | 0 | 0 | 0 | UTILITY |
| REPAIR_DRONE | 105 | 3 | 108 | 0 | 0 | 108 | 0A | 9 | 0 | 0 | 0 | 0 | 0 | 0 | UTILITY |
| RECYCLER | 820 | 9 | 829 | 0 | 0 | 829 | 0A | 260.48 | 0 | 1200 | 0 | 0 | 0 | 1.45 | CARGO, UTILITY, RECYCLING |
| TRANSPORTER | 240 | 3 | 243 | 10 | 10 | 243 | 0A | 91.14 | 0 | 600 | 0 | 0.04 | 0.04 | 2.47 | CARGO |
| CARGO_SUPPORT | 650 | 6 | 656 | 20 | 20 | 656 | 0A | 396 | 0 | 1000 | 0 | 0.03 | 0.03 | 1.52 | CARGO, UTILITY |
| MASS_HAULER | 740 | 9 | 749 | 10 | 10 | 749 | 0A | 242.76 | 0 | 2500 | 0 | 0.01 | 0.01 | 3.34 | CARGO |
| CARRIER | 900 | 9 | 909 | 20 | 310 | 1649 | 7A+1F | 570.4 | 0 | 400 | 15 | 0.02 | 0.19 | 0.44 | MILITARY, CARGO, CARRIER |
| COLONIZER | 1500 | 15 | 1515 | 10 | 130 | 1815 | 3A | 341 | 0 | 500 | 6 | 0.01 | 0.07 | 0.33 | UTILITY |

### Titan And Prestige

| Ship | Build | Travel | OpCost | Base Alpha | Loaded Alpha | Loaded Cost | Hangar Load | Durability | Siege | Cargo | Hangar | BaseA/Op | LoadedA/LoadedCost | Cargo/Op | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| TITAN | 5400 | 27 | 5427 | 585 | 825 | 6027 | 6A | 2870.4 | 100 | 1000 | 12 | 0.11 | 0.14 | 0.18 | MILITARY, CARRIER |
| ARMAGEDDON_BOMBER | 6100 | 24 | 6124 | 393.5 | 553.5 | 6524 | 4A | 2318.4 | 950 | 1000 | 8 | 0.06 | 0.08 | 0.16 | MILITARY |
| BEHEMOTH | 6300 | 30 | 6330 | 856 | 856 | 6330 | 0A | 2649.6 | 0 | 1000 | 0 | 0.14 | 0.14 | 0.16 | MILITARY |
| FLEET_CARRIER | 4000 | 24 | 4024 | 70 | 1670 | 8024 | 40A | 2683.2 | 0 | 600 | 80 | 0.02 | 0.21 | 0.15 | MILITARY, UTILITY, CARRIER |
| MOTHER_SHIP | 80000 | 300 | 80300 | 5129 | 7129 | 85300 | 50A | 49000 | 2500 | 25000 | 100 | 0.06 | 0.08 | 0.31 | MILITARY, BOMBER, CARGO, UTILITY, CARRIER |

