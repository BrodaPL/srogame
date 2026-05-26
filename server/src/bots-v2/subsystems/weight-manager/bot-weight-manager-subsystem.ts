import type {
  BotMemoryV2,
  BotMemoryV2BudgetScope,
  BotMemoryV2WeightManagerMode,
  BotMemoryV2WeightManagerPlanetEntry,
  BotMemoryV2WeightManagerPlanetFocus,
  BotProfileId
} from '../../../../../src/app/models/player.ts';
import * as diplomaticStatusModule from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import type {
  BotPlanetSnapshot,
  BotStrategicDiplomaticFactionSnapshot,
  BotStrategicMilitaryTargetSnapshot,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import * as technologyEffectsModule from '../../../../../src/app/models/tech/technology-effects.js';
import { SHIP_BLUEPRINTS } from '../../../game-commands/command-helpers.js';
import { hasEmergencyInfrastructureDamage } from '../../infrastructure-damage.js';
import { resolveModule } from '../../../esm-module.js';

const { DiplomaticStatus } = resolveModule(diplomaticStatusModule) as typeof import('../../../../../src/app/models/diplomacy/diplomatic-status.js');
const { maxOwnedPlanets } = resolveModule(technologyEffectsModule) as typeof import('../../../../../src/app/models/tech/technology-effects.js');

type DiplomaticStatusT = diplomaticStatusModule.DiplomaticStatus;

type WeightProfileAxes = {
  aggression: number;
  industry: number;
  diplomacy: number;
  defences: number;
  caution: number;
  development: number;
};

type WeightProfile = {
  axes: WeightProfileAxes;
  localWeights: {
    economic: number;
    defensive: number;
    warfare: number;
  };
  strategicWeights: {
    research: number;
    strategicDevelopment: number;
    strategicMilitary: number;
    strategicDiplomatic: number;
  };
};

const PERSONALITY_VARIANCE_RETENTION = 0.8;
const DEFENSIVE_WEIGHT_RETENTION = 0.68;
const MATURE_AVG_INDUSTRY_THRESHOLD = 3.6;
const DEVELOPED_AVG_INDUSTRY_GAP = 1.2;
const OLD_AVG_INDUSTRY_THRESHOLD = 6.8;

type GlobalModeScores = {
  ECONOMIC_RECOVERY: number;
  WAR_EMERGENCY: number;
  EXPANSION: number;
  DIPLOMATIC_CAUTION: number;
};

type PlanetAggregate = {
  planet: BotPlanetSnapshot;
  avgIndustry: number;
  avgMilitary: number;
  avgDefence: number;
  avgDevelopment: number;
};

type PlanetFlags = {
  selectedFocus: BotMemoryV2WeightManagerPlanetFocus | null;
  immaturePlanet: boolean;
  maturePlanet: boolean;
  developingPlanet: boolean;
  developedPlanet: boolean;
  hubPlanet: boolean;
  oldPlanet: boolean;
  budgetScope: BotMemoryV2BudgetScope;
  industryFocused: boolean;
  defenceFocused: boolean;
  militaryFocused: boolean;
  developmentFocused: boolean;
  industryHubPlanet: boolean;
  damagedPlanet: boolean;
  inDangerPlanet: boolean;
  constantlyAttackedPlanet: boolean;
  veryHeavilyAttackedPlanet: boolean;
  knownByWarFaction: boolean;
  recentHostileAttackCountLast20Turns: number;
};

const DEVELOPMENT_BUILDING_LEVEL_KEYS = [
  'researchLabLevel',
  'sensorPhalanxLevel',
  'jumpGateLevel',
  'allianceDepotLevel',
  'bombDepotLevel',
  'interstellarTradePortLevel'
] as const;

const COMBAT_SHIP_TYPES = Array.from(SHIP_BLUEPRINTS.shipsMap.keys())
  .filter((shipType) => {
    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    return blueprint?.weapons.some((weapon) => weapon.dmg > 0) ?? false;
  });

const RAW_PROFILE_TABLES: Record<BotProfileId, WeightProfile> = {
  BALANCED: {
    axes: { aggression: 50, industry: 50, diplomacy: 45, defences: 35, caution: 45, development: 50 },
    localWeights: { economic: 50, defensive: 35, warfare: 50 },
    strategicWeights: { research: 50, strategicDevelopment: 50, strategicMilitary: 50, strategicDiplomatic: 50 }
  },
  AGGRESSOR: {
    axes: { aggression: 85, industry: 40, diplomacy: 35, defences: 25, caution: 20, development: 45 },
    localWeights: { economic: 40, defensive: 25, warfare: 78 },
    strategicWeights: { research: 38, strategicDevelopment: 45, strategicMilitary: 82, strategicDiplomatic: 70 }
  },
  TURTLE: {
    axes: { aggression: 24, industry: 45, diplomacy: 35, defences: 44, caution: 70, development: 50 },
    localWeights: { economic: 45, defensive: 38, warfare: 38 },
    strategicWeights: { research: 52, strategicDevelopment: 50, strategicMilitary: 35, strategicDiplomatic: 40 }
  },
  MINER: {
    axes: { aggression: 20, industry: 85, diplomacy: 50, defences: 14, caution: 55, development: 70 },
    localWeights: { economic: 84, defensive: 12, warfare: 24 },
    strategicWeights: { research: 78, strategicDevelopment: 72, strategicMilitary: 25, strategicDiplomatic: 40 }
  },
  AVOIDER: {
    axes: { aggression: 10, industry: 45, diplomacy: 72, defences: 30, caution: 85, development: 45 },
    localWeights: { economic: 45, defensive: 30, warfare: 15 },
    strategicWeights: { research: 46, strategicDevelopment: 45, strategicMilitary: 20, strategicDiplomatic: 72 }
  },
  BUNKERER: {
    axes: { aggression: 25, industry: 40, diplomacy: 30, defences: 70, caution: 65, development: 45 },
    localWeights: { economic: 40, defensive: 60, warfare: 25 },
    strategicWeights: { research: 42, strategicDevelopment: 40, strategicMilitary: 25, strategicDiplomatic: 35 }
  }
};

const PROFILE_TABLES: Record<BotProfileId, WeightProfile> = compressProfileTables(RAW_PROFILE_TABLES);

export class BotWeightManagerSubsystem implements BotSubsystem {
  public readonly subsystemId = 'WEIGHT_MANAGER' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const profileId = context.snapshot.profileId ?? 'BALANCED';
    const profile = PROFILE_TABLES[profileId] ?? PROFILE_TABLES.BALANCED;
    const strategicFactions = context.snapshot.empire.strategicDiplomaticFactions;
    const statusCounts = countFactionStatuses(strategicFactions);
    const farmCounts = countFarmStatuses(
      context.snapshot.empire.strategicMilitaryTargets,
      context.memory.strategicMilitary.farmLedger
    );
    const planetAggregates = context.snapshot.planets.map((planet) => buildPlanetAggregate(planet));
    const highestAverages = {
      industry: Math.max(0, ...planetAggregates.map((entry) => entry.avgIndustry)),
      military: Math.max(0, ...planetAggregates.map((entry) => entry.avgMilitary)),
      defence: Math.max(0, ...planetAggregates.map((entry) => entry.avgDefence)),
      development: Math.max(0, ...planetAggregates.map((entry) => entry.avgDevelopment))
    };
    const planetFlags = planetAggregates.map((entry) =>
      buildPlanetFlags(entry, highestAverages, context.snapshot.empire.atWar)
    );
    const modeScores = buildGlobalModeScores(context, profile.axes, statusCounts, farmCounts, planetFlags);
    const selectedMode = selectGlobalMode(modeScores);
    const globalWeights = buildGlobalWeights(profile, modeScores, selectedMode, context, statusCounts, farmCounts, planetFlags);
    const planetEntries = planetAggregates.map((entry, index) =>
      buildWeightManagerPlanetEntry(
        entry,
        planetFlags[index] ?? createDefaultPlanetFlags(entry.planet),
        profile,
        selectedMode
      )
    );

    context.memory.weightManager = {
      updatedTurn: context.snapshot.turn,
      selectedMode,
      economicRecoveryMode: selectedMode === 'ECONOMIC_RECOVERY',
      warEmergencyMode: selectedMode === 'WAR_EMERGENCY',
      expansionMode: selectedMode === 'EXPANSION',
      diplomaticCautionMode: selectedMode === 'DIPLOMATIC_CAUTION',
      normalSituationMode: selectedMode === 'NORMAL',
      researchWeight: globalWeights.researchWeight,
      strategicDevelopmentWeight: globalWeights.strategicDevelopmentWeight,
      strategicMilitaryWeight: globalWeights.strategicMilitaryWeight,
      strategicDiplomaticWeight: globalWeights.strategicDiplomaticWeight,
      aggressionAxis: profile.axes.aggression,
      industryAxis: profile.axes.industry,
      diplomacyAxis: profile.axes.diplomacy,
      defencesAxis: profile.axes.defences,
      cautionAxis: profile.axes.caution,
      developmentAxis: profile.axes.development,
      discoveredBreakNeedFarmCount: farmCounts.breakNeed,
      discoveredRaidReadyFarmCount: farmCounts.raidReady,
      alliedStatusCount: statusCounts.ALLIED,
      peaceStatusCount: statusCounts.PEACE,
      neutralStatusCount: statusCounts.NEUTRAL,
      warStatusCount: statusCounts.WAR,
      planets: planetEntries
    };

    return {
      subsystemId: this.subsystemId,
      proposals: [],
      debug: {
        selectedMode,
        researchWeight: globalWeights.researchWeight,
        strategicDevelopmentWeight: globalWeights.strategicDevelopmentWeight,
        strategicMilitaryWeight: globalWeights.strategicMilitaryWeight,
        strategicDiplomaticWeight: globalWeights.strategicDiplomaticWeight,
        economicRecoveryScore: roundToTwoDecimals(modeScores.ECONOMIC_RECOVERY),
        warEmergencyScore: roundToTwoDecimals(modeScores.WAR_EMERGENCY),
        expansionScore: roundToTwoDecimals(modeScores.EXPANSION),
        diplomaticCautionScore: roundToTwoDecimals(modeScores.DIPLOMATIC_CAUTION),
        actionableFarmCount: farmCounts.actionable,
        breakNeedFarmCount: farmCounts.breakNeed,
        raidReadyFarmCount: farmCounts.raidReady,
        alliedStatusCount: statusCounts.ALLIED,
        peaceStatusCount: statusCounts.PEACE,
        neutralStatusCount: statusCounts.NEUTRAL,
        warStatusCount: statusCounts.WAR,
        immaturePlanetCount: planetEntries.filter((planet) => planet.immaturePlanet).length,
        developingPlanetCount: planetEntries.filter((planet) => planet.developingPlanet).length,
        developedPlanetCount: planetEntries.filter((planet) => planet.developedPlanet).length,
        oldPlanetCount: planetEntries.filter((planet) => planet.oldPlanet).length,
        damagedPlanetCount: planetEntries.filter((planet) => planet.damagedPlanet).length,
        inDangerPlanetCount: planetEntries.filter((planet) => planet.inDangerPlanet).length,
        constantlyAttackedPlanetCount: planetEntries.filter((planet) => planet.constantlyAttackedPlanet).length,
        industryFocusedPlanetCount: planetEntries.filter((planet) => planet.industryFocused).length
      }
    };
  }
}

