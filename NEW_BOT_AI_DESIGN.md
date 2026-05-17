Below is a revised version of your architecture concept, updated to reflect the structural issues we discussed and your clarification that the **Weight Manager System is itself another subsystem**, while the **Supervisory System remains the final allocator and scheduler**.

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

* **8 Weight Manager** — computes dynamic modifiers, subsystem weights, and context flags
* **9 Supervisory** — final allocator, scheduler, and commitment manager



The control flow is:

1. **Specialist subsystems (1–7)** generate goals and task proposals.
2. **Weight Manager Subsystem (8)** analyzes the current context and produces dynamic weight modifiers.
3. **Supervisory System (9)** combines:

  * its own light base profile modifiers,
  * the dynamic modifiers from subsystem 8,
  * current resources,
  * current commitments,
  * accepted task memory,

   and makes the final decision about which tasks are accepted, funded, reserved, postponed, or rejected.

So the architecture has **one final decision-maker only**: the **Supervisory System**.

Current implementation note:
- A dedicated `Research` subsystem now exists in the live V2 runtime.
- It runs before `Strategic Development`.
- Phase-1 scope is intentionally simple: at most one new global `RESEARCH` proposal per turn, optional helper labs at launch time, no building upgrades, no production proposals, and no helper reassignment yet.
- `Supervisor` still keeps the global cap of one newly accepted `RESEARCH` proposal per turn, but now weights `RESEARCH` as a first-class subsystem and boosts exact same-technology overlap across subsystem proposals.

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

## 2. The Weight Manager Subsystem does not schedule tasks

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

### Phase-2 scope: real-player espionage planning

The next `Strategic Diplomatic` slice should still avoid real war missions.

Phase 2 should add:

* direct `SPY` mission planning against discovered non-neutral factions,
* probe-demand planning,
* refinement of phase-1 diplomatic judgments from improved espionage coverage.

### Phase-2 outputs

Phase-2 should emit:

* immediate `SPY` mission requests,
* probe `SHIP_NEED` requests,
* updated diplomatic summaries.

### Phase-2 target priorities

All discovered factions stay in scope, but with weighted priority:

* `ALLIED`: `5%`
* `PEACE`: `10%`
* `NEUTRAL`: `25%`
* `WAR`: `60%`

### Phase-2 spy-planning rules

Spy missions should optimize for:

* best intel gain per probe spent.

Probe count should use:

* minimum probes needed to reach the intended report depth,
* plus a safety margin,
* while still respecting affordability.

This means:

* phase 2 should not blindly throw `120` probes at technically difficult targets if that is a poor trade,
* desired report depth must stay constrained by actual empire capacity.

### Phase-2 target-depth model

Use different desired report depth by diplomatic status.

Also treat intel as insufficient when it is:

* too old,
* too shallow,
* or too sparse across that faction's planets.

Staleness windows should differ by diplomatic status and should be fairly long-term rather than overly aggressive.

### Enemy espionage-superiority signal

Phase 2 should explicitly estimate when an enemy appears to have espionage superiority.

Example signal:

* even large probe groups still fail to produce sufficiently deep reports.

That should feed later diplomatic and military planning.

### Probe-demand model

Probe `SHIP_NEED` should be:

* outwarded per planet,
* but derived from a global diplomatic probe deficit.

Total planned probe need should be capped by the strongest production base currently available:

* let `highestAvgIndustry` be the highest owned-planet `avg_industry`,
* cap planned diplomatic probe need at:
  * `2 * highestAvgIndustry + highestAvgIndustry^2`

Separate outward probe-demand requests should be capped to:

* maximum `2` per-planet requests.

### Phase-2 non-goals

Still out of scope:

* `ATTACK`
* `SUPPORT`
* `BOMBARD`
* `SIEGE`

### Phase-3 note

After this espionage-planning slice, the next major phase should be:

* combined enemy-attack and allied-support planning.

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

**Goal amount:** Many goals.

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

### Phase-1 scope: diplomatic management first

The first executable `Strategic Diplomatic` slice should **not** be a mission subsystem yet.

Phase 1 should focus on:

* managing diplomatic relations with discovered non-neutral players and bots,
* estimating the current geopolitical situation,
* evaluating strength / weakness / winning / losing status against each discovered faction,
* deciding preferred diplomatic directions,
* proposing diplomatic-state changes,
* exposing the diplomatic situation upward to `Supervisor` and the later weight-management subsystem.

Phase-1 should **not** yet execute:

* attack missions,
* support missions,
* bombardment missions,
* siege missions,
* direct building requests,
* direct `SHIP_NEED` / bomb / probe production pressure.

### Phase-1 outputs

Phase-1 should emit:

* diplomatic action proposals,
* global diplomatic situation summary,
* per-faction diplomatic summary.

### Phase-1 action scope

Allowed proposal families:

* diplomatic relation changes,
* proposal-management preferences,
* retaliation flags.

Relation changes should stay adjacent-only:

* escalation:
  * `ALLIED -> PEACE -> NEUTRAL -> WAR`
* deescalation:
  * `WAR -> NEUTRAL -> PEACE -> ALLIED`

### Phase-1 target scope

Track only:

* discovered non-neutral human players,
* discovered non-neutral bot players.

Do not track neutral-planet-type empires here.

### Phase-1 evaluation model

Per discovered faction, subsystem should maintain:

* a strength estimate,
* a stance score,
* a hostility score,
* a confidence level.

Strength estimate inputs should include:

* planet count,
* average development,
* espionage quality gap,
* battle reports,
* recent hostile-action history.

Stance-score math should be layered:

* personality bias,
* relative strength bias,
* recent hostility,
* current relation tension,
* ally / network pressure,
* confidence penalty.

Winning / losing estimation should include:

* relative strength estimate,
* recent battle outcomes,
* recent hostile actions.

### Personality target-state model

Use a hybrid model:

* `aggressive` wants at least one active war most of the time,
* `miner` prefers alliance and peace over war,
* `diplomat` prefers alliance-building first and selective war later,
* `isolationist` prefers neutrality or peace,
* `balanced` prefers war mainly against weaker opponents.

Phase-1 diplomatic proposal priority should be based on:

* stance score,
* confidence,
* personality target deficit.

### Hostility escalation rule

Do not escalate to `WAR` from one small hostile event alone.

Use accumulated hostility:

* hostile actions should add escalation pressure,
* repeated hostility should increase it further,
* only sufficient accumulated hostility should make `WAR` a top diplomatic action.

### Upward summary contract

This subsystem should expose enough summary data for `Supervisor` and the future weight-management subsystem.

Recommended global summary fields:

* count of `WAR`,
* count of `ALLIED`,
* count of `PEACE`,
* count of `NEUTRAL`,
* strongest enemy estimate,
* weakest enemy estimate,
* whether we are winning any war,
* whether we are losing any war,
* whether we lack allies,
* top escalation target,
* top deescalation target,
* top alliance target,
* overall diplomatic pressure score.

### Deferred future notes

Later phases should add:

* special multi-probe espionage planning against real players,
* attack / support / bombard / siege mission planning,
* direct building pressure for `BOMB_DEPOT`, `ALLIANCE_DEPOT`, and `JUMP_GATE`,
* direct `SHIP_NEED` / probe / bomb pressure,
* tributes / bribes / negotiated payments to influence diplomatic-state changes.

### Phase-2 scope: real-player espionage planning

The next `Strategic Diplomatic` slice should add real-player espionage planning, but still avoid war/support execution.

Phase 2 should add:

* weighted `SPY` mission planning against all discovered factions,
* probe `SHIP_NEED` pressure,
* diplomatic-summary refinement from fresher / deeper reports,
* explicit estimation of enemy espionage superiority.

Status priority weights:

* `ALLIED 5%`
* `PEACE 10%`
* `NEUTRAL 25%`
* `WAR 60%`

Probe planning should:

* optimize for intel gain per probe spent,
* use minimum probes needed plus safety margin,
* stay affordability-aware,
* cap total planned diplomatic probe pressure by:

```text
2 * highestAvgIndustry + highestAvgIndustry^2
```

Probe shortage should still be outwarded per planet, but derived from global diplomatic need.

### Phase-3 scope: attack and allied support planning

After espionage planning, the next major `Strategic Diplomatic` slice should add:

* `ATTACK`
* `GUARD`
* `REPAIR`

This phase should emit:

* immediate mission requests,
* exact-ship-type `SHIP_NEED`

It should not yet add:

* `BOMBARD`
* `SIEGE`
* relocation `MOVE`
* `ARMAMENT_DELIVERY`

#### Offensive target scope

Allow attack planning for:

* `WAR`
* hostile `NEUTRAL` with high hostility
* `NEUTRAL` clearly weaker than us

Concrete first-pass rules:

* high hostility means `hostilityScore >= 50`
* clearly weaker means `ourStrength >= theirStrength * 1.5`

Attack targets must have:

* espionage data, or
* battle data

No blind attacks.

#### Scout-by-battle

Before a full attack, subsystem may perform a special battle-scout attack when:

* target is `WAR`, or hostile/weaker `NEUTRAL`
* espionage exists
* but military-state confidence is still low

Use exactly one medium combat ship, with fixed preference:

* `CRUISER`
* then `BATTLE_SHIP`
* then `FRIGATE`

#### Offensive force sizing

Normal attack force should be based on estimated minimum force, but allow a wider aggression band:

* roughly `0.8 .. 2.0`

This phase should therefore support both:

* very small battle-scout attacks
* stronger confidence attacks with larger margins

#### Allied support scope

Support planning should target:

* `ALLIED` factions only

Support targets become valid through:

* explicit support requests
* visible need

Visible need should strongly favor:

* damaged allied planets
* recently attacked allied planets

`REPAIR` priority should combine both, with damaged buildings first.

#### Dynamic attack / support split

Static percentage split is too crude here.

Use a dynamic split driven by:

* global war state
* ally distress

First-pass split targets:

* winning: `70 / 30`
* balanced: `60 / 40`
* losing: `40 / 60`

`winning / balanced / losing` should consider:

* relative strength
* recent battle outcomes
* active hostile pressure
* recent building damage on our side or hostile side

### Phase-4 scope: force projection and escalation tools

After direct `ATTACK` / allied support planning, the next major `Strategic Diplomatic` slice should add:

* `BOMBARD`
* `SIEGE`
* `MOVE`
* `ARMAMENT_DELIVERY`

This phase should emit:

* immediate mission requests
* exact-ship-type `SHIP_NEED`
* direct building requests
* `PLANETARY_BOMB` production pressure

#### Phase-4 local pressure types

Allow direct local pressure for:

* `BOMB_DEPOT`
* `ALLIANCE_DEPOT`
* `JUMP_GATE`
* `PLANETARY_BOMB` production

#### Phase-4 mission target scope

Mission-family scope should split like this:

* `ATTACK` keeps its current broader scope
* `BOMBARD` is `WAR` only
* `SIEGE` is `WAR` only
* explicit hostility gates now apply:
  * `BOMBARD` requires hostility `>= 35`
  * `SIEGE` requires hostility `>= 60`
* when a target is siege-eligible but siege hostility is still too low, the subsystem should fall back to `BOMBARD`

#### Phase-4 mission meaning

Planning should distinguish:

* `BOMBARD` = shorter sharper structural strike
* `SIEGE` = persistent orbit pressure aimed at complete target destruction

`SIEGE` must also account for the fact that the orbiting siege fleet can be exposed to enemy relief attacks.
Also remember:

* hostile orbiting fleets must be fully defeated before siege can really start

#### Phase-4 relocation rules

`MOVE` should be allowed when:

* no single origin can satisfy the desired mission
* or regrouping on a nearer hub is better than direct launch

Staging-planet choice should use:

* best staging hub by ETA
* plus `JUMP_GATE` / `ALLIANCE_DEPOT` readiness

