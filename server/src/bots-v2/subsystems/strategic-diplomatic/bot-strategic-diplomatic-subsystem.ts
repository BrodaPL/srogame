import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { DefenceType } from '../../../../../src/app/models/enums/defence-type.js';
import { allowedDiplomaticProposalStatuses } from '../../../../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { calculateProbeEspionageLevelBonus } from '../../../../../src/app/generators/espionage-report-generator.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { WeaponType } from '../../../../../src/app/models/enums/weapon-type.js';
import { isPlanetaryBombDefenceType } from '../../../../../src/app/models/defences/planetary-bomb.js';
import { isArmamentDeliveryShipType } from '../../../../../src/app/models/missions/armament-delivery.js';
import { fleetTravelTurnsForDistance } from '../../../../../src/app/models/tech/technology-effects.js';
import type {
  BotMemoryV2StrategicDiplomaticFactionEntry,
  BotProfileId
} from '../../../../../src/app/models/player.ts';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotStrategicDiplomaticFactionSnapshot,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  DEFENCE_BLUEPRINTS,
  calculateFuelCost,
  calculateTravelDistance,
  SHIP_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';

type FactionLedgerMap = Map<number, BotMemoryV2StrategicDiplomaticFactionEntry>;

type EvaluatedFaction = {
  faction: BotStrategicDiplomaticFactionSnapshot;
  hostilityScore: number;
  stanceScore: number;
  strengthEstimate: number;
  relativeStrength: number;
  confidence: number;
  bestEscalationUtility: number | null;
  bestEscalationStatus: DiplomaticStatus | null;
  bestDeescalationUtility: number | null;
  bestDeescalationStatus: DiplomaticStatus | null;
  allianceUtility: number | null;
  retaliationFlagScore: number | null;
  statusPriorityWeight: number;
  desiredIntelDepth: number;
  intelInsufficient: boolean;
  enemyEspionageSuperiority: boolean;
};

type SpyMissionRequest = {
  faction: EvaluatedFaction;
  originPlanet: BotPlanetSnapshot;
  targetCoordinates: { x: number; y: number; z: number };
  probeAmount: number;
  targetIntelDepth: number;
  targetReportAge: number;
  estimatedDifficulty: number;
  travelDistance: number;
  travelTurns: number;
  score: number;
};

type BlockedSpyNeed = {
  faction: EvaluatedFaction;
  targetCoordinates: { x: number; y: number; z: number };
  probeAmount: number;
  score: number;
};

type ProbeShipNeedRequest = {
  originPlanet: BotPlanetSnapshot;
  amount: number;
  score: number;
  reason: string;
};

type DiplomaticWarState = 'WINNING' | 'BALANCED' | 'LOSING';

type CombatShipSelection = {
  ships: Array<{
    type: ShipType;
    undamagedAmount: number;
    damagedAmount: number;
  }>;
  combatStrength: number;
};

type BombardmentShipSelection = CombatShipSelection & {
  hasBombardmentShip: boolean;
};

type AttackMissionRequest = {
  kind: 'ATTACK';
  faction: EvaluatedFaction;
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  originPlanet: BotPlanetSnapshot;
  ships: CombatShipSelection['ships'];
  requiredStrength: number;
  selectedStrength: number;
  travelDistance: number;
  travelTurns: number;
  score: number;
  scoutOnly: boolean;
};

type SupportMissionRequest = {
  kind: 'SUPPORT';
  supportMissionType: FleetMissionType.DEFEND | FleetMissionType.REPAIR;
  faction: EvaluatedFaction;
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  originPlanet: BotPlanetSnapshot;
  ships: CombatShipSelection['ships'];
  requiredStrength: number;
  selectedStrength: number;
  travelDistance: number;
  travelTurns: number;
  score: number;
  needReason: 'EXPLICIT_REQUEST' | 'RECENT_ATTACK';
};

type WarShipNeedRequest = {
  originPlanet: BotPlanetSnapshot;
  shipType: ShipType;
  amount: number;
  score: number;
  reason: string;
  targetCoordinates: { x: number; y: number; z: number };
  needKind: 'ATTACK' | 'GUARD' | 'REPAIR' | 'BOMBARD' | 'SIEGE' | 'MOVE' | 'ARMAMENT_DELIVERY';
};

type BombardmentMissionRequest = {
  missionType: FleetMissionType.BOMBARD | FleetMissionType.SIEGE;
  faction: EvaluatedFaction;
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  originPlanet: BotPlanetSnapshot;
  ships: CombatShipSelection['ships'];
  carriedBombs: Array<{ type: DefenceType; amount: number }>;
  requiredStrength: number;
  selectedStrength: number;
  travelDistance: number;
  travelTurns: number;
  score: number;
  siegeRisk: number;
};

type RelocationMissionRequest = {
  missionType: FleetMissionType.MOVE;
  phase: 'BOMBARDMENT_RELOCATION';
  faction: EvaluatedFaction;
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  originPlanet: BotPlanetSnapshot;
  stagingPlanet: BotPlanetSnapshot;
  ships: CombatShipSelection['ships'];
  travelDistance: number;
  travelTurns: number;
  score: number;
  moveRole: 'BOMBARDMENT_STAGING';
  useJumpGate: boolean;
};

type ArmamentDeliveryMissionRequest = {
  missionType: FleetMissionType.ARMAMENT_DELIVERY;
  targetKind: 'OWN' | 'ALLIED';
  originPlanet: BotPlanetSnapshot;
  targetCoordinates: { x: number; y: number; z: number };
  ships: CombatShipSelection['ships'];
  carriedBombs: Array<{ type: DefenceType; amount: number }>;
  cargo: { metal: number; crystal: number; deuterium: number };
  travelDistance: number;
  travelTurns: number;
  score: number;
  useJumpGate: boolean;
};

type DiplomaticBuildingRequest = {
  originPlanet: BotPlanetSnapshot;
  buildingType: BuildingType;
  nextLevel: number;
  score: number;
  reason: string;
};

type DiplomaticBombProductionRequest = {
  originPlanet: BotPlanetSnapshot;
  bombType: DefenceType;
  amount: number;
  score: number;
  reason: string;
};

const STRATEGIC_DIPLOMATIC_AVAILABILITY = 0.4;
const WAR_HOSTILITY_THRESHOLD = 35;
const RETALIATION_THRESHOLD = 18;
const RELATION_PROPOSAL_MIN_UTILITY = 8;
const MAX_PROBE_SHIP_NEED_REQUESTS = 2;
const HOSTILE_NEUTRAL_ATTACK_THRESHOLD = 50;
const WEAKER_NEUTRAL_ATTACK_RATIO = 1.5;
const BOMBARDMENT_ATTACK_THRESHOLD = 0.65;
const STRATEGIC_HUB_BOMB_STOCK_RATIO_AT_WAR = 0.9;
const STRATEGIC_HUB_BOMB_STOCK_RATIO_ALLIED = 0.4;
const STRATEGIC_HUB_BOMB_STOCK_RATIO_PEACE = 0.15;

export class BotStrategicDiplomaticSubsystem implements BotSubsystem {
  public readonly subsystemId = 'STRATEGIC_DIPLOMATIC' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const ledger = createFactionLedgerMap(context.memory.strategicDiplomatic.factionLedger);
    const ownStrengthEstimate = resolveOwnStrengthEstimate(context);
    const statusCounts = resolveStatusCounts(context.snapshot.empire.strategicDiplomaticFactions);
    const proposalCap = resolveDiplomaticProposalCap(context);
    const evaluatedFactions = context.snapshot.empire.strategicDiplomaticFactions
      .map((faction) => evaluateFaction(context, faction, ledger, ownStrengthEstimate, statusCounts))
      .sort((left, right) =>
        Math.max(
          right.bestEscalationUtility ?? -Infinity,
          right.bestDeescalationUtility ?? -Infinity,
          right.allianceUtility ?? -Infinity,
          right.retaliationFlagScore ?? -Infinity
        ) - Math.max(
          left.bestEscalationUtility ?? -Infinity,
          left.bestDeescalationUtility ?? -Infinity,
          left.allianceUtility ?? -Infinity,
          left.retaliationFlagScore ?? -Infinity
        )
        || right.hostilityScore - left.hostilityScore
        || left.faction.playerId - right.faction.playerId
      );
    const availableFleetSlots = Math.max(
      0,
      context.snapshot.empire.maxActiveFleetCount - context.snapshot.empire.activeFleetCount
    );
    const spyPlanning = createSpyMissionRequests(context, evaluatedFactions, availableFleetSlots);
    const diplomaticProbeNeedRequests = createProbeShipNeedRequests(
      context,
      spyPlanning.globalProbeDeficit,
      spyPlanning.blockedDueToProbeShortage
    );
    const warState = resolveDiplomaticWarState(context, evaluatedFactions);
    const remainingFleetSlots = Math.max(0, availableFleetSlots - spyPlanning.requests.length);
    const combatPlanning = createCombatMissionRequests(context, evaluatedFactions, remainingFleetSlots, warState);
    const forceProjectionPlanning = createForceProjectionRequests(
      context,
      evaluatedFactions,
      Math.max(0, remainingFleetSlots - combatPlanning.attackRequests.length - combatPlanning.supportRequests.length),
      warState
    );

    const proposals = [
      ...createRelationChangeProposals(context, evaluatedFactions),
      ...createProposalManagementPreferences(context, evaluatedFactions),
      ...createRetaliationFlagProposals(context, evaluatedFactions),
      ...spyPlanning.requests.map((request, index) => createSpyMissionProposal(context, request, index)),
      ...diplomaticProbeNeedRequests.map((request, index) => createProbeShipNeedProposal(context, request, index)),
      ...combatPlanning.attackRequests.map((request, index) => createAttackMissionProposal(context, request, index)),
      ...combatPlanning.supportRequests.map((request, index) => createSupportMissionProposal(context, request, index)),
      ...combatPlanning.shipNeeds.map((request, index) => createWarShipNeedProposal(context, request, index)),
      ...forceProjectionPlanning.bombardmentRequests.map((request, index) => createBombardmentMissionProposal(context, request, index)),
      ...forceProjectionPlanning.relocationRequests.map((request, index) => createRelocationMissionProposal(context, request, index)),
      ...forceProjectionPlanning.armamentDeliveryRequests.map((request, index) => createArmamentDeliveryMissionProposal(context, request, index)),
      ...forceProjectionPlanning.buildingRequests.map((request, index) => createDiplomaticBuildingProposal(context, request, index)),
      ...forceProjectionPlanning.bombProductionRequests.map((request, index) => createDiplomaticBombProductionProposal(context, request, index)),
      ...forceProjectionPlanning.shipNeeds.map((request, index) => createWarShipNeedProposal(context, request, index))
    ]
      .sort(compareDiplomaticProposals)
      .slice(0, proposalCap);

    context.memory.strategicDiplomatic.factionLedger = [...ledger.values()]
      .sort((left, right) => left.playerId - right.playerId);

    const strongestEnemy = evaluatedFactions.reduce<EvaluatedFaction | null>((best, faction) =>
      !best || faction.strengthEstimate > best.strengthEstimate ? faction : best, null);
    const weakestEnemy = evaluatedFactions.reduce<EvaluatedFaction | null>((best, faction) =>
      !best || faction.strengthEstimate < best.strengthEstimate ? faction : best, null);
    const topEscalationTarget = evaluatedFactions
      .filter((faction) => faction.bestEscalationStatus !== null)
      .sort((left, right) => (right.bestEscalationUtility ?? 0) - (left.bestEscalationUtility ?? 0))[0] ?? null;
    const topDeescalationTarget = evaluatedFactions
      .filter((faction) => faction.bestDeescalationStatus !== null)
      .sort((left, right) => (right.bestDeescalationUtility ?? 0) - (left.bestDeescalationUtility ?? 0))[0] ?? null;
    const topAllianceTarget = evaluatedFactions
      .filter((faction) => faction.allianceUtility !== null)
      .sort((left, right) => (right.allianceUtility ?? 0) - (left.allianceUtility ?? 0))[0] ?? null;
    const overallPressureScore = evaluatedFactions.reduce((sum, faction) =>
      sum + Math.abs(faction.stanceScore), 0);

    return {
      subsystemId: this.subsystemId,
      proposals,
      debug: {
        discoveredFactionCount: evaluatedFactions.length,
        warCount: statusCounts.WAR,
        alliedCount: statusCounts.ALLIED,
        peaceCount: statusCounts.PEACE,
        neutralCount: statusCounts.NEUTRAL,
        strongestEnemyPlayerId: strongestEnemy?.faction.playerId ?? null,
        weakestEnemyPlayerId: weakestEnemy?.faction.playerId ?? null,
        winningAnyWar: evaluatedFactions.some((faction) =>
          faction.faction.currentStatus === DiplomaticStatus.WAR && faction.relativeStrength > 0
        ),
        losingAnyWar: evaluatedFactions.some((faction) =>
          faction.faction.currentStatus === DiplomaticStatus.WAR && faction.relativeStrength < 0
        ),
        lacksAllies: statusCounts.ALLIED <= 0,
        topEscalationTargetPlayerId: topEscalationTarget?.faction.playerId ?? null,
        topDeescalationTargetPlayerId: topDeescalationTarget?.faction.playerId ?? null,
        topAllianceTargetPlayerId: topAllianceTarget?.faction.playerId ?? null,
        overallDiplomaticPressureScore: Math.round(overallPressureScore),
        proposalCap,
        proposalCount: proposals.length,
        spyMissionCount: spyPlanning.requests.length,
        spyTargetCount: spyPlanning.targetedFactionIds.size,
        blockedSpyShortageCount: spyPlanning.blockedDueToProbeShortage.length,
        probeShipNeedCount: diplomaticProbeNeedRequests.length,
        globalProbeNeedCap: resolveGlobalDiplomaticProbeNeedCap(context),
        globalProbeDeficit: spyPlanning.globalProbeDeficit,
        enemyEspionageSuperiorityCount: evaluatedFactions.filter((faction) => faction.enemyEspionageSuperiority).length,
        warState,
        diplomaticAttackMissionCount: combatPlanning.attackRequests.length,
        diplomaticSupportMissionCount: combatPlanning.supportRequests.length,
        diplomaticWarShipNeedCount: combatPlanning.shipNeeds.length,
        diplomaticBombardmentMissionCount: forceProjectionPlanning.bombardmentRequests.length,
        diplomaticRelocationMissionCount: forceProjectionPlanning.relocationRequests.length,
        diplomaticArmamentDeliveryMissionCount: forceProjectionPlanning.armamentDeliveryRequests.length,
        diplomaticBuildingRequestCount: forceProjectionPlanning.buildingRequests.length,
        diplomaticBombProductionRequestCount: forceProjectionPlanning.bombProductionRequests.length,
        attackSharePercent: resolveAttackShareForWarState(warState),
        supportSharePercent: 100 - resolveAttackShareForWarState(warState),
        // TODO: Later phases should add tributes / bribes / negotiated payments to influence diplomacy.
        // TODO: Allied / peace empires should share hostile-activity intel automatically, and human allies should receive copied hostile battle reports.
        // TODO: Clarify whether allied Jump Gate travel should also reduce diplomatic MOVE / ARMAMENT_DELIVERY ETA like own Jump Gate travel.
        futureTributePressure: false
      }
    };
  }
}

function createFactionLedgerMap(
  entries: BotMemoryV2StrategicDiplomaticFactionEntry[]
): FactionLedgerMap {
  const map: FactionLedgerMap = new Map();
  for (const entry of entries) {
    map.set(entry.playerId, { ...entry });
  }
  return map;
}

