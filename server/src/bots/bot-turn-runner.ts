import * as diplomaticStatusEnumModule from '../../../src/app/models/diplomacy/diplomatic-status.js';
import * as diplomaticProposalStateModule from '../../../src/app/models/diplomacy/diplomatic-proposal-state.js';
import * as buildingTypeEnumModule from '../../../src/app/models/enums/building-type.js';
import * as fleetMissionTypeEnumModule from '../../../src/app/models/enums/fleet-mission-type.js';
import * as manyShipsModule from '../../../src/app/models/fleets/many-ships.js';
import * as fleetModelModule from '../../../src/app/models/fleets/fleet.js';
import * as playerTypeEnumModule from '../../../src/app/models/enums/player-type.js';
import * as planetTypeEnumModule from '../../../src/app/models/enums/planet-type.js';
import * as shipPurposeEnumModule from '../../../src/app/models/enums/ship-purpose.js';
import * as shipTypeEnumModule from '../../../src/app/models/enums/ship-type.js';
import * as technologyTypeEnumModule from '../../../src/app/models/enums/technology-type.js';
import * as weaponTypeEnumModule from '../../../src/app/models/enums/weapon-type.js';
import * as reportTypeEnumModule from '../../../src/app/models/enums/report-type.js';
import * as resourcesPackModule from '../../../src/app/models/resources-pack.js';
import * as playerModule from '../../../src/app/models/player.js';
import * as supportRequestModule from '../../../src/app/models/requests/support-request.js';
import * as bombardmentPriorityModule from '../../../src/app/models/bombardment/bombardment-priority.js';
import * as energyDeficitModule from '../../../src/app/models/planets/energy-deficit.js';
import * as fusionReactorOperationModule from '../../../src/app/models/planets/fusion-reactor-operation.js';
import type {
  ClientCoordinates,
  CreateFleetShipSelectionEntry,
  FleetMaintenanceOptionsDto
} from '../../../src/app/models/game-api-types.ts';
import type { BombardmentPriorities } from '../../../src/app/models/bombardment/bombardment-priority.ts';
import type { BuildingType as BuildingTypeType } from '../../../src/app/models/enums/building-type.ts';
import type { TechnologyType as TechnologyTypeType } from '../../../src/app/models/enums/technology-type.ts';
import type { ShipType as ShipTypeType } from '../../../src/app/models/enums/ship-type.ts';
import type { FleetMissionType as FleetMissionTypeType } from '../../../src/app/models/enums/fleet-mission-type.ts';
import type { Planet } from '../../../src/app/models/planets/planet.ts';
import type { EspionageReportData } from '../../../src/app/models/reports/espionage-report-data.ts';
import type { ResourcesPack as ResourcesPackType } from '../../../src/app/models/resources-pack.ts';
import type { ManyShips as ManyShipsType } from '../../../src/app/models/fleets/many-ships.ts';
import type {
  OffensiveSupportRequest,
  SupportRequest,
  SupportRequestType,
  SupportShipAmount
} from '../../../src/app/models/requests/support-request.ts';
import type {
  BotFarmLossBracket,
  BotFarmTargetRecord,
  BotGoalType,
  BotMemory,
  BotMemoryCoordinates,
  BotProfileId,
  Player
} from '../../../src/app/models/player.ts';
import type { Galaxy } from '../../../src/app/models/planets/galaxy.ts';
import type { StartBuildingConstructionCommand } from '../game-commands/building-commands.ts';
import type { CreateFleetMaintenanceRequestCommand } from '../game-commands/maintenance-commands.ts';
import type { CreateFleetMissionCommand } from '../game-commands/fleet-commands.ts';
import type { StartTechnologyResearchCommand } from '../game-commands/research-commands.ts';
import type { StartShipyardConstructionCommand } from '../game-commands/shipyard-commands.ts';
import type { CreateStarSystemSpyCommand } from '../game-commands/star-system-spy-commands.ts';
import { startBuildingConstruction } from '../game-commands/building-commands.js';
import {
  approveDiplomaticProposalCommand,
  createDiplomaticProposalCommand,
  rejectDiplomaticProposalCommand
} from '../game-commands/diplomacy-commands.js';
import {
  approveJumpGateRequestCommand,
  rejectJumpGateRequestCommand
} from '../game-commands/jump-gate-request-commands.js';
import {
  BUILDING_BLUEPRINTS,
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS,
  TECHNOLOGY_BLUEPRINTS,
  calculateFuelCost,
  calculateMaxBuildingQueueLength,
  calculateMaxLabsPerTechnology,
  calculateMaxShipyardQueueLength,
  calculateTravelDistance,
  hasBuildingRequirements,
  hasResearchBuildingRequirements,
  hasResearchTechnologyRequirements,
  hasShipBuildingRequirements,
  hasShipTechnologyRequirements,
  hasTechnologyRequirements,
  resolveDiplomaticStatus,
  resolvePlayerById,
  validateJumpGateLaunchAccess
} from '../game-commands/command-helpers.js';
import { createFleetMission } from '../game-commands/fleet-commands.js';
import {
  approveFleetMaintenanceRequest,
  createFleetMaintenanceRequest,
  rejectFleetMaintenanceRequest,
  resolveFleetMaintenanceOptions
} from '../game-commands/maintenance-commands.js';
import { startTechnologyResearch } from '../game-commands/research-commands.js';
import { startShipyardConstruction } from '../game-commands/shipyard-commands.js';
import { createStarSystemSpyMissions } from '../game-commands/star-system-spy-commands.js';
import { buildBotDiplomacyContexts, type BotDiplomacyContext } from './bot-diplomacy-awareness.js';
import { buildBotDiplomacyProposalCandidate } from './bot-diplomacy-planner.js';
import { decideIncomingDiplomaticProposal } from './bot-diplomacy-resolver.js';
import { recordBotDecisionTrace } from './bot-debug-store.js';
import type { BotDecisionTrace, BotRejectedActionTrace, BotTraceStopReason } from './bot-debug.ts';
import { isBotPaused } from './bot-admin.js';
import { BOT_PROFILES, type BotProfile } from './bot-profile.js';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { DiplomaticStatus } = resolveModule(diplomaticStatusEnumModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-status.js');
const { DiplomaticProposalState } = resolveModule(diplomaticProposalStateModule) as typeof import('../../../src/app/models/diplomacy/diplomatic-proposal-state.js');
const { BuildingType } = resolveModule(buildingTypeEnumModule) as typeof import('../../../src/app/models/enums/building-type.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeEnumModule) as typeof import('../../../src/app/models/enums/fleet-mission-type.js');
const { ManyShips } = resolveModule(manyShipsModule) as typeof import('../../../src/app/models/fleets/many-ships.js');
const { FleetState } = resolveModule(fleetModelModule) as typeof import('../../../src/app/models/fleets/fleet.js');
const { PlayerType } = resolveModule(playerTypeEnumModule) as typeof import('../../../src/app/models/enums/player-type.js');
const { PlanetType } = resolveModule(planetTypeEnumModule) as typeof import('../../../src/app/models/enums/planet-type.js');
const { ReportType } = resolveModule(reportTypeEnumModule) as typeof import('../../../src/app/models/enums/report-type.js');
const { ShipPurpose } = resolveModule(shipPurposeEnumModule) as typeof import('../../../src/app/models/enums/ship-purpose.js');
const { ShipType } = resolveModule(shipTypeEnumModule) as typeof import('../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeEnumModule) as typeof import('../../../src/app/models/enums/technology-type.js');
const { WeaponType } = resolveModule(weaponTypeEnumModule) as typeof import('../../../src/app/models/enums/weapon-type.js');
const { ResourcesPack } = resolveModule(resourcesPackModule) as typeof import('../../../src/app/models/resources-pack.js');
const { defaultBotProfileIdForPlayerId } = resolveModule(playerModule) as typeof import('../../../src/app/models/player.js');
const {
  createSupportRequest,
  normalizeSupportResources,
  normalizeSupportShipAmounts,
  supportResourcesHasAnyValue,
  supportShipAmountsHaveAnyValue
} = resolveModule(supportRequestModule) as typeof import('../../../src/app/models/requests/support-request.js');
const { BombardmentPriorityTarget } = resolveModule(bombardmentPriorityModule) as typeof import('../../../src/app/models/bombardment/bombardment-priority.js');
const { energyDeficitEfficiencyMultiplier } = resolveModule(energyDeficitModule) as typeof import('../../../src/app/models/planets/energy-deficit.js');
const { resolveFusionReactorOperation } = resolveModule(fusionReactorOperationModule) as typeof import('../../../src/app/models/planets/fusion-reactor-operation.js');

type BuildingCandidate = {
  kind: 'building';
  utility: number;
  reason: string;
  goalType: BotGoalType | null;
  request: StartBuildingConstructionCommand;
};

type ResearchCandidate = {
  kind: 'research';
  utility: number;
  reason: string;
  goalType: BotGoalType | null;
  request: StartTechnologyResearchCommand;
};

type ShipyardCandidate = {
  kind: 'shipyard';
  utility: number;
  reason: string;
  goalType: BotGoalType | null;
  request: StartShipyardConstructionCommand;
};

type FleetCandidateKind = 'spy' | 'colonize' | 'attack' | 'transport' | 'recycle' | 'repair' | 'bombard' | 'siege' | 'guard' | 'move';

type FleetCandidate = {
  kind: FleetCandidateKind;
  utility: number;
  reason: string;
  goalType: BotGoalType | null;
  request: CreateFleetMissionCommand;
};

type MaintenanceCandidate = {
  kind: 'maintenance';
  utility: number;
  reason: string;
  goalType: BotGoalType | null;
  fleetId: number;
  targetCoordinates: ClientCoordinates;
  request: CreateFleetMaintenanceRequestCommand;
};

type StarSystemSpyCandidate = {
  kind: 'system_spy';
  utility: number;
  reason: string;
  goalType: BotGoalType | null;
  request: CreateStarSystemSpyCommand;
  primaryTargetCoordinates: BotMemoryCoordinates;
  targetCoordinates: BotMemoryCoordinates[];
};

type BotCandidate =
  | BuildingCandidate
  | ResearchCandidate
  | ShipyardCandidate
  | FleetCandidate
  | MaintenanceCandidate
  | StarSystemSpyCandidate;

type BotSupportRequestCandidate = {
  supportType: SupportRequestType;
  utility: number;
  reason: string;
  targetPlayerId: number;
  targetCoordinates: ClientCoordinates;
  requestedResources: ResourcesPackType;
  missionType: FleetMissionTypeType | null;
  minimumShips: SupportShipAmount[];
  bombardmentPriorities: BombardmentPriorities | null;
};

type BotTurnCounters = {
  total: number;
  building: number;
  research: number;
  shipyard: number;
  spy: number;
  colonize: number;
  attack: number;
  transport: number;
  maintenance: number;
  recycle: number;
  repair: number;
  bombard: number;
  siege: number;
  guard: number;
  move: number;
};

type BotEconomyStage = 'energy_recovery' | 'throughput' | 'infrastructure' | 'open';

type BotPlanetEconomyState = {
  stage: BotEconomyStage;
  availableEnergy: number;
  usedEnergy: number;
  energyEfficiency: number;
  targetAvailableEnergy: number;
  energyGap: number;
  avgMineLevel: number;
  avgStorageLevel: number;
  roboticsLevel: number;
  shipyardLevel: number;
  researchLabLevel: number;
  naniteLevel: number;
  targetMineLevel: number;
};

type BotEconomyTargets = {
  mineLevel: number;
  roboticsLevel: number;
  researchLabLevel: number;
  shipyardLevel: number;
};

type ResearchTargetDefinition = {
  type: TechnologyTypeType;
  targetLevel: number;
};

const TARGET_ENERGY_SURPLUS = 3;
const FARM_ATTACK_COOLDOWN_TURNS = 10;
const MAX_BOT_FARM_TARGETS = 40;
const OWN_SHIP_LOSS_REGEX = /Own ships \([^)]+\): (\d+)\/(\d+) survived, (\d+) lost\./;
const ENEMY_DEFENCE_SURVIVOR_REGEX = /Enemy defenses \([^)]+\): (\d+)\/(\d+) survived, (\d+) lost\./;
const ENEMY_SHIP_SURVIVOR_REGEX = /Enemy ships \([^)]+\): (\d+)\/(\d+) survived, (\d+) lost\./;

const BOT_ECONOMY_TARGETS: Record<BotProfile['id'], BotEconomyTargets> = {
  BALANCED: { mineLevel: 6, roboticsLevel: 4, researchLabLevel: 2, shipyardLevel: 3 },
  AGGRESSOR: { mineLevel: 5, roboticsLevel: 4, researchLabLevel: 2, shipyardLevel: 3 },
  TURTLE: { mineLevel: 6, roboticsLevel: 4, researchLabLevel: 2, shipyardLevel: 3 },
  MINER: { mineLevel: 7, roboticsLevel: 4, researchLabLevel: 2, shipyardLevel: 3 },
  AVOIDER: { mineLevel: 7, roboticsLevel: 4, researchLabLevel: 2, shipyardLevel: 3 },
  BUNKERER: { mineLevel: 8, roboticsLevel: 4, researchLabLevel: 2, shipyardLevel: 3 }
};

const FOUNDATIONAL_RESEARCH_TARGETS: ResearchTargetDefinition[] = [
  { type: TechnologyType.ENERGY_TECHNOLOGY, targetLevel: 3 },
  { type: TechnologyType.MATERIAL_TECHNOLOGY, targetLevel: 3 },
  { type: TechnologyType.COMPUTER_TECHNOLOGY, targetLevel: 2 },
  { type: TechnologyType.ADAPTIVE_TECHNOLOGY, targetLevel: 2 },
  { type: TechnologyType.FUSION_DRIVE, targetLevel: 3 },
  { type: TechnologyType.HYPERSPACE_DRIVE, targetLevel: 2 }
];

const BUILDING_PRIORITY_TYPES: BuildingTypeType[] = [
  BuildingType.METAL_MINE,
  BuildingType.CRYSTAL_MINE,
  BuildingType.DEUTERIUM_SYNTHESIZER,
  BuildingType.SOLAR_WIND_GEOTHERMAL,
  BuildingType.NUCLEAR_PLANT,
  BuildingType.FUSION_REACTOR,
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.NANITE_FACTORY,
  BuildingType.SHIPYARD,
  BuildingType.RESEARCH_LAB,
  BuildingType.METAL_STORAGE,
  BuildingType.CRYSTAL_STORAGE,
  BuildingType.DEUTERIUM_TANK,
  BuildingType.BUNKER_NETWORK
];

const RESEARCH_PRIORITY_TYPES: TechnologyTypeType[] = [
  TechnologyType.ENERGY_TECHNOLOGY,
  TechnologyType.MATERIAL_TECHNOLOGY,
  TechnologyType.ASTROPHYSICS_TECHNOLOGY,
  TechnologyType.COMPUTER_TECHNOLOGY,
  TechnologyType.ADAPTIVE_TECHNOLOGY,
  TechnologyType.INTERGALACTIC_RESEARCH_NETWORK,
  TechnologyType.FUSION_DRIVE,
  TechnologyType.HYPERSPACE_DRIVE,
  TechnologyType.HYPERSPACE_TECHNOLOGY
];

const SHIPYARD_PRIORITY_TYPES: Array<{ type: ShipTypeType; amount: number }> = [
  { type: ShipType.SPY_PROBE, amount: 1 },
  { type: ShipType.TRANSPORTER, amount: 1 },
  { type: ShipType.FIGHTER, amount: 1 },
  { type: ShipType.COLONIZER, amount: 1 }
];

export function runBotTurnPhase(galaxy: Galaxy): void {
  const bots = [...galaxy.botPlayerMap.values()]
    .sort((left, right) => left.playerId - right.playerId);

  for (const bot of bots) {
    if (bot.planets.length === 0) {
      continue;
    }
    if (isBotPaused(bot.playerId)) {
      continue;
    }

    const botProfileId = ensureBotProfile(bot);
    const profile = BOT_PROFILES[botProfileId];
    runSingleBotTurn(galaxy, bot, profile);
  }
}

function runSingleBotTurn(galaxy: Galaxy, player: Player, profile: BotProfile): void {
  const counters: BotTurnCounters = {
    total: 0,
    building: 0,
    research: 0,
    shipyard: 0,
    spy: 0,
    colonize: 0,
    attack: 0,
    transport: 0,
    maintenance: 0,
    recycle: 0,
    repair: 0,
    bombard: 0,
    siege: 0,
    guard: 0,
    move: 0
  };
  const blockedKeys = new Set<string>();

  ensureBotMemory(player, galaxy.currentTurn);
  processFarmAttackOutcomes(galaxy, player);
  processSupportRequestOutcomes(galaxy, player, profile);
  const trace: BotDecisionTrace = {
    playerId: player.playerId,
    playerName: player.playerName,
    turn: galaxy.currentTurn,
    profileId: player.botProfileId,
    startingGoal: player.botMemory?.currentGoal ?? null,
    endingGoal: player.botMemory?.currentGoal ?? null,
    actionBudget: {
      max: profile.maxActionsPerTurn,
      used: 0,
      stopReason: null
    },
    chosenActions: [],
    rejectedActions: []
  };
  let stopReason: BotTraceStopReason | null = null;
  let appliedCandidateDetails: Record<string, string | number | boolean | null> | null = null;

  resolveIncomingBotRequests(galaxy, player, profile, trace);
  resolveOutgoingBotDiplomacyProposal(galaxy, player, profile, trace);
  resolveOutgoingBotSupportRequest(galaxy, player, profile, trace);

  while (counters.total < profile.maxActionsPerTurn) {
    const candidates = buildBotCandidates(galaxy, player, profile, counters, blockedKeys)
      .sort((left, right) => right.utility - left.utility || left.kind.localeCompare(right.kind));
    const best = candidates[0];
    if (!best) {
      stopReason = 'no_candidates';
      break;
    }
    const idleFallback = getIdleEconomyFallbackDecision(player, profile, counters, best);
    if (
      best.utility < profile.minUtilityThreshold
      && !idleFallback.allowed
    ) {
      trace.rejectedActions.push({
        kind: best.kind,
        reason: best.reason,
        rejectionType: 'threshold',
        expectedUtility: best.utility,
        details: {
          threshold: profile.minUtilityThreshold,
          requestSummary: summarizeCandidateRequest(best),
          idleFallbackEligible: idleFallback.eligible,
          idleFallbackFloor: idleFallback.floor,
          idleFallbackReason: idleFallback.reason
        }
      });
      stopReason = 'below_threshold';
      break;
    }

    const key = candidateKey(best);
    const context = { galaxy, playerId: player.playerId };
    let applied = false;
    let commandFailureMessage: string | null = null;
    appliedCandidateDetails = null;

    switch (best.kind) {
      case 'building': {
        const result = startBuildingConstruction(context, best.request);
        applied = result.ok;
        commandFailureMessage = result.ok ? null : result.error.message;
        if (applied) {
          counters.building += 1;
        }
        break;
      }
      case 'research': {
        const result = startTechnologyResearch(context, best.request);
        applied = result.ok;
        commandFailureMessage = result.ok ? null : result.error.message;
        if (applied) {
          counters.research += 1;
        }
        break;
      }
      case 'shipyard': {
        const result = startShipyardConstruction(context, best.request);
        applied = result.ok;
        commandFailureMessage = result.ok ? null : result.error.message;
        if (applied) {
          counters.shipyard += 1;
        }
        break;
      }
      case 'spy':
      case 'system_spy':
      case 'colonize':
      case 'attack':
      case 'transport':
      case 'recycle':
      case 'repair':
      case 'bombard':
      case 'siege':
      case 'maintenance':
      case 'guard':
      case 'move': {
        if (best.kind === 'maintenance') {
          const result = createFleetMaintenanceRequest(context, best.fleetId, best.request);
          applied = result.ok;
          commandFailureMessage = result.ok ? null : result.error.message;
          if (applied) {
            counters.maintenance += 1;
          }
          break;
        }

        if (best.kind === 'system_spy') {
          const result = createStarSystemSpyMissions(context, best.request);
          applied = result.ok;
          commandFailureMessage = result.ok ? null : result.error.message;
          if (applied) {
            counters.spy += 1;
            appliedCandidateDetails = {
              launchedFleetCount: result.value.launchedFleetCount,
              systemCoordinates: `${best.request.systemX}:${best.request.systemY}`
            };
          }
          break;
        }

        const result = createFleetMission(context, best.request);
        applied = result.ok;
        commandFailureMessage = result.ok ? null : result.error.message;
        if (applied) {
          if (best.kind === 'spy') {
            counters.spy += 1;
          } else if (best.kind === 'colonize') {
            counters.colonize += 1;
          } else if (best.kind === 'attack') {
            counters.attack += 1;
          } else if (best.kind === 'transport') {
            counters.transport += 1;
          } else if (best.kind === 'recycle') {
            counters.recycle += 1;
          } else if (best.kind === 'repair') {
            counters.repair += 1;
          } else if (best.kind === 'bombard') {
            counters.bombard += 1;
          } else if (best.kind === 'siege') {
            counters.siege += 1;
          } else if (best.kind === 'guard') {
            counters.guard += 1;
          } else {
            counters.move += 1;
          }
        }
        break;
      }
    }

    if (!applied) {
      blockedKeys.add(key);
      pushRejectedActionTrace(trace.rejectedActions, best, 'command_failed', commandFailureMessage);
      continue;
    }

    counters.total += 1;
    rememberFarmAttackLaunchFromCandidate(galaxy, player, best, galaxy.currentTurn);
    updateBotMemoryAfterAction(player, galaxy.currentTurn, best);
    trace.chosenActions.push({
      kind: best.kind,
      reason: best.reason,
      expectedUtility: best.utility,
      goalType: best.goalType,
      requestSummary: summarizeCandidateRequest(best),
      details: {
        idleFallbackApplied: idleFallback.used,
        idleFallbackFloor: idleFallback.floor,
        threshold: profile.minUtilityThreshold,
        ...(appliedCandidateDetails ?? {})
      }
    });
  }

  if (stopReason === null && counters.total >= profile.maxActionsPerTurn) {
    stopReason = 'action_cap';
  }
  trace.actionBudget.used = counters.total;
  trace.actionBudget.stopReason = stopReason;
  trace.endingGoal = player.botMemory?.currentGoal ?? null;
  recordBotDecisionTrace(trace);
}

function rememberFarmAttackLaunchFromCandidate(
  galaxy: Galaxy,
  player: Player,
  candidate: BotCandidate,
  currentTurn: number
): void {
  if (candidate.kind !== 'attack') {
    return;
  }

  const targetPlanet = resolvePlanetAtCoordinates(galaxy, candidate.request.target);
  if (!targetPlanet || targetPlanet.info.ownerId === null) {
    return;
  }

  const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
  if (!targetOwner) {
    return;
  }

  const targetStatus = resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId);
  if (!isFarmTarget(targetOwner, targetStatus)) {
    return;
  }

  const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
  rememberFarmAttackLaunch(
    player,
    candidate.request.target,
    currentTurn,
    estimateShipSelectionCombatStrength(candidate.request.ships),
    report
  );
}

function buildBotCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  const diplomacyContexts = buildBotDiplomacyContexts(galaxy, player);

  return [
    ...buildResearchCandidates(player, profile, counters, blockedKeys),
    ...buildBuildingCandidates(player, profile, counters, blockedKeys),
    ...buildShipyardCandidates(player, profile, counters, blockedKeys),
    ...buildStarSystemSpyCandidates(galaxy, player, profile, counters, blockedKeys, diplomacyContexts),
    ...buildSpyCandidates(galaxy, player, profile, counters, blockedKeys, diplomacyContexts),
    ...buildColonizeCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildAttackCandidates(galaxy, player, profile, counters, blockedKeys, diplomacyContexts),
    ...buildTransportCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildMaintenanceCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildRecycleCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildRepairCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildBombardCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildSiegeCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildGuardCandidates(galaxy, player, profile, counters, blockedKeys),
    ...buildMoveCandidates(galaxy, player, profile, counters, blockedKeys)
  ];
}