Jump Gate travel between own planets can collapse ETA to `1` turn and should influence staging value directly.

TODO:

* clarify and later implement whether allied Jump Gate travel should provide the same ETA reduction between allied planets

#### Phase-4 armament-delivery meaning

In this subsystem, `ARMAMENT_DELIVERY` should carry:

* `PLANETARY_BOMB`
* small war ships
* repair / defense reinforcement

Valid targets:

* own planets
* allied planets

Priority between own and allied targets should be:

* pure need-score competition

#### Phase-4 planetary-bomb pressure model

`PLANETARY_BOMB` pressure should use a hybrid model:

* exact blocked-plan bomb demand
* plus readiness stock

Readiness stock should be based on:

* active war count
* fixed stock per strategic hub

Always respect:

* the local `PLANETARY_BOMB` cap from `BOMB_DEPOT`

Stock goals should be interpreted mainly as `%` of local bomb capacity:

* during active war: target near `90%`
* with allies but no war: target roughly `30%–50%`
* with peace only: target roughly `10%–20%`

#### Phase-4 family competition

Mission-family competition should remain:

* dynamic
* war-state-driven

Do not fall back to one rigid static split.

#### Phase-4 explicit non-goals

Still out of scope:

* no cross-turn reservation system yet
* no multi-target synchronized waves yet
* no allied / peace hostile-activity auto-sharing execution yet

### Phase-5 scope: pre-break concentration

After force projection and escalation tools, the next major `Strategic Diplomatic` slice should be a **tight pre-break concentration phase**.

This phase should focus only on:

* gathering one bigger war-breaking fleet
* choosing one primary hostile target
* preferring one concentrated strike over several smaller pre-break attacks

This phase should execute:

* `MOVE`
* `ATTACK`

It should **not** expand `BOMBARD` / `SIEGE` further here.

#### Phase-5 campaign sequence

Campaign order should be:

1. pre-break concentration
2. try to break the target
3. only later, in another phase, switch to smaller repeat attacks after the target is opened

That later post-break phase may use:

* smaller mixed war fleets
* some cargo ships
* both ship-fight-capable and bombardment-capable pressure

But that belongs to a separate later slice.

#### Phase-5 primary target rule

This phase should keep:

* one global primary war-break target for the subsystem

That target should persist for:

* a randomized `3 .. 10` turns
* unless invalidated earlier

Immediate invalidation triggers:

* fresh intel shows it is no longer favorable
* required concentrated force is no longer reachable
* diplomatic status changed

#### Phase-5 target evaluation

A target should only be worth concentrated pre-break pressure when:

* `targetValue >= expectedLosses * V`

Where:

* `V` is randomized in range `1.25 .. 1.5`
* not one fixed hardcoded constant

Target value should consider:

* known ships value
* known defenses value
* planet development value
* diplomatic pressure

Expected losses should use:

* actual battle-simulator estimate if available

#### Phase-5 concentration rule

Pre-break planning should:

* prefer one concentrated attack
* only fall back when concentration is not good enough

If a direct `ATTACK` is already possible without relocation:

* choose randomly only among near-equal options between attacking now and concentrating more

#### Phase-5 relocation rule

Relocation should trigger when:

* no single origin can satisfy the preferred pre-break attack
* or a regrouped nearer hub produces a better concentrated strike

Staging choice should still use:

* best owned hub by contributor ETA
* plus `JUMP_GATE` / `ALLIANCE_DEPOT` readiness

#### Phase-5 output cap

This phase should outward at most:

* one primary `MOVE` bundle
* one primary `ATTACK`

`SHIP_NEED` should be emitted:

* only after relocation options are exhausted

#### Phase-5 deferred follow-up

Still defer to the following phase:

* post-break smaller repeat attacks
* cargo-supported war raids
* ambush-risk control
* opened-target pacing

### Phase-6 scope: post-break war pressure

After pre-break concentration, the next `Strategic Diplomatic` slice should be a **post-break war-pressure phase**.

This phase should focus on:

* repeated post-break `ATTACK`
* cargo-supported war raids
* ambush-risk control

This phase should execute:

* `ATTACK`

It should not re-expand `MOVE`, `BOMBARD`, or `SIEGE` here.

Current implementation note:

* phase 6 now also consumes the live per-faction `warAdvantageLevel` as extra raid-scoring context
* it still does not define a broader doctrine table or campaign-state machine yet

#### Phase-6 opened-target gate

This phase may attack a target only after the subsystem is sure the target planet is opened.

Opened means:

* known ships on the targeted planet are `0`
* known defenses on the targeted planet are `0`

That certainty may come from:

* the latest battle report
* or the latest fresh spy report

Either source is sufficient if it clearly confirms zero ships and zero defenses.

#### Phase-6 raid fleet shape

Post-break raid fleets should use:

* cargo ships
* plus variable military cover

Military cover should be sized by:

* minimum combat package per target-risk band

Cargo should be brought only up to:

* estimated plunder

More cargo than that does not increase reward.

#### Phase-6 raid scoring

Repeated post-break attacks should optimize:

* `plunder - travel churn - ambush risk`

High-hostility `NEUTRAL` targets may still be attacked, but while any active `WAR` exists they should receive:

* a large `-40%` score penalty

So they stay low priority relative to real war fronts.

#### Phase-6 ambush-risk model

Ambush risk should be driven by:

* enemy overall strength
* attack frequency
* nearby hostile planet coverage

Risk should rise fastest from:

* many recent raids on the same target
* recent hostile battle activity near the target
* strong nearby enemy planets

Risk should decay by:

* fixed `-10` per quiet turn
* plus bumps from new hostile evidence

When ambush risk reaches:

* `>= 70`

The subsystem should:

* pause raids on that target

If no valid post-break raid targets remain, it should fall back to:

* `SPY` on current `WAR` targets
* plus high-hostility `NEUTRAL` targets only when already part of current operations

#### Phase-6 break-vs-raid caps

