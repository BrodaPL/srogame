Below is a revised version of your architecture concept, updated to reflect the structural issues we discussed and your clarification that the **Prioritization System is itself another subsystem**, while the **Supervisory System remains the final allocator and scheduler**.

---

# Revised AI Architecture Concept

## High-level structure

The AI is divided into specialized subsystems.
Each subsystem focuses on its own domain and generates proposals that are locally optimal from its perspective.

# Revised short summary

## Subsystem layers

* **1 Economic** — local economic growth
* **2 Defensive** — local protection
* **3 Warfare** — local military production execution
* **4 Strategic Development** — expansion and logistics
* **5 Strategic Military** — farms and neutral-target aggression
* **6 Strategic Diplomatic** — wars, alliances, player conflict
* **7 Critical** — deadlock and blocker resolution

## Control layers

* **8 Prioritization** — computes dynamic modifiers and context scores
* **9 Supervisory** — final allocator, scheduler, and commitment manager



The control flow is:

1. **Specialist subsystems (1–7)** generate goals and task proposals.
2. **Prioritization Subsystem (8)** analyzes the current context and produces dynamic weight modifiers.
3. **Supervisory System (9)** combines:

  * its own light base profile modifiers,
  * the dynamic modifiers from subsystem 8,
  * current resources,
  * current commitments,
  * accepted task memory,

   and makes the final decision about which tasks are accepted, funded, reserved, postponed, or rejected.

So the architecture has **one final decision-maker only**: the **Supervisory System**.

---

# Core design principles

## 1. Subsystems are specialists, not final authorities

Each subsystem should specialize only in its own domain.
It should not try to control the entire empire.

Its job is to:

* interpret its own slice of data,
* define a primary optimal objective,
* identify short-term actionable goals,
* submit candidate tasks.

## 2. The Prioritization Subsystem does not schedule tasks

Subsystem 8 does **not** directly allocate resources or approve actions.
It only evaluates context and produces **weight modifiers, urgency modifiers, and strategic context flags** for the Supervisory System.

## 3. The Supervisory System is the single scheduler

System 9 is the only system that:

* allocates resources,
* approves tasks,
* reserves resources for future tasks,
* resolves conflicts,
* handles task commitment and cancellation,
* enforces bot personality and long-term direction.

## 4. Weights are soft budget targets, not hard rules

Subsystem budget ranges such as 10–30% or 40–70% should be treated as **policy targets**, not rigid partitions.
Real allocation must depend on:

* valid opportunities,
* planet maturity,
* immediate threats,
* current logistics,
* deadlock risk,
* game stage.

## 5. Local-first by default, strategic preemption when necessary

Planetary development should usually be handled before global strategic activity, especially on immature planets.

---

# Subsystems

## 1) Economic Subsystem

**Scope:** strictly tied to one planet.

**Purpose:** develop and sustain the local economy of a planet.

**Current implemented goal model:** per planet, one `Primary goal`, one `Secondary goal`, and one immediate request for each selected goal.

### Responsibilities

* **Construction:** mines, energy, storage facilities, robot factory, nanite factory.
* **Production:** repair drones.
* **Research:** only strict prerequisite research that is required to progress an in-scope economic building goal.
* **Local optimization:** balance economy growth, energy stability, storage sufficiency, and industrial power.

### Current implemented planning rules

* It evaluates all in-scope local economic candidates independently for one planet.
* It expands prerequisite building chains and strict prerequisite research chains.
* It uses a branch-first local planner:

  * **Energy branch** when local energy is below target,
  * **Storage branch** when storage is insufficient,
  * **Economy branch** otherwise.

* It ranks candidates primarily by full-goal `Estimated Time Completion`.
* Current Economic `ETC` is **narrow ETC**:

  * throughput-only completion time,
  * no resource-wait simulation,
  * no future mine-income simulation.

* Throughput-affecting intermediate steps immediately change the ETC of later steps in the same dependency chain.
* It uses positive-only priority bonuses on top of ETC:

  * planetary production modifiers,
  * energy urgency inside the energy branch,
  * storage deficiency inside the storage branch,
  * explicit throughput bonus for `ROBOTICS_FACTORY` and `NANITE_FACTORY`.

* It sorts candidates best-to-worst.
* Top 1 becomes the planet `Primary goal`.
* Top 2 becomes the planet `Secondary goal`.
* It emits:

  * `Primary request`: immediate next actionable step toward the `Primary goal`
  * `Secondary request`: immediate next actionable step toward the `Secondary goal`

* If both goals share the same immediate next step, it emits one outward request and keeps both goal links in metadata.
* It also emits a first-class per-planet no-action / blocker result when no request can be made.