function buildPlanetAggregate(planet: BotPlanetSnapshot): PlanetAggregate {
  const avgIndustry = roundToTwoDecimals(planet.defense.avgIndustryLevel);
  const combatShipValue = COMBAT_SHIP_TYPES.reduce((sum, shipType) =>
    sum + (planet.ships.installedValueByType[shipType] ?? 0), 0);
  const avgMilitary = roundToTwoDecimals(Math.log2(1 + (combatShipValue / 1000)));
  const avgDefence = roundToTwoDecimals(
    Math.log2(1 + (planet.defense.totalInstalledDefenseValue / 1000))
    + (planet.defense.bunkerLevel * 0.5)
  );
  const developmentLevels = DEVELOPMENT_BUILDING_LEVEL_KEYS
    .map((key) => planet.economy[key] ?? 0)
    .filter((level) => level > 0);
  const avgDevelopment = developmentLevels.length <= 0
    ? 0
    : roundToTwoDecimals(
      developmentLevels.reduce((sum, level) => sum + level, 0) / developmentLevels.length
    );

  return {
    planet,
    avgIndustry,
    avgMilitary,
    avgDefence,
    avgDevelopment
  };
}

function countFactionStatuses(
  factions: BotStrategicDiplomaticFactionSnapshot[]
): Record<DiplomaticStatusT, number> {
  const counts: Record<DiplomaticStatusT, number> = {
    [DiplomaticStatus.SELF]: 0,
    [DiplomaticStatus.ALLIED]: 0,
    [DiplomaticStatus.PEACE]: 0,
    [DiplomaticStatus.NEUTRAL]: 0,
    [DiplomaticStatus.PASSIVE]: 0,
    [DiplomaticStatus.WAR]: 0
  };

  for (const faction of factions) {
    counts[faction.currentStatus] += 1;
  }

  return counts;
}

