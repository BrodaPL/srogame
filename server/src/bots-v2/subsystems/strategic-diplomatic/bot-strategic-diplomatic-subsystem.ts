import { allowedDiplomaticProposalStatuses } from '../../../../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import { calculateProbeEspionageLevelBonus } from '../../../../../src/app/generators/espionage-report-generator.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
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

const STRATEGIC_DIPLOMATIC_AVAILABILITY = 0.4;
const WAR_HOSTILITY_THRESHOLD = 35;
const RETALIATION_THRESHOLD = 18;
const RELATION_PROPOSAL_MIN_UTILITY = 8;
const MAX_PROBE_SHIP_NEED_REQUESTS = 2;

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

    const proposals = [
      ...createRelationChangeProposals(context, evaluatedFactions),
      ...createProposalManagementPreferences(context, evaluatedFactions),
      ...createRetaliationFlagProposals(context, evaluatedFactions),
      ...spyPlanning.requests.map((request, index) => createSpyMissionProposal(context, request, index)),
      ...diplomaticProbeNeedRequests.map((request, index) => createProbeShipNeedProposal(context, request, index))
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
        // TODO: Later phases should add tributes / bribes / negotiated payments to influence diplomacy.
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