### Primary goal examples

* improve planetary economic output,
* unlock higher-tier production,
* stabilize energy, storage and industrial power.

---

## 2) Defensive Subsystem

**Scope:** strictly tied to one planet.

**Purpose:** secure a planet against attack and increase defensive resilience.

**Planned goal model:** per planet, one `Primary goal`, one `Secondary goal`, and one immediate request for each selected goal.

### Responsibilities

* **Construction:** `SHIPYARD`, `BUNKER_NETWORK`.
* **Production:** planetary defenses, excluding bombs.
* **Research:** only strict prerequisite research that is required to progress an in-scope defensive building or defense-production goal.
* **Local optimization:** maintain sufficient static defense and defensive infrastructure.

### Planned goal families

* **Unlocking goals**

  * unlock new defense tiers through prerequisite buildings or technologies,
  * derived from current planet unlock state only,
  * once a defense is unlocked on that planet, it cannot become locked again.

* **Building goals**

  * primarily `BUNKER_NETWORK`,
  * occasionally `SHIPYARD` when required for unlock progression.

* **Production goals**

  * produce already unlocked defenses in local batches.

### Planned local progress model

`Defensive` should use a dedicated local progress metric called `avg_industry`.

`avg_industry` rules:

* simple average after pre-multiplying selected building levels,
* include only buildings currently built on the planet,
* do not count missing buildings in the divisor,
* weighted buildings:

  * `FUSION_REACTOR * 1.25`
  * `NANITE_FACTORY * 2`

* included building set:

  * `METAL_MINE`
  * `CRYSTAL_MINE`
  * `DEUTERIUM_SYNTHESIZER`
  * `METAL_STORAGE`
  * `CRYSTAL_STORAGE`
  * `DEUTERIUM_TANK`
  * `SOLAR_WIND_GEOTHERMAL`
  * `NUCLEAR_PLANT`
  * `FUSION_REACTOR`
  * `ROBOTICS_FACTORY`
  * `SHIPYARD`
  * `NANITE_FACTORY`

Example:

* `METAL_MINE = 2`
* `METAL_STORAGE = 1`
* `NANITE_FACTORY = 1`
* `SOLAR_WIND_GEOTHERMAL = 5`

Then:

* `avg_industry = (2 + 1 + (1 * 2) + 5) / 4 = 2.5`

### Planned unlock order

Unlocking should be gated by `avg_industry`.

* `SAM` when `avg_industry >= 2`
* `LIGHT_BEAM` when `avg_industry >= 2.5`
* `ORBITAL_MISSILE_LAUNCHER` / `MEDIUM_BEAM` when `avg_industry >= 3.5`
* `HEAVY_ORBITAL_MISSILE_LAUNCHER` / `HEAVY_BEAM` / `RAIL_GUN_CANNON` when `avg_industry >= 5`

If multiple unlock goals open in the same `avg_industry` range, they should compete by current `ETC`.

### Planned bunker rules

`BUNKER_NETWORK` should usually stay around `1-2` levels below the planet local industry average.

It should also have an explicit maximum target level, influenced mainly by:

* planet size,
* amount of enemy attacks in the last `100` turns.

Base bunker max from planet size:

* planet size `<= 100` -> max level `2`
* then `+1` bunker max level for each `10` size above `100`

Attack-history additions in last `100` turns:

* `1-2` attacks -> `+1` max level
* `3-5` attacks -> `+2` max levels
* `6-15` attacks -> `+3` max levels
* `>15` attacks -> `+4` max levels

The same recent-attack signal should also increase bunker priority:

* each attack-history `+1` step gives `+50%` priority bonus to bunker-upgrade goals

### Planned bunker-vs-defense equilibrium

The subsystem should compare:

* `total_bunker_val` = total raw resource value invested into bunker improvements
* `total_def_val` = total raw resource value of currently installed local defenses

This should create an equilibrium between bunker investment and defense investment.

Scaled imbalance rule:

* for every `20%` imbalance, the other side gets `+10%` priority bonus
* if bunker value is too far ahead, defense-production goals gain priority
* if defense value is too far ahead, bunker goals gain priority

### Planned defense distribution rule

The subsystem should avoid degenerating into one dominant defense type only.

Distribution should:

* consider only currently unlocked defenses on that planet,
* use a light floor system,
* compare unlocked defenses by total installed raw resource value rather than by count.

### Planned production-order sizing

One defense production order should target roughly `1.0` to `2.0` turns of that planet local income.

This should be randomized inside that range, so local orders do not all collapse to one rigid size.

### Planned branch behavior

`Defensive` should use one mixed candidate pool, but choose final outputs through explicit local behavior rules:

* if the planet cannot currently build defenses:

  * propose one structural goal (`BUNKER_NETWORK` upgrade or unlock goal)
  * propose a second structural fallback goal

* if the planet can build defenses:

  * propose the best structural goal (`BUNKER_NETWORK` or unlock)
  * propose one defense-production goal

* if bunker upgrade is not available and unlock goals are not available:

  * propose two defense-production goals

Like `Economic`, `Defensive` should not manage resources itself.
It should only determine locally optimal defensive goals and immediate requests.

### Primary goal examples

* maintain minimum local defense thresholds.

---

## 3) Warfare Subsystem

**Scope:** strictly tied to one planet.

**Purpose:** act as the **local military-production planner** for a planet.

**Goal amount:** Main goal, secondary goal, short-term goals that lead to the main goal.

This subsystem should not define global war strategy.
Its role is to decide what the planet should build locally to improve military production capacity, unlock new ships, and maintain steady ship output.

### Responsibilities

* **Construction:** shipyard, nanite factory.
* **Production:** combat ships and cargo ships.
* **Local optimization:** convert local shipyard power into military output.

Like `Economic` and `Defensive`, this subsystem is self-sufficient.
It does not wait for a military-production quota from the Supervisory System.

### Goal families

`Warfare` should use three local goal families:

* `CAPACITY`
* `UNLOCK`
* `PRODUCTION`

`CAPACITY` means improving local ship-production throughput through:

* `SHIPYARD`
* `NANITE_FACTORY`

`UNLOCK` means unlocking additional ship types for future production.

`PRODUCTION` means immediate ship-production orders for already unlocked ships.

### Local readiness and progression

For now, `Warfare` should reuse `avg_industry` as its local progression metric.

Ship unlock progression should be hardcoded by threshold bands:

* the unlock threshold for a ship should equal that ship's `SHIPYARD` requirement
* if multiple ships open inside the same threshold band, they should compete by local `weightedEtc`

Capacity targets:

* `targetShipyard = round(avg_industry)`
* `targetNanite = targetShipyard / 2`

`NANITE_FACTORY` should remain in scope, but because it is much more expensive it should carry a permanent `20%` priority penalty.

### Production scope

Include:

* all combat ships
* cargo ships:
  * `TRANSPORTER`
  * `MASS_HAULER`
  * `CARGO_SUPPORT`

Exclude:

* everything else

Implementation should use explicit included ship-enum lists grouped by category:

* `combatShips`
* `cargoShips`

### Production distribution and order sizing

Ship production should use a soft distribution rule:

* compare current production balance by total invested ship value
* do not let one already unlocked ship type dominate forever unless it keeps winning clearly

One ship-production order should be sized from local income:

* choose a random target budget in the range:
  * `1 .. (1 + avg_industry)` turns of that planet income
* then:
  * `amount = floor(targetBudget / unitCost)`

### Output model

Unlike `Economic` and `Defensive`, `Warfare` should expose a wider immediate menu upward:

* `5 goals`
* `5 immediate requests`

Selection shape:

* up to `2` structural goals:
  * `CAPACITY`
  * `UNLOCK`
* fill the rest with `PRODUCTION` goals if possible
* if production cannot fully fill the list, more `UNLOCK` goals may appear

If at least one cargo ship is unlocked:

* reserve exactly `1` cargo production request in the visible list

### Structural visibility rule

If not all in-scope ships are unlocked yet, `Warfare` should not collapse into pure production too early.

Structural visibility should therefore remain allowed when:

* `bestStructuralWeightedEtc <= bestProductionWeightedEtc * 1.5`
* or no valid production goal exists

This keeps unlock/capacity progress visible without forcing obviously weak structural goals every turn.

### Primary goal examples

* increase local ship production capacity,
* unlock additional ships for production,
* produce a balanced local military and cargo roster.

---

## 4) Strategic Development Subsystem

**Scope:** global.

**Purpose:** manage empire-wide development and expansion.

**Goal amount:** Many goals (up to N goals, where N is the number of planets),

This subsystem is responsible for peaceful or infrastructure-driven expansion and for the economic integration of the empire.

### Responsibilities

* **Construction:** trade port, jump gate, research lab, sensor phalanx.
* **Production:** repair drones, transport ships, colonization ships.
* **Operations:**

  * analyze shortages and surpluses,
  * trade through trade ports,
  * order interplanetary transport,
  * plan colonization,
  * maintain spy missions on unoccupied planets.

### Phase split

For now this subsystem should stay as **one subsystem with two internal sections**:

* local development/planning,
* future global development missions.

Phase 1 should implement the local section first.
Global mission management should remain deferred, but can already emit analysis/debug-only output.