export type IdleEconomyFallbackDecision = {
  eligible: boolean;
  allowed: boolean;
  used: boolean;
  floor: number | null;
  reason: string;
};

function getIdleEconomyFallbackDecision(
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  candidate: BotCandidate
): IdleEconomyFallbackDecision {
  const hasQueuedWork = player.planets.some((planet) =>
    planet.rBDSFTQ.buildingQueue.length > 0
    || planet.rBDSFTQ.shipyardQueue.length > 0
    || planet.rBDSFTQ.currentResearchQueue !== null
  );
  return evaluateIdleEconomyFallbackDecision(
    candidate.kind,
    profile,
    counters.total,
    player.fleets.length,
    hasQueuedWork,
    candidate.utility
  );
}

export function evaluateIdleEconomyFallbackDecision(
  candidateKind: BotCandidate['kind'],
  profile: BotProfile,
  actionsUsed: number,
  fleetsCount: number,
  hasQueuedWork: boolean,
  utility: number
): IdleEconomyFallbackDecision {
  if (candidateKind !== 'building' && candidateKind !== 'research') {
    return {
      eligible: false,
      allowed: false,
      used: false,
      floor: null,
      reason: 'not_economy_candidate'
    };
  }

  if (actionsUsed > 0) {
    return {
      eligible: false,
      allowed: false,
      used: false,
      floor: null,
      reason: 'action_already_taken'
    };
  }

  if (fleetsCount > 0) {
    return {
      eligible: false,
      allowed: false,
      used: false,
      floor: null,
      reason: 'has_fleets'
    };
  }

  if (hasQueuedWork) {
    return {
      eligible: false,
      allowed: false,
      used: false,
      floor: null,
      reason: 'has_queued_work'
    };
  }

  const floor = calculateIdleEconomyFallbackFloor(profile, candidateKind);
  const allowed = utility >= floor;
  return {
    eligible: true,
    allowed,
    used: allowed && utility < profile.minUtilityThreshold,
    floor,
    reason: allowed ? 'within_fallback_window' : 'below_fallback_floor'
  };
}

function calculateIdleEconomyFallbackFloor(
  profile: BotProfile,
  candidateKind: 'building' | 'research'
): number {
  if (candidateKind === 'research') {
    return Math.max(-1.5, profile.minUtilityThreshold - 4.25);
  }

  return Math.max(0, profile.minUtilityThreshold - 3.25);
}

function resolveIncomingBotRequests(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  trace: BotDecisionTrace
): void {
  const context = { galaxy, playerId: player.playerId };

  const pendingJumpGateRequests = [...galaxy.jumpGateRequests]
    .filter((request) =>
      request.state === DiplomaticProposalState.PENDING
    );
  for (const request of pendingJumpGateRequests) {
    if (request.toPlayerId !== player.playerId) {
      continue;
    }

    const shouldApprove = shouldApproveIncomingJumpGateRequest(galaxy, player, request.totalShips, request.targetCoordinates);
    const result = shouldApprove
      ? approveJumpGateRequestCommand(context, request.requestId)
      : rejectJumpGateRequestCommand(context, request.requestId);
    if (!result.ok) {
      trace.rejectedActions.push({
        kind: shouldApprove ? 'approve-jump-gate' : 'reject-jump-gate',
        reason: `Jump Gate request #${request.requestId}`,
        rejectionType: 'command_failed',
        expectedUtility: null,
        details: { message: result.error.message, requestSummary: `Jump Gate request #${request.requestId}` }
      });
      continue;
    }

    trace.chosenActions.push({
      kind: shouldApprove ? 'approve-jump-gate' : 'reject-jump-gate',
      reason: shouldApprove ? 'Approved incoming Jump Gate request.' : 'Rejected risky incoming Jump Gate request.',
      expectedUtility: 0,
      goalType: null,
      requestSummary: `Jump Gate request #${request.requestId} -> ${request.targetPlanetName}`,
      details: {
        requestId: request.requestId,
        approved: shouldApprove,
        targetCoordinates: `${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`
      }
    });
  }

  const pendingMaintenanceRequests = [...galaxy.maintenanceRequests]
    .filter((request) =>
      request.state === DiplomaticProposalState.PENDING
    );
  for (const request of pendingMaintenanceRequests) {
    if (request.toPlayerId !== player.playerId) {
      continue;
    }

    const decision = decideIncomingMaintenanceRequest(galaxy, player, profile, request.requestId);
    const result = decision.approve
      ? approveFleetMaintenanceRequest(context, request.requestId, decision.override)
      : rejectFleetMaintenanceRequest(context, request.requestId);
    if (!result.ok) {
      trace.rejectedActions.push({
        kind: decision.approve ? 'approve-maintenance' : 'reject-maintenance',
        reason: decision.reason,
        rejectionType: 'command_failed',
        expectedUtility: null,
        details: { message: result.error.message, requestSummary: `Maintenance request #${request.requestId}` }
      });
      continue;
    }

    trace.chosenActions.push({
      kind: decision.approve ? 'approve-maintenance' : 'reject-maintenance',
      reason: decision.reason,
      expectedUtility: 0,
      goalType: null,
      requestSummary: `Maintenance request #${request.requestId} @ ${request.targetPlanetName}`,
      details: {
        requestId: request.requestId,
        approved: decision.approve,
        targetCoordinates: `${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`
      }
    });
  }

  const pendingSupportRequests = [...galaxy.supportRequests]
    .filter((request) =>
      request.state === DiplomaticProposalState.PENDING
      && request.toPlayerId === player.playerId
    );
  for (const request of pendingSupportRequests) {
    const decision = decideIncomingSupportRequest(galaxy, player, profile, request);
    const applied = decision.approve
      ? approveSupportRequestForBot(galaxy, request, decision.approvedResources)
      : rejectSupportRequestForBot(request, decision.reason);
    if (!applied.ok) {
      trace.rejectedActions.push({
        kind: decision.approve ? 'approve-support' : 'reject-support',
        reason: decision.reason,
        rejectionType: 'command_failed',
        expectedUtility: null,
        details: { message: applied.error, requestSummary: `Support request #${request.requestId}` }
      });
      continue;
    }

    trace.chosenActions.push({
      kind: decision.approve ? 'approve-support' : 'reject-support',
      reason: decision.reason,
      expectedUtility: decision.utility,
      goalType: null,
      requestSummary: `Support request #${request.requestId} ${request.supportType} @ ${request.targetPlanetName}`,
      details: {
        requestId: request.requestId,
        approved: decision.approve,
        supportType: request.supportType,
        targetCoordinates: `${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}`
      }
    });
  }

  const pendingDiplomaticProposals = [...galaxy.diplomaticProposals]
    .filter((proposal) =>
      proposal.state === DiplomaticProposalState.PENDING
      && proposal.toPlayerId === player.playerId
    );
  for (const proposal of pendingDiplomaticProposals) {
    const decision = decideIncomingDiplomaticProposal(galaxy, player, profile, proposal);
    const result = decision.approve
      ? approveDiplomaticProposalCommand(context, { proposalId: proposal.proposalId })
      : rejectDiplomaticProposalCommand(context, { proposalId: proposal.proposalId });
    if (!result.ok) {
      trace.rejectedActions.push({
        kind: decision.traceKind,
        reason: decision.reason,
        rejectionType: 'command_failed',
        expectedUtility: decision.utility,
        details: {
          message: result.error.message,
          requestSummary: `Diplomacy proposal #${proposal.proposalId} ${proposal.requestedStatus}`,
          utility: Number.isFinite(decision.utility) ? Number(decision.utility.toFixed(2)) : null
        }
      });
      continue;
    }

    trace.chosenActions.push({
      kind: decision.traceKind,
      reason: decision.reason,
      expectedUtility: Number.isFinite(decision.utility) ? decision.utility : 0,
      goalType: null,
      requestSummary: `${proposal.requestedStatus} proposal #${proposal.proposalId} from player ${proposal.fromPlayerId}`,
      details: {
        proposalId: proposal.proposalId,
        approved: decision.approve,
        requestedStatus: proposal.requestedStatus,
        fromPlayerId: proposal.fromPlayerId
      }
    });
  }
}

function resolveOutgoingBotDiplomacyProposal(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  trace: BotDecisionTrace
): void {
  const candidate = buildBotDiplomacyProposalCandidate(galaxy, player, profile);
  if (!candidate) {
    return;
  }

  const result = createDiplomaticProposalCommand(
    { galaxy, playerId: player.playerId },
    {
      targetPlayerId: candidate.targetPlayerId,
      requestedStatus: candidate.requestedStatus
    }
  );
  if (!result.ok) {
    trace.rejectedActions.push({
      kind: candidate.requestedStatus === DiplomaticStatus.PEACE ? 'propose-peace' : 'propose-alliance',
      reason: candidate.reason,
      rejectionType: 'command_failed',
      expectedUtility: candidate.utility,
      details: {
        message: result.error.message,
        requestSummary: `${candidate.requestedStatus} -> player ${candidate.targetPlayerId}`
      }
    });
    return;
  }

  // Bot proposals are created during end-turn resolution, so they need one
  // extra expiry turn to remain visible for the receiving human player.
  result.value.proposal.expiresOnTurn += 1;

  appendRecentDiplomacyTarget(
    player,
    candidate.targetPlayerId,
    candidate.requestedStatus as 'PEACE' | 'ALLIED',
    galaxy.currentTurn
  );
  trace.chosenActions.push({
    kind: candidate.requestedStatus === DiplomaticStatus.PEACE ? 'propose-peace' : 'propose-alliance',
    reason: candidate.reason,
    expectedUtility: candidate.utility,
    goalType: null,
    requestSummary: `${candidate.requestedStatus} proposal -> player ${candidate.targetPlayerId}`,
    details: {
      requestedStatus: candidate.requestedStatus,
      targetPlayerId: candidate.targetPlayerId,
      proposalId: result.value.proposal.proposalId
    }
  });
}

function resolveOutgoingBotSupportRequest(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  trace: BotDecisionTrace
): void {
  if (hasBotCreatedSupportRequestThisTurn(galaxy, player.playerId)) {
    return;
  }
  if (countBotUnresolvedSupportRequests(galaxy, player.playerId) >= 2) {
    return;
  }

  const candidate = buildBestBotSupportRequestCandidate(galaxy, player, profile);
  if (!candidate) {
    return;
  }

  const created = createBotSupportRequest(galaxy, player, candidate);
  if (!created.ok) {
    trace.rejectedActions.push({
      kind: 'request-support',
      reason: candidate.reason,
      rejectionType: 'command_failed',
      expectedUtility: candidate.utility,
      details: {
        message: created.error,
        requestSummary: `${candidate.supportType} -> player ${candidate.targetPlayerId}`
      }
    });
    return;
  }

  trace.chosenActions.push({
    kind: 'request-support',
    reason: candidate.reason,
    expectedUtility: candidate.utility,
    goalType: null,
    requestSummary: `${candidate.supportType} -> player ${candidate.targetPlayerId} @ ${candidate.targetCoordinates.x}:${candidate.targetCoordinates.y}:${candidate.targetCoordinates.z}`,
    details: {
      supportType: candidate.supportType,
      targetPlayerId: candidate.targetPlayerId,
      requestId: created.request.requestId
    }
  });
}

function processSupportRequestOutcomes(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): void {
  const memory = player.botMemory;
  if (!memory) {
    return;
  }

  const processedIds = new Set(memory.processedSupportOutcomeIds ?? []);
  for (const request of galaxy.supportRequests) {
    if (request.fromPlayerId !== player.playerId && request.toPlayerId !== player.playerId) {
      continue;
    }
    if (processedIds.has(request.requestId)) {
      continue;
    }

    const terminal = request.fulfilledTurn !== null
      || request.state === DiplomaticProposalState.REJECTED
      || request.state === DiplomaticProposalState.CANCELLED
      || request.state === DiplomaticProposalState.EXPIRED;
    const acceptedMilestone = request.state === DiplomaticProposalState.ACCEPTED
      && request.acceptedTurn !== null
      && request.fulfilledTurn === null;
    if (!terminal && !acceptedMilestone) {
      continue;
    }

    const counterpartId = request.fromPlayerId === player.playerId
      ? request.toPlayerId
      : request.fromPlayerId;
    const baseMagnitude = calculateSupportGoodwillMagnitude(galaxy, player, profile, request);
    let delta = 0;

    if (request.fromPlayerId === player.playerId) {
      if (request.fulfilledTurn !== null) {
        delta = baseMagnitude;
      } else if (request.state === DiplomaticProposalState.ACCEPTED) {
        delta = Math.max(1, Math.ceil(baseMagnitude * 0.5));
      } else if (request.state === DiplomaticProposalState.REJECTED || request.state === DiplomaticProposalState.EXPIRED) {
        delta = -Math.max(1, Math.ceil(baseMagnitude * 0.75));
      }
    } else if (request.toPlayerId === player.playerId) {
      if (request.fulfilledTurn !== null) {
        delta = Math.max(1, Math.ceil(baseMagnitude * 0.3));
      } else if (request.state === DiplomaticProposalState.REJECTED && request.resolutionNote?.startsWith('Rejected') === false) {
        delta = -1;
      }
    }

    if (delta !== 0) {
      adjustBotGoodwill(player, counterpartId, delta, galaxy.currentTurn);
    }

    appendProcessedSupportOutcome(player, request.requestId);
  }
}

function processFarmAttackOutcomes(galaxy: Galaxy, player: Player): void {
  const memory = player.botMemory;
  if (!memory) {
    return;
  }

  let lastProcessedFleetReportId = memory.lastProcessedFleetReportId ?? 0;
  const reports = player.reports
    .filter((report) => report.reportType === ReportType.FLEET_REPORT && report.reportId > lastProcessedFleetReportId)
    .sort((left, right) => left.reportId - right.reportId);

  for (const report of reports) {
    lastProcessedFleetReportId = Math.max(lastProcessedFleetReportId, report.reportId);
    if (!report.sourceCoordinates || !('body' in report) || typeof report.body !== 'string') {
      continue;
    }

    const targetCoordinates = report.sourceCoordinates;
    const targetPlanet = resolvePlanetAtCoordinates(galaxy, targetCoordinates);
    if (!targetPlanet || targetPlanet.info.ownerId === null) {
      continue;
    }

    const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
    if (!targetOwner) {
      continue;
    }
    const targetStatus = resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId);
    if (!isFarmTarget(targetOwner, targetStatus)) {
      continue;
    }

    const parsedOutcome = parseFarmAttackReportBody(report.body);
    if (!parsedOutcome) {
      continue;
    }

    rememberFarmAttackOutcome(player, targetCoordinates, report.createdTurn, parsedOutcome);
  }

  memory.lastProcessedFleetReportId = lastProcessedFleetReportId > 0 ? lastProcessedFleetReportId : null;
}

function parseFarmAttackReportBody(body: string): {
  enemyDefenceSurvivors: number;
  enemyShipSurvivors: number;
  lastLossBracket: BotFarmLossBracket;
  nextForceMultiplier: number;
} | null {
  const ownShipMatch = body.match(OWN_SHIP_LOSS_REGEX);
  const enemyDefenceMatch = body.match(ENEMY_DEFENCE_SURVIVOR_REGEX);
  const enemyShipMatch = body.match(ENEMY_SHIP_SURVIVOR_REGEX);
  if (!ownShipMatch || !enemyDefenceMatch || !enemyShipMatch) {
    return null;
  }

  const survivingOwnShips = Number(ownShipMatch[1]);
  const initialOwnShips = Number(ownShipMatch[2]);
  const destroyedOwnShips = Number(ownShipMatch[3]);
  const enemyShipSurvivors = Number(enemyShipMatch[1]);
  const enemyDefenceSurvivors = Number(enemyDefenceMatch[1]);
  if (
    !Number.isFinite(survivingOwnShips)
    || !Number.isFinite(initialOwnShips)
    || !Number.isFinite(destroyedOwnShips)
    || !Number.isFinite(enemyShipSurvivors)
    || !Number.isFinite(enemyDefenceSurvivors)
    || initialOwnShips <= 0
  ) {
    return null;
  }

  const battleResultMatch = body.match(/Battle result: ([A-Za-z_]+)/);
  const battleResult = battleResultMatch?.[1]?.toLowerCase() ?? '';
  const defeat = battleResult === 'defender' || survivingOwnShips <= 0;
  const lossRatio = defeat
    ? 1
    : Math.max(0, Math.min(1, destroyedOwnShips / initialOwnShips));
  const lastLossBracket = resolveFarmLossBracket(lossRatio, defeat);

  return {
    enemyDefenceSurvivors: Math.max(0, Math.floor(enemyDefenceSurvivors)),
    enemyShipSurvivors: Math.max(0, Math.floor(enemyShipSurvivors)),
    lastLossBracket,
    nextForceMultiplier: resolveFarmForceMultiplier(lastLossBracket)
  };
}

function resolveFarmLossBracket(
  lossRatio: number,
  defeat: boolean
): BotFarmLossBracket {
  if (defeat) {
    return 'DEFEAT';
  }
  if (lossRatio <= 0) {
    return 'NONE';
  }
  if (lossRatio <= 0.25) {
    return 'LIGHT';
  }
  if (lossRatio <= 0.6) {
    return 'MEDIUM';
  }
  return 'HEAVY';
}

function resolveFarmForceMultiplier(lossBracket: BotFarmLossBracket | null): number {
  switch (lossBracket) {
    case 'NONE':
      return 1.2;
    case 'LIGHT':
      return 1.5;
    case 'MEDIUM':
      return 2;
    case 'HEAVY':
    case 'DEFEAT':
      return 4;
    default:
      return 1;
  }
}

function rememberFarmAttackOutcome(
  player: Player,
  targetCoordinates: BotMemoryCoordinates,
  createdTurn: number,
  outcome: {
    enemyDefenceSurvivors: number;
    enemyShipSurvivors: number;
    lastLossBracket: BotFarmLossBracket;
    nextForceMultiplier: number;
  }
): void {
  const record = getOrCreateFarmTargetRecord(player, targetCoordinates);
  if (!record) {
    return;
  }

  record.lastAttackTurn = Number.isInteger(createdTurn) ? createdTurn : record.lastAttackTurn;
  record.lastKnownDefenceCount = outcome.enemyDefenceSurvivors;
  record.lastKnownShipCount = outcome.enemyShipSurvivors;
  record.lastKnownOpened = outcome.enemyDefenceSurvivors <= 0 && outcome.enemyShipSurvivors <= 0;
  record.lastLossBracket = outcome.lastLossBracket;
  record.nextForceMultiplier = record.lastKnownOpened ? 1 : outcome.nextForceMultiplier;
}

function rememberFarmAttackLaunch(
  player: Player,
  targetCoordinates: BotMemoryCoordinates,
  currentTurn: number,
  sentCombatStrength: number,
  report: EspionageReportData | null
): void {
  const record = getOrCreateFarmTargetRecord(player, targetCoordinates);
  if (!record) {
    return;
  }

  record.lastAttackTurn = currentTurn;
  record.nextAllowedAttackTurn = currentTurn + FARM_ATTACK_COOLDOWN_TURNS;
  record.lastSentCombatStrength = Math.max(0, sentCombatStrength);
  if (report) {
    record.lastKnownDefenceCount = report.totalDefencesAmount;
    record.lastKnownShipCount = report.totalShipsAmount;
    record.lastKnownOpened = report.totalDefencesAmount <= 0 && report.totalShipsAmount <= 0;
    if (record.lastKnownOpened) {
      record.nextForceMultiplier = 1;
    }
  }
}

function getOrCreateFarmTargetRecord(
  player: Player,
  targetCoordinates: BotMemoryCoordinates
): BotFarmTargetRecord | null {
  const memory = player.botMemory;
  if (!memory) {
    return null;
  }

  const existing = memory.farmTargets?.find((entry) => sameCoordinates(entry.targetCoordinates, targetCoordinates)) ?? null;
  if (existing) {
    return existing;
  }

  const nextRecord: BotFarmTargetRecord = {
    targetCoordinates: { ...targetCoordinates },
    lastAttackTurn: null,
    nextAllowedAttackTurn: null,
    lastSentCombatStrength: null,
    lastKnownDefenceCount: null,
    lastKnownShipCount: null,
    lastKnownOpened: false,
    nextForceMultiplier: 1,
    lastLossBracket: null
  };
  const records = memory.farmTargets ?? [];
  records.push(nextRecord);
  while (records.length > MAX_BOT_FARM_TARGETS) {
    records.shift();
  }
  memory.farmTargets = records;
  return nextRecord;
}

function getFarmTargetRecord(
  memory: BotMemory | null,
  targetCoordinates: BotMemoryCoordinates
): BotFarmTargetRecord | null {
  if (!memory) {
    return null;
  }

  return memory.farmTargets?.find((entry) => sameCoordinates(entry.targetCoordinates, targetCoordinates)) ?? null;
}

function resolvePlanetAtCoordinates(
  galaxy: Galaxy,
  coordinates: BotMemoryCoordinates
): Planet | null {
  return flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), coordinates)) ?? null;
}

function decideIncomingSupportRequest(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  request: SupportRequest
): {
  approve: boolean;
  approvedResources: ResourcesPackType | null;
  reason: string;
  utility: number;
} {
  const requester = resolvePlayerById(galaxy, request.fromPlayerId);
  if (!requester) {
    return {
      approve: false,
      approvedResources: null,
      reason: 'Rejected support request because the requester no longer exists.',
      utility: 0
    };
  }

  const status = resolveDiplomaticStatus(galaxy, player.playerId, requester.playerId);
  const goodwill = getBotGoodwill(player, requester.playerId);
  if (!isSupportStatusAllowed(request.supportType, status)) {
    return {
      approve: false,
      approvedResources: null,
      reason: 'Rejected support request from a non-eligible diplomatic relation.',
      utility: 0
    };
  }

  if (goodwill <= -40) {
    return {
      approve: false,
      approvedResources: null,
      reason: 'Rejected support request because trust is too low.',
      utility: 0
    };
  }

  if (request.supportType === 'RESOURCE_SUPPORT') {
    const approval = resolveBotResourceSupportApproval(galaxy, player, profile, request);
    if (!approval || !supportResourcesHasAnyValue(approval)) {
      return {
        approve: false,
        approvedResources: null,
        reason: 'Rejected resource support request because current reserves are too tight.',
        utility: 0
      };
    }

    const approvedValue = estimateResourceValue(approval);
    return {
      approve: true,
      approvedResources: approval,
      reason: approvedValue >= estimateResourceValue(request.requestedResources)
        ? 'Approved full resource support request.'
        : 'Approved partial resource support request.',
      utility: approvedValue / 100
    };
  }

  if (request.supportType === 'PLANET_REPAIR') {
    const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), request.targetCoordinates)) ?? null;
    const repairNeed = targetPlanet ? estimateRepairNeed(galaxy, requester, targetPlanet) : 0;
    const launchReadiness = resolveRepairSupportLaunchReadiness(player, request.targetCoordinates);
    if (repairNeed <= 0 || !launchReadiness || launchReadiness.distance > 10) {
      return {
        approve: false,
        approvedResources: null,
        reason: 'Rejected repair support request because timely help is not realistic.',
        utility: 0
      };
    }

    return {
      approve: true,
      approvedResources: null,
      reason: 'Accepted repair support request for a reachable damaged planet.',
      utility: Math.max(1, repairNeed / 150)
    };
  }

  if (request.supportType === 'PLANET_DEFENSE') {
    const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), request.targetCoordinates)) ?? null;
    const safeDefenseCapacity = calculateAvailableDefenseSupportPower(player);
    const threat = targetPlanet ? estimateNearbyThreat(galaxy, requester, targetPlanet) : null;
    const targetDefenseStrength = targetPlanet ? estimatePlanetCombatStrength(targetPlanet) : 0;
    const launchReadiness = resolveDefenseSupportLaunchReadiness(
      player,
      profile,
      request.targetCoordinates,
      threat?.reportStrength ?? 0,
      targetDefenseStrength
    );
    if (!launchReadiness || launchReadiness.distance > 5 || safeDefenseCapacity <= 0 || !canBotSpareDefenseSupport(galaxy, player, profile)) {
      return {
        approve: false,
        approvedResources: null,
        reason: 'Rejected defense support request because local defense reserves are insufficient.',
        utility: 0
      };
    }

    return {
      approve: true,
      approvedResources: null,
      reason: threat
        ? 'Accepted defense support request for a threatened allied planet.'
        : 'Accepted defense support request for a reachable allied planet.',
      utility: threat ? threat.pressure / 4 : 2
    };
  }

  if (!isOffensiveSupportTargetValidForBot(galaxy, player, request)) {
    return {
      approve: false,
      approvedResources: null,
      reason: 'Rejected offensive support request because the target is no longer valid.',
      utility: 0
    };
  }

  const launchCandidate = resolveOffensiveSupportLaunchReadiness(galaxy, player, profile, request);
  if (!launchCandidate) {
    return {
      approve: false,
      approvedResources: null,
      reason: 'Rejected offensive support request because no likely 5-turn launch exists.',
      utility: 0
    };
  }

  return {
    approve: true,
    approvedResources: null,
    reason: `Accepted offensive support request with likely ${request.missionType} launch readiness.`,
    utility: Math.max(2, launchCandidate.selectionStrength / 20)
  };
}

