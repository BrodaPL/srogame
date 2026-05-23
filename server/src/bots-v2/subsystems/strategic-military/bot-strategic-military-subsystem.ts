import * as buildingTypeModule from '../../../../../src/app/models/enums/building-type.js';
import * as defenceTypeModule from '../../../../../src/app/models/enums/defence-type.js';
import * as fleetMissionTypeModule from '../../../../../src/app/models/enums/fleet-mission-type.js';
import * as shipTypeModule from '../../../../../src/app/models/enums/ship-type.js';
import * as technologyTypeModule from '../../../../../src/app/models/enums/technology-type.js';
import * as weaponTypeModule from '../../../../../src/app/models/enums/weapon-type.js';
import * as technologyEffectsModule from '../../../../../src/app/models/tech/technology-effects.js';
import type { BotMemoryV2StrategicMilitaryFarmLedgerEntry } from '../../../../../src/app/models/player.ts';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotStrategicMilitaryTargetSnapshot,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';
import {
  calculateFuelCost,
  calculateTravelDistance,
  DEFENCE_BLUEPRINTS,
  SHIP_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import { resolveModule } from '../../../esm-module.js';

const { BuildingType } = resolveModule(buildingTypeModule) as typeof import('../../../../../src/app/models/enums/building-type.js');
const { DefenceType } = resolveModule(defenceTypeModule) as typeof import('../../../../../src/app/models/enums/defence-type.js');
const { FleetMissionType } = resolveModule(fleetMissionTypeModule) as typeof import('../../../../../src/app/models/enums/fleet-mission-type.js');
const { ShipType } = resolveModule(shipTypeModule) as typeof import('../../../../../src/app/models/enums/ship-type.js');
const { TechnologyType } = resolveModule(technologyTypeModule) as typeof import('../../../../../src/app/models/enums/technology-type.js');
const { WeaponType } = resolveModule(weaponTypeModule) as typeof import('../../../../../src/app/models/enums/weapon-type.js');
const { fleetTravelTurnsForDistance } = resolveModule(technologyEffectsModule) as typeof import('../../../../../src/app/models/tech/technology-effects.js');

type BuildingTypeT = buildingTypeModule.BuildingType;
type DefenceTypeT = defenceTypeModule.DefenceType;
type FleetMissionTypeT = fleetMissionTypeModule.MissionType;
type ShipTypeT = shipTypeModule.ShipType;
type TechnologyTypeT = technologyTypeModule.TechnologyType;

type ResourceKey = 'metal' | 'crystal' | 'deuterium';
type ResourceAmounts = Record<ResourceKey, number>;

type MissionRequest = {
  kind: 'MISSION';
  phase: 'INTEL' | 'BREAK' | 'PLUNDER';
  missionType: FleetMissionTypeT;
  target: BotStrategicMilitaryTargetSnapshot;
  destinationCoordinates: { x: number; y: number; z: number };
  originPlanet: BotPlanetSnapshot;
  ships: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>;
  expectedLoot: number;
  travelDistance: number;
  travelTurns: number;
  score: number;
  stagingPlanet: BotPlanetSnapshot | null;
  moveRole: 'RELOCATION' | null;
};

type ShipNeedRequest = {
  kind: 'SHIP_NEED';
  shipType: ShipTypeT;
  amount: number;
  shortageKind: 'BOMBARDMENT' | 'COMBAT' | 'CARGO';
  targetCoordinates: { x: number; y: number; z: number };
  preferredOrigin: { x: number; y: number; z: number } | null;
  score: number;
  reason: string;
};

type BreakSelection = {
  ships: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>;
  combatStrength: number;
};

type RelocationBreakPlan = {
  requests: MissionRequest[];
  stagingPlanet: BotPlanetSnapshot;
  combinedStrength: number;
  totalEtaScore: number;
  hasBombardmentPresence: boolean;
};

type PlunderSelection = {
  ships: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>;
  cargoCapacity: number;
  combatEscortCount: number;
};

type FarmLedgerMap = Map<string, BotMemoryV2StrategicMilitaryFarmLedgerEntry>;

type FarmMissionReservation = {
  actionableFarmCount: number;
  activeFarmIntelMissionCount: number;
  activeFarmBreakMissionCount: number;
  activeFarmPlunderMissionCount: number;
  reservedOperationSlots: number;
  availableBreakSlots: number;
  availablePlunderSlots: number;
  availableIntelSlots: number;
};

const STRATEGIC_MILITARY_AVAILABILITY = 0.4;
const BREAK_FORCE_MULTIPLIER = 1.5;
const MIN_PLUNDER_ESCORTS = 1;
const MAX_PLUNDER_ESCORTS = 1;
const DEFAULT_ESCORT_SHIP_NEED = 1;
const MAX_SHIP_NEED_PROPOSALS = 6;
const BREAK_MISSION_SHARE = 0.6;
const POST_EARLY_NEUTRAL_WARFARE_AVG_INDUSTRY_THRESHOLD = 4;
const POST_EARLY_BREAK_SCORE_BONUS = 180;
const POST_EARLY_PLUNDER_SCORE_MULTIPLIER = 1.6;
const POST_EARLY_SHIP_NEED_SCORE_BONUS = 180;
const OPENED_FARM_REPEAT_BASE_SCORE_BONUS = 160;
const OPENED_FARM_RECENT_PLUNDER_MAX_BONUS = 120;
const OPENED_FARM_EXTRA_CARGO_SCORE_BONUS = 18;
const NEUTRAL_FARM_UNLOCK_AVG_INDUSTRY_THRESHOLD = 3;
const NEUTRAL_FARM_PRODUCTION_AVG_INDUSTRY_THRESHOLD = 3.3;
const DEFAULT_FARM_TRANSPORTER_COUNT = 6;
const MIN_FARM_TRANSPORTER_COUNT = 1;
const MAX_FARM_TRANSPORTER_COUNT = 12;
const MIN_DEFENDED_BREAK_WARSHIPS = 2;
const RESERVED_FARM_INTEL_SLOTS = 1;
const BASE_RESERVED_FARM_OPERATION_SLOTS = 2;
const MAX_ACTIVE_BREAK_FLEETS = 1;
const NEAREST_FARMS_PER_PLANET = 5;
const BREAK_FAILURE_COOLDOWN_TURNS = 4;
const BREAK_RETRY_MULTIPLIER_LIGHT = 1.5;
const BREAK_RETRY_MULTIPLIER_MEDIUM = 2;
const BREAK_RETRY_MULTIPLIER_DEFEAT = 3.5;

export class BotStrategicMilitarySubsystem implements BotSubsystem {
  public readonly subsystemId = 'STRATEGIC_MILITARY' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const missionRequests: MissionRequest[] = [];
    const shipNeeds: ShipNeedRequest[] = [];
    const missionCap = resolveMissionRequestCap(context);
    const targets = context.snapshot.empire.strategicMilitaryTargets;
    const farmLedger = createFarmLedgerMap(context.memory.strategicMilitary.farmLedger);
    const neutralFarmTargets = resolveNeutralFarmTargets(context, targets, farmLedger);

    for (const target of neutralFarmTargets) {
      const farmEntry = updateFarmLedgerEntryFromTarget(context, farmLedger, target);

      if (target.hasForeignGuard || target.hasOwnActiveFarmMission) {
        continue;
      }

      if (target.spyCombatIntelEnough || target.lastAttackTurn !== null) {
        farmEntry.farmIntelEnough = true;
        farmEntry.intelPhase = 'COMBAT_INTEL_READY';
      }

      if (!farmEntry.farmIntelEnough) {
        if (farmEntry.intelPhase === 'UNSCANNED') {
          const spyRequest = createTargetedSpyMissionRequest(
            context,
            target,
            collectClaimedSpyTargets(context.priorProposals ?? [])
          );
          if (spyRequest) {
            missionRequests.push(spyRequest);
            farmEntry.intelPhase = 'SPY_SENT';
            farmEntry.lastSpyTurn = context.snapshot.turn;
          }
          continue;
        }

        if (farmEntry.intelPhase === 'SPY_SENT') {
          farmEntry.intelPhase = 'PROBE_REQUIRED';
        }

        if (farmEntry.intelPhase === 'PROBE_REQUIRED') {
          const probePlan = createProbeMissionRequest(context, target);
          if (probePlan.request) {
            missionRequests.push(probePlan.request);
          }
          if (probePlan.shipNeed) {
            shipNeeds.push(probePlan.shipNeed);
          }
          continue;
        }
      }

      if (!farmEntry.farmIntelEnough) {
        continue;
      }

      if (!farmEntry.initialDefenseBroken) {
        const breakPlan = createBreakMissionRequest(context, target, farmEntry);
        if (breakPlan.requests.length > 0) {
          missionRequests.push(...breakPlan.requests);
        }
        if (breakPlan.preferredOriginCoordinates) {
          farmEntry.preferredOriginCoordinates = { ...breakPlan.preferredOriginCoordinates };
        }
        if (breakPlan.shipNeed) {
          shipNeeds.push(breakPlan.shipNeed);
          if (breakPlan.shipNeed.preferredOrigin) {
            farmEntry.preferredOriginCoordinates = { ...breakPlan.shipNeed.preferredOrigin };
          }
        }
        continue;
      }

      const plunderPlan = createPlunderMissionRequest(context, target, farmEntry);
      if (plunderPlan.request) {
        missionRequests.push(plunderPlan.request);
        farmEntry.preferredOriginCoordinates = { ...plunderPlan.request.originPlanet.coordinates };
      }
      if (plunderPlan.shipNeed) {
        shipNeeds.push(plunderPlan.shipNeed);
        if (plunderPlan.shipNeed.preferredOrigin) {
          farmEntry.preferredOriginCoordinates = { ...plunderPlan.shipNeed.preferredOrigin };
        }
      }
    }

    context.memory.strategicMilitary.farmLedger = [...farmLedger.values()]
      .sort(compareFarmLedgerEntries);

    const farmReservation = resolveFarmMissionReservation(context, neutralFarmTargets, farmLedger, missionCap);
    const selectedMissionRequests = selectMissionRequestsForCap(missionRequests, missionCap, farmReservation);
    const proposals = [
      ...selectedMissionRequests
        .map((request, index) => createMissionProposal(context, request, index)),
      ...selectTopShipNeedsPerPlanet(shipNeeds)
        .sort((left, right) => right.score - left.score || left.shipType.localeCompare(right.shipType))
        .slice(0, MAX_SHIP_NEED_PROPOSALS)
        .map((request, index) => createShipNeedProposal(context, request, index))
    ];

    return {
      subsystemId: this.subsystemId,
      proposals,
      debug: {
        targetCount: targets.length,
        neutralTargetCount: targets.filter((target) => target.isNeutral).length,
        unscannedTargetCount: targets.filter((target) => target.neverScanned).length,
        missionRequestCap: missionCap,
        missionRequestCount: missionRequests.length,
        selectedMissionRequestCount: selectedMissionRequests.length,
        actionableFarmCount: farmReservation.actionableFarmCount,
        reservedFarmOperationSlots: farmReservation.reservedOperationSlots,
        reservedFarmBreakSlots: farmReservation.availableBreakSlots,
        reservedFarmPlunderSlots: farmReservation.availablePlunderSlots,
        availableFarmIntelSlots: farmReservation.availableIntelSlots,
        shipNeedCount: shipNeeds.length,
        availabilityTarget: STRATEGIC_MILITARY_AVAILABILITY,
        // TODO: Critical should maintain a minimum stock of 5 Spy Probes on every planet.
        spyProbeStockOwnedByCritical: true
      }
    };
  }
}