### Goal families

This subsystem should use:

* `BUILDING`
* `PRODUCTION`
* `LOGISTICS`
* `COLONIZATION`
* `INTEL`

For phase 1:

* `BUILDING` and `PRODUCTION` are the executable local families,
* `LOGISTICS`, `COLONIZATION`, and `INTEL` remain analysis/debug-only.

### Phase 1 local scope

Phase 1 should focus on **planet building/production/research** only.

The local building target set is:

* `INTERSTELLAR_TRADE_PORT`
* `JUMP_GATE`
* `RESEARCH_LAB`
* `SENSOR_PHALANX`

plus:

* any facility prerequisite chain required to reach those targets.

`RESEARCH_LAB` should be treated as just another building target.

Strict prerequisite research requests are allowed in the same style as the local subsystems.

### Phase 1 production scope

The local production target set is:

* `COLONIZER`
* `TRANSPORTER`
* `MASS_HAULER`
* `CARGO_SUPPORT`
* `REPAIR_DRONE`

Readiness gating should reuse `avg_industry`.

Per-ship readiness threshold should match the ship's `SHIPYARD` requirement.

Additional production rules:

* `COLONIZER` should only compete when the empire is below colony cap.
* `REPAIR_DRONE` should only be considered on low-industry or recently colonized planets, once those planets are actually capable of producing it.

### Phase 1 local output shape

Per planet, this subsystem should expose:

* up to `2` building goals,
* up to `2` production goals.

The building-side and production-side outputs should stay **separate**.

Reason:

* they use separate planet queues,
* they usually differ by an order of magnitude in resource cost,
* that separation should make later Supervisory decisions easier.

### Local priority notes

`Trade Port` should gain a local priority bonus in range:

* `0% .. 20%`

based on:

* high asymmetry between planetary resource modifiers.

Recommended first implementation:

* use `maxModifier - minModifier`.

`Sensor Phalanx` should gain a local priority bonus in range:

* `0% .. 30%`

based on:

* the same planetary factors that affect phalanx range / scan quality.

`Jump Gate` should gain a local priority bonus in range:

* `0% .. 30%`

based on:

* the same planetary factors that affect jump-gate capacity.

### Phase 2 global mission scope

Phase 2 should add executable global mission output for:

* `LOGISTICS`
* `INTEL`

`COLONIZATION` remains planned, but actual colonization launches should still be deferred until a later focused pass.

The local phase-1 building/production output should remain intact.
Phase 2 should add a **separate global mission-output section** instead of mixing missions into local per-planet queue outputs.

### Phase 2 executable mission types

Phase 2 executable mission types:

* `TRANSPORT`
* `ARMAMENT_DELIVERY`
* `SPY`

In this subsystem:

* `TRANSPORT` is used for resource-only support,
* `ARMAMENT_DELIVERY` is used when `REPAIR_DRONE`s are included and may also carry resources,
* `SPY` is used only for colonization-intel maintenance on unoccupied planets.

Important:

* `ARMAMENT_DELIVERY` already exists as a mission type and should be reused here.
* In `Strategic Development`, `ARMAMENT_DELIVERY` should carry only:

  * resources,
  * `REPAIR_DRONE`.

* `PLANETARY_BOMB`s and small-ship reinforcement should be handled by a different strategic subsystem.

### Phase 2 mission-output cap

The global mission section should use a soft cap:

```text
missionRequestCap =
  imperiumFleetCap * currentAvailabilityForThisSubsystem
  + ownedPlanetAmount
```

Where:

```text
imperiumFleetCap = 4 + COMPUTER_TECHNOLOGY
```

The intended default availability target for this subsystem is up to `40%` of fleet cap.

### Phase 2 logistics-source qualification

A planet should qualify as a support/logistics source only if:

* `avg_industry >= 4`,
* it has local surplus,
* it has a valid cargo or hangar-capacity fleet available.

Recently colonized or undeveloped planets are targets only, not sources.

For this subsystem, `recently colonized` means:

* `avg_industry < 2`

### Phase 2 repair-drone delivery priority

Repair-drone delivery should use hard priority bands:

1. planets with damaged buildings,
2. recently colonized / undeveloped planets,
3. planets with negative industry or shipyard planetary modifiers.

Target need should consider:

* missing building HP / repair workload,
* industry-capacity penalty modifiers,
* recently colonized status.

### Phase 2 resource shortage / surplus model

Target shortage should combine:

* queued building / production costs,
* modifier-adjusted local scarcity.

Source surplus should combine:

* modifier-adjusted resource dominance,
* reserve-floor safety.

Recommended reserve floor:

```text
reserveFloor = max(3 turns of local income, 25% of storage)
```