function approveSupportRequestForBot(
  galaxy: Galaxy,
  request: SupportRequest,
  approvedResources: ResourcesPackType | null
): { ok: true } | { ok: false; error: string } {
  if (request.state !== DiplomaticProposalState.PENDING) {
    return { ok: false, error: 'Support request is no longer pending.' };
  }

  if (request.supportType === 'RESOURCE_SUPPORT') {
    const approval = normalizeSupportResources(approvedResources ?? request.requestedResources);
    if (!supportResourcesHasAnyValue(approval)) {
      return { ok: false, error: 'Approved support must include at least one resource.' };
    }

    const sourcePlanet = resolveBotBestResourceSupportSourcePlanet(galaxy, request.toPlayerId, approval);
    if (!sourcePlanet) {
      return { ok: false, error: 'No valid planet can reserve the approved support.' };
    }

    sourcePlanet.rBDSFTQ.resources.subtractResourcePack(approval);
    request.approvedResources = approval;
    request.reservedSourcePlanetName = sourcePlanet.basicInfo.name;
    request.reservedSourceCoordinates = coordinatesOfPlanet(sourcePlanet);
    request.acceptedTurn = galaxy.currentTurn;
    request.executionDueTurn = galaxy.currentTurn + 1;
    request.executionExpiresOnTurn = galaxy.currentTurn + 1;
    request.state = DiplomaticProposalState.ACCEPTED;
    request.resolutionNote = `Reserved on ${sourcePlanet.basicInfo.name}. Delivery scheduled for turn ${request.executionDueTurn}.`;
    return { ok: true };
  }

  request.acceptedTurn = galaxy.currentTurn;
  request.executionDueTurn = galaxy.currentTurn + 1;
  request.executionExpiresOnTurn = galaxy.currentTurn + 5;
  request.state = DiplomaticProposalState.ACCEPTED;
  request.resolutionNote = isOffensiveSupportRequest(request)
    ? `Offensive support accepted. Auto-launch will be attempted until turn ${request.executionExpiresOnTurn}.`
    : request.supportType === 'PLANET_REPAIR'
      ? `Repair support acknowledged for ${request.targetPlanetName}.`
      : `Defense support acknowledged for ${request.targetPlanetName}.`;
  return { ok: true };
}

function rejectSupportRequestForBot(request: SupportRequest, reason: string): { ok: true } {
  request.state = DiplomaticProposalState.REJECTED;
  request.resolutionNote = reason;
  return { ok: true };
}

function buildBestBotSupportRequestCandidate(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): BotSupportRequestCandidate | null {
  const candidates = [
    ...buildBotResourceSupportRequestCandidates(galaxy, player, profile),
    ...buildBotRepairSupportRequestCandidates(galaxy, player, profile),
    ...buildBotDefenseSupportRequestCandidates(galaxy, player, profile),
    ...buildBotOffensiveSupportRequestCandidates(galaxy, player, profile)
  ].sort((left, right) => right.utility - left.utility);

  return candidates[0] ?? null;
}

function buildBotResourceSupportRequestCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): BotSupportRequestCandidate[] {
  const candidates: BotSupportRequestCandidate[] = [];
  const economyTargets = BOT_ECONOMY_TARGETS[profile.id];

  for (const planet of player.planets) {
    const economyState = buildPlanetEconomyState(planet, player, profile);
    const criticalBuildingType = resolveCriticalEconomySupportBuildingType(planet, player, economyState, economyTargets);
    if (!criticalBuildingType) {
      continue;
    }

    const blueprint = BUILDING_BLUEPRINTS.get(criticalBuildingType);
    if (!blueprint) {
      continue;
    }

    const nextLevel = planet.getBuildingLevel(criticalBuildingType) + 1;
    const targetCost = blueprint.getCostForLevel(nextLevel);
    const missing = new ResourcesPack(
      Math.max(0, targetCost.metal - planet.rBDSFTQ.resources.metal),
      Math.max(0, targetCost.crystal - planet.rBDSFTQ.resources.crystal),
      Math.max(0, targetCost.deuterium - planet.rBDSFTQ.resources.deuterium)
    );
    if (!supportResourcesHasAnyValue(missing)) {
      continue;
    }

    const localIncomeValue = Math.max(1, estimatePlanetIncomeValue(planet, player, profile));
    const missingTurns = estimateResourceValue(missing) / localIncomeValue;
    if (missingTurns <= 10) {
      continue;
    }

    const provider = resolvePreferredSupportProvider(
      galaxy,
      player,
      'RESOURCE_SUPPORT',
      coordinatesOfPlanet(planet),
      (ally, allyProfile) => estimateAllyResourceSupportScore(ally, allyProfile, planet, missing)
    );
    if (!provider) {
      continue;
    }

    candidates.push({
      supportType: 'RESOURCE_SUPPORT',
      utility: 18 + missingTurns + provider.score,
      reason: `Request resource support to unblock ${criticalBuildingType} on ${planet.basicInfo.name}`,
      targetPlayerId: provider.player.playerId,
      targetCoordinates: coordinatesOfPlanet(planet),
      requestedResources: missing,
      missionType: null,
      minimumShips: [],
      bombardmentPriorities: null
    });
  }

  return candidates;
}

function buildBotRepairSupportRequestCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): BotSupportRequestCandidate[] {
  const candidates: BotSupportRequestCandidate[] = [];

  for (const planet of player.planets) {
    const repairNeed = estimateRepairNeed(galaxy, player, planet);
    if (repairNeed <= 0) {
      continue;
    }

    const localRepairCapability = estimateLocalRepairCapability(galaxy, player, planet);
    if (repairNeed <= Math.max(100, localRepairCapability * 6)) {
      continue;
    }

    const provider = resolvePreferredSupportProvider(
      galaxy,
      player,
      'PLANET_REPAIR',
      coordinatesOfPlanet(planet),
      (ally) => estimateAllyRepairSupportScore(ally, planet)
    );
    if (!provider || provider.distance === null || provider.distance > 10) {
      continue;
    }

    candidates.push({
      supportType: 'PLANET_REPAIR',
      utility: (repairNeed / 120) + provider.score,
      reason: `Request repair support for ${planet.basicInfo.name}`,
      targetPlayerId: provider.player.playerId,
      targetCoordinates: coordinatesOfPlanet(planet),
      requestedResources: new ResourcesPack(0, 0, 0),
      missionType: null,
      minimumShips: [],
      bombardmentPriorities: null
    });
  }

  return candidates;
}

function buildBotDefenseSupportRequestCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): BotSupportRequestCandidate[] {
  const candidates: BotSupportRequestCandidate[] = [];

  for (const planet of player.planets) {
    const threat = estimateNearbyThreat(galaxy, player, planet);
    const localDefense = estimatePlanetCombatStrength(planet);
    if (!threat || threat.pressure < Math.max(18, localDefense * 0.5)) {
      continue;
    }

    const provider = resolvePreferredSupportProvider(
      galaxy,
      player,
      'PLANET_DEFENSE',
      coordinatesOfPlanet(planet),
      (ally) => estimateAllyDefenseSupportScore(ally, planet)
    );
    if (!provider || provider.distance === null || provider.distance > 5) {
      continue;
    }

    candidates.push({
      supportType: 'PLANET_DEFENSE',
      utility: (threat.pressure / 3) + provider.score,
      reason: `Request defense support for threatened planet ${planet.basicInfo.name}`,
      targetPlayerId: provider.player.playerId,
      targetCoordinates: coordinatesOfPlanet(planet),
      requestedResources: new ResourcesPack(0, 0, 0),
      missionType: null,
      minimumShips: [],
      bombardmentPriorities: null
    });
  }

  return candidates;
}

function buildBotOffensiveSupportRequestCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): BotSupportRequestCandidate[] {
  const candidates: BotSupportRequestCandidate[] = [];
  const farmAttackUnlocked = isFarmAttackUnlocked(player, profile);

  for (const targetPlanet of collectForeignPlanets(galaxy, player.playerId)) {
    if (targetPlanet.info.ownerId === null) {
      continue;
    }

    const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
    if (!targetOwner) {
      continue;
    }

    const status = resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId);
    if (status !== DiplomaticStatus.WAR && status !== DiplomaticStatus.NEUTRAL && status !== DiplomaticStatus.PASSIVE) {
      continue;
    }

    const farmTarget = isFarmTarget(targetOwner, status);
    if (farmTarget && !farmAttackUnlocked) {
      continue;
    }

    const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
    if (!report) {
      continue;
    }

    const ownBestAttack = estimateBestOwnOffensiveStrength(player, profile, targetPlanet, report);
    const defenderStrength = Math.max(1, estimateReportCombatStrength(report));
    if (ownBestAttack >= defenderStrength * 0.95) {
      continue;
    }

    const requestType = resolveBotOffensiveSupportType(status, report, farmTarget);
    const provider = resolvePreferredSupportProvider(
      galaxy,
      player,
      requestType,
      coordinatesOfPlanet(targetPlanet),
      (ally, allyProfile) => estimateAllyOffensiveSupportScore(ally, allyProfile, targetPlanet, report, requestType)
    );
    if (!provider || !provider.offensiveSelection || provider.distance === null) {
      continue;
    }

    candidates.push({
      supportType: requestType,
      utility: 10 + (provider.selectionStrength / 18) + provider.score + (estimateBombardTargetValue(report) / 40),
      reason: `Request ${provider.missionType} support against ${targetPlanet.basicInfo.name}`,
      targetPlayerId: provider.player.playerId,
      targetCoordinates: coordinatesOfPlanet(targetPlanet),
      requestedResources: new ResourcesPack(0, 0, 0),
      missionType: provider.missionType,
      minimumShips: provider.offensiveSelection.map((entry) => ({
        type: entry.type,
        amount: entry.undamagedAmount + entry.damagedAmount
      })),
      bombardmentPriorities: requestType === 'ATTACK_TARGET'
        ? null
        : defaultBombardmentPrioritiesForProfile(profile, requestType === 'SIEGE_TARGET')
    });
  }

  return candidates;
}

function createBotSupportRequest(
  galaxy: Galaxy,
  player: Player,
  candidate: BotSupportRequestCandidate
): { ok: true; request: SupportRequest } | { ok: false; error: string } {
  const targetPlayer = resolvePlayerById(galaxy, candidate.targetPlayerId);
  if (!targetPlayer || targetPlayer.type === PlayerType.NEUTRAL) {
    return { ok: false, error: 'Support target not found.' };
  }

  const status = resolveDiplomaticStatus(galaxy, player.playerId, candidate.targetPlayerId);
  if (!isSupportStatusAllowed(candidate.supportType, status)) {
    return { ok: false, error: 'Current diplomacy status does not allow this support request.' };
  }

  const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), candidate.targetCoordinates)) ?? null;
  if (!targetPlanet) {
    return { ok: false, error: 'Support target planet not found.' };
  }

  if ((candidate.supportType === 'RESOURCE_SUPPORT' || candidate.supportType === 'PLANET_REPAIR' || candidate.supportType === 'PLANET_DEFENSE')
    && targetPlanet.info.ownerId !== player.playerId) {
    return { ok: false, error: 'Defensive support requests must target one of the bot planets.' };
  }

  if (isOffensiveSupportType(candidate.supportType) && !supportShipAmountsHaveAnyValue(candidate.minimumShips)) {
    return { ok: false, error: 'Offensive support requests require minimum ships.' };
  }

  const duplicatePending = galaxy.supportRequests.some((request) =>
    request.state === DiplomaticProposalState.PENDING
    && request.fromPlayerId === player.playerId
    && request.toPlayerId === candidate.targetPlayerId
    && request.supportType === candidate.supportType
    && sameCoordinates(request.targetCoordinates, candidate.targetCoordinates)
  );
  if (duplicatePending) {
    return { ok: false, error: 'A matching support request is already pending for this planet.' };
  }

  const request = createSupportRequest(
    galaxy.nextSupportRequestId,
    player.playerId,
    candidate.targetPlayerId,
    candidate.supportType,
    targetPlanet.basicInfo.name,
    candidate.targetCoordinates,
    galaxy.currentTurn,
    galaxy.currentTurn + 3,
    candidate.supportType === 'RESOURCE_SUPPORT' ? candidate.requestedResources : null,
    isOffensiveSupportType(candidate.supportType)
      ? {
        missionType: candidate.missionType,
        minimumShips: normalizeSupportShipAmounts(candidate.minimumShips),
        bombardmentPriorities: candidate.bombardmentPriorities,
        targetOwnerPlayerId: targetPlanet.info.ownerId,
        targetOwnerPlayerName: targetPlanet.info.ownerId !== null
          ? resolvePlayerById(galaxy, targetPlanet.info.ownerId)?.playerName ?? null
          : null
      }
      : undefined
  );
  galaxy.nextSupportRequestId += 1;
  galaxy.supportRequests.push(request);
  appendRecentSupportRequest(player, candidate.targetPlayerId, candidate.supportType, candidate.targetCoordinates, galaxy.currentTurn);
  return { ok: true, request };
}

function hasBotCreatedSupportRequestThisTurn(galaxy: Galaxy, playerId: number): boolean {
  return galaxy.supportRequests.some((request) =>
    request.fromPlayerId === playerId
    && request.createdTurn === galaxy.currentTurn
  );
}

function countBotUnresolvedSupportRequests(galaxy: Galaxy, playerId: number): number {
  return galaxy.supportRequests.filter((request) =>
    request.fromPlayerId === playerId
    && (request.state === DiplomaticProposalState.PENDING
      || (request.state === DiplomaticProposalState.ACCEPTED && request.fulfilledTurn === null))
  ).length;
}

function calculateSupportGoodwillMagnitude(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  request: SupportRequest
): number {
  const equivalentValue = estimateSupportRequestEquivalentValue(galaxy, request);
  const turnIncome = Math.max(1, estimatePlayerIncomeValue(player, profile));
  return Math.max(1, Math.min(12, Math.round((equivalentValue / turnIncome) * 6)));
}

function estimateSupportRequestEquivalentValue(galaxy: Galaxy, request: SupportRequest): number {
  if (request.supportType === 'RESOURCE_SUPPORT') {
    return estimateResourceValue(request.approvedResources ?? request.requestedResources);
  }

  const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), request.targetCoordinates)) ?? null;
  if (request.supportType === 'PLANET_REPAIR') {
    return targetPlanet ? Math.max(100, estimatePlanetEconomicValue(targetPlanet) * 0.2) : 120;
  }
  if (request.supportType === 'PLANET_DEFENSE') {
    return targetPlanet ? Math.max(140, estimatePlanetEconomicValue(targetPlanet) * 0.3) : 160;
  }

  let shipValue = 0;
  for (const minimum of request.minimumShips) {
    const blueprint = SHIP_BLUEPRINTS.get(minimum.type as ShipTypeType);
    if (!blueprint) {
      continue;
    }

    shipValue += estimateResourceValue(blueprint.cost) * minimum.amount;
  }
  return Math.max(shipValue, targetPlanet ? estimatePlanetEconomicValue(targetPlanet) * 0.4 : shipValue);
}

function getBotGoodwill(player: Player, targetPlayerId: number): number {
  return player.botMemory?.goodwillByPlayer?.find((entry) => entry.playerId === targetPlayerId)?.score ?? 0;
}

function adjustBotGoodwill(
  player: Player,
  targetPlayerId: number,
  delta: number,
  currentTurn: number
): void {
  const memory = player.botMemory;
  if (!memory || !Number.isInteger(targetPlayerId)) {
    return;
  }

  const goodwillEntries = memory.goodwillByPlayer ?? [];
  const existing = goodwillEntries.find((entry) => entry.playerId === targetPlayerId) ?? null;
  if (!existing) {
    goodwillEntries.push({
      playerId: targetPlayerId,
      score: Math.max(-100, Math.min(100, Math.round(delta))),
      updatedTurn: currentTurn
    });
  } else {
    existing.score = Math.max(-100, Math.min(100, existing.score + Math.round(delta)));
    existing.updatedTurn = currentTurn;
  }

  while (goodwillEntries.length > 40) {
    goodwillEntries.shift();
  }
  memory.goodwillByPlayer = goodwillEntries;
}

function appendRecentSupportRequest(
  player: Player,
  targetPlayerId: number,
  supportType: SupportRequestType,
  targetCoordinates: ClientCoordinates,
  currentTurn: number
): void {
  const memory = player.botMemory;
  if (!memory) {
    return;
  }

  const recent = memory.recentSupportRequests ?? [];
  recent.push({
    playerId: targetPlayerId,
    supportType,
    targetCoordinates: { ...targetCoordinates },
    turn: currentTurn
  });
  while (recent.length > 40) {
    recent.shift();
  }
  memory.recentSupportRequests = recent;
}

function hasRecentSupportRequest(
  player: Player,
  targetPlayerId: number,
  supportType: SupportRequestType,
  targetCoordinates: ClientCoordinates,
  currentTurn: number,
  cooldownTurns = 3
): boolean {
  return (player.botMemory?.recentSupportRequests ?? []).some((entry) =>
    entry.playerId === targetPlayerId
    && entry.supportType === supportType
    && sameCoordinates(entry.targetCoordinates, targetCoordinates)
    && (currentTurn - entry.turn) < cooldownTurns
  );
}

function appendProcessedSupportOutcome(player: Player, requestId: number): void {
  const memory = player.botMemory;
  if (!memory) {
    return;
  }

  const processed = memory.processedSupportOutcomeIds ?? [];
  processed.push(requestId);
  while (processed.length > 80) {
    processed.shift();
  }
  memory.processedSupportOutcomeIds = processed;
}

function isSupportStatusAllowed(
  supportType: SupportRequestType,
  status: string
): boolean {
  if (
    supportType === 'RESOURCE_SUPPORT'
    || supportType === 'ATTACK_TARGET'
    || supportType === 'BOMBARD_TARGET'
    || supportType === 'SIEGE_TARGET'
  ) {
    return status === DiplomaticStatus.ALLIED;
  }

  return status === DiplomaticStatus.ALLIED || status === DiplomaticStatus.PEACE;
}

function isOffensiveSupportType(
  supportType: SupportRequestType
): supportType is OffensiveSupportRequest['supportType'] {
  return supportType === 'ATTACK_TARGET' || supportType === 'BOMBARD_TARGET' || supportType === 'SIEGE_TARGET';
}

function isOffensiveSupportRequest(
  request: SupportRequest
): request is OffensiveSupportRequest {
  return isOffensiveSupportType(request.supportType);
}

function resolveBotResourceSupportApproval(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  request: Extract<SupportRequest, { supportType: 'RESOURCE_SUPPORT' }>
): ResourcesPackType | null {
  const providerCriticalPressure = hasCriticalEconomyPressure(player, profile);
  const reserveRatio = providerCriticalPressure ? 0.92 : 0.78;
  let bestApproval: ResourcesPackType | null = null;
  let bestValue = 0;

  for (const planet of player.planets) {
    const approval = new ResourcesPack(
      Math.min(
        Math.max(0, planet.rBDSFTQ.resources.metal - Math.floor(planet.rBDSFTQ.resources.metal * reserveRatio)),
        request.requestedResources.metal
      ),
      Math.min(
        Math.max(0, planet.rBDSFTQ.resources.crystal - Math.floor(planet.rBDSFTQ.resources.crystal * reserveRatio)),
        request.requestedResources.crystal
      ),
      Math.min(
        Math.max(0, planet.rBDSFTQ.resources.deuterium - Math.floor(planet.rBDSFTQ.resources.deuterium * reserveRatio)),
        request.requestedResources.deuterium
      )
    );
    const value = estimateResourceValue(approval);
    if (value > bestValue) {
      bestApproval = approval;
      bestValue = value;
    }
  }

  return bestApproval && supportResourcesHasAnyValue(bestApproval) ? bestApproval : null;
}

function resolveBotBestResourceSupportSourcePlanet(
  galaxy: Galaxy,
  ownerPlayerId: number,
  requiredResources: ResourcesPackType
): Planet | null {
  let bestPlanet: Planet | null = null;
  let bestValue = -1;

  for (const planet of flattenPlanets(galaxy)) {
    if (planet.info.ownerId !== ownerPlayerId) {
      continue;
    }
    if (!planet.rBDSFTQ.resources.isSufficient(requiredResources)) {
      continue;
    }

    const resourceValue = planet.rBDSFTQ.resources.getTotalValuedResourceAmount();
    if (resourceValue > bestValue) {
      bestPlanet = planet;
      bestValue = resourceValue;
    }
  }

  return bestPlanet;
}

function hasCriticalEconomyPressure(player: Player, profile: BotProfile): boolean {
  return player.planets.some((planet) => buildPlanetEconomyState(planet, player, profile).stage === 'energy_recovery');
}

function resolveCriticalEconomySupportBuildingType(
  planet: Planet,
  player: Player,
  economyState: BotPlanetEconomyState,
  targets: BotEconomyTargets
): BuildingTypeType | null {
  if (economyState.stage === 'energy_recovery') {
    const energyTypes: BuildingTypeType[] = [
      BuildingType.SOLAR_WIND_GEOTHERMAL,
      BuildingType.NUCLEAR_PLANT,
      BuildingType.FUSION_REACTOR
    ];
    for (const type of energyTypes) {
      const blueprint = BUILDING_BLUEPRINTS.get(type);
      const nextLevel = planet.getBuildingLevel(type) + 1;
      if (!blueprint || !hasBuildingRequirements(planet, blueprint, nextLevel) || !hasTechnologyRequirements(player, blueprint, nextLevel)) {
        continue;
      }
      if (type === BuildingType.FUSION_REACTOR && !isFusionReactorUpgradeDeuteriumSafe(planet, player, nextLevel)) {
        continue;
      }
      return type;
    }
  }

  const mineLevels = [
    { type: BuildingType.METAL_MINE, level: planet.getBuildingLevel(BuildingType.METAL_MINE) },
    { type: BuildingType.CRYSTAL_MINE, level: planet.getBuildingLevel(BuildingType.CRYSTAL_MINE) },
    { type: BuildingType.DEUTERIUM_SYNTHESIZER, level: planet.getBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER) }
  ].sort((left, right) => left.level - right.level);
  if (economyState.avgMineLevel < targets.mineLevel) {
    return mineLevels[0]?.type ?? null;
  }
  if (planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY) < targets.roboticsLevel) {
    return BuildingType.ROBOTICS_FACTORY;
  }
  if (planet.getBuildingLevel(BuildingType.RESEARCH_LAB) < targets.researchLabLevel) {
    return BuildingType.RESEARCH_LAB;
  }
  if (estimateStoragePressure(planet) >= 0.8) {
    return BuildingType.METAL_STORAGE;
  }

  return null;
}