function resolveOwnStrengthEstimate(context: BotSubsystemContext): number {
  const averageDevelopment = context.snapshot.planets.reduce((sum, planet) =>
    sum + planet.economy.averageMineLevel + planet.economy.researchLabLevel + planet.economy.shipyardLevel, 0
  ) / Math.max(1, context.snapshot.planets.length);
  const totalShipValue = context.snapshot.planets.reduce((sum, planet) =>
    sum + planet.ships.totalInstalledShipValue, 0);
  const averageTechLevel = context.snapshot.planets.reduce((sum, planet) =>
    sum
    + planet.tech.energyTechnologyLevel
    + planet.tech.computerTechnologyLevel
    + planet.tech.espionageTechnologyLevel
    + planet.tech.armourTechnologyLevel
    + planet.tech.beamsWeaponsLevel
    + planet.tech.missilesWeaponsLevel
    + planet.tech.railgunsWeaponsLevel,
    0
  ) / Math.max(1, context.snapshot.planets.length * 7);

  return (
    (context.snapshot.empire.ownedPlanetCount * 28)
    + (averageDevelopment * 9)
    + (averageTechLevel * 11)
    + (totalShipValue / 500)
  );
}

function resolveStatusCounts(factions: BotStrategicDiplomaticFactionSnapshot[]): Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number> {
  return factions.reduce((counts, faction) => {
    switch (faction.currentStatus) {
      case DiplomaticStatus.WAR:
        counts.WAR += 1;
        break;
      case DiplomaticStatus.ALLIED:
        counts.ALLIED += 1;
        break;
      case DiplomaticStatus.PEACE:
        counts.PEACE += 1;
        break;
      case DiplomaticStatus.NEUTRAL:
        counts.NEUTRAL += 1;
        break;
      default:
        break;
    }
    return counts;
  }, {
    WAR: 0,
    ALLIED: 0,
    PEACE: 0,
    NEUTRAL: 0
  });
}

function evaluateFaction(
  context: BotSubsystemContext,
  faction: BotStrategicDiplomaticFactionSnapshot,
  ledger: FactionLedgerMap,
  ownStrengthEstimate: number,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>
): EvaluatedFaction {
  const previous = ledger.get(faction.playerId) ?? {
    playerId: faction.playerId,
    hostilityScore: 0,
    lastComputedStanceScore: 0,
    lastComputedStrengthEstimate: 0,
    lastKnownStatus: null,
    lastSeenTurn: null
  };
  const strengthEstimate = resolveFactionStrengthEstimate(faction);
  const relativeStrength = ownStrengthEstimate - strengthEstimate;
  const confidence = resolveFactionConfidence(faction);
  const hostilityScore = resolveHostilityScore(faction, previous);
  const stanceScore = resolveStanceScore(
    context.snapshot.profileId,
    faction,
    relativeStrength,
    hostilityScore,
    confidence,
    statusCounts
  );
  const relationUtilities = resolveRelationUtilities(
    context.snapshot.profileId,
    faction,
    stanceScore,
    hostilityScore,
    relativeStrength,
    confidence,
    statusCounts
  );

  ledger.set(faction.playerId, {
    playerId: faction.playerId,
    hostilityScore,
    lastComputedStanceScore: stanceScore,
    lastComputedStrengthEstimate: strengthEstimate,
    lastKnownStatus: faction.currentStatus,
    lastSeenTurn: context.snapshot.turn
  });

  return {
    faction,
    hostilityScore,
    stanceScore,
    strengthEstimate,
    relativeStrength,
    confidence,
    bestEscalationUtility: relationUtilities.bestEscalationUtility,
    bestEscalationStatus: relationUtilities.bestEscalationStatus,
    bestDeescalationUtility: relationUtilities.bestDeescalationUtility,
    bestDeescalationStatus: relationUtilities.bestDeescalationStatus,
    allianceUtility: relationUtilities.allianceUtility,
    retaliationFlagScore: hostilityScore >= RETALIATION_THRESHOLD && hostilityScore < WAR_HOSTILITY_THRESHOLD
      ? hostilityScore + Math.max(0, stanceScore)
      : null,
    statusPriorityWeight: resolveStatusPriorityWeight(faction.currentStatus),
    desiredIntelDepth: resolveDesiredIntelDepth(faction.currentStatus),
    intelInsufficient: isFactionIntelInsufficient(faction),
    enemyEspionageSuperiority: estimateEnemyEspionageSuperiority(context, faction)
  };
}

function resolveFactionStrengthEstimate(faction: BotStrategicDiplomaticFactionSnapshot): number {
  return (
    (faction.totalPlanetCount * 28)
    + (faction.averageKnownBuildingLevel * 9)
    + (faction.averageKnownTechLevel * 11)
    + (faction.averageKnownShipsAmount * 1.5)
    + (faction.averageKnownDefencesAmount * 0.8)
    + (faction.bestIntelDepth * 4)
  );
}

function resolveFactionConfidence(faction: BotStrategicDiplomaticFactionSnapshot): number {
  const knowledgeShare = faction.knownPlanetCount / Math.max(1, faction.totalPlanetCount);
  const intelShare = faction.bestIntelDepth / 14;
  const freshnessShare = faction.lastRelevantReportAge === null
    ? 0
    : Math.max(0, 1 - (faction.lastRelevantReportAge / 200));
  return Math.max(0.15, Math.min(1, (knowledgeShare * 0.4) + (intelShare * 0.4) + (freshnessShare * 0.2)));
}

function resolveStatusPriorityWeight(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.WAR:
      return 60;
    case DiplomaticStatus.NEUTRAL:
      return 25;
    case DiplomaticStatus.PEACE:
      return 10;
    case DiplomaticStatus.ALLIED:
      return 5;
    default:
      return 0;
  }
}

function resolveDesiredIntelDepth(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.WAR:
      return 11;
    case DiplomaticStatus.NEUTRAL:
      return 9;
    case DiplomaticStatus.PEACE:
      return 8;
    case DiplomaticStatus.ALLIED:
      return 6;
    default:
      return 6;
  }
}

function resolveIntelStaleThreshold(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.WAR:
      return 90;
    case DiplomaticStatus.NEUTRAL:
      return 140;
    case DiplomaticStatus.PEACE:
      return 180;
    case DiplomaticStatus.ALLIED:
      return 240;
    default:
      return 180;
  }
}

function isFactionIntelInsufficient(faction: BotStrategicDiplomaticFactionSnapshot): boolean {
  const desiredDepth = resolveDesiredIntelDepth(faction.currentStatus);
  const staleThreshold = resolveIntelStaleThreshold(faction.currentStatus);
  const coverageShare = faction.knownPlanetCount / Math.max(1, faction.totalPlanetCount);
  return faction.bestIntelDepth < desiredDepth
    || (faction.lastRelevantReportAge ?? Number.MAX_SAFE_INTEGER) > staleThreshold
    || coverageShare < 0.5;
}

function estimateEnemyEspionageSuperiority(
  context: BotSubsystemContext,
  faction: BotStrategicDiplomaticFactionSnapshot
): boolean {
  const ownEspionageTech = Math.max(
    0,
    ...context.snapshot.planets.map((planet) => planet.tech.espionageTechnologyLevel)
  );
  const targetPlanet = faction.knownPlanets
    .slice()
    .sort((left, right) =>
      right.averageTechLevel - left.averageTechLevel
      || right.intelDepth - left.intelDepth
      || left.lastRelevantReportAge - right.lastRelevantReportAge
    )[0] ?? null;
  if (!targetPlanet) {
    return false;
  }

  const estimatedDefenderTech = Math.max(
    0,
    Math.round(Math.max(faction.averageKnownTechLevel, targetPlanet.averageTechLevel) * 0.85)
  );
  const estimatedBunkerPenalty = Math.max(0, Math.ceil(Math.sqrt(Math.max(0, targetPlanet.bunkerLevel ?? 0))));
  const ownBaseIntelPower = Math.floor(ownEspionageTech * (1 + (targetPlanet.anomaliesAndNoise / 100)));
  const requiredProbeBonus = Math.max(
    0,
    resolveDesiredReportLevel(faction.currentStatus)
      - ownBaseIntelPower
      + Math.floor(Math.sqrt(estimatedDefenderTech) * 2)
      + estimatedBunkerPenalty
  );
  return requiredProbeBonus >= 9;
}

function resolveHostilityScore(
  faction: BotStrategicDiplomaticFactionSnapshot,
  previous: BotMemoryV2StrategicDiplomaticFactionEntry
): number {
  let score = previous.hostilityScore * 0.6;
  score += faction.recentBattleReportCount * 12;
  if (faction.currentStatus === DiplomaticStatus.WAR) {
    score += 20;
  }
  if (faction.pendingIncomingRequestedStatuses.includes(DiplomaticStatus.WAR)) {
    score += 24;
  }
  if (faction.pendingIncomingRequestedStatuses.includes(DiplomaticStatus.NEUTRAL)) {
    score += 6;
  }
  return Math.max(0, Math.min(120, score));
}

function resolveStanceScore(
  profileId: BotProfileId | null,
  faction: BotStrategicDiplomaticFactionSnapshot,
  relativeStrength: number,
  hostilityScore: number,
  confidence: number,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>
): number {
  const personalityBias = resolvePersonalityEscalationBias(profileId);
  const strengthBias = relativeStrength > 20
    ? 12
    : relativeStrength > 8
      ? 6
      : relativeStrength < -20
        ? -16
        : relativeStrength < -8
          ? -8
          : 0;
  const hostilityBias = Math.min(35, hostilityScore * 0.7);
  const relationBias = faction.currentStatus === DiplomaticStatus.WAR
    ? 10
    : faction.currentStatus === DiplomaticStatus.ALLIED
      ? -14
      : faction.currentStatus === DiplomaticStatus.PEACE
        ? -7
        : 0;
  const networkPressure = resolveNetworkPressure(profileId, statusCounts, faction.currentStatus);
  const rawScore = personalityBias + strengthBias + hostilityBias + relationBias + networkPressure;
  const uncertaintyPenalty = (1 - confidence) * 20;
  return rawScore - uncertaintyPenalty;
}

function resolvePersonalityEscalationBias(profileId: BotProfileId | null): number {
  switch (profileId) {
    case 'AGGRESSOR':
      return 18;
    case 'MINER':
      return -14;
    case 'AVOIDER':
      return -18;
    case 'BUNKERER':
      return -10;
    case 'TURTLE':
      return -12;
    case 'BALANCED':
    default:
      return 0;
  }
}

function resolveNetworkPressure(
  profileId: BotProfileId | null,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>,
  currentStatus: DiplomaticStatus
): number {
  switch (profileId) {
    case 'AGGRESSOR':
      return statusCounts.WAR <= 0 && currentStatus === DiplomaticStatus.NEUTRAL ? 16 : 0;
    case 'MINER':
      return statusCounts.ALLIED <= 0 && (currentStatus === DiplomaticStatus.NEUTRAL || currentStatus === DiplomaticStatus.PEACE)
        ? -12
        : statusCounts.WAR > 0 ? -8 : 0;
    case 'AVOIDER':
      return statusCounts.WAR > 0 ? -14 : -4;
    case 'BUNKERER':
    case 'TURTLE':
      return statusCounts.WAR > 0 ? -10 : statusCounts.ALLIED <= 0 ? -4 : 0;
    case 'BALANCED':
    default:
      return statusCounts.WAR > 1 ? -6 : 0;
  }
}

function resolveRelationUtilities(
  profileId: BotProfileId | null,
  faction: BotStrategicDiplomaticFactionSnapshot,
  stanceScore: number,
  hostilityScore: number,
  relativeStrength: number,
  confidence: number,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>
): {
  bestEscalationUtility: number | null;
  bestEscalationStatus: DiplomaticStatus | null;
  bestDeescalationUtility: number | null;
  bestDeescalationStatus: DiplomaticStatus | null;
  allianceUtility: number | null;
} {
  let bestEscalationUtility: number | null = null;
  let bestEscalationStatus: DiplomaticStatus | null = null;
  let bestDeescalationUtility: number | null = null;
  let bestDeescalationStatus: DiplomaticStatus | null = null;
  let allianceUtility: number | null = null;

  for (const requestedStatus of allowedDiplomaticProposalStatuses(faction.currentStatus)) {
    const utility = computeRelationChangeUtility(
      profileId,
      faction.currentStatus,
      requestedStatus,
      stanceScore,
      hostilityScore,
      relativeStrength,
      confidence,
      statusCounts
    );

    if (requestedStatus === DiplomaticStatus.WAR) {
      if (bestEscalationUtility === null || utility > bestEscalationUtility) {
        bestEscalationUtility = utility;
        bestEscalationStatus = requestedStatus;
      }
      continue;
    }
    if (requestedStatus === DiplomaticStatus.ALLIED) {
      allianceUtility = utility;
      continue;
    }

    if (requestedStatus === DiplomaticStatus.NEUTRAL && faction.currentStatus === DiplomaticStatus.PEACE) {
      if (bestEscalationUtility === null || utility > bestEscalationUtility) {
        bestEscalationUtility = utility;
        bestEscalationStatus = requestedStatus;
      }
      continue;
    }

    if (requestedStatus === DiplomaticStatus.NEUTRAL || requestedStatus === DiplomaticStatus.PEACE) {
      if (bestDeescalationUtility === null || utility > bestDeescalationUtility) {
        bestDeescalationUtility = utility;
        bestDeescalationStatus = requestedStatus;
      }
    }
  }

  return {
    bestEscalationUtility,
    bestEscalationStatus,
    bestDeescalationUtility,
    bestDeescalationStatus,
    allianceUtility
  };
}

function computeRelationChangeUtility(
  profileId: BotProfileId | null,
  currentStatus: DiplomaticStatus,
  requestedStatus: DiplomaticStatus,
  stanceScore: number,
  hostilityScore: number,
  relativeStrength: number,
  confidence: number,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>
): number {
  if (requestedStatus === DiplomaticStatus.WAR) {
    if (hostilityScore < WAR_HOSTILITY_THRESHOLD) {
      return -999;
    }
    return stanceScore + Math.max(0, hostilityScore - 20) + Math.max(0, relativeStrength * 0.5) + (confidence * 10);
  }

  if (requestedStatus === DiplomaticStatus.PEACE) {
    const allianceDeficit = statusCounts.ALLIED <= 0 ? 5 : 0;
    return (-stanceScore) + (currentStatus === DiplomaticStatus.WAR ? 18 : 8) + allianceDeficit + (confidence * 6);
  }

  if (requestedStatus === DiplomaticStatus.ALLIED) {
    const allyNeed = statusCounts.ALLIED <= 0 ? 12 : 4;
    const minerBias = profileId === 'MINER' ? 8 : profileId === 'AVOIDER' ? 4 : 0;
    return (-stanceScore) + allyNeed + minerBias + (relativeStrength > -15 ? 4 : -6) + (confidence * 8);
  }

  if (requestedStatus === DiplomaticStatus.NEUTRAL) {
    return (-Math.abs(stanceScore) * 0.5) + (currentStatus === DiplomaticStatus.WAR ? 14 : 10) + (confidence * 5);
  }

  return -999;
}