function resolveNeutralFarmTargets(
  context: BotSubsystemContext,
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: FarmLedgerMap
): BotStrategicMilitaryTargetSnapshot[] {
  if (!context.snapshot.planets.some((planet) => isNeutralFarmUnlockPlanet(planet))) {
    return [];
  }

  const shortlist = filterToNearestFarmShortlist(context, targets.filter((target) => target.isNeutral && target.inOwnedSystem));

  return shortlist
    .sort((left, right) => {
      const leftEntry = resolveFarmLedgerEntry(farmLedger, left.coordinates);
      const rightEntry = resolveFarmLedgerEntry(farmLedger, right.coordinates);
      const leftDiscoveryTurn = leftEntry?.lastSpyTurn ?? left.reportTurn ?? Number.MAX_SAFE_INTEGER;
      const rightDiscoveryTurn = rightEntry?.lastSpyTurn ?? right.reportTurn ?? Number.MAX_SAFE_INTEGER;

      return Number(right.inHomeSystem) - Number(left.inHomeSystem)
        || leftDiscoveryTurn - rightDiscoveryTurn
        || left.coordinates.x - right.coordinates.x
        || left.coordinates.y - right.coordinates.y
        || left.coordinates.z - right.coordinates.z;
    });
}

function filterToNearestFarmShortlist(
  context: BotSubsystemContext,
  targets: BotStrategicMilitaryTargetSnapshot[]
): BotStrategicMilitaryTargetSnapshot[] {
  if (targets.length <= NEAREST_FARMS_PER_PLANET) {
    return targets;
  }

  const allowedKeys = new Set<string>();
  for (const planet of context.snapshot.planets) {
    const nearest = [...targets]
      .sort((left, right) =>
        calculateTravelDistance(planet.coordinates, left.coordinates) - calculateTravelDistance(planet.coordinates, right.coordinates)
        || Number(right.inHomeSystem) - Number(left.inHomeSystem)
        || left.coordinates.x - right.coordinates.x
        || left.coordinates.y - right.coordinates.y
        || left.coordinates.z - right.coordinates.z
      )
      .slice(0, NEAREST_FARMS_PER_PLANET);
    for (const target of nearest) {
      allowedKeys.add(toCoordinatesKey(target.coordinates));
    }
  }

  return targets.filter((target) => allowedKeys.has(toCoordinatesKey(target.coordinates)));
}

function isNeutralFarmUnlockPlanet(planet: BotPlanetSnapshot): boolean {
  return planet.defense.avgIndustryLevel > NEUTRAL_FARM_UNLOCK_AVG_INDUSTRY_THRESHOLD;
}

function isNeutralFarmProductionPlanet(planet: BotPlanetSnapshot): boolean {
  return planet.defense.avgIndustryLevel > NEUTRAL_FARM_PRODUCTION_AVG_INDUSTRY_THRESHOLD;
}

function createTargetedSpyMissionRequest(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  claimedTargets: Set<string>
): MissionRequest | null {
  if (claimedTargets.has(toCoordinatesKey(target.coordinates))) {
    return null;
  }

  const request = selectSpyOrigin(context, target);
  if (!request) {
    return null;
  }

  return {
    kind: 'MISSION',
    phase: 'INTEL',
    missionType: FleetMissionType.SPY,
    target,
    destinationCoordinates: { ...target.coordinates },
    originPlanet: request.originPlanet,
    ships: [{
      type: ShipType.SPY_PROBE,
      undamagedAmount: 1,
      damagedAmount: 0
    }],
    expectedLoot: 0,
    travelDistance: request.travelDistance,
    travelTurns: request.travelTurns,
    score: Math.max(1, 220 - (request.travelTurns * 4) + (target.inHomeSystem ? 40 : 0)),
    stagingPlanet: null,
    moveRole: null
  };
}

function createProbeMissionRequest(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot
): {
  request: MissionRequest | null;
  shipNeed: ShipNeedRequest | null;
} {
  const validPlans = context.snapshot.planets
    .map((originPlanet): MissionRequest | null => {
      const probeShipType = resolveBestAvailableProbeShipType(originPlanet);
      if (!probeShipType) {
        return null;
      }

      const distance = calculateTravelDistance(originPlanet.coordinates, target.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, distance);
      const fuelCost = calculateFuelCost([{ type: probeShipType, amount: 1 }], distance);
      if (originPlanet.localResources.deuterium < fuelCost) {
        return null;
      }

      return {
        kind: 'MISSION' as const,
        phase: 'INTEL' as const,
        missionType: FleetMissionType.ATTACK,
        target,
        destinationCoordinates: { ...target.coordinates },
        originPlanet,
        ships: [{
          type: probeShipType,
          undamagedAmount: 1,
          damagedAmount: 0
        }],
        expectedLoot: 0,
        travelDistance: distance,
        travelTurns,
        score: Math.max(1, 210 - (travelTurns * 5) + (probeShipType === ShipType.CRUISER ? 30 : 0)),
        stagingPlanet: null,
        moveRole: null
      };
    })
    .filter((entry): entry is MissionRequest => entry !== null)
    .sort(compareMissionRequests);

  const request = validPlans[0] ?? null;
  if (request) {
    return { request, shipNeed: null };
  }

  return {
    request: null,
    shipNeed: createFarmCombatShipNeed(
      context,
      target,
      resolvePreferredFarmOrigin(context, target),
      'Need one jump-capable ship to probe neutral farm defenses.'
    )
  };
}

function createSpyMissionRequests(
  context: BotSubsystemContext,
  targets: BotStrategicMilitaryTargetSnapshot[]
): MissionRequest[] {
  const claimedTargets = collectClaimedSpyTargets(context.priorProposals ?? []);
  const unscannedTargets = targets.filter((target) => target.neverScanned);
  const scanPool = unscannedTargets.length > 0
    ? unscannedTargets
    : [...targets].sort((left, right) =>
      (right.reportAge ?? -1) - (left.reportAge ?? -1)
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.y - right.coordinates.y
      || left.coordinates.z - right.coordinates.z
    );
  const phase = unscannedTargets.length > 0 ? 'INTEL' as const : 'INTEL' as const;

  const requests: MissionRequest[] = [];

  for (const target of scanPool) {
    if (claimedTargets.has(toCoordinatesKey(target.coordinates))) {
      continue;
    }

    const request = selectSpyOrigin(context, target);
    if (!request) {
      continue;
    }

    const priorityBase = target.neverScanned ? 260 : 80;
    requests.push({
      kind: 'MISSION',
      phase,
      missionType: FleetMissionType.SPY,
      target,
      destinationCoordinates: { ...target.coordinates },
      originPlanet: request.originPlanet,
      ships: [{
        type: ShipType.SPY_PROBE,
        undamagedAmount: 1,
        damagedAmount: 0
      }],
      expectedLoot: 0,
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns,
      score: priorityBase - request.travelTurns,
      stagingPlanet: null,
      moveRole: null
    });
  }

  return requests;
}

function collectClaimedSpyTargets(priorProposals: BotProposal[]): Set<string> {
  const claimedTargets = new Set<string>();

  for (const proposal of priorProposals) {
    if (
      proposal.kind !== 'FLEET_MISSION'
      || proposal.requestPayload.missionType !== FleetMissionType.SPY
      || !proposal.targetCoordinates
    ) {
      continue;
    }

    claimedTargets.add(toCoordinatesKey(proposal.targetCoordinates));
  }

  return claimedTargets;
}

