import { allowedDiplomaticProposalStatuses } from '../../../../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import { DiplomaticStatus } from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import type {
  BotMemoryV2StrategicDiplomaticFactionEntry,
  BotProfileId
} from '../../../../../src/app/models/player.ts';
import type {
  BotProposal,
  BotStrategicDiplomaticFactionSnapshot,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';

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
};

const STRATEGIC_DIPLOMATIC_AVAILABILITY = 0.4;
const WAR_HOSTILITY_THRESHOLD = 35;
const RETALIATION_THRESHOLD = 18;
const RELATION_PROPOSAL_MIN_UTILITY = 8;

export class BotStrategicDiplomaticSubsystem implements BotSubsystem {
  public readonly subsystemId = 'STRATEGIC_DIPLOMATIC' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const ledger = createFactionLedgerMap(context.memory.strategicDiplomatic.factionLedger);
    const ownStrengthEstimate = resolveOwnStrengthEstimate(context);
    const statusCounts = resolveStatusCounts(context.snapshot.empire.strategicDiplomaticFactions);
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

    const proposals = [
      ...createRelationChangeProposals(context, evaluatedFactions),
      ...createProposalManagementPreferences(context, evaluatedFactions),
      ...createRetaliationFlagProposals(context, evaluatedFactions)
    ]
      .sort(compareDiplomaticProposals)
      .slice(0, resolveDiplomaticProposalCap(context));

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
        proposalCap: resolveDiplomaticProposalCap(context),
        proposalCount: proposals.length,
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
      : null
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