function countFarmStatuses(
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: BotMemoryV2['strategicMilitary']['farmLedger']
): {
  actionable: number;
  breakNeed: number;
  raidReady: number;
} {
  let actionable = 0;
  let breakNeed = 0;
  let raidReady = 0;

  const actionableKeys = new Set<string>();

  for (const target of targets) {
    if (!target.isNeutral || !target.inOwnedSystem) {
      continue;
    }

    const key = `${target.coordinates.x}:${target.coordinates.y}:${target.coordinates.z}`;
    const memoryEntry = farmLedger.find((entry) =>
      entry.coordinates.x === target.coordinates.x
      && entry.coordinates.y === target.coordinates.y
      && entry.coordinates.z === target.coordinates.z
    ) ?? null;
    if (
      !target.hasForeignGuard
      && memoryEntry
      && (
        memoryEntry.intelPhase === 'PROBE_REQUIRED'
        || (memoryEntry.farmIntelEnough && !memoryEntry.initialDefenseBroken)
        || memoryEntry.initialDefenseBroken
      )
    ) {
      actionableKeys.add(key);
    }

    const hasCombatIntel = target.spyCombatIntelEnough || target.lastAttackTurn !== null;
    if (!hasCombatIntel) {
      continue;
    }

    const shipCount = target.currentShipsCount ?? 0;
    const defenceCount = target.currentDefencesCount ?? 0;
    if (shipCount <= 0 && defenceCount <= 0) {
      raidReady += 1;
    } else {
      breakNeed += 1;
    }
  }

  actionable = actionableKeys.size;
  return { actionable, breakNeed, raidReady };
}