Undeveloped planets may always be intentionally oversupplied beyond storage capacity.

### Phase 2 payload rules

Resource payload:

```text
resourcePayload =
  min(targetShortage, sourceSurplus, fleetCargoCapacity)
```

Repair-drone payload rules:

* when drones are sent, use `ARMAMENT_DELIVERY`,
* one mission may carry both resources and `REPAIR_DRONE`s,
* send all available drones, limited by ship hangar capacity,
* do not drain the source if:

```text
sourceIndustryPower <= targetIndustryPower * 2
```

When both `TRANSPORT` and `ARMAMENT_DELIVERY` are valid:

* prefer `ARMAMENT_DELIVERY` whenever drones are included.

Overlapping logistics requests should merge by:

* source-target pair,
* mission type.

Mission generation should be mixed:

* source-first for exporting abundance,
* target-first for shortage / repair / industry-penalty support.

### Phase 2 intel / colonization loop

Colonization-intel maintenance should follow this loop:

1. scan all eligible unoccupied planets in radius `2 + P`, where `P` is current owned planet count,
2. treat a planet as needing scan when:

   * no relevant espionage report exists,
   * or the latest relevant report is older than `200` turns,

3. prefer never-scanned planets over stale-refresh scans,
4. rank colonization candidates by:

   * planet size,
   * positive planetary modifiers,
   * industry modifier weighted `x2.0`,
   * resource modifiers weighted `x1.5`,

5. reject colonization candidates smaller than `140`,
6. choose the best unoccupied colonization target later.

Spy origin for this loop:

* any valid probe source may be used.

### Phase 3 colonization execution

Once colonization intel is fresh enough, `Strategic Development` may emit one immediate `COLONIZE` mission request.

Rules:

* launch only when colony cap is free,
* launch only when there is no active pending colonization plan,
* choose from scanned candidates only,
* reject targets whose reported colonization difficulty exceeds current `ADAPTIVE_TECHNOLOGY`,
* rank valid targets by pure `colonizationScore`,
* take the top `2` valid targets and choose randomly between them,
* source may be any ready colonizer source,
* if possible, include bootstrap cargo inside the colonizer mission itself.

Current bootstrap cargo heuristic:

* use the agreed simple `400`-cargo split,
* try `133 metal`, `133 crystal`, `133 deuterium`,
* still allow the mission when no extra cargo can be loaded.

Deferred TODOs for this subsystem:

1. smarter bootstrap cargo planning,
2. post-colony follow-up support goals,
3. richer colonizer-source selection,
4. longer-run trace tuning on real saves.

### Architecture TODO

TODO:

Planet building requests and planet production requests already live on separate local queues.

Later strategic work will need a cleaner shared contract for:

* per-planet building queue,
* per-planet production queue,
* empire-wide research constraints,
* empire-wide fleet-cap constraints.

### Indicative fleet allocation

**10–30%**, treated as a soft target.

---

## 5) Strategic Military Subsystem

**Scope:** global.

**Purpose:** manage offensive operations against neutral type players (farms).

**Goal amount:** Many goals (up to M goals, where M is the number of localized farms),

This is the **global aggression planner** for non-bot or non-human type player targets.

This subsystem is not another local ship-building planner.
Local `UNLOCK` / `BUILDING` / `PRODUCTION` for combat fleets stays in the planetary-focused `Warfare` subsystem.
`Strategic Military` consumes already available fleets, discovers neutral farms, remembers them, breaks their initial defenses, and then schedules repeatable plunder runs.

### Responsibilities

* **Operations:**

  * send probes,
  * scan every planet in the galaxy and classify only `neutral` vs `not-neutral`,
  * search for planets owned by neutral type players (farms),
  * maintain a farm ledger for each discovered neutral planet,
  * evaluate neutral raid targets,
  * plan initial defense-break attacks,
  * plan repeatable plunder attacks after defenses are cleared,
  * emit ship-shortage demand when current fleets are insufficient for planned raids,
  * maintain intelligence on neutral planets.

### Current phase-1 operating model

Goal families:

* `INTEL`
* `BREAK`
* `PLUNDER`
* `SHIP_NEED`

Phase-1 mission scope:

* `SPY`
* `ATTACK`

Out of scope for this subsystem:

* `BOMBARD`
* `SIEGE`
* local ship unlock/building management
* multi-origin raid coordination
* military relocation by `MOVE` mission

Neutral-farm loop:

1. scan planets,
2. when a neutral-type planet is found, store it in subsystem memory,
3. if its initial ships or defenses still exist, treat it as a `BREAK` target,
4. once ships and defenses are both gone, treat it as a repeatable `PLUNDER` target,
5. estimate when it is worth attacking again and schedule farming attacks before storage is fully capped if travel time requires it.

