import * as buildingTypeModule from '../../../../../src/app/models/enums/building-type.js';
import * as defenceTypeModule from '../../../../../src/app/models/enums/defence-type.js';
import * as diplomaticProposalRulesModule from '../../../../../src/app/models/diplomacy/diplomatic-proposal-rules.js';
import * as diplomaticStatusModule from '../../../../../src/app/models/diplomacy/diplomatic-status.js';
import * as espionageReportGeneratorModule from '../../../../../src/app/generators/espionage-report-generator.js';
import * as fleetMissionTypeModule from '../../../../../src/app/models/enums/fleet-mission-type.js';
import * as shipPurposeModule from '../../../../../src/app/models/enums/ship-purpose.js';
import * as shipTypeModule from '../../../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../../../src/app/models/enums/technology-type.js';
import * as weaponTypeModule from '../../../../../src/app/models/enums/weapon-type.js';
import * as planetaryBombModule from '../../../../../src/app/models/defences/planetary-bomb.js';
import * as armamentDeliveryModule from '../../../../../src/app/models/missions/armament-delivery.js';
import * as technologyEffectsModule from '../../../../../src/app/models/tech/technology-effects.js';
import type {
  BotMemoryV2StrategicDiplomaticPrimaryWarBreakTarget,
  BotMemoryV2StrategicDiplomaticFactionEntry,
  BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  BotMemoryV2StrategicDiplomaticSharedHostileEventEntry,
  BotProfileId
} from '../../../../../src/app/models/player.ts';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotStrategicDiplomaticFactionSnapshot,
  BotStrategicDiplomaticSharedHostileEventSnapshot,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  BUILDING_BLUEPRINTS,
  DEFENCE_BLUEPRINTS,
  calculateFuelCost,
  calculateTravelDistance,
  isJumpGateMissionAllowed,
  SHIP_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import {
  hasEmergencyInfrastructureDamage,
  resolveEffectiveInfrastructureDamagePercent
} from '../../infrastructure-damage.js';
import { resolveModule } from '../../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../../src/app/models/enums/building-type.js');
const { DefenceType } = resolveModule(defenceTypeModule) as typeof import('../../../../../src/app/models/enums/defence-type.js');
const { allowedDiplomaticProposalStatuses } = resolveModule(diplomaticProposalRulesModule) as typeof import('../../../../../src/app/models/diplomacy/diplomatic-proposal-rules.js');
const { DiplomaticStatus } = resolveModule(diplomaticStatusModule) as typeof import('../../../../../src/app/models/diplomacy/diplomatic-status.js');
const { calculateProbeEspionageLevelBonus } = resolveModule(espionageReportGeneratorModule) as typeof import('../../../../../src/app/generators/espionage-report-generator.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeModule) as typeof import('../../../../../src/app/models/enums/fleet-mission-type.js');
const { ShipPurpose } = resolveModule(shipPurposeModule) as typeof import('../../../../../src/app/models/enums/ship-purpose.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../../src/app/models/enums/technology-type.js');
const { WeaponType } = resolveModule(weaponTypeModule) as typeof import('../../../../../src/app/models/enums/weapon-type.js');
const { isPlanetaryBombDefenceType } = resolveModule(planetaryBombModule) as typeof import('../../../../../src/app/models/defences/planetary-bomb.js');
const { isArmamentDeliveryShipType } = resolveModule(armamentDeliveryModule) as typeof import('../../../../../src/app/models/missions/armament-delivery.js');
const { fleetTravelTurnsForDistance } = resolveModule(technologyEffectsModule) as typeof import('../../../../../src/app/models/tech/technology-effects.js');

type FactionLedgerMap = Map<number, BotMemoryV2StrategicDiplomaticFactionEntry>;
type OpenedWarTargetLedgerMap = Map<string, BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry>;
type SharedHostileEventLedgerMap = Map<string, BotMemoryV2StrategicDiplomaticSharedHostileEventEntry>;

type EvaluatedFaction = {
  faction: BotStrategicDiplomaticFactionSnapshot;
  hostilityScore: number;
  warAdvantageLevel: -2 | -1 | 0 | 1 | 2;
  stanceScore: number;
  strengthEstimate: number;
  relativeStrength: number;
  confidence: number;
  shortWindowWarScore: number;
  longWindowWarScore: number;
  combinedWarScore: number;
  currentWarExitPressure: number;
  recentOutgoingCoercionPressure: number;
  recentIncomingCoercionPressure: number;
  sharedHostilityPressureShort: number;
  sharedHostilityPressureLong: number;
  sharedHostileEvents: BotStrategicDiplomaticSharedHostileEventSnapshot[];
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
  nonAggressionUntilTurn: number | null;
  nonAggressionActive: boolean;
  nonAggressionReason: string | null;
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
  phase: 'DIRECT' | 'POST_BREAK_RAID';
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
  estimatedPlunder: number;
  cargoCapacity: number;
  ambushRisk: number;
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
  phase: 'BOMBARDMENT_RELOCATION' | 'PRE_BREAK_CONCENTRATION';
  faction: EvaluatedFaction;
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  originPlanet: BotPlanetSnapshot;
  stagingPlanet: BotPlanetSnapshot;
  ships: CombatShipSelection['ships'];
  travelDistance: number;
  travelTurns: number;
  score: number;
  moveRole: 'BOMBARDMENT_STAGING' | 'WAR_BREAK_STAGING';
  useJumpGate: boolean;
};

type PreBreakTargetSelection = {
  faction: EvaluatedFaction;
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  targetValue: number;
  expectedLosses: number;
  requiredStrength: number;
  targetStrength: number;
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

type OutgoingSupportRequestPlan = {
  supportType: 'RESOURCE_SUPPORT' | 'PLANET_REPAIR' | 'PLANET_DEFENSE' | 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET';
  targetFaction: EvaluatedFaction;
  targetCoordinates: { x: number; y: number; z: number };
  requestedResources: { metal: number; crystal: number; deuterium: number };
  missionType: FleetMissionType | null;
  minimumShips: Array<{ type: ShipType; amount: number }>;
  score: number;
  reason: string;
  helperCapabilityScore: number;
  helperDistance: number;
  recipientStatus: DiplomaticStatus;
};

type IncomingSupportPreferencePlan = {
  faction: EvaluatedFaction;
  request: BotStrategicDiplomaticFactionSnapshot['pendingIncomingSupportRequests'][number];
  preference: 'APPROVE' | 'REJECT' | 'PARTIAL_APPROVE';
  score: number;
  reason: string;
  approvedResources: { metal: number; crystal: number; deuterium: number } | null;
};

type IncomingRequestDecisionPlan = {
  faction: EvaluatedFaction;
  requestType: 'JUMP_GATE' | 'MAINTENANCE' | 'SUPPORT';
  requestId: number;
  decision: 'APPROVE' | 'REJECT' | 'PARTIAL_APPROVE';
  score: number;
  reason: string;
  targetCoordinates: { x: number; y: number; z: number } | null;
  supportType: BotStrategicDiplomaticFactionSnapshot['pendingIncomingSupportRequests'][number]['supportType'] | null;
  approvedResources: { metal: number; crystal: number; deuterium: number } | null;
  maintenanceApproval: {
    fuel: number;
    ships: Array<{ type: ShipType; amount: number }>;
    bombs: Array<{ type: DefenceType; amount: number }>;
  } | null;
};

type DiplomacyDecisionPlan = {
  faction: EvaluatedFaction;
  proposalId: number;
  decision: 'ACCEPT' | 'REJECT' | 'CANCEL';
  requestedStatus: DiplomaticStatus.PEACE | DiplomaticStatus.ALLIED | DiplomaticStatus.NEUTRAL | DiplomaticStatus.WAR;
  score: number;
  reason: string;
  expiresOnTurn: number;
};

const STRATEGIC_DIPLOMATIC_AVAILABILITY = 0.4;
const WAR_HOSTILITY_THRESHOLD = 35;
const RETALIATION_THRESHOLD = 18;
const RELATION_PROPOSAL_MIN_UTILITY = 8;
const MAX_PROBE_SHIP_NEED_REQUESTS = 2;
const HOSTILE_NEUTRAL_ATTACK_THRESHOLD = 50;
const WEAKER_NEUTRAL_ATTACK_RATIO = 1.5;
const BOMBARDMENT_ATTACK_THRESHOLD = 0.65;
const BOMBARD_HOSTILITY_THRESHOLD = 35;
const SIEGE_HOSTILITY_THRESHOLD = 60;
const SHORT_WAR_EVALUATION_WINDOW = 20;
const LONG_WAR_EVALUATION_WINDOW = 100;
const WAR_EVALUATION_INTERVAL = 20;
const LOSING_WAR_HOSTILITY_DECAY = 10;
const CATASTROPHIC_WAR_HOSTILITY_DECAY = 18;
const WAR_ADVANTAGE_NEGATIVE_THRESHOLD = -20;
const WAR_ADVANTAGE_POSITIVE_THRESHOLD = 20;
const MEANINGFUL_STRUCTURAL_DAMAGE_PERCENT = 5;
const STRATEGIC_HUB_BOMB_STOCK_RATIO_AT_WAR = 0.9;
const STRATEGIC_HUB_BOMB_STOCK_RATIO_ALLIED = 0.4;
const STRATEGIC_HUB_BOMB_STOCK_RATIO_PEACE = 0.15;
const PRIMARY_WAR_BREAK_MIN_HOLD_TURNS = 3;
const PRIMARY_WAR_BREAK_MAX_HOLD_TURNS = 10;
const PRIMARY_WAR_BREAK_MIN_VALUE_MULTIPLIER = 1.25;
const PRIMARY_WAR_BREAK_MAX_VALUE_MULTIPLIER = 1.5;
const PRIMARY_WAR_BREAK_NEAR_EQUAL_IMPROVEMENT_RATIO = 0.1;
const POST_BREAK_ATTACK_CONFIRMATION_REPORT_MAX_AGE = 10;
const POST_BREAK_ATTACK_AMBUSH_RISK_DECAY_PER_TURN = 10;
const POST_BREAK_ATTACK_AMBUSH_PAUSE_THRESHOLD = 70;
const POST_BREAK_ATTACK_BREAK_SCORE_PREFERENCE_RATIO = 1.25;
const ACTIVE_BREAK_TARGET_CAP = 2;
const ACTIVE_OPENED_WAR_TARGET_BASE = 1;
const ACTIVE_WAR_NEUTRAL_ATTACK_SCORE_MULTIPLIER = 0.6;
const ALLIED_SHARED_HOSTILITY_WEIGHT = 0.4;
const PEACE_SHARED_HOSTILITY_WEIGHT = 0.1;
const OUTGOING_SUPPORT_REQUEST_CAP = 1;
const NON_AGGRESSION_MIN_TURNS = 40;
const NON_AGGRESSION_MAX_TURNS = 100;
const NON_AGGRESSION_DEFEATED_TARGET_RELATIVE_STRENGTH = 15;
const NON_AGGRESSION_DEFEATED_TARGET_DAMAGE_PERCENT = 20;
const HEAVY_REPAIR_DAMAGE_RATIO_THRESHOLD = 0.35;
const LOCAL_REPAIR_RECOVERY_RATIO_THRESHOLD = 0.15;
const LOCAL_REPAIR_EVALUATION_TURNS = 5;
const EXTREME_RESOURCE_TOTAL_RATIO_THRESHOLD = 0.1;
const EXTREME_RESOURCE_DEUTERIUM_FLOOR = 120;
const ALLIANCE_DEPOT_SUPPORT_SCORE_BONUS = 26;
const MAINTENANCE_STORAGE_RESERVE_RATIO = 0.05;
const SHARED_HOSTILE_EVENT_WINDOW = 40;

export class BotStrategicDiplomaticSubsystem implements BotSubsystem {
  public readonly subsystemId = 'STRATEGIC_DIPLOMATIC' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const ledger = createFactionLedgerMap(context.memory.strategicDiplomatic.factionLedger);
    const openedWarTargetLedger = createOpenedWarTargetLedgerMap(context.memory.strategicDiplomatic.openedWarTargets);
    const sharedHostileEventLedger = createSharedHostileEventLedgerMap(
      context.memory.strategicDiplomatic.sharedHostileEvents
    );
    const ownStrengthEstimate = resolveOwnStrengthEstimate(context);
    const averageDevelopedIncomeValue = resolveAverageDevelopedPlanetIncomeValue(context);
    const statusCounts = resolveStatusCounts(context.snapshot.empire.strategicDiplomaticFactions);
    const proposalCap = resolveDiplomaticProposalCap(context);
    const evaluatedFactions = context.snapshot.empire.strategicDiplomaticFactions
      .map((faction) => evaluateFaction(
        context,
        faction,
        ledger,
        ownStrengthEstimate,
        averageDevelopedIncomeValue,
        statusCounts
      ))
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
    const combatPlanning = createCombatMissionRequests(
      context,
      evaluatedFactions,
      remainingFleetSlots,
      warState,
      openedWarTargetLedger
    );
    const forceProjectionPlanning = createForceProjectionRequests(
      context,
      evaluatedFactions,
      Math.max(
        0,
        remainingFleetSlots
        - combatPlanning.attackRequests.length
        - combatPlanning.supportRequests.length
        - combatPlanning.relocationRequests.length
      ),
      warState
    );
    const outgoingSupportRequests = createOutgoingSupportRequestPlans(
      context,
      evaluatedFactions,
      combatPlanning.shipNeeds,
      forceProjectionPlanning.shipNeeds
    );
    const incomingRequestDecisions = createIncomingRequestDecisionPlans(context, evaluatedFactions);

    const requestDecisionProposals = incomingRequestDecisions.map((request, index) =>
      createIncomingRequestDecisionProposal(context, request, index)
    );
    const normalProposals = [
      ...createRelationChangeProposals(context, evaluatedFactions),
      ...createProposalManagementPreferences(context, evaluatedFactions).map((request, index) =>
        createDiplomacyDecisionProposal(context, request, index)
      ),
      ...createRetaliationFlagProposals(context, evaluatedFactions),
      ...outgoingSupportRequests.flatMap((request, index) => {
        const proposal = createOutgoingSupportRequestProposal(context, request, index);
        return proposal ? [proposal] : [];
      }),
      ...spyPlanning.requests.map((request, index) => createSpyMissionProposal(context, request, index)),
      ...diplomaticProbeNeedRequests.map((request, index) => createProbeShipNeedProposal(context, request, index)),
      ...combatPlanning.relocationRequests.map((request, index) => createRelocationMissionProposal(context, request, index)),
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
      .sort(compareDiplomaticProposals);
    const proposals = [
      ...requestDecisionProposals,
      ...normalProposals.slice(0, Math.max(0, proposalCap - requestDecisionProposals.length))
    ];

    context.memory.strategicDiplomatic.factionLedger = [...ledger.values()]
      .sort((left, right) => left.playerId - right.playerId);
    context.memory.strategicDiplomatic.openedWarTargets = [...openedWarTargetLedger.values()]
      .sort(compareOpenedWarTargetLedgerEntries);
    context.memory.strategicDiplomatic.sharedHostileEvents = updateSharedHostileEventLedger(
      sharedHostileEventLedger,
      evaluatedFactions,
      context.snapshot.turn
    );

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
        diplomaticPostBreakRaidMissionCount: combatPlanning.attackRequests.filter((request) => request.phase === 'POST_BREAK_RAID').length,
        diplomaticSupportMissionCount: combatPlanning.supportRequests.length,
        diplomaticWarShipNeedCount: combatPlanning.shipNeeds.length,
        diplomaticBombardmentMissionCount: forceProjectionPlanning.bombardmentRequests.length,
        diplomaticRelocationMissionCount: forceProjectionPlanning.relocationRequests.length,
        diplomaticArmamentDeliveryMissionCount: forceProjectionPlanning.armamentDeliveryRequests.length,
        diplomaticBuildingRequestCount: forceProjectionPlanning.buildingRequests.length,
        diplomaticBombProductionRequestCount: forceProjectionPlanning.bombProductionRequests.length,
        outgoingSupportRequestCount: outgoingSupportRequests.length,
        incomingRequestDecisionCount: incomingRequestDecisions.length,
        incomingSupportPreferenceCount: incomingRequestDecisions.filter((request) => request.requestType === 'SUPPORT').length,
        sharedHostileEventCount: context.memory.strategicDiplomatic.sharedHostileEvents.length,
        attackSharePercent: resolveAttackShareForWarState(warState),
        supportSharePercent: 100 - resolveAttackShareForWarState(warState),
        diplomaticBestBreakAttackScore: combatPlanning.debug.bestBreakScore,
        diplomaticBestRaidAttackScore: combatPlanning.debug.bestRaidScore,
        diplomaticBreakPreferredOverRaid: combatPlanning.debug.breakPreferred,
        diplomaticPostBreakRaidCap: combatPlanning.debug.postBreakRaidCap,
        diplomaticRaidPauseThreshold: combatPlanning.debug.raidPauseThreshold,
        averageWarAdvantageLevel: combatPlanning.debug.averageWarAdvantageLevel,
        // TODO: Later phases should add tributes / bribes / negotiated payments to influence diplomacy.
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

function createOpenedWarTargetLedgerMap(
  entries: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry[]
): OpenedWarTargetLedgerMap {
  const map: OpenedWarTargetLedgerMap = new Map();
  for (const entry of entries) {
    map.set(toCoordinatesKey(entry.coordinates), {
      ...entry,
      coordinates: { ...entry.coordinates },
      recentRaidTurns: [...entry.recentRaidTurns],
      preferredRaidOriginCoordinates: entry.preferredRaidOriginCoordinates
        ? { ...entry.preferredRaidOriginCoordinates }
        : null
    });
  }
  return map;
}

function createSharedHostileEventLedgerMap(
  entries: BotMemoryV2StrategicDiplomaticSharedHostileEventEntry[]
): SharedHostileEventLedgerMap {
  const map: SharedHostileEventLedgerMap = new Map();
  for (const entry of entries) {
    map.set(resolveSharedHostileEventLedgerKey(entry), {
      ...entry,
      targetCoordinates: { ...entry.targetCoordinates }
    });
  }
  return map;
}

function updateSharedHostileEventLedger(
  ledger: SharedHostileEventLedgerMap,
  factions: EvaluatedFaction[],
  currentTurn: number
): BotMemoryV2StrategicDiplomaticSharedHostileEventEntry[] {
  for (const faction of factions) {
    for (const event of faction.sharedHostileEvents) {
      const key = resolveSharedHostileEventLedgerKey(event);
      const previous = ledger.get(key);
      ledger.set(key, {
        attackerPlayerId: event.attackerPlayerId,
        victimPlayerId: event.victimPlayerId,
        targetCoordinates: { ...event.targetCoordinates },
        eventType: event.eventType,
        eventTurn: event.eventTurn,
        sharedFromPlayerId: event.sharedFromPlayerId,
        sharedFromStatus: event.sharedFromStatus,
        severity: event.severity,
        propagatedOnTurn: previous?.propagatedOnTurn ?? currentTurn
      });
    }
  }

  return [...ledger.values()]
    .filter((entry) => entry.eventTurn >= currentTurn - SHARED_HOSTILE_EVENT_WINDOW)
    .sort((left, right) =>
      right.eventTurn - left.eventTurn
      || right.severity - left.severity
      || left.attackerPlayerId - right.attackerPlayerId
    )
    .slice(0, 400);
}

function resolveSharedHostileEventLedgerKey(
  entry: Pick<
    BotMemoryV2StrategicDiplomaticSharedHostileEventEntry,
    'attackerPlayerId' | 'victimPlayerId' | 'eventType' | 'eventTurn' | 'sharedFromPlayerId' | 'targetCoordinates'
  >
): string {
  return [
    entry.attackerPlayerId,
    entry.victimPlayerId,
    toCoordinatesKey(entry.targetCoordinates),
    entry.eventType,
    entry.eventTurn,
    entry.sharedFromPlayerId
  ].join(':');
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
  averageDevelopedIncomeValue: number,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>
): EvaluatedFaction {
  const previous = ledger.get(faction.playerId) ?? {
    playerId: faction.playerId,
    hostilityScore: 0,
    warAdvantageLevel: 0,
    lastSuccessfulBombardTurn: null,
    lastSuccessfulSiegeTickTurn: null,
    recentOutgoingCoercionPressure: 0,
    recentIncomingCoercionPressure: 0,
    lastWarEvaluationTurn: null,
    shortWindowWarScore: 0,
    longWindowWarScore: 0,
    currentWarExitPressure: 0,
    lastComputedStanceScore: 0,
    lastComputedStrengthEstimate: 0,
    lastKnownStatus: null,
    lastSeenTurn: null,
    nonAggressionUntilTurn: null,
    nonAggressionStartedTurn: null,
    nonAggressionReason: null
  };
  const strengthEstimate = resolveFactionStrengthEstimate(faction);
  const relativeStrength = ownStrengthEstimate - strengthEstimate;
  const confidence = resolveFactionConfidence(faction);
  const warPressure = resolveWarPressureEvaluation(context, faction, previous, relativeStrength);
  const sharedHostility = resolveSharedHostilityPressure(faction, context.snapshot.turn);
  const nonAggression = resolveNonAggressionTreatment(
    context,
    faction,
    previous,
    relativeStrength,
    strengthEstimate,
    warPressure
  );
  const hostilityScore = resolveHostilityScore(
    context,
    faction,
    previous,
    warPressure,
    sharedHostility.shortPressure,
    nonAggression.active,
    averageDevelopedIncomeValue
  );
  const stanceScore = resolveStanceScore(
    context.snapshot.profileId,
    faction,
    relativeStrength,
    hostilityScore,
    confidence,
    statusCounts,
    warPressure,
    nonAggression.active
  );
  const relationUtilities = resolveRelationUtilities(
    context.snapshot.profileId,
    faction,
    stanceScore,
    hostilityScore,
    relativeStrength,
    confidence,
    statusCounts,
    warPressure,
    nonAggression.active
  );

  ledger.set(faction.playerId, {
    playerId: faction.playerId,
    hostilityScore,
    warAdvantageLevel: warPressure.warAdvantageLevel,
    lastSuccessfulBombardTurn: maxTurn(
      previous.lastSuccessfulBombardTurn,
      faction.lastSuccessfulOutgoingBombardTurn
    ),
    lastSuccessfulSiegeTickTurn: maxTurn(
      previous.lastSuccessfulSiegeTickTurn,
      faction.lastSuccessfulOutgoingSiegeTurn
    ),
    recentOutgoingCoercionPressure: warPressure.recentOutgoingCoercionPressure,
    recentIncomingCoercionPressure: warPressure.recentIncomingCoercionPressure,
    lastWarEvaluationTurn: warPressure.lastWarEvaluationTurn,
    shortWindowWarScore: warPressure.shortWindowWarScore,
    longWindowWarScore: warPressure.longWindowWarScore,
    currentWarExitPressure: warPressure.currentWarExitPressure,
    lastComputedStanceScore: stanceScore,
    lastComputedStrengthEstimate: strengthEstimate,
    lastKnownStatus: faction.currentStatus,
    lastSeenTurn: context.snapshot.turn,
    nonAggressionUntilTurn: nonAggression.untilTurn,
    nonAggressionStartedTurn: nonAggression.startedTurn,
    nonAggressionReason: nonAggression.reason
  });

  return {
    faction,
    hostilityScore,
    warAdvantageLevel: warPressure.warAdvantageLevel,
    stanceScore,
    strengthEstimate,
    relativeStrength,
    confidence,
    shortWindowWarScore: warPressure.shortWindowWarScore,
    longWindowWarScore: warPressure.longWindowWarScore,
    combinedWarScore: warPressure.combinedWarScore,
    currentWarExitPressure: warPressure.currentWarExitPressure,
    recentOutgoingCoercionPressure: warPressure.recentOutgoingCoercionPressure,
    recentIncomingCoercionPressure: warPressure.recentIncomingCoercionPressure,
    sharedHostilityPressureShort: sharedHostility.shortPressure,
    sharedHostilityPressureLong: sharedHostility.longPressure,
    sharedHostileEvents: sharedHostility.events,
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
    enemyEspionageSuperiority: estimateEnemyEspionageSuperiority(context, faction),
    nonAggressionUntilTurn: nonAggression.untilTurn,
    nonAggressionActive: nonAggression.active,
    nonAggressionReason: nonAggression.reason
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

function resolveAverageDevelopedPlanetIncomeValue(context: BotSubsystemContext): number {
  const developedPlanets = context.snapshot.planets.filter((planet) =>
    planet.maturityStage === 'DEVELOPED'
    || planet.maturityStage === 'MILITARY_CAPABLE'
    || planet.maturityStage === 'STRATEGIC_HUB'
  );
  const source = developedPlanets.length > 0 ? developedPlanets : context.snapshot.planets;
  if (source.length <= 0) {
    return 0;
  }

  const total = source.reduce((sum, planet) =>
    sum
    + planet.economy.income.metal
    + (planet.economy.income.crystal * 1.8)
    + (planet.economy.income.deuterium * 2.6), 0);
  return Math.max(0, total / source.length);
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

function resolveSharedHostilityPressure(
  faction: BotStrategicDiplomaticFactionSnapshot,
  currentTurn: number
): {
  shortPressure: number;
  longPressure: number;
  events: BotStrategicDiplomaticSharedHostileEventSnapshot[];
} {
  let shortPressure = 0;
  let longPressure = 0;
  if (
    faction.currentStatus === DiplomaticStatus.ALLIED
    || faction.currentStatus === DiplomaticStatus.PEACE
  ) {
    return {
      shortPressure: 0,
      longPressure: 0,
      events: faction.sharedHostileEvents
    };
  }
  const events = faction.sharedHostileEvents
    .filter((event) =>
      event.attackerPlayerId === faction.playerId
      && event.eventTurn >= currentTurn - SHARED_HOSTILE_EVENT_WINDOW
    )
    .sort((left, right) =>
      right.eventTurn - left.eventTurn
      || right.severity - left.severity
    );

  for (const event of events) {
    const age = Math.max(0, currentTurn - event.eventTurn);
    const weightedSeverity = event.severity * resolveSharedHostilityWeight(event.sharedFromStatus);
    if (age <= SHORT_WAR_EVALUATION_WINDOW) {
      shortPressure += weightedSeverity;
    }
    longPressure += weightedSeverity;
  }

  return {
    shortPressure,
    longPressure,
    events
  };
}

function resolveHostilityScore(
  context: BotSubsystemContext,
  faction: BotStrategicDiplomaticFactionSnapshot,
  previous: BotMemoryV2StrategicDiplomaticFactionEntry,
  warPressure: ReturnType<typeof resolveWarPressureEvaluation>,
  sharedHostilityPressureShort: number,
  nonAggressionActive: boolean,
  averageDevelopedIncomeValue: number
): number {
  let score = previous.hostilityScore * 0.6;
  score += faction.recentBattleReportCount * 12;
  score += sharedHostilityPressureShort;
  score += faction.recentIncomingCoercionPressureShort * 0.8;
  score -= faction.recentOutgoingCoercionPressureShort * 0.6;
  if (faction.currentStatus === DiplomaticStatus.WAR) {
    score += 20;
  }
  if (faction.pendingIncomingRequestedStatuses.includes(DiplomaticStatus.WAR)) {
    score += 24;
  }
  if (faction.pendingIncomingRequestedStatuses.includes(DiplomaticStatus.NEUTRAL)) {
    score += 6;
  }
  score -= resolveOutgoingShipLossHostilityRelief(faction.recentOutgoingShipLossValueShort);
  score += resolveIncomingPlunderHostilityDelta(
    faction.recentIncomingPlunderValueShort,
    averageDevelopedIncomeValue,
    warPressure.warAdvantageLevel
  );
  score -= resolveOutgoingPlunderHostilityRelief(
    faction.recentOutgoingPlunderValueShort,
    averageDevelopedIncomeValue
  );
  if (faction.recentOutgoingDamagePercentShort >= MEANINGFUL_STRUCTURAL_DAMAGE_PERCENT) {
    score -= 6 + Math.min(12, faction.recentOutgoingDamagePercentShort * 0.35);
  }
  if (faction.recentIncomingDamagePercentShort >= MEANINGFUL_STRUCTURAL_DAMAGE_PERCENT) {
    score -= 4 + Math.min(10, faction.recentIncomingDamagePercentShort * 0.25);
  }
  score -= Math.max(0, warPressure.currentWarExitPressure * 0.2);
  if (
    faction.currentStatus === DiplomaticStatus.WAR
    && warPressure.appliedLosingWarDecay
  ) {
    score -= warPressure.warAdvantageLevel <= -2
      ? CATASTROPHIC_WAR_HOSTILITY_DECAY
      : LOSING_WAR_HOSTILITY_DECAY;
  }
  if (nonAggressionActive) {
    score -= 45;
  }
  return Math.max(0, Math.min(120, score));
}

function resolveNonAggressionTreatment(
  context: BotSubsystemContext,
  faction: BotStrategicDiplomaticFactionSnapshot,
  previous: BotMemoryV2StrategicDiplomaticFactionEntry,
  relativeStrength: number,
  strengthEstimate: number,
  warPressure: ReturnType<typeof resolveWarPressureEvaluation>
): {
  untilTurn: number | null;
  startedTurn: number | null;
  reason: string | null;
  active: boolean;
} {
  const existingUntilTurn = previous.nonAggressionUntilTurn !== null
    && previous.nonAggressionUntilTurn > context.snapshot.turn
    ? previous.nonAggressionUntilTurn
    : null;
  if (existingUntilTurn !== null) {
    return {
      untilTurn: existingUntilTurn,
      startedTurn: previous.nonAggressionStartedTurn,
      reason: previous.nonAggressionReason ?? 'DEFEATED_WAR_TARGET',
      active: true
    };
  }

  const targetStrengthReduced = previous.lastComputedStrengthEstimate > 0
    && strengthEstimate <= previous.lastComputedStrengthEstimate * 0.75;
  const defeatedWarTarget = faction.currentStatus === DiplomaticStatus.WAR
    && relativeStrength >= NON_AGGRESSION_DEFEATED_TARGET_RELATIVE_STRENGTH
    && (
      warPressure.currentWarExitPressure >= 25
      || warPressure.combinedWarScore >= 25
      || targetStrengthReduced
      || faction.recentOutgoingDamagePercentLong >= NON_AGGRESSION_DEFEATED_TARGET_DAMAGE_PERCENT
    );
  if (!defeatedWarTarget) {
    return {
      untilTurn: null,
      startedTurn: null,
      reason: null,
      active: false
    };
  }

  const duration = resolveNonAggressionDuration(
    context.snapshot.profileId,
    context.snapshot.playerId,
    faction.playerId
  );
  return {
    untilTurn: context.snapshot.turn + duration,
    startedTurn: context.snapshot.turn,
    reason: 'DEFEATED_WAR_TARGET',
    active: true
  };
}

function resolveNonAggressionDuration(
  profileId: BotProfileId | null,
  playerId: number,
  targetPlayerId: number
): number {
  const baseDuration = resolveDeterministicIntInRange(
    `non-aggression:${profileId ?? 'UNKNOWN'}:${playerId}:${targetPlayerId}`,
    NON_AGGRESSION_MIN_TURNS,
    NON_AGGRESSION_MAX_TURNS
  );
  const modifier = profileId === 'AGGRESSOR'
    ? -20
    : profileId === 'BALANCED'
      ? -10
      : profileId === 'AVOIDER'
        ? 20
        : 0;
  return Math.max(20, Math.min(120, baseDuration + modifier));
}

function resolveSharedHostilityWeight(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.ALLIED:
      return ALLIED_SHARED_HOSTILITY_WEIGHT;
    case DiplomaticStatus.PEACE:
      return PEACE_SHARED_HOSTILITY_WEIGHT;
    default:
      return 0;
  }
}

function resolveStanceScore(
  profileId: BotProfileId | null,
  faction: BotStrategicDiplomaticFactionSnapshot,
  relativeStrength: number,
  hostilityScore: number,
  confidence: number,
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>,
  warPressure: ReturnType<typeof resolveWarPressureEvaluation>,
  nonAggressionActive: boolean
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
  const warExitBias = faction.currentStatus === DiplomaticStatus.WAR
    ? -Math.min(24, warPressure.currentWarExitPressure * 0.35)
    : 0;
  const relationBias = faction.currentStatus === DiplomaticStatus.WAR
    ? 10
    : faction.currentStatus === DiplomaticStatus.ALLIED
      ? -14
      : faction.currentStatus === DiplomaticStatus.PEACE
        ? -7
        : 0;
  const networkPressure = resolveNetworkPressure(profileId, statusCounts, faction.currentStatus);
  const nonAggressionBias = nonAggressionActive ? -50 : 0;
  const rawScore = personalityBias + strengthBias + hostilityBias + warExitBias + relationBias + networkPressure + nonAggressionBias;
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

function resolveWayWeakerWarThreshold(profileId: BotProfileId | null): number {
  switch (profileId) {
    case 'AGGRESSOR':
      return 18;
    case 'BALANCED':
      return 28;
    case 'MINER':
      return 42;
    case 'BUNKERER':
      return 45;
    case 'TURTLE':
      return 50;
    case 'AVOIDER':
      return 55;
    default:
      return 32;
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
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>,
  warPressure: ReturnType<typeof resolveWarPressureEvaluation>,
  nonAggressionActive: boolean
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
      statusCounts,
      warPressure,
      nonAggressionActive
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
  statusCounts: Record<'WAR' | 'ALLIED' | 'PEACE' | 'NEUTRAL', number>,
  warPressure: ReturnType<typeof resolveWarPressureEvaluation>,
  nonAggressionActive = false
): number {
  if (requestedStatus === DiplomaticStatus.WAR) {
    if (nonAggressionActive) {
      return -999;
    }
    const weakerTargetThreshold = resolveWayWeakerWarThreshold(profileId);
    if (hostilityScore < WAR_HOSTILITY_THRESHOLD && relativeStrength < weakerTargetThreshold) {
      return -999;
    }
    const weakerTargetBonus = relativeStrength >= weakerTargetThreshold
      ? Math.max(0, (relativeStrength - weakerTargetThreshold) * 1.2) + 24
      : 0;
    return stanceScore
      + Math.max(0, hostilityScore - 20)
      + Math.max(0, relativeStrength * 0.5)
      + weakerTargetBonus
      + (confidence * 10);
  }

  if (requestedStatus === DiplomaticStatus.PEACE) {
    if (
      currentStatus === DiplomaticStatus.WAR
      && warPressure.combinedWarScore > -20
    ) {
      return -999;
    }
    const allianceDeficit = statusCounts.ALLIED <= 0 ? 5 : 0;
    const warExitBonus = currentStatus === DiplomaticStatus.WAR
      ? Math.max(0, warPressure.currentWarExitPressure * 0.35)
      : 0;
    const losingBonus = warPressure.combinedWarScore <= -20 ? 10 : 0;
    return (-stanceScore) + (currentStatus === DiplomaticStatus.WAR ? 18 : 8) + allianceDeficit + warExitBonus + losingBonus + (confidence * 6);
  }

  if (requestedStatus === DiplomaticStatus.ALLIED) {
    const allyNeed = statusCounts.ALLIED <= 0 ? 12 : 4;
    const minerBias = profileId === 'MINER' ? 8 : profileId === 'AVOIDER' ? 4 : 0;
    // TODO: Far-future coalition policy: weak bots should coordinate alliances against a much stronger player.
    const weakerAllianceBonus = relativeStrength < -35
      ? 18
      : relativeStrength < -15 ? 10 : 0;
    return (-stanceScore) + allyNeed + minerBias + weakerAllianceBonus + (relativeStrength > -15 ? 4 : 0) + (confidence * 8);
  }

  if (requestedStatus === DiplomaticStatus.NEUTRAL) {
    const warExitBonus = currentStatus === DiplomaticStatus.WAR
      ? Math.max(0, warPressure.currentWarExitPressure * 0.5)
      : 0;
    const losingBonus = warPressure.combinedWarScore <= -20
      ? 14
      : warPressure.combinedWarScore < 0 ? 6 : 0;
    return (-Math.abs(stanceScore) * 0.5) + (currentStatus === DiplomaticStatus.WAR ? 14 : 10) + warExitBonus + losingBonus + (confidence * 5);
  }

  return -999;
}

function createRelationChangeProposals(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): BotProposal[] {
  const candidates: Array<{
    faction: EvaluatedFaction;
    requestedStatus: DiplomaticStatus;
    utility: number;
  }> = [];

  for (const faction of factions) {
    if (
      faction.faction.knownPlanetCount <= 0
      || faction.faction.knownPlanets.length <= 0
      || faction.faction.pendingIncomingDiplomacyProposals.length > 0
      || faction.faction.pendingOutgoingDiplomacyProposals.length > 0
    ) {
      continue;
    }

    const factionCandidates: Array<{ requestedStatus: DiplomaticStatus; utility: number }> = [];
    if (
      faction.bestEscalationStatus !== null
      && faction.bestEscalationUtility !== null
      && faction.bestEscalationUtility >= RELATION_PROPOSAL_MIN_UTILITY
    ) {
      factionCandidates.push({
        requestedStatus: faction.bestEscalationStatus,
        utility: faction.bestEscalationUtility
      });
    }
    if (
      faction.bestDeescalationStatus !== null
      && faction.bestDeescalationUtility !== null
      && faction.bestDeescalationUtility >= RELATION_PROPOSAL_MIN_UTILITY
    ) {
      factionCandidates.push({
        requestedStatus: faction.bestDeescalationStatus,
        utility: faction.bestDeescalationUtility
      });
    }
    if (
      faction.faction.currentStatus === DiplomaticStatus.PEACE
      && faction.allianceUtility !== null
      && faction.allianceUtility >= RELATION_PROPOSAL_MIN_UTILITY
    ) {
      factionCandidates.push({
        requestedStatus: DiplomaticStatus.ALLIED,
        utility: faction.allianceUtility
      });
    }

    const best = factionCandidates.sort((left, right) => right.utility - left.utility)[0] ?? null;
    if (!best) {
      continue;
    }

    candidates.push({
      faction,
      requestedStatus: best.requestedStatus,
      utility: best.utility
    });
  }

  const best = candidates
    .sort((left, right) =>
      right.utility - left.utility
      || left.faction.faction.playerId - right.faction.faction.playerId
    )[0] ?? null;
  if (!best) {
    return [];
  }

  const { faction } = best;
  return [
    {
      proposalId: `strategic-diplomatic:relation:${faction.faction.playerId}:${best.requestedStatus}:${context.snapshot.turn}`,
      subsystemId: 'STRATEGIC_DIPLOMATIC',
      kind: 'DIPLOMACY_PROPOSAL',
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
        actionType: 'DIPLOMACY_PROPOSAL',
        targetPlayerId: faction.faction.playerId,
        currentStatus: faction.faction.currentStatus,
        requestedStatus: best.requestedStatus,
        utility: Math.round(best.utility),
        reason: resolveRelationProposalReason(context.snapshot.profileId, best.requestedStatus, faction)
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
        relativeStrength: Math.round(faction.relativeStrength),
        nonAggressionUntilTurn: faction.nonAggressionUntilTurn,
        nonAggressionReason: faction.nonAggressionReason
      }
    }
  ];
}

function createProposalManagementPreferences(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): DiplomacyDecisionPlan[] {
  const proposals: DiplomacyDecisionPlan[] = [];
  const statusCounts = resolveStatusCounts(context.snapshot.empire.strategicDiplomaticFactions);

  for (const faction of factions) {
    for (const pendingProposal of faction.faction.pendingIncomingDiplomacyProposals) {
      const requestedStatus = normalizeExecutableDiplomaticStatus(pendingProposal.requestedStatus);
      if (!requestedStatus) {
        continue;
      }
      const validTransition = allowedDiplomaticProposalStatuses(faction.faction.currentStatus).includes(requestedStatus);
      const utility = computeRelationChangeUtility(
        context.snapshot.profileId,
        faction.faction.currentStatus,
        requestedStatus,
        faction.stanceScore,
        faction.hostilityScore,
        faction.relativeStrength,
        faction.confidence,
        statusCounts,
        {
          recentOutgoingCoercionPressure: faction.recentOutgoingCoercionPressure,
          recentIncomingCoercionPressure: faction.recentIncomingCoercionPressure,
          shortWindowWarScore: faction.shortWindowWarScore,
          longWindowWarScore: faction.longWindowWarScore,
          combinedWarScore: faction.combinedWarScore,
          warAdvantageLevel: faction.warAdvantageLevel,
          currentWarExitPressure: faction.currentWarExitPressure,
          lastWarEvaluationTurn: context.snapshot.turn,
          appliedLosingWarDecay: false
        },
        faction.nonAggressionActive
      );
      const decision = validTransition && utility >= RELATION_PROPOSAL_MIN_UTILITY ? 'ACCEPT' : 'REJECT';
      proposals.push({
        faction,
        proposalId: pendingProposal.proposalId,
        decision,
        requestedStatus,
        score: Math.max(1, Math.round(Math.abs(utility) * 8)),
        reason: validTransition ? `utility_${Math.round(utility)}` : 'invalid_treaty_ladder',
        expiresOnTurn: pendingProposal.expiresOnTurn
      });
    }

    for (const pendingProposal of faction.faction.pendingOutgoingDiplomacyProposals) {
      const requestedStatus = normalizeExecutableDiplomaticStatus(pendingProposal.requestedStatus);
      if (!requestedStatus) {
        continue;
      }
      const utility = computeRelationChangeUtility(
        context.snapshot.profileId,
        faction.faction.currentStatus,
        requestedStatus,
        faction.stanceScore,
        faction.hostilityScore,
        faction.relativeStrength,
        faction.confidence,
        statusCounts,
        {
          recentOutgoingCoercionPressure: faction.recentOutgoingCoercionPressure,
          recentIncomingCoercionPressure: faction.recentIncomingCoercionPressure,
          shortWindowWarScore: faction.shortWindowWarScore,
          longWindowWarScore: faction.longWindowWarScore,
          combinedWarScore: faction.combinedWarScore,
          warAdvantageLevel: faction.warAdvantageLevel,
          currentWarExitPressure: faction.currentWarExitPressure,
          lastWarEvaluationTurn: context.snapshot.turn,
          appliedLosingWarDecay: false
        },
        faction.nonAggressionActive
      );
      if (utility >= 0) {
        continue;
      }
      proposals.push({
        faction,
        proposalId: pendingProposal.proposalId,
        decision: 'CANCEL',
        requestedStatus,
        score: Math.max(1, Math.round(Math.abs(utility) * 8)),
        reason: `negative_utility_${Math.round(utility)}`,
        expiresOnTurn: pendingProposal.expiresOnTurn
      });
    }
  }

  return proposals;
}

function createDiplomacyDecisionProposal(
  context: BotSubsystemContext,
  request: DiplomacyDecisionPlan,
  index: number
): BotProposal {
  const urgency = request.expiresOnTurn <= context.snapshot.turn + 1
    ? 88
    : request.decision === 'ACCEPT'
      ? 72
      : 64;
  return {
    proposalId: `strategic-diplomatic:diplomacy-decision:${request.proposalId}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'DIPLOMACY_DECISION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:diplomacy-decision:${request.proposalId}`,
    dedupeKey: `strategic-diplomatic:diplomacy-decision:${request.proposalId}`,
    summary: `Diplomacy decision #${index + 1}: ${request.decision.toLowerCase()} ${request.requestedStatus} proposal with ${request.faction.faction.playerName}.`,
    planetId: null,
    targetCoordinates: null,
    expectedValue: request.score,
    urgency,
    risk: request.decision === 'ACCEPT' ? 12 : 4,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
    requestPayload: {
      actionType: 'DIPLOMACY_DECISION',
      proposalId: request.proposalId,
      decision: request.decision,
      targetPlayerId: request.faction.faction.playerId,
      currentStatus: request.faction.faction.currentStatus,
      requestedStatus: request.requestedStatus,
      reason: request.reason
    },
    blockers: [],
    expiresOnTurn: request.expiresOnTurn,
    debug: {
      playerId: request.faction.faction.playerId,
      decision: request.decision,
      requestedStatus: request.requestedStatus,
      reason: request.reason,
      proposalExpiresOnTurn: request.expiresOnTurn
    }
  };
}

function normalizeExecutableDiplomaticStatus(
  status: DiplomaticStatus
): DiplomacyDecisionPlan['requestedStatus'] | null {
  return status === DiplomaticStatus.PEACE
    || status === DiplomaticStatus.ALLIED
    || status === DiplomaticStatus.NEUTRAL
    || status === DiplomaticStatus.WAR
    ? status
    : null;
}

function resolveRelationProposalReason(
  profileId: BotProfileId | null,
  requestedStatus: DiplomaticStatus,
  faction: EvaluatedFaction
): string {
  if (requestedStatus === DiplomaticStatus.WAR) {
    return faction.relativeStrength >= resolveWayWeakerWarThreshold(profileId)
      ? 'way_weaker_target'
      : 'hostility_escalation';
  }
  if (
    requestedStatus === DiplomaticStatus.NEUTRAL
    && faction.nonAggressionActive
  ) {
    return 'post_victory_non_aggression';
  }
  if (requestedStatus === DiplomaticStatus.ALLIED) {
    return faction.relativeStrength < -15 ? 'weaker_empire_alliance_seek' : 'alliance_utility';
  }
  return 'relation_utility';
}

function createIncomingRequestDecisionProposal(
  context: BotSubsystemContext,
  request: IncomingRequestDecisionPlan,
  index: number
): BotProposal {
  return {
    proposalId: `strategic-diplomatic:request-decision:${request.requestType}:${request.requestId}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'REQUEST_DECISION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:request-decision:${request.requestType}:${request.requestId}`,
    dedupeKey: `strategic-diplomatic:request-decision:${request.requestType}:${request.requestId}`,
    summary: `Request decision #${index + 1}: ${request.decision.toLowerCase()} ${request.requestType} request from ${request.faction.faction.playerName}.`,
    planetId: null,
    targetCoordinates: request.targetCoordinates ? { ...request.targetCoordinates } : null,
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.decision === 'APPROVE' ? 78 : request.decision === 'PARTIAL_APPROVE' ? 72 : 58,
    risk: request.requestType === 'SUPPORT' && request.supportType === 'RESOURCE_SUPPORT' ? 8 : 12,
    confidence: Math.round(request.faction.confidence * 100),
    requestedResources: request.approvedResources ? { ...request.approvedResources } : emptyResources(),
    requestPayload: {
      actionType: 'REQUEST_DECISION',
      requestType: request.requestType,
      requestId: request.requestId,
      targetPlayerId: request.faction.faction.playerId,
      supportType: request.supportType,
      decision: request.decision,
      approvedResources: request.approvedResources ? { ...request.approvedResources } : null,
      maintenanceApproval: request.maintenanceApproval
        ? {
          fuel: request.maintenanceApproval.fuel,
          ships: request.maintenanceApproval.ships.map((entry) => ({ ...entry })),
          bombs: request.maintenanceApproval.bombs.map((entry) => ({ ...entry }))
        }
        : null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      requestType: request.requestType,
      supportType: request.supportType,
      targetPlayerId: request.faction.faction.playerId,
      decision: request.decision,
      reason: request.reason
    }
  };
}

function createOutgoingSupportRequestProposal(
  context: BotSubsystemContext,
  request: OutgoingSupportRequestPlan,
  index: number
): BotProposal | null {
  if (!isOutgoingSupportRequestPlanLegal(request)) {
    return null;
  }

  return {
    proposalId: `strategic-diplomatic:outgoing-support:${request.supportType}:${request.targetFaction.faction.playerId}:${toCoordinatesKey(request.targetCoordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'REQUEST_CREATION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:outgoing-support:${request.supportType}:${toCoordinatesKey(request.targetCoordinates)}`,
    dedupeKey: `strategic-diplomatic:outgoing-support:${request.supportType}:${request.targetFaction.faction.playerId}:${toCoordinatesKey(request.targetCoordinates)}`,
    summary: `Support request #${index + 1}: ask ${request.targetFaction.faction.playerName} for ${request.supportType} at ${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}.`,
    planetId: null,
    targetCoordinates: { ...request.targetCoordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.supportType === 'PLANET_DEFENSE' ? 81
      : request.supportType === 'PLANET_REPAIR' ? 77
        : request.supportType === 'RESOURCE_SUPPORT' ? 72
          : 75,
    risk: request.supportType === 'RESOURCE_SUPPORT' ? 6 : 12,
    confidence: Math.round(request.targetFaction.confidence * 100),
    requestedResources: { ...request.requestedResources },
    requestPayload: {
      actionType: 'REQUEST_CREATION',
      requestType: 'SUPPORT',
      targetPlayerId: request.targetFaction.faction.playerId,
      targetStatus: request.recipientStatus,
      supportType: request.supportType,
      targetCoordinates: { ...request.targetCoordinates },
      requestedResources: { ...request.requestedResources },
      missionType: request.missionType,
      minimumShips: request.minimumShips.map((entry) => ({ ...entry })),
      bombardmentPriorities: null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      supportType: request.supportType,
      targetPlayerId: request.targetFaction.faction.playerId,
      targetStatus: request.recipientStatus,
      helperCapabilityScore: request.helperCapabilityScore,
      helperDistance: request.helperDistance,
      reason: request.reason
    }
  };
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
  const incomingCoercionPressure = warFactions.reduce((sum, faction) => sum + faction.recentIncomingCoercionPressure, 0);
  const outgoingCoercionPressure = warFactions.reduce((sum, faction) => sum + faction.recentOutgoingCoercionPressure, 0);
  const averageCombinedWarScore = warFactions.length > 0
    ? warFactions.reduce((sum, faction) => sum + faction.combinedWarScore, 0) / warFactions.length
    : 0;
  const averageWarAdvantageLevel = warFactions.length > 0
    ? warFactions.reduce((sum, faction) => sum + faction.warAdvantageLevel, 0) / warFactions.length
    : 0;
  const ownDamage = context.snapshot.planets.reduce((sum, planet) =>
    sum + (planet.infrastructure.damagedBuildingCount * 8) + Math.ceil(planet.infrastructure.missingBuildingStructuralPoints / 100), 0);
  const allyDistress = factions
    .filter((faction) => faction.faction.currentStatus === DiplomaticStatus.ALLIED)
    .reduce((sum, faction) =>
      sum
      + faction.faction.pendingIncomingSupportRequests.length * 18
      + faction.faction.knownPlanets.reduce((planetSum, planet) =>
        planetSum + (planet.recentBattleReportCount * 10), 0), 0);
  const totalPressure = hostilePressure + incomingCoercionPressure + ownDamage + allyDistress - (outgoingCoercionPressure * 0.3);

  if (warFactions.length <= 0) {
    return ownDamage > 0 || allyDistress > 24 ? 'BALANCED' : 'WINNING';
  }
  if (averageWarAdvantageLevel <= -1 || averageCombinedWarScore <= -20 || relativeStrengthScore < -25 || totalPressure > 80) {
    return 'LOSING';
  }
  if (averageWarAdvantageLevel >= 1 || averageCombinedWarScore >= 20 || (relativeStrengthScore > 25 && totalPressure < 45)) {
    return 'WINNING';
  }
  return 'BALANCED';
}

function resolveWarPressureEvaluation(
  context: BotSubsystemContext,
  faction: BotStrategicDiplomaticFactionSnapshot,
  previous: BotMemoryV2StrategicDiplomaticFactionEntry,
  relativeStrength: number
): {
  recentOutgoingCoercionPressure: number;
  recentIncomingCoercionPressure: number;
  shortWindowWarScore: number;
  longWindowWarScore: number;
  combinedWarScore: number;
  warAdvantageLevel: -2 | -1 | 0 | 1 | 2;
  currentWarExitPressure: number;
  lastWarEvaluationTurn: number | null;
  appliedLosingWarDecay: boolean;
} {
  const shouldEvaluate = previous.lastWarEvaluationTurn === null
    || (context.snapshot.turn - previous.lastWarEvaluationTurn) >= WAR_EVALUATION_INTERVAL;
  const nextShortWindowWarScore = normalizeWarScore(
    (relativeStrength * 0.8)
    + (faction.recentOutgoingCoercionPressureShort * 1.2)
    - (faction.recentIncomingCoercionPressureShort * 1.1)
    - (faction.recentIncomingDamagePercentShort * 0.5)
    + (faction.recentOutgoingDamagePercentShort * 0.3)
  );
  const nextLongWindowWarScore = normalizeWarScore(
    (relativeStrength * 0.65)
    + (faction.recentOutgoingCoercionPressureLong * 0.75)
    - (faction.recentIncomingCoercionPressureLong * 0.7)
    - (faction.recentIncomingDamagePercentLong * 0.3)
    + (faction.recentOutgoingDamagePercentLong * 0.25)
  );
  const nextWarAdvantageScore = normalizeWarScore(
    resolveWarAdvantageScore(faction, nextShortWindowWarScore, relativeStrength)
  );
  const shortWindowWarScore = shouldEvaluate ? nextShortWindowWarScore : previous.shortWindowWarScore;
  const longWindowWarScore = shouldEvaluate ? nextLongWindowWarScore : previous.longWindowWarScore;
  const combinedWarScore = normalizeWarScore((longWindowWarScore * 0.6) + (shortWindowWarScore * 0.4));
  const warAdvantageLevel = shouldEvaluate
    ? mapWarAdvantageLevel(nextWarAdvantageScore)
    : previous.warAdvantageLevel;
  const currentWarExitPressure = Math.max(
    0,
    (faction.recentOutgoingCoercionPressureLong * 0.7)
      + (faction.recentOutgoingDamagePercentLong * 0.25)
      - (faction.recentIncomingCoercionPressureShort * 0.4)
  );
  const appliedLosingWarDecay = shouldEvaluate
    && faction.currentStatus === DiplomaticStatus.WAR
    && warAdvantageLevel <= -1;

  return {
    recentOutgoingCoercionPressure: faction.recentOutgoingCoercionPressureShort,
    recentIncomingCoercionPressure: faction.recentIncomingCoercionPressureShort,
    shortWindowWarScore,
    longWindowWarScore,
    combinedWarScore,
    warAdvantageLevel,
    currentWarExitPressure,
    lastWarEvaluationTurn: shouldEvaluate ? context.snapshot.turn : previous.lastWarEvaluationTurn,
    appliedLosingWarDecay
  };
}

function resolveWarAdvantageScore(
  faction: BotStrategicDiplomaticFactionSnapshot,
  shortWindowWarScore: number,
  relativeStrength: number
): number {
  const outgoingShipLossValue = Math.max(0, faction.recentOutgoingShipLossValueShort);
  const incomingShipLossValue = Math.max(0, faction.recentIncomingShipLossValueShort);
  const shipLossRatio = (outgoingShipLossValue + 1) / (incomingShipLossValue + 1);
  const shipLossDelta = outgoingShipLossValue - incomingShipLossValue;
  const shipRatioScore = resolveShipLossRatioScore(shipLossRatio);
  const shipDeltaScore = Math.max(-30, Math.min(30, Math.round(shipLossDelta / 1500)));
  const structuralDamageScore = Math.max(
    -30,
    Math.min(
      30,
      Math.round(
        (faction.recentOutgoingDamagePercentShort * 1.7)
        - (faction.recentIncomingDamagePercentShort * 1.7)
      )
    )
  );
  const plunderScore = Math.max(
    -12,
    Math.min(
      12,
      Math.round(
        (faction.recentOutgoingPlunderValueShort - faction.recentIncomingPlunderValueShort)
        / 4000
      )
    )
  );
  const legacyScore = Math.round((shortWindowWarScore * 0.35) + (relativeStrength * 0.1));

  return shipRatioScore + shipDeltaScore + structuralDamageScore + plunderScore + legacyScore;
}

function resolveShipLossRatioScore(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return 0;
  }
  if (ratio >= 4) {
    return 42;
  }
  if (ratio >= 2) {
    return 30;
  }
  if (ratio >= 1.2) {
    return 16;
  }
  if (ratio <= 0.25) {
    return -42;
  }
  if (ratio <= 0.5) {
    return -30;
  }
  if (ratio <= 0.83) {
    return -16;
  }
  return 0;
}

function mapWarAdvantageLevel(score: number): -2 | -1 | 0 | 1 | 2 {
  if (score <= -60) {
    return -2;
  }
  if (score <= WAR_ADVANTAGE_NEGATIVE_THRESHOLD) {
    return -1;
  }
  if (score >= 60) {
    return 2;
  }
  if (score >= WAR_ADVANTAGE_POSITIVE_THRESHOLD) {
    return 1;
  }
  return 0;
}

function resolveOutgoingShipLossHostilityRelief(shipLossValue: number): number {
  if (shipLossValue <= 0) {
    return 0;
  }

  return Math.min(18, Math.round(shipLossValue / 2500));
}

function resolveOutgoingPlunderHostilityRelief(
  plunderValue: number,
  averageDevelopedIncomeValue: number
): number {
  if (averageDevelopedIncomeValue <= 0 || plunderValue < (averageDevelopedIncomeValue * 2)) {
    return 0;
  }

  return Math.min(14, Math.round(plunderValue / Math.max(1, averageDevelopedIncomeValue * 1.5)));
}

function resolveIncomingPlunderHostilityDelta(
  plunderValue: number,
  averageDevelopedIncomeValue: number,
  warAdvantageLevel: -2 | -1 | 0 | 1 | 2
): number {
  if (averageDevelopedIncomeValue <= 0 || plunderValue < (averageDevelopedIncomeValue * 2)) {
    return 0;
  }

  const magnitude = Math.min(14, Math.round(plunderValue / Math.max(1, averageDevelopedIncomeValue * 1.5)));
  return warAdvantageLevel < 0 ? -magnitude : magnitude;
}

function normalizeWarScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(-100, Math.min(100, Math.round(value)));
}

function maxTurn(left: number | null, right: number | null): number | null {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return Math.max(left, right);
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
  warState: DiplomaticWarState,
  openedWarTargetLedger: OpenedWarTargetLedgerMap
): {
  relocationRequests: RelocationMissionRequest[];
  attackRequests: AttackMissionRequest[];
  supportRequests: SupportMissionRequest[];
  shipNeeds: WarShipNeedRequest[];
  debug: {
    bestBreakScore: number | null;
    bestRaidScore: number | null;
    breakPreferred: boolean | null;
    postBreakRaidCap: number;
    raidPauseThreshold: number | null;
    averageWarAdvantageLevel: -2 | -1 | 0 | 1 | 2 | null;
  };
} {
  if (availableFleetSlots <= 0) {
    return {
      relocationRequests: [],
      attackRequests: [],
      supportRequests: [],
      shipNeeds: [],
      debug: {
        bestBreakScore: null,
        bestRaidScore: null,
        breakPreferred: null,
        postBreakRaidCap: 0,
        raidPauseThreshold: null,
        averageWarAdvantageLevel: null
      }
    };
  }

  const attackShare = resolveAttackShareForWarState(warState);
  const hasActiveWar = factions.some((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR);
  let attackBudget = Math.min(
    availableFleetSlots,
    Math.max(0, Math.round((availableFleetSlots * attackShare) / 100))
  );
  const relocationRequests: RelocationMissionRequest[] = [];
  const preBreakPlanning = attackBudget > 0
    ? createPrimaryWarBreakCombatPlanning(context, factions)
    : null;
  const attackRequests: AttackMissionRequest[] = [];
  const blockedNeeds: WarShipNeedRequest[] = [];
  if (preBreakPlanning?.relocationRequest && relocationRequests.length <= 0) {
    relocationRequests.push(preBreakPlanning.relocationRequest);
  }
  if (preBreakPlanning?.attackRequest && attackRequests.length < attackBudget) {
    attackRequests.push(preBreakPlanning.attackRequest);
  }
  if (preBreakPlanning?.shipNeed) {
    blockedNeeds.push(preBreakPlanning.shipNeed);
  }

  attackBudget = Math.max(0, attackBudget - attackRequests.length);
  const supportCap = Math.max(
    0,
    availableFleetSlots - attackRequests.length - relocationRequests.length - attackBudget
  );
  const reservedTargetKey = preBreakPlanning?.reservedTargetKey ?? null;
  const attackCandidates = createAttackMissionCandidates(context, factions, hasActiveWar, reservedTargetKey)
    .sort((left, right) => right.score - left.score || left.travelTurns - right.travelTurns);
  const existingBreakAttackCount = attackRequests.filter((request) => request.phase === 'DIRECT').length;
  const breakAttackCap = Math.min(
    Math.max(0, ACTIVE_BREAK_TARGET_CAP - existingBreakAttackCount),
    Math.max(0, attackBudget)
  );
  const postBreakRaidCandidates = createPostBreakRaidMissionRequests(
    context,
    factions,
    openedWarTargetLedger,
    hasActiveWar
  ).sort((left, right) => right.score - left.score || left.travelTurns - right.travelTurns);
  const averageWarAdvantageLevel = resolveAverageWarAdvantageLevel(factions);
  const postBreakRaidCap = Math.min(
    resolveActiveOpenedWarTargetCap(context, factions, averageWarAdvantageLevel),
    Math.max(0, attackBudget)
  );
  const bestBreakScore = attackCandidates[0]?.score ?? null;
  const bestRaidScore = postBreakRaidCandidates[0]?.score ?? null;
  const breakPreferred = resolveBreakPreferredAgainstRaid(bestBreakScore, bestRaidScore);
  const selectedRaidTargetPlayerIds = new Set<number>();
  let breakIndex = 0;
  let raidIndex = 0;
  let selectedBreakCount = 0;
  let selectedRaidCount = 0;

  while (attackBudget > 0) {
    const nextBreak = selectedBreakCount < breakAttackCap
      ? attackCandidates[breakIndex] ?? null
      : null;
    let nextRaid = selectedRaidCount < postBreakRaidCap
      ? postBreakRaidCandidates[raidIndex] ?? null
      : null;
    while (nextRaid && selectedRaidTargetPlayerIds.has(nextRaid.faction.faction.playerId)) {
      raidIndex += 1;
      nextRaid = selectedRaidCount < postBreakRaidCap
        ? postBreakRaidCandidates[raidIndex] ?? null
        : null;
    }
    if (!nextBreak && !nextRaid) {
      break;
    }

    if (shouldSelectRaidCandidate(nextBreak, nextRaid)) {
      attackRequests.push(nextRaid!);
      selectedRaidTargetPlayerIds.add(nextRaid!.faction.faction.playerId);
      selectedRaidCount += 1;
      raidIndex += 1;
      attackBudget -= 1;
      continue;
    }
    if (!nextBreak) {
      break;
    }

    attackRequests.push(nextBreak);
    selectedBreakCount += 1;
    breakIndex += 1;
    attackBudget -= 1;
  }

  const supportCandidates = createSupportMissionCandidates(context, factions)
    .sort((left, right) => right.score - left.score || left.travelTurns - right.travelTurns);
  const supportRequests = supportCandidates.slice(0, Math.max(0, supportCap));
  blockedNeeds.push(
    ...createBlockedAttackShipNeeds(context, factions, attackRequests, hasActiveWar, reservedTargetKey),
    ...createBlockedSupportShipNeeds(context, factions, supportRequests)
  );

  return {
    relocationRequests,
    attackRequests,
    supportRequests,
    shipNeeds: selectTopWarShipNeedsPerPlanet(blockedNeeds),
    debug: {
      bestBreakScore,
      bestRaidScore,
      breakPreferred,
      postBreakRaidCap,
      raidPauseThreshold: averageWarAdvantageLevel === null
        ? null
        : resolveOpenedWarRaidPauseThreshold(averageWarAdvantageLevel),
      averageWarAdvantageLevel
    }
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
      if (!isBombardmentEscalationUnlocked(faction, targetPlanet)) {
        continue;
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
    + resolveSharedAttackUrgencyModifier(faction)
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
  const missionType = resolveAllowedBombardmentMissionType(faction, targetPlanet);
  if (missionType === null) {
    return null;
  }
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

function resolveAllowedBombardmentMissionType(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): FleetMissionType.BOMBARD | FleetMissionType.SIEGE | null {
  if (faction.hostilityScore < BOMBARD_HOSTILITY_THRESHOLD) {
    return null;
  }
  if (
    targetPlanet.totalShipsAmount <= 0
    && targetPlanet.totalDefencesAmount <= 0
    && faction.hostilityScore >= SIEGE_HOSTILITY_THRESHOLD
  ) {
    return FleetMissionType.SIEGE;
  }
  return FleetMissionType.BOMBARD;
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
  const missionType = resolveAllowedBombardmentMissionType(faction, targetPlanet);
  if (missionType === null) {
    return null;
  }
  const requiredStrength = resolveBombardmentRequiredStrength(targetPlanet, missionType);
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

function isBombardmentEscalationUnlocked(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): boolean {
  return resolveAllowedBombardmentMissionType(faction, targetPlanet) !== null;
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

  const missionType = resolveAllowedBombardmentMissionType(faction, targetPlanet);
  if (missionType === null) {
    return null;
  }
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

function resolveDeterministicHash(seed: string): number {
  let hash = 0;
  for (const character of seed) {
    hash = ((hash * 31) + character.charCodeAt(0)) % 1000003;
  }
  return hash;
}

function resolveDeterministicFloatInRange(seed: string, min: number, max: number): number {
  const normalizedMin = Math.min(min, max);
  const normalizedMax = Math.max(min, max);
  if (normalizedMin === normalizedMax) {
    return normalizedMin;
  }
  const hash = resolveDeterministicHash(seed);
  const fraction = (hash % 10000) / 10000;
  return normalizedMin + ((normalizedMax - normalizedMin) * fraction);
}

function resolveDeterministicIntInRange(seed: string, min: number, max: number): number {
  const normalizedMin = Math.min(min, max);
  const normalizedMax = Math.max(min, max);
  if (normalizedMin === normalizedMax) {
    return normalizedMin;
  }
  const span = Math.max(1, (normalizedMax - normalizedMin) + 1);
  return normalizedMin + (resolveDeterministicHash(seed) % span);
}

function resolveDeterministicTieDecision(seed: string, threshold = 0.5): boolean {
  const normalizedThreshold = Math.max(0, Math.min(1, threshold));
  const roll = resolveDeterministicFloatInRange(seed, 0, 1);
  return roll <= normalizedThreshold;
}

function createPrimaryWarBreakCombatPlanning(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): {
  reservedTargetKey: string | null;
  relocationRequest: RelocationMissionRequest | null;
  attackRequest: AttackMissionRequest | null;
  shipNeed: WarShipNeedRequest | null;
} | null {
  const selection = resolvePrimaryWarBreakTargetSelection(context, factions);
  if (!selection) {
    context.memory.strategicDiplomatic.primaryWarBreakTarget = null;
    return null;
  }

  const directAttackPlan = createConcentratedDirectAttackPlan(context, selection);
  const relocationPlan = createPreBreakRelocationPlan(context, selection);
  const reservedTargetKey = toCoordinatesKey(selection.targetPlanet.coordinates);
  const attackRequest = resolvePrimaryWarBreakAttackRequest(selection, directAttackPlan, relocationPlan);
  if (attackRequest) {
    return {
      reservedTargetKey,
      relocationRequest: null,
      attackRequest,
      shipNeed: null
    };
  }

  if (relocationPlan) {
    return {
      reservedTargetKey,
      relocationRequest: relocationPlan,
      attackRequest: null,
      shipNeed: null
    };
  }

  const fallbackRelocationPlan = createAnyPreBreakRelocationPlan(context, selection);
  if (fallbackRelocationPlan) {
    return {
      reservedTargetKey,
      relocationRequest: fallbackRelocationPlan,
      attackRequest: null,
      shipNeed: null
    };
  }

  return {
    reservedTargetKey,
    relocationRequest: null,
    attackRequest: null,
    shipNeed: createPrimaryWarBreakShipNeed(context, selection)
  };
}

function resolvePrimaryWarBreakTargetSelection(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): PreBreakTargetSelection | null {
  const candidates = factions
    .filter((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR)
    .flatMap((faction) =>
      faction.faction.knownPlanets
        .filter((planet) => hasPreBreakAttackableIntel(planet))
        .map((targetPlanet) => createPreBreakTargetSelection(context, faction, targetPlanet))
        .filter((entry): entry is PreBreakTargetSelection => entry !== null)
    )
    .sort((left, right) =>
      (right.targetValue - right.expectedLosses) - (left.targetValue - left.expectedLosses)
      || right.targetValue - left.targetValue
      || left.targetPlanet.coordinates.x - right.targetPlanet.coordinates.x
      || left.targetPlanet.coordinates.y - right.targetPlanet.coordinates.y
      || left.targetPlanet.coordinates.z - right.targetPlanet.coordinates.z
    );
  if (candidates.length <= 0) {
    context.memory.strategicDiplomatic.primaryWarBreakTarget = null;
    return null;
  }

  const existing = context.memory.strategicDiplomatic.primaryWarBreakTarget;
  const persisted = existing
    ? candidates.find((candidate) => isPrimaryWarBreakTargetStillValid(context, existing, candidate))
    : null;
  if (persisted) {
    return persisted;
  }

  const selected = candidates[0] ?? null;
  if (!selected) {
    context.memory.strategicDiplomatic.primaryWarBreakTarget = null;
    return null;
  }

  const holdTurns = resolveDeterministicIntInRange(
    `war-break-hold:${selected.faction.faction.playerId}:${reservedPrimaryTargetKey(selected.targetPlanet)}`,
    PRIMARY_WAR_BREAK_MIN_HOLD_TURNS,
    PRIMARY_WAR_BREAK_MAX_HOLD_TURNS
  );
  const valueLossMultiplier = resolveDeterministicFloatInRange(
    `war-break-margin:${selected.faction.faction.playerId}:${reservedPrimaryTargetKey(selected.targetPlanet)}`,
    PRIMARY_WAR_BREAK_MIN_VALUE_MULTIPLIER,
    PRIMARY_WAR_BREAK_MAX_VALUE_MULTIPLIER
  );
  context.memory.strategicDiplomatic.primaryWarBreakTarget = {
    targetPlayerId: selected.faction.faction.playerId,
    coordinates: { ...selected.targetPlanet.coordinates },
    holdUntilTurn: context.snapshot.turn + holdTurns,
    valueLossMultiplier
  };
  return selected;
}

function createPreBreakTargetSelection(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): PreBreakTargetSelection | null {
  const targetStrength = estimateDiplomaticTargetStrength(targetPlanet);
  const requiredStrength = Math.max(1, Math.ceil(targetStrength * resolveDiplomaticAttackMultiplier(faction, targetPlanet)));
  const targetValue = estimatePreBreakTargetValue(faction, targetPlanet);
  const expectedLosses = estimatePreBreakExpectedLosses(context, faction, targetPlanet, requiredStrength);
  if (expectedLosses <= 0) {
    return {
      faction,
      targetPlanet,
      targetValue,
      expectedLosses: 1,
      requiredStrength,
      targetStrength
    };
  }
  const thresholdMultiplier = context.memory.strategicDiplomatic.primaryWarBreakTarget
    && context.memory.strategicDiplomatic.primaryWarBreakTarget.targetPlayerId === faction.faction.playerId
    && toCoordinatesKey(context.memory.strategicDiplomatic.primaryWarBreakTarget.coordinates) === toCoordinatesKey(targetPlanet.coordinates)
    ? context.memory.strategicDiplomatic.primaryWarBreakTarget.valueLossMultiplier
    : resolveDeterministicFloatInRange(
      `war-break-margin:${faction.faction.playerId}:${reservedPrimaryTargetKey(targetPlanet)}`,
      PRIMARY_WAR_BREAK_MIN_VALUE_MULTIPLIER,
      PRIMARY_WAR_BREAK_MAX_VALUE_MULTIPLIER
    );
  return targetValue >= (expectedLosses * thresholdMultiplier)
    ? {
      faction,
      targetPlanet,
      targetValue,
      expectedLosses,
      requiredStrength,
      targetStrength
    }
    : null;
}

function isPrimaryWarBreakTargetStillValid(
  context: BotSubsystemContext,
  existing: BotMemoryV2StrategicDiplomaticPrimaryWarBreakTarget,
  candidate: PreBreakTargetSelection
): boolean {
  if (context.snapshot.turn > existing.holdUntilTurn) {
    return false;
  }
  if (existing.targetPlayerId !== candidate.faction.faction.playerId) {
    return false;
  }
  if (toCoordinatesKey(existing.coordinates) !== toCoordinatesKey(candidate.targetPlanet.coordinates)) {
    return false;
  }
  if (candidate.faction.faction.currentStatus !== DiplomaticStatus.WAR) {
    return false;
  }

  const reachableStrength = estimateReachableConcentratedStrength(context, candidate);
  if (reachableStrength < candidate.requiredStrength) {
    return false;
  }

  return candidate.targetValue >= (candidate.expectedLosses * existing.valueLossMultiplier);
}

function estimatePreBreakTargetValue(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  const shipsValue = targetPlanet.totalShipsAmount * 32;
  const defencesValue = targetPlanet.totalDefencesAmount * 26;
  const developmentValue = targetPlanet.averageBuildingLevel * 42;
  const sharedPressure = resolveSharedAttackUrgencyModifier(faction);
  const diplomaticPressure = (faction.hostilityScore * 2.2)
    + (faction.faction.recentBattleReportCount * 18)
    + sharedPressure
    + (faction.statusPriorityWeight * 3.5);
  return Math.max(1, Math.round(shipsValue + defencesValue + developmentValue + diplomaticPressure));
}

function estimatePreBreakExpectedLosses(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  requiredStrength: number
): number {
  const bestAvailableStrength = Math.max(1, estimateBestAvailableCombatStrength(context, targetPlanet.coordinates));
  const targetStrength = Math.max(1, estimateDiplomaticTargetStrength(targetPlanet));
  const ratioPenalty = Math.max(0.55, Math.min(1.8, targetStrength / bestAvailableStrength));
  const intelPenalty = Math.max(0.75, 1.15 - (Math.min(14, targetPlanet.intelDepth) / 28));
  const confidencePenalty = Math.max(0.8, 1.1 - (faction.confidence / 4));
  const battlePressure = 1 + Math.min(0.35, targetPlanet.recentBattleReportCount * 0.04);
  return Math.max(
    1,
    Math.round(requiredStrength * ratioPenalty * intelPenalty * confidencePenalty * battlePressure * 0.58)
  );
}

function estimateReachableConcentratedStrength(
  context: BotSubsystemContext,
  selection: PreBreakTargetSelection
): number {
  const stagingPlanet = resolveBestDiplomaticStagingPlanet(context, selection.targetPlanet.coordinates);
  if (!stagingPlanet) {
    return 0;
  }

  const directDistance = calculateTravelDistance(stagingPlanet.coordinates, selection.targetPlanet.coordinates);
  let totalStrength = selectCombatShipsForStrength(stagingPlanet, Number.MAX_SAFE_INTEGER, directDistance).combatStrength;
  for (const originPlanet of context.snapshot.planets) {
    if (toCoordinatesKey(originPlanet.coordinates) === toCoordinatesKey(stagingPlanet.coordinates)) {
      continue;
    }
    const moveDistance = calculateTravelDistance(originPlanet.coordinates, stagingPlanet.coordinates);
    totalStrength += selectCombatShipsForStrength(originPlanet, Number.MAX_SAFE_INTEGER, moveDistance).combatStrength;
  }
  return totalStrength;
}

function createConcentratedDirectAttackPlan(
  context: BotSubsystemContext,
  selection: PreBreakTargetSelection
): AttackMissionRequest | null {
  const validPlans = context.snapshot.planets
    .map((originPlanet) => {
      const distance = calculateTravelDistance(originPlanet.coordinates, selection.targetPlanet.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, distance);
      const combatSelection = selectCombatShipsForStrength(originPlanet, selection.requiredStrength, distance);
      if (combatSelection.ships.length <= 0 || combatSelection.combatStrength < selection.requiredStrength) {
        return null;
      }

      return {
        kind: 'ATTACK',
        phase: 'DIRECT',
        faction: selection.faction,
        targetPlanet: selection.targetPlanet,
        originPlanet,
        ships: combatSelection.ships,
        requiredStrength: selection.requiredStrength,
        selectedStrength: combatSelection.combatStrength,
        travelDistance: distance,
        travelTurns,
        score: Math.max(
          1,
          560
          + Math.round(selection.targetValue / 6)
          - Math.round(selection.expectedLosses / 8)
          - (travelTurns * 10)
        ),
        scoutOnly: false,
        estimatedPlunder: 0,
        cargoCapacity: resolveSelectionCargoCapacity(combatSelection.ships),
        ambushRisk: 0
      } satisfies AttackMissionRequest;
    })
    .filter((entry): entry is AttackMissionRequest => entry !== null)
    .sort((left, right) =>
      right.selectedStrength - left.selectedStrength
      || right.score - left.score
      || left.travelTurns - right.travelTurns
    );
  return validPlans[0] ?? null;
}

function createPreBreakRelocationPlan(
  context: BotSubsystemContext,
  selection: PreBreakTargetSelection
): RelocationMissionRequest | null {
  const stagingPlanet = resolveBestDiplomaticStagingPlanet(context, selection.targetPlanet.coordinates);
  if (!stagingPlanet) {
    return null;
  }
  const stagingDistance = calculateTravelDistance(stagingPlanet.coordinates, selection.targetPlanet.coordinates);
  const stagingSelection = selectCombatShipsForStrength(stagingPlanet, selection.requiredStrength, stagingDistance);
  if (stagingSelection.combatStrength >= selection.requiredStrength) {
    return null;
  }

  const relocationCandidates = createPreBreakRelocationCandidates(context, selection, stagingPlanet);
  if (relocationCandidates[0]) {
    return relocationCandidates[0];
  }

  const fallbackStagingPlanets = context.snapshot.planets
    .filter((planet) => toCoordinatesKey(planet.coordinates) !== toCoordinatesKey(stagingPlanet.coordinates))
    .sort((left, right) =>
      calculateTravelDistance(left.coordinates, selection.targetPlanet.coordinates)
      - calculateTravelDistance(right.coordinates, selection.targetPlanet.coordinates)
      || right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
    );
  for (const fallbackStagingPlanet of fallbackStagingPlanets) {
    const fallbackCandidates = createPreBreakRelocationCandidates(context, selection, fallbackStagingPlanet);
    if (fallbackCandidates[0]) {
      return fallbackCandidates[0];
    }
  }

  return null;
}

function createPreBreakRelocationCandidates(
  context: BotSubsystemContext,
  selection: PreBreakTargetSelection,
  stagingPlanet: BotPlanetSnapshot
): RelocationMissionRequest[] {
  return context.snapshot.planets
    .filter((originPlanet) => toCoordinatesKey(originPlanet.coordinates) !== toCoordinatesKey(stagingPlanet.coordinates))
    .map((originPlanet) => {
      const moveDistance = calculateTravelDistance(originPlanet.coordinates, stagingPlanet.coordinates);
      const moveSelection = selectCombatShipsForStrength(originPlanet, Number.MAX_SAFE_INTEGER, moveDistance);
      if (moveSelection.ships.length <= 0 || moveSelection.combatStrength <= 0) {
        return null;
      }
      const useJumpGate = canUseOwnJumpGate(originPlanet, stagingPlanet.coordinates, context.snapshot.planets);
      const travelTurns = useJumpGate ? 1 : resolveTravelTurns(originPlanet, moveDistance);
      return {
        missionType: FleetMissionType.MOVE,
        phase: 'PRE_BREAK_CONCENTRATION',
        faction: selection.faction,
        targetPlanet: selection.targetPlanet,
        originPlanet,
        stagingPlanet,
        ships: moveSelection.ships,
        travelDistance: moveDistance,
        travelTurns,
        score: Math.max(
          1,
          540
          + Math.round(selection.targetValue / 8)
          + Math.round(moveSelection.combatStrength / 2.5)
          - (travelTurns * 12)
          - (calculateTravelDistance(stagingPlanet.coordinates, selection.targetPlanet.coordinates) * 5)
        ),
        moveRole: 'WAR_BREAK_STAGING',
        useJumpGate
      } satisfies RelocationMissionRequest;
    })
    .filter((entry): entry is RelocationMissionRequest => entry !== null)
    .sort((left, right) =>
      right.ships.reduce((sum, ship) => sum + (estimateShipCombatPower(ship.type) * ship.undamagedAmount), 0)
      - left.ships.reduce((sum, ship) => sum + (estimateShipCombatPower(ship.type) * ship.undamagedAmount), 0)
      || right.score - left.score
      || left.travelTurns - right.travelTurns
    );
}

function createAnyPreBreakRelocationPlan(
  context: BotSubsystemContext,
  selection: PreBreakTargetSelection
): RelocationMissionRequest | null {
  const stagingCandidates = context.snapshot.planets
    .slice()
    .sort((left, right) =>
      calculateTravelDistance(left.coordinates, selection.targetPlanet.coordinates)
      - calculateTravelDistance(right.coordinates, selection.targetPlanet.coordinates)
      || right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
      || left.name.localeCompare(right.name)
    );

  for (const stagingPlanet of stagingCandidates) {
    const candidate = context.snapshot.planets
      .filter((originPlanet) => toCoordinatesKey(originPlanet.coordinates) !== toCoordinatesKey(stagingPlanet.coordinates))
      .map((originPlanet) => {
        const moveDistance = calculateTravelDistance(originPlanet.coordinates, stagingPlanet.coordinates);
        const moveSelection = selectCombatShipsForStrength(originPlanet, Number.MAX_SAFE_INTEGER, moveDistance);
        if (moveSelection.ships.length <= 0 || moveSelection.combatStrength <= 0) {
          return null;
        }
        const useJumpGate = canUseOwnJumpGate(originPlanet, stagingPlanet.coordinates, context.snapshot.planets);
        const travelTurns = useJumpGate ? 1 : resolveTravelTurns(originPlanet, moveDistance);
        return {
          missionType: FleetMissionType.MOVE,
          phase: 'PRE_BREAK_CONCENTRATION',
          faction: selection.faction,
          targetPlanet: selection.targetPlanet,
          originPlanet,
          stagingPlanet,
          ships: moveSelection.ships,
          travelDistance: moveDistance,
          travelTurns,
          score: Math.max(1, 500 + Math.round(moveSelection.combatStrength / 2) - (travelTurns * 10)),
          moveRole: 'WAR_BREAK_STAGING',
          useJumpGate
        } satisfies RelocationMissionRequest;
      })
      .filter((entry): entry is RelocationMissionRequest => entry !== null)
      .sort((left, right) =>
        right.score - left.score
        || left.travelTurns - right.travelTurns
      )[0] ?? null;

    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function resolvePrimaryWarBreakAttackRequest(
  selection: PreBreakTargetSelection,
  directAttackPlan: AttackMissionRequest | null,
  relocationPlan: RelocationMissionRequest | null
): AttackMissionRequest | null {
  if (!directAttackPlan) {
    return null;
  }
  if (!relocationPlan) {
    return directAttackPlan;
  }

  const directOutcome = directAttackPlan.selectedStrength - selection.expectedLosses;
  const relocationStrength = relocationPlan.ships
    .reduce((sum, ship) => sum + (estimateShipCombatPower(ship.type) * ship.undamagedAmount), 0);
  const improvedOutcome = Math.max(directOutcome, (directAttackPlan.selectedStrength + relocationStrength) - selection.expectedLosses);
  const improvementRatio = directOutcome > 0
    ? Math.max(0, (improvedOutcome - directOutcome) / directOutcome)
    : 1;
  if (improvementRatio >= PRIMARY_WAR_BREAK_NEAR_EQUAL_IMPROVEMENT_RATIO) {
    return null;
  }

  return resolveDeterministicTieDecision(
    `war-break-direct-vs-move:${selection.faction.faction.playerId}:${reservedPrimaryTargetKey(selection.targetPlanet)}`,
    0.5
  )
    ? directAttackPlan
    : null;
}

function createPrimaryWarBreakShipNeed(
  context: BotSubsystemContext,
  selection: PreBreakTargetSelection
): WarShipNeedRequest | null {
  const preferredOrigin = resolveBestMilitaryOrigin(context, selection.targetPlanet.coordinates);
  if (!preferredOrigin) {
    return null;
  }
  const combatType = resolveBestProducibleCombatShipType(context);
  if (!combatType) {
    return null;
  }

  const reachableStrength = estimateReachableConcentratedStrength(context, selection);
  return {
    originPlanet: preferredOrigin,
    shipType: combatType,
    amount: Math.max(
      1,
      Math.ceil(
        Math.max(0, selection.requiredStrength - reachableStrength)
        / Math.max(1, estimateShipCombatPower(combatType))
      )
    ),
    score: 520 + selection.requiredStrength,
    reason: 'Need more concentrated war ships for a primary diplomatic war-break target.',
    targetCoordinates: { ...selection.targetPlanet.coordinates },
    needKind: 'MOVE'
  };
}

function reservedPrimaryTargetKey(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): string {
  return toCoordinatesKey(targetPlanet.coordinates);
}

function hasPreBreakAttackableIntel(
  planet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): boolean {
  return planet.intelDepth > 0
    && (planet.totalShipsAmount > 0 || planet.totalDefencesAmount > 0);
}

function createAttackMissionCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  hasActiveWar: boolean,
  reservedTargetKey: string | null = null
): AttackMissionRequest[] {
  const requests: AttackMissionRequest[] = [];

  for (const faction of factions) {
    if (!isFactionEligibleForDiplomaticAttack(faction)) {
      continue;
    }

    for (const targetPlanet of faction.faction.knownPlanets) {
      if (reservedTargetKey && reservedTargetKey === toCoordinatesKey(targetPlanet.coordinates)) {
        continue;
      }
      if (!hasPreBreakAttackableIntel(targetPlanet)) {
        continue;
      }

      const attackPlan = createAttackPlanForTarget(context, faction, targetPlanet, hasActiveWar);
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
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  hasActiveWar: boolean
): AttackMissionRequest | null {
  const sharedAttackModifier = resolveSharedAttackUrgencyModifier(faction);
  const lowConfidence = faction.confidence < 0.55 || targetPlanet.intelDepth < 8;
  if (lowConfidence) {
    return createScoutAttackPlanForTarget(context, faction, targetPlanet, hasActiveWar);
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
        phase: 'DIRECT',
        targetPlanet,
        originPlanet,
        ships: selection.ships,
        requiredStrength,
        selectedStrength: selection.combatStrength,
        travelDistance: distance,
        travelTurns,
        score: applyActiveWarNeutralPenalty(
          Math.max(
            1,
            500
            + Math.round((requiredStrength * 1.4) - (travelTurns * 9) + (Math.min(24, faction.relativeStrength)))
            + sharedAttackModifier
          ),
          faction,
          hasActiveWar
        ),
        scoutOnly: false,
        estimatedPlunder: 0,
        cargoCapacity: resolveSelectionCargoCapacity(selection.ships),
        ambushRisk: 0
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
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  hasActiveWar: boolean
): AttackMissionRequest | null {
  const sharedAttackModifier = resolveSharedAttackUrgencyModifier(faction);
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
          phase: 'DIRECT',
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
          score: applyActiveWarNeutralPenalty(
            Math.max(1, 360 + Math.round(faction.statusPriorityWeight * 2.5) - Math.round(distance * 0.8) + sharedAttackModifier),
            faction,
            hasActiveWar
          ),
          scoutOnly: true,
          estimatedPlunder: 0,
          cargoCapacity: SHIP_BLUEPRINTS.get(shipType)?.cargoCapacity ?? 0,
          ambushRisk: 0
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

function applyActiveWarNeutralPenalty(
  score: number,
  faction: EvaluatedFaction,
  hasActiveWar: boolean
): number {
  if (faction.faction.currentStatus !== DiplomaticStatus.NEUTRAL || !hasActiveWar) {
    return Math.max(1, Math.round(score));
  }

  return Math.max(1, Math.round(score * ACTIVE_WAR_NEUTRAL_ATTACK_SCORE_MULTIPLIER));
}

function resolveSharedAttackUrgencyModifier(faction: EvaluatedFaction): number {
  return Math.max(
    0,
    Math.round(
      Math.min(
        90,
        (faction.sharedHostilityPressureShort * 1.8)
        + (faction.sharedHostilityPressureLong * 0.6)
      )
    )
  );
}

function resolveSharedSupportUrgencyModifier(
  faction: EvaluatedFaction,
  targetCoordinates: { x: number; y: number; z: number }
): number {
  const targetKey = toCoordinatesKey(targetCoordinates);
  return Math.max(
    0,
    Math.round(
      Math.min(
        120,
        faction.sharedHostileEvents
          .filter((event) => toCoordinatesKey(event.targetCoordinates) === targetKey)
          .reduce((sum, event) => sum + (event.severity * resolveSharedHostilityWeight(event.sharedFromStatus)), 0)
      )
    )
  );
}

function createPostBreakRaidMissionRequests(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  openedWarTargetLedger: OpenedWarTargetLedgerMap,
  hasActiveWar: boolean
): AttackMissionRequest[] {
  const requests: AttackMissionRequest[] = [];
  const activeKeys = new Set<string>();

  for (const faction of factions) {
    const isWarFaction = faction.faction.currentStatus === DiplomaticStatus.WAR;
    let bestFactionRequest: AttackMissionRequest | null = null;
    for (const targetPlanet of faction.faction.knownPlanets) {
      const targetKey = toCoordinatesKey(targetPlanet.coordinates);
      if (!isWarFaction) {
        openedWarTargetLedger.delete(targetKey);
        continue;
      }
      if (!isConfirmedOpenedWarTarget(targetPlanet)) {
        openedWarTargetLedger.delete(targetKey);
        continue;
      }

      const ledgerEntry = updateOpenedWarTargetLedgerEntry(
        context,
        openedWarTargetLedger,
        faction,
        targetPlanet
      );
      activeKeys.add(targetKey);
      const request = createOpenedWarRaidPlanForTarget(context, faction, targetPlanet, ledgerEntry, hasActiveWar);
      if (!request) {
        continue;
      }
      ledgerEntry.preferredRaidOriginCoordinates = { ...request.originPlanet.coordinates };
      ledgerEntry.lastEstimatedPlunderValue = request.estimatedPlunder;
      if (
        !bestFactionRequest
        || request.score > bestFactionRequest.score
        || (request.score === bestFactionRequest.score && request.travelTurns < bestFactionRequest.travelTurns)
      ) {
        bestFactionRequest = request;
      }
    }

    if (bestFactionRequest) {
      requests.push(bestFactionRequest);
    }
  }

  for (const key of [...openedWarTargetLedger.keys()]) {
    if (!activeKeys.has(key)) {
      openedWarTargetLedger.delete(key);
    }
  }

  return requests;
}

function isConfirmedOpenedWarTarget(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): boolean {
  const battleConfirmed = targetPlanet.lastCombatObservationTurn !== null
    && sumTypedCounts(targetPlanet.knownShipCountsByType) <= 0
    && sumTypedCounts(targetPlanet.knownDefenceCountsByType) <= 0;
  const freshSpyConfirmed = targetPlanet.lastRelevantReportAge <= POST_BREAK_ATTACK_CONFIRMATION_REPORT_MAX_AGE
    && targetPlanet.totalShipsAmount <= 0
    && targetPlanet.totalDefencesAmount <= 0;
  return battleConfirmed || freshSpyConfirmed;
}

function isKnownOpenedWarTargetForRefresh(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): boolean {
  return targetPlanet.intelDepth > 0 && (
    (
      sumTypedCounts(targetPlanet.knownShipCountsByType) <= 0
      && sumTypedCounts(targetPlanet.knownDefenceCountsByType) <= 0
    )
    || (
      targetPlanet.totalShipsAmount <= 0
      && targetPlanet.totalDefencesAmount <= 0
    )
  );
}

function updateOpenedWarTargetLedgerEntry(
  context: BotSubsystemContext,
  openedWarTargetLedger: OpenedWarTargetLedgerMap,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry {
  const key = toCoordinatesKey(targetPlanet.coordinates);
  const existing = openedWarTargetLedger.get(key);
  const entry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry = existing ?? {
    targetPlayerId: faction.faction.playerId,
    coordinates: { ...targetPlanet.coordinates },
    lastPostBreakAttackTurn: null,
    recentRaidCount: 0,
    recentRaidTurns: [],
    currentAmbushRiskScore: 0,
    pausedUntilTurn: null,
    preferredRaidOriginCoordinates: null,
    lastEstimatedPlunderValue: 0
  };

  const observedRaidTurn = Math.max(
    targetPlanet.lastCombatObservationTurn ?? 0,
    targetPlanet.lastPlunderTurn ?? 0
  );
  if (observedRaidTurn > 0 && (entry.lastPostBreakAttackTurn === null || observedRaidTurn > entry.lastPostBreakAttackTurn)) {
    entry.lastPostBreakAttackTurn = observedRaidTurn;
    if (!entry.recentRaidTurns.includes(observedRaidTurn)) {
      entry.recentRaidTurns.push(observedRaidTurn);
      entry.recentRaidTurns.sort((left, right) => left - right);
    }
  }

  const windowTurns = resolveOpenedWarRaidWindowTurns(context, entry);
  entry.recentRaidTurns = entry.recentRaidTurns
    .filter((turn) => turn >= context.snapshot.turn - windowTurns)
    .slice(-40);
  entry.recentRaidCount = entry.recentRaidTurns.length;
  entry.currentAmbushRiskScore = resolveOpenedWarTargetAmbushRisk(
    context,
    faction,
    targetPlanet,
    entry
  );
  const pauseThreshold = resolveOpenedWarRaidPauseThreshold(faction.warAdvantageLevel);
  if (entry.currentAmbushRiskScore >= pauseThreshold) {
    const quietTurnRecovery = Math.max(
      1,
      Math.ceil(
        (entry.currentAmbushRiskScore - pauseThreshold + 1)
        / Math.max(1, POST_BREAK_ATTACK_AMBUSH_RISK_DECAY_PER_TURN)
      )
    );
    entry.pausedUntilTurn = Math.max(entry.pausedUntilTurn ?? 0, context.snapshot.turn + quietTurnRecovery);
  } else if (entry.pausedUntilTurn !== null && context.snapshot.turn >= entry.pausedUntilTurn) {
    entry.pausedUntilTurn = null;
  }

  openedWarTargetLedger.set(key, entry);
  return entry;
}

function createOpenedWarRaidPlanForTarget(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  ledgerEntry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  hasActiveWar: boolean
): AttackMissionRequest | null {
  if (faction.faction.currentStatus !== DiplomaticStatus.WAR) {
    return null;
  }
  if (ledgerEntry.pausedUntilTurn !== null && context.snapshot.turn < ledgerEntry.pausedUntilTurn) {
    return null;
  }
  if (isOpenedWarTargetRaidStale(context, targetPlanet)) {
    return null;
  }

  const validPlans = context.snapshot.planets
    .map((originPlanet) => createOpenedWarRaidPlanFromOrigin(
      context,
      faction,
      targetPlanet,
      ledgerEntry,
      originPlanet,
      hasActiveWar
    ))
    .filter((entry): entry is AttackMissionRequest => entry !== null)
    .sort((left, right) =>
      right.score - left.score
      || left.travelTurns - right.travelTurns
      || right.estimatedPlunder - left.estimatedPlunder
    );

  return validPlans[0] ?? null;
}

function isOpenedWarTargetRaidStale(
  context: BotSubsystemContext,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): boolean {
  const lastObservationTurn = resolveOpenedWarTargetLastObservationTurn(targetPlanet, context.snapshot.turn);
  return Math.max(0, context.snapshot.turn - lastObservationTurn) > POST_BREAK_ATTACK_CONFIRMATION_REPORT_MAX_AGE;
}

function createOpenedWarRaidPlanFromOrigin(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  ledgerEntry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  originPlanet: BotPlanetSnapshot,
  hasActiveWar: boolean
): AttackMissionRequest | null {
  const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
  const travelTurns = resolveTravelTurns(originPlanet, distance);
  const riskBand = resolveOpenedWarTargetRiskBand(ledgerEntry.currentAmbushRiskScore);
  const requiredCoverStrength = resolveOpenedWarRaidCoverStrength(riskBand);
  const combatSelection = selectCombatShipsForStrength(originPlanet, requiredCoverStrength, distance);
  if (combatSelection.ships.length <= 0 || combatSelection.combatStrength < requiredCoverStrength) {
    return null;
  }

  const estimatedPlunder = resolveEstimatedOpenedWarPlunder(
    ledgerEntry,
    targetPlanet,
    context.snapshot.turn,
    context.snapshot.turn + travelTurns
  );
  if (estimatedPlunder <= 0) {
    return null;
  }

  const selectionWithCargo = addCargoShipsForOpenedWarRaid(
    originPlanet,
    combatSelection.ships,
    distance,
    estimatedPlunder
  );
  if (selectionWithCargo.cargoCapacity <= 0) {
    return null;
  }

  const totalScore = applyActiveWarNeutralPenalty(
    Math.max(
      1,
      470
      + estimatedPlunder
      + (faction.warAdvantageLevel * 18)
      - (travelTurns * 10)
      - Math.round(ledgerEntry.currentAmbushRiskScore * 1.5)
      - Math.round(distance * 2)
    ),
    faction,
    hasActiveWar
  );

  return {
    kind: 'ATTACK',
    phase: 'POST_BREAK_RAID',
    faction,
    targetPlanet,
    originPlanet,
    ships: selectionWithCargo.ships,
    requiredStrength: requiredCoverStrength,
    selectedStrength: combatSelection.combatStrength,
    travelDistance: distance,
    travelTurns,
    score: totalScore,
    scoutOnly: false,
    estimatedPlunder,
    cargoCapacity: selectionWithCargo.cargoCapacity,
    ambushRisk: ledgerEntry.currentAmbushRiskScore
  };
}

function resolveOpenedWarTargetRiskBand(ambushRisk: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (ambushRisk >= 55) {
    return 'HIGH';
  }
  if (ambushRisk >= 30) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function resolveOpenedWarRaidCoverStrength(
  riskBand: 'LOW' | 'MEDIUM' | 'HIGH'
): number {
  const cruiserPower = Math.max(1, estimateShipCombatPower(ShipType.CRUISER));
  switch (riskBand) {
    case 'HIGH':
      return cruiserPower * 4;
    case 'MEDIUM':
      return cruiserPower * 2;
    case 'LOW':
    default:
      return cruiserPower;
  }
}

function resolveEstimatedOpenedWarPlunder(
  ledgerEntry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  currentTurn: number,
  targetTurn: number
): number {
  const estimatedResources = estimateOpenedWarTargetResourcesAtTurn(ledgerEntry, targetPlanet, currentTurn, targetTurn);
  const plunderPercent = Math.max(0.01, 0.8 - resolveBunkerReductionPercentForLevel(targetPlanet.bunkerLevel));
  return Math.max(
    0,
    Math.floor(
      (estimatedResources.metal * plunderPercent)
      + (estimatedResources.crystal * plunderPercent)
      + (estimatedResources.deuterium * plunderPercent)
    )
  );
}

function estimateOpenedWarTargetResourcesAtTurn(
  ledgerEntry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  currentTurn: number,
  targetTurn: number
): { metal: number; crystal: number; deuterium: number } {
  const baseResources = resolveOpenedWarTargetBaseResources(ledgerEntry, targetPlanet, currentTurn);
  const storageCapacity = targetPlanet.storageCapacity ?? baseResources;
  const income = targetPlanet.income ?? emptyResources();
  const lastObservationTurn = resolveOpenedWarTargetLastObservationTurn(targetPlanet, currentTurn);
  const deltaTurns = Math.max(0, targetTurn - lastObservationTurn);
  return {
    metal: Math.min(storageCapacity.metal, baseResources.metal + (income.metal * deltaTurns)),
    crystal: Math.min(storageCapacity.crystal, baseResources.crystal + (income.crystal * deltaTurns)),
    deuterium: Math.min(storageCapacity.deuterium, baseResources.deuterium + (income.deuterium * deltaTurns))
  };
}

function resolveOpenedWarTargetBaseResources(
  ledgerEntry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  currentTurn: number
): { metal: number; crystal: number; deuterium: number } {
  const reportedResources = targetPlanet.currentResources ?? emptyResources();
  const stolenResources = targetPlanet.latestPlunderedResources ?? emptyResources();
  const storageCapacity = targetPlanet.storageCapacity ?? reportedResources;
  const income = targetPlanet.income ?? emptyResources();
  const reportTurn = resolveOpenedWarTargetReportTurn(targetPlanet, currentTurn);
  if (targetPlanet.lastPlunderTurn !== null && targetPlanet.lastPlunderTurn >= resolveOpenedWarTargetReportTurn(targetPlanet, currentTurn)) {
    const turnsUntilPlunder = Math.max(0, targetPlanet.lastPlunderTurn - reportTurn);
    const estimatedResourcesAtPlunder = {
      metal: Math.min(storageCapacity.metal, reportedResources.metal + (income.metal * turnsUntilPlunder)),
      crystal: Math.min(storageCapacity.crystal, reportedResources.crystal + (income.crystal * turnsUntilPlunder)),
      deuterium: Math.min(storageCapacity.deuterium, reportedResources.deuterium + (income.deuterium * turnsUntilPlunder))
    };
    return {
      metal: Math.max(0, estimatedResourcesAtPlunder.metal - stolenResources.metal),
      crystal: Math.max(0, estimatedResourcesAtPlunder.crystal - stolenResources.crystal),
      deuterium: Math.max(0, estimatedResourcesAtPlunder.deuterium - stolenResources.deuterium)
    };
  }

  if (ledgerEntry.lastEstimatedPlunderValue > 0 && ledgerEntry.lastPostBreakAttackTurn !== null) {
    return reportedResources;
  }

  return reportedResources;
}

function resolveOpenedWarTargetReportTurn(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  currentTurn: number
): number {
  return Math.max(0, currentTurn - Math.max(0, targetPlanet.lastRelevantReportAge));
}

function resolveOpenedWarTargetLastObservationTurn(
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  currentTurn: number
): number {
  if (targetPlanet.lastPlunderTurn !== null) {
    return targetPlanet.lastPlunderTurn;
  }
  if (targetPlanet.lastCombatObservationTurn !== null) {
    return targetPlanet.lastCombatObservationTurn;
  }
  return resolveOpenedWarTargetReportTurn(targetPlanet, currentTurn);
}

function addCargoShipsForOpenedWarRaid(
  originPlanet: BotPlanetSnapshot,
  baseShips: CombatShipSelection['ships'],
  distance: number,
  targetCargoCapacity: number
): { ships: CombatShipSelection['ships']; cargoCapacity: number } {
  const selection = baseShips.map((ship) => ({ ...ship }));
  let currentCargoCapacity = resolveSelectionCargoCapacity(selection);
  if (currentCargoCapacity >= targetCargoCapacity) {
    return {
      ships: selection,
      cargoCapacity: currentCargoCapacity
    };
  }

  const cargoCandidates = Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => {
      const shipType = type as ShipType;
      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      const alreadySelected = selection.find((ship) => ship.type === shipType)?.undamagedAmount ?? 0;
      return {
        type: shipType,
        amount: Math.max(0, (amount ?? 0) - alreadySelected),
        cargoCapacity: blueprint?.cargoCapacity ?? 0,
        isCargo: blueprint?.purposes.has(ShipPurpose.CARGO) ?? false
      };
    })
    .filter((entry) => entry.amount > 0 && entry.cargoCapacity > 0 && entry.isCargo)
    .sort((left, right) =>
      right.cargoCapacity - left.cargoCapacity
      || left.type.localeCompare(right.type)
    );

  for (const candidate of cargoCandidates) {
    while (candidate.amount > 0 && currentCargoCapacity < targetCargoCapacity) {
      const nextSelection = selection.map((ship) => ({ ...ship }));
      const existing = nextSelection.find((ship) => ship.type === candidate.type);
      if (existing) {
        existing.undamagedAmount += 1;
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
      currentCargoCapacity += candidate.cargoCapacity;
      candidate.amount -= 1;
    }
  }

  return {
    ships: selection,
    cargoCapacity: currentCargoCapacity
  };
}

function resolveOpenedWarRaidWindowTurns(
  context: BotSubsystemContext,
  entry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry
): number {
  const preferredOrigin = entry.preferredRaidOriginCoordinates
    ? context.snapshot.planets.find((planet) =>
      toCoordinatesKey(planet.coordinates) === toCoordinatesKey(entry.preferredRaidOriginCoordinates!)
    ) ?? null
    : null;
  const referenceOrigin = preferredOrigin ?? resolveBestMilitaryOrigin(context, entry.coordinates);
  if (!referenceOrigin) {
    return 10;
  }
  const distance = Math.max(
    1,
    calculateTravelDistance(referenceOrigin.coordinates, entry.coordinates)
  );
  const normalizedDistance = Math.max(1, Math.min(11, distance));
  return Math.max(5, Math.min(25, Math.round(5 + (((normalizedDistance - 1) / 10) * 20))));
}

function resolveOpenedWarTargetAmbushRisk(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  entry: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry
): number {
  const quietTurns = entry.lastPostBreakAttackTurn === null
    ? 0
    : Math.max(0, context.snapshot.turn - entry.lastPostBreakAttackTurn);
  const decayedRisk = Math.max(0, entry.currentAmbushRiskScore - (quietTurns * POST_BREAK_ATTACK_AMBUSH_RISK_DECAY_PER_TURN));
  const nearbyCoverage = resolveNearbyHostileCoverage(faction, targetPlanet);
  const evidenceRisk = Math.max(
    0,
    Math.round(faction.strengthEstimate / 12)
    + (entry.recentRaidCount * 12)
    + (targetPlanet.recentBattleReportCount * 9)
    + (nearbyCoverage * 8)
  );
  return Math.max(decayedRisk, evidenceRisk);
}

function resolveNearbyHostileCoverage(
  faction: EvaluatedFaction,
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number]
): number {
  return faction.faction.knownPlanets.reduce((sum, planet) => {
    if (toCoordinatesKey(planet.coordinates) === toCoordinatesKey(targetPlanet.coordinates)) {
      return sum;
    }
    const distance = calculateTravelDistance(planet.coordinates, targetPlanet.coordinates);
    return distance <= 3 ? sum + 1 : sum;
  }, 0);
}

function resolveOpenedWarRaidPauseThreshold(
  warAdvantageLevel: -2 | -1 | 0 | 1 | 2
): number {
  switch (warAdvantageLevel) {
    case -2:
      return 55;
    case -1:
      return 60;
    case 1:
    case 2:
      return 80;
    case 0:
    default:
      return POST_BREAK_ATTACK_AMBUSH_PAUSE_THRESHOLD;
  }
}

function resolveAverageWarAdvantageLevel(
  factions: EvaluatedFaction[]
): -2 | -1 | 0 | 1 | 2 | null {
  const warFactions = factions.filter((faction) => faction.faction.currentStatus === DiplomaticStatus.WAR);
  if (warFactions.length <= 0) {
    return null;
  }
  const average = warFactions.reduce((sum, faction) => sum + faction.warAdvantageLevel, 0) / warFactions.length;
  if (average <= -1.5) {
    return -2;
  }
  if (average < -0.5) {
    return -1;
  }
  if (average >= 1.5) {
    return 2;
  }
  if (average >= 0.5) {
    return 1;
  }
  return 0;
}

function resolveBreakPreferredAgainstRaid(
  bestBreakScore: number | null,
  bestRaidScore: number | null
): boolean | null {
  if (bestBreakScore === null && bestRaidScore === null) {
    return null;
  }
  if (bestBreakScore === null) {
    return false;
  }
  if (bestRaidScore === null) {
    return true;
  }
  return bestRaidScore < (bestBreakScore * POST_BREAK_ATTACK_BREAK_SCORE_PREFERENCE_RATIO);
}

function shouldSelectRaidCandidate(
  breakCandidate: AttackMissionRequest | null,
  raidCandidate: AttackMissionRequest | null
): boolean {
  if (!raidCandidate) {
    return false;
  }
  if (!breakCandidate) {
    return true;
  }
  return raidCandidate.score >= (breakCandidate.score * POST_BREAK_ATTACK_BREAK_SCORE_PREFERENCE_RATIO);
}

function resolveActiveOpenedWarTargetCap(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  averageWarAdvantageLevel: -2 | -1 | 0 | 1 | 2 | null = resolveAverageWarAdvantageLevel(factions)
): number {
  if (averageWarAdvantageLevel === null) {
    return 0;
  }
  const baseCap = Math.max(
    ACTIVE_OPENED_WAR_TARGET_BASE,
    Math.floor(Math.sqrt(Math.max(1, context.snapshot.empire.ownedPlanetCount))) + 1
  );
  if (averageWarAdvantageLevel <= -1) {
    return Math.min(1, baseCap);
  }
  return baseCap;
}

function compareOpenedWarTargetLedgerEntries(
  left: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry,
  right: BotMemoryV2StrategicDiplomaticOpenedWarTargetEntry
): number {
  return left.coordinates.x - right.coordinates.x
    || left.coordinates.y - right.coordinates.y
    || left.coordinates.z - right.coordinates.z;
}

function sumTypedCounts<T extends string>(counts: Partial<Record<T, number>>): number {
  return Object.values(counts).reduce((sum, amount) => sum + Math.max(0, amount ?? 0), 0);
}

function resolveBunkerReductionPercentForLevel(level: number | null): number {
  if (!level || level <= 0) {
    return 0;
  }
  const blueprint = BUILDING_BLUEPRINTS.get(BuildingType.BUNKER_NETWORK);
  const raw = blueprint?.production1[level - 1] ?? 0;
  return Math.max(0, raw) / 100;
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
    if (
      faction.faction.currentStatus !== DiplomaticStatus.ALLIED
      && faction.faction.currentStatus !== DiplomaticStatus.PEACE
    ) {
      continue;
    }

    for (const supportRequest of faction.faction.pendingIncomingSupportRequests) {
      if (supportRequest.supportType !== 'PLANET_REPAIR' && supportRequest.supportType !== 'PLANET_DEFENSE') {
        continue;
      }
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
      if (
        targetPlanet.recentBattleReportCount <= 0
        && resolveSharedSupportUrgencyModifier(faction, targetPlanet.coordinates) <= 0
      ) {
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
  const sharedUrgency = resolveSharedSupportUrgencyModifier(faction, targetPlanet.coordinates);
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
        score: 380 + (targetPlanet.recentBattleReportCount * 18) + sharedUrgency + (needReason === 'EXPLICIT_REQUEST' ? 36 : 0),
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
  const sharedUrgency = resolveSharedSupportUrgencyModifier(faction, targetPlanet.coordinates);
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
        score: 420 + (targetPlanet.recentBattleReportCount * 22) + sharedUrgency + (needReason === 'EXPLICIT_REQUEST' ? 28 : 0),
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
  acceptedRequests: AttackMissionRequest[],
  hasActiveWar: boolean,
  reservedTargetKey: string | null = null
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
      if (acceptedTargets.has(targetKey) || targetKey === reservedTargetKey || !hasPreBreakAttackableIntel(targetPlanet)) {
        continue;
      }

      const blockedNeed = createBlockedAttackShipNeed(context, faction, targetPlanet, hasActiveWar);
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
  targetPlanet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number],
  hasActiveWar: boolean
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
      score: applyActiveWarNeutralPenalty(340 + faction.statusPriorityWeight, faction, hasActiveWar),
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
    score: applyActiveWarNeutralPenalty(430 + requiredStrength, faction, hasActiveWar),
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
    if (
      faction.faction.currentStatus !== DiplomaticStatus.ALLIED
      && faction.faction.currentStatus !== DiplomaticStatus.PEACE
    ) {
      continue;
    }

    for (const supportRequest of faction.faction.pendingIncomingSupportRequests) {
      if (supportRequest.supportType !== 'PLANET_REPAIR' && supportRequest.supportType !== 'PLANET_DEFENSE') {
        continue;
      }
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

function createOutgoingSupportRequestPlans(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  combatShipNeeds: WarShipNeedRequest[],
  forceProjectionShipNeeds: WarShipNeedRequest[]
): OutgoingSupportRequestPlan[] {
  const candidates = [
    ...createRepairSupportRequestCandidates(context, factions),
    ...createDefenseSupportRequestCandidates(context, factions),
    ...createResourceSupportRequestCandidates(context, factions),
    ...createOffensiveSupportRequestCandidates(context, factions, [...combatShipNeeds, ...forceProjectionShipNeeds])
  ]
    .sort((left, right) =>
      right.score - left.score
      || right.helperCapabilityScore - left.helperCapabilityScore
      || left.helperDistance - right.helperDistance
    );

  return candidates.slice(0, OUTGOING_SUPPORT_REQUEST_CAP);
}

function createRepairSupportRequestCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): OutgoingSupportRequestPlan[] {
  const candidates: OutgoingSupportRequestPlan[] = [];

  for (const planet of context.snapshot.planets) {
    if (!hasEmergencyInfrastructureDamage(planet.infrastructure, HEAVY_REPAIR_DAMAGE_RATIO_THRESHOLD * 100)) {
      continue;
    }
    if (canPlanetRecoverRepairDamageLocally(planet) || canOtherOwnedPlanetsDeliverRepairSupport(context, planet)) {
      continue;
    }

    const missingRatio = resolveEffectiveInfrastructureDamagePercent(planet.infrastructure) / 100;

    const recipient = resolveBestSupportRequestRecipient(
      factions,
      planet.coordinates,
      'PLANET_REPAIR',
      'NON_OFFENSIVE'
    );
    if (!recipient) {
      continue;
    }

    candidates.push({
      supportType: 'PLANET_REPAIR',
      targetFaction: recipient.faction,
      targetCoordinates: { ...planet.coordinates },
      requestedResources: emptyResources(),
      missionType: null,
      minimumShips: [],
      score: Math.round(
        470
        + (missingRatio * 220)
        + recipient.capabilityScore
        + resolveAllianceDepotSupportModifier(planet, null)
      ),
      reason: 'Heavily damaged strategic planet cannot recover fast enough without foreign repair support.',
      helperCapabilityScore: recipient.capabilityScore,
      helperDistance: recipient.distance,
      recipientStatus: recipient.faction.faction.currentStatus
    });
  }

  return candidates;
}

function createDefenseSupportRequestCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): OutgoingSupportRequestPlan[] {
  const candidates: OutgoingSupportRequestPlan[] = [];

  for (const planet of context.snapshot.planets) {
    if (
      !isStrategicHubPlanet(planet)
      || planet.defense.recentHostileAttackCountLast100Turns <= 0
    ) {
      continue;
    }

    const localGuardStrength = selectCombatShipsForStrength(planet, Number.MAX_SAFE_INTEGER, 0).combatStrength;
    const estimatedHostilePressure = estimateOwnPlanetHostilePressure(planet);
    if (
      localGuardStrength > 0
      || localGuardStrength >= estimatedHostilePressure
      || (localGuardStrength + Math.round(planet.defense.totalInstalledDefenseValue / 40)) >= estimatedHostilePressure
    ) {
      continue;
    }

    const recipient = resolveBestSupportRequestRecipient(
      factions,
      planet.coordinates,
      'PLANET_DEFENSE',
      'NON_OFFENSIVE'
    );
    if (!recipient) {
      continue;
    }

    candidates.push({
      supportType: 'PLANET_DEFENSE',
      targetFaction: recipient.faction,
      targetCoordinates: { ...planet.coordinates },
      requestedResources: emptyResources(),
      missionType: null,
      minimumShips: [],
      score: Math.round(
        490
        + estimatedHostilePressure
        + recipient.capabilityScore
        + resolveAllianceDepotSupportModifier(planet, null)
      ),
      reason: 'Strategic hub recently came under pressure and local guard strength is not sufficient.',
      helperCapabilityScore: recipient.capabilityScore,
      helperDistance: recipient.distance,
      recipientStatus: recipient.faction.faction.currentStatus
    });
  }

  return candidates;
}

function createResourceSupportRequestCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): OutgoingSupportRequestPlan[] {
  const candidates: OutgoingSupportRequestPlan[] = [];

  for (const planet of context.snapshot.planets) {
    const emergencyNeed = resolveExtremeResourceSupportNeed(planet);
    if (!emergencyNeed) {
      continue;
    }

    const recipient = resolveBestSupportRequestRecipient(
      factions,
      planet.coordinates,
      'RESOURCE_SUPPORT',
      'NON_OFFENSIVE'
    );
    if (!recipient) {
      continue;
    }

    candidates.push({
      supportType: 'RESOURCE_SUPPORT',
      targetFaction: recipient.faction,
      targetCoordinates: { ...planet.coordinates },
      requestedResources: emergencyNeed.requestedResources,
      missionType: null,
      minimumShips: [],
      score: Math.round(
        430
        + emergencyNeed.severity
        + recipient.capabilityScore
        + resolveAllianceDepotSupportModifier(planet, null)
      ),
      reason: emergencyNeed.reason,
      helperCapabilityScore: recipient.capabilityScore,
      helperDistance: recipient.distance,
      recipientStatus: recipient.faction.faction.currentStatus
    });
  }

  return candidates;
}

function createOffensiveSupportRequestCandidates(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[],
  shipNeeds: WarShipNeedRequest[]
): OutgoingSupportRequestPlan[] {
  const candidates: OutgoingSupportRequestPlan[] = [];
  const ownStrengthEstimate = resolveOwnStrengthEstimate(context);

  for (const shipNeed of shipNeeds) {
    if (
      shipNeed.needKind !== 'ATTACK'
      && shipNeed.needKind !== 'MOVE'
      && shipNeed.needKind !== 'BOMBARD'
      && shipNeed.needKind !== 'SIEGE'
    ) {
      continue;
    }

    const targetPlanet = resolveKnownPlanetForCoordinates(factions, shipNeed.targetCoordinates);
    const targetFaction = targetPlanet?.faction ?? null;
    if (!targetFaction || !targetPlanet) {
      continue;
    }
    const targetStrength = estimateDiplomaticTargetStrength(targetPlanet.planet);
    if (targetStrength > Math.max(220, ownStrengthEstimate * 0.9)) {
      continue;
    }

    const supportType = shipNeed.needKind === 'BOMBARD'
      ? 'BOMBARD_TARGET'
      : shipNeed.needKind === 'SIEGE'
        ? 'SIEGE_TARGET'
        : 'ATTACK_TARGET';
    const recipient = resolveBestSupportRequestRecipient(
      factions,
      targetPlanet.planet.coordinates,
      supportType,
      'OFFENSIVE'
    );
    if (!recipient) {
      continue;
    }

    candidates.push({
      supportType,
      targetFaction: recipient.faction,
      targetCoordinates: { ...targetPlanet.planet.coordinates },
      requestedResources: emptyResources(),
      missionType: supportType === 'ATTACK_TARGET'
        ? FleetMissionType.ATTACK
        : supportType === 'BOMBARD_TARGET'
          ? FleetMissionType.BOMBARD
          : FleetMissionType.SIEGE,
      minimumShips: resolveOutgoingOffensiveMinimumShips(context, shipNeed),
      score: Math.round(620 + shipNeed.score + recipient.capabilityScore - targetStrength / 4),
      reason: 'Blocked offensive diplomatic plan could be unlocked by allied intervention against a target that still looks breakable.',
      helperCapabilityScore: recipient.capabilityScore,
      helperDistance: recipient.distance,
      recipientStatus: recipient.faction.faction.currentStatus
    });
  }

  return candidates;
}

function createIncomingRequestDecisionPlans(
  context: BotSubsystemContext,
  factions: EvaluatedFaction[]
): IncomingRequestDecisionPlan[] {
  return factions
    .flatMap((faction) => [
      ...faction.faction.pendingIncomingJumpGateRequests.map((request) =>
        evaluateIncomingJumpGateDecision(factions, faction, request)
      ),
      ...faction.faction.pendingIncomingMaintenanceRequests.map((request) =>
        evaluateIncomingMaintenanceDecision(context, faction, request)
      ),
      ...faction.faction.pendingIncomingSupportRequests
        .map((request) => evaluateIncomingSupportPreference(context, faction, request))
        .filter((entry): entry is IncomingSupportPreferencePlan => entry !== null)
        .map((preference) => supportPreferenceToRequestDecision(preference))
    ])
    .sort((left, right) =>
      right.score - left.score
      || resolveRequestTypeOrder(left.requestType) - resolveRequestTypeOrder(right.requestType)
      || left.requestId - right.requestId
    );
}

function evaluateIncomingJumpGateDecision(
  allFactions: EvaluatedFaction[],
  faction: EvaluatedFaction,
  request: BotStrategicDiplomaticFactionSnapshot['pendingIncomingJumpGateRequests'][number]
): IncomingRequestDecisionPlan {
  if (!isJumpGateMissionAllowed(request.missionType)) {
    return createRequestDecisionPlan(
      faction,
      'JUMP_GATE',
      request.requestId,
      'REJECT',
      240,
      'Jump Gate request references a mission type that should not be gate-routable.',
      request.targetCoordinates
    );
  }

  if (faction.faction.currentStatus === DiplomaticStatus.ALLIED) {
    return createRequestDecisionPlan(
      faction,
      'JUMP_GATE',
      request.requestId,
      'APPROVE',
      620 + request.totalShips,
      'Allied Jump Gate movement is allowed for valid mission types.',
      request.targetCoordinates
    );
  }

  if (
    faction.faction.currentStatus === DiplomaticStatus.PEACE
    && request.missionType === FleetMissionType.DEFEND
    && hasSharedWarPressure(allFactions, faction)
  ) {
    return createRequestDecisionPlan(
      faction,
      'JUMP_GATE',
      request.requestId,
      'APPROVE',
      520 + request.totalShips,
      'Peace Jump Gate defense is allowed because there is shared hostile war pressure.',
      request.targetCoordinates
    );
  }

  return createRequestDecisionPlan(
    faction,
    'JUMP_GATE',
    request.requestId,
    'REJECT',
    210,
    'Current diplomatic status does not justify Jump Gate approval.',
    request.targetCoordinates
  );
}

function evaluateIncomingMaintenanceDecision(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  request: BotStrategicDiplomaticFactionSnapshot['pendingIncomingMaintenanceRequests'][number]
): IncomingRequestDecisionPlan {
  const targetPlanet = context.snapshot.planets.find((planet) =>
    planet.coordinates.x === request.targetCoordinates.x
    && planet.coordinates.y === request.targetCoordinates.y
    && planet.coordinates.z === request.targetCoordinates.z
  ) ?? null;
  if (!targetPlanet) {
    return createRequestDecisionPlan(
      faction,
      'MAINTENANCE',
      request.requestId,
      'REJECT',
      180,
      'Maintenance target is no longer an owned planet.',
      request.targetCoordinates
    );
  }

  const fuelReserve = Math.floor(targetPlanet.economy.storageCapacity.deuterium * MAINTENANCE_STORAGE_RESERVE_RATIO);
  const approvedFuel = Math.min(
    request.requested.fuel,
    Math.max(0, Math.floor(targetPlanet.localResources.deuterium - fuelReserve))
  );
  const canShareMilitaryStores = faction.faction.currentStatus === DiplomaticStatus.ALLIED;
  const approvedShips = canShareMilitaryStores
    ? request.requested.ships
      .map((entry) => ({
        type: entry.type,
        amount: Math.min(entry.amount, targetPlanet.ships.undamagedCountByType[entry.type] ?? 0)
      }))
      .filter((entry) => entry.amount > 0)
    : [];
  const approvedBombs = canShareMilitaryStores
    ? request.requested.bombs
      .map((entry) => ({
        type: entry.type,
        amount: Math.min(entry.amount, targetPlanet.defense.installedCountByType[entry.type] ?? 0)
      }))
      .filter((entry) => entry.amount > 0)
    : [];

  const maintenanceApproval = {
    fuel: approvedFuel,
    ships: approvedShips,
    bombs: approvedBombs
  };
  const approvedTotal = approvedFuel
    + approvedShips.reduce((sum, entry) => sum + entry.amount, 0)
    + approvedBombs.reduce((sum, entry) => sum + entry.amount, 0);
  if (approvedTotal <= 0) {
    return createRequestDecisionPlan(
      faction,
      'MAINTENANCE',
      request.requestId,
      'REJECT',
      190,
      'Maintenance request would violate reserve limits or has no available payload.',
      request.targetCoordinates
    );
  }

  const requestedTotal = request.requested.fuel
    + request.requested.ships.reduce((sum, entry) => sum + entry.amount, 0)
    + request.requested.bombs.reduce((sum, entry) => sum + entry.amount, 0);
  const full = approvedTotal >= requestedTotal;
  return {
    ...createRequestDecisionPlan(
      faction,
      'MAINTENANCE',
      request.requestId,
      full ? 'APPROVE' : 'PARTIAL_APPROVE',
      full ? 500 + approvedTotal : 390 + approvedTotal,
      faction.faction.currentStatus === DiplomaticStatus.PEACE
        ? 'Peace maintenance is limited to fuel and preserves storage reserve.'
        : 'Allied maintenance can provide fuel, bombs, and small ships while preserving reserve.',
      request.targetCoordinates
    ),
    maintenanceApproval
  };
}

function evaluateIncomingSupportPreference(
  context: BotSubsystemContext,
  faction: EvaluatedFaction,
  request: BotStrategicDiplomaticFactionSnapshot['pendingIncomingSupportRequests'][number]
): IncomingSupportPreferencePlan | null {
  const friendlyTargetPlanet = faction.faction.knownPlanets.find((planet) =>
    planet.coordinates.x === request.targetCoordinates.x
    && planet.coordinates.y === request.targetCoordinates.y
    && planet.coordinates.z === request.targetCoordinates.z
  ) ?? null;

  if (request.supportType === 'PLANET_REPAIR') {
    const canHelp = friendlyTargetPlanet !== null
      && (faction.faction.currentStatus === DiplomaticStatus.ALLIED || faction.faction.currentStatus === DiplomaticStatus.PEACE)
      && createRepairSupportPlan(context, faction, friendlyTargetPlanet, 'EXPLICIT_REQUEST') !== null;
    return {
      faction,
      request,
      preference: canHelp ? 'APPROVE' : 'REJECT',
      score: canHelp ? 520 + resolveAllianceDepotSupportModifier(null, friendlyTargetPlanet) : 180,
      reason: canHelp
        ? 'Reachable repair support exists for this friendly planet.'
        : 'No timely repair support path is visible for this request.',
      approvedResources: null
    };
  }

  if (request.supportType === 'PLANET_DEFENSE') {
    const canHelp = friendlyTargetPlanet !== null
      && (faction.faction.currentStatus === DiplomaticStatus.ALLIED || faction.faction.currentStatus === DiplomaticStatus.PEACE)
      && createGuardSupportPlan(context, faction, friendlyTargetPlanet, 'EXPLICIT_REQUEST') !== null;
    return {
      faction,
      request,
      preference: canHelp ? 'APPROVE' : 'REJECT',
      score: canHelp ? 500 + resolveAllianceDepotSupportModifier(null, friendlyTargetPlanet) : 170,
      reason: canHelp
        ? 'A reachable guard fleet can likely answer this defensive request.'
        : 'No plausible guard launch is visible for this request.',
      approvedResources: null
    };
  }

  if (request.supportType === 'RESOURCE_SUPPORT') {
    const available = resolveAvailableResourceSupport(context, request.requestedResources ?? emptyResources());
    if (available.total <= 0) {
      return {
        faction,
        request,
        preference: 'REJECT',
        score: 120,
        reason: 'Local reserves are too tight for meaningful resource support.',
        approvedResources: null
      };
    }
    const requestedTotal = getResourceAmount(request.requestedResources ?? emptyResources());
    const approvedResources = available.resources;
    const fullyCovered = available.total >= requestedTotal;
    return {
      faction,
      request,
      preference: fullyCovered ? 'APPROVE' : 'PARTIAL_APPROVE',
      score: (fullyCovered ? 470 : 360) + Math.round(available.total / 50),
      reason: fullyCovered
        ? 'Visible surplus can satisfy this resource request.'
        : 'Only partial visible surplus is available for this resource request.',
      approvedResources
    };
  }

  const offensiveTargetPlanet = resolveSnapshotKnownPlanetForCoordinates(
    context.snapshot.empire.strategicDiplomaticFactions,
    request.targetCoordinates
  );

  if (faction.faction.currentStatus !== DiplomaticStatus.ALLIED || !offensiveTargetPlanet) {
    return {
      faction,
      request,
      preference: 'REJECT',
      score: 140,
      reason: 'Offensive support is reserved for allied, currently visible targets.',
      approvedResources: null
    };
  }

  const canLaunch = hasMinimumSupportShipsFromAnyOrigin(context, request.minimumShips, request.targetCoordinates);
  return {
    faction,
    request,
    preference: canLaunch ? 'APPROVE' : 'REJECT',
    score: canLaunch ? 510 + resolveAllianceDepotSupportModifier(null, offensiveTargetPlanet) : 160,
    reason: canLaunch
      ? 'Visible fleets can plausibly satisfy the requested offensive support floor.'
      : 'No visible origin can satisfy the requested offensive support floor.',
    approvedResources: null
  };
}

function supportPreferenceToRequestDecision(preference: IncomingSupportPreferencePlan): IncomingRequestDecisionPlan {
  return {
    faction: preference.faction,
    requestType: 'SUPPORT',
    requestId: preference.request.requestId,
    decision: preference.preference,
    score: preference.score,
    reason: preference.reason,
    targetCoordinates: { ...preference.request.targetCoordinates },
    supportType: preference.request.supportType,
    approvedResources: preference.approvedResources ? { ...preference.approvedResources } : null,
    maintenanceApproval: null
  };
}

function createRequestDecisionPlan(
  faction: EvaluatedFaction,
  requestType: IncomingRequestDecisionPlan['requestType'],
  requestId: number,
  decision: IncomingRequestDecisionPlan['decision'],
  score: number,
  reason: string,
  targetCoordinates: { x: number; y: number; z: number } | null
): IncomingRequestDecisionPlan {
  return {
    faction,
    requestType,
    requestId,
    decision,
    score,
    reason,
    targetCoordinates: targetCoordinates ? { ...targetCoordinates } : null,
    supportType: null,
    approvedResources: null,
    maintenanceApproval: null
  };
}

function hasSharedWarPressure(allFactions: EvaluatedFaction[], requester: EvaluatedFaction): boolean {
  return requester.sharedHostileEvents.length > 0
    || allFactions.some((faction) =>
      faction.faction.currentStatus === DiplomaticStatus.WAR
      && faction.sharedHostileEvents.some((event) => event.sharedFromPlayerId === requester.faction.playerId)
    );
}

function resolveRequestTypeOrder(requestType: IncomingRequestDecisionPlan['requestType']): number {
  switch (requestType) {
    case 'JUMP_GATE':
      return 0;
    case 'MAINTENANCE':
      return 1;
    case 'SUPPORT':
      return 2;
  }
}

function canPlanetRecoverRepairDamageLocally(planet: BotPlanetSnapshot): boolean {
  const missingStructuralPoints = Math.max(0, planet.infrastructure.missingBuildingStructuralPoints);
  if (missingStructuralPoints <= 0) {
    return true;
  }

  const repairTools = planet.power.shipyardPower + (planet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0);
  const fiveTurnCapacity = repairTools * LOCAL_REPAIR_EVALUATION_TURNS;
  return fiveTurnCapacity >= (missingStructuralPoints * LOCAL_REPAIR_RECOVERY_RATIO_THRESHOLD);
}

function canOtherOwnedPlanetsDeliverRepairSupport(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot
): boolean {
  const missingStructuralPoints = Math.max(0, targetPlanet.infrastructure.missingBuildingStructuralPoints);
  const requiredExternalCapacity = Math.max(
    0,
    (missingStructuralPoints * LOCAL_REPAIR_RECOVERY_RATIO_THRESHOLD)
    - ((targetPlanet.power.shipyardPower + (targetPlanet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0)) * LOCAL_REPAIR_EVALUATION_TURNS)
  );
  if (requiredExternalCapacity <= 0) {
    return true;
  }

  let externalCapacity = 0;
  for (const originPlanet of context.snapshot.planets) {
    if (toCoordinatesKey(originPlanet.coordinates) === toCoordinatesKey(targetPlanet.coordinates)) {
      continue;
    }
    const distance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
    const travelTurns = resolveTravelTurns(originPlanet, distance);
    if (travelTurns > LOCAL_REPAIR_EVALUATION_TURNS) {
      continue;
    }
    const drones = originPlanet.ships.undamagedCountByType[ShipType.REPAIR_DRONE] ?? 0;
    if (drones <= 0) {
      continue;
    }
    if (!resolveBestArmamentCarrier(originPlanet)) {
      continue;
    }
    externalCapacity += drones * LOCAL_REPAIR_EVALUATION_TURNS * 2;
    if (externalCapacity >= requiredExternalCapacity) {
      return true;
    }
  }

  return false;
}

function estimateOwnPlanetHostilePressure(planet: BotPlanetSnapshot): number {
  return Math.max(
    40,
    (planet.defense.recentHostileAttackCountLast100Turns * 32)
    + (planet.defense.recentHostileAttackStep * 26)
    + Math.round(planet.defense.avgIndustryLevel * 8)
  );
}

function resolveBestSupportRequestRecipient(
  factions: EvaluatedFaction[],
  targetCoordinates: { x: number; y: number; z: number },
  supportType: OutgoingSupportRequestPlan['supportType'],
  mode: 'OFFENSIVE' | 'NON_OFFENSIVE'
): { faction: EvaluatedFaction; capabilityScore: number; distance: number } | null {
  const candidates = factions
    .filter((faction) => isFactionEligibleForSupportRequestRecipient(faction, supportType))
    .map((faction) => {
      const capabilityScore = estimateKnownSupportCapability(faction, supportType);
      const distance = resolveKnownFactionDistanceToTarget(faction, targetCoordinates);
      const relationRank = resolveSupportRelationRank(faction.faction.currentStatus);
      return {
        faction,
        capabilityScore,
        distance,
        relationRank
      };
    })
    .filter((entry) => entry.distance !== Number.MAX_SAFE_INTEGER && entry.capabilityScore > 0);

  if (candidates.length <= 0) {
    return null;
  }

  candidates.sort((left, right) =>
    right.capabilityScore - left.capabilityScore
    || (mode === 'OFFENSIVE'
      ? left.distance - right.distance || right.relationRank - left.relationRank
      : right.relationRank - left.relationRank || left.distance - right.distance)
    || left.faction.faction.playerId - right.faction.faction.playerId
  );

  return candidates[0] ?? null;
}

function isFactionEligibleForSupportRequestRecipient(
  faction: EvaluatedFaction,
  supportType: OutgoingSupportRequestPlan['supportType']
): boolean {
  if (faction.faction.knownPlanetCount <= 0 || faction.faction.knownPlanets.length <= 0) {
    return false;
  }

  const status = faction.faction.currentStatus;
  if (supportType === 'ATTACK_TARGET' || supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET') {
    return status === DiplomaticStatus.ALLIED;
  }
  if (supportType === 'RESOURCE_SUPPORT') {
    return status === DiplomaticStatus.ALLIED;
  }
  return status === DiplomaticStatus.ALLIED || status === DiplomaticStatus.PEACE;
}

function isOutgoingSupportRequestPlanLegal(
  request: OutgoingSupportRequestPlan
): boolean {
  if (request.targetFaction.faction.knownPlanetCount <= 0 || request.targetFaction.faction.knownPlanets.length <= 0) {
    return false;
  }

  return isFactionEligibleForSupportRequestRecipient(request.targetFaction, request.supportType);
}

function resolveSupportRelationRank(status: DiplomaticStatus): number {
  switch (status) {
    case DiplomaticStatus.ALLIED:
      return 3;
    case DiplomaticStatus.PEACE:
      return 2;
    case DiplomaticStatus.NEUTRAL:
      return 1;
    default:
      return 0;
  }
}

function estimateKnownSupportCapability(
  faction: EvaluatedFaction,
  supportType: OutgoingSupportRequestPlan['supportType']
): number {
  const logisticsSignal = faction.faction.knownPlanets.reduce((sum, planet) =>
    sum
      + ((planet.allianceDepotLevel ?? 0) > 0 ? 18 : 0)
      + ((planet.jumpGateLevel ?? 0) > 0 ? 14 : 0),
  0);
  const developmentSignal =
    (faction.faction.averageKnownBuildingLevel * 4)
    + (faction.faction.averageKnownTechLevel * 2)
    + (faction.faction.knownPlanetCount * 6)
    + logisticsSignal;
  const fleetSignal =
    (faction.faction.averageKnownShipsAmount * (supportType === 'RESOURCE_SUPPORT' || supportType === 'PLANET_REPAIR' ? 1.2 : 3.5))
    + (faction.faction.bestIntelDepth * 4);

  return Math.max(1, Math.round(developmentSignal + fleetSignal));
}

function resolveKnownFactionDistanceToTarget(
  faction: EvaluatedFaction,
  targetCoordinates: { x: number; y: number; z: number }
): number {
  if (faction.faction.knownPlanets.length <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return faction.faction.knownPlanets.reduce((best, planet) =>
    Math.min(best, calculateTravelDistance(planet.coordinates, targetCoordinates)), Number.MAX_SAFE_INTEGER);
}

function resolveAllianceDepotSupportModifier(
  ownTargetPlanet: BotPlanetSnapshot | null,
  knownFriendlyTarget: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number] | null
): number {
  if ((ownTargetPlanet?.economy.allianceDepotLevel ?? 0) > 0) {
    return ALLIANCE_DEPOT_SUPPORT_SCORE_BONUS;
  }
  if ((knownFriendlyTarget?.allianceDepotLevel ?? 0) > 0) {
    return ALLIANCE_DEPOT_SUPPORT_SCORE_BONUS;
  }
  return 0;
}

function resolveExtremeResourceSupportNeed(
  planet: BotPlanetSnapshot
): {
  requestedResources: { metal: number; crystal: number; deuterium: number };
  severity: number;
  reason: string;
} | null {
  const storageTotal = Math.max(
    1,
    planet.economy.storageCapacity.metal
    + planet.economy.storageCapacity.crystal
    + planet.economy.storageCapacity.deuterium
  );
  const resourceTotal = getResourceAmount(planet.localResources);
  const lowTotalResources = resourceTotal <= Math.floor(storageTotal * EXTREME_RESOURCE_TOTAL_RATIO_THRESHOLD);
  const lowDeuterium = planet.localResources.deuterium <= Math.max(
    EXTREME_RESOURCE_DEUTERIUM_FLOOR,
    planet.economy.income.deuterium * 2
  );
  const pressuredQueue = planet.queues.buildingQueueLength > 0 || planet.queues.shipyardQueueLength > 0 || planet.blockers.energyStarved;
  if ((!lowTotalResources && !lowDeuterium) || !pressuredQueue) {
    return null;
  }

  const floor = {
    metal: Math.max(120, planet.economy.income.metal * 3),
    crystal: Math.max(80, planet.economy.income.crystal * 3),
    deuterium: Math.max(EXTREME_RESOURCE_DEUTERIUM_FLOOR, planet.economy.income.deuterium * 4)
  };
  const requestedResources = {
    metal: Math.max(0, floor.metal - planet.localResources.metal),
    crystal: Math.max(0, floor.crystal - planet.localResources.crystal),
    deuterium: Math.max(0, floor.deuterium - planet.localResources.deuterium)
  };
  if (getResourceAmount(requestedResources) <= 0) {
    return null;
  }

  return {
    requestedResources,
    severity: Math.round((getResourceAmount(requestedResources) / Math.max(1, storageTotal)) * 1000),
    reason: lowDeuterium
      ? 'Planet is entering an extreme deuterium shortage while still needing queue and fuel continuity.'
      : 'Planet is in an extreme low-resource state and cannot sustain current queue pressure.'
  };
}

function resolveKnownPlanetForCoordinates(
  factions: EvaluatedFaction[],
  coordinates: { x: number; y: number; z: number }
): { faction: EvaluatedFaction; planet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number] } | null {
  for (const faction of factions) {
    const planet = faction.faction.knownPlanets.find((entry) =>
      entry.coordinates.x === coordinates.x
      && entry.coordinates.y === coordinates.y
      && entry.coordinates.z === coordinates.z
    );
    if (planet) {
      return { faction, planet };
    }
  }
  return null;
}

function resolveSnapshotKnownPlanetForCoordinates(
  factions: BotStrategicDiplomaticFactionSnapshot[],
  coordinates: { x: number; y: number; z: number }
): BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number] | null {
  for (const faction of factions) {
    const planet = faction.knownPlanets.find((entry) =>
      entry.coordinates.x === coordinates.x
      && entry.coordinates.y === coordinates.y
      && entry.coordinates.z === coordinates.z
    );
    if (planet) {
      return planet;
    }
  }
  return null;
}

function resolveOutgoingOffensiveMinimumShips(
  context: BotSubsystemContext,
  shipNeed: WarShipNeedRequest
): Array<{ type: ShipType; amount: number }> {
  return [{
    type: shipNeed.shipType ?? resolveBestProducibleCombatShipType(context) ?? ShipType.CRUISER,
    amount: Math.max(1, shipNeed.amount)
  }];
}

function resolveAvailableResourceSupport(
  context: BotSubsystemContext,
  requestedResources: { metal: number; crystal: number; deuterium: number }
): {
  resources: { metal: number; crystal: number; deuterium: number };
  total: number;
} {
  const approved = {
    metal: 0,
    crystal: 0,
    deuterium: 0
  };

  for (const planet of context.snapshot.planets) {
    const spare = resolvePlanetSpareResources(planet);
    approved.metal += spare.metal;
    approved.crystal += spare.crystal;
    approved.deuterium += spare.deuterium;
  }

  const resources = {
    metal: Math.min(requestedResources.metal, approved.metal),
    crystal: Math.min(requestedResources.crystal, approved.crystal),
    deuterium: Math.min(requestedResources.deuterium, approved.deuterium)
  };
  return {
    resources,
    total: getResourceAmount(resources)
  };
}

function resolvePlanetSpareResources(
  planet: BotPlanetSnapshot
): { metal: number; crystal: number; deuterium: number } {
  return {
    metal: Math.max(0, planet.localResources.metal - Math.max(80, Math.floor(planet.economy.income.metal * 3))),
    crystal: Math.max(0, planet.localResources.crystal - Math.max(60, Math.floor(planet.economy.income.crystal * 3))),
    deuterium: Math.max(0, planet.localResources.deuterium - Math.max(80, Math.floor(planet.economy.income.deuterium * 4)))
  };
}

function getResourceAmount(
  resources: { metal: number; crystal: number; deuterium: number }
): number {
  return Math.max(0, resources.metal) + Math.max(0, resources.crystal) + Math.max(0, resources.deuterium);
}

function hasMinimumSupportShipsFromAnyOrigin(
  context: BotSubsystemContext,
  minimumShips: Array<{ type: ShipType; amount: number }>,
  targetCoordinates: { x: number; y: number; z: number }
): boolean {
  if (minimumShips.length <= 0) {
    return false;
  }

  return context.snapshot.planets.some((originPlanet) => {
    const distance = calculateTravelDistance(originPlanet.coordinates, targetCoordinates);
    const ships = minimumShips.map((entry) => ({
      type: entry.type,
      undamagedAmount: entry.amount,
      damagedAmount: 0
    }));
    const hasAllShips = minimumShips.every((entry) =>
      (originPlanet.ships.undamagedCountByType[entry.type] ?? 0) >= entry.amount
    );
    return hasAllShips && hasEnoughDeuteriumForShips(originPlanet, ships, distance);
  });
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
    .filter((faction) => faction.intelInsufficient || hasStaleOpenedWarTargetForSpy(context, faction))
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

function hasStaleOpenedWarTargetForSpy(
  context: BotSubsystemContext,
  faction: EvaluatedFaction
): boolean {
  return faction.faction.currentStatus === DiplomaticStatus.WAR
    && faction.faction.knownPlanets.some((planet) =>
      isKnownOpenedWarTargetForRefresh(planet) && isOpenedWarTargetRaidStale(context, planet)
    );
}

function createSpyMissionRequestForFaction(
  context: BotSubsystemContext,
  faction: EvaluatedFaction
): SpyMissionRequest | BlockedSpyNeed | null {
  const bestTarget = resolvePriorityWarSpyTarget(context, faction)
    ?? faction.faction.knownPlanets
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

function resolvePriorityWarSpyTarget(
  context: BotSubsystemContext,
  faction: EvaluatedFaction
): {
  planet: BotStrategicDiplomaticFactionSnapshot['knownPlanets'][number];
  desiredReportLevel: number;
  estimatedDifficulty: number;
  probeAmount: number;
  score: number;
} | null {
  if (faction.faction.currentStatus !== DiplomaticStatus.WAR) {
    return null;
  }

  return faction.faction.knownPlanets
    .filter((planet) => isKnownOpenedWarTargetForRefresh(planet) && isOpenedWarTargetRaidStale(context, planet))
    .map((planet) => {
      const desiredReportLevel = resolveDesiredReportLevel(faction.faction.currentStatus);
      const estimatedDifficulty = resolveEstimatedProbeDifficulty(context, faction, planet, desiredReportLevel);
      const probeAmount = Math.min(
        resolveAffordableProbeCap(context),
        resolveProbeAmountForDifficulty(estimatedDifficulty, faction.faction.currentStatus)
      );
      return {
        planet,
        desiredReportLevel,
        estimatedDifficulty,
        probeAmount: Math.max(1, probeAmount),
        score: Math.round(440 + (planet.lastRelevantReportAge * 4) + (faction.statusPriorityWeight * 1.5))
      };
    })
    .sort((left, right) =>
      right.score - left.score
      || right.planet.lastRelevantReportAge - left.planet.lastRelevantReportAge
      || left.planet.coordinates.x - right.planet.coordinates.x
      || left.planet.coordinates.y - right.planet.coordinates.y
      || left.planet.coordinates.z - right.planet.coordinates.z
    )[0] ?? null;
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
  const isPostBreakRaid = request.phase === 'POST_BREAK_RAID';
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
  const isPostBreakRaid = request.phase === 'POST_BREAK_RAID';
  return {
    proposalId: `strategic-diplomatic:attack:${request.phase}:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:attack:${request.faction.faction.playerId}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`,
    dedupeKey: `strategic-diplomatic:attack:${request.phase}:${request.faction.faction.playerId}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}`,
    summary: request.scoutOnly
      ? `Attack scout #${index + 1}: send one medium ship from ${request.originPlanet.name} to ${request.faction.faction.playerName} at ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z}.`
      : isPostBreakRaid
        ? `Raid request #${index + 1}: pressure opened war target ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z} from ${request.originPlanet.name}.`
      : `Attack request #${index + 1}: strike ${request.faction.faction.playerName} at ${request.targetPlanet.coordinates.x}:${request.targetPlanet.coordinates.y}:${request.targetPlanet.coordinates.z} from ${request.originPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.targetPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.faction.faction.currentStatus === DiplomaticStatus.WAR ? (isPostBreakRaid ? 80 : 84) : 72,
    risk: request.scoutOnly ? 14 : isPostBreakRaid ? 22 : 28,
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
      attackKind: request.scoutOnly ? 'SCOUT' : isPostBreakRaid ? 'RAID' : 'FULL',
      attackPhase: request.phase,
      targetPlayerId: request.faction.faction.playerId,
      targetStatus: request.faction.faction.currentStatus,
      requiredStrength: request.requiredStrength,
      selectedStrength: Math.round(request.selectedStrength),
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns,
      estimatedPlunder: request.estimatedPlunder,
      cargoCapacity: request.cargoCapacity,
      ambushRisk: request.ambushRisk
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
  const isWarBreakMove = request.moveRole === 'WAR_BREAK_STAGING';
  return {
    proposalId: `strategic-diplomatic:move:${request.faction.faction.playerId}:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.stagingPlanet.coordinates)}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_DIPLOMATIC',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-diplomatic:move:${request.faction.faction.playerId}:${toCoordinatesKey(request.stagingPlanet.coordinates)}`,
    dedupeKey: `strategic-diplomatic:move:${request.moveRole}:${toCoordinatesKey(request.originPlanet.coordinates)}:${toCoordinatesKey(request.stagingPlanet.coordinates)}`,
    summary: isWarBreakMove
      ? `Move request #${index + 1}: regroup war-break fleet from ${request.originPlanet.name} to ${request.stagingPlanet.name}.`
      : `Move request #${index + 1}: regroup bombardment fleet from ${request.originPlanet.name} to ${request.stagingPlanet.name}.`,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.stagingPlanet.coordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: isWarBreakMove ? 82 : 74,
    risk: isWarBreakMove ? 18 : 16,
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

function resolveSelectionCargoCapacity(
  ships: CombatShipSelection['ships']
): number {
  return ships.reduce((total, ship) =>
    total + ((SHIP_BLUEPRINTS.get(ship.type)?.cargoCapacity ?? 0) * (ship.undamagedAmount + ship.damagedAmount)), 0);
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