This phase should keep separate caps for:

* `BREAK`
* opened-target raids

`BREAK` attempts should still be capped at:

* max `2`

Opened-war raid targets may be active up to:

* `floor(sqrt(ownedPlanetsCount)) + 1`

But concentrated `BREAK` attempts should still preferably stay at:

* only `1` or `2`

#### Phase-6 operational memory

This phase should introduce an opened-target operational ledger per target with fields such as:

* target coordinates
* target player id
* last post-break attack turn
* recent raid count in a rolling window
* current ambush-risk score
* `pausedUntilTurn`
* last known preferred raid origin
* last known estimated plunder value

The recent-raid rolling window should depend on solar-system distance:

* linearly from `5` turns at distance `1`
* up to `25` turns at maximum galaxy distance

### Phase-7 scope: war-exit pressure and hostility rebalancing

After post-break raids, the next `Strategic Diplomatic` slice should be a **war-exit pressure and hostility-rebalancing phase**.

This phase should focus on:

* hostility rebalancing from coercive war actions
* diplomatic deescalation readiness
* campaign-state pacing between continued pressure and war exit

This phase should not introduce new mission families first.

It should instead change how the subsystem interprets:

* successful `BOMBARD`
* successful `SIEGE`
* incoming enemy coercion
* losing-vs-winning war posture

#### Phase-7 outgoing coercion effects

Successful outgoing coercion should reduce our hostility toward the enemy.

Current live extension:

* successful outgoing plunder also reduces hostility when the plunder is meaningful
* enemy ship losses reduce hostility immediately
* meaningful outgoing structural damage reduces hostility
* successful `BOMBARD` / `SIEGE` damage reduces hostility on both sides

Successful `BOMBARD` should apply:

* base hostility decrease `-5`
* plus `0.5` hostility points per `1%` inflicted damage

Successful `SIEGE` should apply per successful orbit turn:

* base hostility decrease `-3`
* plus `0.5` hostility points per `1%` inflicted damage

This should use mission report outcome and percentage damage, because raw building HP scales strongly with upgrade level.

#### Phase-7 incoming coercion effects

Enemy coercion against us should increase hostility toward that enemy.

Current live extension:

* incoming plunder increases hostility when we are not losing
* incoming plunder decreases hostility when we are already losing

Enemy successful `BOMBARD` should apply:

* base hostility increase `+8`
* plus `0.5` hostility points per `1%` inflicted damage

Enemy successful `SIEGE` should apply per successful orbit turn:

* base hostility increase `+4`
* plus `0.5` hostility points per `1%` inflicted damage

Incoming enemy coercion should also:

* increase retaliation pressure

#### Phase-7 war-evaluation windows

This phase should evaluate war state in two windows:

* short-term `20` turns
* long-term `100` turns

War evaluation should run every:

* `20` turns

Current live extension:

* the same cadence now persists `warAdvantageLevel` on `-2 .. +2`
* score-band mapping is:
  * `<= -60 -> -2`
  * `-59 .. -20 -> -1`
  * `-19 .. +19 -> 0`
  * `+20 .. +59 -> +1`
  * `>= +60 -> +2`

The combined war score should be:

* normalized `-100 .. +100`
* weighted `60%` long-term
* weighted `40%` short-term

Classification should be:

* `>= 20` winning
* `<= -20` losing
* otherwise balanced

#### Phase-7 losing-war response

If the war evaluation says we are losing, the subsystem should reduce hostility to reopen deescalation opportunities.

At each evaluation while losing, apply:

* hostility decay `-10`

Current live extension:

* hostility decay now also keys off `warAdvantageLevel`
* decay applies at `-1`
* stronger decay applies at `-2`

There should be no separate hard deescalation-block timer.

Instead:

* recent enemy `BOMBARD` / `SIEGE`
* should directly worsen the short-term `20`-turn war score
* and increase retaliation pressure

#### Phase-7 deescalation path

Deescalation should remain adjacent-only and should prefer:

* `WAR -> NEUTRAL`
* then later `NEUTRAL -> PEACE`

If coercion succeeds and hostility falls enough, the subsystem should:

* allow
* but not force
* `NEUTRAL` proposals

#### Phase-7 war-pressure memory

This phase should add a per-faction operational war-pressure ledger with fields such as:

* `lastSuccessfulBombardTurn`
* `lastSuccessfulSiegeTickTurn`
* `recentOutgoingCoercionPressure`
* `recentIncomingCoercionPressure`
* `lastWarEvaluationTurn`
* `shortWindowWarScore`
* `longWindowWarScore`
* `warAdvantageLevel`
* `currentWarExitPressure`

Outgoing coercion pressure should use a hybrid model:

* actual hostility swing
* plus inflicted damage percentage

#### Next phase: shared war awareness

After war-exit pressure, the next `Strategic Diplomatic` slice should add **shared war awareness**.

This phase should focus on:

* automatic hostile-activity sharing between `ALLIED` and `PEACE` contacts,
* copied hostile battle / bombardment / siege reports for human `ALLIED` / `PEACE` contacts,
* bot-side summarized shared hostile intel instead of raw copied reports,
* immediate hostility impact from shared hostile activity,
* score modifiers for military planning based on shared hostile activity.

#### Shared hostile-activity scope

The phase should share:

* battle reports,
* bombardment reports,
* siege reports.

It should not add attack-intent prediction yet.

#### Shared-awareness relation scope

Hostile-activity sharing should be:

* automatic for `ALLIED`,
* automatic for `PEACE`,
* two-way always.

#### Human-vs-bot delivery rule

Human recipients should receive:

* copied hostile battle reports,
* copied hostile bombardment / siege reports.

Bots should receive:

* summarized shared hostile intel only.

#### Shared hostile-intel shape

Bot-side shared awareness should use:

* per-faction hostile-event counters,
* plus a per-planet hostile-event ledger.

An operational shared hostile-event ledger should include fields such as:

* foreign attacker player id,
* victim player id,
* target coordinates,
* event type: `BATTLE` / `BOMBARD` / `SIEGE`,
* event turn,
* `sharedFromPlayerId`,
* severity estimate,
* propagation marker / propagation turn.

#### Shared hostility impact

Shared hostile intel should affect diplomatic hostility immediately.

Its weight should depend on relation:

* direct self-hit = `100%`,
* shared from `ALLIED` = `40%`,
* shared from `PEACE` = `10%`.

#### Military-planning impact

Shared hostile intel should also influence military planning in the same phase,
but only as score modifiers.

It should not unlock new mission-legality rules yet.

#### Next phase: allied-cooperation execution

After shared war awareness, `Strategic Diplomatic` adds **allied-cooperation planning**. Incoming request decisions are now implemented for Jump Gate, Maintenance, and Support requests; outgoing Support request creation is now executable through `REQUEST_CREATION` proposals. Pending treaty proposals across the full `PEACE` / `ALLIED` / `NEUTRAL` / `WAR` ladder are executable through `DIPLOMACY_DECISION` proposals owned by Strategic Diplomatic policy. Outgoing treaty creation is executable through `DIPLOMACY_PROPOSAL` proposals, with Strategic Diplomatic emitting at most one best outgoing treaty proposal per turn. Outgoing Maintenance requests and standalone Jump Gate request creation remain deferred.

Current treaty policy rules:

* bots may propose `WAR` against clearly weaker factions, with the advantage threshold adjusted by bot personality,
* weaker bots bias harder toward alliance-seeking,
* winning a damaging war can place the beaten target under temporary non-aggression treatment for roughly `40-100` turns, modified by personality,
* temporary non-aggression suppresses renewed `WAR` proposals and favors `WAR -> NEUTRAL` deescalation,
* pending incoming or outgoing treaty proposals suppress only the same pair,
* TODO: later coalition policy should let weaker bots seek alliances to contain a much stronger player.

The current executable request-creation slice focuses on:

* outgoing support requests,
* and request-driven cooperation instead of global multi-front orchestration.

Deferred follow-ups remain:

* `ALLIANCE_DEPOT` usage beyond current request decisions,
* richer incoming-request acceptance,
* outgoing Maintenance request creation if a subsystem proves it needs it.

It should outward:

* `PLANET_DEFENSE`,
* `PLANET_REPAIR`,
* `ATTACK_TARGET`,
* `BOMBARD_TARGET`,
* `SIEGE_TARGET`,
* and only extreme-case `RESOURCE_SUPPORT`.

Recipient scope should be:

* offensive requests: `ALLIED` only,
* defensive / repair / resource requests: `ALLIED`, `PEACE`, and `NEUTRAL`.

Answering non-offensive requests should:

* improve friendliness,
* reduce hostility.

The request triggers should be:

* `PLANET_DEFENSE`
  * recent hostile attack,
  * no valid local guard fleet,
  * local defense below estimated hostile pressure,
  * important strategic hub.
* `PLANET_REPAIR`
  * more than `35%` total HP loss,
  * cannot repair more than `15%` of missing HP within `5` turns,
  * and cannot deliver enough repair drones from other own planets.
* offensive support
  * blocked `ATTACK` / `BOMBARD` / `SIEGE`,
  * plus intel that enemy fleet/defenses are weak enough to make allied help worthwhile.
* `RESOURCE_SUPPORT`
  * only for extreme shortages,
  * when the planet cannot afford current queue plus fuel baseline,
  * or near-zero deuterium / emergency resource state is reached.

Request emission should stay tight:

* max `1` outgoing support request total per turn.

Helper selection should use:

* non-offensive requests:
  * known capability,
  * relation strength,
  * distance.
* offensive requests:
  * known capability,
  * distance,
  * relation strength.

`ALLIANCE_DEPOT` should:

* improve support and maintenance attractiveness,
* and raise the chance that support requests are worth sending or accepting.

Explicit non-goals:

* no multi-front global allocator now,
* no synchronized ally war waves,
* no ally-to-ally autonomous campaign planner.

Only add a TODO note that a **multi-front global allocator** is a far-future possibility.

### Indicative fleet allocation

**10–50%**, treated as a soft target.

---

## 7) Critical Subsystem

**Scope:** cross-cutting, empire-wide emergency and blocker resolution.

**Purpose:** detect and resolve deadlocks, hard blockers, and self-destructive states.

**Goal amount:** emergency-only unblock goals, not a normal growth planner.

This subsystem is not a normal growth or war planner.
It should wake up only when the empire is entering collapse or when normal subsystems cannot recover on their own.

It still stays proposal-only:

* it does not execute commands,
* it does not auto-accept itself,
* it does not answer requests directly,
* it only emits explicit `CRITICAL` proposals for the later `Supervisor`.

### Responsibilities

* detect:

  * `ENERGY_DEADLOCK`,
  * `STORAGE_DEADLOCK`,
  * `INDUSTRY_CHAIN_DEADLOCK`,
  * `LOGISTICS_DEADLOCK`,
  * `INTEL_DEADLOCK`.

### Phase-1 blocker families

Phase 1 should be:

* emergency detection,
* unblock proposals,
* no emergency mission proposals yet.

Blocked families should use explicit family tags:

* `ENERGY_DEADLOCK`
* `STORAGE_DEADLOCK`
* `INDUSTRY_CHAIN_DEADLOCK`
* `LOGISTICS_DEADLOCK`
* `INTEL_DEADLOCK`

Priority order:

* `ENERGY`
* `STORAGE`
* `INDUSTRY_CHAIN`
* `LOGISTICS`
* `INTEL`

### What phase 1 may propose

Allowed proposal families:

* `BUILDING`
* `RESEARCH`
* `SHIPYARD`

Not in phase 1:

* combat rescue missions,
* emergency fleet-mission execution,
* request answering,
* proposal acceptance or execution logic.

### Detection rules

`ENERGY_DEADLOCK`:

* `energyGap > 0`
* and the recovery is not already:
  * in the building queue
  * or in visible subsystem proposals