function estimatePlayerIncomeValue(player: Player, profile: BotProfile): number {
  return player.planets.reduce((sum, planet) => sum + estimatePlanetIncomeValue(planet, player, profile), 0);
}

function estimatePlanetIncomeValue(planet: Planet, player: Player, profile: BotProfile): number {
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  const economyState = buildPlanetEconomyState(planet, player, profile);
  const metalIncome = Math.max(0, Math.floor(planet.getMetalGain(adaptiveTechnologyLevel) * economyState.energyEfficiency));
  const crystalIncome = Math.max(0, Math.floor(planet.getCrystalGain(adaptiveTechnologyLevel) * economyState.energyEfficiency));
  const deuteriumIncome = Math.max(0, Math.floor(planet.getDeuteriumGain(adaptiveTechnologyLevel)));
  return estimateResourceValue(new ResourcesPack(metalIncome, crystalIncome, deuteriumIncome));
}

function estimateLocalRepairCapability(galaxy: Galaxy, player: Player, targetPlanet: Planet): number {
  const targetCoordinates = coordinatesOfPlanet(targetPlanet);
  let total = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue1(BuildingType.SHIPYARD)));
  total += estimatePlanetRepairTools(targetPlanet);

  for (const fleet of galaxy.activeFleets) {
    if (fleet.ownerId !== player.playerId || fleet.state !== FleetState.ORBITING || !sameCoordinates(fleet.target, targetCoordinates)) {
      continue;
    }
    total += Math.max(0, Math.floor(fleet.shipRepairCapability ?? 0));
    total += Math.max(0, Math.floor(fleet.droneRepairCapability ?? 0));
  }

  return total;
}

function resolveRepairSupportLaunchReadiness(
  player: Player,
  targetCoordinates: ClientCoordinates
): { distance: number; ships: CreateFleetShipSelectionEntry[] } | null {
  let best: { distance: number; ships: CreateFleetShipSelectionEntry[] } | null = null;

  for (const planet of player.planets) {
    const ships = buildRepairShipSelection(planet);
    if (ships.length <= 0) {
      continue;
    }

    const distance = calculateTravelDistance(coordinatesOfPlanet(planet), targetCoordinates);
    if (!best || distance < best.distance) {
      best = { distance, ships };
    }
  }

  return best;
}

function resolveFastestFriendlyPlanetDistance(
  player: Player,
  targetCoordinates: ClientCoordinates,
  predicate: (planet: Planet) => boolean
): number | null {
  let best: number | null = null;

  for (const planet of player.planets) {
    if (!predicate(planet)) {
      continue;
    }

    const distance = calculateTravelDistance(coordinatesOfPlanet(planet), targetCoordinates);
    if (best === null || distance < best) {
      best = distance;
    }
  }

  return best;
}

function resolveDefenseSupportLaunchReadiness(
  player: Player,
  profile: BotProfile,
  targetCoordinates: ClientCoordinates,
  nearbyThreatStrength: number,
  targetDefenseStrength: number
): { distance: number; ships: CreateFleetShipSelectionEntry[] } | null {
  let best: { distance: number; ships: CreateFleetShipSelectionEntry[]; strength: number } | null = null;

  for (const planet of player.planets) {
    const ships = buildGuardShipSelection(
      planet,
      Math.max(24, nearbyThreatStrength),
      targetDefenseStrength,
      profile
    );
    if (ships.length <= 0) {
      continue;
    }

    const distance = calculateTravelDistance(coordinatesOfPlanet(planet), targetCoordinates);
    const strength = estimateShipSelectionCombatStrength(ships);
    if (!best || distance < best.distance || (distance === best.distance && strength > best.strength)) {
      best = { distance, ships, strength };
    }
  }

  return best ? { distance: best.distance, ships: best.ships } : null;
}

function canPlanetProvideRepairSupport(planet: Planet): boolean {
  return estimatePlanetRepairTools(planet) > 0;
}

function estimatePlanetRepairTools(planet: Planet): number {
  const repairDrones = planet.rBDSFTQ.ships.countByType().get(ShipType.REPAIR_DRONE) ?? 0;
  return Math.max(0, Math.floor(planet.getBuildingProductionValue1(BuildingType.SHIPYARD))) + repairDrones;
}

function calculateAvailableDefenseSupportPower(player: Player): number {
  return player.planets.reduce((sum, planet) => {
    if (!planetHasJumpCombatShip(planet)) {
      return sum;
    }
    return sum + estimatePlanetCombatStrength(planet);
  }, 0);
}

function canBotSpareDefenseSupport(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile
): boolean {
  const valuablePlanets = [...player.planets]
    .sort((left, right) => estimatePlanetStrategicValue(galaxy, player, right) - estimatePlanetStrategicValue(galaxy, player, left));
  const protectedCount = Math.max(1, Math.ceil(valuablePlanets.length / 2));
  const protectedSet = new Set(valuablePlanets.slice(0, protectedCount));

  return player.planets.every((planet) => {
    if (!protectedSet.has(planet)) {
      return true;
    }

    const threat = estimateNearbyThreat(galaxy, player, planet);
    if (!threat) {
      return true;
    }

    return threat.pressure <= Math.max(20, estimatePlanetCombatStrength(planet) * (1 + (profile.defenseWeight * 0.25)));
  });
}

function estimatePlanetStrategicValue(
  galaxy: Galaxy,
  player: Player,
  planet: Planet
): number {
  const economyValue = estimatePlanetEconomicValue(planet);
  const productionValue = averageBuildingLevels(planet, [
    BuildingType.METAL_MINE,
    BuildingType.CRYSTAL_MINE,
    BuildingType.DEUTERIUM_SYNTHESIZER,
    BuildingType.ROBOTICS_FACTORY,
    BuildingType.RESEARCH_LAB
  ]) * 24;
  const threat = estimateNearbyThreat(galaxy, player, planet)?.pressure ?? 0;
  return economyValue + productionValue + (threat * 12);
}

function resolvePreferredSupportProvider(
  galaxy: Galaxy,
  player: Player,
  supportType: SupportRequestType,
  targetCoordinates: ClientCoordinates,
  scoreResolver: (
    ally: Player,
    allyProfile: BotProfile
  ) => {
    score: number;
    distance?: number | null;
    offensiveSelection?: CreateFleetShipSelectionEntry[] | null;
    missionType?: FleetMissionTypeType | null;
    selectionStrength?: number;
  } | null
): {
  player: Player;
  score: number;
  distance: number | null;
  offensiveSelection: CreateFleetShipSelectionEntry[] | null;
  missionType: FleetMissionTypeType | null;
  selectionStrength: number;
} | null {
  let best: {
    player: Player;
    score: number;
    distance: number | null;
    offensiveSelection: CreateFleetShipSelectionEntry[] | null;
    missionType: FleetMissionTypeType | null;
    selectionStrength: number;
  } | null = null;

  for (const ally of galaxy.players) {
    if (ally.playerId === player.playerId || ally.type === PlayerType.NEUTRAL || ally.planets.length <= 0) {
      continue;
    }

    const status = resolveDiplomaticStatus(galaxy, player.playerId, ally.playerId);
    if (!isSupportStatusAllowed(supportType, status)) {
      continue;
    }
    if (hasRecentSupportRequest(player, ally.playerId, supportType, targetCoordinates, galaxy.currentTurn)) {
      continue;
    }

    const allyProfile = BOT_PROFILES[ally.botProfileId ?? defaultBotProfileIdForPlayerId(ally.playerId)];
    const resolved = scoreResolver(ally, allyProfile);
    if (!resolved) {
      continue;
    }

    const sameTrustedAllyBonus = getBotGoodwill(player, ally.playerId) > 0 ? 1.5 : 0;
    const totalScore = resolved.score + (getBotGoodwill(player, ally.playerId) / 20) + sameTrustedAllyBonus;
    if (!best || totalScore > best.score) {
      best = {
        player: ally,
        score: totalScore,
        distance: resolved.distance ?? null,
        offensiveSelection: resolved.offensiveSelection ?? null,
        missionType: resolved.missionType ?? null,
        selectionStrength: resolved.selectionStrength ?? 0
      };
    }
  }

  return best;
}

function estimateAllyResourceSupportScore(
  ally: Player,
  allyProfile: BotProfile,
  targetPlanet: Planet,
  missing: ResourcesPackType
): { score: number; distance: number | null } | null {
  const reservePenalty = hasCriticalEconomyPressure(ally, allyProfile) ? 6 : 0;
  const bestPlanet = ally.planets.find((planet) =>
    estimateResourceValue(planet.rBDSFTQ.resources) >= (estimateResourceValue(missing) * 0.4)
  ) ?? null;
  if (!bestPlanet) {
    return null;
  }

  const distance = calculateTravelDistance(coordinatesOfPlanet(bestPlanet), coordinatesOfPlanet(targetPlanet));
  const spareRatio = estimatePlayerIncomeValue(ally, allyProfile) / Math.max(1, estimateResourceValue(missing));
  return {
    score: (spareRatio * 5) - reservePenalty - (distance * 0.5),
    distance
  };
}

function estimateAllyRepairSupportScore(
  ally: Player,
  targetPlanet: Planet
): { score: number; distance: number | null } | null {
  const distance = resolveFastestFriendlyPlanetDistance(ally, coordinatesOfPlanet(targetPlanet), canPlanetProvideRepairSupport);
  if (distance === null) {
    return null;
  }

  const repairTools = ally.planets.reduce((sum, planet) => sum + estimatePlanetRepairTools(planet), 0);
  if (repairTools <= 0) {
    return null;
  }

  return {
    score: (repairTools / 4) - distance,
    distance
  };
}

function estimateAllyDefenseSupportScore(
  ally: Player,
  targetPlanet: Planet
): { score: number; distance: number | null } | null {
  const distance = resolveFastestFriendlyPlanetDistance(ally, coordinatesOfPlanet(targetPlanet), planetHasJumpCombatShip);
  if (distance === null) {
    return null;
  }

  const supportPower = calculateAvailableDefenseSupportPower(ally);
  if (supportPower <= 0) {
    return null;
  }

  return {
    score: (supportPower / 25) - (distance * 1.5),
    distance
  };
}

function estimateAllyOffensiveSupportScore(
  ally: Player,
  allyProfile: BotProfile,
  targetPlanet: Planet,
  report: EspionageReportData,
  supportType: OffensiveSupportRequest['supportType']
): {
  score: number;
  distance: number | null;
  offensiveSelection: CreateFleetShipSelectionEntry[] | null;
  missionType: FleetMissionTypeType | null;
  selectionStrength: number;
} | null {
  let best: {
    score: number;
    distance: number | null;
    offensiveSelection: CreateFleetShipSelectionEntry[] | null;
    missionType: FleetMissionTypeType | null;
    selectionStrength: number;
  } | null = null;

  for (const originPlanet of ally.planets) {
    const originCoordinates = coordinatesOfPlanet(originPlanet);
    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    if (sameCoordinates(originCoordinates, targetCoordinates)) {
      continue;
    }

    const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
    let selection: CreateFleetShipSelectionEntry[] = [];
    let missionType: FleetMissionTypeType = FleetMissionType.ATTACK;
    if (supportType === 'ATTACK_TARGET') {
      selection = buildAttackShipSelection(originPlanet, report, allyProfile, {
        requireBombardmentBreaker: report.totalDefencesAmount > 0
      });
      missionType = FleetMissionType.ATTACK;
    } else if (supportType === 'BOMBARD_TARGET') {
      selection = buildBombardShipSelection(originPlanet, allyProfile, report.totalDefencesAmount >= 10);
      missionType = FleetMissionType.BOMBARD;
    } else {
      selection = buildBombardShipSelection(originPlanet, allyProfile, true);
      missionType = FleetMissionType.SIEGE;
    }

    if (selection.length <= 0) {
      continue;
    }

    const selectionStrength = estimateShipSelectionCombatStrength(selection);
    const score = (selectionStrength / 20) - (distance * 1.25);
    if (!best || score > best.score) {
      best = {
        score,
        distance,
        offensiveSelection: selection,
        missionType,
        selectionStrength
      };
    }
  }

  return best;
}

function estimateBestOwnOffensiveStrength(
  player: Player,
  profile: BotProfile,
  targetPlanet: Planet,
  report: EspionageReportData
): number {
  let best = 0;

  for (const originPlanet of player.planets) {
    if (sameCoordinates(coordinatesOfPlanet(originPlanet), coordinatesOfPlanet(targetPlanet))) {
      continue;
    }

    const selection = buildAttackShipSelection(originPlanet, report, profile, {
      requireBombardmentBreaker: report.totalDefencesAmount > 0
    });
    best = Math.max(best, estimateShipSelectionCombatStrength(selection));
  }

  return best;
}

function resolveBotOffensiveSupportType(
  status: string,
  report: EspionageReportData,
  farmTarget: boolean
): OffensiveSupportRequest['supportType'] {
  if (farmTarget) {
    return 'ATTACK_TARGET';
  }
  if (status === DiplomaticStatus.WAR && report.totalDefencesAmount >= 14) {
    return 'SIEGE_TARGET';
  }
  if (status === DiplomaticStatus.WAR && report.totalDefencesAmount >= 8) {
    return 'BOMBARD_TARGET';
  }
  return 'ATTACK_TARGET';
}

function isOffensiveSupportTargetValidForBot(
  galaxy: Galaxy,
  player: Player,
  request: OffensiveSupportRequest
): boolean {
  const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), request.targetCoordinates)) ?? null;
  if (!targetPlanet || targetPlanet.info.ownerId === null || targetPlanet.info.ownerId === player.playerId) {
    return false;
  }

  if (!targetPlanet.lastReportData.has(request.fromPlayerId)) {
    return false;
  }

  const status = resolveDiplomaticStatus(galaxy, request.toPlayerId, targetPlanet.info.ownerId);
  if (request.supportType === 'ATTACK_TARGET') {
    return status === DiplomaticStatus.WAR || status === DiplomaticStatus.NEUTRAL || status === DiplomaticStatus.PASSIVE;
  }

  return status === DiplomaticStatus.WAR;
}

function resolveOffensiveSupportLaunchReadiness(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  request: OffensiveSupportRequest
): { selectionStrength: number } | null {
  const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), request.targetCoordinates)) ?? null;
  if (!targetPlanet) {
    return null;
  }

  for (const planet of player.planets) {
    const distance = calculateTravelDistance(coordinatesOfPlanet(planet), request.targetCoordinates);
    if (distance > 5) {
      continue;
    }

    const selection = buildMinimumShipSelection(planet, request.minimumShips);
    if (!selection) {
      continue;
    }

    if (request.supportType === 'ATTACK_TARGET') {
      const report = targetPlanet.lastReportData.get(request.fromPlayerId) ?? null;
      const expectedStrength = report ? estimateReportCombatStrength(report) : 0;
      if (estimateShipSelectionCombatStrength(selection) < expectedStrength * 0.75) {
        continue;
      }
    }

    if (!canBotSpareDefenseSupport(galaxy, player, profile) && request.supportType !== 'ATTACK_TARGET') {
      continue;
    }

    return {
      selectionStrength: estimateShipSelectionCombatStrength(selection)
    };
  }

  return null;
}

function buildMinimumShipSelection(
  planet: Planet,
  minimumShips: SupportShipAmount[]
): CreateFleetShipSelectionEntry[] | null {
  const availableUndamaged = ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
  const availableDamaged = ManyShips.damagedCountByType(planet.rBDSFTQ.ships);
  const selections: CreateFleetShipSelectionEntry[] = [];

  for (const minimum of minimumShips) {
    const undamagedAvailable = availableUndamaged.get(minimum.type as ShipTypeType) ?? 0;
    const damagedAvailable = availableDamaged.get(minimum.type as ShipTypeType) ?? 0;
    if (undamagedAvailable + damagedAvailable < minimum.amount) {
      return null;
    }

    const undamagedAmount = Math.min(undamagedAvailable, minimum.amount);
    const damagedAmount = Math.max(0, minimum.amount - undamagedAmount);
    selections.push({
      type: minimum.type,
      undamagedAmount,
      damagedAmount
    });
  }

  return selections;
}