function createBreakMissionRequest(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry
): {
  requests: MissionRequest[];
  shipNeed: ShipNeedRequest | null;
  preferredOriginCoordinates: { x: number; y: number; z: number } | null;
} {
  const targetStrength = estimateTargetCombatStrength(farmEntry);
  const requiredStrength = resolveRequiredBreakStrength(farmEntry, targetStrength);
  const hasKnownDefenders = (target.currentShipsCount ?? 0) > 0 || (target.currentDefencesCount ?? 0) > 0;
  const validPlans: MissionRequest[] = [];
  let bestAvailableStrength = 0;
  let closestOrigin: BotPlanetSnapshot | null = null;
  let hasBombardmentPresence = false;

  for (const originPlanet of context.snapshot.planets) {
    const distance = calculateTravelDistance(originPlanet.coordinates, target.coordinates);
    const travelTurns = resolveTravelTurns(originPlanet, distance);
    const selection = buildBreakSelection(originPlanet, requiredStrength, (target.currentDefencesCount ?? 0) > 0, hasKnownDefenders);
    if (selection.combatStrength > bestAvailableStrength) {
      bestAvailableStrength = selection.combatStrength;
      closestOrigin = originPlanet;
    }
    if (selection.ships.some((ship) => shipTypeHasBombardmentWeapons(ship.type))) {
      hasBombardmentPresence = true;
    }
    if (selection.ships.length <= 0 || selection.combatStrength < requiredStrength) {
      continue;
    }

    const fuelCost = calculateFuelCost(
      selection.ships.map((ship) => ({
        type: ship.type,
        amount: ship.undamagedAmount + ship.damagedAmount
      })),
      distance
    );
    if (originPlanet.localResources.deuterium < fuelCost) {
      continue;
    }

    validPlans.push({
      kind: 'MISSION',
      phase: 'BREAK',
      missionType: FleetMissionType.ATTACK,
      target,
      destinationCoordinates: { ...target.coordinates },
      originPlanet,
      ships: selection.ships,
      expectedLoot: 0,
      travelDistance: distance,
      travelTurns,
      score: Math.max(
        1,
        600
        + Math.round((targetStrength * 2) - (travelTurns * 8) - Math.max(0, selection.combatStrength - requiredStrength))
        - resolveBreakRetryScorePenalty(farmEntry, context.snapshot.turn)
        + resolvePostEarlyNeutralAttackScoreBonus(originPlanet)
      ),
      stagingPlanet: null,
      moveRole: null
    });
  }

  const isBreakRetryCoolingDown = (
    farmEntry.nextBreakAllowedTurn !== null
    && context.snapshot.turn < farmEntry.nextBreakAllowedTurn
  );
  const request = validPlans.sort(compareMissionRequests)[0] ?? null;
  if (request && !isBreakRetryCoolingDown) {
    return {
      requests: [request],
      shipNeed: null,
      preferredOriginCoordinates: { ...request.originPlanet.coordinates }
    };
  }

  const relocationPlan = isBreakRetryCoolingDown
    ? null
    : createBreakRelocationPlan(
      context,
      target,
      requiredStrength,
      (target.currentDefencesCount ?? 0) > 0,
      hasKnownDefenders
    );
  if (relocationPlan && !isBreakRetryCoolingDown) {
    return {
      requests: relocationPlan.requests,
      shipNeed: null,
      preferredOriginCoordinates: { ...relocationPlan.stagingPlanet.coordinates }
    };
  }

  return {
    requests: [],
    shipNeed: createBreakShipNeed(
      context,
      target,
      requiredStrength,
      Math.max(bestAvailableStrength, relocationPlan?.combinedStrength ?? 0),
      hasBombardmentPresence || Boolean(relocationPlan?.hasBombardmentPresence),
      closestOrigin
    ),
    preferredOriginCoordinates: closestOrigin ? { ...closestOrigin.coordinates } : null
  };
}

function createPlunderMissionRequest(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry
): {
  request: MissionRequest | null;
  shipNeed: ShipNeedRequest | null;
} {
  const validPlans: MissionRequest[] = [];
  let bestCargoCapacity = 0;
  let bestEscortCount = 0;
  let closestOrigin: BotPlanetSnapshot | null = null;

  for (const originPlanet of context.snapshot.planets) {
    const distance = calculateTravelDistance(originPlanet.coordinates, target.coordinates);
    const travelTurns = resolveTravelTurns(originPlanet, distance);
    const selection = buildPlunderSelection(originPlanet, farmEntry, context.snapshot.turn, travelTurns);
    if (selection.cargoCapacity > bestCargoCapacity) {
      bestCargoCapacity = selection.cargoCapacity;
      closestOrigin = originPlanet;
    }
    bestEscortCount = Math.max(bestEscortCount, selection.combatEscortCount);
    if (selection.ships.length <= 0 || selection.cargoCapacity <= 0 || selection.combatEscortCount <= 0) {
      continue;
    }

    const fuelCost = calculateFuelCost(
      selection.ships.map((ship) => ({
        type: ship.type,
        amount: ship.undamagedAmount + ship.damagedAmount
      })),
      distance
    );
    if (originPlanet.localResources.deuterium < fuelCost) {
      continue;
    }

    const estimatedLoot = resolveLootAtArrival(farmEntry, context.snapshot.turn, travelTurns);
    validPlans.push({
      kind: 'MISSION',
      phase: 'PLUNDER',
      missionType: FleetMissionType.ATTACK,
      target,
      destinationCoordinates: { ...target.coordinates },
      originPlanet,
      ships: selection.ships,
      expectedLoot: estimatedLoot,
      travelDistance: distance,
      travelTurns,
      score: Math.max(
        1,
        Math.round((estimatedLoot - (travelTurns * 6)) * resolvePostEarlyPlunderScoreMultiplier(originPlanet))
        + resolveOpenedFarmReuseScoreBonus(farmEntry, context.snapshot.turn)
      ),
      stagingPlanet: null,
      moveRole: null
    });
  }

  const request = validPlans.sort(compareMissionRequests)[0] ?? null;
  farmEntry.estimatedNextGoodAttackTurn = resolveEstimatedNextGoodAttackTurn(
    farmEntry,
    context.snapshot.turn,
    Math.max(1, bestCargoCapacity)
  );
  if (request) {
    return { request, shipNeed: null };
  }

  return {
    request: null,
    shipNeed: createPlunderShipNeed(context, target, farmEntry, bestCargoCapacity, bestEscortCount, closestOrigin)
  };
}