`STORAGE_DEADLOCK`:

* per resource type
* if blocked request cost `* 1.5` exceeds the current relevant storage capacity on that planet
* a single resource failing is enough

`INDUSTRY_CHAIN_DEADLOCK`:

Core infrastructure set:

* `ROBOTICS_FACTORY`
* `SHIPYARD`
* `RESEARCH_LAB`
* `NANITE_FACTORY`

Detection logic:

* missing required prerequisite chain for blocked recovery
* or core infrastructure lagging badly compared with the average `ETC` of other industry buildings except storages

This should use `ETC`, not `avg_industry`.

Future TODO:

* later also consider all `3` mine types in deeper industry-chain reasoning

`LOGISTICS_DEADLOCK`:

* no inactive cargo ships available anywhere
* when a critical logistics transfer is already needed/proposed

Cargo-capacity carriers in scope:

* `TRANSPORTER`
* `MASS_HAULER`
* `CARGO_SUPPORT`

This deadlock is about missing cargo capacity, not about one exact ship type.

Critical logistics scope for phase 1:

* emergency resource transfer need
* emergency repair-drone transfer need

Repair-drone transfer note:

* repair drones should be treated as movable only via carriers / battleships / fleet carriers

`INTEL_DEADLOCK`:

* no `SPY_PROBE` available anywhere
* while strategic intel targets still need scan coverage

### Emergency repair-drone production

Phase 1 may propose emergency `REPAIR_DRONE` production, but only:

* on safe mature planets,
* when another planet is heavily damaged,
* and there are no repair drones available to relocate.

Safe mature planet means:

* `maturePlanet`
* not `inDangerPlanet`
* not `constantlyAttackedPlanet`

Heavy damage means:

* more than `35%` structural HP missing
* and local full repair would take more than `20` turns

### Blocker ledger

Phase 1 should persist a full operational blocker ledger.

Suggested fields:

* blocker key
* blocker family
* target planet coordinates or `null`
* firstSeenTurn
* lastSeenTurn
* severity
* timesEmitted
* lastProposalTurn
* resolvedTurn
* active

Severity should be normalized to `0..100`.

### Output caps

Phase 1 should emit:

* max `2` global Critical proposals
* plus max `1` per planet

### Phase 2: emergency mission response

Phase 2 extends `Critical` into a narrow emergency mission-response layer.

It still remains proposal-only:

* no proposal acceptance,
* no execution,
* no request answering.

It is not a general mission planner.
It is not a general logistics planner.
It is not an intel subsystem.

Allowed phase-2 mission types:

* `REPAIR`
* `TRANSPORT`
* `ARMAMENT_DELIVERY`

Still out of scope:

* `SPY`
* combat rescue missions
* offensive emergency strikes
* broad acceleration logistics

`INTEL_DEADLOCK` still matters in phase 2, but only as probe-stock pressure for other subsystems.
`Critical` phase 2 should not emit `SPY` mission proposals.

### Phase-2 allowed proposal kinds

Phase 2 may emit:

* `FLEET_MISSION`
* `SHIPYARD`

`SHIPYARD` remains the production fallback form.
Do not add a new `PRODUCTION_REQUEST` proposal kind here.

Rules:

* if a valid owned emergency mission can be formed, emit the mission,
* if the emergency exists but no valid owned mission can be formed, emit a `SHIPYARD` demand-only fallback,
* reuse the current `SHIP_NEED` style in payload and debug metadata.

### Phase-2 response roles

`REPAIR`:

* default emergency repair response,
* use when a valid repair helper fleet already exists.

`ARMAMENT_DELIVERY`:

* use only when repair recovery depends on moving `REPAIR_DRONE`s and optionally resources first,
* do not use it as a generic transport replacement.

`TRANSPORT`:

* use only for small emergency resource rescue on immature planets,
* do not expand it into a broad empire-optimization logistics channel.

### Payload rules

Critical `TRANSPORT` should carry:

* resources only.

Critical `ARMAMENT_DELIVERY` should carry:

* `REPAIR_DRONE`
* resources

Critical `ARMAMENT_DELIVERY` should not carry:

* bombs
* offensive payloads
* broad military logistics payloads

### Priority and cap handling

Priority order in phase 2:

* `REPAIR`
* `TRANSPORT`

`SPY` is not considered here.

Phase 2 keeps the same cap shape as phase 1:

* max `2` global Critical proposals
* plus max `1` per planet

It is allowed to emit one repair-side mission and one transport-side mission in the same turn if:

* they target different planets,
* both remain inside the global and per-planet caps.

### Blocker-family handling in phase 2

Keep the same top-level blocker families:

* `ENERGY_DEADLOCK`
* `STORAGE_DEADLOCK`
* `INDUSTRY_CHAIN_DEADLOCK`
* `LOGISTICS_DEADLOCK`
* `INTEL_DEADLOCK`

Do not add a separate top-level family list for phase 2 yet.

Instead, add response subtype metadata such as:

* `REPAIR`
* `TRANSPORT`
* `ARMAMENT_DELIVERY`

That preserves ledger continuity while making emergency mission traces readable.

### Emergency TRANSPORT trigger

Critical `TRANSPORT` should trigger only when:

* the target is an immature planet,
* the target is genuinely blocked on immediate recovery cost,
* local recovery is not expected within `<= 5` turns.

If local recovery is expected within `<= 5` turns:

* do not use Critical transport.

This transport scope should stay small, roughly:

* up to about `2000` cargo capacity.

Larger acceleration logistics should stay with other subsystems.

### Emergency REPAIR trigger

Critical repair response should trigger only when:

* the target is an owned planet,
* structural damage is more than `35%`,
* local full recovery would take more than `20` turns,
* the target is safe enough to justify committing repair help.

### Safe target rule

The target should pass a hybrid safety test:

* not `inDangerPlanet`
* not `constantlyAttackedPlanet`
* and not under meaningful recent hostile pressure

### Valid emergency repair source

A valid owned repair source should be:

* a planet with a repair-capable fleet,
* source structural damage below `10%`,
* not under recent pressure.

### Mission-selection rule

When both repair response paths are possible:

* prefer `REPAIR` whenever a valid helper already exists,
* use `ARMAMENT_DELIVERY` only when repair recovery depends on moving `REPAIR_DRONE`s or resources first.

### ETA caps

Mission-specific ETA caps should be:

* `REPAIR <= 8`
* `ARMAMENT_DELIVERY <= 5`
* `TRANSPORT <= 8`

Do not use one generic ETA cap for all phase-2 emergency missions.

### Utility-only planning rule

For phase 2, `Critical` should use a utility-only planner-side ship selection rule for emergency repair and logistics support.

This is a `Critical` planner rule.
It does not require changing the broader shared legality of these mission types themselves.

---

## 8) Weight Manager Subsystem

**Scope:** advisory empire-wide context evaluation plus per-planet weighting metadata.

**Purpose:** analyze the current empire-wide and planetary context and provide **dynamic scoring input** to the Supervisory System.

**Goal amount:** Don't have goals. Evaluate the current situation and adjust weights.

This subsystem is not a scheduler.
It does not directly approve or reject tasks.
It does not execute commands.
It does not orchestrate multi-turn campaigns.
`Critical` is intentionally out of scope here and should remain separately handled.

### Responsibilities

* evaluate:

  * bot personality,
  * diplomacy status mix,
  * discovered-farm status mix like `BREAK_NEED` / `RAID_READY`,
  * whether the empire is at war,
  * whether allies require assistance,
  * current game stage,
  * planet maturity and specialization,
  * local danger, damage, and repeated attack pressure.
* produce:

  * per-subsystem weights,
  * mutually-exclusive global mode flags,
  * per-planet mode flags,
  * rationale/debug metadata.

### Weight contract

Weights should be normalized to `0..100`.

Global strategic outputs:

* `strategicDevelopmentWeight`
* `strategicMilitaryWeight`
* `strategicDiplomaticWeight`

Per-planet outputs:

* `economicWeight`
* `defensiveWeight`
* `warfareWeight`

### Global mode flags

Mode flags should be mutually exclusive:

* `economicRecoveryMode`
* `warEmergencyMode`
* `expansionMode`
* `diplomaticCautionMode`
* `normalSituationMode`

`normalSituationMode` should be true only when no other mode is active.

### Aggregate metrics

This subsystem should reuse planet aggregate metrics instead of inventing a separate maturity number first.

Per-planet aggregates:

* `avg_industry`
* `avg_military`
* `avg_defence`
* `avg_development`

Definitions:

* `avg_military` = all combat-capable ships
* `avg_defence` = planetary defence units + bunker influence
* `avg_development` = all buildings not counted in industry/military/defence

Empire-wide best aggregates:

* `highest_avg_industry`
* `highest_avg_military`
* `highest_avg_defence`
* `highest_avg_development`

### Planet maturity and focus flags

Phase 1 should use a hard maturity gate:

* if `avg_industry <= 4` => `immaturePlanet`
* else => `maturePlanet`

Those two flags are mutually exclusive.

`immaturePlanet` should be pushed almost purely toward local economic growth and should not be treated as a capable military-production world yet.

Per-planet focus flags should include:

* `industryFocused`
* `defenceFocused`
* `militaryFocused`
* `developmentFocused`

Those focus flags should be mutually exclusive and chosen by the single biggest gap to the matching `highest_avg_xxx`.

Generic first-pass rule:

* a domain becomes focus-eligible when `planet avg_xxx + 2 < highest_avg_xxx`

`industryFocused` special rule:

* only on `maturePlanet`
* when `avg_industry + 2 < highest_avg_industry`
* remove it while any active `WAR` exists

These focus flags are descriptive pressure signals only.
They should increase matching subsystem weight.
They should not hard-block all other behavior on that planet.

### Additional planet flags

* `industryHubPlanet` when `maturePlanet` and `avg_industry + 1.5 >= highest_avg_industry`
* `damagedPlanet` when more than `25%` structural HP is missing
* `inDangerPlanet` when `avg_defence + 3 < highest_avg_defence` and the planet is already known by a player currently in `WAR`
* `constantlyAttackedPlanet` when at least `3` hostile attacks happened in the last `20` turns
* `veryHeavilyAttackedPlanet` when at least `3` hostile attacks happened in the last `20` turns and `damagedPlanet` is currently true

### Example output

* boost `economicWeight` on immature or industry-focused planets,
* boost `defensiveWeight` on `inDangerPlanet` and `constantlyAttackedPlanet`,
* boost `strategicDiplomaticWeight` during active war,
* suppress local `warfareWeight` on unstable bootstrap planets,
* expose debug rationale showing which flags and gaps caused each weight.

### Future TODOs

* Consider a later hybrid model with trait-vector interpolation plus learned/tuned situational modifiers.
* Add a separate repeated-fleet-loss parameter, mainly for `Strategic Diplomatic`, so the bot can avoid feeding more fleets into the same losing planet for some time.

---

## 9) Supervisory System

**Scope:** empire-wide final control layer.

**Purpose:** remain the single final allocator, scheduler, and conflict resolver.

**Goal amount:** Don't have goals, it manages other subsystems goals.

This system sees proposals from all subsystems and decides what is actually executed.

### Current implemented slice

The current live Supervisor slice is implemented as a final allocator/executor for queue actions, allowlisted fleet execution, incoming request-decision execution, and outgoing support-request creation when an owning subsystem emits an executable request proposal. It is not a full campaign executor and does not choose targets, compose fleets, or create strategic requests by itself.

Runtime mode is explicit:

* `DISABLED` skips V2 bot runtime,
* `SHADOW` runs V2 planning/traces without execution,
* `LIVE` lets the Supervisor execute accepted queue proposals, allowlisted fleet proposals, request decisions, support request creation proposals, and diplomacy proposals.

The live execution scope is:

* `BUILDING`,
* `RESEARCH`,
* `SHIPYARD`,
* `SPY`,
* `TRANSPORT`,
* `ARMAMENT_DELIVERY`,
* `REPAIR`,
* `COLONIZE`,
* `MOVE`,
* `DEFEND`,
* `ATTACK`,
* `BOMBARD`,
* `SIEGE`,
* incoming `REQUEST_DECISION` proposals for `JUMP_GATE`, `MAINTENANCE`, and `SUPPORT`,
* outgoing `REQUEST_CREATION` proposals for `SUPPORT`,
* `DIPLOMACY_DECISION` proposals for pending treaty decisions,
* `DIPLOMACY_PROPOSAL` proposals for outgoing treaty creation.

The current deferred scope is:

* outgoing maintenance request creation,
* standalone outgoing Jump Gate request creation,
* full hard reservation/cancellation engine,
* recycle execution until a subsystem emits explicit `RECYCLE` proposals.

Incoming request ownership is split deliberately:

* `Strategic Diplomatic` evaluates incoming Jump Gate, Maintenance, and Support requests and emits explicit `REQUEST_DECISION` proposals.
* `Strategic Diplomatic` evaluates outgoing support-request needs and emits executable `REQUEST_CREATION` proposals.
* `Strategic Diplomatic` evaluates pending incoming/outgoing treaty proposals and emits executable `DIPLOMACY_DECISION` proposals.
* `Strategic Diplomatic` evaluates outgoing treaty opportunities and emits executable `DIPLOMACY_PROPOSAL` proposals.
* `Supervisor` only arbitrates and executes accepted request decisions through shared command helpers.
* If no subsystem emits a request decision, request creation, diplomacy decision, or diplomacy creation proposal, Supervisor does not invent one.

Supervisor diplomacy and lifecycle order:

* accepted `DIPLOMACY_DECISION` proposals execute first,
* then Supervisor performs the lifecycle recall pass,
* then normal accepted queue, fleet, and request actions execute.

The lifecycle recall pass uses the shared fleet-return command and recalls own `ATTACK`, `BOMBARD`, `SIEGE`, and `SPY` fleets in `MOVING_TO_TARGET`, `PENDING_JUMP_GATE`, or `ORBITING` when the target owner is now `NEUTRAL`, `PEACE`, or `ALLIED`. This prevents continued escalation after accepted peace/alliance or after relations otherwise stop being valid for offensive action.

Supervisor fleet execution rules:

* subsystem proposals must already include exact ships and cargo,
* Supervisor validates availability and command shape but does not build replacement fleet payloads,
* missing exact ships reject with `ships_unavailable`,
* exact fleet proposals may be stored as `PENDING_SHIPS_NEXT_TURN` only when the exact missing type/count is completing next turn,
* pending next-turn fleet proposals retry the exact same payload once and expire with `ships_unavailable_after_pending` if still impossible,
* `BOMBARD` and `SIEGE` get a simple Supervisor metadata precheck for `WAR`, while broader target quality and legality remain subsystem/shared-command responsibility,
* Strategic Diplomatic now also persists a per-faction `warAdvantageLevel` (`-2 .. +2`) from the 20-turn war-evaluation cadence; ship-loss value is dominant, structural damage is medium-high, and plunder is light,
* fleet-slot use is tracked separately from resource spending and aligned through the same target-share model,
* cargo/resource spending is recorded in normal spending history,
* deuterium fuel is recorded separately in lightweight `fuelSpendingHistory`,
* own-planet Jump Gate use is selected by default when legal and auto-approved,
* foreign/allied Jump Gate request creation happens only through accepted `FLEET_MISSION` proposals whose owning subsystem set `useJumpGate: true`; Supervisor does not emit standalone Jump Gate requests.

`SHIP_NEED` and `demandOnly` shipyard proposals are pressure signals only. They are not executable by themselves; they increase priority for matching concrete shipyard proposals emitted by other subsystems.

Pending queue commitments are retried before new proposals. Expired commitments are marked and kept in short history instead of disappearing immediately, so traces can explain why a previously accepted task was dropped.

The old V1 bot runner is no longer used by the end-turn runtime. If V2 live execution fails, the bot logs/traces the failure and does not fall back to V1.

Important TODOs:

* add future Jump Gate operating-cost policy,
* add outgoing maintenance request creation proposals in the owning subsystem if needed,
* add future friendliness effects for accepted Jump Gate requests (`+0.5` non-combat fleet, `+1` combat fleet, per fleet),
* check whether shared `DEFEND` launch/arrival logic fully supports own + allied/peace guard targets,
* add/enable `RECYCLE` execution only after an owning subsystem emits explicit recycle proposals,
* future optimize helper-lab reassignment for already running researches,
* future revisit research category pressure only if simple global coverage proves too flat.

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

### Current Weight Alignment Model

Current weighted subsystems:

* `ECONOMIC`,
* `DEFENSIVE`,
* `WARFARE`,
* `STRATEGIC_DEVELOPMENT`,
* `STRATEGIC_MILITARY`,
* `STRATEGIC_DIPLOMATIC`.

`CRITICAL` and `WEIGHT_MANAGER` stay outside normal spending-share equalization. `CRITICAL` proposals are evaluated before ordinary weighted proposals.

Resource value is currently:

```text
metal * 1 + crystal * 1.8 + deuterium * 2.6
```

The Supervisor tracks raw resource spending as well as weighted resource value. It uses Weight Manager output for target shares, applies a progressive overfunding penalty, and gives a capped underfunding bonus so long-term spending trends drift back toward the intended allocation instead of enforcing a hard per-turn budget.

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

## Phase 3: Weight Manager analysis

Subsystem 8 computes:

* dynamic weight modifiers,
* urgency multipliers,
* context flags.

## Phase 4: Supervisory arbitration

System 9:

* applies base profile weights,
* applies Weight Manager modifiers,
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
* plus accepted Critical emergency proposals that the Supervisor marks for immediate execution.

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