Defense-break rule:

* estimate required firepower from known neutral ships and defenses,
* scale the requirement by `x1.5` for safety.

Repeatable plunder rule:

* use cargo ships plus `1-2` military ships,
* prioritize targets by expected current gain and readiness timing rather than by fresh repeated spy spam.

Farm memory should keep at least:

* coordinates,
* last spy turn,
* last attack turn,
* last successful plunder turn,
* known mine levels,
* known storage capacity,
* known bunker level,
* known planetary modifiers,
* known neutral ships,
* known neutral defenses,
* whether initial defense is already broken,
* estimated current stored resources,
* estimated next good attack turn,
* nearest / preferred owned source planets.

Current implementation note:

* the first executable `Strategic Military` slice already emits `SPY`, `BREAK`, `PLUNDER`, and `SHIP_NEED`,
* snapshot data for this subsystem should hold only currently visible facts,
* persistent remembered farm state now lives in `BotMemoryV2`.

Follow-up ledger rules:

* update farm memory from espionage reports, battle reports, and plunder reports,
* use only remembered / reported state for neutral ships, defenses, and resources,
* do not use hidden live neutral planet state for farming decisions,
* set `initialDefenseBroken` only when known ships and known defenses are both zero,
* keep `preferredOriginCoordinates` as a soft remembered recommendation until a clearly better origin appears.

Follow-up regrowth / timing rules:

* estimate farm regrowth from known mine levels and known planetary modifiers using existing in-game formulas,
* cap estimated stored resources by known storage capacity,
* after successful plunder, use exact reported leftover resources when available,
* reattack timing should use the earlier of:
  * storage-regrowth timing,
  * useful-cargo timing,
* useful-cargo timing means at least `50%` of currently available cargo capacity would be worth sending.

Follow-up `SHIP_NEED` rules:

* do not emit blocked mission proposals,
* emit `SHIP_NEED` instead when the best current farm action cannot launch,
* cap `SHIP_NEED` to:
  * maximum `1` shortage request per planet,
  * only the highest-priority shortage for that planet.

Priority notes:

* probe-stock management itself stays with `Critical`,
* this subsystem only consumes probes for farm discovery and refresh,
* after the whole galaxy is scanned, low-priority intel refresh should walk the oldest known intel first.

### Next phase: relocation-assisted `BREAK`

`BREAK` is a hard gate before `PLUNDER` is even considered.

That means:

* if a neutral planet still has known ships or known defenses, it must stay in `BREAK`,
* it must not compete in the `PLUNDER` pool yet,
* the subsystem should think only in `INTEL`, `BREAK`, or `SHIP_NEED` terms until that gate is cleared.

The next major slice after the current phase-1 implementation should be relocation-assisted `BREAK` preparation.

Next-phase mission scope:

* `SPY`
* `ATTACK`
* `MOVE`

Next-phase relocation rules:

* relocation should trigger when:
  * no single origin can satisfy the required `BREAK` force,
  * or regrouping to a nearer staging planet is better,
* current relocation scope should focus only on military ships required for `BREAK`,
* the main relocation use case should be:
  * gather a `BREAK` fleet on one nearby owned planet,
* the staging planet should be the owned planet minimizing total ETA from contributing fleets to the target,
* one blocked `BREAK` target may gather ships from multiple origins by `MOVE`,
* `SHIP_NEED` should be emitted only if regrouping still cannot satisfy `BREAK`.

Next-phase balancing rules:

* keep `BREAK` force sizing at estimated minimum `* 1.5`,
* after relocation is available, `BREAK` and `PLUNDER` should compete under a reserved split:
  * `60% BREAK`
  * `40% PLUNDER`,
* intel refresh should walk all known planets uniformly by oldest-first,
* keep separate confidence / reasoning for:
  * `BREAK` intel
  * `PLUNDER` intel.

Next-phase explicit non-goals:

* no multi-target coordinated attack waves,
* no cross-turn fleet reservation system,
* no escort-loss adaptive composition,
* no cargo-ship relocation yet; broader `PLUNDER` relocation remains a later follow-up.

### Indicative fleet allocation

**40–70%**, treated as a soft target.

---

## 6) Strategic Diplomatic Subsystem

**Scope:** global.

**Purpose:** manage wars against other players, support allies, and conduct military-diplomatic planning.

**Goal amount:** Many goals. TODO: it needs more detail.

This subsystem deals with real geopolitical conflict rather than simple raiding.
This system does not consider neutral type players (farms).

### Responsibilities