function selectSpyOrigin(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot
): {
  originPlanet: BotPlanetSnapshot;
  travelDistance: number;
  travelTurns: number;
} | null {
  const candidates = context.snapshot.planets
    .filter((planet) => (planet.ships.undamagedCountByType[ShipType.SPY_PROBE] ?? 0) > 0)
    .map((originPlanet) => {
      const travelDistance = calculateTravelDistance(originPlanet.coordinates, target.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, travelDistance);
      const fuelCost = calculateFuelCost([{ type: ShipType.SPY_PROBE, amount: 1 }], travelDistance);
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
      || left.originPlanet.coordinates.x - right.originPlanet.coordinates.x
      || left.originPlanet.coordinates.y - right.originPlanet.coordinates.y
      || left.originPlanet.coordinates.z - right.originPlanet.coordinates.z
    );

  return candidates[0] ?? null;
}

function buildBreakSelection(
  originPlanet: BotPlanetSnapshot,
  requiredStrength: number,
  requireBombardmentBreaker: boolean,
  requireMultiWarshipBreak: boolean
): BreakSelection {
  const combatCandidates = resolveOriginCombatCandidates(originPlanet);
  const selection: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }> = [];
  let totalStrength = 0;

  if (requireBombardmentBreaker) {
    const bombardmentShip = combatCandidates.find((candidate) => candidate.hasBombardmentWeapons) ?? null;
    if (!bombardmentShip) {
      return { ships: [], combatStrength: 0 };
    }

    selection.push({
      type: bombardmentShip.type,
      undamagedAmount: 1,
      damagedAmount: 0
    });
    totalStrength += bombardmentShip.power;
    bombardmentShip.amount -= 1;
  }

  for (const candidate of combatCandidates) {
    if (candidate.amount <= 0 || candidate.power <= 0) {
      continue;
    }
    if (totalStrength >= requiredStrength) {
      break;
    }

    const amountToSend = Math.min(
      candidate.amount,
      Math.max(1, Math.ceil((requiredStrength - totalStrength) / candidate.power))
    );
    selection.push({
      type: candidate.type,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    totalStrength += candidate.power * amountToSend;
  }

  const selectedWarshipCount = selection.reduce(
    (sum, ship) => sum + ship.undamagedAmount + ship.damagedAmount,
    0
  );
  const hasSingleHeavyBreakShip = selection.length === 1
    && selectedWarshipCount === 1
    && isHeavyNeutralBreakWarshipType(selection[0]?.type ?? null);
  if (requireMultiWarshipBreak && selectedWarshipCount < MIN_DEFENDED_BREAK_WARSHIPS && !hasSingleHeavyBreakShip) {
    return { ships: [], combatStrength: totalStrength };
  }

  return totalStrength >= requiredStrength
    ? { ships: selection, combatStrength: totalStrength }
    : { ships: [], combatStrength: totalStrength };
}

function createBreakRelocationPlan(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  requiredStrength: number,
  requireBombardmentBreaker: boolean,
  requireMultiWarshipBreak: boolean
): RelocationBreakPlan | null {
  const stagePlans = context.snapshot.planets
    .map((stagingPlanet) => buildBreakRelocationPlanForStage(
      context,
      target,
      stagingPlanet,
      requiredStrength,
      requireBombardmentBreaker,
      requireMultiWarshipBreak
    ))
    .filter((plan): plan is RelocationBreakPlan => plan !== null)
    .sort((left, right) =>
      left.totalEtaScore - right.totalEtaScore
      || left.requests.length - right.requests.length
      || left.stagingPlanet.coordinates.x - right.stagingPlanet.coordinates.x
      || left.stagingPlanet.coordinates.y - right.stagingPlanet.coordinates.y
      || left.stagingPlanet.coordinates.z - right.stagingPlanet.coordinates.z
    );

  return stagePlans[0] ?? null;
}

function buildBreakRelocationPlanForStage(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  stagingPlanet: BotPlanetSnapshot,
  requiredStrength: number,
  requireBombardmentBreaker: boolean,
  requireMultiWarshipBreak: boolean
): RelocationBreakPlan | null {
  const originCandidates = context.snapshot.planets
    .map((originPlanet) => {
      const distanceToStage = calculateTravelDistance(originPlanet.coordinates, stagingPlanet.coordinates);
      const travelTurnsToStage = resolveTravelTurns(originPlanet, distanceToStage);
      return {
        originPlanet,
        distanceToStage,
        travelTurnsToStage,
        combatCandidates: resolveOriginCombatCandidates(originPlanet).map((candidate) => ({ ...candidate }))
      };
    })
    .filter((candidate) => candidate.combatCandidates.length > 0)
    .sort((left, right) =>
      left.travelTurnsToStage - right.travelTurnsToStage
      || left.distanceToStage - right.distanceToStage
      || left.originPlanet.coordinates.x - right.originPlanet.coordinates.x
      || left.originPlanet.coordinates.y - right.originPlanet.coordinates.y
      || left.originPlanet.coordinates.z - right.originPlanet.coordinates.z
    );

  if (originCandidates.length <= 1) {
    return null;
  }

  const selections = new Map<string, Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>>();
  let combinedStrength = 0;
  let hasBombardmentPresence = originCandidates.some((origin) =>
    origin.combatCandidates.some((candidate) => candidate.hasBombardmentWeapons)
  );

  if (requireBombardmentBreaker) {
    let selectedBombardment = false;
    for (const origin of originCandidates) {
      const bombardmentCandidate = origin.combatCandidates.find((candidate) =>
        candidate.amount > 0 && candidate.hasBombardmentWeapons
      );
      if (!bombardmentCandidate) {
        continue;
      }

      const added = tryAddShipsToSelection(
        selections,
        origin.originPlanet,
        bombardmentCandidate.type,
        1,
        origin.distanceToStage
      );
      if (added <= 0) {
        continue;
      }

      combinedStrength += estimateShipCombatPower(bombardmentCandidate.type) * added;
      bombardmentCandidate.amount -= added;
      selectedBombardment = true;
      break;
    }

    if (!selectedBombardment) {
      return null;
    }
  }

  for (const origin of originCandidates) {
    if (combinedStrength >= requiredStrength) {
      break;
    }

    for (const candidate of origin.combatCandidates) {
      if (candidate.amount <= 0 || candidate.power <= 0) {
        continue;
      }
      if (combinedStrength >= requiredStrength) {
        break;
      }

      const neededAmount = Math.min(
        candidate.amount,
        Math.max(1, Math.ceil((requiredStrength - combinedStrength) / candidate.power))
      );
      const added = tryAddShipsToSelection(
        selections,
        origin.originPlanet,
        candidate.type,
        neededAmount,
        origin.distanceToStage
      );
      if (added <= 0) {
        continue;
      }

      combinedStrength += candidate.power * added;
      candidate.amount -= added;
    }
  }

  if (combinedStrength < requiredStrength) {
    return null;
  }

  const selectedWarshipCount = [...selections.values()]
    .flat()
    .reduce((sum, ship) => sum + ship.undamagedAmount + ship.damagedAmount, 0);
  const hasSingleHeavyBreakShip = [...selections.values()]
    .flat()
    .length === 1
    && selectedWarshipCount === 1
    && isHeavyNeutralBreakWarshipType([...selections.values()].flat()[0]?.type ?? null);
  if (requireMultiWarshipBreak && selectedWarshipCount < MIN_DEFENDED_BREAK_WARSHIPS && !hasSingleHeavyBreakShip) {
    return null;
  }

  const requests: MissionRequest[] = [];
  let totalMoveTurns = 0;
  const attackDistance = calculateTravelDistance(stagingPlanet.coordinates, target.coordinates);
  const attackTurns = resolveTravelTurns(stagingPlanet, attackDistance);

  for (const origin of originCandidates) {
    const key = toCoordinatesKey(origin.originPlanet.coordinates);
    const selectedShips = selections.get(key);
    if (!selectedShips || selectedShips.length <= 0) {
      continue;
    }
    if (origin.originPlanet.coordinates.x === stagingPlanet.coordinates.x
      && origin.originPlanet.coordinates.y === stagingPlanet.coordinates.y
      && origin.originPlanet.coordinates.z === stagingPlanet.coordinates.z) {
      continue;
    }

    totalMoveTurns += origin.travelTurnsToStage;
    requests.push({
      kind: 'MISSION',
      phase: 'BREAK',
      missionType: FleetMissionType.MOVE,
      target,
      destinationCoordinates: { ...stagingPlanet.coordinates },
      originPlanet: origin.originPlanet,
      ships: selectedShips.map((ship) => ({ ...ship })),
      expectedLoot: 0,
      travelDistance: origin.distanceToStage,
      travelTurns: origin.travelTurnsToStage,
      score: Math.max(1, 560 - (origin.travelTurnsToStage * 6) - (attackTurns * 4)),
      stagingPlanet,
      moveRole: 'RELOCATION'
    });
  }

  if (requests.length <= 0) {
    return null;
  }

  return {
    requests,
    stagingPlanet,
    combinedStrength,
    totalEtaScore: totalMoveTurns + attackTurns,
    hasBombardmentPresence
  };
}

function buildPlunderSelection(
  originPlanet: BotPlanetSnapshot,
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  currentTurn: number,
  travelTurns: number
): PlunderSelection {
  const escortShipType = resolveBestAvailableProbeShipType(originPlanet);
  if (!escortShipType) {
    return { ships: [], cargoCapacity: 0, combatEscortCount: 0 };
  }

  const desiredTransporters = Math.max(MIN_FARM_TRANSPORTER_COUNT, farmEntry.preferredPlunderTransporterCount);
  const desiredCargoCapacity = desiredTransporters * (SHIP_BLUEPRINTS.get(ShipType.TRANSPORTER)?.cargoCapacity ?? 0);
  const cargoSelection = buildPlunderCargoSelection(originPlanet, desiredCargoCapacity);
  if (cargoSelection.ships.length <= 0 || cargoSelection.cargoCapacity <= 0) {
    return { ships: [], cargoCapacity: 0, combatEscortCount: 1 };
  }

  const selection: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }> = [];
  selection.push({
    type: escortShipType,
    undamagedAmount: 1,
    damagedAmount: 0
  });
  selection.push(...cargoSelection.ships);

  const combatEscortCount = 1;

  return {
    ships: selection,
    cargoCapacity: cargoSelection.cargoCapacity,
    combatEscortCount
  };
}

function buildPlunderCargoSelection(
  originPlanet: BotPlanetSnapshot,
  desiredCargoCapacity: number
): {
  ships: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>;
  cargoCapacity: number;
} {
  const cargoCandidates = [
    ShipType.MASS_HAULER,
    ShipType.CARGO_SUPPORT,
    ShipType.TRANSPORTER
  ].map((shipType) => ({
    shipType,
    amount: originPlanet.ships.undamagedCountByType[shipType] ?? 0,
    cargoCapacity: SHIP_BLUEPRINTS.get(shipType)?.cargoCapacity ?? 0
  }))
    .filter((candidate) => candidate.amount > 0 && candidate.cargoCapacity > 0)
    .sort((left, right) =>
      right.cargoCapacity - left.cargoCapacity
      || left.shipType.localeCompare(right.shipType)
    );

  if (cargoCandidates.length <= 0) {
    return { ships: [], cargoCapacity: 0 };
  }

  const ships: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }> = [];
  let cargoCapacity = 0;
  let remainingCargoNeed = Math.max(1, desiredCargoCapacity);

  for (const candidate of cargoCandidates) {
    if (remainingCargoNeed <= 0) {
      break;
    }
    const amountToSend = Math.min(candidate.amount, Math.max(1, Math.ceil(remainingCargoNeed / candidate.cargoCapacity)));
    if (amountToSend <= 0) {
      continue;
    }
    ships.push({
      type: candidate.shipType,
      undamagedAmount: amountToSend,
      damagedAmount: 0
    });
    cargoCapacity += amountToSend * candidate.cargoCapacity;
    remainingCargoNeed = Math.max(0, remainingCargoNeed - (amountToSend * candidate.cargoCapacity));
  }

  if (ships.length <= 0) {
    return { ships: [], cargoCapacity: 0 };
  }

  return { ships, cargoCapacity };
}

function resolveOriginCombatCandidates(originPlanet: BotPlanetSnapshot): Array<{
  type: ShipTypeT;
  amount: number;
  power: number;
  hasBombardmentWeapons: boolean;
}> {
  return Object.entries(originPlanet.ships.undamagedCountByType)
    .map(([type, amount]) => ({
      type: type as ShipTypeT,
      amount: amount ?? 0,
      blueprint: SHIP_BLUEPRINTS.get(type as ShipTypeT) ?? null
    }))
    .filter((entry) =>
      entry.amount > 0
      && entry.blueprint !== null
      && entry.blueprint.canJump
      && entry.blueprint.weapons.length > 0
      && isNeutralFarmWarshipType(entry.type)
    )
    .map((entry) => ({
      type: entry.type,
      amount: entry.amount,
      power: estimateShipCombatPower(entry.type),
      hasBombardmentWeapons: shipTypeHasBombardmentWeapons(entry.type)
    }))
    .sort((left, right) =>
      Number(right.type === ShipType.CRUISER) - Number(left.type === ShipType.CRUISER)
      || Number(right.hasBombardmentWeapons) - Number(left.hasBombardmentWeapons)
      || right.power - left.power
      || left.type.localeCompare(right.type)
    );
}

function isNeutralFarmWarshipType(shipType: ShipTypeT): boolean {
  return shipType !== ShipType.SPY_PROBE
    && shipType !== ShipType.REPAIR_DRONE
    && shipType !== ShipType.COLONIZER
    && shipType !== ShipType.TRANSPORTER
    && shipType !== ShipType.CARGO_SUPPORT
    && shipType !== ShipType.MASS_HAULER
    && shipType !== ShipType.RECYCLER;
}

function isHeavyNeutralBreakWarshipType(shipType: ShipTypeT | null): boolean {
  return shipType === ShipType.FRIGATE
    || shipType === ShipType.BATTLE_SHIP
    || shipType === ShipType.BATTLE_CRUISER
    || shipType === ShipType.DESTROYER
    || shipType === ShipType.DREADNOUGHT
    || shipType === ShipType.ORBITAL_BOMBER
    || shipType === ShipType.CARRIER
    || shipType === ShipType.TITAN
    || shipType === ShipType.ARMAGEDDON_BOMBER
    || shipType === ShipType.BEHEMOTH
    || shipType === ShipType.FLEET_CARRIER
    || shipType === ShipType.MOTHER_SHIP;
}

function createBreakShipNeed(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  requiredStrength: number,
  bestAvailableStrength: number,
  hasBombardmentPresence: boolean,
  closestOrigin: BotPlanetSnapshot | null
): ShipNeedRequest | null {
  if (!context.snapshot.planets.some((planet) => isNeutralFarmProductionPlanet(planet))) {
    return null;
  }

  if ((target.currentDefencesCount ?? 0) > 0 && !hasBombardmentPresence) {
    const bombardmentType = resolveBestProducibleShipType(context, 'BOMBARDMENT');
    if (!bombardmentType) {
      return null;
    }
    return {
      kind: 'SHIP_NEED',
      shipType: bombardmentType,
      amount: 1,
      shortageKind: 'BOMBARDMENT',
      targetCoordinates: { ...target.coordinates },
      preferredOrigin: closestOrigin ? { ...closestOrigin.coordinates } : null,
      score: 500 + requiredStrength + resolvePostEarlyNeutralShipNeedScoreBonus(closestOrigin),
      reason: 'Need a bombardment-capable ship to break neutral defenses.'
    };
  }

  const combatNeed = createFarmCombatShipNeed(
    context,
    target,
    closestOrigin,
    'Need more jump-capable combat ships to clear neutral defenders.'
  );
  if (!combatNeed) {
    return null;
  }

  const combatPower = Math.max(1, estimateShipCombatPower(combatNeed.shipType));
  combatNeed.amount = Math.max(1, Math.ceil(Math.max(0, requiredStrength - bestAvailableStrength) / combatPower));
  combatNeed.score = 620 + requiredStrength + resolvePostEarlyNeutralShipNeedScoreBonus(closestOrigin);
  return combatNeed;
}