function buildBuildingCandidates(
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.building >= profile.maxBuildingActionsPerTurn) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  const spendableRatio = calculateSpendableResourceRatio(player, profile);
  for (const planet of player.planets) {
    if (planet.rBDSFTQ.buildingQueue.length >= calculateMaxBuildingQueueLength(planet, player)) {
      continue;
    }

    const economyState = buildPlanetEconomyState(planet, player, profile);
    const storagePressure = estimateStoragePressure(planet);

    for (const buildingType of BUILDING_PRIORITY_TYPES) {
      if (planet.rBDSFTQ.buildingQueue.some((entry) => entry.buildingType === buildingType)) {
        continue;
      }

      const building = BUILDING_BLUEPRINTS.get(buildingType);
      if (!building) {
        continue;
      }

      const nextLevel = planet.getBuildingLevel(buildingType) + 1;
      if (!hasBuildingRequirements(planet, building, nextLevel)) {
        continue;
      }
      if (!hasTechnologyRequirements(player, building, nextLevel)) {
        continue;
      }
      if (!isBuildingAllowedForEconomyStage(buildingType, economyState)) {
        continue;
      }
      if (
        buildingType === BuildingType.FUSION_REACTOR
        && !isFusionReactorUpgradeDeuteriumSafe(planet, player, nextLevel)
      ) {
        continue;
      }

      const request = coordinatesOfPlanet(planet, { buildingType });
      const key = candidateKey({ kind: 'building', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const cost = building.getCostForLevel(nextLevel);
      if (!planet.rBDSFTQ.resources.isSufficient(cost)) {
        continue;
      }
      if (
        economyState.stage === 'open'
        && isOptionalBuildingSpend(buildingType)
        && !isCostWithinSpendableRatio(planet.rBDSFTQ.resources, cost, spendableRatio)
      ) {
        continue;
      }

      const base = estimateBuildingBaseScore(buildingType, planet, player, profile, economyState, storagePressure);
      const utility = scoreUtility(base, cost);
      candidates.push({
        kind: 'building',
        utility: applyGoalBonus(player.botMemory, 'KEY_BUILDING_UP', utility, coordinatesOfPlanet(planet)),
        reason: `${buildingType} upgrade on ${planet.basicInfo.name}`,
        goalType: 'KEY_BUILDING_UP',
        request
      });
    }
  }

  return candidates;
}

function buildResearchCandidates(
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.research >= profile.maxResearchActionsPerTurn) {
    return [];
  }

  if (player.planets.some((planet) => planet.rBDSFTQ.currentResearchQueue !== null)) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const planet of player.planets) {
    const economyState = buildPlanetEconomyState(planet, player, profile);
    if (planet.getBuildingLevel(BuildingType.RESEARCH_LAB) <= 0) {
      continue;
    }
    if (planet.rBDSFTQ.currentResearchQueue || planet.rBDSFTQ.researchHelperFor) {
      continue;
    }

    const localThreeTurnIncomeBudget = calculateLocalThreeTurnResearchBudget(planet, player, economyState);
    const orderedResearchTypes = buildOrderedResearchPriorityTypes(player, planet, profile, economyState, localThreeTurnIncomeBudget);
    for (const technologyType of orderedResearchTypes) {
      const technology = TECHNOLOGY_BLUEPRINTS.get(technologyType);
      if (!technology) {
        continue;
      }

      const queuedElsewhere = player.planets.some((entry) =>
        entry.rBDSFTQ.currentResearchQueue?.technologyType === technologyType
      );
      if (queuedElsewhere) {
        continue;
      }

      const nextLevel = player.getTechLevel(technologyType) + 1;
      if (!hasResearchBuildingRequirements(planet, technology, nextLevel)) {
        continue;
      }
      if (!hasResearchTechnologyRequirements(player, technology, nextLevel)) {
        continue;
      }
      if (!isResearchAllowedForEconomyStage(technologyType, economyState)) {
        continue;
      }

      const request = coordinatesOfPlanet(planet, {
        technologyType,
        helperPlanets: []
      });
      const key = candidateKey({ kind: 'research', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const cost = technology.getCostForLevel(nextLevel);
      if (!planet.rBDSFTQ.resources.isSufficient(cost)) {
        continue;
      }

      const base = estimateResearchBaseScore(
        technologyType,
        profile,
        player,
        economyState,
        localThreeTurnIncomeBudget,
        cost
      );
      const utility = scoreUtility(base, cost);
      candidates.push({
        kind: 'research',
        utility: applyGoalBonus(player.botMemory, 'ECONOMY_TECH_UP', utility, coordinatesOfPlanet(planet)),
        reason: `${technologyType} research on ${planet.basicInfo.name}`,
        goalType: 'ECONOMY_TECH_UP',
        request
      });
    }
  }

  return candidates;
}

function buildShipyardCandidates(
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.shipyard >= profile.maxShipyardActionsPerTurn) {
    return [];
  }

  const currentShipCounts = countOwnedShipsByType(player);
  const spendableRatio = calculateSpendableResourceRatio(player, profile);
  const candidates: BotCandidate[] = [];
  for (const planet of player.planets) {
    const economyState = buildPlanetEconomyState(planet, player, profile);
    if (economyState.stage === 'energy_recovery') {
      continue;
    }
    if (planet.getBuildingLevel(BuildingType.SHIPYARD) <= 0) {
      continue;
    }
    if (planet.rBDSFTQ.shipyardQueue.length >= calculateMaxShipyardQueueLength(planet, player)) {
      continue;
    }

    for (const shipEntry of SHIPYARD_PRIORITY_TYPES) {
      const ship = SHIP_BLUEPRINTS.get(shipEntry.type);
      if (!ship) {
        continue;
      }

      if (!hasShipBuildingRequirements(planet, ship) || !hasShipTechnologyRequirements(player, ship)) {
        continue;
      }

      const request = coordinatesOfPlanet(planet, {
        itemKind: 'ship' as const,
        shipType: shipEntry.type,
        defenceType: null,
        amount: shipEntry.amount
      });
      const key = candidateKey({ kind: 'shipyard', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const totalCost = new ResourcesPack(
        ship.cost.metal * shipEntry.amount,
        ship.cost.crystal * shipEntry.amount,
        ship.cost.deuterium * shipEntry.amount
      );
      if (!planet.rBDSFTQ.resources.isSufficient(totalCost)) {
        continue;
      }
      if (!isCostWithinSpendableRatio(planet.rBDSFTQ.resources, totalCost, spendableRatio)) {
        continue;
      }

      const base = estimateShipyardBaseScore(
        shipEntry.type,
        currentShipCounts.get(shipEntry.type) ?? 0,
        player.planets.length,
        profile,
        economyState
      );
      const utility = scoreUtility(base, totalCost);
      const goalType = shipEntry.type === ShipType.COLONIZER ? 'COLONIZE_NEARBY' : 'FORTIFY_BORDER';
      candidates.push({
        kind: 'shipyard',
        utility: applyGoalBonus(player.botMemory, goalType, utility, coordinatesOfPlanet(planet)),
        reason: `${shipEntry.type} production on ${planet.basicInfo.name}`,
        goalType,
        request
      });
    }
  }

  return candidates;
}

function buildSpyCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>,
  diplomacyContexts: Map<number, BotDiplomacyContext>
): BotCandidate[] {
  if (counters.spy >= profile.maxSpyActionsPerTurn) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  const farmAttackUnlocked = isFarmAttackUnlocked(player, profile);
  for (const originPlanet of player.planets) {
    const availableProbes = planetUndamagedAmount(originPlanet, ShipType.SPY_PROBE);
    if (availableProbes <= 0) {
      continue;
    }

    const originCoordinates = coordinatesOfPlanet(originPlanet);
    for (const targetPlanet of collectForeignPlanets(galaxy, player.playerId)) {
      const targetCoordinates = coordinatesOfPlanet(targetPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const targetOwner = targetPlanet.info.ownerId === null
        ? null
        : resolvePlayerById(galaxy, targetPlanet.info.ownerId);
      const targetStatus = targetOwner
        ? resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId)
        : null;
      const farmTarget = isFarmTarget(targetOwner, targetStatus);
      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
      const stalenessTurns = report === null
        ? 6
        : Math.max(0, galaxy.currentTurn - report.createdTurn);
      if (farmTarget && report && report.totalDefencesAmount <= 0) {
        continue;
      }
      if (report && stalenessTurns < 2) {
        continue;
      }
      const unseenDistanceLimit = farmTarget && farmAttackUnlocked
        ? profile.preferredMaxTravelDistance + 1
        : 2;
      if (!report && distance > unseenDistanceLimit) {
        continue;
      }
      if (!report && shouldPreferAllUnknownSystemSweep(galaxy, player, originPlanet, targetPlanet, availableProbes)) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.SPY,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: [{ type: ShipType.SPY_PROBE, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'spy', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const fuelCost = calculateFuelCost([{ type: ShipType.SPY_PROBE, amount: 1 }], distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const interest = estimateSpyTargetInterest(galaxy, player, targetPlanet, report, diplomacyContexts);
      const recentlySpiedPenalty = hasRecentTarget(player.botMemory?.lastSpyTargets ?? [], targetCoordinates) ? 3 : 0;
      const farmInterestBonus = farmTarget
        ? 4 + (targetStatus === DiplomaticStatus.PASSIVE ? 1.5 : 0)
        : 0;
      const base = (8 * profile.spyWeight) + interest + farmInterestBonus + stalenessTurns - distance - recentlySpiedPenalty;
      const utility = applyGoalBonus(player.botMemory, 'REFRESH_INTEL', base, targetCoordinates);
      candidates.push({
        kind: 'spy',
        utility,
        reason: `Refresh intel on ${targetPlanet.basicInfo.name}`,
        goalType: 'REFRESH_INTEL',
        request
      });
    }
  }

  return candidates;
}

function shouldPreferAllUnknownSystemSweep(
  galaxy: Galaxy,
  player: Player,
  originPlanet: Planet,
  targetPlanet: Planet,
  availableProbes: number
): boolean {
  const eligiblePlanets = targetPlanet.basicInfo.solarSystem.planets.filter((planet) =>
    planet.basicInfo.type !== PlanetType.ASTEROIDS
    && planet.info.ownerId !== player.playerId
  );
  if (eligiblePlanets.length < 2 || eligiblePlanets.length > availableProbes) {
    return false;
  }

  const originCoordinates = coordinatesOfPlanet(originPlanet);
  let requiredFuel = 0;
  for (const candidatePlanet of eligiblePlanets) {
    const candidateCoordinates = coordinatesOfPlanet(candidatePlanet);
    if (sameCoordinates(originCoordinates, candidateCoordinates)) {
      return false;
    }

    const report = candidatePlanet.lastReportData.get(player.playerId) ?? null;
    if (report !== null) {
      return false;
    }

    const distance = calculateTravelDistance(originCoordinates, candidateCoordinates);
    requiredFuel += calculateFuelCost([{ type: ShipType.SPY_PROBE, amount: 1 }], distance);
  }

  return originPlanet.rBDSFTQ.resources.deuterium >= requiredFuel;
}

function buildStarSystemSpyCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>,
  diplomacyContexts: Map<number, BotDiplomacyContext>
): BotCandidate[] {
  if (counters.spy >= profile.maxSpyActionsPerTurn) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  const systems = galaxy.stars.flatMap((row) => row);
  for (const originPlanet of player.planets) {
    const availableProbes = originPlanet.rBDSFTQ.ships.countByType().get(ShipType.SPY_PROBE) ?? 0;
    if (availableProbes < 2) {
      continue;
    }

    const originCoordinates = coordinatesOfPlanet(originPlanet);
    for (const system of systems) {
      const eligiblePlanets = system.planets.filter((planet) =>
        planet.basicInfo.type !== PlanetType.ASTEROIDS
        && planet.info.ownerId !== player.playerId
      );
      if (eligiblePlanets.length < 2 || eligiblePlanets.length > availableProbes) {
        continue;
      }

      const candidateTargets: Array<{
        planet: Planet;
        report: EspionageReportData | null;
        stalenessTurns: number;
        distance: number;
        interest: number;
        targetCoordinates: BotMemoryCoordinates;
        unknown: boolean;
      }> = [];
      let skipSystem = false;
      let requiredFuel = 0;
      for (const targetPlanet of eligiblePlanets) {
        const targetCoordinates = coordinatesOfPlanet(targetPlanet);
        if (sameCoordinates(originCoordinates, targetCoordinates)) {
          continue;
        }

        const targetOwner = targetPlanet.info.ownerId === null
          ? null
          : resolvePlayerById(galaxy, targetPlanet.info.ownerId);
        const targetStatus = targetOwner
          ? resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId)
          : null;
        const farmTarget = isFarmTarget(targetOwner, targetStatus);
        const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
        if (farmTarget && report && report.totalDefencesAmount <= 0) {
          skipSystem = true;
          break;
        }

        const stalenessTurns = report === null
          ? 6
          : Math.max(0, galaxy.currentTurn - report.createdTurn);
        if (report && stalenessTurns < 2) {
          skipSystem = true;
          break;
        }

        const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
        requiredFuel += calculateFuelCost([{ type: ShipType.SPY_PROBE, amount: 1 }], distance);
        candidateTargets.push({
          planet: targetPlanet,
          report,
          stalenessTurns,
          distance,
          interest: estimateSpyTargetInterest(galaxy, player, targetPlanet, report, diplomacyContexts),
          targetCoordinates,
          unknown: report === null
        });
      }

      if (skipSystem || candidateTargets.length < 2 || candidateTargets.length !== eligiblePlanets.length) {
        continue;
      }
      if (originPlanet.rBDSFTQ.resources.deuterium < requiredFuel) {
        continue;
      }

      const allUnknown = candidateTargets.every((entry) => entry.unknown);
      const unknownCount = candidateTargets.filter((entry) => entry.unknown).length;
      const staleCount = candidateTargets.length - unknownCount;
      const recentPenalty = candidateTargets.reduce((sum, entry) => (
        sum + (hasRecentTarget(player.botMemory?.lastSpyTargets ?? [], entry.targetCoordinates) ? 1.5 : 0)
      ), 0);
      const totalInterest = candidateTargets.reduce((sum, entry) => sum + entry.interest, 0);
      const avgDistance = candidateTargets.reduce((sum, entry) => sum + entry.distance, 0) / candidateTargets.length;
      const allUnknownBonus = allUnknown ? 20 : 0;
      const base = (9 * profile.spyWeight)
        + totalInterest
        + (candidateTargets.length * 2.5)
        + (unknownCount * 3.5)
        + (staleCount * 1.25)
        + allUnknownBonus
        - avgDistance
        - recentPenalty;
      const primaryTargetCoordinates = candidateTargets[0]?.targetCoordinates ?? coordinatesOfPlanet(originPlanet);
      const request: CreateStarSystemSpyCommand = {
        systemX: system.coordinates.x,
        systemY: system.coordinates.y,
        origin: originCoordinates
      };
      const candidate: StarSystemSpyCandidate = {
        kind: 'system_spy',
        utility: applyGoalBonus(player.botMemory, 'REFRESH_INTEL', base, primaryTargetCoordinates),
        reason: allUnknown
          ? `Sweep unknown system ${system.coordinates.x}:${system.coordinates.y} from ${originPlanet.basicInfo.name}`
          : `Sweep stale intel in system ${system.coordinates.x}:${system.coordinates.y} from ${originPlanet.basicInfo.name}`,
        goalType: 'REFRESH_INTEL',
        request,
        primaryTargetCoordinates,
        targetCoordinates: candidateTargets.map((entry) => entry.targetCoordinates)
      };
      const key = candidateKey(candidate);
      if (blockedKeys.has(key)) {
        continue;
      }

      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildColonizeCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.colonize >= profile.maxColonizeActionsPerTurn) {
    return [];
  }

  const hasColonizeFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.COLONIZE
  );
  if (hasColonizeFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of collectColonizablePlanets(galaxy, player)) {
    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    for (const originPlanet of player.planets) {
      const availableColonizers = planetUndamagedAmount(originPlanet, ShipType.COLONIZER);
      if (availableColonizers <= 0) {
        continue;
      }

      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance + 2) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.COLONIZE,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: [{ type: ShipType.COLONIZER, undamagedAmount: 1, damagedAmount: 0 }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'colonize', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const fuelCost = calculateFuelCost([{ type: ShipType.COLONIZER, amount: 1 }], distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const owner = targetPlanet.info.ownerId === null
        ? null
        : resolvePlayerById(galaxy, targetPlanet.info.ownerId);
      const passiveNeutralPenalty = owner ? 2 : 0;
      const sizeBonus = targetPlanet.basicInfo.size / 20;
      const colonyNeedBonus = Math.max(0, 5 - player.planets.length) * 2;
      const base = (12 * profile.colonizeWeight) + sizeBonus + colonyNeedBonus - distance - passiveNeutralPenalty;
      const utility = applyGoalBonus(player.botMemory, 'COLONIZE_NEARBY', base, targetCoordinates);
      candidates.push({
        kind: 'colonize',
        utility,
        reason: `Colonize ${targetPlanet.basicInfo.name}`,
        goalType: 'COLONIZE_NEARBY',
        request
      });
    }
  }

  return candidates;
}

function buildAttackCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>,
  diplomacyContexts: Map<number, BotDiplomacyContext>
): BotCandidate[] {
  if (counters.attack >= profile.maxAttackActionsPerTurn) {
    return [];
  }

  const hasAttackFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.ATTACK
  );
  if (hasAttackFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  const farmAttackUnlocked = isFarmAttackUnlocked(player, profile);
  for (const targetPlanet of collectForeignPlanets(galaxy, player.playerId)) {
    if (targetPlanet.info.ownerId === null) {
      continue;
    }

    const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
    if (!targetOwner) {
      continue;
    }
    const targetStatus = resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId);
    const farmTarget = isFarmTarget(targetOwner, targetStatus);
    if (
      targetStatus !== DiplomaticStatus.WAR
      && targetStatus !== DiplomaticStatus.NEUTRAL
      && targetStatus !== DiplomaticStatus.PASSIVE
    ) {
      continue;
    }
    if (farmTarget && !farmAttackUnlocked) {
      continue;
    }

    const diplomacyContext = diplomacyContexts.get(targetOwner.playerId) ?? null;

    const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
    if (!report) {
      continue;
    }

    const defenderStrength = Math.max(1, estimateReportCombatStrength(report));
    const stalenessTurns = Math.max(0, galaxy.currentTurn - report.createdTurn);
    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    const farmRecord = getFarmTargetRecord(player.botMemory, targetCoordinates);
    if (
      farmTarget
      && Number.isInteger(farmRecord?.nextAllowedAttackTurn)
      && galaxy.currentTurn < (farmRecord?.nextAllowedAttackTurn ?? 0)
    ) {
      continue;
    }

    const knownDefenceCount = report.totalDefencesAmount;
    const knownShipCount = report.totalShipsAmount;
    const openedFarm = farmTarget && (
      (knownDefenceCount <= 0 && knownShipCount <= 0)
      || farmRecord?.lastKnownOpened === true
    );
    const defenselessFarm = farmTarget && (
      knownDefenceCount <= 0
      || (farmRecord?.lastKnownDefenceCount ?? 1) <= 0
    );
    const effectiveStalenessTurns = defenselessFarm ? 0 : stalenessTurns;
    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance) {
        continue;
      }

      const attackShips = openedFarm
        ? buildOpenedFarmRaidShipSelection(originPlanet, report)
        : buildAttackShipSelection(originPlanet, report, profile, {
          requireBombardmentBreaker: farmTarget && knownDefenceCount > 0
        });
      if (attackShips.length === 0) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.ATTACK,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: attackShips,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'attack', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const selectedAmounts = request.ships.map((entry) => ({
        type: entry.type,
        amount: entry.undamagedAmount + entry.damagedAmount
      }));
      const fuelCost = calculateFuelCost(selectedAmounts, distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const attackerStrength = estimateShipSelectionCombatStrength(request.ships);
      const retryStrengthFloor = farmTarget && !openedFarm && Number.isFinite(farmRecord?.lastSentCombatStrength)
        ? Math.max(
          defenderStrength * profile.minAttackStrengthRatio,
          (farmRecord?.lastSentCombatStrength ?? 0) * Math.max(1, farmRecord?.nextForceMultiplier ?? 1)
        )
        : 0;
      if (retryStrengthFloor > 0 && attackerStrength < retryStrengthFloor) {
        continue;
      }
      const relationRiskPenalty = farmTarget
        ? 0
        : targetStatus === DiplomaticStatus.NEUTRAL
        ? 0.2
        : targetStatus === DiplomaticStatus.PASSIVE
          ? 0.05
          : 0;
      const requiredRatio = profile.minAttackStrengthRatio
        + (effectiveStalenessTurns * profile.staleIntelPenaltyScale)
        + relationRiskPenalty;
      const ratio = attackerStrength / defenderStrength;
      if (ratio < requiredRatio) {
        continue;
      }

      const lootValue = estimateResourceValue(report.resourcesAmount);
      const bombardValue = estimateBombardTargetValue(report);
      const recentAttackPenalty = farmTarget
        ? (hasRecentTargetWithinWindow(player.botMemory?.lastAttackTargets ?? [], targetCoordinates, 3) ? 1.5 : 0)
        : (hasRecentTarget(player.botMemory?.lastAttackTargets ?? [], targetCoordinates) ? 3 : 0);
      const effectiveRatio = Math.min(ratio, 4);
      const infrastructurePressurePenalty = targetStatus === DiplomaticStatus.WAR && bombardValue >= 80
        ? bombardValue / 18
        : 0;
      const relationUtilityBonus = farmTarget
        ? (6 + (targetStatus === DiplomaticStatus.PASSIVE ? 1.5 : 0))
        : targetStatus === DiplomaticStatus.WAR
        ? 5
        : targetStatus === DiplomaticStatus.PASSIVE
          ? 2.5
          : 1.5;
      const borderThreatBonus = !farmTarget && diplomacyContext ? (diplomacyContext.borderPressure * 0.6) : 0;
      const base = (12 * profile.militaryWeight)
        + (effectiveRatio * 6)
        + relationUtilityBonus
        + borderThreatBonus
        + (lootValue / 150)
        - (distance * 1.5)
        - (effectiveStalenessTurns * profile.staleIntelPenaltyScale * 8)
        - infrastructurePressurePenalty
        - recentAttackPenalty;
      const utility = applyGoalBonus(player.botMemory, 'PREPARE_SAFE_ATTACK', base, targetCoordinates);
      candidates.push({
        kind: 'attack',
        utility,
        reason: openedFarm
          ? `Raid opened farm ${targetPlanet.basicInfo.name} (${targetStatus})`
          : `Attack ${targetPlanet.basicInfo.name} (${targetStatus}) with favorable ${ratio.toFixed(2)} ratio`,
        goalType: 'PREPARE_SAFE_ATTACK',
        request
      });
    }
  }

  return candidates;
}

function buildTransportCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.transport >= profile.maxTransportActionsPerTurn || player.planets.length < 2) {
    return [];
  }

  const hasTransportFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.TRANSPORT
  );
  if (hasTransportFleet) {
    return [];
  }

  const transporterBlueprint = SHIP_BLUEPRINTS.get(ShipType.TRANSPORTER);
  if (!transporterBlueprint || transporterBlueprint.cargoCapacity <= 0) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const originPlanet of player.planets) {
    const availableTransporters = planetUndamagedAmount(originPlanet, ShipType.TRANSPORTER);
    if (availableTransporters <= 0) {
      continue;
    }

    const originCoordinates = coordinatesOfPlanet(originPlanet);
    for (const targetPlanet of player.planets) {
      const targetCoordinates = coordinatesOfPlanet(targetPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance + 1) {
        continue;
      }

      const transportPlan = buildTransportPlan(originPlanet, targetPlanet, availableTransporters);
      if (!transportPlan) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.TRANSPORT,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: [{
          type: ShipType.TRANSPORTER,
          undamagedAmount: transportPlan.transporterAmount,
          damagedAmount: 0
        }],
        carriedBombs: [],
        cargo: transportPlan.cargo,
        useJumpGate: shouldUseJumpGateRoute(
          galaxy,
          player.playerId,
          FleetMissionType.TRANSPORT,
          originPlanet,
          targetPlanet,
          [{ type: ShipType.TRANSPORTER, undamagedAmount: transportPlan.transporterAmount, damagedAmount: 0 }]
        ),
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'transport', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const fuelCost = calculateFuelCost([{ type: ShipType.TRANSPORTER, amount: transportPlan.transporterAmount }], distance);
      const totalRequiredDeuterium = transportPlan.cargo.deuterium + fuelCost;
      if (originPlanet.rBDSFTQ.resources.deuterium < totalRequiredDeuterium) {
        continue;
      }

      const targetNeedValue = estimateTransportNeedValue(targetPlanet);
      const jumpGateBonus = request.useJumpGate ? Math.max(0, distance - 1) * 1.5 : 0;
      const base = (8 * profile.economyWeight)
        + (transportPlan.cargoValue / 100)
        + (targetNeedValue / 80)
        + jumpGateBonus
        - (distance * 1.25);
      const utility = applyGoalBonus(player.botMemory, 'KEY_BUILDING_UP', base, targetCoordinates);
      candidates.push({
        kind: 'transport',
        utility,
        reason: `Transport support from ${originPlanet.basicInfo.name} to ${targetPlanet.basicInfo.name}${request.useJumpGate ? ' via Jump Gate' : ''}`,
        goalType: 'KEY_BUILDING_UP',
        request
      });
    }
  }

  return candidates;
}

function buildMaintenanceCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.maintenance >= profile.maxMaintenanceActionsPerTurn) {
    return [];
  }

  const orbitingFleets = galaxy.activeFleets.filter((fleet) =>
    fleet.ownerId === player.playerId
    && fleet.state === FleetState.ORBITING
  );
  if (orbitingFleets.length === 0) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const fleet of orbitingFleets) {
    const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), fleet.target));
    if (!targetPlanet || targetPlanet.info.ownerId !== player.playerId) {
      continue;
    }

    const optionsResult = resolveFleetMaintenanceOptions({ galaxy, playerId: player.playerId }, fleet.fleetId);
    if (!optionsResult.ok || !optionsResult.value.autoApprove) {
      continue;
    }

    const request = buildMaintenanceRequestPayload(fleet, optionsResult.value);
    if (!request) {
      continue;
    }

    const key = candidateKey({
      kind: 'maintenance',
      utility: 0,
      reason: '',
      goalType: null,
      fleetId: fleet.fleetId,
      targetCoordinates: fleet.target,
      request
    });
    if (blockedKeys.has(key)) {
      continue;
    }

    const requestedShipPower = request.ships.reduce((sum, entry) =>
      sum + (estimateShipCombatPower(entry.type) * entry.amount), 0
    );
    const fuelValue = request.fuel / 12;
    const missionBias = fleet.missionType === FleetMissionType.DEFEND
      ? 5 * profile.defenseWeight
      : fleet.missionType === FleetMissionType.MOVE
        ? 4 * Math.max(profile.militaryWeight, profile.defenseWeight)
        : 3 * profile.economyWeight;
    const base = missionBias + fuelValue + (requestedShipPower / 10);
    const goalType = player.botMemory?.currentGoal ?? (
      fleet.missionType === FleetMissionType.DEFEND ? 'FORTIFY_BORDER' : null
    );
    candidates.push({
      kind: 'maintenance',
      utility: base,
      reason: `Refuel Fleet #${fleet.fleetId} at ${targetPlanet.basicInfo.name}`,
      goalType,
      fleetId: fleet.fleetId,
      targetCoordinates: coordinatesOfPlanet(targetPlanet),
      request
    });
  }

  return candidates;
}

function buildRecycleCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.recycle >= profile.maxRecycleActionsPerTurn) {
    return [];
  }

  const hasRecycleFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.RECYCLE
  );
  if (hasRecycleFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of player.planets) {
    const debrisValue = estimateResourceValue(targetPlanet.rBDSFTQ.spaceDebris);
    if (debrisValue < 120) {
      continue;
    }

    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const recyclerAmount = planetUndamagedAmount(originPlanet, ShipType.RECYCLER);
      if (recyclerAmount <= 0) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance + 1) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.RECYCLE,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: [{
          type: ShipType.RECYCLER,
          undamagedAmount: 1,
          damagedAmount: 0
        }],
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'recycle', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const fuelCost = calculateFuelCost([{ type: ShipType.RECYCLER, amount: 1 }], distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const base = 5 + (debrisValue / 90) - (distance * 1.1);
      candidates.push({
        kind: 'recycle',
        utility: base,
        reason: `Recycle debris over ${targetPlanet.basicInfo.name}`,
        goalType: null,
        request
      });
    }
  }

  return candidates;
}

function buildRepairCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.repair >= profile.maxRepairActionsPerTurn) {
    return [];
  }

  const hasRepairFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.REPAIR
  );
  if (hasRepairFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of player.planets) {
    const repairNeed = estimateRepairNeed(galaxy, player, targetPlanet);
    if (repairNeed < 20) {
      continue;
    }

    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const repairDroneAmount = planetUndamagedAmount(originPlanet, ShipType.REPAIR_DRONE);
      if (repairDroneAmount <= 0) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance + 1) {
        continue;
      }

      const repairShips = buildRepairShipSelection(originPlanet);
      if (repairShips.length === 0) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.REPAIR,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: repairShips,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: shouldUseJumpGateRoute(
          galaxy,
          player.playerId,
          FleetMissionType.REPAIR,
          originPlanet,
          targetPlanet,
          repairShips
        ),
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'repair', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const fuelCost = calculateFuelCost(
        request.ships.map((entry) => ({ type: entry.type, amount: entry.undamagedAmount + entry.damagedAmount })),
        distance
      );
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const jumpGateBonus = request.useJumpGate ? Math.max(0, distance - 1) * 1.25 : 0;
      const base = (6 * Math.max(profile.defenseWeight, profile.economyWeight))
        + (repairNeed / 30)
        + jumpGateBonus
        - distance;
      candidates.push({
        kind: 'repair',
        utility: base,
        reason: `Send repair support to ${targetPlanet.basicInfo.name}${request.useJumpGate ? ' via Jump Gate' : ''}`,
        goalType: 'FORTIFY_BORDER',
        request
      });
    }
  }

  return candidates;
}

function buildRepairShipSelection(originPlanet: Planet): CreateFleetShipSelectionEntry[] {
  if (planetUndamagedAmount(originPlanet, ShipType.REPAIR_DRONE) <= 0) {
    return [];
  }

  const repairDroneBlueprint = SHIP_BLUEPRINTS.get(ShipType.REPAIR_DRONE);
  if (!repairDroneBlueprint) {
    return [];
  }

  const availableCounts = originPlanet.rBDSFTQ.ships.undamagedCountByType();
  const carrierCandidates = [...availableCounts.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return Boolean(
        blueprint
        && blueprint.canJump
        && blueprint.hangarCapacity >= repairDroneBlueprint.size
      );
    })
    .map(([shipType]) => SHIP_BLUEPRINTS.get(shipType)!)
    .sort((left, right) =>
      left.hangarCapacity - right.hangarCapacity
      || left.type.localeCompare(right.type)
    );

  const carrier = carrierCandidates[0];
  if (!carrier) {
    return [];
  }

  return [
    {
      type: carrier.type,
      undamagedAmount: 1,
      damagedAmount: 0
    },
    {
      type: ShipType.REPAIR_DRONE,
      undamagedAmount: 1,
      damagedAmount: 0
    }
  ];
}

function buildBombardCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.bombard >= profile.maxBombardActionsPerTurn) {
    return [];
  }

  const hasBombardFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.BOMBARD
  );
  if (hasBombardFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of collectForeignPlanets(galaxy, player.playerId)) {
    if (targetPlanet.info.ownerId === null) {
      continue;
    }

    const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
    if (!targetOwner) {
      continue;
    }

    const targetStatus = resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId);
    if (targetStatus !== DiplomaticStatus.WAR) {
      continue;
    }

    const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
    if (!report) {
      continue;
    }

    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    const defenderStrength = Math.max(1, estimateReportCombatStrength(report));
    const bombardValue = estimateBombardTargetValue(report);
    if (bombardValue < 60) {
      continue;
    }

    const stalenessTurns = Math.max(0, galaxy.currentTurn - report.createdTurn);
    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance) {
        continue;
      }

      const bombardShips = buildBombardShipSelection(originPlanet, profile, false);
      if (bombardShips.length === 0) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.BOMBARD,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: bombardShips,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: defaultBombardmentPrioritiesForProfile(profile, false)
      };
      const key = candidateKey({ kind: 'bombard', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const selectedAmounts = request.ships.map((entry) => ({
        type: entry.type,
        amount: entry.undamagedAmount + entry.damagedAmount
      }));
      const fuelCost = calculateFuelCost(selectedAmounts, distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const attackerStrength = estimateShipSelectionCombatStrength(request.ships);
      const requiredRatio = profile.minAttackStrengthRatio + 0.1 + (stalenessTurns * profile.staleIntelPenaltyScale);
      const ratio = attackerStrength / defenderStrength;
      if (ratio < requiredRatio) {
        continue;
      }

      const lootValue = estimateResourceValue(report.resourcesAmount);
      const effectiveRatio = Math.min(ratio, 4);
      const base = (8 * profile.militaryWeight)
        + (bombardValue / 10)
        + (effectiveRatio * 4)
        - (lootValue / 250)
        - (distance * 1.25)
        - (stalenessTurns * profile.staleIntelPenaltyScale * 8);
      candidates.push({
        kind: 'bombard',
        utility: base,
        reason: `Bombard ${targetPlanet.basicInfo.name} to damage infrastructure`,
        goalType: 'PREPARE_SAFE_ATTACK',
        request
      });
    }
  }

  return candidates;
}

function buildSiegeCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.siege >= profile.maxSiegeActionsPerTurn) {
    return [];
  }

  const hasSiegeFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.SIEGE
  );
  if (hasSiegeFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of collectForeignPlanets(galaxy, player.playerId)) {
    if (targetPlanet.info.ownerId === null) {
      continue;
    }

    const targetOwner = resolvePlayerById(galaxy, targetPlanet.info.ownerId);
    if (!targetOwner) {
      continue;
    }

    const targetStatus = resolveDiplomaticStatus(galaxy, player.playerId, targetOwner.playerId);
    if (targetStatus !== DiplomaticStatus.WAR) {
      continue;
    }

    const report = targetPlanet.lastReportData.get(player.playerId) ?? null;
    if (!report) {
      continue;
    }

    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    const defenderStrength = Math.max(1, estimateReportCombatStrength(report));
    const bombardValue = estimateBombardTargetValue(report);
    if (bombardValue < 90) {
      continue;
    }

    const stalenessTurns = Math.max(0, galaxy.currentTurn - report.createdTurn);
    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > Math.max(2, profile.preferredMaxTravelDistance - 1)) {
        continue;
      }

      const siegeShips = buildBombardShipSelection(originPlanet, profile, true);
      if (siegeShips.length === 0) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.SIEGE,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: siegeShips,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: false,
        bombardmentPriorities: defaultBombardmentPrioritiesForProfile(profile, true)
      };
      const key = candidateKey({ kind: 'siege', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const selectedAmounts = request.ships.map((entry) => ({
        type: entry.type,
        amount: entry.undamagedAmount + entry.damagedAmount
      }));
      const fuelCost = calculateFuelCost(selectedAmounts, distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const attackerStrength = estimateShipSelectionCombatStrength(request.ships);
      if (attackerStrength < 600) {
        continue;
      }
      const requiredRatio = profile.minAttackStrengthRatio + 0.55 + (stalenessTurns * profile.staleIntelPenaltyScale);
      const ratio = attackerStrength / defenderStrength;
      if (ratio < requiredRatio) {
        continue;
      }

      const nearbyThreat = estimateNearbyThreat(galaxy, player, originPlanet);
      if (nearbyThreat && nearbyThreat.pressure > Math.max(30, estimatePlanetCombatStrength(originPlanet) * 0.9)) {
        continue;
      }

      const effectiveRatio = Math.min(ratio, 4);
      const base = (9 * profile.militaryWeight)
        + (bombardValue / 8)
        + (effectiveRatio * 4.5)
        - (distance * 1.5)
        - (stalenessTurns * profile.staleIntelPenaltyScale * 10);
      candidates.push({
        kind: 'siege',
        utility: base,
        reason: `Establish siege over ${targetPlanet.basicInfo.name}`,
        goalType: 'PREPARE_SAFE_ATTACK',
        request
      });
    }
  }

  return candidates;
}

function buildGuardCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.guard >= profile.maxGuardActionsPerTurn || player.planets.length < 2) {
    return [];
  }

  const hasGuardFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.DEFEND
  );
  if (hasGuardFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of player.planets) {
    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    const targetDefenseStrength = estimatePlanetCombatStrength(targetPlanet);
    const nearbyThreat = estimateNearbyThreat(galaxy, player, targetPlanet);
    if (!nearbyThreat || nearbyThreat.pressure <= Math.max(12, targetDefenseStrength * 0.9)) {
      continue;
    }

    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance + 1) {
        continue;
      }

      const guardShips = buildGuardShipSelection(originPlanet, nearbyThreat.reportStrength, targetDefenseStrength, profile);
      if (guardShips.length === 0) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.DEFEND,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: guardShips,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: shouldUseJumpGateRoute(
          galaxy,
          player.playerId,
          FleetMissionType.DEFEND,
          originPlanet,
          targetPlanet,
          guardShips
        ),
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'guard', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const selectedAmounts = request.ships.map((entry) => ({
        type: entry.type,
        amount: entry.undamagedAmount + entry.damagedAmount
      }));
      const fuelCost = calculateFuelCost(selectedAmounts, distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const reinforcementStrength = estimateShipSelectionCombatStrength(guardShips);
      const combinedStrength = targetDefenseStrength + reinforcementStrength;
      if (combinedStrength < nearbyThreat.reportStrength * 0.85) {
        continue;
      }

      const jumpGateBonus = request.useJumpGate ? Math.max(0, distance - 1) * 1.5 : 0;
      const base = (10 * profile.defenseWeight)
        + Math.max(0, (nearbyThreat.pressure - targetDefenseStrength) / 20)
        + (combinedStrength / Math.max(1, nearbyThreat.reportStrength))
        + (estimatePlanetEconomicValue(targetPlanet) / 150)
        + jumpGateBonus
        - distance;
      const utility = applyGoalBonus(player.botMemory, 'FORTIFY_BORDER', base, targetCoordinates);
      candidates.push({
        kind: 'guard',
        utility,
        reason: `Guard ${targetPlanet.basicInfo.name} against nearby threat${request.useJumpGate ? ' via Jump Gate' : ''}`,
        goalType: 'FORTIFY_BORDER',
        request
      });
    }
  }

  return candidates;
}

function buildMoveCandidates(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  counters: BotTurnCounters,
  blockedKeys: Set<string>
): BotCandidate[] {
  if (counters.move >= profile.maxMoveActionsPerTurn || player.planets.length < 2) {
    return [];
  }

  const hasMoveFleet = galaxy.activeFleets.some((fleet) =>
    fleet.ownerId === player.playerId && fleet.missionType === FleetMissionType.MOVE
  );
  if (hasMoveFleet) {
    return [];
  }

  const candidates: BotCandidate[] = [];
  for (const targetPlanet of player.planets) {
    const targetCoordinates = coordinatesOfPlanet(targetPlanet);
    const targetDefenseStrength = estimatePlanetCombatStrength(targetPlanet);
    const targetEconomicValue = estimatePlanetEconomicValue(targetPlanet);
    const nearbyThreat = estimateNearbyThreat(galaxy, player, targetPlanet);
    if (nearbyThreat && nearbyThreat.pressure > Math.max(12, targetDefenseStrength * 0.9)) {
      continue;
    }
    const strategicNeed = Math.max(0, 80 - targetDefenseStrength)
      + (targetEconomicValue / 10)
      + ((nearbyThreat?.pressure ?? 0) / 3);
    if (strategicNeed < 25) {
      continue;
    }

    for (const originPlanet of player.planets) {
      const originCoordinates = coordinatesOfPlanet(originPlanet);
      if (sameCoordinates(originCoordinates, targetCoordinates)) {
        continue;
      }

      const distance = calculateTravelDistance(originCoordinates, targetCoordinates);
      if (distance > profile.preferredMaxTravelDistance + 1) {
        continue;
      }

      const moveShips = buildMoveShipSelection(
        originPlanet,
        strategicNeed,
        profile
      );
      if (moveShips.length === 0) {
        continue;
      }

      const request: CreateFleetMissionCommand = {
        missionType: FleetMissionType.MOVE,
        origin: originCoordinates,
        target: targetCoordinates,
        ships: moveShips,
        carriedBombs: [],
        cargo: { metal: 0, crystal: 0, deuterium: 0 },
        useJumpGate: shouldUseJumpGateRoute(
          galaxy,
          player.playerId,
          FleetMissionType.MOVE,
          originPlanet,
          targetPlanet,
          moveShips
        ),
        bombardmentPriorities: null
      };
      const key = candidateKey({ kind: 'move', utility: 0, reason: '', goalType: null, request });
      if (blockedKeys.has(key)) {
        continue;
      }

      const selectedAmounts = request.ships.map((entry) => ({
        type: entry.type,
        amount: entry.undamagedAmount + entry.damagedAmount
      }));
      const fuelCost = calculateFuelCost(selectedAmounts, distance);
      if (originPlanet.rBDSFTQ.resources.deuterium < fuelCost) {
        continue;
      }

      const moveStrength = estimateShipSelectionCombatStrength(moveShips);
      const jumpGateBonus = request.useJumpGate ? Math.max(0, distance - 1) * 1.25 : 0;
      const base = (7 * Math.max(profile.defenseWeight, profile.militaryWeight))
        + (strategicNeed / 10)
        + (moveStrength / 18)
        + jumpGateBonus
        - distance;
      const utility = applyGoalBonus(player.botMemory, 'FORTIFY_BORDER', base, targetCoordinates);
      candidates.push({
        kind: 'move',
        utility,
        reason: `Reposition ships from ${originPlanet.basicInfo.name} to ${targetPlanet.basicInfo.name}${request.useJumpGate ? ' via Jump Gate' : ''}`,
        goalType: 'FORTIFY_BORDER',
        request
      });
    }
  }

  return candidates;
}

function ensureBotProfile(player: Player): BotProfileId {
  const profileId = player.botProfileId ?? defaultBotProfileIdForPlayerId(player.playerId);
  player.botProfileId = profileId;
  return profileId;
}

function ensureBotMemory(player: Player, currentTurn: number): void {
  const memory = player.botMemory;
  if (!memory || (memory.goalExpiresTurn !== null && memory.goalExpiresTurn < currentTurn)) {
    player.botMemory = {
      currentGoal: null,
      goalTarget: null,
      goalExpiresTurn: null,
      reservedResources: { metal: 0, crystal: 0, deuterium: 0 },
      lastSpyTargets: memory?.lastSpyTargets ?? [],
      lastAttackTargets: memory?.lastAttackTargets ?? [],
      recentDiplomacyTargets: memory?.recentDiplomacyTargets ?? [],
      goodwillByPlayer: memory?.goodwillByPlayer ?? [],
      recentSupportRequests: memory?.recentSupportRequests ?? [],
      processedSupportOutcomeIds: memory?.processedSupportOutcomeIds ?? [],
      farmTargets: memory?.farmTargets ?? [],
      lastProcessedFleetReportId: memory?.lastProcessedFleetReportId ?? null
    };
  }
}

function updateBotMemoryAfterAction(player: Player, currentTurn: number, candidate: BotCandidate): void {
  const previousMemory = player.botMemory;
  const nextSpyTargets = [...(previousMemory?.lastSpyTargets ?? [])];
  const nextAttackTargets = [...(previousMemory?.lastAttackTargets ?? [])];
  const targetCoordinates = requestCoordinates(candidate);

  if (candidate.kind === 'spy') {
    appendRecentTarget(nextSpyTargets, targetCoordinates);
  }
  if (candidate.kind === 'system_spy') {
    for (const coordinates of candidate.targetCoordinates) {
      appendRecentTarget(nextSpyTargets, coordinates);
    }
  }
  if (candidate.kind === 'attack') {
    appendRecentTarget(nextAttackTargets, targetCoordinates);
  }

  player.botMemory = {
    currentGoal: candidate.goalType,
    goalTarget: targetCoordinates,
    goalExpiresTurn: currentTurn + 2,
    reservedResources: { metal: 0, crystal: 0, deuterium: 0 },
    lastSpyTargets: nextSpyTargets,
    lastAttackTargets: nextAttackTargets,
    recentDiplomacyTargets: previousMemory?.recentDiplomacyTargets ?? [],
    goodwillByPlayer: previousMemory?.goodwillByPlayer ?? [],
    recentSupportRequests: previousMemory?.recentSupportRequests ?? [],
    processedSupportOutcomeIds: previousMemory?.processedSupportOutcomeIds ?? [],
    farmTargets: previousMemory?.farmTargets ?? [],
    lastProcessedFleetReportId: previousMemory?.lastProcessedFleetReportId ?? null
  };
}

function appendRecentDiplomacyTarget(
  player: Player,
  targetPlayerId: number,
  requestedStatus: 'PEACE' | 'ALLIED',
  currentTurn: number
): void {
  const memory = player.botMemory;
  if (!memory) {
    return;
  }

  memory.recentDiplomacyTargets.push({
    playerId: targetPlayerId,
    requestedStatus,
    turn: currentTurn
  });
  while (memory.recentDiplomacyTargets.length > 20) {
    memory.recentDiplomacyTargets.shift();
  }
}

function estimateBuildingBaseScore(
  buildingType: BuildingTypeType,
  planet: Planet,
  player: Player,
  profile: BotProfile,
  economyState: BotPlanetEconomyState,
  storagePressure: number
): number {
  const effectiveParameters = planet.getEffectivePlanetaryParameters();
  const energyRecoveryBonus = 18 + (economyState.energyGap * 3.5);
  const throughputBonus = 10 + Math.max(0, economyState.targetMineLevel - economyState.avgMineLevel);
  const infrastructureBonus = 8;

  switch (buildingType) {
    case BuildingType.METAL_MINE:
      return (16 * effectiveParameters.metalModifier * profile.economyWeight)
        + (economyState.stage === 'throughput' ? throughputBonus : 0);
    case BuildingType.CRYSTAL_MINE:
      return (15 * effectiveParameters.crystalModifier * profile.economyWeight)
        + (economyState.stage === 'throughput' ? throughputBonus : 0);
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return (14 * effectiveParameters.deuteriumModifier * profile.economyWeight)
        + (economyState.stage === 'throughput' ? throughputBonus : 0);
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
      return 8 + (economyState.stage === 'energy_recovery' ? energyRecoveryBonus : 0);
    case BuildingType.NUCLEAR_PLANT:
      return 7 + (economyState.stage === 'energy_recovery' ? energyRecoveryBonus - 1 : 0);
    case BuildingType.FUSION_REACTOR:
      return 6 + (economyState.stage === 'energy_recovery' ? energyRecoveryBonus - 2 : 0);
    case BuildingType.ROBOTICS_FACTORY:
      return (10 * profile.economyWeight)
        + (economyState.stage === 'throughput' ? throughputBonus + 4 : 0);
    case BuildingType.NANITE_FACTORY:
      return (12 * profile.economyWeight)
        + (economyState.stage === 'throughput' ? throughputBonus + 6 : 0);
    case BuildingType.RESEARCH_LAB:
      return (8 * profile.economyWeight)
        + (player.planets.some((entry) => entry.getBuildingLevel(BuildingType.RESEARCH_LAB) > 0) ? 0 : 4)
        + (economyState.stage === 'infrastructure' ? infrastructureBonus : 0);
    case BuildingType.SHIPYARD:
      return (4 + (profile.militaryWeight * 3))
        + (economyState.stage === 'throughput' ? throughputBonus - 2 : 0);
    case BuildingType.METAL_STORAGE:
    case BuildingType.CRYSTAL_STORAGE:
    case BuildingType.DEUTERIUM_TANK:
      return 2 + (10 * storagePressure) + (economyState.stage === 'infrastructure' ? infrastructureBonus : 0);
    case BuildingType.BUNKER_NETWORK:
      return 3 + (6 * profile.defenseWeight);
    default:
      return 1;
  }
}

function estimateResearchBaseScore(
  technologyType: TechnologyTypeType,
  profile: BotProfile,
  player: Player,
  economyState: BotPlanetEconomyState,
  localThreeTurnIncomeBudget: number,
  cost: ResourcesPackType
): number {
  const cheapResearchBonus = estimateResourceValue(cost) <= localThreeTurnIncomeBudget ? 10 : 0;
  switch (technologyType) {
    case TechnologyType.ADAPTIVE_TECHNOLOGY:
      return (18 * profile.economyWeight) + (economyState.stage === 'infrastructure' ? 7 : 0) + cheapResearchBonus;
    case TechnologyType.COMPUTER_TECHNOLOGY:
      return (15 * Math.max(profile.economyWeight, profile.militaryWeight))
        + (economyState.stage === 'infrastructure' ? 8 : 0)
        + cheapResearchBonus;
    case TechnologyType.ASTROPHYSICS_TECHNOLOGY:
      return (12 * profile.colonizeWeight) + cheapResearchBonus;
    case TechnologyType.ENERGY_TECHNOLOGY:
      return (11 * profile.economyWeight)
        + (economyState.stage === 'energy_recovery' ? 20 + (economyState.energyGap * 3.25) : 0)
        + cheapResearchBonus;
    case TechnologyType.MATERIAL_TECHNOLOGY:
      return (9 * Math.max(profile.economyWeight, profile.defenseWeight))
        + (economyState.stage === 'infrastructure' ? 6 : 0)
        + cheapResearchBonus;
    case TechnologyType.INTERGALACTIC_RESEARCH_NETWORK:
      return (calculateMaxLabsPerTechnology(player) > 1 ? 10 * profile.economyWeight : 5)
        + (economyState.stage === 'infrastructure' ? 4 : 0)
        + cheapResearchBonus;
    case TechnologyType.FUSION_DRIVE:
    case TechnologyType.HYPERSPACE_DRIVE:
    case TechnologyType.HYPERSPACE_TECHNOLOGY:
      return (14 * Math.max(profile.economyWeight, profile.militaryWeight)) + cheapResearchBonus;
    default:
      return 4 + cheapResearchBonus;
  }
}

function estimateShipyardBaseScore(
  shipType: ShipTypeType,
  existingAmount: number,
  ownedPlanetCount: number,
  profile: BotProfile,
  economyState: BotPlanetEconomyState
): number {
  const stagePenalty = economyState.stage === 'throughput' ? 1.5 : 0;
  switch (shipType) {
    case ShipType.SPY_PROBE:
      return (existingAmount <= 0 ? 12 * profile.spyWeight : 5 * profile.spyWeight) - stagePenalty;
    case ShipType.TRANSPORTER:
      return (existingAmount <= 0 ? 11 * profile.economyWeight : 6 * profile.economyWeight) - stagePenalty;
    case ShipType.FIGHTER:
      return existingAmount <= 0
        ? (9 * Math.max(profile.militaryWeight, profile.defenseWeight)) - stagePenalty
        : (5 * profile.militaryWeight) - stagePenalty;
    case ShipType.COLONIZER:
      return existingAmount <= 0
        ? ((10 * profile.colonizeWeight) + Math.max(0, 4 - ownedPlanetCount)) - stagePenalty
        : (4 * profile.colonizeWeight) - stagePenalty;
    default:
      return 3;
  }
}

function estimateStoragePressure(planet: Planet): number {
  const capacities = [
    planet.getBuildingProductionValue1(BuildingType.METAL_STORAGE),
    planet.getBuildingProductionValue1(BuildingType.CRYSTAL_STORAGE),
    planet.getBuildingProductionValue1(BuildingType.DEUTERIUM_TANK)
  ];
  const resources = [
    planet.rBDSFTQ.resources.metal,
    planet.rBDSFTQ.resources.crystal,
    planet.rBDSFTQ.resources.deuterium
  ];
  const ratios = capacities.map((capacity, index) =>
    capacity > 0 ? Math.min(1, resources[index] / capacity) : 0
  );
  return Math.max(...ratios, 0);
}

function buildPlanetEconomyState(planet: Planet, player: Player, profile: BotProfile): BotPlanetEconomyState {
  const targets = BOT_ECONOMY_TARGETS[profile.id];
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  const energyTechnologyLevel = player.getTechLevel(TechnologyType.ENERGY_TECHNOLOGY);
  const fusionOperation = planet.resolveFusionReactorOperation(adaptiveTechnologyLevel, energyTechnologyLevel);
  const solarProduction = planet.getBuildingProductionValue1(BuildingType.SOLAR_WIND_GEOTHERMAL);
  const nuclearProduction = planet.getBuildingProductionValue1(BuildingType.NUCLEAR_PLANT);
  const parameters = planet.info.planetaryParameters;
  const availableEnergy = (
    (solarProduction * parameters.energyModifierRES)
    + (nuclearProduction * parameters.energyModifierNuclear)
    + fusionOperation.powerOutput
  ) * (1 + ((energyTechnologyLevel * 2) / 100));
  let usedEnergy = 0;
  for (const buildingType of BUILDING_PRIORITY_TYPES) {
    usedEnergy += planet.getCurrentBuildingPowerConsumption(buildingType);
  }

  const avgMineLevel = averageBuildingLevels(planet, [
    BuildingType.METAL_MINE,
    BuildingType.CRYSTAL_MINE,
    BuildingType.DEUTERIUM_SYNTHESIZER
  ]);
  const avgStorageLevel = averageBuildingLevels(planet, [
    BuildingType.METAL_STORAGE,
    BuildingType.CRYSTAL_STORAGE,
    BuildingType.DEUTERIUM_TANK
  ]);
  const roboticsLevel = planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY);
  const shipyardLevel = planet.getBuildingLevel(BuildingType.SHIPYARD);
  const researchLabLevel = planet.getBuildingLevel(BuildingType.RESEARCH_LAB);
  const naniteLevel = planet.getBuildingLevel(BuildingType.NANITE_FACTORY);
  const targetAvailableEnergy = usedEnergy + TARGET_ENERGY_SURPLUS;
  const energyGap = Math.max(0, targetAvailableEnergy - availableEnergy);
  let stage: BotEconomyStage = 'open';
  if (availableEnergy < targetAvailableEnergy || energyDeficitEfficiencyMultiplier(availableEnergy, usedEnergy) < 1) {
    stage = 'energy_recovery';
  } else if (
    avgMineLevel < targets.mineLevel
    || roboticsLevel < targets.roboticsLevel
    || shipyardLevel < targets.shipyardLevel
  ) {
    stage = 'throughput';
  } else if (
    avgStorageLevel < Math.max(4, Math.floor(avgMineLevel / 2))
    || researchLabLevel < targets.researchLabLevel
  ) {
    stage = 'infrastructure';
  }

  return {
    stage,
    availableEnergy,
    usedEnergy,
    energyEfficiency: energyDeficitEfficiencyMultiplier(availableEnergy, usedEnergy),
    targetAvailableEnergy,
    energyGap,
    avgMineLevel,
    avgStorageLevel,
    roboticsLevel,
    shipyardLevel,
    researchLabLevel,
    naniteLevel,
    targetMineLevel: targets.mineLevel
  };
}