* **Construction:** bomb depot, alliance depot, jump gate.
* **Production:** military ships, bomber ships, spy probes, transport ships, planetary bombs.
* **Operations:**

  * send probes,
  * analyze the military-diplomatic situation,
  * attack enemies,
  * support allies,
  * plan bombardments,
  * plan sieges,
  * plan planetary defense,
  * maintain intelligence on other players’ planets.

### Indicative fleet allocation

**10–50%**, treated as a soft target.

---

## 7) Critical Subsystem

**Scope:** cross-cutting, empire-wide emergency and blocker resolution.

**Purpose:** detect and resolve deadlocks, hard blockers, and self-destructive states.

**Goal amount:** Many goals (up to N goals, where N is the number of planets),

This subsystem has override priority in emergencies, but it still submits proposals to the Supervisory System like the others.

It requests production of spy probes in small amounts (2-10), on developed planets so they always have few spy probes.

### Responsibilities

* detect:

  * energy starvation,
  * insufficient storage,
  * missing prerequisites,
  * stalled build queues,
  * lack of transport capacity,
  * inability to repair,
  * blocked research/build chains.
  * lack of building space on planets.
* **Construction:** energy, storage facilities, research lab, terraformer.
* **Operations:**

  * send probes,
  * send repair missions,
  * send special transport missions,
  * unblock critical planetary bottlenecks.

### Indicative fleet allocation

Fixed **minimum reserve around 5%**.

---

## 8) Prioritization Subsystem

**Scope:** global context evaluation.

**Purpose:** analyze the current empire-wide and planetary context and provide **dynamic scoring input** to the Supervisory System.

**Goal amount:** Don't have goals, just eveluate the current situation and adjusting weights.

This subsystem is not a scheduler.
It does not directly approve or reject tasks.

### Responsibilities

* evaluate:

  * whether a planet is under attack,
  * whether a planet is still in basic development,
  * whether the empire is at war,
  * whether allies require assistance,
  * whether new farms have appeared,
  * whether new players were discovered,
  * whether diplomacy changed,
  * current game stage,
  * maturity and specialization of each planet.
* produce:

  * subsystem weight modifiers,
  * urgency multipliers,
  * strategic context flags,
  * local vs strategic priority recommendations.

### Example output

* boost Economic on newly colonized planets,
* boost Defensive on threatened planets,
* boost Strategic Diplomatic during active war,
* suppress Strategic Military on unstable bootstrap planets,
* boost Critical when deadlock risk rises.

---

## 9) Supervisory System

**Scope:** empire-wide final control layer.

**Purpose:** remain the single final allocator, scheduler, and conflict resolver.

**Goal amount:** Don't have goals, it manages other subsystems goals.

This system sees proposals from all subsystems and decides what is actually executed.

### Responsibilities

* apply **light profile-based base weights** depending on bot archetype:

  * aggressive,
  * miner,
  * balanced,
  * opportunist,
  * defender, etc.
* ingest dynamic modifiers from subsystem 8,
* combine them with:

  * resource availability,
  * current commitments,
  * accepted task memory,
  * cancellation penalties,
  * planet maturity,
  * strategic urgency,
  * empire-wide reserve policy.
* approve or reject tasks,
* reserve resources for future accepted tasks,
* manage commitment stability,
* resolve conflicts between subsystems,
* keep memory of the latest accepted tasks and their owning goals.

---

# Goal model


Subsystems 1,2,3 are supposed to have one current main goal. Goal is optimal from its current perspective.
Subsystems 1,2,3 can have some secondary goals, for occasions when the main goal is blocked or currently ongoing.

Current implementation note:

* `Economic` already uses a slightly richer outward contract than this older wording.
* It exposes:

  * `Primary goal`
  * `Secondary goal`
  * `Primary request`
  * `Secondary request`

* The requests are immediate actionable steps toward those goals.
* This was chosen because the `Supervisory` layer benefits from seeing both the current action and the larger local goal it advances.
* If both goals share one immediate step, `Economic` emits one request with both goal links.
* `Defensive` is planned to follow the same outward contract as `Economic`.

Example:

* **Primary goal:** upgrade fusion reactor.
* **Blocker:** missing energy technology.
* **Primary request:** upgrade energy technology.
* **Primary request:** is being already in progress.
* **Secondary goal:** improve mines if energy is enough or upgrade other type energy buildings.
* **Secondary request:** immediate next actionable step toward that secondary goal.

---

# Standardized subsystem output

All specialist subsystems should produce proposals in a common format.

For building, production, fleet operations and technological research.

Current Economic implementation note:

* it additionally records per-planet local result metadata:

  * active branch,
  * emitted request count,
  * selected goal keys,
  * explicit no-action reason when blocked.