function compressProfileTables(
  tables: Record<BotProfileId, WeightProfile>
): Record<BotProfileId, WeightProfile> {
  const balanced = tables.BALANCED;
  return Object.fromEntries(
    Object.entries(tables).map(([profileId, profile]) => {
      if (profileId === 'BALANCED') {
        return [profileId, profile];
      }

      return [profileId, {
        axes: {
          aggression: compressTowardBalanced(profile.axes.aggression, balanced.axes.aggression),
          industry: compressTowardBalanced(profile.axes.industry, balanced.axes.industry),
          diplomacy: compressTowardBalanced(profile.axes.diplomacy, balanced.axes.diplomacy),
          defences: compressTowardBalanced(profile.axes.defences, balanced.axes.defences),
          caution: compressTowardBalanced(profile.axes.caution, balanced.axes.caution),
          development: compressTowardBalanced(profile.axes.development, balanced.axes.development)
        },
        localWeights: {
          economic: compressTowardBalanced(profile.localWeights.economic, balanced.localWeights.economic),
          defensive: compressTowardBalanced(profile.localWeights.defensive, balanced.localWeights.defensive),
          warfare: compressTowardBalanced(profile.localWeights.warfare, balanced.localWeights.warfare)
        },
        strategicWeights: {
          research: compressTowardBalanced(profile.strategicWeights.research, balanced.strategicWeights.research),
          strategicDevelopment: compressTowardBalanced(profile.strategicWeights.strategicDevelopment, balanced.strategicWeights.strategicDevelopment),
          strategicMilitary: compressTowardBalanced(profile.strategicWeights.strategicMilitary, balanced.strategicWeights.strategicMilitary),
          strategicDiplomatic: compressTowardBalanced(profile.strategicWeights.strategicDiplomatic, balanced.strategicWeights.strategicDiplomatic)
        }
      }];
    })
  ) as Record<BotProfileId, WeightProfile>;
}

function compressTowardBalanced(value: number, balancedValue: number): number {
  return Math.round(balancedValue + ((value - balancedValue) * PERSONALITY_VARIANCE_RETENTION));
}