function averageBuildingLevels(planet: Planet, buildingTypes: BuildingTypeType[]): number {
  if (buildingTypes.length <= 0) {
    return 0;
  }

  const total = buildingTypes.reduce((sum, buildingType) => sum + planet.getBuildingLevel(buildingType), 0);
  return total / buildingTypes.length;
}

function isBuildingAllowedForEconomyStage(
  buildingType: BuildingTypeType,
  economyState: BotPlanetEconomyState
): boolean {
  if (economyState.stage === 'energy_recovery') {
    return (
      buildingType === BuildingType.SOLAR_WIND_GEOTHERMAL
      || buildingType === BuildingType.NUCLEAR_PLANT
      || buildingType === BuildingType.FUSION_REACTOR
    );
  }

  if (economyState.stage === 'throughput') {
    return (
      buildingType === BuildingType.METAL_MINE
      || buildingType === BuildingType.CRYSTAL_MINE
      || buildingType === BuildingType.DEUTERIUM_SYNTHESIZER
      || buildingType === BuildingType.ROBOTICS_FACTORY
      || buildingType === BuildingType.NANITE_FACTORY
      || buildingType === BuildingType.SHIPYARD
    );
  }

  if (economyState.stage === 'infrastructure') {
    return (
      buildingType === BuildingType.METAL_STORAGE
      || buildingType === BuildingType.CRYSTAL_STORAGE
      || buildingType === BuildingType.DEUTERIUM_TANK
      || buildingType === BuildingType.RESEARCH_LAB
      || buildingType === BuildingType.BUNKER_NETWORK
    );
  }

  return true;
}

function isResearchAllowedForEconomyStage(
  technologyType: TechnologyTypeType,
  economyState: BotPlanetEconomyState
): boolean {
  if (economyState.stage === 'energy_recovery') {
    return technologyType === TechnologyType.ENERGY_TECHNOLOGY;
  }

  if (economyState.stage === 'throughput') {
    return false;
  }

  if (economyState.stage === 'infrastructure') {
    return (
      technologyType === TechnologyType.COMPUTER_TECHNOLOGY
      || technologyType === TechnologyType.MATERIAL_TECHNOLOGY
      || technologyType === TechnologyType.ADAPTIVE_TECHNOLOGY
      || technologyType === TechnologyType.INTERGALACTIC_RESEARCH_NETWORK
    );
  }

  return true;
}

function calculateSpendableResourceRatio(player: Player, profile: BotProfile): number {
  const avgMineLevel = player.planets.length <= 0
    ? 0
    : player.planets.reduce((sum, planet) => (
      sum + averageBuildingLevels(planet, [
        BuildingType.METAL_MINE,
        BuildingType.CRYSTAL_MINE,
        BuildingType.DEUTERIUM_SYNTHESIZER
      ])
    ), 0) / player.planets.length;

  const baseRatioByProfile: Record<BotProfile['id'], number> = {
    BALANCED: 0.05,
    AGGRESSOR: 0.08,
    TURTLE: 0.05,
    MINER: 0.04,
    AVOIDER: 0.05,
    BUNKERER: 0.05
  };
  const perLevelRatioByProfile: Record<BotProfile['id'], number> = {
    BALANCED: 0.04,
    AGGRESSOR: 0.05,
    TURTLE: 0.03,
    MINER: 0.03,
    AVOIDER: 0.035,
    BUNKERER: 0.03
  };

  let ratio = baseRatioByProfile[profile.id] + (avgMineLevel * perLevelRatioByProfile[profile.id]);
  if (player.planets.length >= 2) {
    ratio += 0.05;
  }

  switch (player.botMemory?.currentGoal ?? null) {
    case 'PREPARE_SAFE_ATTACK':
    case 'FORTIFY_BORDER':
      ratio += 0.12;
      break;
    case 'COLONIZE_NEARBY':
      ratio += 0.08;
      break;
    case 'REFRESH_INTEL':
      ratio += 0.03;
      break;
    case 'KEY_BUILDING_UP':
    case 'ECONOMY_TECH_UP':
      ratio -= 0.04;
      break;
    default:
      break;
  }

  return Math.min(0.75, Math.max(baseRatioByProfile[profile.id], ratio));
}

function calculateLocalThreeTurnResearchBudget(
  planet: Planet,
  player: Player,
  economyState: BotPlanetEconomyState
): number {
  const adaptiveTechnologyLevel = player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY);
  const metalIncome = Math.max(0, Math.floor(planet.getMetalGain(adaptiveTechnologyLevel) * economyState.energyEfficiency));
  const crystalIncome = Math.max(0, Math.floor(planet.getCrystalGain(adaptiveTechnologyLevel) * economyState.energyEfficiency));
  const deuteriumIncome = Math.max(0, Math.floor(planet.getDeuteriumGain(adaptiveTechnologyLevel)));
  return estimateResourceValue(new ResourcesPack(metalIncome * 3, crystalIncome * 3, deuteriumIncome * 3));
}

function buildOrderedResearchPriorityTypes(
  player: Player,
  planet: Planet,
  profile: BotProfile,
  economyState: BotPlanetEconomyState,
  localThreeTurnIncomeBudget: number
): TechnologyTypeType[] {
  const orderedTypes: TechnologyTypeType[] = [];
  const seenTypes = new Set<TechnologyTypeType>();

  for (const target of FOUNDATIONAL_RESEARCH_TARGETS) {
    const nextType = resolveNextResearchGoalType(player, target.type, target.targetLevel);
    if (!nextType || seenTypes.has(nextType)) {
      continue;
    }

    const technology = TECHNOLOGY_BLUEPRINTS.get(nextType);
    if (!technology) {
      continue;
    }
    const nextLevel = player.getTechLevel(nextType) + 1;
    if (!hasResearchBuildingRequirements(planet, technology, nextLevel)) {
      continue;
    }

    orderedTypes.push(nextType);
    seenTypes.add(nextType);
  }

  for (const technologyType of RESEARCH_PRIORITY_TYPES) {
    if (seenTypes.has(technologyType)) {
      continue;
    }
    orderedTypes.push(technologyType);
    seenTypes.add(technologyType);
  }

  for (const [technologyType, technology] of TECHNOLOGY_BLUEPRINTS.techByType.entries()) {
    if (seenTypes.has(technologyType)) {
      continue;
    }

    const nextLevel = player.getTechLevel(technologyType) + 1;
    if (!hasResearchBuildingRequirements(planet, technology, nextLevel)) {
      continue;
    }
    if (!hasResearchTechnologyRequirements(player, technology, nextLevel)) {
      continue;
    }

    const cost = technology.getCostForLevel(nextLevel);
    if (estimateResourceValue(cost) > localThreeTurnIncomeBudget) {
      continue;
    }

    orderedTypes.push(technologyType);
    seenTypes.add(technologyType);
  }

  return orderedTypes;
}

function resolveNextResearchGoalType(
  player: Player,
  technologyType: TechnologyTypeType,
  targetLevel: number,
  visitedTypes = new Set<TechnologyTypeType>()
): TechnologyTypeType | null {
  if (visitedTypes.has(technologyType)) {
    return null;
  }
  visitedTypes.add(technologyType);

  const currentLevel = player.getTechLevel(technologyType);
  if (currentLevel >= targetLevel) {
    return null;
  }

  const technology = TECHNOLOGY_BLUEPRINTS.get(technologyType);
  if (!technology) {
    return null;
  }

  const nextLevel = currentLevel + 1;
  for (const requirement of technology.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const prerequisiteType = requirement.tech as TechnologyTypeType;
    if (player.getTechLevel(prerequisiteType) >= requiredLevel) {
      continue;
    }

    const prerequisiteNext = resolveNextResearchGoalType(player, prerequisiteType, requiredLevel, visitedTypes);
    if (prerequisiteNext) {
      return prerequisiteNext;
    }
  }

  return technologyType;
}

function isCostWithinSpendableRatio(
  resources: ResourcesPackType,
  cost: ResourcesPackType,
  spendableRatio: number
): boolean {
  const ratio = Math.max(0, Math.min(1, spendableRatio));
  return (
    cost.metal <= Math.floor(resources.metal * ratio)
    && cost.crystal <= Math.floor(resources.crystal * ratio)
    && cost.deuterium <= Math.floor(resources.deuterium * ratio)
  );
}

function isOptionalBuildingSpend(buildingType: BuildingTypeType): boolean {
  return (
    buildingType === BuildingType.BUNKER_NETWORK
    || buildingType === BuildingType.NANITE_FACTORY
    || buildingType === BuildingType.SHIPYARD
  );
}

function isFarmAttackUnlocked(player: Player, profile: BotProfile): boolean {
  if (
    player.getTechLevel(TechnologyType.FUSION_DRIVE) < 3
    || player.getTechLevel(TechnologyType.HYPERSPACE_DRIVE) < 2
  ) {
    return false;
  }
  if (player.planets.length <= 0) {
    return false;
  }

  const economyTargets = BOT_ECONOMY_TARGETS[profile.id];
  const averageMineLevel = player.planets.reduce((sum, planet) => (
    sum + averageBuildingLevels(planet, [
      BuildingType.METAL_MINE,
      BuildingType.CRYSTAL_MINE,
      BuildingType.DEUTERIUM_SYNTHESIZER
    ])
  ), 0) / player.planets.length;
  const maxRoboticsLevel = Math.max(...player.planets.map((planet) => planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY)));
  const maxResearchLabLevel = Math.max(...player.planets.map((planet) => planet.getBuildingLevel(BuildingType.RESEARCH_LAB)));
  const maxShipyardLevel = Math.max(...player.planets.map((planet) => planet.getBuildingLevel(BuildingType.SHIPYARD)));
  const hasEnergyRecoveryPlanet = player.planets.some((planet) => buildPlanetEconomyState(planet, player, profile).stage === 'energy_recovery');

  return (
    averageMineLevel >= economyTargets.mineLevel
    && maxRoboticsLevel >= economyTargets.roboticsLevel
    && maxResearchLabLevel >= economyTargets.researchLabLevel
    && maxShipyardLevel >= economyTargets.shipyardLevel
    && !hasEnergyRecoveryPlanet
    && player.planets.some((planet) => planetHasJumpCombatShip(planet))
  );
}

function isFusionReactorUpgradeDeuteriumSafe(
  planet: Planet,
  player: Player,
  nextLevel: number
): boolean {
  const fusionBlueprint = BUILDING_BLUEPRINTS.get(BuildingType.FUSION_REACTOR);
  if (!fusionBlueprint || nextLevel <= 0) {
    return false;
  }

  let otherEnergyUsed = 0;
  for (const [buildingType, level] of planet.rBDSFTQ.buildingsLevels.entries()) {
    if (buildingType === BuildingType.FUSION_REACTOR || level <= 0) {
      continue;
    }

    otherEnergyUsed += planet.getCurrentBuildingPowerConsumption(buildingType);
  }

  const projected = resolveFusionReactorOperation({
    selectedStage: nextLevel,
    maxStage: nextLevel,
    structuralUtilization: 1,
    energyTechnologyLevel: player.getTechLevel(TechnologyType.ENERGY_TECHNOLOGY),
    adaptiveTechnologyLevel: player.getTechLevel(TechnologyType.ADAPTIVE_TECHNOLOGY),
    solarProduction: planet.getBuildingProductionValue1(BuildingType.SOLAR_WIND_GEOTHERMAL),
    nuclearProduction: planet.getBuildingProductionValue1(BuildingType.NUCLEAR_PLANT),
    otherEnergyUsed,
    energyModifierRES: planet.info.planetaryParameters.energyModifierRES,
    energyModifierNuclear: planet.info.planetaryParameters.energyModifierNuclear,
    deuteriumSynthesizerProduction: planet.getBuildingProductionValue1(BuildingType.DEUTERIUM_SYNTHESIZER),
    deuteriumModifier: planet.getEffectivePlanetaryParameters().deuteriumModifier,
    fusionPowerAtStage: (stage) => {
      const value = fusionBlueprint.production1[stage - 1] ?? 0;
      return Number.isFinite(value) ? value : 0;
    },
    fusionDeuteriumAtStage: (stage) => {
      const value = fusionBlueprint.production2[stage - 1] ?? 0;
      return Number.isFinite(value) ? value : 0;
    }
  });

  return projected.effectiveStage === nextLevel && !projected.isClamped && projected.netDeuteriumIncome >= 0;
}

function isFarmTarget(owner: Player | null, status: string | null): boolean {
  return Boolean(
    owner
    && owner.type === PlayerType.NEUTRAL
    && (status === DiplomaticStatus.NEUTRAL || status === DiplomaticStatus.PASSIVE)
  );
}

function planetHasJumpCombatShip(planet: Planet): boolean {
  for (const [shipType, amount] of planet.rBDSFTQ.ships.undamagedCountByType().entries()) {
    if (amount <= 0) {
      continue;
    }

    const blueprint = SHIP_BLUEPRINTS.get(shipType);
    if (blueprint && blueprint.canJump && blueprint.weapons.length > 0) {
      return true;
    }
  }

  return false;
}

function estimateSpyTargetInterest(
  galaxy: Galaxy,
  player: Player,
  targetPlanet: Planet,
  report: EspionageReportData | null,
  diplomacyContexts: Map<number, BotDiplomacyContext>
): number {
  const owner = targetPlanet.info.ownerId === null
    ? null
    : resolvePlayerById(galaxy, targetPlanet.info.ownerId);
  const status = owner ? resolveDiplomaticStatus(galaxy, player.playerId, owner.playerId) : null;
  const farmTarget = isFarmTarget(owner, status);
  const diplomacyContext = owner ? (diplomacyContexts.get(owner.playerId) ?? null) : null;
  const ownerBias = farmTarget
    ? (status === DiplomaticStatus.PASSIVE ? 4.5 : 4)
    : status === DiplomaticStatus.WAR
    ? 4
    : status === DiplomaticStatus.NEUTRAL
      ? 2.5
      : status === DiplomaticStatus.PASSIVE
        ? 2
        : status === DiplomaticStatus.PEACE
          ? 0.5
          : -0.5;
  const borderPressureBonus = diplomacyContext ? Math.min(2.5, diplomacyContext.borderPressure * 0.5) : 0;
  if (!report) {
    return ownerBias + borderPressureBonus + 2;
  }

  return ownerBias
    + borderPressureBonus
    + (estimateResourceValue(report.resourcesAmount) / 200)
    + (report.totalShipsAmount / 3)
    + (report.totalDefencesAmount / 3);
}

function estimateResourceValue(resources: ResourcesPackType): number {
  return resources.metal + (resources.crystal * 2) + (resources.deuterium * 3);
}

function estimateRepairNeed(galaxy: Galaxy, player: Player, targetPlanet: Planet): number {
  let totalMissingHull = estimateMissingHullOnShips(targetPlanet.rBDSFTQ.ships);
  const targetCoordinates = coordinatesOfPlanet(targetPlanet);

  for (const fleet of galaxy.activeFleets) {
    if (fleet.ownerId !== player.playerId || fleet.state !== FleetState.ORBITING) {
      continue;
    }
    if (!sameCoordinates(fleet.target, targetCoordinates)) {
      continue;
    }

    totalMissingHull += estimateMissingHullOnShips(fleet.ships);
  }

  return totalMissingHull;
}

function estimateBombardTargetValue(report: EspionageReportData): number {
  const resourceBuildingValue =
    (report.buildingsLevels.get(BuildingType.METAL_MINE) ?? 0)
    + (report.buildingsLevels.get(BuildingType.CRYSTAL_MINE) ?? 0)
    + (report.buildingsLevels.get(BuildingType.DEUTERIUM_SYNTHESIZER) ?? 0);
  const facilityValue =
    (report.buildingsLevels.get(BuildingType.ROBOTICS_FACTORY) ?? 0)
    + (report.buildingsLevels.get(BuildingType.RESEARCH_LAB) ?? 0)
    + (report.buildingsLevels.get(BuildingType.SHIPYARD) ?? 0)
    + (report.buildingsLevels.get(BuildingType.BUNKER_NETWORK) ?? 0);
  return (resourceBuildingValue * 5) + (facilityValue * 7) + (report.totalDefencesAmount * 2);
}

function estimateMissingHullOnShips(ships: ManyShipsType): number {
  let total = 0;
  for (const damagedShip of ships.damagedShips) {
    const blueprint = SHIP_BLUEPRINTS.get(damagedShip.type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.hullPointsCapacity - damagedShip.hull);
  }

  return total;
}

function estimateTransportNeedValue(planet: Planet): number {
  const desiredMetal = 350;
  const desiredCrystal = 220;
  const desiredDeuterium = 140;
  return estimateResourceValue(new ResourcesPack(
    Math.max(0, desiredMetal - planet.rBDSFTQ.resources.metal),
    Math.max(0, desiredCrystal - planet.rBDSFTQ.resources.crystal),
    Math.max(0, desiredDeuterium - planet.rBDSFTQ.resources.deuterium)
  ));
}

function estimateReportCombatStrength(report: EspionageReportData): number {
  let total = 0;

  for (const [shipType, amount] of report.ships.entries()) {
    total += estimateShipCombatPower(shipType) * amount;
  }
  for (const defenceEntry of report.defences) {
    total += estimateDefenceCombatPower(defenceEntry.type as never) * defenceEntry.amount;
  }

  if (total <= 0) {
    total += report.totalShipsAmount * 6;
    total += report.totalDefencesAmount * 5;
  }

  return total;
}

function estimatePlanetCombatStrength(planet: Planet): number {
  let total = 0;

  for (const [shipType, amount] of planet.rBDSFTQ.ships.countByType().entries()) {
    total += estimateShipCombatPower(shipType) * amount;
  }
  for (const [defenceType, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
    total += estimateDefenceCombatPower(defenceType) * amount;
  }

  return total;
}

function estimatePlanetEconomicValue(planet: Planet): number {
  const buildingValue = (
    planet.getBuildingLevel(BuildingType.METAL_MINE)
    + planet.getBuildingLevel(BuildingType.CRYSTAL_MINE)
    + planet.getBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER)
    + planet.getBuildingLevel(BuildingType.ROBOTICS_FACTORY)
    + planet.getBuildingLevel(BuildingType.RESEARCH_LAB)
    + planet.getBuildingLevel(BuildingType.SHIPYARD)
  ) * 20;
  return estimateResourceValue(planet.rBDSFTQ.resources) + buildingValue;
}

function estimateShipSelectionCombatStrength(ships: CreateFleetShipSelectionEntry[]): number {
  let total = 0;
  for (const entry of ships) {
    const amount = entry.undamagedAmount + entry.damagedAmount;
    total += estimateShipCombatPower(entry.type) * amount;
  }
  return total;
}