function createPlunderShipNeed(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  bestCargoCapacity: number,
  bestEscortCount: number,
  closestOrigin: BotPlanetSnapshot | null
): ShipNeedRequest | null {
  const maxFullLoot = resolveMaxFullLoot(farmEntry);
  if (maxFullLoot <= 0) {
    return null;
  }

  if (bestEscortCount < MIN_PLUNDER_ESCORTS) {
    const combatNeed = createFarmCombatShipNeed(
      context,
      target,
      closestOrigin,
      'Need one jump-capable escort ship for repeatable neutral-farm plunder.'
    );
    if (!combatNeed) {
      return null;
    }
    combatNeed.amount = DEFAULT_ESCORT_SHIP_NEED;
    combatNeed.score = 420 + maxFullLoot + resolvePostEarlyNeutralShipNeedScoreBonus(closestOrigin);
    return combatNeed;
  }

  if (!context.snapshot.planets.some((planet) => isNeutralFarmProductionPlanet(planet))) {
    return null;
  }
  const cargoType = ShipType.TRANSPORTER;
  const cargoCapacity = SHIP_BLUEPRINTS.get(cargoType)?.cargoCapacity ?? 0;
  if (cargoCapacity <= 0 || bestCargoCapacity >= maxFullLoot) {
    return null;
  }

  return {
    kind: 'SHIP_NEED',
    shipType: cargoType,
    amount: Math.max(1, Math.ceil((maxFullLoot - bestCargoCapacity) / cargoCapacity)),
    shortageKind: 'CARGO',
    targetCoordinates: { ...target.coordinates },
    preferredOrigin: closestOrigin ? { ...closestOrigin.coordinates } : null,
    score: 520 + maxFullLoot + resolveOpenedFarmReuseScoreBonus(farmEntry, context.snapshot.turn)
      + resolvePostEarlyNeutralShipNeedScoreBonus(closestOrigin),
    reason: 'Need more cargo capacity to plunder opened neutral farms efficiently.'
  };
}

function resolveBestProducibleShipType(
  context: BotSubsystemContext,
  role: 'BOMBARDMENT' | 'COMBAT' | 'CARGO'
): ShipTypeT | null {
  const candidates = new Map<ShipTypeT, number>();

  for (const planet of context.snapshot.planets) {
    for (const [shipType, blueprint] of SHIP_BLUEPRINTS.shipsMap.entries()) {
      if (!snapshotHasShipBuildingRequirements(planet, blueprint) || !snapshotHasShipTechnologyRequirements(planet, blueprint)) {
        continue;
      }

      if (!isShipTypeEligibleForRole(shipType, role)) {
        continue;
      }

      const score = role === 'CARGO'
        ? blueprint.cargoCapacity
        : (shipType === ShipType.CRUISER ? 10_000 : 0) + estimateShipCombatPower(shipType);
      const previous = candidates.get(shipType) ?? -1;
      if (score > previous) {
        candidates.set(shipType, score);
      }
    }
  }

  return [...candidates.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
}

function isShipTypeEligibleForRole(
  shipType: ShipTypeT,
  role: 'BOMBARDMENT' | 'COMBAT' | 'CARGO'
): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return false;
  }

  if (role === 'BOMBARDMENT') {
    return blueprint.canJump && shipTypeHasBombardmentWeapons(shipType);
  }
  if (role === 'COMBAT') {
    return blueprint.canJump
      && blueprint.weapons.length > 0
      && isNeutralFarmWarshipType(shipType);
  }
  return shipType === ShipType.TRANSPORTER;
}

function resolveBestAvailableProbeShipType(originPlanet: BotPlanetSnapshot): ShipTypeT | null {
  const availableTypes = new Set(
    resolveOriginCombatCandidates(originPlanet)
      .filter((candidate) => candidate.amount > 0)
      .map((candidate) => candidate.type)
  );
  const preferredProbeTypes: ShipTypeT[] = [
    ShipType.CRUISER,
    ShipType.FRIGATE,
    ShipType.BATTLE_SHIP
  ];
  for (const shipType of preferredProbeTypes) {
    if (availableTypes.has(shipType)) {
      return shipType;
    }
  }

  return resolveOriginCombatCandidates(originPlanet)
    .find((candidate) => candidate.amount > 0)?.type ?? null;
}

function resolvePreferredFarmOrigin(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot
): BotPlanetSnapshot | null {
  return [...context.snapshot.planets]
    .sort((left, right) =>
      calculateTravelDistance(left.coordinates, target.coordinates) - calculateTravelDistance(right.coordinates, target.coordinates)
      || left.coordinates.x - right.coordinates.x
      || left.coordinates.y - right.coordinates.y
      || left.coordinates.z - right.coordinates.z
    )[0] ?? null;
}

function createFarmCombatShipNeed(
  context: BotSubsystemContext,
  target: BotStrategicMilitaryTargetSnapshot,
  closestOrigin: BotPlanetSnapshot | null,
  reason: string
): ShipNeedRequest | null {
  if (!context.snapshot.planets.some((planet) => isNeutralFarmProductionPlanet(planet))) {
    return null;
  }

  const combatType = resolveBestProducibleShipType(context, 'COMBAT');
  if (!combatType) {
    return null;
  }

  return {
    kind: 'SHIP_NEED',
    shipType: combatType,
    amount: 1,
    shortageKind: 'COMBAT',
    targetCoordinates: { ...target.coordinates },
    preferredOrigin: closestOrigin ? { ...closestOrigin.coordinates } : null,
    score: 240 + resolvePostEarlyNeutralShipNeedScoreBonus(closestOrigin),
    reason
  };
}

function resolvePlunderTransporterAdjustment(
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  stolenResources: ResourceAmounts
): number {
  const transporterCapacity = SHIP_BLUEPRINTS.get(ShipType.TRANSPORTER)?.cargoCapacity ?? 0;
  if (transporterCapacity <= 0) {
    return farmEntry.preferredPlunderTransporterCount;
  }

  const stolenTotal = stolenResources.metal + stolenResources.crystal + stolenResources.deuterium;
  const preferredCargoCapacity = Math.max(1, farmEntry.preferredPlunderTransporterCount) * transporterCapacity;
  if (stolenTotal >= preferredCargoCapacity * 0.8) {
    return Math.min(MAX_FARM_TRANSPORTER_COUNT, farmEntry.preferredPlunderTransporterCount + 1);
  }
  return farmEntry.preferredPlunderTransporterCount;
}

function resolveRequiredBreakStrength(
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  targetStrength: number
): number {
  const baseline = Math.max(1, Math.ceil(targetStrength * BREAK_FORCE_MULTIPLIER));
  if (!farmEntry.lastBreakAttemptCombatStrength || !farmEntry.lastBreakFailureLossBracket) {
    return baseline;
  }

  const retryStrength = Math.ceil(
    farmEntry.lastBreakAttemptCombatStrength
    * resolveBreakRetryMultiplier(farmEntry.lastBreakFailureLossBracket)
  );
  return Math.max(baseline, retryStrength);
}

function resolveOpenedFarmReuseScoreBonus(
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  currentTurn: number
): number {
  if (farmEntry.lastSuccessfulPlunderTurn === null) {
    return 0;
  }

  const recencyBonus = Math.max(0, OPENED_FARM_RECENT_PLUNDER_MAX_BONUS - ((currentTurn - farmEntry.lastSuccessfulPlunderTurn) * 4));
  const cargoBonus = Math.max(0, farmEntry.preferredPlunderTransporterCount - MIN_FARM_TRANSPORTER_COUNT)
    * OPENED_FARM_EXTRA_CARGO_SCORE_BONUS;
  return OPENED_FARM_REPEAT_BASE_SCORE_BONUS + recencyBonus + cargoBonus;
}

function resolveBreakRetryMultiplier(lossBracket: NonNullable<BotMemoryV2StrategicMilitaryFarmLedgerEntry['lastBreakFailureLossBracket']>): number {
  switch (lossBracket) {
    case 'DEFEAT':
      return BREAK_RETRY_MULTIPLIER_DEFEAT;
    case 'MEDIUM':
    case 'HEAVY':
      return BREAK_RETRY_MULTIPLIER_MEDIUM;
    case 'LIGHT':
      return BREAK_RETRY_MULTIPLIER_LIGHT;
    default:
      return 1;
  }
}

function resolveBreakRetryScorePenalty(
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  currentTurn: number
): number {
  if (farmEntry.nextBreakAllowedTurn === null || currentTurn >= farmEntry.nextBreakAllowedTurn) {
    return 0;
  }
  return 220;
}

function estimateTargetCombatStrength(farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry): number {
  let total = 0;

  for (const [shipType, amount] of Object.entries(farmEntry.knownShipCountsByType)) {
    total += estimateShipCombatPower(shipType as ShipTypeT) * (amount ?? 0);
  }
  for (const [defenceType, amount] of Object.entries(farmEntry.knownDefenceCountsByType)) {
    total += estimateDefenceCombatPower(defenceType as DefenceTypeT) * (amount ?? 0);
  }

  if (total <= 0) {
    total += sumRecordCounts(farmEntry.knownShipCountsByType) * 6;
    total += sumRecordCounts(farmEntry.knownDefenceCountsByType) * 5;
  }

  return total;
}