function buildPlanetFlags(
  entry: PlanetAggregate,
  highestAverages: {
    industry: number;
    military: number;
    defence: number;
    development: number;
  },
  atWar: boolean
): PlanetFlags {
  const { planet } = entry;
  const localStage = resolveLocalDevelopmentStage(entry.avgIndustry);
  const maturePlanet = entry.avgIndustry >= MATURE_AVG_INDUSTRY_THRESHOLD;
  const immaturePlanet = !maturePlanet;
  const hubPlanet = entry.avgIndustry >= highestAverages.industry;
  const developingPlanet = maturePlanet && (entry.avgIndustry + DEVELOPED_AVG_INDUSTRY_GAP) < highestAverages.industry;
  const developedPlanet = maturePlanet && !developingPlanet;
  const oldPlanet = entry.avgIndustry >= OLD_AVG_INDUSTRY_THRESHOLD;
  const budgetScope = resolveBudgetScope({
    maturePlanet,
    developingPlanet,
    oldPlanet
  });
  const knownByWarFaction = planet.defense.knownByWarFaction;
  const recentHostileAttackCountLast20Turns = planet.defense.recentHostileAttackCountLast20Turns;
  const damagedPlanet = resolveStructuralDamagePercent(planet) >= 25;
  const poorDefences = entry.avgDefence + 3 < highestAverages.defence;
  const inDangerPlanet = poorDefences && knownByWarFaction;
  const constantlyAttackedPlanet = recentHostileAttackCountLast20Turns >= 3;
  const veryHeavilyAttackedPlanet = constantlyAttackedPlanet && damagedPlanet;
  const industryHubPlanet = hubPlanet;

  const selectedFocus = resolveSelectedFocus(entry, highestAverages, localStage, atWar);

  return {
    selectedFocus,
    immaturePlanet,
    maturePlanet,
    developingPlanet,
    developedPlanet,
    hubPlanet,
    oldPlanet,
    budgetScope,
    industryFocused: selectedFocus === 'INDUSTRY',
    defenceFocused: selectedFocus === 'DEFENCE',
    militaryFocused: selectedFocus === 'MILITARY',
    developmentFocused: selectedFocus === 'DEVELOPMENT',
    industryHubPlanet,
    damagedPlanet,
    inDangerPlanet,
    constantlyAttackedPlanet,
    veryHeavilyAttackedPlanet,
    knownByWarFaction,
    recentHostileAttackCountLast20Turns
  };
}

function resolveBudgetScope(flags: {
  maturePlanet: boolean;
  developingPlanet: boolean;
  oldPlanet: boolean;
}): BotMemoryV2BudgetScope {
  if (!flags.maturePlanet) {
    return 'PLANETARY_ONLY';
  }
  if (flags.oldPlanet) {
    return 'IMPERIUM_ONLY';
  }
  if (flags.developingPlanet) {
    return 'PLANETARY_DOMINANT';
  }
  return 'HYBRID';
}

function resolveSelectedFocus(
  entry: PlanetAggregate,
  highestAverages: {
    industry: number;
    military: number;
    defence: number;
    development: number;
  },
  localStage: 'IMMATURE' | 'MATURING' | 'DEVELOPED',
  atWar: boolean
): BotMemoryV2WeightManagerPlanetFocus | null {
  if (localStage !== 'DEVELOPED') {
    return null;
  }

  const candidates: Array<{ focus: BotMemoryV2WeightManagerPlanetFocus; gap: number }> = [];
  if (entry.avgIndustry + 2 < highestAverages.industry) {
    candidates.push({ focus: 'INDUSTRY', gap: highestAverages.industry - entry.avgIndustry });
  }
  if (entry.avgDefence + 2 < highestAverages.defence) {
    candidates.push({ focus: 'DEFENCE', gap: highestAverages.defence - entry.avgDefence });
  }
  if (entry.avgMilitary + 2 < highestAverages.military) {
    candidates.push({ focus: 'MILITARY', gap: highestAverages.military - entry.avgMilitary });
  }
  if (entry.avgDevelopment + 2 < highestAverages.development) {
    candidates.push({ focus: 'DEVELOPMENT', gap: highestAverages.development - entry.avgDevelopment });
  }

  const best = candidates.sort((left, right) =>
    right.gap - left.gap || left.focus.localeCompare(right.focus)
  )[0] ?? null;
  if (!best) {
    return null;
  }
  if (best.focus === 'INDUSTRY' && atWar) {
    return null;
  }
  return best.focus;
}