function estimateShipCombatPower(shipType: ShipTypeType): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function estimateDefenceCombatPower(type: string): number {
  const blueprint = DEFENCE_BLUEPRINTS.get(type as never);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function buildAttackShipSelection(
  originPlanet: Planet,
  report: EspionageReportData,
  profile: BotProfile,
  options?: {
    requireBombardmentBreaker?: boolean;
  }
): CreateFleetShipSelectionEntry[] {
  const availableCounts = originPlanet.rBDSFTQ.ships.undamagedCountByType();
  const combatShips = [...availableCounts.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return Boolean(blueprint && blueprint.canJump && blueprint.weapons.length > 0);
    })
    .map(([shipType, amount]) => ({
      type: shipType,
      amount,
      power: estimateShipCombatPower(shipType)
    }))
    .sort((left, right) => right.power - left.power || left.type.localeCompare(right.type));

  const totalCombatPower = combatShips.reduce((sum, entry) => sum + (entry.power * entry.amount), 0);
  const reservePower = totalCombatPower * profile.reserveFloorRatio;
  let remainingLaunchPower = totalCombatPower - reservePower;
  if (remainingLaunchPower <= 0) {
    return [];
  }

  const selection: CreateFleetShipSelectionEntry[] = [];
  if (options?.requireBombardmentBreaker) {
    const bombardmentShip = combatShips.find((entry) => shipTypeHasBombardmentWeapons(entry.type)) ?? null;
    if (!bombardmentShip || (totalCombatPower - bombardmentShip.power) < reservePower) {
      return [];
    }

    selection.push({
      type: bombardmentShip.type,
      undamagedAmount: 1,
      damagedAmount: 0
    });
    remainingLaunchPower -= bombardmentShip.power;
    bombardmentShip.amount -= 1;
  }

  for (const entry of combatShips) {
    if (remainingLaunchPower <= 0) {
      break;
    }

    const maxByBudget = Math.max(0, Math.floor(remainingLaunchPower / entry.power));
    let amountToSend = Math.min(entry.amount, maxByBudget);
    if (amountToSend <= 0 && selection.length === 0 && (totalCombatPower - entry.power) >= reservePower) {
      amountToSend = 1;
    }
    if (amountToSend <= 0) {
      continue;
    }

    selection.push({
      type: entry.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    remainingLaunchPower -= entry.power * amountToSend;
  }

  if (selection.length === 0) {
    return [];
  }

  const reportedResourceValue = estimateResourceValue(report.resourcesAmount);
  const availableTransporters = availableCounts.get(ShipType.TRANSPORTER) ?? 0;
  if (
    reportedResourceValue > 0
    && availableTransporters > 0
    && !selection.some((entry) => entry.type === ShipType.TRANSPORTER)
  ) {
    selection.push({
      type: ShipType.TRANSPORTER,
      undamagedAmount: 1,
      damagedAmount: 0
    });
  }

  return selection;
}

function buildOpenedFarmRaidShipSelection(
  originPlanet: Planet,
  report: EspionageReportData
): CreateFleetShipSelectionEntry[] {
  const availableCounts = originPlanet.rBDSFTQ.ships.undamagedCountByType();
  const cargoCandidates = [...availableCounts.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return Boolean(blueprint && blueprint.canJump && blueprint.cargoCapacity > 0);
    })
    .map(([shipType, amount]) => {
      const blueprint = SHIP_BLUEPRINTS.get(shipType)!;
      return {
        type: shipType,
        amount,
        cargoCapacity: blueprint.cargoCapacity,
        power: estimateShipCombatPower(shipType)
      };
    })
    .sort((left, right) =>
      right.cargoCapacity - left.cargoCapacity
      || right.power - left.power
      || left.type.localeCompare(right.type)
    );
  if (cargoCandidates.length === 0) {
    return [];
  }

  const selection: CreateFleetShipSelectionEntry[] = [];
  let remainingCargoNeed = Math.max(1, Math.floor(estimateResourceValue(report.resourcesAmount) * 0.8));
  for (const entry of cargoCandidates) {
    if (remainingCargoNeed <= 0) {
      break;
    }

    const amountToSend = Math.min(entry.amount, Math.max(1, Math.ceil(remainingCargoNeed / entry.cargoCapacity)));
    selection.push({
      type: entry.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    remainingCargoNeed -= entry.cargoCapacity * amountToSend;
  }

  const hasCombatEscort = selection.some((entry) => estimateShipCombatPower(entry.type) > 0);
  if (!hasCombatEscort) {
    const escort = [...availableCounts.entries()]
      .filter(([shipType, amount]) => {
        if (amount <= 0) {
          return false;
        }

        const blueprint = SHIP_BLUEPRINTS.get(shipType);
        return Boolean(blueprint && blueprint.canJump && blueprint.weapons.length > 0);
      })
      .map(([shipType]) => ({
        type: shipType,
        power: estimateShipCombatPower(shipType)
      }))
      .sort((left, right) => right.power - left.power || left.type.localeCompare(right.type))[0] ?? null;
    if (!escort) {
      return [];
    }

    const existingEscort = selection.find((entry) => entry.type === escort.type) ?? null;
    if (existingEscort) {
      existingEscort.undamagedAmount += 1;
    } else {
      selection.push({
        type: escort.type,
        undamagedAmount: 1,
        damagedAmount: 0
      });
    }
  }

  return selection;
}

function shipTypeHasBombardmentWeapons(shipType: ShipTypeType): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  return Boolean(blueprint?.weapons.some((weapon) => weapon.type === WeaponType.BOMBARDMENT_WEAPONS));
}

function buildGuardShipSelection(
  originPlanet: Planet,
  threatStrength: number,
  targetDefenseStrength: number,
  profile: BotProfile
): CreateFleetShipSelectionEntry[] {
  const availableCounts = originPlanet.rBDSFTQ.ships.undamagedCountByType();
  const combatShips = [...availableCounts.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return Boolean(
        blueprint
        && blueprint.weapons.length > 0
        && !blueprint.purposes.has(ShipPurpose.CARGO)
      );
    })
    .map(([shipType, amount]) => ({
      type: shipType,
      amount,
      power: estimateShipCombatPower(shipType)
    }))
    .sort((left, right) => right.power - left.power || left.type.localeCompare(right.type));

  const totalCombatPower = combatShips.reduce((sum, entry) => sum + (entry.power * entry.amount), 0);
  const reservePower = totalCombatPower * profile.reserveFloorRatio;
  const availableLaunchPower = totalCombatPower - reservePower;
  if (availableLaunchPower <= 0) {
    return [];
  }

  const desiredLaunchPower = Math.min(
    availableLaunchPower,
    Math.max(threatStrength - targetDefenseStrength, threatStrength * 0.45)
  );
  if (desiredLaunchPower <= 0) {
    return [];
  }

  const selection: CreateFleetShipSelectionEntry[] = [];
  let selectedPower = 0;
  for (const entry of combatShips) {
    if (selectedPower >= desiredLaunchPower) {
      break;
    }

    const remainingPower = desiredLaunchPower - selectedPower;
    let amountToSend = Math.min(entry.amount, Math.max(1, Math.ceil(remainingPower / entry.power)));
    while (
      amountToSend > 0
      && ((totalCombatPower - ((selectedPower + (amountToSend * entry.power)))) < reservePower)
    ) {
      amountToSend -= 1;
    }

    if (amountToSend <= 0) {
      continue;
    }

    selection.push({
      type: entry.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    selectedPower += entry.power * amountToSend;
  }

  return selection;
}

function buildBombardShipSelection(
  originPlanet: Planet,
  profile: BotProfile,
  requireHeavyCommitment: boolean
): CreateFleetShipSelectionEntry[] {
  const availableCounts = originPlanet.rBDSFTQ.ships.undamagedCountByType();
  const bomberShips = [...availableCounts.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return Boolean(
        blueprint
        && blueprint.canJump
        && blueprint.purposes.has(ShipPurpose.BOMBER)
      );
    })
    .map(([shipType, amount]) => ({
      type: shipType,
      amount,
      power: estimateShipCombatPower(shipType)
    }))
    .sort((left, right) => right.power - left.power || left.type.localeCompare(right.type));

  const totalBomberPower = bomberShips.reduce((sum, entry) => sum + (entry.power * entry.amount), 0);
  const reservePower = totalBomberPower * profile.reserveFloorRatio;
  const availableLaunchPower = totalBomberPower - reservePower;
  if (availableLaunchPower <= 0) {
    return [];
  }

  const desiredLaunchPower = requireHeavyCommitment
    ? Math.max(40, availableLaunchPower * 0.75)
    : Math.max(24, availableLaunchPower * 0.45);

  const selection: CreateFleetShipSelectionEntry[] = [];
  let selectedPower = 0;
  for (const entry of bomberShips) {
    if (selectedPower >= desiredLaunchPower) {
      break;
    }

    const remainingPower = desiredLaunchPower - selectedPower;
    let amountToSend = Math.min(entry.amount, Math.max(1, Math.ceil(remainingPower / entry.power)));
    while (
      amountToSend > 0
      && (totalBomberPower - (selectedPower + (amountToSend * entry.power))) < reservePower
    ) {
      amountToSend -= 1;
    }

    if (amountToSend <= 0) {
      continue;
    }

    selection.push({
      type: entry.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    selectedPower += entry.power * amountToSend;
  }

  return selection;
}

function buildMoveShipSelection(
  originPlanet: Planet,
  strategicNeed: number,
  profile: BotProfile
): CreateFleetShipSelectionEntry[] {
  const availableCounts = originPlanet.rBDSFTQ.ships.undamagedCountByType();
  const combatShips = [...availableCounts.entries()]
    .filter(([shipType, amount]) => {
      if (amount <= 0) {
        return false;
      }

      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return Boolean(blueprint && blueprint.weapons.length > 0);
    })
    .map(([shipType, amount]) => ({
      type: shipType,
      amount,
      power: estimateShipCombatPower(shipType)
    }))
    .sort((left, right) => right.power - left.power || left.type.localeCompare(right.type));

  const totalCombatPower = combatShips.reduce((sum, entry) => sum + (entry.power * entry.amount), 0);
  const reservePower = totalCombatPower * profile.reserveFloorRatio;
  const availableLaunchPower = totalCombatPower - reservePower;
  if (availableLaunchPower <= 0) {
    return [];
  }

  const desiredLaunchPower = Math.min(
    availableLaunchPower,
    Math.max(18, strategicNeed * 0.6)
  );
  if (desiredLaunchPower <= 0) {
    return [];
  }

  const selection: CreateFleetShipSelectionEntry[] = [];
  let selectedPower = 0;
  for (const entry of combatShips) {
    if (selectedPower >= desiredLaunchPower) {
      break;
    }

    const remainingPower = desiredLaunchPower - selectedPower;
    let amountToSend = Math.min(entry.amount, Math.max(1, Math.ceil(remainingPower / entry.power)));
    while (
      amountToSend > 0
      && (totalCombatPower - (selectedPower + (amountToSend * entry.power))) < reservePower
    ) {
      amountToSend -= 1;
    }

    if (amountToSend <= 0) {
      continue;
    }

    selection.push({
      type: entry.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    selectedPower += entry.power * amountToSend;
  }

  return selection;
}

function defaultBombardmentPrioritiesForProfile(
  profile: BotProfile,
  siege: boolean
): BombardmentPriorities {
  if (profile.id === 'BUNKERER') {
    return {
      main: BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT,
      secondary: BombardmentPriorityTarget.DEFENCES,
      tertiary: BombardmentPriorityTarget.FACILITIES
    };
  }

  if (siege) {
    return {
      main: BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT,
      secondary: BombardmentPriorityTarget.FACILITIES,
      tertiary: BombardmentPriorityTarget.RESOURCE_BUILDINGS
    };
  }

  return {
    main: BombardmentPriorityTarget.RESOURCE_BUILDINGS,
    secondary: BombardmentPriorityTarget.FACILITIES,
    tertiary: BombardmentPriorityTarget.DEFENCES_CAN_SHOOT_TO_ORBIT
  };
}

function buildTransportPlan(
  originPlanet: Planet,
  targetPlanet: Planet,
  availableTransporters: number
): {
  transporterAmount: number;
  cargo: { metal: number; crystal: number; deuterium: number };
  cargoValue: number;
} | null {
  const transporterBlueprint = SHIP_BLUEPRINTS.get(ShipType.TRANSPORTER);
  if (!transporterBlueprint || transporterBlueprint.cargoCapacity <= 0) {
    return null;
  }

  const surplus = {
    metal: Math.max(0, originPlanet.rBDSFTQ.resources.metal - 250),
    crystal: Math.max(0, originPlanet.rBDSFTQ.resources.crystal - 150),
    deuterium: Math.max(0, originPlanet.rBDSFTQ.resources.deuterium - 140)
  };
  const need = {
    metal: Math.max(0, 350 - targetPlanet.rBDSFTQ.resources.metal),
    crystal: Math.max(0, 220 - targetPlanet.rBDSFTQ.resources.crystal),
    deuterium: Math.max(0, 140 - targetPlanet.rBDSFTQ.resources.deuterium)
  };

  const maxCargo = transporterBlueprint.cargoCapacity * availableTransporters;
  let remainingCapacity = maxCargo;
  const cargo = {
    metal: Math.min(surplus.metal, need.metal, remainingCapacity),
    crystal: 0,
    deuterium: 0
  };
  remainingCapacity -= cargo.metal;
  cargo.crystal = Math.min(surplus.crystal, need.crystal, remainingCapacity);
  remainingCapacity -= cargo.crystal;
  cargo.deuterium = Math.min(surplus.deuterium, need.deuterium, remainingCapacity);

  const cargoTotal = cargo.metal + cargo.crystal + cargo.deuterium;
  if (cargoTotal <= 0) {
    return null;
  }

  const transporterAmount = Math.max(1, Math.ceil(cargoTotal / transporterBlueprint.cargoCapacity));
  return {
    transporterAmount,
    cargo,
    cargoValue: estimateResourceValue(new ResourcesPack(cargo.metal, cargo.crystal, cargo.deuterium))
  };
}

function buildMaintenanceRequestPayload(
  fleet: { fuelCost: number; cargo: ResourcesPackType },
  options: FleetMaintenanceOptionsDto
): CreateFleetMaintenanceRequestCommand | null {
  const desiredFuel = Math.max(0, Math.max(24, fleet.fuelCost) - fleet.cargo.deuterium);
  const requestedFuel = Math.min(
    desiredFuel,
    options.availableFuel,
    options.fuelCap,
    options.remainingCargoCapacity
  );

  const requestedShips = options.availableShips
    .map((entry) => {
      const blueprint = SHIP_BLUEPRINTS.get(entry.type);
      if (!blueprint || blueprint.weapons.length <= 0 || blueprint.purposes.has(ShipPurpose.CARGO)) {
        return null;
      }

      const maxBySupport = blueprint.size <= 0
        ? entry.available
        : Math.floor(options.supportCap / blueprint.size);
      const maxByHangar = blueprint.canJump || blueprint.size <= 0
        ? entry.available
        : Math.floor(options.remainingHangarCapacity / blueprint.size);
      const amount = Math.min(entry.available, 1, maxBySupport, maxByHangar);
      if (amount <= 0) {
        return null;
      }

      return {
        type: entry.type,
        amount
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => !!entry);

  if (requestedFuel <= 0 && requestedShips.length <= 0) {
    return null;
  }

  return {
    fuel: requestedFuel,
    ships: requestedShips,
    bombs: []
  };
}

function shouldApproveIncomingJumpGateRequest(
  galaxy: Galaxy,
  player: Player,
  totalShips: number,
  targetCoordinates: ClientCoordinates
): boolean {
  const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), targetCoordinates));
  if (!targetPlanet || targetPlanet.info.ownerId !== player.playerId) {
    return false;
  }

  const targetDefenseStrength = estimatePlanetCombatStrength(targetPlanet);
  const nearbyThreat = estimateNearbyThreat(galaxy, player, targetPlanet);
  if (nearbyThreat && nearbyThreat.pressure > Math.max(36, targetDefenseStrength * 1.25)) {
    return false;
  }

  return totalShips <= 24;
}

function decideIncomingMaintenanceRequest(
  galaxy: Galaxy,
  player: Player,
  profile: BotProfile,
  requestId: number
): {
  approve: boolean;
  override: CreateFleetMaintenanceRequestCommand | null;
  reason: string;
} {
  const request = galaxy.maintenanceRequests.find((entry) => entry.requestId === requestId) ?? null;
  if (!request) {
    return { approve: false, override: null, reason: 'Maintenance request is no longer available.' };
  }

  const requester = resolvePlayerById(galaxy, request.fromPlayerId);
  if (!requester) {
    return { approve: false, override: null, reason: 'Maintenance requester is no longer available.' };
  }

  const status = resolveDiplomaticStatus(galaxy, player.playerId, requester.playerId);
  if (status !== DiplomaticStatus.ALLIED && status !== DiplomaticStatus.PEACE) {
    return { approve: false, override: null, reason: 'Rejected maintenance request from non-friendly empire.' };
  }

  const targetPlanet = flattenPlanets(galaxy).find((planet) => sameCoordinates(coordinatesOfPlanet(planet), request.targetCoordinates));
  if (!targetPlanet || targetPlanet.info.ownerId !== player.playerId) {
    return { approve: false, override: null, reason: 'Rejected maintenance request for invalid target planet.' };
  }

  const nearbyThreat = estimateNearbyThreat(galaxy, player, targetPlanet);
  const targetDefenseStrength = estimatePlanetCombatStrength(targetPlanet);
  if (nearbyThreat && nearbyThreat.pressure > Math.max(32, targetDefenseStrength * (1.1 + (profile.defenseWeight * 0.15)))) {
    return { approve: false, override: null, reason: 'Rejected maintenance request because the depot planet is under pressure.' };
  }

  const fleet = galaxy.activeFleets.find((entry) =>
    entry.fleetId === request.fleetId && entry.ownerId === request.fromPlayerId
  ) ?? null;
  if (!fleet) {
    return { approve: false, override: null, reason: 'Maintenance fleet is no longer available.' };
  }

  let approvedFuel = 0;
  if (request.requested.fuel > 0) {
    const localFuelReserve = Math.max(60, Math.floor(targetPlanet.rBDSFTQ.resources.deuterium * 0.25));
    const remainingCargoCapacity = Math.max(0, fleet.totalCargoCapacity - fleet.usedCargoCapacity);
    const fuelCap = Math.max(0, Math.floor(targetPlanet.getBuildingProductionValue1(BuildingType.ALLIANCE_DEPOT)));
    approvedFuel = Math.max(
      0,
      Math.min(
        request.requested.fuel,
        targetPlanet.rBDSFTQ.resources.deuterium - localFuelReserve,
        fuelCap,
        remainingCargoCapacity
      )
    );
  }

  const allowShipAndBombSupport = status === DiplomaticStatus.ALLIED;
  const override: CreateFleetMaintenanceRequestCommand = {
    fuel: approvedFuel,
    ships: allowShipAndBombSupport ? request.requested.ships : [],
    bombs: allowShipAndBombSupport ? request.requested.bombs : []
  };

  const hasAnyApproval = override.fuel > 0 || override.ships.length > 0 || override.bombs.length > 0;
  if (!hasAnyApproval) {
    return {
      approve: false,
      override: null,
      reason: allowShipAndBombSupport
        ? 'Rejected maintenance request because the depot cannot spare support this turn.'
        : 'Rejected maintenance request because only limited fuel support is allowed for peace contacts.'
    };
  }

  const approvesFullFuel = request.requested.fuel <= override.fuel;
  const approvesShipsOrBombs = request.requested.ships.length > 0 || request.requested.bombs.length > 0;
  if (allowShipAndBombSupport && approvesFullFuel && approvesShipsOrBombs) {
    return { approve: true, override: null, reason: 'Approved full allied maintenance request.' };
  }

  return {
    approve: true,
    override,
    reason: 'Approved limited maintenance support.'
  };
}

function estimateNearbyThreat(
  galaxy: Galaxy,
  player: Player,
  targetPlanet: Planet
): { pressure: number; reportStrength: number } | null {
  const targetCoordinates = coordinatesOfPlanet(targetPlanet);
  let best: { pressure: number; reportStrength: number } | null = null;

  for (const foreignPlanet of collectForeignPlanets(galaxy, player.playerId)) {
    if (foreignPlanet.info.ownerId === null) {
      continue;
    }

    const foreignOwner = resolvePlayerById(galaxy, foreignPlanet.info.ownerId);
    if (!foreignOwner) {
      continue;
    }

    const status = resolveDiplomaticStatus(galaxy, player.playerId, foreignOwner.playerId);
    const pressureScale = status === DiplomaticStatus.WAR
      ? 1
      : status === DiplomaticStatus.PASSIVE
        ? 0.85
        : status === DiplomaticStatus.NEUTRAL
          ? 0.65
          : status === DiplomaticStatus.PEACE
            ? 0.15
            : 0;
    if (pressureScale <= 0) {
      continue;
    }

    const report = foreignPlanet.lastReportData.get(player.playerId) ?? null;
    if (!report) {
      continue;
    }

    const distance = calculateTravelDistance(targetCoordinates, coordinatesOfPlanet(foreignPlanet));
    if (distance > 3) {
      continue;
    }

    const reportStrength = Math.max(1, estimateReportCombatStrength(report));
    const pressure = (reportStrength / Math.max(1, distance)) * pressureScale;
    if (!best || pressure > best.pressure) {
      best = { pressure, reportStrength };
    }
  }

  return best;
}

function collectForeignPlanets(galaxy: Galaxy, playerId: number): Planet[] {
  return flattenPlanets(galaxy)
    .filter((planet) => planet.info.ownerId !== playerId);
}

function collectColonizablePlanets(galaxy: Galaxy, player: Player): Planet[] {
  return flattenPlanets(galaxy)
    .filter((planet) => {
      if (planet.info.ownerId === player.playerId) {
        return false;
      }
      if (planet.info.ownerId === null) {
        return true;
      }

      const owner = resolvePlayerById(galaxy, planet.info.ownerId);
      if (!owner || owner.type !== PlayerType.NEUTRAL) {
        return false;
      }

      const status = resolveDiplomaticStatus(galaxy, player.playerId, owner.playerId);
      return status === DiplomaticStatus.PASSIVE;
    });
}

function flattenPlanets(galaxy: Galaxy): Planet[] {
  return galaxy.stars.flatMap((row) => row.flatMap((system) => system.planets));
}

function planetUndamagedAmount(planet: Planet, shipType: ShipTypeType): number {
  return planet.rBDSFTQ.ships.undamagedCountByType().get(shipType) ?? 0;
}

function countOwnedShipsByType(player: Player): Map<ShipTypeType, number> {
  const counts = new Map<ShipTypeType, number>();

  for (const planet of player.planets) {
    for (const [type, amount] of planet.rBDSFTQ.ships.countByType().entries()) {
      counts.set(type, (counts.get(type) ?? 0) + amount);
    }
  }

  for (const fleet of player.fleets) {
    for (const [type, amount] of fleet.ships.countByType().entries()) {
      counts.set(type, (counts.get(type) ?? 0) + amount);
    }
  }

  return counts;
}

function scoreUtility(base: number, cost: ResourcesPackType): number {
  const valuedCost = cost.metal + (cost.crystal * 2) + (cost.deuterium * 3);
  return base - (valuedCost / 30);
}

function applyGoalBonus(
  memory: BotMemory | null,
  goalType: BotGoalType,
  utility: number,
  coordinates: BotMemoryCoordinates
): number {
  if (!memory || memory.currentGoal !== goalType || !memory.goalTarget) {
    return utility;
  }

  if (sameCoordinates(memory.goalTarget, coordinates)) {
    return utility + 2;
  }

  return utility + 1;
}

function appendRecentTarget(targets: BotMemoryCoordinates[], coordinates: BotMemoryCoordinates): void {
  targets.push({ ...coordinates });
  while (targets.length > 20) {
    targets.shift();
  }
}

function hasRecentTarget(targets: BotMemoryCoordinates[], coordinates: BotMemoryCoordinates): boolean {
  return targets.some((entry) => sameCoordinates(entry, coordinates));
}

function hasRecentTargetWithinWindow(
  targets: BotMemoryCoordinates[],
  coordinates: BotMemoryCoordinates,
  windowSize: number
): boolean {
  const normalizedWindowSize = Math.max(0, Math.floor(windowSize));
  if (normalizedWindowSize <= 0) {
    return false;
  }

  return targets
    .slice(Math.max(0, targets.length - normalizedWindowSize))
    .some((entry) => sameCoordinates(entry, coordinates));
}

function requestCoordinates(candidate: BotCandidate): BotMemoryCoordinates {
  switch (candidate.kind) {
    case 'building':
    case 'research':
    case 'shipyard':
      return { x: candidate.request.x, y: candidate.request.y, z: candidate.request.z };
    case 'system_spy':
      return { ...candidate.primaryTargetCoordinates };
    case 'spy':
    case 'colonize':
    case 'attack':
    case 'transport':
    case 'bombard':
    case 'siege':
    case 'recycle':
    case 'repair':
    case 'maintenance':
    case 'guard':
    case 'move':
      return candidate.kind === 'maintenance'
        ? { ...candidate.targetCoordinates }
        : { ...candidate.request.target };
  }
}

function coordinatesOfPlanet<T extends object = Record<string, never>>(
  planet: Planet,
  extra?: T
): BotMemoryCoordinates & T {
  return {
    x: planet.basicInfo.solarSystem.coordinates.x,
    y: planet.basicInfo.solarSystem.coordinates.y,
    z: Math.max(0, planet.basicInfo.order - 1),
    ...(extra ?? {} as T)
  };
}

function sameCoordinates(left: ClientCoordinates, right: ClientCoordinates): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function candidateKey(candidate: BotCandidate): string {
  return JSON.stringify({
    kind: candidate.kind,
    fleetId: candidate.kind === 'maintenance' ? candidate.fleetId : null,
    request: candidate.request
  });
}

function summarizeCandidateRequest(candidate: BotCandidate): string {
  switch (candidate.kind) {
    case 'building':
      return `${candidate.request.buildingType} @ ${candidate.request.x}:${candidate.request.y}:${candidate.request.z}`;
    case 'research':
      return `${candidate.request.technologyType} @ ${candidate.request.x}:${candidate.request.y}:${candidate.request.z}`;
    case 'shipyard':
      return `${candidate.request.shipType ?? candidate.request.defenceType ?? candidate.request.itemKind} x${candidate.request.amount} @ ${candidate.request.x}:${candidate.request.y}:${candidate.request.z}`;
    case 'system_spy':
      return `SYSTEM_SPY ${candidate.request.origin.x}:${candidate.request.origin.y}:${candidate.request.origin.z} -> ${candidate.request.systemX}:${candidate.request.systemY} (${candidate.targetCoordinates.length} targets)`;
    case 'spy':
    case 'colonize':
    case 'attack':
    case 'transport':
    case 'bombard':
    case 'siege':
    case 'recycle':
    case 'repair':
    case 'maintenance':
    case 'guard':
    case 'move':
      if (candidate.kind === 'maintenance') {
        return `MAINTENANCE Fleet #${candidate.fleetId} @ ${candidate.targetCoordinates.x}:${candidate.targetCoordinates.y}:${candidate.targetCoordinates.z} fuel:${candidate.request.fuel}`;
      }
      return `${candidate.request.missionType} ${candidate.request.origin.x}:${candidate.request.origin.y}:${candidate.request.origin.z} -> ${candidate.request.target.x}:${candidate.request.target.y}:${candidate.request.target.z}${candidate.request.useJumpGate ? ' via Jump Gate' : ''}`;
  }
}

function pushRejectedActionTrace(
  rejectedActions: BotRejectedActionTrace[],
  candidate: BotCandidate,
  rejectionType: BotRejectedActionTrace['rejectionType'],
  errorMessage: string | null
): void {
  rejectedActions.push({
    kind: candidate.kind,
    reason: candidate.reason,
    rejectionType,
    expectedUtility: candidate.utility,
    details: {
      message: errorMessage,
      requestSummary: summarizeCandidateRequest(candidate)
    }
  });
  while (rejectedActions.length > 10) {
    rejectedActions.shift();
  }
}

function shouldUseJumpGateRoute(
  galaxy: Galaxy,
  playerId: number,
  missionType: FleetMissionTypeType,
  originPlanet: Planet,
  targetPlanet: Planet,
  ships: CreateFleetShipSelectionEntry[]
): boolean {
  if (targetPlanet.info.ownerId !== playerId) {
    return false;
  }

  const distance = calculateTravelDistance(coordinatesOfPlanet(originPlanet), coordinatesOfPlanet(targetPlanet));
  if (distance <= 2) {
    return false;
  }

  const totalSelectedShips = ships.reduce((sum, entry) => sum + entry.undamagedAmount + entry.damagedAmount, 0);
  const jumpGateAccess = validateJumpGateLaunchAccess(
    galaxy,
    playerId,
    missionType,
    originPlanet,
    targetPlanet,
    totalSelectedShips
  );

  return !('error' in jumpGateAccess);
}