function createRelationChangeProposals(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): BotProposal[] {
  const proposals: BotProposal[] = [];

  for (const faction of factions) {
    const incomingOrOutgoingRequested = new Set([
      ...faction.faction.pendingIncomingRequestedStatuses,
      ...faction.faction.pendingOutgoingRequestedStatuses
    ]);

    const candidates: Array<{ requestedStatus: DiplomaticStatus; utility: number }> = [];
    if (
      faction.bestEscalationStatus !== null
      && faction.bestEscalationUtility !== null
      && faction.bestEscalationUtility >= RELATION_PROPOSAL_MIN_UTILITY
      && !incomingOrOutgoingRequested.has(faction.bestEscalationStatus)
    ) {
      candidates.push({
        requestedStatus: faction.bestEscalationStatus,
        utility: faction.bestEscalationUtility
      });
    }
    if (
      faction.bestDeescalationStatus !== null
      && faction.bestDeescalationUtility !== null
      && faction.bestDeescalationUtility >= RELATION_PROPOSAL_MIN_UTILITY
      && !incomingOrOutgoingRequested.has(faction.bestDeescalationStatus)
    ) {
      candidates.push({
        requestedStatus: faction.bestDeescalationStatus,
        utility: faction.bestDeescalationUtility
      });
    }
    if (
      faction.faction.currentStatus === DiplomaticStatus.PEACE
      && faction.allianceUtility !== null
      && faction.allianceUtility >= RELATION_PROPOSAL_MIN_UTILITY
      && !incomingOrOutgoingRequested.has(DiplomaticStatus.ALLIED)
    ) {
      candidates.push({
        requestedStatus: DiplomaticStatus.ALLIED,
        utility: faction.allianceUtility
      });
    }

    const best = candidates.sort((left, right) => right.utility - left.utility)[0] ?? null;
    if (!best) {
      continue;
    }

    proposals.push({
      proposalId: `strategic-diplomatic:relation:${faction.faction.playerId}:${best.requestedStatus}:${context.snapshot.turn}`,
      subsystemId: 'STRATEGIC_DIPLOMATIC',
      kind: 'NO_OP',
      status: 'PROPOSED',
      goalKey: `strategic-diplomatic:relation:${faction.faction.playerId}`,
      dedupeKey: `strategic-diplomatic:relation:${faction.faction.playerId}:${best.requestedStatus}`,
      summary: `Diplomatic relation proposal: move ${faction.faction.playerName} from ${faction.faction.currentStatus} toward ${best.requestedStatus}.`,
      planetId: null,
      targetCoordinates: null,
      expectedValue: Math.max(1, Math.round(best.utility * 10)),
      urgency: best.requestedStatus === DiplomaticStatus.WAR ? 82 : best.requestedStatus === DiplomaticStatus.ALLIED ? 63 : 71,
      risk: best.requestedStatus === DiplomaticStatus.WAR ? 34 : 12,
      confidence: Math.round(faction.confidence * 100),
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      requestPayload: {
        actionType: 'RELATION_CHANGE',
        targetPlayerId: faction.faction.playerId,
        currentStatus: faction.faction.currentStatus,
        requestedStatus: best.requestedStatus
      },
      blockers: [],
      expiresOnTurn: context.snapshot.turn + 1,
      debug: {
        playerId: faction.faction.playerId,
        currentStatus: faction.faction.currentStatus,
        requestedStatus: best.requestedStatus,
        utility: Math.round(best.utility),
        hostilityScore: Math.round(faction.hostilityScore),
        stanceScore: Math.round(faction.stanceScore),
        relativeStrength: Math.round(faction.relativeStrength)
      }
    });
  }

  return proposals;
}

function createProposalManagementPreferences(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): BotProposal[] {
  const proposals: BotProposal[] = [];

  for (const faction of factions) {
    for (const requestedStatus of faction.faction.pendingIncomingRequestedStatuses) {
      const utility = computeRelationChangeUtility(
        context.snapshot.profileId,
        faction.faction.currentStatus,
        requestedStatus,
        faction.stanceScore,
        faction.hostilityScore,
        faction.relativeStrength,
        faction.confidence,
        resolveStatusCounts(context.snapshot.empire.strategicDiplomaticFactions)
      );
      proposals.push({
        proposalId: `strategic-diplomatic:incoming:${faction.faction.playerId}:${requestedStatus}:${context.snapshot.turn}`,
        subsystemId: 'STRATEGIC_DIPLOMATIC',
        kind: 'NO_OP',
        status: 'PROPOSED',
        goalKey: `strategic-diplomatic:incoming:${faction.faction.playerId}:${requestedStatus}`,
        dedupeKey: `strategic-diplomatic:incoming:${faction.faction.playerId}:${requestedStatus}`,
        summary: `Diplomatic response preference: ${utility >= RELATION_PROPOSAL_MIN_UTILITY ? 'approve' : 'reject'} incoming ${requestedStatus} proposal from ${faction.faction.playerName}.`,
        planetId: null,
        targetCoordinates: null,
        expectedValue: Math.max(1, Math.round(Math.abs(utility) * 8)),
        urgency: 74,
        risk: 8,
        confidence: Math.round(faction.confidence * 100),
        requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
        requestPayload: {
          actionType: 'PROPOSAL_PREFERENCE',
          targetPlayerId: faction.faction.playerId,
          currentStatus: faction.faction.currentStatus,
          requestedStatus,
          preference: utility >= RELATION_PROPOSAL_MIN_UTILITY ? 'APPROVE' : 'REJECT'
        },
        blockers: [],
        expiresOnTurn: context.snapshot.turn + 1,
        debug: {
          playerId: faction.faction.playerId,
          preference: utility >= RELATION_PROPOSAL_MIN_UTILITY ? 'APPROVE' : 'REJECT',
          requestedStatus,
          utility: Math.round(utility)
        }
      });
    }

    for (const requestedStatus of faction.faction.pendingOutgoingRequestedStatuses) {
      const utility = computeRelationChangeUtility(
        context.snapshot.profileId,
        faction.faction.currentStatus,
        requestedStatus,
        faction.stanceScore,
        faction.hostilityScore,
        faction.relativeStrength,
        faction.confidence,
        resolveStatusCounts(context.snapshot.empire.strategicDiplomaticFactions)
      );
      if (utility >= 0) {
        continue;
      }
      proposals.push({
        proposalId: `strategic-diplomatic:outgoing:${faction.faction.playerId}:${requestedStatus}:${context.snapshot.turn}`,
        subsystemId: 'STRATEGIC_DIPLOMATIC',
        kind: 'NO_OP',
        status: 'PROPOSED',
        goalKey: `strategic-diplomatic:outgoing:${faction.faction.playerId}:${requestedStatus}`,
        dedupeKey: `strategic-diplomatic:outgoing:${faction.faction.playerId}:${requestedStatus}`,
        summary: `Diplomatic response preference: cancel outgoing ${requestedStatus} proposal toward ${faction.faction.playerName}.`,
        planetId: null,
        targetCoordinates: null,
        expectedValue: Math.max(1, Math.round(Math.abs(utility) * 8)),
        urgency: 61,
        risk: 4,
        confidence: Math.round(faction.confidence * 100),
        requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
        requestPayload: {
          actionType: 'PROPOSAL_PREFERENCE',
          targetPlayerId: faction.faction.playerId,
          currentStatus: faction.faction.currentStatus,
          requestedStatus,
          preference: 'CANCEL'
        },
        blockers: [],
        expiresOnTurn: context.snapshot.turn + 1,
        debug: {
          playerId: faction.faction.playerId,
          preference: 'CANCEL',
          requestedStatus,
          utility: Math.round(utility)
        }
      });
    }
  }

  return proposals;
}

function createRetaliationFlagProposals(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): BotProposal[] {
  return factions
    .filter((faction) => faction.retaliationFlagScore !== null && faction.faction.currentStatus !== DiplomaticStatus.WAR)
    .map((faction) => ({
      proposalId: `strategic-diplomatic:retaliation:${faction.faction.playerId}:${context.snapshot.turn}`,
      subsystemId: 'STRATEGIC_DIPLOMATIC',
      kind: 'NO_OP',
      status: 'PROPOSED',
      goalKey: `strategic-diplomatic:retaliation:${faction.faction.playerId}`,
      dedupeKey: `strategic-diplomatic:retaliation:${faction.faction.playerId}`,
      summary: `Diplomatic retaliation flag: rising hostility from ${faction.faction.playerName} should influence later strategic escalation.`,
      planetId: null,
      targetCoordinates: null,
      expectedValue: Math.max(1, Math.round((faction.retaliationFlagScore ?? 0) * 6)),
      urgency: 58,
      risk: 3,
      confidence: Math.round(faction.confidence * 100),
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      requestPayload: {
        actionType: 'RETALIATION_FLAG',
        targetPlayerId: faction.faction.playerId,
        currentStatus: faction.faction.currentStatus,
        hostilityScore: Math.round(faction.hostilityScore)
      },
      blockers: [],
      expiresOnTurn: context.snapshot.turn + 1,
      debug: {
        playerId: faction.faction.playerId,
        hostilityScore: Math.round(faction.hostilityScore),
        retaliationFlag: true
      }
    }));
}

function resolveDiplomaticWarState(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): DiplomaticWarState {
  const warFactions = factions.filter((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR);
  const relativeStrengthScore = warFactions.reduce((sum, faction) => sum + faction.relativeStrength, 0);
  const hostilePressure = warFactions.reduce((sum, faction) => sum + faction.hostilityScore, 0);
  const ownDamage = context.snapshot.planets.reduce((sum, planet) =>
    sum + (planet.infrastructure.damagedBuildingCount * 8) + Math.ceil(planet.infrastructure.missingBuildingStructuralPoints / 100), 0);
  const allyDistress = factions
    .filter((faction) => faction.faction.currentStatus === DiplomaticStatus.ALLIED)
    .reduce((sum, faction) =>
      sum
      + faction.faction.pendingIncomingSupportRequests.length * 18
      + faction.faction.knownPlanets.reduce((planetSum, planet) =>
        planetSum + (planet.recentBattleReportCount * 10), 0), 0);
  const totalPressure = hostilePressure + ownDamage + allyDistress;

  if (warFactions.length <= 0) {
    return ownDamage > 0 || allyDistress > 24 ? 'BALANCED' : 'WINNING';
  }
  if (relativeStrengthScore < -25 || totalPressure > 80) {
    return 'LOSING';
  }
  if (relativeStrengthScore > 25 && totalPressure < 45) {
    return 'WINNING';
  }
  return 'BALANCED';
}

function resolveAttackShareForWarState(warState: DiplomaticWarState): number {
  switch (warState) {
    case 'WINNING':
      return 70;
    case 'LOSING':
      return 40;
    case 'BALANCED':
    default:
      return 60;
  }
}

function createCombatMissionRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  availableFleetSlots: number,
  warState: DiplomaticWarState
): {
  attackRequests: AttackMissionRequest[];
  supportRequests: SupportMissionRequest[];
  shipNeeds: WarShipNeedRequest[];
} {
  if (availableFleetSlots <= 0) {
    return {
      attackRequests: [],
      supportRequests: [],
      shipNeeds: []
    };
  }

  const attackShare = resolveAttackShareForWarState(warState);
  const attackCap = Math.min(
    availableFleetSlots,
    Math.max(0, Math.round((availableFleetSlots * attackShare) / 100))
  );
  const supportCap = Math.max(0, availableFleetSlots - attackCap);
  const attackCandidates = createAttackMissionCandidates(context, factions)
    .sort((left, right) => right.score - left.score || left.travelTurns - right.travelTurns);
  const supportCandidates = createSupportMissionCandidates(context, factions)
    .sort((left, right) => right.score - left.score || left.travelTurns - right.travelTurns);

  const attackRequests = attackCandidates.slice(0, Math.max(0, attackCap));
  const supportRequests = supportCandidates.slice(0, Math.max(0, supportCap));
  const blockedNeeds = [
    ...createBlockedAttackShipNeeds(context, factions, attackRequests),
    ...createBlockedSupportShipNeeds(context, factions, supportRequests)
  ];

  return {
    attackRequests,
    supportRequests,
    shipNeeds: selectTopWarShipNeedsPerPlanet(blockedNeeds)
  };
}

function createForceProjectionRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  availableFleetSlots: number,
  warState: DiplomaticWarState
): {
  bombardmentRequests: BombardmentMissionRequest[];
  relocationRequests: RelocationMissionRequest[];
  armamentDeliveryRequests: ArmamentDeliveryMissionRequest[];
  buildingRequests: DiplomaticBuildingRequest[];
  bombProductionRequests: DiplomaticBombProductionRequest[];
  shipNeeds: WarShipNeedRequest[];
} {
  const bombardmentRequests: BombardmentMissionRequest[] = [];
  const relocationRequests: RelocationMissionRequest[] = [];
  const armamentDeliveryRequests = createArmamentDeliveryRequests(context, factions)
    .sort((left, right) => right.score - left.score || left.travelTurns - right.travelTurns);
  const buildingRequests = createDiplomaticBuildingRequests(context, factions, warState)
    .sort((left, right) => right.score - left.score || left.originPlanet.name.localeCompare(right.originPlanet.name));
  const bombProductionRequests = createBombProductionRequests(context, factions, warState)
    .sort((left, right) => right.score - left.score || left.originPlanet.name.localeCompare(right.originPlanet.name));
  const shipNeeds: WarShipNeedRequest[] = [];

  if (availableFleetSlots > 0) {
    const warTargets = factions
      .filter((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR)
      .flatMap((faction) => faction.faction.knownPlanets.map((targetPlanet) => ({ faction, targetPlanet })))
      .filter(({ targetPlanet }) => targetPlanet.intelDepth > 0)
      .sort((left, right) =>
        compareBombardmentTargetPriority(left.faction, left.targetPlanet, right.faction, right.targetPlanet)
      );
    for (const { faction, targetPlanet } of warTargets) {
      if (bombardmentRequests.length + relocationRequests.length >= availableFleetSlots) {
        break;
      }

      const bombardmentPlan = createBombardmentPlanForTarget(context, faction, targetPlanet);
      if (bombardmentPlan) {
        bombardmentRequests.push(bombardmentPlan);
        continue;
      }

      const relocationPlan = createBombardmentRelocationPlan(context, faction, targetPlanet);
      if (relocationPlan) {
        relocationRequests.push(...relocationPlan.requests);
        continue;
      }

      const blockedNeed = createBombardmentShipNeed(context, faction, targetPlanet);
      if (blockedNeed) {
        shipNeeds.push(blockedNeed);
      }
    }
  }

  return {
    bombardmentRequests,
    relocationRequests,
    armamentDeliveryRequests,
    buildingRequests,
    bombProductionRequests,
    shipNeeds: selectTopWarShipNeedsPerPlanet(shipNeeds)
  };
}

function compareBombardmentTargetPriority(
  leftFaction: EvaluatedFaction,
  leftTarget: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  rightFaction: EvaluatedFaction,
  rightTarget: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  const leftScore = estimateBombardmentTargetPriority(leftFaction, leftTarget);
  const rightScore = estimateBombardmentTargetPriority(rightFaction, rightTarget);
  return rightScore - leftScore
    || leftTarget.lastRelevantReportAge - rightTarget.lastRelevantReportAge
    || leftTarget.coordinates.x - rightTarget.coordinates.x
    || leftTarget.coordinates.y - rightTarget.coordinates.y
    || leftTarget.coordinates.z - rightTarget.coordinates.z;
}

function estimateBombardmentTargetPriority(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  return (
    (faction.statusPriorityWeight * 8)
    + (targetPlanet.averageBuildingLevel * 5)
    + (targetPlanet.totalDefencesAmount * 2)
    - (targetPlanet.lastRelevantReportAge / 5)
  );
}

function createBombardmentPlanForTarget(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): BombardmentMissionRequest | null {
  const missionType = resolvePreferredBombardmentMissionType(targetPlanet);
  const requiredStrength = resolveBombardmentRequiredStrength(targetPlanet, missionType);
  const plans = context.snapshot.planets
    .map((originPlanet) => createBombardmentPlanFromOrigin(context, originPlanet, faction, targetPlanet, missionType, requiredStrength))
    .filter((entry): entry is BombardmentMissionRequest => entry !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
      || right.selectedStrength - left.selectedStrength
    );

  return plans[0] ?? null;
}

function createBombardmentPlanFromOrigin(
  context: BotSubsystemContext,
  originPlanet: BotPlanetSnapshot,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  missionType: FleetMissionType.BOMBARD | FleetMissionType.SIEGE,
  requiredStrength: number
): BombardmentMissionRequest | null {
  const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
  const travelTurns = resolveTravelTurns(originPlanet, distance);
  const bombardmentShips = selectBombardmentShipsForStrength(originPlanet, requiredStrength, distance);
  const carriedBombs = selectCarryableBombPayload(originPlanet, bombardmentShips.ships);
  const hasBombardCapability = bombardmentShips.hasBombardmentShip || carriedBombs.length > 0;
  if (!hasBombardCapability || bombardmentShips.combatStrength < requiredStrength) {
    return null;
  }

  const useJumpGate = canUseOwnJumpGate(originPlanet, targetPlanet.coordinates, context.snapshot.planets);
  const siegeRisk = missionType === FleetMissionType.SIEGE
    ? estimateSiegeRisk(faction, targetPlanet, bombardmentShips.combatStrength)
    : 0;
  return {
    missionType,
    faction,
    targetPlanet,
    originPlanet,
    ships: bombardmentShips.ships,
    carriedBombs,
    requiredStrength,
    selectedStrength: bombardmentShips.combatStrength,
    travelDistance: distance,
    travelTurns: useJumpGate ? 1 : travelTurns,
    score: Math.max(
      1,
      520
      + Math.round(estimateBombardmentTargetPriority(faction, targetPlanet))
      - (travelTurns * 8)
      - siegeRisk
    ),
    siegeRisk
  };
}

function resolvePreferredBombardmentMissionType(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): FleetMissionType.BOMBARD | FleetMissionType.SIEGE {
  return targetPlanet.totalShipsAmount <= 0 && targetPlanet.totalDefencesAmount <= 0
    ? FleetMissionType.SIEGE
    : FleetMissionType.BOMBARD;
}

function resolveBombardmentRequiredStrength(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  missionType: FleetMissionType.BOMBARD | FleetMissionType.SIEGE
): number {
  const baseline = Math.max(
    1,
    Math.round((targetPlanet.totalShipsAmount * 1.2) + (targetPlanet.totalDefencesAmount * 1.6) + (targetPlanet.averageBuildingLevel * 3))
  );
  return missionType === FleetMissionType.SIEGE
    ? Math.ceil(baseline * 1.15)
    : Math.ceil(baseline * 0.95);
}

function estimateSiegeRisk(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  selectedStrength: number
): number {
  const orbitDuration = Math.max(1, Math.ceil(Math.max(1, targetPlanet.averageBuildingLevel) / 2));
  const hostilePressure = Math.max(0, faction.strengthEstimate - selectedStrength);
  return Math.max(0, Math.round((orbitDuration * 10) + (hostilePressure / 12)));
}

function createBombardmentRelocationPlan(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): { requests: RelocationMissionRequest[] } | null {
  const requiredStrength = resolveBombardmentRequiredStrength(targetPlanet, resolvePreferredBombardmentMissionType(targetPlanet));
  const stagingPlanet = resolveBestDiplomaticStagingPlanet(context, targetPlanet.coordinates);
  if (!stagingPlanet) {
    return null;
  }
  const stagingDistanceToTarget = calculateTravelDistance(stagingPlanet.coordinates, targetPlanet.coordinates);
  const stagingSelection = selectBombardmentShipsForStrength(stagingPlanet, requiredStrength, stagingDistanceToTarget);

  const selections = context.snapshot.planets
    .filter((planet) => toCoordinatesKey(planet.coordinates) !== toCoordinatesKey(stagingPlanet.coordinates))
    .map((originPlanet) => {
      const distance = calculateTravelDistance(originPlanet.coordinates, stagingPlanet.coordinates);
      const selection = selectBombardmentShipsForStrength(originPlanet, requiredStrength, distance);
      if (selection.ships.length <= 0 || selection.combatStrength <= 0) {
        return null;
      }
      const useJumpGate = canUseOwnJumpGate(originPlanet, stagingPlanet.coordinates, context.snapshot.planets);
      return {
        originPlanet,
        ships: selection.ships,
        combatStrength: selection.combatStrength,
        travelDistance: distance,
        travelTurns: useJumpGate ? 1 : resolveTravelTurns(originPlanet, distance),
        useJumpGate
      };
    })
    .filter((entry): entry is {
      originPlanet: BotPlanetSnapshot;
      ships: CombatShipSelection['ships'];
      combatStrength: number;
      travelDistance: number;
      travelTurns: number;
      useJumpGate: boolean;
    } => entry !== null)
    .sort((left, right) =>
      left.travelTurns - right.travelTurns
      || right.combatStrength - left.combatStrength
    );

  const requests: RelocationMissionRequest[] = [];
  let accumulatedStrength = stagingSelection.combatStrength;
  for (const selection of selections) {
    if (accumulatedStrength >= requiredStrength) {
      break;
    }
    accumulatedStrength += selection.combatStrength;
    requests.push({
      missionType: FleetMissionType.MOVE,
      phase: 'BOMBARDMENT_RELOCATION',
      faction,
      targetPlanet,
      originPlanet: selection.originPlanet,
      stagingPlanet,
      ships: selection.ships.map((ship) => ({ ...ship })),
      travelDistance: selection.travelDistance,
      travelTurns: selection.travelTurns,
      score: Math.max(1, 470 - (selection.travelTurns * 5) + Math.round(selection.combatStrength)),
      moveRole: 'BOMBARDMENT_STAGING',
      useJumpGate: selection.useJumpGate
    });
  }

  return accumulatedStrength >= requiredStrength && requests.length > 0
    ? { requests }
    : null;
}

function createBombardmentShipNeed(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): WarShipNeedRequest | null {
  const preferredOrigin = resolveBestMilitaryOrigin(context, targetPlanet.coordinates) ?? resolveFallbackOrigin(context);
  const combatType = resolveBestProducibleCombatShipType(context);
  if (!preferredOrigin || !combatType) {
    return null;
  }

  const missionType = resolvePreferredBombardmentMissionType(targetPlanet);
  const requiredStrength = resolveBombardmentRequiredStrength(targetPlanet, missionType);
  const availableStrength = estimateBestAvailableBombardmentStrength(context, targetPlanet.coordinates);
  const bombardmentType = resolveBestProducibleBombardmentShipType(context);
  if (availableStrength < BOMBARDMENT_ATTACK_THRESHOLD * requiredStrength && bombardmentType) {
    return {
      originPlanet: preferredOrigin,
      shipType: bombardmentType,
      amount: 1,
      score: 520 + requiredStrength,
      reason: missionType === FleetMissionType.SIEGE
        ? 'Need more bombardment pressure to establish a siege fleet.'
        : 'Need a bombardment-capable ship to project structural war pressure.',
      targetCoordinates: { ...targetPlanet.coordinates },
      needKind: missionType === FleetMissionType.SIEGE ? 'SIEGE' : 'BOMBARD'
    };
  }

  return combatType
    ? {
      originPlanet: preferredOrigin,
      shipType: combatType,
      amount: Math.max(1, Math.ceil(Math.max(0, requiredStrength - availableStrength) / Math.max(1, estimateShipCombatPower(combatType)))),
      score: 470 + requiredStrength,
      reason: missionType === FleetMissionType.SIEGE
        ? 'Need more war ships to support siege pressure.'
        : 'Need more war ships to support bombardment pressure.',
      targetCoordinates: { ...targetPlanet.coordinates },
      needKind: missionType === FleetMissionType.SIEGE ? 'SIEGE' : 'BOMBARD'
    }
    : null;
}

function estimateBestAvailableBombardmentStrength(
  context: BotSubsystemContext,
  targetCoordinates: { x: number; y: number; z: number }
): number {
  return context.snapshot.planets.reduce((best, originPlanet) => {
    const distance = calculateTravelDistance(originPlanet.coordinates, targetCoordinates);
    const selection = selectBombardmentShipsForStrength(originPlanet, Number.MAX_SAFE_INTEGER, distance);
    return Math.max(best, selection.combatStrength);
  }, 0);
}

function createArmamentDeliveryRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): ArmamentDeliveryMissionRequest[] {
  const requests: ArmamentDeliveryMissionRequest[] = [];
  const ownTargets = context.snapshot.planets
    .filter((planet) => isStrategicHubPlanet(planet) && resolvePlanetaryBombCount(planet) < resolveDesiredBombStockCount(planet, 'WAR', 1))
    .map((planet) => ({
      targetKind: 'OWN' as const,
      targetCoordinates: { ...planet.coordinates },
      alliedFaction: null
    }));
  const alliedTargets = factions
    .filter((faction) => faction.faction.currentStatus === DiplomaticStatus.ALLIED)
    .flatMap((faction) => faction.faction.knownPlanets
      .filter((planet) =>
        planet.recentBattleReportCount > 0
        || faction.faction.pendingIncomingSupportRequests.some((request) =>
          request.targetCoordinates.x === planet.coordinates.x
          && request.targetCoordinates.y === planet.coordinates.y
          && request.targetCoordinates.z === planet.coordinates.z
        ))
      .map((planet) => ({
        targetKind: 'ALLIED' as const,
        targetCoordinates: { ...planet.coordinates },
        alliedFaction: faction
      })));

  for (const target of [...ownTargets, ...alliedTargets]) {
    const request = createArmamentDeliveryRequestForTarget(context, target.targetKind, target.targetCoordinates, target.alliedFaction);
    if (request) {
      requests.push(request);
    }
  }

  return requests;
}

function createArmamentDeliveryRequestForTarget(
  context: BotSubsystemContext,
  targetKind: 'OWN' | 'ALLIED',
  targetCoordinates: { x: number; y: number; z: number },
  alliedFaction: EvaluatedFaction | null
): ArmamentDeliveryMissionRequest | null {
  const candidates = context.snapshot.planets
    .map((originPlanet) => {
      if (toCoordinatesKey(originPlanet.coordinates) === toCoordinatesKey(targetCoordinates)) {
        return null;
      }
      const carrier = resolveBestArmamentCarrier(originPlanet);
      if (!carrier) {
        return null;
      }
      const carriedBombs = selectCarryableBombPayload(originPlanet, [{
        type: carrier.type,
        undamagedAmount: 1,
        damagedAmount: 0
      }]);
      const carriedSupport = resolveArmamentDeliverySupportShips(originPlanet, carrier.hangarCapacity);
      if (carriedBombs.length <= 0 && carriedSupport.length <= 0) {
        return null;
      }
      const distance = calculateTravelDistance(originPlanet.coordinates, targetCoordinates);
      const ships = [{
        type: carrier.type,
        undamagedAmount: 1,
        damagedAmount: 0
      }, ...carriedSupport];
      if (!hasEnoughDeuteriumForShips(originPlanet, ships, distance)) {
        return null;
      }
      const useJumpGate = targetKind === 'OWN' && canUseOwnJumpGate(originPlanet, targetCoordinates, context.snapshot.planets);
      return {
        missionType: FleetMissionType.ARMAMENT_DELIVERY,
        targetKind,
        originPlanet,
        targetCoordinates: { ...targetCoordinates },
        ships,
        carriedBombs,
        cargo: emptyResources(),
        travelDistance: distance,
        travelTurns: useJumpGate ? 1 : resolveTravelTurns(originPlanet, distance),
        score: Math.max(
          1,
          360
          + (targetKind === 'ALLIED' ? 28 : 20)
          + (alliedFaction ? alliedFaction.faction.pendingIncomingSupportRequests.length * 12 : 0)
        ),
        useJumpGate
      } satisfies ArmamentDeliveryMissionRequest;
    })
    .filter((entry): entry is ArmamentDeliveryMissionRequest => entry !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
    );

  return candidates[0] ?? null;
}

function createDiplomaticBuildingRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  warState: DiplomaticWarState
): DiplomaticBuildingRequest[] {
  const warCount = factions.filter((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR).length;
  const hasAllies = factions.some((faction) => faction.faction.currentStatus === DiplomaticStatus.ALLIED);
  const requests: DiplomaticBuildingRequest[] = [];

  for (const planet of context.snapshot.planets) {
    if (isStrategicHubPlanet(planet) && (warCount > 0 || warState !== 'WINNING') && planet.economy.bombDepotLevel <= 0) {
      requests.push({
        originPlanet: planet,
        buildingType: BuildingType.BOMB_DEPOT,
        nextLevel: planet.economy.bombDepotLevel + 1,
        score: 410 + (warCount * 30),
        reason: 'Need local bomb storage for diplomatic bombardment readiness.'
      });
    }
    if (isStrategicHubPlanet(planet) && warCount > 0 && planet.economy.jumpGateLevel <= 0) {
      requests.push({
        originPlanet: planet,
        buildingType: BuildingType.JUMP_GATE,
        nextLevel: planet.economy.jumpGateLevel + 1,
        score: 380 + (warCount * 24),
        reason: 'Need faster war staging between own strategic hubs.'
      });
    }
    if (hasAllies && planet.economy.allianceDepotLevel <= 0) {
      requests.push({
        originPlanet: planet,
        buildingType: BuildingType.ALLIANCE_DEPOT,
        nextLevel: planet.economy.allianceDepotLevel + 1,
        score: 320 + (warCount * 12),
        reason: 'Need allied maintenance and support readiness for diplomatic war logistics.'
      });
    }
  }

  return selectTopBuildingRequestsPerPlanet(requests);
}

function createBombProductionRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  warState: DiplomaticWarState
): DiplomaticBombProductionRequest[] {
  const activeWarCount = Math.max(0, factions.filter((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR).length);
  const hasAllies = factions.some((faction) => faction.faction.currentStatus === DiplomaticStatus.ALLIED);
  const requests: DiplomaticBombProductionRequest[] = [];

  for (const planet of context.snapshot.planets) {
    const bombType = resolveBestProducibleBombType(planet);
    if (!bombType) {
      continue;
    }
    const desiredBombs = resolveDesiredBombStockCount(
      planet,
      activeWarCount > 0 ? 'WAR' : hasAllies ? 'ALLIED' : 'PEACE',
      activeWarCount
    );
    const currentBombs = resolvePlanetaryBombCount(planet);
    const blockedDemand = resolveBlockedBombDemand(planet, activeWarCount);
    const desiredTotal = Math.min(
      resolveBombDepotCapacity(planet),
      Math.max(desiredBombs, currentBombs + blockedDemand)
    );
    if (desiredTotal <= currentBombs) {
      continue;
    }

    requests.push({
      originPlanet: planet,
      bombType,
      amount: Math.max(1, desiredTotal - currentBombs),
      score: 340 + (desiredTotal - currentBombs) * 20 + (activeWarCount * 15),
      reason: 'Need bomb stock for diplomatic bombardment and siege readiness.'
    });
  }

  return selectTopBombProductionRequestsPerPlanet(requests);
}

function selectBombardmentShipsForStrength(
  originPlanet: BotPlanetSnapshot,
  requiredStrength: number,
  distance: number
): BombardmentShipSelection {
  const combatCandidates = Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => {
      const shipType = type as ShipType;
      return {
        type: shipType,
        amount: Math.max(0, amount ?? 0),
        combatPower: estimateShipCombatPower(shipType),
        bombardmentPower: estimateShipBombardmentPower(shipType),
        blueprint: SHIP_BLUEPRINTS.get(shipType) ?? null
      };
    })
    .filter((entry) =>
      entry.amount > 0
      && entry.combatPower > 0
      && entry.type !== ShipType.SPY_PROBE
      && entry.type !== ShipType.REPAIR_DRONE
      && entry.type !== ShipType.COLONIZER
    )
    .sort((left, right) =>
      right.bombardmentPower - left.bombardmentPower
      || right.combatPower - left.combatPower
      || (right.blueprint?.hangarCapacity ?? 0) - (left.blueprint?.hangarCapacity ?? 0)
      || left.type.localeCompare(right.type)
    );
  if (combatCandidates.length <= 0) {
    return { ships: [], combatStrength: 0, hasBombardmentShip: false };
  }

  const selection: BombardmentShipSelection['ships'] = [];
  let totalStrength = 0;
  let hasBombardmentShip = false;
  for (const candidate of combatCandidates) {
    for (let used = 0; used < candidate.amount; used += 1) {
      const nextSelection = selection.map((ship) => ({ ...ship }));
      const current = nextSelection.find((ship) => ship.type === candidate.type);
      if (current) {
        current.undamagedAmount += 1;
      } else {
        nextSelection.push({
          type: candidate.type,
          undamagedAmount: 1,
          damagedAmount: 0
        });
      }
      if (!hasEnoughDeuteriumForShips(originPlanet, nextSelection, distance)) {
        break;
      }
      selection.splice(0, selection.length, ...nextSelection);
      totalStrength += candidate.combatPower;
      hasBombardmentShip = hasBombardmentShip || candidate.bombardmentPower > 0;
      if (totalStrength >= requiredStrength) {
        return {
          ships: selection,
          combatStrength: totalStrength,
          hasBombardmentShip
        };
      }
    }
  }

  return {
    ships: selection,
    combatStrength: totalStrength,
    hasBombardmentShip
  };
}