function buildGlobalModeScores(
  context: BotSubsystemContext,
  axes: WeightProfileAxes,
  statusCounts: Record<DiplomaticStatusT, number>,
  farmCounts: { actionable: number; breakNeed: number; raidReady: number },
  planetFlags: PlanetFlags[]
): GlobalModeScores {
  const immatureCount = planetFlags.filter((planet) => planet.immaturePlanet).length;
  const damagedCount = planetFlags.filter((planet) => planet.damagedPlanet).length;
  const inDangerCount = planetFlags.filter((planet) => planet.inDangerPlanet).length;
  const constantlyAttackedCount = planetFlags.filter((planet) => planet.constantlyAttackedPlanet).length;
  const veryHeavilyAttackedCount = planetFlags.filter((planet) => planet.veryHeavilyAttackedPlanet).length;
  const energyOrStorageProblems = Number(context.snapshot.empire.hasCriticalEnergyProblem)
    + Number(context.snapshot.empire.hasCriticalStorageProblem);
  const colonizationPressure = resolveColonizationOpportunityPressure(context);

  return {
    ECONOMIC_RECOVERY: Math.min(
      100,
      (immatureCount * 14)
      + (damagedCount * 10)
      + (energyOrStorageProblems * 22)
      + (axes.industry * 0.1)
      + (axes.development * 0.08)
    ),
    WAR_EMERGENCY: Math.min(
      100,
      (context.snapshot.empire.atWar ? 45 : 0)
      + (statusCounts.WAR * 10)
      + (inDangerCount * 18)
      + (constantlyAttackedCount * 12)
      + (veryHeavilyAttackedCount * 18)
      + (axes.aggression * 0.06)
      + (axes.defences * 0.08)
    ),
    EXPANSION: Math.min(
      100,
      Math.min(40, context.snapshot.empire.intelCandidates.length * 4)
      + Math.min(18, farmCounts.actionable * 2)
      + Math.min(30, (farmCounts.breakNeed * 3) + (farmCounts.raidReady * 4))
      + (context.snapshot.empire.ownedPlanetCount <= 2 ? 15 : 0)
      + colonizationPressure
      + (axes.development * 0.12)
      + (axes.industry * 0.08)
      - (context.snapshot.empire.atWar ? 12 : 0)
    ),
    DIPLOMATIC_CAUTION: Math.min(
      100,
      (context.snapshot.empire.atWar ? 0 : 14)
      + (statusCounts.ALLIED * 12)
      + (statusCounts.PEACE * 10)
      + (statusCounts.NEUTRAL * 4)
      + (axes.diplomacy * 0.18)
      + (axes.caution * 0.16)
    )
  };
}

function selectGlobalMode(scores: GlobalModeScores): BotMemoryV2WeightManagerMode {
  const ordered = Object.entries(scores)
    .sort((left, right) => Number(right[1]) - Number(left[1]) || left[0].localeCompare(right[0]));
  const best = ordered[0];
  if (!best || Number(best[1]) < 45) {
    return 'NORMAL';
  }

  switch (best[0]) {
    case 'ECONOMIC_RECOVERY':
    case 'WAR_EMERGENCY':
    case 'EXPANSION':
    case 'DIPLOMATIC_CAUTION':
      return best[0];
    default:
      return 'NORMAL';
  }
}

function buildGlobalWeights(
  profile: WeightProfile,
  modeScores: GlobalModeScores,
  selectedMode: BotMemoryV2WeightManagerMode,
  context: BotSubsystemContext,
  statusCounts: Record<DiplomaticStatusT, number>,
  farmCounts: { actionable: number; breakNeed: number; raidReady: number },
  planetFlags: PlanetFlags[]
): {
  researchWeight: number;
  strategicDevelopmentWeight: number;
  strategicMilitaryWeight: number;
  strategicDiplomaticWeight: number;
} {
  const immatureCount = planetFlags.filter((planet) => planet.immaturePlanet).length;
  const inDangerCount = planetFlags.filter((planet) => planet.inDangerPlanet).length;
  const colonizationPressure = resolveColonizationOpportunityPressure(context);

  const researchWeight = clampWeight(
    profile.strategicWeights.research
    + (modeScores.ECONOMIC_RECOVERY * 0.25)
    + (modeScores.EXPANSION * 0.1)
    + (immatureCount * 2)
    - (selectedMode === 'WAR_EMERGENCY' ? 10 : 0)
  );
  const strategicDevelopmentWeight = clampWeight(
    profile.strategicWeights.strategicDevelopment
    - 8
    + (modeScores.ECONOMIC_RECOVERY * 0.25)
    + (modeScores.EXPANSION * 0.12)
    + (colonizationPressure * 0.8)
    + (immatureCount * 2)
    - (selectedMode === 'WAR_EMERGENCY' ? 10 : 0)
  );
  const strategicMilitaryWeight = clampWeight(
    profile.strategicWeights.strategicMilitary
    + (modeScores.WAR_EMERGENCY * 0.2)
    + (modeScores.EXPANSION * 0.25)
    + (farmCounts.actionable * 4)
    + (farmCounts.breakNeed * 3)
    + (farmCounts.raidReady * 4)
    + Math.min(18, farmCounts.breakNeed * 6)
    + (context.snapshot.empire.atWar ? 8 : 0)
    - (selectedMode === 'DIPLOMATIC_CAUTION' ? 12 : 0)
  );
  const strategicDiplomaticWeight = clampWeight(
    profile.strategicWeights.strategicDiplomatic
    + (modeScores.WAR_EMERGENCY * 0.18)
    + (modeScores.DIPLOMATIC_CAUTION * 0.35)
    + (statusCounts.WAR * 6)
    + (statusCounts.ALLIED * 3)
    + (inDangerCount * 4)
  );

  return {
    researchWeight,
    strategicDevelopmentWeight,
    strategicMilitaryWeight,
    strategicDiplomaticWeight
  };
}