function estimateShipCombatPower(shipType: ShipTypeT): number {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function estimateDefenceCombatPower(defenceType: DefenceTypeT): number {
  const blueprint = DEFENCE_BLUEPRINTS.get(defenceType);
  if (!blueprint) {
    return 0;
  }

  const weaponPower = blueprint.weapons.reduce((sum, weapon) => sum + (weapon.dmg * weapon.shots), 0);
  return weaponPower + (blueprint.hullPointsCapacity / 15) + (blueprint.shieldCapacity / 10);
}

function shipTypeHasBombardmentWeapons(shipType: ShipTypeT): boolean {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  return Boolean(blueprint?.weapons.some((weapon) => weapon.type === WeaponType.BOMBARDMENT_WEAPONS));
}

function resolveLootAtArrival(
  farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  currentTurn: number,
  travelTurns: number
): number {
  if (!hasFarmResourceModel(farmEntry)) {
    return resolveFallbackPlunderLootExpectation(farmEntry);
  }

  const estimatedResources = estimateFarmResourcesAtTurn(
    farmEntry,
    currentTurn + Math.max(0, travelTurns)
  );
  const plunderPercent = Math.max(0, 80 - farmEntry.knownBunkerReductionPercent) / 100;

  return Math.floor(
    (estimatedResources.metal * plunderPercent)
    + (estimatedResources.crystal * plunderPercent)
    + (estimatedResources.deuterium * plunderPercent)
  );
}

function resolveMaxFullLoot(farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry): number {
  if (!hasFarmResourceModel(farmEntry)) {
    return resolveFallbackPlunderLootExpectation(farmEntry);
  }

  const plunderPercent = Math.max(0, 80 - farmEntry.knownBunkerReductionPercent) / 100;
  return Math.floor(
    ((farmEntry.knownStorageCapacity.metal + farmEntry.knownStorageCapacity.crystal + farmEntry.knownStorageCapacity.deuterium) * plunderPercent)
  );
}

function resolveFallbackPlunderLootExpectation(farmEntry: BotMemoryV2StrategicMilitaryFarmLedgerEntry): number {
  const transporterCapacity = SHIP_BLUEPRINTS.get(ShipType.TRANSPORTER)?.cargoCapacity ?? 0;
  if (transporterCapacity <= 0) {
    return 0;
  }

  const desiredTransporters = Math.max(
    MIN_FARM_TRANSPORTER_COUNT,
    Math.min(MAX_FARM_TRANSPORTER_COUNT, farmEntry.preferredPlunderTransporterCount)
  );
  return Math.max(1, Math.floor(desiredTransporters * transporterCapacity * 0.8));
}

function selectTopShipNeedsPerPlanet(requests: ShipNeedRequest[]): ShipNeedRequest[] {
  const merged = new Map<string, ShipNeedRequest>();

  for (const request of requests) {
    const preferredOrigin = request.preferredOrigin;
    const key = preferredOrigin
      ? `${preferredOrigin.x}:${preferredOrigin.y}:${preferredOrigin.z}`
      : 'global';
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, request);
      continue;
    }

    if (request.score > existing.score) {
      merged.set(key, request);
    }
  }

  return [...merged.values()];
}