function selectCarryableBombPayload(
  originPlanet: BotPlanetSnapshot,
  selectedShips: CombatShipSelection['ships']
): Array<{ type: DefenceType; amount: number }> {
  const remainingCapacity = resolveSelectionHangarCapacity(selectedShips);
  if (remainingCapacity <= 0) {
    return [];
  }

  let freeCapacity = remainingCapacity;
  const payload: Array<{ type: DefenceType; amount: number }> = [];
  const bombTypes = Object.entries(originPlanet.defense.installedCountByType)
    .map(([type, amount]) => {
      const bombType = type as DefenceType;
      const blueprint = DEFENCE_BLUEPRINTS.get(bombType);
      return {
        type: bombType,
        amount: Math.max(0, amount ?? 0),
        size: Math.max(1, blueprint?.size ?? 1),
        bombPower: estimateDefenceBombardmentPower(bombType)
      };
    })
    .filter((entry) => entry.amount > 0 && isPlanetaryBombDefenceType(entry.type))
    .sort((left, right) =>
      right.bombPower - left.bombPower
      || right.size - left.size
      || left.type.localeCompare(right.type)
    );

  for (const bomb of bombTypes) {
    if (freeCapacity < bomb.size) {
      continue;
    }
    const amount = Math.min(bomb.amount, Math.floor(freeCapacity / bomb.size));
    if (amount <= 0) {
      continue;
    }
    payload.push({
      type: bomb.type,
      amount
    });
    freeCapacity -= amount * bomb.size;
    if (freeCapacity <= 0) {
      break;
    }
  }

  return payload;
}

function canUseOwnJumpGate(
  originPlanet: BotPlanetSnapshot,
  targetCoordinates: { x: number; y: number; z: number },
  ownedPlanets: BotPlanetSnapshot[]
): boolean {
  if (originPlanet.economy.jumpGateLevel <= 0) {
    return false;
  }

  const destinationPlanet = ownedPlanets.find((planet) =>
    toCoordinatesKey(planet.coordinates) === toCoordinatesKey(targetCoordinates)
  );
  if (!destinationPlanet || destinationPlanet.economy.jumpGateLevel <= 0) {
    return false;
  }

  return toCoordinatesKey(destinationPlanet.coordinates) !== toCoordinatesKey(originPlanet.coordinates);
}

function resolveBestArmamentCarrier(
  originPlanet: BotPlanetSnapshot
): { type: ShipType; hangarCapacity: number } | null {
  const candidates = Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => {
      const shipType = type as ShipType;
      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return {
        type: shipType,
        amount: Math.max(0, amount ?? 0),
        hangarCapacity: blueprint?.hangarCapacity ?? 0,
        cargoCapacity: blueprint?.cargoCapacity ?? 0
      };
    })
    .filter((entry) => entry.amount > 0 && entry.hangarCapacity > 0)
    .sort((left, right) =>
      right.hangarCapacity - left.hangarCapacity
      || right.cargoCapacity - left.cargoCapacity
      || left.type.localeCompare(right.type)
    );

  const best = candidates[0] ?? null;
  return best
    ? {
      type: best.type,
      hangarCapacity: best.hangarCapacity
    }
    : null;
}

function resolveArmamentDeliverySupportShips(
  originPlanet: BotPlanetSnapshot,
  hangarCapacity: number
): CombatShipSelection['ships'] {
  if (hangarCapacity <= 0) {
    return [];
  }

  let remainingCapacity = hangarCapacity;
  const ships: CombatShipSelection['ships'] = [];
  const candidates = Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => {
      const shipType = type as ShipType;
      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return {
        type: shipType,
        amount: Math.max(0, amount ?? 0),
        size: Math.max(1, blueprint?.size ?? 1),
        supportPower: estimateShipCombatPower(shipType),
        isRepairDrone: shipType === ShipType.REPAIR_DRONE
      };
    })
    .filter((entry) => entry.amount > 0 && isArmamentDeliveryShipType(entry.type))
    .sort((left, right) =>
      Number(left.isRepairDrone) - Number(right.isRepairDrone)
      || right.supportPower - left.supportPower
      || left.size - right.size
    );

  for (const candidate of candidates) {
    if (remainingCapacity < candidate.size) {
      continue;
    }
    const amount = Math.min(candidate.amount, Math.floor(remainingCapacity / candidate.size));
    if (amount <= 0) {
      continue;
    }
    ships.push({
      type: candidate.type,
      undamagedAmount: amount,
      damagedAmount: 0
    });
    remainingCapacity -= amount * candidate.size;
    if (remainingCapacity <= 0) {
      break;
    }
  }

  return ships;
}

function isStrategicHubPlanet(planet: BotPlanetSnapshot): boolean {
  return planet.maturityStage === 'STRATEGIC_HUB'
    || planet.defense.avgIndustryLevel >= 4
    || planet.economy.shipyardLevel >= 8
    || planet.economy.jumpGateLevel > 0
    || planet.economy.bombDepotLevel > 0;
}

function resolveDesiredBombStockCount(
  planet: BotPlanetSnapshot,
  posture: 'WAR' | 'ALLIED' | 'PEACE',
  activeWarCount: number
): number {
  const bombCapacity = resolveBombDepotCapacity(planet);
  if (bombCapacity <= 0) {
    return 0;
  }

  const ratio = posture === 'WAR'
    ? STRATEGIC_HUB_BOMB_STOCK_RATIO_AT_WAR
    : posture === 'ALLIED'
      ? STRATEGIC_HUB_BOMB_STOCK_RATIO_ALLIED
      : STRATEGIC_HUB_BOMB_STOCK_RATIO_PEACE;
  const percentageTarget = Math.ceil(bombCapacity * ratio);
  const strategicHubReserve = isStrategicHubPlanet(planet)
    ? Math.max(1, activeWarCount)
    : 0;
  return Math.min(bombCapacity, Math.max(percentageTarget, strategicHubReserve));
}

function resolvePlanetaryBombCount(planet: BotPlanetSnapshot): number {
  return Object.entries(planet.defense.installedCountByType)
    .reduce((sum, [type, amount]) =>
      sum + (isPlanetaryBombDefenceType(type as DefenceType) ? Math.max(0, amount ?? 0) : 0), 0);
}

function resolveBlockedBombDemand(planet: BotPlanetSnapshot, activeWarCount: number): number {
  if (activeWarCount <= 0) {
    return 0;
  }
  const queuedBombCount = planet.queues.queuedDefenceTypes
    .filter((defenceType) => isPlanetaryBombDefenceType(defenceType))
    .length;
  const desiredAdditional = isStrategicHubPlanet(planet) ? Math.max(1, activeWarCount * 2) : activeWarCount;
  return Math.max(0, desiredAdditional - queuedBombCount);
}

function resolveBestDiplomaticStagingPlanet(
  context: BotSubsystemContext,
  targetCoordinates: { x: number; y: number; z: number }
): BotPlanetSnapshot | null {
  return context.snapshot.planets
    .slice()
    .sort((left, right) => {
      const leftDistance = calculateTravelDistance(left.coordinates, targetCoordinates);
      const rightDistance = calculateTravelDistance(right.coordinates, targetCoordinates);
      const leftStrength = selectCombatShipsForStrength(left, Number.MAX_SAFE_INTEGER, leftDistance).combatStrength;
      const rightStrength = selectCombatShipsForStrength(right, Number.MAX_SAFE_INTEGER, rightDistance).combatStrength;
      const leftGateReadiness = (left.economy.jumpGateLevel * 24) + (left.economy.allianceDepotLevel * 12);
      const rightGateReadiness = (right.economy.jumpGateLevel * 24) + (right.economy.allianceDepotLevel * 12);
      return (leftDistance * 10) - leftGateReadiness - (leftStrength / 15)
        - ((rightDistance * 10) - rightGateReadiness - (rightStrength / 15))
        || right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
        || left.name.localeCompare(right.name);
    })[0] ?? null;
}

function resolveBestProducibleBombardmentShipType(context: BotSubsystemContext): ShipType | null {
  const candidates = new Map<ShipType, number>();

  for (const planet of context.snapshot.planets) {
    for (const [shipType, blueprint] of SHIP_BLUEPRINTS.shipsMap.entries()) {
      if (!snapshotHasShipBuildingRequirements(planet, blueprint) || !snapshotHasShipTechnologyRequirements(planet, blueprint)) {
        continue;
      }
      const bombardmentPower = estimateShipBombardmentPower(shipType);
      if (bombardmentPower <= 0) {
        continue;
      }
      const previous = candidates.get(shipType) ?? -1;
      if (bombardmentPower > previous) {
        candidates.set(shipType, bombardmentPower);
      }
    }
  }

  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

function resolveBestProducibleBombType(planet: BotPlanetSnapshot): DefenceType | null {
  const candidates = [...DEFENCE_BLUEPRINTS.defencesMap.entries()]
    .filter(([defenceType, blueprint]) =>
      isPlanetaryBombDefenceType(defenceType)
      && snapshotHasDefenceBuildingRequirements(planet, blueprint)
      && snapshotHasDefenceTechnologyRequirements(planet, blueprint)
    )
    .sort((left, right) =>
      estimateDefenceBombardmentPower(right[0]) - estimateDefenceBombardmentPower(left[0])
      || left[0].localeCompare(right[0])
    );

  return candidates[0]?.[0] ?? null;
}

function selectTopBuildingRequestsPerPlanet(
  requests: DiplomaticBuildingRequest[]
): DiplomaticBuildingRequest[] {
  const bestByPlanet = new Map<string, DiplomaticBuildingRequest>();

  for (const request of requests) {
    const key = toCoordinatesKey(request.originPlanet.coordinates);
    const existing = bestByPlanet.get(key);
    if (!existing || request.score > existing.score) {
      bestByPlanet.set(key, request);
    }
  }

  return [...bestByPlanet.values()]
    .sort((left, right) => right.score - left.score || left.originPlanet.name.localeCompare(right.originPlanet.name));
}

function selectTopBombProductionRequestsPerPlanet(
  requests: DiplomaticBombProductionRequest[]
): DiplomaticBombProductionRequest[] {
  const bestByPlanet = new Map<string, DiplomaticBombProductionRequest>();

  for (const request of requests) {
    const key = toCoordinatesKey(request.originPlanet.coordinates);
    const existing = bestByPlanet.get(key);
    if (!existing || request.score > existing.score) {
      bestByPlanet.set(key, request);
    }
  }

  return [...bestByPlanet.values()]
    .sort((left, right) => right.score - left.score || left.originPlanet.name.localeCompare(right.originPlanet.name));
}

function toCoordinatesKey(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function createAttackMissionCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): AttackMissionRequest[] {
  const requests: AttackMissionRequest[] = [];

  for (const faction of factions) {
    if (!isFactionEligibleForDiplomaticAttack(faction)) {
      continue;
    }

    for (const targetPlanet of faction.faction.knownPlanets) {
      if (!hasAttackableIntel(targetPlanet)) {
        continue;
      }

      const attackPlan = createAttackPlanForTarget(context, faction, targetPlanet);
      if (attackPlan) {
        requests.push(attackPlan);
      }
    }
  }

  return requests;
}

function isFactionEligibleForDiplomaticAttack(faction: EvaluatedFaction): boolean {
  return faction.faction.currentStatus === DiplomaticStatus.WAR
    || (faction.faction.currentStatus === DiplomaticStatus.NEUTRAL && faction.hostilityScore >= HOSTILE_NEUTRAL_ATTACK_THRESHOLD)
    || (faction.faction.currentStatus === DiplomaticStatus.NEUTRAL && faction.relativeStrength >= faction.strengthEstimate * (WEAKER_NEUTRAL_ATTACK_RATIO - 1));
}

function hasAttackableIntel(
  planet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): boolean {
  return planet.intelDepth > 0 && (planet.totalShipsAmount > 0 || planet.totalDefencesAmount > 0 || planet.recentBattleReportCount > 0);
}

function createAttackPlanForTarget(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): AttackMissionRequest | null {
  const lowConfidence = faction.confidence < 0.55 || targetPlanet.intelDepth < 8;
  if (lowConfidence) {
    return createScoutAttackPlanForTarget(context, faction, targetPlanet);
  }

  const targetStrength = estimateDiplomaticTargetStrength(targetPlanet);
  const requiredStrengthMultiplier = resolveDiplomaticAttackMultiplier(faction, targetPlanet);
  const requiredStrength = Math.max(1, Math.ceil(targetStrength * requiredStrengthMultiplier));
  const validPlans = context.snapshot.planets
    .map((originPlanet) => {
      const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, distance);
      const selection = selectCombatShipsForStrength(originPlanet, requiredStrength, distance);
      if (selection.ships.length <= 0 || selection.combatStrength < requiredStrength) {
        return null;
      }

      return {
        faction,
        targetPlanet,
        originPlanet,
        ships: selection.ships,
        requiredStrength,
        selectedStrength: selection.combatStrength,
        travelDistance: distance,
        travelTurns,
        score: Math.max(
          1,
          500
          + Math.round((requiredStrength * 1.4) - (travelTurns * 9) + (Math.min(24, faction.relativeStrength)))
        ),
        scoutOnly: false
      } satisfies AttackMissionRequest;
    })
    .filter((entry): entry is AttackMissionRequest => entry !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
      || right.selectedStrength - left.selectedStrength
    );

  return validPlans[0] ?? null;
}

function createScoutAttackPlanForTarget(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): AttackMissionRequest | null {
  for (const shipType of [ShipType.CRUISER, ShipType.BATTLE_SHIP, ShipType.FRIGATE]) {
    const validPlans = context.snapshot.planets
      .map((originPlanet) => {
        const available = originPlanet.ships.undamagedCountByType[shipType] ?? 0;
        if (available <= 0) {
          return null;
        }

        const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
        if (!hasEnoughDeuteriumForShips(originPlanet, [{
          type: shipType,
          undamagedAmount: 1,
          damagedAmount: 0
        }], distance)) {
          return null;
        }

        return {
          kind: 'ATTACK',
          faction,
          targetPlanet,
          originPlanet,
          ships: [{
            type: shipType,
            undamagedAmount: 1,
            damagedAmount: 0
          }],
          requiredStrength: Math.max(1, estimateShipCombatPower(shipType)),
          selectedStrength: Math.max(1, estimateShipCombatPower(shipType)),
          travelDistance: distance,
          travelTurns: resolveTravelTurns(originPlanet, distance),
          score: Math.max(1, 360 + Math.round(faction.statusPriorityWeight * 2.5) - Math.round(distance * 0.8)),
          scoutOnly: true
        } satisfies AttackMissionRequest;
      })
      .filter((entry): entry is AttackMissionRequest => entry !== null)
      .sort((left, right) =>
        right.score - left.score
        || left.travelTurns - right.travelTurns
      );

    if (validPlans[0]) {
      return validPlans[0];
    }
  }

  return null;
}

function resolveDiplomaticAttackMultiplier(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  if (faction.faction.currentStatus === DiplomaticStatus.WAR) {
    return targetPlanet.recentBattleReportCount > 0 ? 1.1 : 1.3;
  }
  if (faction.hostilityScore >= HOSTILE_NEUTRAL_ATTACK_THRESHOLD) {
    return 1.2;
  }
  return 0.8;
}

function createSupportMissionCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): SupportMissionRequest[] {
  const requests: SupportMissionRequest[] = [];

  for (const faction of factions) {
    if (faction.faction.currentStatus !== DiplomaticStatus.ALLIED) {
      continue;
    }

    for (const supportRequest of faction.faction.pendingIncomingSupportRequests) {
      const targetPlanet = faction.faction.knownPlanets.find((planet) =>
        planet.coordinates.x === supportRequest.targetCoordinates.x
        && planet.coordinates.y === supportRequest.targetCoordinates.y
        && planet.coordinates.z === supportRequest.targetCoordinates.z
      );
      if (!targetPlanet) {
        continue;
      }

      const supportPlan = supportRequest.supportType === 'PLANET_REPAIR'
        ? createRepairSupportPlan(context, faction, targetPlanet, 'EXPLICIT_REQUEST')
        : createGuardSupportPlan(context, faction, targetPlanet, 'EXPLICIT_REQUEST');
      if (supportPlan) {
        requests.push(supportPlan);
      }
    }

    for (const targetPlanet of faction.faction.knownPlanets) {
      if (targetPlanet.recentBattleReportCount <= 0) {
        continue;
      }
      const alreadyCovered = requests.some((request) =>
        request.targetPlanet.coordinates.x === targetPlanet.coordinates.x
        && request.targetPlanet.coordinates.y === targetPlanet.coordinates.y
        && request.targetPlanet.coordinates.z === targetPlanet.coordinates.z
      );
      if (alreadyCovered) {
        continue;
      }

      const supportPlan = createGuardSupportPlan(context, faction, targetPlanet, 'RECENT_ATTACK');
      if (supportPlan) {
        requests.push(supportPlan);
      }
    }
  }

  return requests;
}

function createRepairSupportPlan(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  needReason: SupportMissionRequest['needReason']
): SupportMissionRequest | null {
  const candidates = context.snapshot.planets
    .map((originPlanet) => {
      const availableDrones = originPlanet.ships.undamagedCountByType[ShipType.REPAIR_DRONE] ?? 0;
      if (availableDrones <= 0) {
        return null;
      }

      const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
      const amount = Math.min(3, availableDrones);
      const ships = [{
        type: ShipType.REPAIR_DRONE,
        undamagedAmount: Math.max(1, amount),
        damagedAmount: 0
      }];
      if (!hasEnoughDeuteriumForShips(originPlanet, ships, distance)) {
        return null;
      }

      return {
        kind: 'SUPPORT',
        supportMissionType: FleetMissionType.REPAIR,
        faction,
        targetPlanet,
        originPlanet,
        ships,
        requiredStrength: 1,
        selectedStrength: amount,
        travelDistance: distance,
        travelTurns: resolveTravelTurns(originPlanet, distance),
        score: 380 + (targetPlanet.recentBattleReportCount * 18) + (needReason === 'EXPLICIT_REQUEST' ? 36 : 0),
        needReason
      } satisfies SupportMissionRequest;
    })
    .filter((entry): entry is SupportMissionRequest => entry !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
    );

  return candidates[0] ?? null;
}

function createGuardSupportPlan(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  needReason: SupportMissionRequest['needReason']
): SupportMissionRequest | null {
  const requiredStrength = Math.max(1, estimateDiplomaticTargetStrength(targetPlanet));
  const validPlans = context.snapshot.planets
    .map((originPlanet) => {
      const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, distance);
      const selection = selectCombatShipsForStrength(originPlanet, requiredStrength, distance);
      if (selection.ships.length <= 0 || selection.combatStrength < requiredStrength) {
        return null;
      }

      return {
        kind: 'SUPPORT',
        supportMissionType: FleetMissionType.DEFEND,
        faction,
        targetPlanet,
        originPlanet,
        ships: selection.ships,
        requiredStrength,
        selectedStrength: selection.combatStrength,
        travelDistance: distance,
        travelTurns,
        score: 420 + (targetPlanet.recentBattleReportCount * 22) + (needReason === 'EXPLICIT_REQUEST' ? 28 : 0),
        needReason
      } satisfies SupportMissionRequest;
    })
    .filter((entry): entry is SupportMissionRequest => entry !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
    );

  return validPlans[0] ?? null;
}

function createBlockedAttackShipNeeds(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  acceptedRequests: AttackMissionRequest[]
): WarShipNeedRequest[] {
  const acceptedTargets = new Set(acceptedRequests.map((request) =>
    `${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`
  ));
  const requests: WarShipNeedRequest[] = [];

  for (const faction of factions) {
    if (!isFactionEligibleForDiplomaticAttack(faction)) {
      continue;
    }

    for (const targetPlanet of faction.faction.knownPlanets) {
      const targetKey = `${targetPlanet.coordinates.x}:${targetPlanet.coordinates.y}:${targetPlanet.coordinates.z}`;
      if (acceptedTargets.has(targetKey) || !hasAttackableIntel(targetPlanet)) {
        continue;
      }

      const blockedNeed = createBlockedAttackShipNeed(context, faction, targetPlanet);
      if (blockedNeed) {
        requests.push(blockedNeed);
      }
    }

    for (const targetPlanet of faction.faction.knownPlanets) {
      if (targetPlanet.recentBattleReportCount <= 0) {
        continue;
      }
      const key = `${FleetMissionType.DEFEND}:${targetPlanet.coordinates.x}:${targetPlanet.coordinates.y}:${targetPlanet.coordinates.z}`;
      if (acceptedTargets.has(key)) {
        continue;
      }

      const blockedNeed = createBlockedGuardShipNeed(context, targetPlanet);
      if (blockedNeed) {
        requests.push(blockedNeed);
      }
    }
  }

  return requests;
}

function createBlockedAttackShipNeed(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): WarShipNeedRequest | null {
  const preferredOrigin = resolveBestMilitaryOrigin(context, targetPlanet.coordinates);
  if (!preferredOrigin) {
    return null;
  }

  const scoutType = resolvePreferredScoutShipType(preferredOrigin);
  if ((faction.confidence < 0.55 || targetPlanet.intelDepth < 8) && !scoutType) {
    const combatType = resolveBestProducibleCombatShipType(context);
    if (!combatType) {
      return null;
    }
    return {
      originPlanet: preferredOrigin,
      shipType: combatType,
      amount: 1,
      score: 340 + faction.statusPriorityWeight,
      reason: 'Need one medium war ship for battle-scout pressure against a real-player target.',
      targetCoordinates: { ...targetPlanet.coordinates },
      needKind: 'ATTACK'
    };
  }

  const targetStrength = estimateDiplomaticTargetStrength(targetPlanet);
  const requiredStrength = Math.max(1, Math.ceil(targetStrength * resolveDiplomaticAttackMultiplier(faction, targetPlanet)));
  const bestAvailableStrength = estimateBestAvailableCombatStrength(context, targetPlanet.coordinates);
  const combatType = resolveBestProducibleCombatShipType(context);
  if (!combatType) {
    return null;
  }

  return {
    originPlanet: preferredOrigin,
    shipType: combatType,
    amount: Math.max(1, Math.ceil(Math.max(0, requiredStrength - bestAvailableStrength) / Math.max(1, estimateShipCombatPower(combatType)))),
    score: 430 + requiredStrength,
    reason: 'Need more combat ships for diplomatic attack pressure.',
    targetCoordinates: { ...targetPlanet.coordinates },
    needKind: 'ATTACK'
  };
}

function createBlockedSupportShipNeeds(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  acceptedRequests: SupportMissionRequest[]
): WarShipNeedRequest[] {
  const acceptedTargets = new Set(acceptedRequests.map((request) =>
    `${request.supportMissionType}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`
  ));
  const requests: WarShipNeedRequest[] = [];

  for (const faction of factions) {
    if (faction.faction.currentStatus !== DiplomaticStatus.ALLIED) {
      continue;
    }

    for (const supportRequest of faction.faction.pendingIncomingSupportRequests) {
      const targetPlanet = faction.faction.knownPlanets.find((planet) =>
        planet.coordinates.x === supportRequest.targetCoordinates.x
        && planet.coordinates.y === supportRequest.targetCoordinates.y
        && planet.coordinates.z === supportRequest.targetCoordinates.z
      );
      if (!targetPlanet) {
        continue;
      }

      const supportMissionType = supportRequest.supportType === 'PLANET_REPAIR'
        ? FleetMissionType.REPAIR
        : FleetMissionType.DEFEND;
      const key = `${supportMissionType}:${targetPlanet.coordinates.x}:${targetPlanet.coordinates.y}:${targetPlanet.coordinates.z}`;
      if (acceptedTargets.has(key)) {
        continue;
      }

      const blockedNeed = supportRequest.supportType === 'PLANET_REPAIR'
        ? createBlockedRepairShipNeed(context, targetPlanet)
        : createBlockedGuardShipNeed(context, targetPlanet);
      if (blockedNeed) {
        requests.push(blockedNeed);
      }
    }
  }

  return requests;
}

function createBlockedRepairShipNeed(
  context: BotSubsystemContext,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): WarShipNeedRequest | null {
  const originPlanet = resolveFallbackOrigin(context);
  if (!originPlanet) {
    return null;
  }

  return {
    originPlanet,
    shipType: ShipType.REPAIR_DRONE,
    amount: 1,
    score: 360 + (targetPlanet.recentBattleReportCount * 18),
    reason: 'Need a repair drone to support an allied planet under pressure.',
    targetCoordinates: { ...targetPlanet.coordinates },
    needKind: 'REPAIR'
  };
}

function createBlockedGuardShipNeed(
  context: BotSubsystemContext,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): WarShipNeedRequest | null {
  const originPlanet = resolveBestMilitaryOrigin(context, targetPlanet.coordinates) ?? resolveFallbackOrigin(context);
  const combatType = resolveBestProducibleCombatShipType(context);
  if (!originPlanet || !combatType) {
    return null;
  }

  const requiredStrength = Math.max(1, estimateDiplomaticTargetStrength(targetPlanet));
  return {
    originPlanet,
    shipType: combatType,
    amount: Math.max(1, Math.ceil(requiredStrength / Math.max(1, estimateShipCombatPower(combatType)))),
    score: 390 + requiredStrength,
    reason: 'Need more combat ships to guard an allied planet.',
    targetCoordinates: { ...targetPlanet.coordinates },
    needKind: 'GUARD'
  };
}

function selectTopWarShipNeedsPerPlanet(requests: WarShipNeedRequest[]): WarShipNeedRequest[] {
  const bestByPlanet = new Map<string, WarShipNeedRequest>();

  for (const request of requests) {
    const key = `${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}`;
    const existing = bestByPlanet.get(key);
    if (!existing || request.score > existing.score) {
      bestByPlanet.set(key, request);
    }
  }

  return [...bestByPlanet.values()]
    .sort((left, right) => right.score - left.score || left.originPlanet.name.localeCompare(right.originPlanet.name));
}

function createSpyMissionRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  availableFleetSlots: number
): {
  requests: SpyMissionRequest[];
  blockedDueToProbeShortage: BlockedSpyNeed[];
  targetedFactionIds: Set<number>;
  globalProbeDeficit: number;
} {
  const candidates = factions
    .filter((faction) => faction.intelInsufficient)
    .map((faction) => createSpyMissionRequestForFaction(context, faction))
    .filter((entry): entry is SpyMissionRequest | BlockedSpyNeed => entry !== null)
    .sort(compareSpyCandidates);
  const cappedCandidates = candidates.slice(0, Math.max(0, availableFleetSlots));
  const requests: SpyMissionRequest[] = [];
  const blockedDueToProbeShortage: BlockedSpyNeed[] = [];
  let totalPlannedProbeDemand = 0;
  const globalProbeNeedCap = resolveGlobalDiplomaticProbeNeedCap(context);

  for (const candidate of cappedCandidates) {
    totalPlannedProbeDemand += candidate.probeAmount;
    if ('originPlanet' in candidate) {
      requests.push(candidate);
    } else {
      blockedDueToProbeShortage.push(candidate);
    }
  }

  const availableTotalProbes = context.snapshot.planets.reduce((sum, planet) =>
    sum + (planet.ships.undamagedCountByType[ShipType.SPY_PROBE] ?? 0), 0);
  const globalProbeDeficit = Math.max(
    0,
    Math.min(globalProbeNeedCap, totalPlannedProbeDemand) - availableTotalProbes
  );

  return {
    requests,
    blockedDueToProbeShortage,
    targetedFactionIds: new Set(cappedCandidates.map((candidate) => candidate.faction.faction.playerId)),
    globalProbeDeficit
  };
}

function createSpyMissionRequestForFaction(
  context: BotSubsystemContext,
  faction: EvaluatedFaction
): SpyMissionRequest | BlockedSpyNeed | null {
  const bestTarget = faction.faction.knownPlanets
    .map((planet) => {
      const desiredReportLevel = resolveDesiredReportLevel(faction.faction.currentStatus);
      const estimatedDifficulty = resolveEstimatedProbeDifficulty(context, faction, planet, desiredReportLevel);
      const probeAmount = Math.min(
        resolveAffordableProbeCap(context),
        resolveProbeAmountForDifficulty(estimatedDifficulty, faction.faction.currentStatus)
      );
      const localNeed = resolvePlanetIntelNeedScore(faction, planet);
      const score = Math.round(
        (faction.statusPriorityWeight * 10)
        + (localNeed * 4)
        + (faction.enemyEspionageSuperiority ? 18 : 0)
        - (probeAmount * 2.2)
      );
      return {
        planet,
        desiredReportLevel,
        estimatedDifficulty,
        probeAmount: Math.max(1, probeAmount),
        score
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || left.probeAmount - right.probeAmount
      || left.planet.lastRelevantReportAge - right.planet.lastRelevantReportAge
      || left.planet.coordinates.x - right.planet.coordinates.x
      || left.planet.coordinates.y - right.planet.coordinates.y
      || left.planet.coordinates.z - right.planet.coordinates.z
    )[0] ?? null;
  if (!bestTarget) {
    return null;
  }

  const selectedOrigin = selectSpyOrigin(context, bestTarget.planet.coordinates, bestTarget.probeAmount);
  if (!selectedOrigin && bestTarget.probeAmount <= 0) {
    return null;
  }

  return selectedOrigin
    ? {
      faction,
      originPlanet: selectedOrigin.originPlanet,
      targetCoordinates: { ...bestTarget.planet.coordinates },
      probeAmount: bestTarget.probeAmount,
      targetIntelDepth: bestTarget.planet.intelDepth,
      targetReportAge: bestTarget.planet.lastRelevantReportAge,
      estimatedDifficulty: bestTarget.estimatedDifficulty,
      travelDistance: selectedOrigin.travelDistance,
      travelTurns: selectedOrigin.travelTurns,
      score: bestTarget.score
    }
    : {
      faction,
      targetCoordinates: { ...bestTarget.planet.coordinates },
      probeAmount: bestTarget.probeAmount,
      score: bestTarget.score
    };
}

function createProbeShipNeedRequests(
  context: BotSubsystemContext,
  globalProbeDeficit: number,
  blockedDueToProbeShortage: BlockedSpyNeed[]
): ProbeShipNeedRequest[] {
  const highestBlockedProbeAmount = blockedDueToProbeShortage.reduce((best, request) =>
    Math.max(best, request.probeAmount), 0);
  const requiredDeficit = Math.max(globalProbeDeficit, highestBlockedProbeAmount);
  if (requiredDeficit <= 0) {
    return [];
  }

  const candidatePlanets = context.snapshot.planets
    .slice()
    .sort((left, right) =>
      right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
      || right.power.shipyardPower - left.power.shipyardPower
      || (right.ships.undamagedCountByType[ShipType.SPY_PROBE] ?? 0) - (left.ships.undamagedCountByType[ShipType.SPY_PROBE] ?? 0)
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.y - right.coordinates.y
      || left.coordinates.z - right.coordinates.z
    )
    .slice(0, MAX_PROBE_SHIP_NEED_REQUESTS);
  if (candidatePlanets.length <= 0) {
    return [];
  }

  let remaining = requiredDeficit;
  return candidatePlanets.map((planet, index) => {
    const remainingSlots = candidatePlanets.length - index;
    const amount = Math.max(1, Math.ceil(remaining / Math.max(1, remainingSlots)));
    remaining = Math.max(0, remaining - amount);
    return {
      originPlanet: planet,
      amount,
      score: (planet.defense.avgIndustryLevel * 12) + planet.power.shipyardPower,
      reason: 'Global diplomatic probe deficit for real-player espionage.'
    };
  });
}

function createSpyMissionProposal(
  context: BotSubsystemContext,
  request: SpyMissionRequest,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:spy:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:spy:${request.faction.faction.playerId}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`,
    dedupeKey: `strategic-diplomatic:spy:${request.faction.faction.playerId}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`,
    summary: `Spy request #${index + 1}: scan ${request.faction.faction.playerName} at ${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z} from ${request.originPlanet.name} with ${request.probeAmount} probes.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetCoordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.faction.faction.currentStatus === DiplomaticStatus.WAR ? 82 : request.faction.faction.currentStatus === DiplomaticStatus.NEUTRAL ? 68 : 55,
    risk: 7,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: emptyResources(),
    requestPayload: {
      missionType: FleetMissionType.SPY,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.targetCoordinates },
      ships: [{
        type: ShipType.SPY_PROBE,
        undamagedAmount: request.probeAmount,
        damagedAmount: 0
      }],
      carriedBombs: [],
      cargo: emptyResources(),
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      missionSection: 'GLOBAL',
      missionType: FleetMissionType.SPY,
      targetPlayerId: request.faction.faction.playerId,
      targetStatus: request.faction.faction.currentStatus,
      probeAmount: request.probeAmount,
      targetIntelDepth: request.targetIntelDepth,
      targetReportAge: request.targetReportAge,
      estimatedDifficulty: request.estimatedDifficulty,
      enemyEspionageSuperiority: request.faction.enemyEspionageSuperiority
    }
  };
}

