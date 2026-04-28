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

**Goal amount:** Main goal, secondary goal, short-term goals that lead to the main goal.

### Responsibilities

* **Construction:** shipyard, bunker network.
* **Production:** defenses, excluding bombs.
* **Local optimization:** maintain sufficient static defense and defensive infrastructure.

### Primary goal examples

* maintain minimum local defense thresholds.

---

## 3) Warfare Subsystem

**Scope:** strictly tied to one planet.

**Purpose:** act as the **local military production executor** for a planet.

**Goal amount:** Main goal, secondary goal, short-term goals that lead to the main goal.

This subsystem should not define global war strategy.
Its role is to decide what the planet can efficiently build when military production quota is assigned to it.

### Responsibilities

* **Construction:** shipyard, nanite factory.
* **Production:** military ships, transport ships.
* **Local optimization:** convert local shipyard power into military output.

### Primary goal examples

* increase local ship production capacity,
* fulfill military production quota assigned by the Supervisory System,
* unlocking new ships for production.

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

### Indicative fleet allocation

**10–30%**, treated as a soft target.

---

## 5) Strategic Military Subsystem

**Scope:** global.

**Purpose:** manage offensive operations against neutral type players (farms).

**Goal amount:** Many goals (up to M goals, where M is the number of localized farms),

This is the **global aggression planner** for non-bot or non-human type player targets.

### Responsibilities

* **Construction:** shipyard, nanite factory.
* **Production:** military ships, bomber ships, spy probes, transport ships.
* **Operations:**

  * send probes,
  * search for planets owned by neutral type players (farms),
  * evaluate raid targets,
  * destroy farm defenses,
  * plunder farms,
  * maintain intelligence on neutral planets.

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