function resolveColonizationOpportunityPressure(context: BotSubsystemContext): number {
  const adaptiveTechnologyLevel = Math.max(0, ...context.snapshot.planets.map((planet) => planet.tech.adaptiveTechnologyLevel));
  const maxPlanets = maxOwnedPlanets(adaptiveTechnologyLevel);
  if (context.snapshot.empire.ownedPlanetCount >= maxPlanets) {
    return 0;
  }

  const viableCandidates = context.snapshot.empire.intelCandidates.filter((candidate) =>
    !candidate.needsScan
    && candidate.colonizationDifficulty !== null
    && candidate.colonizationDifficulty <= adaptiveTechnologyLevel
  ).length;

  const requiredCandidates = context.snapshot.empire.ownedPlanetCount <= 1 ? 2 : 3;
  if (viableCandidates < requiredCandidates) {
    return 0;
  }

  const basePressure = context.snapshot.empire.ownedPlanetCount <= 1 ? 20 : 10;
  return Math.min(24, basePressure + ((viableCandidates - requiredCandidates) * 2));
}

function buildWeightManagerPlanetEntry(
  entry: PlanetAggregate,
  flags: PlanetFlags,
  profile: WeightProfile,
  selectedMode: BotMemoryV2WeightManagerMode
): BotMemoryV2WeightManagerPlanetEntry {
  const localStage = resolveLocalDevelopmentStage(entry.avgIndustry);
  let economicWeight = profile.localWeights.economic;
  let defensiveWeight = profile.localWeights.defensive;
  let warfareWeight = profile.localWeights.warfare;

  if (flags.immaturePlanet) {
    economicWeight += 40;
    defensiveWeight -= 8;
    warfareWeight -= 35;
  }
  if (flags.developingPlanet) {
    economicWeight += 24;
    warfareWeight = Math.max(warfareWeight, Math.round(profile.localWeights.warfare * 0.35));
    defensiveWeight -= 2;
  }
  if (localStage === 'MATURING') {
    economicWeight += 16;
    warfareWeight = Math.max(warfareWeight, Math.round(profile.localWeights.warfare * 0.5));
    defensiveWeight -= 4;
  }
  if (flags.industryFocused) {
    economicWeight += 18;
    warfareWeight -= 8;
  }
  if (flags.defenceFocused) {
    defensiveWeight += 8;
  }
  if (flags.militaryFocused) {
    warfareWeight += 16;
  }
  if (flags.developmentFocused) {
    economicWeight += 8;
  }
  if (flags.industryHubPlanet) {
    economicWeight += 8;
  }
  if (flags.damagedPlanet) {
    defensiveWeight += 6;
    economicWeight -= 4;
    warfareWeight -= 4;
  }
  if (flags.inDangerPlanet) {
    defensiveWeight += 20;
    warfareWeight += 16;
    economicWeight -= 8;
  }
  if (flags.constantlyAttackedPlanet) {
    defensiveWeight += 10;
    warfareWeight += 12;
    economicWeight -= 4;
  }
  if (flags.veryHeavilyAttackedPlanet) {
    defensiveWeight += 8;
    warfareWeight += 10;
  }

  switch (selectedMode) {
    case 'ECONOMIC_RECOVERY':
      economicWeight += 12;
      warfareWeight -= 10;
      break;
    case 'WAR_EMERGENCY':
      defensiveWeight += 4;
      warfareWeight += 18;
      economicWeight -= flags.maturePlanet ? 10 : 4;
      break;
    case 'EXPANSION':
      warfareWeight += 8;
      economicWeight += 10;
      break;
    case 'DIPLOMATIC_CAUTION':
      warfareWeight -= 8;
      defensiveWeight += 2;
      break;
    default:
      break;
  }

  if (flags.immaturePlanet) {
    economicWeight += Math.max(0, warfareWeight);
    economicWeight = Math.max(economicWeight, 80);
    warfareWeight = 0;
    if (!flags.inDangerPlanet) {
      defensiveWeight = Math.min(defensiveWeight, 35);
    }
    if (flags.hubPlanet && !flags.inDangerPlanet) {
      warfareWeight = Math.max(warfareWeight, 12);
      defensiveWeight = Math.min(defensiveWeight, 30);
    }
  }
  if (flags.developingPlanet) {
    economicWeight = Math.max(economicWeight, 70);
    if (!flags.inDangerPlanet) {
      defensiveWeight = Math.min(defensiveWeight, 42);
    }
    warfareWeight = Math.max(warfareWeight, 10);
  }
  if (localStage === 'MATURING') {
    economicWeight = Math.max(economicWeight, 60);
    if (!flags.inDangerPlanet) {
      defensiveWeight = Math.min(defensiveWeight, 40);
    }
  }

  const defensiveReduction = Math.max(0, Math.round(defensiveWeight * (1 - DEFENSIVE_WEIGHT_RETENTION)));
  defensiveWeight -= defensiveReduction;
  const warfareShare = flags.immaturePlanet && !flags.inDangerPlanet
    ? 0
    : flags.militaryFocused || flags.inDangerPlanet || flags.constantlyAttackedPlanet || selectedMode === 'WAR_EMERGENCY'
    ? 0.7
    : flags.industryFocused || selectedMode === 'ECONOMIC_RECOVERY'
      ? 0.35
      : 0.5;
  warfareWeight += Math.round(defensiveReduction * warfareShare);
  economicWeight += defensiveReduction - Math.round(defensiveReduction * warfareShare);

  return {
    coordinates: { ...entry.planet.coordinates },
    economicWeight: clampWeight(economicWeight),
    defensiveWeight: clampWeight(defensiveWeight),
    warfareWeight: clampWeight(warfareWeight),
    avgIndustry: entry.avgIndustry,
    avgMilitary: entry.avgMilitary,
    avgDefence: entry.avgDefence,
    avgDevelopment: entry.avgDevelopment,
    selectedFocus: flags.selectedFocus,
    immaturePlanet: flags.immaturePlanet,
    maturePlanet: flags.maturePlanet,
    developingPlanet: flags.developingPlanet,
    developedPlanet: flags.developedPlanet,
    hubPlanet: flags.hubPlanet,
    oldPlanet: flags.oldPlanet,
    budgetScope: flags.budgetScope,
    industryFocused: flags.industryFocused,
    defenceFocused: flags.defenceFocused,
    militaryFocused: flags.militaryFocused,
    developmentFocused: flags.developmentFocused,
    industryHubPlanet: flags.industryHubPlanet,
    damagedPlanet: flags.damagedPlanet,
    inDangerPlanet: flags.inDangerPlanet,
    constantlyAttackedPlanet: flags.constantlyAttackedPlanet,
    veryHeavilyAttackedPlanet: flags.veryHeavilyAttackedPlanet,
    knownByWarFaction: flags.knownByWarFaction,
    recentHostileAttackCountLast20Turns: flags.recentHostileAttackCountLast20Turns
  };
}