function createMissionProposal(
  context: BotSubsystemContext,
  request: MissionRequest,
  index: number
): BotProposal {
  const summary = request.missionType === FleetMissionType.MOVE
    ? `Mission request #${index + 1}: relocate BREAK ships from ${request.originPlanet.name} to ${request.destinationCoordinates.x}:${request.destinationCoordinates.y}:${request.destinationCoordinates.z} for farm ${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z}.`
    : request.phase === 'INTEL' && request.missionType === FleetMissionType.SPY
      ? `Mission request #${index + 1}: spy ${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z} from ${request.originPlanet.name}.`
      : request.phase === 'INTEL'
        ? `Mission request #${index + 1}: probe neutral defenses at ${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z} from ${request.originPlanet.name}.`
      : request.phase === 'BREAK'
        ? `Mission request #${index + 1}: break neutral defenses at ${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z} from ${request.originPlanet.name}.`
        : `Mission request #${index + 1}: plunder neutral farm at ${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z} from ${request.originPlanet.name}.`;

  return {
    proposalId: `strategic-military:mission:${request.phase}:${request.missionType}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.destinationCoordinates.x}:${request.destinationCoordinates.y}:${request.destinationCoordinates.z}:${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_MILITARY',
    kind: 'FLEET_MISSION',
    status: 'PROPOSED',
    goalKey: `strategic-military:${request.phase}:${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z}`,
    dedupeKey: `strategic-military:mission:${request.phase}:${request.missionType}:${request.originPlanet.coordinates.x}:${request.originPlanet.coordinates.y}:${request.originPlanet.coordinates.z}:${request.destinationCoordinates.x}:${request.destinationCoordinates.y}:${request.destinationCoordinates.z}:${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z}`,
    summary,
    planetId: request.originPlanet.planetId,
    targetCoordinates: { ...request.destinationCoordinates },
    expectedValue: Math.max(1, Math.round(request.expectedLoot + request.score)),
    urgency: request.phase === 'INTEL' ? 52 : request.missionType === FleetMissionType.MOVE ? 79 : request.phase === 'BREAK' ? 86 : 91,
    risk: request.phase === 'INTEL' ? 6 : request.missionType === FleetMissionType.MOVE ? 12 : request.phase === 'BREAK' ? 24 : 15,
    confidence: request.phase === 'INTEL' ? 78 : request.missionType === FleetMissionType.MOVE ? 71 : request.phase === 'BREAK' ? 67 : 73,
    requestedResources: emptyResources(),
    requestPayload: {
      missionType: request.missionType,
      origin: { ...request.originPlanet.coordinates },
      target: { ...request.destinationCoordinates },
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
      missionPhase: request.phase,
      missionType: request.missionType,
      originPlanet: request.originPlanet.name,
      farmTarget: `${request.target.coordinates.x}:${request.target.coordinates.y}:${request.target.coordinates.z}`,
      missionTarget: `${request.destinationCoordinates.x}:${request.destinationCoordinates.y}:${request.destinationCoordinates.z}`,
      moveRole: request.moveRole,
      stagingPlanet: request.stagingPlanet?.name ?? null,
      travelDistance: request.travelDistance,
      travelTurns: request.travelTurns,
      expectedLoot: request.expectedLoot,
      neutralTarget: request.target.isNeutral
    }
  };
}

function createShipNeedProposal(
  context: BotSubsystemContext,
  request: ShipNeedRequest,
  index: number
): BotProposal {
  const summary = `Ship need #${index + 1}: ${request.amount} ${request.shipType} for ${request.shortageKind.toLowerCase()} near ${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}.`;

  return {
    proposalId: `strategic-military:ship-need:${request.shipType}:${request.shortageKind}:${request.targetCoordinates.x}:${request.targetCoordinates.y}:${request.targetCoordinates.z}:${context.snapshot.turn}`,
    subsystemId: 'STRATEGIC_MILITARY',
    kind: 'SHIPYARD',
    status: 'PROPOSED',
    goalKey: `strategic-military:ship-need:${request.shipType}:${request.shortageKind}`,
    dedupeKey: `strategic-military:ship-need:${request.shipType}:${request.shortageKind}`,
    summary,
    planetId: null,
    targetCoordinates: { ...request.targetCoordinates },
    expectedValue: Math.max(1, Math.round(request.score)),
    urgency: request.shortageKind === 'CARGO' ? 78 : 84,
    risk: 9,
    confidence: 64,
    requestedResources: emptyResources(),
    requestPayload: {
      demandOnly: true,
      shortageKind: request.shortageKind,
      shipType: request.shipType,
      amount: request.amount,
      preferredOrigin: request.preferredOrigin ? { ...request.preferredOrigin } : null
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 2,
    debug: {
      queueType: 'SHIP_NEED',
      shortageKind: request.shortageKind,
      shipType: request.shipType,
      amount: request.amount,
      reason: request.reason
    }
  };
}

function compareMissionRequests(left: MissionRequest, right: MissionRequest): number {
  return right.score - left.score
    || right.expectedLoot - left.expectedLoot
    || Number(right.missionType === FleetMissionType.MOVE) - Number(left.missionType === FleetMissionType.MOVE)
    || left.travelTurns - right.travelTurns
    || left.target.coordinates.x - right.target.coordinates.x
    || left.target.coordinates.y - right.target.coordinates.y
    || left.target.coordinates.z - right.target.coordinates.z;
}

function selectMissionRequestsForCap(
  requests: MissionRequest[],
  missionCap: number,
  reservation: FarmMissionReservation
): MissionRequest[] {
  if (missionCap <= 0) {
    return [];
  }

  const probeRequests = requests
    .filter((request) => request.phase === 'INTEL' && request.missionType === FleetMissionType.ATTACK)
    .sort(compareMissionRequests);
  const breakRequests = requests
    .filter((request) => request.phase === 'BREAK')
    .sort(compareMissionRequests);
  const plunderRequests = requests
    .filter((request) => request.phase === 'PLUNDER')
    .sort(compareMissionRequests);
  const spyRequests = requests
    .filter((request) => request.phase === 'INTEL' && request.missionType === FleetMissionType.SPY)
    .sort(compareMissionRequests);

  const selected: MissionRequest[] = [];
  let remainingCap = missionCap;
  const reservedIntelBudget = Math.min(
    remainingCap,
    reservation.availableIntelSlots
  );
  let selectedSpyCount = 0;
  let selectedBreakCount = 0;

  const takeRequests = (pool: MissionRequest[], amount: number): number => {
    if (amount <= 0 || remainingCap <= 0) {
      return 0;
    }

    const count = Math.min(pool.length, amount, remainingCap);
    selected.push(...pool.slice(0, count));
    remainingCap -= count;
    return count;
  };

  takeRequests(plunderRequests, reservation.availablePlunderSlots);

  const availableBreakBudget = Math.min(
    remainingCap,
    Math.max(0, reservation.availableBreakSlots)
  );
  const selectedBreakRequests = takeRequests(breakRequests, availableBreakBudget);
  selectedBreakCount += selectedBreakRequests;
  if (selectedBreakCount < availableBreakBudget) {
    selectedBreakCount += takeRequests(probeRequests, availableBreakBudget - selectedBreakCount);
  }

  selectedSpyCount += takeRequests(spyRequests, reservedIntelBudget);

  if (remainingCap <= 0) {
    return selected;
  }

  const overflow = [
    ...plunderRequests.filter((request) => !selected.includes(request)),
    ...breakRequests.filter((request) => !selected.includes(request)),
    ...probeRequests.filter((request) => !selected.includes(request)),
    ...spyRequests.filter((request) => !selected.includes(request))
  ].sort(compareMissionRequests);

  for (const request of overflow) {
    if (remainingCap <= 0) {
      break;
    }
    if ((request.phase === 'BREAK' || (request.phase === 'INTEL' && request.missionType === FleetMissionType.ATTACK))) {
      if (selectedBreakCount >= reservation.availableBreakSlots) {
        continue;
      }
      selectedBreakCount += 1;
    }
    if (request.phase === 'INTEL' && request.missionType === FleetMissionType.SPY) {
      if (selectedSpyCount >= reservation.availableIntelSlots) {
        continue;
      }
      selectedSpyCount += 1;
    }
    selected.push(request);
    remainingCap -= 1;
  }

  return selected;
}

function resolveFarmMissionReservation(
  context: BotSubsystemContext,
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: FarmLedgerMap,
  missionCap: number
): FarmMissionReservation {
  const actionableFarmCount = countActionableFarms(targets, farmLedger);
  const activeFarmIntelMissionCount = countActiveFarmIntelMissions(targets, farmLedger);
  const activeFarmBreakMissionCount = countActiveFarmBreakMissions(targets, farmLedger);
  const activeFarmPlunderMissionCount = countActiveFarmPlunderMissions(targets, farmLedger);
  const availableFleetSlots = Math.max(
    0,
    context.snapshot.empire.maxActiveFleetCount - context.snapshot.empire.activeFleetCount
  );

  let reservedOperationSlots = 0;
  if (actionableFarmCount > 0) {
    reservedOperationSlots = BASE_RESERVED_FARM_OPERATION_SLOTS + Math.floor(actionableFarmCount / 2);
    if (availableFleetSlots > 0) {
      reservedOperationSlots = Math.min(
        reservedOperationSlots,
        Math.max(0, availableFleetSlots - 1)
      );
    }
    reservedOperationSlots = Math.min(missionCap, reservedOperationSlots);
  }

  const baseReservedPlunderSlots = reservedOperationSlots <= 0
    ? 0
    : 1 + Math.max(0, reservedOperationSlots - 2);
  const baseReservedBreakSlots = reservedOperationSlots >= 2 ? 1 : 0;
  const availableIntelSlots = Math.max(0, RESERVED_FARM_INTEL_SLOTS - activeFarmIntelMissionCount);
  const availableBreakSlots = Math.max(0, Math.min(MAX_ACTIVE_BREAK_FLEETS, baseReservedBreakSlots) - activeFarmBreakMissionCount);
  const availablePlunderSlots = Math.max(0, baseReservedPlunderSlots - activeFarmPlunderMissionCount);

  return {
    actionableFarmCount,
    activeFarmIntelMissionCount,
    activeFarmBreakMissionCount,
    activeFarmPlunderMissionCount,
    reservedOperationSlots,
    availableBreakSlots,
    availablePlunderSlots,
    availableIntelSlots
  };
}

function resolveMissionRequestCap(context: BotSubsystemContext): number {
  return Math.max(
    0,
    Math.floor(context.snapshot.empire.imperiumFleetCap * STRATEGIC_MILITARY_AVAILABILITY)
      + context.snapshot.empire.ownedPlanetCount
  );
}

function isPostEarlyNeutralWarfarePlanet(planet: BotPlanetSnapshot | null): boolean {
  return (planet?.defense.avgIndustryLevel ?? 0) > POST_EARLY_NEUTRAL_WARFARE_AVG_INDUSTRY_THRESHOLD;
}

function resolvePostEarlyNeutralAttackScoreBonus(planet: BotPlanetSnapshot): number {
  return isPostEarlyNeutralWarfarePlanet(planet) ? POST_EARLY_BREAK_SCORE_BONUS : 0;
}

function resolvePostEarlyPlunderScoreMultiplier(planet: BotPlanetSnapshot): number {
  return isPostEarlyNeutralWarfarePlanet(planet) ? POST_EARLY_PLUNDER_SCORE_MULTIPLIER : 1;
}

function resolvePostEarlyNeutralShipNeedScoreBonus(planet: BotPlanetSnapshot | null): number {
  return isPostEarlyNeutralWarfarePlanet(planet) ? POST_EARLY_SHIP_NEED_SCORE_BONUS : 0;
}

function getTechnologyLevel(planet: BotPlanetSnapshot, technologyType: TechnologyTypeT): number {
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

function snapshotHasShipBuildingRequirements(planet: BotPlanetSnapshot, blueprint: NonNullable<ReturnType<typeof SHIP_BLUEPRINTS.get>>): boolean {
  for (const requirement of blueprint.buildingRequirements) {
    const currentLevel = getBuildingLevel(planet, requirement.building);
    if (currentLevel < Math.ceil(requirement.level)) {
      return false;
    }
  }

  return true;
}

function snapshotHasShipTechnologyRequirements(planet: BotPlanetSnapshot, blueprint: NonNullable<ReturnType<typeof SHIP_BLUEPRINTS.get>>): boolean {
  for (const requirement of blueprint.techRequirements) {
    const currentLevel = getTechnologyLevel(planet, requirement.tech);
    if (currentLevel < Math.ceil(requirement.level)) {
      return false;
    }
  }

  return true;
}

function getBuildingLevel(planet: BotPlanetSnapshot, buildingType: BuildingTypeT): number {
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

function resolveTravelTurns(originPlanet: BotPlanetSnapshot, distance: number): number {
  return fleetTravelTurnsForDistance(
    distance,
    originPlanet.tech.fusionDriveLevel,
    originPlanet.tech.hyperspaceDriveLevel,
    0
  );
}

function tryAddShipsToSelection(
  selections: Map<string, Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>>,
  originPlanet: BotPlanetSnapshot,
  shipType: ShipTypeT,
  maxWanted: number,
  distance: number
): number {
  if (maxWanted <= 0) {
    return 0;
  }

  const key = toCoordinatesKey(originPlanet.coordinates);
  const existingSelection = selections.get(key) ?? [];
  const currentEntry = existingSelection.find((entry) => entry.type === shipType);
  const currentAmount = currentEntry ? currentEntry.undamagedAmount + currentEntry.damagedAmount : 0;

  for (let amount = maxWanted; amount >= 1; amount -= 1) {
    const nextSelection = existingSelection.map((entry) => ({ ...entry }));
    const nextEntry = nextSelection.find((entry) => entry.type === shipType);
    if (nextEntry) {
      nextEntry.undamagedAmount = currentAmount + amount;
    } else {
      nextSelection.push({
        type: shipType,
        undamagedAmount: amount,
        damagedAmount: 0
      });
    }

    if (!hasEnoughDeuteriumForSelection(originPlanet, nextSelection, distance)) {
      continue;
    }

    selections.set(key, nextSelection);
    return amount;
  }

  return 0;
}

function hasEnoughDeuteriumForSelection(
  originPlanet: BotPlanetSnapshot,
  selection: Array<{ type: ShipTypeT; undamagedAmount: number; damagedAmount: number }>,
  distance: number
): boolean {
  if (distance <= 0) {
    return true;
  }

  const fuelCost = calculateFuelCost(
    selection.map((ship) => ({
      type: ship.type,
      amount: ship.undamagedAmount + ship.damagedAmount
    })),
    distance
  );
  return originPlanet.localResources.deuterium >= fuelCost;
}

function emptyResources(): ResourceAmounts {
  return {
    metal: 0,
    crystal: 0,
    deuterium: 0
  };
}

function createFarmLedgerMap(
  entries: BotMemoryV2StrategicMilitaryFarmLedgerEntry[]
): FarmLedgerMap {
  const map: FarmLedgerMap = new Map();
  for (const entry of entries) {
    map.set(toCoordinatesKey(entry.coordinates), {
      ...entry,
      coordinates: { ...entry.coordinates },
      knownMineLevels: { ...entry.knownMineLevels },
      knownStorageCapacity: { ...entry.knownStorageCapacity },
      knownIncome: { ...entry.knownIncome },
      knownPlanetaryModifiers: { ...entry.knownPlanetaryModifiers },
      knownShipCountsByType: { ...entry.knownShipCountsByType },
      knownDefenceCountsByType: { ...entry.knownDefenceCountsByType },
      intelPhase: entry.intelPhase,
      farmIntelEnough: entry.farmIntelEnough,
      lastObservedResources: { ...entry.lastObservedResources },
      preferredOriginCoordinates: entry.preferredOriginCoordinates
        ? { ...entry.preferredOriginCoordinates }
        : null,
      preferredPlunderTransporterCount: entry.preferredPlunderTransporterCount
    });
  }
  return map;
}

function countActionableFarms(
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: FarmLedgerMap
): number {
  const actionable = new Set<string>();
  for (const target of targets) {
    if (!target.isNeutral || !target.inOwnedSystem || target.hasForeignGuard) {
      continue;
    }
    const entry = resolveFarmLedgerEntry(farmLedger, target.coordinates);
    if (!entry) {
      continue;
    }
    if (
      entry.intelPhase === 'PROBE_REQUIRED'
      || (entry.farmIntelEnough && !entry.initialDefenseBroken)
      || entry.initialDefenseBroken
    ) {
      actionable.add(toCoordinatesKey(target.coordinates));
    }
  }
  return actionable.size;
}

function countActiveFarmIntelMissions(
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: FarmLedgerMap
): number {
  const active = new Set<string>();
  for (const target of targets) {
    if (!target.hasOwnActiveFarmMission) {
      continue;
    }
    const entry = resolveFarmLedgerEntry(farmLedger, target.coordinates);
    if (entry && !entry.farmIntelEnough && entry.intelPhase === 'SPY_SENT') {
      active.add(toCoordinatesKey(target.coordinates));
    }
  }
  return active.size;
}

function countActiveFarmBreakMissions(
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: FarmLedgerMap
): number {
  const active = new Set<string>();
  for (const target of targets) {
    if (!target.hasOwnActiveFarmMission) {
      continue;
    }
    const entry = resolveFarmLedgerEntry(farmLedger, target.coordinates);
    if (!entry) {
      continue;
    }
    if (entry.intelPhase === 'PROBE_REQUIRED' || (entry.farmIntelEnough && !entry.initialDefenseBroken)) {
      active.add(toCoordinatesKey(target.coordinates));
    }
  }
  return Math.min(MAX_ACTIVE_BREAK_FLEETS, active.size);
}

function countActiveFarmPlunderMissions(
  targets: BotStrategicMilitaryTargetSnapshot[],
  farmLedger: FarmLedgerMap
): number {
  const active = new Set<string>();
  for (const target of targets) {
    if (!target.hasOwnActiveFarmMission) {
      continue;
    }
    const entry = resolveFarmLedgerEntry(farmLedger, target.coordinates);
    if (!entry) {
      continue;
    }
    if (entry.initialDefenseBroken) {
      active.add(toCoordinatesKey(target.coordinates));
    }
  }
  return active.size;
}

function resolveFarmLedgerEntry(
  farmLedger: FarmLedgerMap,
  coordinates: { x: number; y: number; z: number }
): BotMemoryV2StrategicMilitaryFarmLedgerEntry | null {
  return farmLedger.get(toCoordinatesKey(coordinates)) ?? null;
}

function updateFarmLedgerEntryFromTarget(
  context: BotSubsystemContext,
  farmLedger: FarmLedgerMap,
  target: BotStrategicMilitaryTargetSnapshot
): BotMemoryV2StrategicMilitaryFarmLedgerEntry {
  const key = toCoordinatesKey(target.coordinates);
  const existing = farmLedger.get(key);
  const entry = existing ?? createEmptyFarmLedgerEntry(target.coordinates);
  const wasDefenseBroken = entry.initialDefenseBroken;

  if (target.reportTurn !== null) {
    if (entry.lastSpyTurn === null || target.reportTurn > entry.lastSpyTurn) {
      entry.lastSpyTurn = target.reportTurn;
    }
    if (target.mineLevels) {
      entry.knownMineLevels = { ...target.mineLevels };
    }
    if (target.storageCapacity) {
      entry.knownStorageCapacity = { ...target.storageCapacity };
    }
    if (target.income) {
      entry.knownIncome = { ...target.income };
    }
    entry.knownBunkerReductionPercent = Math.max(0, target.bunkerReductionPercent ?? 0);
    entry.knownPlanetaryModifiers = {
      industryModifier: Math.max(0, target.industryModifier ?? 1),
      metalModifier: Math.max(0, target.metalModifier ?? 1),
      crystalModifier: Math.max(0, target.crystalModifier ?? 1),
      deuteriumModifier: Math.max(0, target.deuteriumModifier ?? 1)
    };

    if (
      target.currentResources
      && (entry.lastResourceObservationTurn === null || target.reportTurn > entry.lastResourceObservationTurn)
    ) {
      entry.lastObservedResources = { ...target.currentResources };
      entry.lastResourceObservationTurn = target.reportTurn;
    }
  }

  if (
    target.combatObservationTurn !== null
    && (entry.lastCombatObservationTurn === null || target.combatObservationTurn > entry.lastCombatObservationTurn)
  ) {
    entry.knownShipCountsByType = { ...target.knownShipCountsByType };
    entry.knownDefenceCountsByType = { ...target.knownDefenceCountsByType };
    entry.lastCombatObservationTurn = target.combatObservationTurn;
  }

  if (
    target.spyCombatIntelEnough
    && target.reportTurn !== null
    && (entry.lastCombatObservationTurn === null || target.reportTurn > entry.lastCombatObservationTurn)
  ) {
    entry.knownShipCountsByType = { ...target.knownShipCountsByType };
    entry.knownDefenceCountsByType = { ...target.knownDefenceCountsByType };
    entry.lastCombatObservationTurn = target.reportTurn;
  }

  if (
    target.lastAttackTurn !== null
    && (entry.lastAttackTurn === null || target.lastAttackTurn > entry.lastAttackTurn)
  ) {
    entry.lastAttackTurn = target.lastAttackTurn;
  }

  if (
    target.lastPlunderTurn !== null
    && (entry.lastSuccessfulPlunderTurn === null || target.lastPlunderTurn > entry.lastSuccessfulPlunderTurn)
  ) {
    const estimatedResourcesAtPlunder = estimateFarmResourcesAtTurn(entry, target.lastPlunderTurn);
    const stolenResources = target.latestPlunderedResources ?? emptyResources();
    entry.lastObservedResources = subtractResources(estimatedResourcesAtPlunder, stolenResources);
    entry.lastResourceObservationTurn = target.lastPlunderTurn;
    entry.lastSuccessfulPlunderTurn = target.lastPlunderTurn;
    entry.preferredPlunderTransporterCount = resolvePlunderTransporterAdjustment(entry, stolenResources);
  }

  if (target.lastAttackTurn !== null || target.spyCombatIntelEnough) {
    entry.intelPhase = 'COMBAT_INTEL_READY';
  } else if (target.reportTurn !== null && entry.intelPhase !== 'COMBAT_INTEL_READY') {
    entry.intelPhase = 'PROBE_REQUIRED';
  }

  entry.farmIntelEnough = entry.farmIntelEnough || target.spyCombatIntelEnough || target.lastAttackTurn !== null;
  entry.initialDefenseBroken = sumRecordCounts(entry.knownShipCountsByType) <= 0
    && sumRecordCounts(entry.knownDefenceCountsByType) <= 0;

  if (
    target.lastAttackTurn !== null
    && (entry.lastProcessedAttackTurn === null || target.lastAttackTurn > entry.lastProcessedAttackTurn)
  ) {
    entry.lastProcessedAttackTurn = target.lastAttackTurn;
    entry.lastBreakAttemptCombatStrength = target.lastAttackOwnCombatStrength ?? entry.lastBreakAttemptCombatStrength;

    if (entry.initialDefenseBroken) {
      entry.nextBreakAllowedTurn = null;
      entry.lastBreakFailureLossBracket = null;
    } else {
      entry.nextBreakAllowedTurn = target.lastAttackTurn + BREAK_FAILURE_COOLDOWN_TURNS;
      entry.lastBreakFailureLossBracket = resolveBreakFailureLossBracket(target);
      // TODO: A failed neutral-farm break can also mean third-party fleets interfered, not only that our force was too weak.
    }
  }

  if (wasDefenseBroken && !entry.initialDefenseBroken) {
    entry.nextBreakAllowedTurn = context.snapshot.turn;
  }

  farmLedger.set(key, entry);
  return entry;
}

function createEmptyFarmLedgerEntry(
  coordinates: { x: number; y: number; z: number }
): BotMemoryV2StrategicMilitaryFarmLedgerEntry {
  return {
    coordinates: { ...coordinates },
    intelPhase: 'UNSCANNED',
    lastSpyTurn: null,
    lastAttackTurn: null,
    lastProcessedAttackTurn: null,
    lastSuccessfulPlunderTurn: null,
    lastBreakAttemptCombatStrength: null,
    nextBreakAllowedTurn: null,
    lastBreakFailureLossBracket: null,
    knownMineLevels: {
      metalMineLevel: 0,
      crystalMineLevel: 0,
      deuteriumSynthesizerLevel: 0
    },
    knownStorageCapacity: emptyResources(),
    knownIncome: emptyResources(),
    knownBunkerReductionPercent: 0,
    knownPlanetaryModifiers: {
      industryModifier: 1,
      metalModifier: 1,
      crystalModifier: 1,
      deuteriumModifier: 1
    },
    knownShipCountsByType: {},
    knownDefenceCountsByType: {},
    farmIntelEnough: false,
    initialDefenseBroken: false,
    lastObservedResources: emptyResources(),
    lastResourceObservationTurn: null,
    lastCombatObservationTurn: null,
    estimatedNextGoodAttackTurn: null,
    preferredPlunderTransporterCount: DEFAULT_FARM_TRANSPORTER_COUNT,
    preferredOriginCoordinates: null
  };
}

function resolveBreakFailureLossBracket(
  target: BotStrategicMilitaryTargetSnapshot
): NonNullable<BotMemoryV2StrategicMilitaryFarmLedgerEntry['lastBreakFailureLossBracket']> {
  if (target.lastAttackFleetDestroyed) {
    return 'DEFEAT';
  }
  if ((target.lastAttackOwnLossRatio ?? 0) >= 0.3) {
    return 'MEDIUM';
  }
  return 'LIGHT';
}

function hasFarmResourceModel(entry: BotMemoryV2StrategicMilitaryFarmLedgerEntry): boolean {
  return entry.lastResourceObservationTurn !== null
    && (entry.knownStorageCapacity.metal + entry.knownStorageCapacity.crystal + entry.knownStorageCapacity.deuterium) > 0
    && (entry.knownIncome.metal + entry.knownIncome.crystal + entry.knownIncome.deuterium) >= 0;
}

function estimateFarmResourcesAtTurn(
  entry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  targetTurn: number
): ResourceAmounts {
  const observationTurn = entry.lastResourceObservationTurn ?? targetTurn;
  const deltaTurns = Math.max(0, targetTurn - observationTurn);
  return {
    metal: Math.min(entry.knownStorageCapacity.metal, entry.lastObservedResources.metal + (entry.knownIncome.metal * deltaTurns)),
    crystal: Math.min(entry.knownStorageCapacity.crystal, entry.lastObservedResources.crystal + (entry.knownIncome.crystal * deltaTurns)),
    deuterium: Math.min(entry.knownStorageCapacity.deuterium, entry.lastObservedResources.deuterium + (entry.knownIncome.deuterium * deltaTurns))
  };
}

function resolveEstimatedNextGoodAttackTurn(
  entry: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  currentTurn: number,
  availableCargoCapacity: number
): number | null {
  const maxLoot = resolveMaxFullLoot(entry);
  if (maxLoot <= 0) {
    return null;
  }

  const targetLootThreshold = Math.min(maxLoot, Math.ceil(Math.max(1, availableCargoCapacity) * 0.5));
  const plunderPercent = Math.max(0.01, Math.max(0, 80 - entry.knownBunkerReductionPercent) / 100);
  const targetResourceThreshold = Math.ceil(targetLootThreshold / plunderPercent);
  const maxStoredResources = entry.knownStorageCapacity.metal
    + entry.knownStorageCapacity.crystal
    + entry.knownStorageCapacity.deuterium;

  if (maxStoredResources <= 0) {
    return null;
  }

  const cappedThreshold = Math.min(maxStoredResources, targetResourceThreshold);
  for (let turn = currentTurn; turn <= currentTurn + 400; turn += 1) {
    const estimatedResources = estimateFarmResourcesAtTurn(entry, turn);
    const totalResources = estimatedResources.metal + estimatedResources.crystal + estimatedResources.deuterium;
    if (totalResources >= cappedThreshold) {
      return turn;
    }
  }

  return null;
}

function subtractResources(
  base: ResourceAmounts,
  taken: ResourceAmounts
): ResourceAmounts {
  return {
    metal: Math.max(0, base.metal - taken.metal),
    crystal: Math.max(0, base.crystal - taken.crystal),
    deuterium: Math.max(0, base.deuterium - taken.deuterium)
  };
}

function sumRecordCounts<T extends string>(counts: Partial<Record<T, number>>): number {
  let total = 0;
  for (const value of Object.values(counts) as Array<number | undefined>) {
    total += Math.max(0, value ?? 0);
  }
  return total;
}

function toCoordinatesKey(
  coordinates: { x: number; y: number; z: number }
): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function compareFarmLedgerEntries(
  left: BotMemoryV2StrategicMilitaryFarmLedgerEntry,
  right: BotMemoryV2StrategicMilitaryFarmLedgerEntry
): number {
  return left.coordinates.x - right.coordinates.x
    || left.coordinates.y - right.coordinates.y
    || left.coordinates.z - right.coordinates.z;
}