function createProbeShipNeedProposal(
  context: BotSubsystemContext,
  request: ProbeShipNeedRequest,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:probe-need:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'SHIPYARD',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:probe-need:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}`,
    dedupeKey: `strategic-diplomatic:probe-need:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}`,
    summary: `Probe need #${index + 1}: produce ${request.amount} ${ShipType.SPY_PROBE} on ${request.originPlanet.name} for diplomatic espionage coverage.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.originPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: 63,
    risk: 4,
    confidence: 66,
    requestedResources: emptyResources(),
    requestPayload: {
      demandOnly: true,
      shipType: ShipType.SPY_PROBE,
      amount: request.amount,
      reason: 'DIPLOMATIC_SPY'
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 2,
    debug: {
      queueType: 'SHIP_NEED',
      shipType: ShipType.SPY_PROBE,
      amount: request.amount,
      reason: request.reason
    }
  };
}

function createAttackMissionProposal(
  context: BotSubsystemContext,
  request: AttackMissionRequest,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:attack:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:attack:${request.faction.faction.playerId}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`,
    dedupeKey: `strategic-diplomatic:attack:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`,
    summary: request.scoutOnly
      ? `Attack scout #${index + 1}: send one medium ship from ${request.originPlanet.name} to ${request.faction.faction.playerName} at ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}.`
      : `Attack request #${index + 1}: strike ${request.faction.faction.playerName} at ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z} from ${request.originPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.faction.faction.currentStatus === DiplomaticStatus.WAR ? 84 : 72,
    risk: request.scoutOnly ? 14 : 28,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: emptyResources(),
    requestPayload: {
      missionType: FleetMissionType.ATTACK,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.targetPlanet.coordinates },
      ships: request.ships.map((ship) => ({ ...ship })),
      carriedBombs: [],
      cargo: emptyResources(),
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      missionSection: 'GLOBAL',
      missionType: FleetMissionType.ATTACK,
      attackKind: request.scoutOnly ? 'SCOUT' : 'FULL',
      targetPlayerId: request.faction.faction.playerId,
      targetStatus: request.faction.faction.currentStatus,
      requiredStrength: request.requiredStrength,
      selectedStrength: Math.round(request.selectedStrength),
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns
    }
  };
}

function createSupportMissionProposal(
  context: BotSubsystemContext,
  request: SupportMissionRequest,
  index: number
): BotProposal {
  const supportLabel = request.supportMissionType === FleetMissionType.REPAIR ? 'repair' : 'guard';
  return {
    proposalId: `strategic-diplomatic:support:${request.supportMissionType}:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:support:${request.supportMissionType}:${request.faction.faction.playerId}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`,
    dedupeKey: `strategic-diplomatic:support:${request.supportMissionType}:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`,
    summary: `Support ${supportLabel} #${index + 1}: send aid from ${request.originPlanet.name} to allied planet ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.supportMissionType === FleetMissionType.REPAIR ? 76 : 74,
    risk: request.supportMissionType === FleetMissionType.REPAIR ? 10 : 18,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: emptyResources(),
    requestPayload: {
      missionType: request.supportMissionType,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.targetPlanet.coordinates },
      ships: request.ships.map((ship) => ({ ...ship })),
      carriedBombs: [],
      cargo: emptyResources(),
      useJumpGate: false,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      missionSection: 'GLOBAL',
      missionType: request.supportMissionType,
      targetPlayerId: request.faction.faction.playerId,
      supportReason: request.needReason,
      requiredStrength: request.requiredStrength,
      selectedStrength: Math.round(request.selectedStrength),
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns
    }
  };
}

function createWarShipNeedProposal(
  context: BotSubsystemContext,
  request: WarShipNeedRequest,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:war-need:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.shipType}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'SHIPYARD',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:war-need:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}`,
    dedupeKey: `strategic-diplomatic:war-need:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}`,
    summary: `War ship need #${index + 1}: produce ${request.amount} ${request.shipType} on ${request.originPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.originPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: 71,
    risk: 9,
    confidence: 68,
    requestedResources: emptyResources(),
    requestPayload: {
      demandOnly: true,
      shipType: request.shipType,
      amount: request.amount,
      reason: request.needKind
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 2,
    debug: {
      queueType: 'SHIP_NEED',
      shipType: request.shipType,
      amount: request.amount,
      needKind: request.needKind,
      reason: request.reason,
      targetCoordinates: `${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`
    }
  };
}

function createBombardmentMissionProposal(
  context: BotSubsystemContext,
  request: BombardmentMissionRequest,
  index: number
): BotProposal {
  const summary = request.missionType === FleetMissionType.SIEGE
    ? `Siege request #${index + 1}: establish siege pressure on ${request.faction.faction.playerName} at ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z} from ${request.originPlanet.name}.`
    : `Bombard request #${index + 1}: strike ${request.faction.faction.playerName} at ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z} from ${request.originPlanet.name}.`;
  return {
    proposalId: `strategic-diplomatic:${request.missionType.toLowerCase()}:${request.faction.faction.playerId}:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.targetPlanet.coordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:${request.missionType.toLowerCase()}:${request.faction.faction.playerId}:${toCoordinatesKey(request.targetPlanet.coordinates)}`,
    dedupeKey: `strategic-diplomatic:${request.missionType.toLowerCase()}:${request.faction.faction.playerId}:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.targetPlanet.coordinates)}`,
    summary,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.missionType === FleetMissionType.SIEGE ? 88 : 82,
    risk: request.missionType === FleetMissionType.SIEGE ? 42 : 28,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: emptyResources(),
    requestPayload: {
      missionType: request.missionType,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.targetPlanet.coordinates },
      ships: request.ships.map((ship) => ({ ...ship })),
      carriedBombs: request.carriedBombs.map((bomb) => ({ ...bomb })),
      cargo: emptyResources(),
      useJumpGate: request.travelTurns === 1 && request.travelDistance > 0 && request.originPlanet.economy.jumpGateLevel > 0,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      missionSection: 'GLOBAL',
      missionType: request.missionType,
      targetPlayerId: request.faction.faction.playerId,
      targetStatus: request.faction.faction.currentStatus,
      requiredStrength: request.requiredStrength,
      selectedStrength: Math.round(request.selectedStrength),
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns,
      siegeRisk: request.siegeRisk,
      carriedBombCount: request.carriedBombs.reduce((sum, bomb) => sum + bomb.amount, 0)
    }
  };
}

function createRelocationMissionProposal(
  context: BotSubsystemContext,
  request: RelocationMissionRequest,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:move:${request.faction.faction.playerId}:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.stagingPlanet.coordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:move:${request.faction.faction.playerId}:${toCoordinatesKey(request.stagingPlanet.coordinates)}`,
    dedupeKey: `strategic-diplomatic:move:${request.moveRole}:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.stagingPlanet.coordinates)}`,
    summary: `Move request #${index + 1}: regroup bombardment fleet from ${request.originPlanet.name} to ${request.stagingPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.stagingPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: 74,
    risk: 16,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: emptyResources(),
    requestPayload: {
      missionType: FleetMissionType.MOVE,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.stagingPlanet.coordinates },
      ships: request.ships.map((ship) => ({ ...ship })),
      carriedBombs: [],
      cargo: emptyResources(),
      useJumpGate: request.useJumpGate,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      missionSection: 'GLOBAL',
      missionType: FleetMissionType.MOVE,
      moveRole: request.moveRole,
      targetPlayerId: request.faction.faction.playerId,
      stagingPlanet: request.stagingPlanet.name,
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns
    }
  };
}

function createArmamentDeliveryMissionProposal(
  context: BotSubsystemContext,
  request: ArmamentDeliveryMissionRequest,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:armament-delivery:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.targetCoordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:armament-delivery:${request.targetKind}:${toCoordinatesKey(request.targetCoordinates)}`,
    dedupeKey: `strategic-diplomatic:armament-delivery:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.targetCoordinates)}`,
    summary: `Armament delivery #${index + 1}: send bombs and support ships from ${request.originPlanet.name} to ${request.targetKind === 'ALLIED' ? 'allied' : 'own'} target ${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetCoordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.targetKind === 'ALLIED' ? 72 : 64,
    risk: 14,
    confidence: 70,
    requestedResources: { ...request.cargo },
    requestPayload: {
      missionType: FleetMissionType.ARMAMENT_DELIVERY,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.targetCoordinates },
      ships: request.ships.map((ship) => ({ ...ship })),
      carriedBombs: request.carriedBombs.map((bomb) => ({ ...bomb })),
      cargo: { ...request.cargo },
      useJumpGate: request.useJumpGate,
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      missionSection: 'GLOBAL',
      missionType: FleetMissionType.ARMAMENT_DELIVERY,
      targetKind: request.targetKind,
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns,
      carriedBombCount: request.carriedBombs.reduce((sum, bomb) => sum + bomb.amount, 0),
      deliveredSupportShipCount: request.ships.reduce((sum, ship) => sum + ship.undamagedAmount + ship.damagedAmount, 0)
    }
  };
}