function createDefaultPlanetFlags(planet: BotPlanetSnapshot): PlanetFlags {
  return {
    selectedFocus: null,
    immaturePlanet: false,
    maturePlanet: true,
    developingPlanet: false,
    developedPlanet: true,
    hubPlanet: true,
    oldPlanet: false,
    budgetScope: 'HYBRID',
    industryFocused: false,
    defenceFocused: false,
    militaryFocused: false,
    developmentFocused: false,
    industryHubPlanet: false,
    damagedPlanet: false,
    inDangerPlanet: false,
    constantlyAttackedPlanet: false,
    veryHeavilyAttackedPlanet: false,
    knownByWarFaction: planet.defense.knownByWarFaction,
    recentHostileAttackCountLast20Turns: planet.defense.recentHostileAttackCountLast20Turns
  };
}

function resolveLocalDevelopmentStage(avgIndustry: number): 'IMMATURE' | 'MATURING' | 'DEVELOPED' {
  if (avgIndustry <= 4) {
    return 'IMMATURE';
  }
  if (avgIndustry <= 6) {
    return 'MATURING';
  }
  return 'DEVELOPED';
}

function resolveStructuralDamagePercent(planet: BotPlanetSnapshot): number {
  if (hasEmergencyInfrastructureDamage(planet.infrastructure, 25)) {
    return Math.max(25, planet.infrastructure.totalDamagePercent);
  }

  return planet.infrastructure.totalDamagePercent;
}

function clampWeight(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