---

# Planet maturity model

The Supervisory System should not treat all planets equally.
Each planet should have a maturity stage, and that stage should influence which subsystems are allowed to claim major resources from it.

## Suggested stages

### 1. Bootstrap

**Mines level:** 0.0–3

New colony or very weak planet.
Focus:

* Energy,
* industrial power,
* storage,
* mines,

### 2. Stabilizing

**Mines level:** 3.1–4.0
Basic economy exists, but infrastructure is still incomplete.
Focus:

* Economic,
* minimal Defensive and initial ships,
* limited Strategic Development support.

### 3. Developed
**Mines level:** 4.1–5.5
The planet is economically stable and can meaningfully contribute.
Focus:

* all major systems can participate.

### 4. Military-capable

**Mines level:** 5.6–7.5
Planet can efficiently support offensive production and logistics.
Focus:

* Warfare,
* Strategic Military,
* Strategic Diplomatic,
* stronger Defenses,
* support logistics.

### 5. Strategic Hub
**Mines level:** >7.5
Highly developed core world or logistics center.
Focus:

* high-tier production (that requires long-term resources gathering),
* strategic deployment,
* advanced research,
* alliance support,
* strong defense,
* large-scale military ship production.

This is a cleaner solution than trying to solve everything through a rigid processing order alone.

---

# Weight and budget model

The Supervisory System should compute effective subsystem weights as:

**effective weight = profile base weight + prioritization modifiers + situational overrides**

Where:

* **profile base weight** comes from the bot archetype,
* **prioritization modifiers** come from subsystem 8,
* **situational overrides** come from emergencies, deadlocks, wars, or temporary strategic windows.

## Example

An aggressive profile may start with higher base weights for:

* Warfare,
* Strategic Military,
* Strategic Diplomatic.

A miner profile may start with higher base weights for:

* Economic,
* Strategic Development,
* Defensive.

But subsystem 8 may still temporarily override that tendency:

* if attacked, Defensive rises,
* if energy collapses, Critical rises,
* if a new colony is immature, Economic rises,
* if a rare raid window appears, Strategic Military rises.

---

# Resource reservation and commitments

The Supervisory System should not only spend current resources.
It should also:

* reserve resources for accepted future tasks,
* maintain protected budgets,
* avoid constant task cancellation and re-planning.

Each accepted task should store:

* reserved resources,
* ordering subsystem type,
* reserved ships,
* current execution state.

The memory of the last accepted tasks is useful, but it should be more than history.
It should support commitment stability and prevent thrashing.

The memory will be helpful for estimating if overall progress is allighend with weights.

---

# Anti-oscillation safeguards

Because the architecture is weight-driven, it is vulnerable to oscillation.
The system needs stabilizers.

## Recommended safeguards

* minimum commitment duration,
* cooldown on major weight changes,
* cancellation threshold,
* hysteresis on urgency transitions,
* protected minimum budgets,
* delayed reclaiming of reserved resources,
* “do not replace unless clearly better” logic.

Without these, the AI may constantly switch between economy, defense, and military production.

---

# Minimum guaranteed budgets

To prevent starvation, the Supervisory System should preserve minimum floors for essential functions, such as:

* economic maintenance,
* scouting,
* logistics,
* critical deadlock prevention,
* minimum planetary defense.

This is especially important for aggressive profiles, which would otherwise self-sabotage.

---

# Turn processing order

A good default turn order is:

## Phase 1: State analysis

* update intelligence,
* update planet maturity,
* update war/diplomacy/threat state,
* detect blockers and deadlocks.

## Phase 2: Specialist proposal generation

Subsystems 1–7 generate proposals.

## Phase 3: Prioritization analysis

Subsystem 8 computes:

* dynamic weight modifiers,
* urgency multipliers,
* context flags.

## Phase 4: Supervisory arbitration

System 9:

* applies base profile weights,
* applies prioritization modifiers,
* checks resources and commitments,
* selects accepted tasks,
* reserves resources.

## Phase 5: Planetary execution

For each planet:

* local build and production decisions are finalized first,
* especially for subsystems 1–3 and 7,
* unless strategic preemption is justified.

## Phase 6: Strategic execution

Then execute:

* Strategic Development,
* Strategic Military,
* Strategic Diplomatic,
* plus Critical missions that must be executed immediately.

This preserves your original intuition while allowing exceptions.

---

# Queue and task-count control

This is a major problem.
The system needs explicit caps.

* per-planet task caps,
* per-subsystem queue caps,
* global accepted task cap,
* deduplication rules,
* task merge rules,
* rejection of redundant low-value tasks.

This prevents combinatorial explosion.

---