function createDiplomaticBuildingProposal(
  context: BotSubsystemContext,
  request: DiplomaticBuildingRequest,
  index: number
): BotProposal {
  const blueprint = BUILDING_BLUEPRINTS.get(request.buildingType);
  const cost = blueprint?.getCostForLevel(request.nextLevel);
  return {
    proposalId: `strategic-diplomatic:building:${request.buildingType}:${toCoordinatesKey(request.originPlanet.coordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'BUILDING',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:building:${request.buildingType}:${toCoordinatesKey(request.originPlanet.coordinates)}`,
    dedupeKey: `strategic-diplomatic:building:${request.buildingType}:${toCoordinatesKey(request.originPlanet.coordinates)}`,
    summary: `Diplomatic building request #${index + 1}: queue ${request.buildingType} on ${request.originPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.originPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.buildingType === BuildingType.BOMB_DEPOT ? 70 : 62,
    risk: 6,
    confidence: 68,
    requestedResources: {
      metal: cost?.metal ?? 0,
      crystal: cost?.crystal ?? 0,
      deuterium: cost?.deuterium ?? 0
    },
    requestPayload: {
      x: request.originPlanet.coordinates.x,
      y: request.originPlanet.coordinates.y,
      z: request.originPlanet.coordinates.z,
      buildingType: request.buildingType
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      queueType: 'BUILDING',
      buildingType: request.buildingType,
      nextLevel: request.nextLevel,
      reason: request.reason
    }
  };
}

function createDiplomaticBombProductionProposal(
  context: BotSubsystemContext,
  request: DiplomaticBombProductionRequest,
  index: number
): BotProposal {
  const blueprint = DEFENCE_BLUEPRINTS.get(request.bombType);
  return {
    proposalId: `strategic-diplomatic:bomb-production:${request.bombType}:${toCoordinatesKey(request.originPlanet.coordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'SHIPYARD',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:bomb-production:${request.bombType}:${toCoordinatesKey(request.originPlanet.coordinates)}`,
    dedupeKey: `strategic-diplomatic:bomb-production:${request.bombType}:${toCoordinatesKey(request.originPlanet.coordinates)}`,
    summary: `Bomb production request #${index + 1}: produce ${request.amount} ${request.bombType} on ${request.originPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.originPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: 69,
    risk: 8,
    confidence: 68,
    requestedResources: {
      metal: (blueprint?.cost.metal ?? 0) * request.amount,
      crystal: (blueprint?.cost.crystal ?? 0) * request.amount,
      deuterium: (blueprint?.cost.deuterium ?? 0) * request.amount
    },
    requestPayload: {
      x: request.originPlanet.coordinates.x,
      y: request.originPlanet.coordinates.y,
      z: request.originPlanet.coordinates.z,
      itemKind: 'defence',
      defenceType: request.bombType,
      amount: request.amount
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      queueType: 'BOMB_PRODUCTION',
      itemKind: 'defence',
      defenceType: request.bombType,
      amount: request.amount,
      reason: request.reason
    }
  };
}

function estimateDiplomaticTargetStrength(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  return Math.max(
    1,
    Math.round((targetPlanet.totalShipsAmount * 1.4) + (targetPlanet.totalDefencesAmount * 1.0))
  );
}

function estimateBestAvailableCombatStrength(
  context: BotSubsystemContext,
  targetCoordinates: { x: number; y: number; z: number }
): number {
  return context.snapshot.planets.reduce((best, originPlanet) => {
    const distance = calculateTravelDistance(originPlanet.coordinates, targetCoordinates);
    const selection = selectCombatShipsForStrength(originPlanet, Number.MAX_SAFE_INTEGER, distance);
    return Math.max(best, selection.combatStrength);
  }, 0);
}

function resolveBestMilitaryOrigin(
  context: BotSubsystemContext,
  targetCoordinates: { x: number; y: number; z: number }
): BotPlanetSnapshot | null {
  return context.snapshot.planets
    .slice()
    .sort((left, right) => {
      const leftDistance = calculateTravelDistance(left.coordinates, targetCoordinates);
      const rightDistance = calculateTravelDistance(right.coordinates, targetCoordinates);
      const leftStrength = selectCombatShipsForStrength(left, Number.MAX_SAFE_INTEGER, leftDistance).combatStrength;
      const rightStrength = selectCombatShipsForStrength(right, Number.MAX_SAFE_INTEGER, rightDistance).combatStrength;
      return leftDistance - rightDistance
        || rightStrength - leftStrength
        || right.defense.avgIndustryLevel - left.defense.avgIndustryLevel;
    })[0] ?? null;
}

function resolvePreferredScoutShipType(planet: BotPlanetSnapshot): ShipType | null {
  for (const shipType of [ShipType.CRUISER, ShipType.BATTLE_SHIP, ShipType.FRIGATE]) {
    if ((planet.ships.undamagedCountByType[shipType] ?? 0) > 0) {
      return shipType;
    }
  }
  return null;
}

function resolveBestProducibleCombatShipType(context: BotSubsystemContext): ShipType | null {
  const candidates = new Map<ShipType, number>();

  for (const planet of context.snapshot.planets) {
    for (const [shipType, blueprint] of SHIP_BLUEPRINTS.shipsMap.entries()) {
      if (!snapshotHasShipBuildingRequirements(planet, blueprint) || !snapshotHasShipTechnologyRequirements(planet, blueprint)) {
        continue;
      }
      if (shipType === ShipType.SPY_PROBE || shipType === ShipType.REPAIR_DRONE || shipType === ShipType.COLONIZER) {
        continue;
      }
      if (blueprint.weapons.length <= 0) {
        continue;
      }

      const score = estimateShipCombatPower(shipType);
      const previous = candidates.get(shipType) ?? -1;
      if (score > previous) {
        candidates.set(shipType, score);
      }
    }
  }

  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

function selectCombatShipsForStrength(
  originPlanet: BotPlanetSnapshot,
  requiredStrength: number,
  distance: number
): CombatShipSelection {
  const combatCandidates = Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => ({
      type: type as ShipType,
      amount: Math.max(0, amount ?? 0),
      power: estimateShipCombatPower(type as ShipType)
    }))
    .filter((entry) =>
      entry.amount > 0
      && entry.power > 0
      && entry.type !== ShipType.SPY_PROBE
      && entry.type !== ShipType.REPAIR_DRONE
      && entry.type !== ShipType.COLONIZER
    )
    .sort((left, right) =>
      right.power - left.power
      || left.type.localeCompare(right.type)
    );
  if (combatCandidates.length <= 0) {
    return { ships: [], combatStrength: 0 };
  }

  const selection: CombatShipSelection['ships'] = [];
  let totalStrength = 0;
  for (const candidate of combatCandidates) {
    for (let used = 0; used < candidate.amount; used += 1) {
      const nextSelection = selection.map((ship) => ({ ...ship }));
      const current = nextSelection.find((ship) => ship.type === candidate.type);
      if (current) {
        current.undamagedAmount += 1;
      } else {
        nextSelection.push({
          type: candidate.type,
          undamagedAmount: 1,
          damagedAmount: 0
        });
      }
      if (!hasEnoughDeuteriumForShips(originPlanet, nextSelection, distance)) {
        break;
      }
      selection.splice(0, selection.length, ...nextSelection);
      totalStrength += candidate.power;
      if (totalStrength >= requiredStrength) {
        return { ships: selection, combatStrength: totalStrength };
      }
    }
  }

  return { ships: selection, combatStrength: totalStrength };
}

function estimateShipCombatPower(shipType: ShipType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function estimateShipBombardmentPower(shipType: ShipType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  return blueprint.weapons
    .filter((weapon) => weapon.type === WeaponType.BOMBARDMENT_WEAPONS)
    .reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
}

function estimateDefenceBombardmentPower(defenceType: DefenceType): number {
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return 0;
  }

  return blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
}

function hasEnoughDeuteriumForShips(
  originPlanet: BotPlanetSnapshot,
  ships: CombatShipSelection['ships'],
  distance: number
): boolean {
  if (distance <= 0) {
    return true;
  }

  const fuelCost = calculateFuelCost(
    ships.map((ship) => ({
      type: ship.type,
      amount: ship.undamagedAmount + ship.damagedAmount
    })),
    distance
  );
  return originPlanet.localResources.deuterium >= fuelCost;
}

function resolveSelectionHangarCapacity(
  ships: Array<{ type: ShipType; undamagedAmount: number; damagedAmount: number }>
): number {
  return ships.reduce((total, ship) =>
    total + ((SHIP_BLUEPRINTS.get(ship.type)?.hangarCapacity ?? 0) * ship.undamagedAmount), 0);
}

function selectSpyOrigin(
  context: BotSubsystemContext,
  targetCoordinates: { x: number; y: number; z: number },
  probeAmount: number
): {
  originPlanet: BotPlanetSnapshot;
  travelDistance: number;
  travelTurns: number;
} | null {
  const candidates = context.snapshot.planets
    .filter((planet) => (planet.ships.undamagedCountByType[ShipType.SPY_PROBE] ?? 0) >= probeAmount)
    .map((originPlanet) => {
      const travelDistance = calculateTravelDistance(originPlanet.coordinates, targetCoordinates);
      const travelTurns = resolveTravelTurns(originPlanet, travelDistance);
      const fuelCost = calculateFuelCost([{ type: ShipType.SPY_PROBE, amount: probeAmount }], travelDistance);
      return {
        originPlanet,
        travelDistance,
        travelTurns,
        canFuel: originPlanet.localResources.deuterium >= fuelCost
      };
    })
    .filter((entry) => entry.canFuel)
    .sort((left, right) =>
      left.travelTurns - right.travelTurns
      || left.travelDistance - right.travelDistance
      || right.originPlanet.defense.avgIndustryLevel - left.originPlanet.defense.avgIndustryLevel
      || left.originPlanet.coordinates.x - right.originPlanet.coordinates.x
      || left.originPlanet.coordinates.y - right.originPlanet.coordinates.y
      || left.originPlanet.coordinates.z - right.originPlanet.coordinates.z
    );

  return candidates[0] ?? null;
}

function resolveEstimatedProbeDifficulty(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  planet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  desiredReportLevel: number
): number {
  const ownEspionageTech = Math.max(
    0,
    ...context.snapshot.planets.map((originPlanet) => originPlanet.tech.espionageTechnologyLevel)
  );
  const estimatedDefenderTech = Math.max(
    0,
    Math.round(Math.max(faction.faction.averageKnownTechLevel, planet.averageTechLevel) * 0.85)
  );
  const bunkerPenalty = Math.max(0, Math.ceil(Math.sqrt(Math.max(0, planet.bunkerLevel ?? 0))));
  const ownBasePower = Math.floor(ownEspionageTech * (1 + (planet.anomaliesAndNoise / 100)));
  return Math.max(
    0,
    desiredReportLevel - ownBasePower + Math.floor(Math.sqrt(estimatedDefenderTech) * 2) + bunkerPenalty
  );
}

function resolveDesiredReportLevel(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.WAR:
      return 10;
    case DiplomaticStatus.NEUTRAL:
      return 8;
    case DiplomaticStatus.PEACE:
      return 7;
    case DiplomaticStatus.ALLIED:
      return 6;
    default:
      return 6;
  }
}

function resolveProbeAmountForDifficulty(
  estimatedDifficulty: number,
  status: DiplomaticStatus
): number {
  const difficultyWithMargin = Math.max(
    0,
    estimatedDifficulty + resolveProbeSafetyMargin(status)
  );
  for (let probes = 1; probes <= 120; probes += 1) {
    if (calculateProbeEspionageLevelBonus(probes) >= difficultyWithMargin) {
      return probes;
    }
  }
  return 120;
}

function resolveProbeSafetyMargin(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.WAR:
      return 2;
    case DiplomaticStatus.NEUTRAL:
      return 2;
    case DiplomaticStatus.PEACE:
      return 1;
    case DiplomaticStatus.ALLIED:
      return 1;
    default:
      return 1;
  }
}

function resolvePlanetIntelNeedScore(
  faction: EvaluatedFaction,
  planet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  const depthGap = Math.max(0, faction.desiredIntelDepth - planet.intelDepth);
  const staleGap = Math.max(0, planet.lastRelevantReportAge - resolveIntelStaleThreshold(faction.faction.currentStatus));
  const coverageShare = faction.faction.knownPlanetCount / Math.max(1, faction.faction.totalPlanetCount);
  const sparseGap = Math.max(0, 1 - coverageShare);
  return (depthGap * 8) + (staleGap / 20) + (sparseGap * 20);
}

function resolveGlobalDiplomaticProbeNeedCap(context: BotSubsystemContext): number {
  const highestAverageIndustry = resolveHighestAverageIndustry(context);
  return Math.max(
    1,
    Math.round((2 * highestAverageIndustry) + (highestAverageIndustry ** 2))
  );
}

function resolveHighestAverageIndustry(context: BotSubsystemContext): number {
  return Math.max(1, ...context.snapshot.planets.map((planet) => planet.defense.avgIndustryLevel));
}

function resolveAffordableProbeCap(context: BotSubsystemContext): number {
  const globalCap = resolveGlobalDiplomaticProbeNeedCap(context);
  const highestAverageIndustry = resolveHighestAverageIndustry(context);
  return Math.max(6, Math.min(globalCap, Math.round(highestAverageIndustry * 6)));
}

function compareSpyCandidates(
  left: SpyMissionRequest | BlockedSpyNeed,
  right: SpyMissionRequest | BlockedSpyNeed
): number {
  const leftTravelTurns = 'travelTurns' in left ? left.travelTurns : Number.MAX_SAFE_INTEGER;
  const rightTravelTurns = 'travelTurns' in right ? right.travelTurns : Number.MAX_SAFE_INTEGER;
  return right.score - left.score
    || left.probeAmount - right.probeAmount
    || leftTravelTurns - rightTravelTurns
    || left.targetCoordinates.x - right.targetCoordinates.x
    || left.targetCoordinates.y - right.targetCoordinates.y
    || left.targetCoordinates.z - right.targetCoordinates.z;
}

function resolveTravelTurns(
  originPlanet: BotPlanetSnapshot | null,
  distance: number
): number {
  if (!originPlanet) {
    return Number.MAX_SAFE_INTEGER;
  }

  return fleetTravelTurnsForDistance(
    distance,
    originPlanet.tech.fusionDriveLevel,
    originPlanet.tech.hyperspaceDriveLevel,
    0
  );
}

function resolveFallbackOrigin(context: BotSubsystemContext): BotPlanetSnapshot | null {
  return context.snapshot.planets
    .slice()
    .sort((left, right) =>
      right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
      || right.power.shipyardPower - left.power.shipyardPower
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.y - right.coordinates.y
      || left.coordinates.z - right.coordinates.z
    )[0] ?? null;
}

function getTechnologyLevel(planet: BotPlanetSnapshot, technologyType: TechnologyType): number {
  switch (technologyType) {
    case TechnologyType.ENERGY_TECHNOLOGY:
      return planet.tech.energyTechnologyLevel;
    case TechnologyType.MATERIAL_TECHNOLOGY:
      return planet.tech.materialTechnologyLevel;
    case TechnologyType.ADAPTIVE_TECHNOLOGY:
      return planet.tech.adaptiveTechnologyLevel;
    case TechnologyType.COMPUTER_TECHNOLOGY:
      return planet.tech.computerTechnologyLevel;
    case TechnologyType.INTERGALACTIC_RESEARCH_NETWORK:
      return planet.tech.intergalacticResearchNetworkLevel;
    case TechnologyType.SHIELDING_TECHNOLOGY:
      return planet.tech.shieldingTechnologyLevel;
    case TechnologyType.ARMOUR_TECHNOLOGY:
      return planet.tech.armourTechnologyLevel;
    case TechnologyType.RAILGUNS_WEAPONS:
      return planet.tech.railgunsWeaponsLevel;
    case TechnologyType.BEAMS_WEAPONS:
      return planet.tech.beamsWeaponsLevel;
    case TechnologyType.MISSILES_WEAPONS:
      return planet.tech.missilesWeaponsLevel;
    case TechnologyType.FUSION_DRIVE:
      return planet.tech.fusionDriveLevel;
    case TechnologyType.HYPERSPACE_DRIVE:
      return planet.tech.hyperspaceDriveLevel;
    case TechnologyType.HYPERSPACE_TECHNOLOGY:
      return planet.tech.hyperspaceTechnologyLevel;
    case TechnologyType.ESPIONAGE_TECHNOLOGY:
      return planet.tech.espionageTechnologyLevel;
    case TechnologyType.ASTROPHYSICS_TECHNOLOGY:
      return planet.tech.astrophysicsTechnologyLevel;
    default:
      return 0;
  }
}

function snapshotHasShipBuildingRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof SHIP_BLUEPRINTS.get>>
): boolean {
  for (const requirement of blueprint.buildingRequirements) {
    const currentLevel = getBuildingLevel(planet, requirement.building);
    if (currentLevel < Math.ceil(requirement.level)) {
      return false;
    }
  }
  return true;
}

function snapshotHasShipTechnologyRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof SHIP_BLUEPRINTS.get>>
): boolean {
  for (const requirement of blueprint.techRequirements) {
    const currentLevel = getTechnologyLevel(planet, requirement.tech);
    if (currentLevel < Math.ceil(requirement.level)) {
      return false;
    }
  }
  return true;
}

function snapshotHasDefenceBuildingRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof DEFENCE_BLUEPRINTS.get>>
): boolean {
  for (const requirement of blueprint.buildingRequirements) {
    const currentLevel = getBuildingLevel(planet, requirement.building);
    if (currentLevel < Math.ceil(requirement.level)) {
      return false;
    }
  }
  return true;
}

function snapshotHasDefenceTechnologyRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof DEFENCE_BLUEPRINTS.get>>
): boolean {
  for (const requirement of blueprint.techRequirements) {
    const currentLevel = getTechnologyLevel(planet, requirement.tech);
    if (currentLevel < Math.ceil(requirement.level)) {
      return false;
    }
  }
  return true;
}

function resolveBombDepotCapacity(planet: BotPlanetSnapshot): number {
  const blueprint = BUILDING_BLUEPRINTS.get(BuildingType.BOMB_DEPOT);
  if (!blueprint || planet.economy.bombDepotLevel <= 0) {
    return 0;
  }

  return Math.max(0, Math.floor(blueprint.production1[planet.economy.bombDepotLevel - 1] ?? 0));
}

function getBuildingLevel(planet: BotPlanetSnapshot, buildingType: BuildingType): number {
  switch (buildingType) {
    case BuildingType.METAL_MINE:
      return planet.economy.metalMineLevel;
    case BuildingType.CRYSTAL_MINE:
      return planet.economy.crystalMineLevel;
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return planet.economy.deuteriumSynthesizerLevel;
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
      return planet.economy.solarLevel;
    case BuildingType.NUCLEAR_PLANT:
      return planet.economy.nuclearLevel;
    case BuildingType.FUSION_REACTOR:
      return planet.economy.fusionLevel;
    case BuildingType.ROBOTICS_FACTORY:
      return planet.economy.roboticsLevel;
    case BuildingType.NANITE_FACTORY:
      return planet.economy.naniteLevel;
    case BuildingType.SHIPYARD:
      return planet.economy.shipyardLevel;
    case BuildingType.RESEARCH_LAB:
      return planet.economy.researchLabLevel;
    case BuildingType.SENSOR_PHALANX:
      return planet.economy.sensorPhalanxLevel;
    case BuildingType.JUMP_GATE:
      return planet.economy.jumpGateLevel;
    case BuildingType.ALLIANCE_DEPOT:
      return planet.economy.allianceDepotLevel;
    case BuildingType.BOMB_DEPOT:
      return planet.economy.bombDepotLevel;
    case BuildingType.INTERSTELLAR_TRADE_PORT:
      return planet.economy.interstellarTradePortLevel;
    case BuildingType.METAL_STORAGE:
      return planet.economy.metalStorageLevel;
    case BuildingType.CRYSTAL_STORAGE:
      return planet.economy.crystalStorageLevel;
    case BuildingType.DEUTERIUM_TANK:
      return planet.economy.deuteriumTankLevel;
    default:
      return 0;
  }
}

function emptyResources(): { metal: number; crystal: number; deuterium: number } {
  return {
    metal: 0,
    crystal: 0,
    deuterium: 0
  };
}

function compareDiplomaticProposals(left: BotProposal, right: BotProposal): number {
  return right.expectedValue - left.expectedValue
    || right.urgency - left.urgency
    || right.confidence - left.confidence
    || left.proposalId.localeCompare(right.proposalId);
}

function resolveDiplomaticProposalCap(context: BotSubsystemContext): number {
  return Math.max(
    1,
    Math.floor(context.snapshot.empire.imperiumFleetCap * STRATEGIC_DIPLOMATIC_AVAILABILITY)
      + context.snapshot.empire.ownedPlanetCount
  );
}
