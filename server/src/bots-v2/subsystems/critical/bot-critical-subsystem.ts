import type {
  BotMemoryCoordinates,
  BotMemoryV2CriticalBlockerEntry,
  BotMemoryV2CriticalBlockerFamily,
  BotMemoryV2WeightManagerPlanetEntry
} from '../../../../../src/app/models/player.ts';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { fleetTravelTurnsForDistance } from '../../../../../src/app/models/tech/technology-effects.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import {
  BUILDING_BLUEPRINTS,
  calculateFuelCost,
  calculateTravelDistance,
  SHIP_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import {
  hasEmergencyInfrastructureDamage,
  resolveEffectiveInfrastructureDamagePercent
} from '../../infrastructure-damage.js';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';

type ResourceKey = 'metal' | 'crystal' | 'deuterium';

type ResourceAmounts = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type CriticalCandidate = {
  blockerKey: string;
  blockerFamily: BotMemoryV2CriticalBlockerFamily;
  proposalPlanet: BotPlanetSnapshot;
  targetPlanet: BotPlanetSnapshot;
  kind: 'BUILDING' | 'RESEARCH' | 'SHIPYARD' | 'FLEET_MISSION';
  dedupeKey: string;
  summary: string;
  severity: number;
  urgency: number;
  risk: number;
  confidence: number;
  requestedResources: ResourceAmounts;
  requestPayload: Record<string, unknown>;
  debug: Record<string, string | number | boolean | null>;
};

type EmergencySignals = {
  needsSpyProbeCoverage: boolean;
  needsCargoTransfer: boolean;
  needsRepairDroneTransfer: boolean;
  empireCargoCapacity: number;
  empireSpyProbeCount: number;
  empireRepairDroneCount: number;
};

type CriticalResponseSubtype =
  | 'REPAIR'
  | 'TRANSPORT'
  | 'ARMAMENT_DELIVERY';

type MissionShipSelection = Array<{
  type: ShipType;
  undamagedAmount: number;
  damagedAmount: number;
}>;

const ENERGY_BUILDINGS = [
  BuildingType.SOLAR_WIND_GEOTHERMAL,
  BuildingType.NUCLEAR_PLANT,
  BuildingType.FUSION_REACTOR
] as const;

const STORAGE_BUILDINGS_BY_RESOURCE: Record<ResourceKey, BuildingType> = {
  metal: BuildingType.METAL_STORAGE,
  crystal: BuildingType.CRYSTAL_STORAGE,
  deuterium: BuildingType.DEUTERIUM_TANK
};

const CORE_INFRASTRUCTURE_BUILDINGS = [
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.SHIPYARD,
  BuildingType.RESEARCH_LAB,
  BuildingType.NANITE_FACTORY
] as const;

const INDUSTRY_ETC_BUILDINGS = [
  BuildingType.METAL_MINE,
  BuildingType.CRYSTAL_MINE,
  BuildingType.DEUTERIUM_SYNTHESIZER,
  BuildingType.SOLAR_WIND_GEOTHERMAL,
  BuildingType.NUCLEAR_PLANT,
  BuildingType.FUSION_REACTOR,
  BuildingType.ROBOTICS_FACTORY,
  BuildingType.SHIPYARD,
  BuildingType.RESEARCH_LAB,
  BuildingType.NANITE_FACTORY
] as const;

const CARGO_SHIP_TYPES = [
  ShipType.CARGO_SUPPORT,
  ShipType.MASS_HAULER,
  ShipType.TRANSPORTER
] as const;

const UTILITY_TRANSPORT_SHIP_TYPES = [
  ShipType.CARGO_SUPPORT,
  ShipType.MASS_HAULER,
  ShipType.TRANSPORTER
] as const;

const UTILITY_ARMAMENT_CARRIER_TYPES = [
  ShipType.CARGO_SUPPORT,
  ShipType.CARRIER,
  ShipType.FLEET_CARRIER
] as const;

const MAX_CRITICAL_TRANSPORT_LOCAL_RECOVERY_TURNS = 5;
const MAX_CRITICAL_TRANSPORT_CARGO = 2000;
const MAX_CRITICAL_REPAIR_TURNS = 8;
const MAX_CRITICAL_ARMAMENT_DELIVERY_TURNS = 5;
const MAX_CRITICAL_TRANSPORT_TURNS = 8;
const MAX_CRITICAL_REPAIR_SOURCE_DRONES = 3;
const CRITICAL_REPAIR_DAMAGE_THRESHOLD_PERCENT = 35;
const CRITICAL_REPAIR_LOCAL_RECOVERY_TURNS = 20;

const BLOCKER_FAMILY_PRIORITY: BotMemoryV2CriticalBlockerFamily[] = [
  'ENERGY_DEADLOCK',
  'STORAGE_DEADLOCK',
  'INDUSTRY_CHAIN_DEADLOCK',
  'LOGISTICS_DEADLOCK',
  'INTEL_DEADLOCK'
];

export class BotCriticalSubsystem implements BotSubsystem {
  public readonly subsystemId = 'CRITICAL' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const emergencySignals = resolveEmergencySignals(context);
    const detectedCandidates = [
      ...collectEnergyDeadlockCandidates(context),
      ...collectStorageDeadlockCandidates(context),
      ...collectIndustryChainDeadlockCandidates(context, emergencySignals),
      ...collectLogisticsDeadlockCandidates(context, emergencySignals),
      ...collectIntelDeadlockCandidates(context, emergencySignals),
      ...collectCriticalPhaseTwoCandidates(context)
    ];
    const selectedCandidates = selectCriticalCandidates(detectedCandidates);

    updateCriticalBlockerLedger(
      context.memory.critical.blockerLedger,
      detectedCandidates,
      selectedCandidates,
      context.snapshot.turn
    );

    return {
      subsystemId: this.subsystemId,
      proposals: selectedCandidates.map((candidate) => createCriticalProposal(context, candidate)),
      debug: {
        detectedBlockerCount: detectedCandidates.length,
        emittedProposalCount: selectedCandidates.length,
        energyDeadlockCount: countCandidatesByFamily(detectedCandidates, 'ENERGY_DEADLOCK'),
        storageDeadlockCount: countCandidatesByFamily(detectedCandidates, 'STORAGE_DEADLOCK'),
        industryChainDeadlockCount: countCandidatesByFamily(detectedCandidates, 'INDUSTRY_CHAIN_DEADLOCK'),
        logisticsDeadlockCount: countCandidatesByFamily(detectedCandidates, 'LOGISTICS_DEADLOCK'),
        intelDeadlockCount: countCandidatesByFamily(detectedCandidates, 'INTEL_DEADLOCK'),
        empireCargoCapacity: emergencySignals.empireCargoCapacity,
        empireSpyProbeCount: emergencySignals.empireSpyProbeCount,
        empireRepairDroneCount: emergencySignals.empireRepairDroneCount
      }
    };
  }
}

function collectEnergyDeadlockCandidates(context: BotSubsystemContext): CriticalCandidate[] {
  return context.snapshot.planets.flatMap((planet) => {
    if (planet.economy.energyGap <= 0) {
      return [];
    }
    if (hasQueuedBuilding(planet, ENERGY_BUILDINGS) || hasVisibleBuildingProposal(context, planet, ENERGY_BUILDINGS)) {
      return [];
    }

    const selectedBuilding = selectBestEmergencyEnergyBuilding(planet);
    if (!selectedBuilding) {
      return [];
    }

    const nextLevel = getBuildingLevel(planet, selectedBuilding) + 1;
    const cost = resolveBuildingCost(selectedBuilding, nextLevel);
    if (!cost) {
      return [];
    }

    const severity = clampToHundred(Math.round(
      45 + Math.min(45, (planet.economy.energyGap / Math.max(1, planet.economy.usedEnergy)) * 100)
    ));

    return [createBuildingCandidate({
      blockerFamily: 'ENERGY_DEADLOCK',
      blockerKey: `critical:energy:${toCoordinatesKey(planet.coordinates)}`,
      planet,
      buildingType: selectedBuilding,
      severity,
      urgency: 98,
      requestedResources: cost,
      summary: `Critical energy recovery: queue ${selectedBuilding} on ${planet.name}.`,
      debug: {
        blockerFamily: 'ENERGY_DEADLOCK',
        energyGap: planet.economy.energyGap,
        usedEnergy: planet.economy.usedEnergy,
        availableEnergy: planet.economy.availableEnergy,
        selectedBuilding
      }
    })];
  });
}

function collectStorageDeadlockCandidates(context: BotSubsystemContext): CriticalCandidate[] {
  return context.snapshot.planets.flatMap((planet) => {
    const relevantProposal = resolveStorageDeadlockProposal(context, planet);
    if (!relevantProposal) {
      return [];
    }

    const storageBuilding = STORAGE_BUILDINGS_BY_RESOURCE[relevantProposal.resourceKey];
    if (
      hasQueuedBuilding(planet, [storageBuilding])
      || hasVisibleBuildingProposal(context, planet, [storageBuilding])
    ) {
      return [];
    }

    const nextLevel = getBuildingLevel(planet, storageBuilding) + 1;
    const cost = resolveBuildingCost(storageBuilding, nextLevel);
    if (!cost) {
      return [];
    }

    const severity = clampToHundred(Math.round(50 + Math.min(45, (relevantProposal.ratio - 1) * 35)));
    return [createBuildingCandidate({
      blockerFamily: 'STORAGE_DEADLOCK',
      blockerKey: `critical:storage:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${relevantProposal.resourceKey}`,
      planet,
      buildingType: storageBuilding,
      severity,
      urgency: 92,
      requestedResources: cost,
      summary: `Critical storage recovery: queue ${storageBuilding} on ${planet.name} for ${relevantProposal.resourceKey}.`,
      debug: {
        blockerFamily: 'STORAGE_DEADLOCK',
        resourceKey: relevantProposal.resourceKey,
        proposalId: relevantProposal.proposal.proposalId,
        relevantRequestCost: relevantProposal.requestedAmount,
        relevantStorageCapacity: relevantProposal.capacity,
        relevantRatio: roundToTwoDecimals(relevantProposal.ratio)
      }
    })];
  });
}

function collectIndustryChainDeadlockCandidates(
  context: BotSubsystemContext,
  emergencySignals: EmergencySignals
): CriticalCandidate[] {
  return context.snapshot.planets.flatMap((planet) => {
    const laggingEntries = CORE_INFRASTRUCTURE_BUILDINGS
      .filter((buildingType) =>
        !hasQueuedBuilding(planet, [buildingType]) && !hasVisibleBuildingProposal(context, planet, [buildingType])
      )
      .map((buildingType) => evaluateIndustryChainLag(planet, buildingType, emergencySignals, context))
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

    const best = laggingEntries.sort((left, right) =>
      right.severity - left.severity || left.buildingType.localeCompare(right.buildingType)
    )[0];
    if (!best) {
      return [];
    }

    const nextLevel = getBuildingLevel(planet, best.buildingType) + 1;
    const cost = resolveBuildingCost(best.buildingType, nextLevel);
    if (!cost) {
      return [];
    }

    return [createBuildingCandidate({
      blockerFamily: 'INDUSTRY_CHAIN_DEADLOCK',
      blockerKey: `critical:industry-chain:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${best.buildingType}`,
      planet,
      buildingType: best.buildingType,
      severity: best.severity,
      urgency: 84,
      requestedResources: cost,
      summary: `Critical industry-chain recovery: queue ${best.buildingType} on ${planet.name}.`,
      debug: {
        blockerFamily: 'INDUSTRY_CHAIN_DEADLOCK',
        buildingType: best.buildingType,
        lagRatio: roundToTwoDecimals(best.lagRatio),
        averageOtherEtc: roundToTwoDecimals(best.averageOtherEtc),
        buildingEtc: roundToTwoDecimals(best.buildingEtc),
        directNeed: best.directNeed
      }
    })];
  });
}

function collectLogisticsDeadlockCandidates(
  context: BotSubsystemContext,
  emergencySignals: EmergencySignals
): CriticalCandidate[] {
  const candidates: CriticalCandidate[] = [];

  if (emergencySignals.needsCargoTransfer && emergencySignals.empireCargoCapacity <= 0) {
    const cargoProducer = selectBestCargoShipProducer(context.snapshot.planets);
    if (cargoProducer && !hasVisibleShipProposal(context, cargoProducer.planet, cargoProducer.shipType)) {
      const cost = resolveShipCost(cargoProducer.shipType, 1);
      candidates.push(createShipyardCandidate({
        blockerFamily: 'LOGISTICS_DEADLOCK',
        blockerKey: `critical:logistics:cargo:${toCoordinatesKey(cargoProducer.planet.coordinates)}:${cargoProducer.shipType}`,
        planet: cargoProducer.planet,
        shipType: cargoProducer.shipType,
        amount: 1,
        severity: 78,
        urgency: 76,
        requestedResources: cost,
        summary: `Critical logistics recovery: produce ${cargoProducer.shipType} on ${cargoProducer.planet.name}.`,
        debug: {
          blockerFamily: 'LOGISTICS_DEADLOCK',
          reason: 'NO_INACTIVE_CARGO_CAPACITY',
          shipType: cargoProducer.shipType
        }
      }));
    }
  }

  if (emergencySignals.empireRepairDroneCount <= 0) {
    const damagedTarget = selectHeavilyDamagedRepairTarget(context.snapshot.planets);
    if (damagedTarget) {
      const repairProducer = selectSafeRepairDroneProducer(context);
      if (
        repairProducer
        && !hasVisibleShipProposal(context, repairProducer, ShipType.REPAIR_DRONE)
      ) {
        const cost = resolveShipCost(ShipType.REPAIR_DRONE, 1);
        candidates.push(createShipyardCandidate({
          blockerFamily: 'LOGISTICS_DEADLOCK',
          blockerKey: `critical:logistics:repair-drone:${toCoordinatesKey(repairProducer.coordinates)}`,
          planet: repairProducer,
          shipType: ShipType.REPAIR_DRONE,
          amount: 1,
          severity: damagedTarget.severity,
          urgency: 78,
          requestedResources: cost,
          summary: `Critical repair recovery: produce REPAIR_DRONE on ${repairProducer.name} for ${damagedTarget.planet.name}.`,
          debug: {
            blockerFamily: 'LOGISTICS_DEADLOCK',
            reason: 'NO_REPAIR_DRONES_AVAILABLE',
            damagedTarget: damagedTarget.planet.name,
            missingStructuralRatio: roundToTwoDecimals(damagedTarget.damageRatio),
            estimatedRepairTurns: roundToTwoDecimals(damagedTarget.estimatedRepairTurns)
          }
        }));
      }
    }
  }

  return dedupeCandidatesByBlockerKey(candidates);
}

function collectIntelDeadlockCandidates(
  context: BotSubsystemContext,
  emergencySignals: EmergencySignals
): CriticalCandidate[] {
  if (!emergencySignals.needsSpyProbeCoverage || emergencySignals.empireSpyProbeCount > 0) {
    return [];
  }

  const producer = selectBestShipProducer(context.snapshot.planets, ShipType.SPY_PROBE);
  if (!producer || hasVisibleShipProposal(context, producer, ShipType.SPY_PROBE)) {
    return [];
  }

  const cost = resolveShipCost(ShipType.SPY_PROBE, 1);
  return [createShipyardCandidate({
    blockerFamily: 'INTEL_DEADLOCK',
    blockerKey: `critical:intel:spy-probe:${toCoordinatesKey(producer.coordinates)}`,
    planet: producer,
    shipType: ShipType.SPY_PROBE,
    amount: 1,
    severity: clampToHundred(55 + (context.snapshot.empire.intelCandidates.filter((entry) => entry.needsScan).length * 5)),
    urgency: 68,
    requestedResources: cost,
    summary: `Critical intel recovery: produce SPY_PROBE on ${producer.name}.`,
    debug: {
      blockerFamily: 'INTEL_DEADLOCK',
      intelTargetCount: context.snapshot.empire.intelCandidates.filter((entry) => entry.needsScan).length
    }
  })];
}

function collectCriticalPhaseTwoCandidates(context: BotSubsystemContext): CriticalCandidate[] {
  const candidates: CriticalCandidate[] = [];

  for (const targetPlanet of context.snapshot.planets) {
    const repairTarget = evaluateCriticalRepairTarget(context, targetPlanet);
    if (repairTarget) {
      candidates.push(...collectCriticalRepairResponseCandidates(context, repairTarget));
    }

    const transportTarget = evaluateCriticalTransportTarget(context, targetPlanet);
    if (transportTarget) {
      candidates.push(...collectCriticalTransportResponseCandidates(context, transportTarget));
    }
  }

  return dedupeCandidatesByBlockerKey(candidates);
}

function collectCriticalRepairResponseCandidates(
  context: BotSubsystemContext,
  target: {
    planet: BotPlanetSnapshot;
    damageRatio: number;
    localRecoveryTurns: number;
    severity: number;
  }
): CriticalCandidate[] {
  if (hasVisibleCriticalMissionProposal(context, target.planet, [FleetMissionType.REPAIR, FleetMissionType.ARMAMENT_DELIVERY])) {
    return [];
  }

  const directRepair = selectCriticalRepairSource(context, target.planet);
  if (directRepair) {
    return [createFleetMissionCandidate({
      blockerFamily: 'LOGISTICS_DEADLOCK',
      responseSubtype: 'REPAIR',
      blockerKey: `critical:phase2:repair:${toCoordinatesKey(target.planet.coordinates)}`,
      originPlanet: directRepair.originPlanet,
      targetPlanet: target.planet,
      missionType: FleetMissionType.REPAIR,
      ships: directRepair.ships,
      cargo: emptyResources(),
      severity: target.severity,
      urgency: 95,
      risk: 10,
      confidence: 74,
      summary: `Critical repair response: send repair aid from ${directRepair.originPlanet.name} to ${target.planet.name}.`,
      debug: {
        responseSubtype: 'REPAIR',
        travelDistance: directRepair.travelDistance,
        travelTurns: directRepair.travelTurns,
        sentRepairDrones: directRepair.ships.reduce((sum, ship) => sum + ship.undamagedAmount + ship.damagedAmount, 0),
        missingStructuralRatio: roundToTwoDecimals(target.damageRatio),
        localRecoveryTurns: roundToTwoDecimals(target.localRecoveryTurns)
      }
    })];
  }

  const armamentSource = selectCriticalArmamentDeliverySource(context, target.planet);
  if (armamentSource) {
    return [createFleetMissionCandidate({
      blockerFamily: 'LOGISTICS_DEADLOCK',
      responseSubtype: 'ARMAMENT_DELIVERY',
      blockerKey: `critical:phase2:armament-delivery:${toCoordinatesKey(target.planet.coordinates)}`,
      originPlanet: armamentSource.originPlanet,
      targetPlanet: target.planet,
      missionType: FleetMissionType.ARMAMENT_DELIVERY,
      ships: armamentSource.ships,
      cargo: armamentSource.cargo,
      severity: target.severity,
      urgency: 92,
      risk: 12,
      confidence: 70,
      summary: `Critical repair logistics: deliver repair drones from ${armamentSource.originPlanet.name} to ${target.planet.name}.`,
      debug: {
        responseSubtype: 'ARMAMENT_DELIVERY',
        travelDistance: armamentSource.travelDistance,
        travelTurns: armamentSource.travelTurns,
        deliveredRepairDrones: armamentSource.repairDroneAmount,
        deliveredResources: getTotalResourceAmount(armamentSource.cargo),
        missingStructuralRatio: roundToTwoDecimals(target.damageRatio),
        localRecoveryTurns: roundToTwoDecimals(target.localRecoveryTurns)
      }
    })];
  }

  const fallback = selectCriticalRepairFallbackProducer(context, target.planet);
  if (fallback && !hasVisibleShipProposal(context, fallback.planet, fallback.shipType)) {
    return [createDemandOnlyShipyardCandidate({
      blockerFamily: 'LOGISTICS_DEADLOCK',
      blockerKey: `critical:phase2:repair-fallback:${toCoordinatesKey(fallback.planet.coordinates)}:${fallback.shipType}`,
      planet: fallback.planet,
      shipType: fallback.shipType,
      amount: 1,
      severity: target.severity,
      urgency: 86,
      requestedResources: resolveShipCost(fallback.shipType, 1),
      reason: fallback.reason,
      summary: `Critical repair fallback: produce ${fallback.shipType} on ${fallback.planet.name} for ${target.planet.name}.`,
      debug: {
        responseSubtype: fallback.shipType === ShipType.REPAIR_DRONE ? 'REPAIR' : 'ARMAMENT_DELIVERY',
        targetPlanet: target.planet.name,
        missingStructuralRatio: roundToTwoDecimals(target.damageRatio),
        localRecoveryTurns: roundToTwoDecimals(target.localRecoveryTurns)
      }
    })];
  }

  return [];
}

function collectCriticalTransportResponseCandidates(
  context: BotSubsystemContext,
  target: {
    planet: BotPlanetSnapshot;
    shortage: ResourceAmounts;
    totalShortage: number;
    localRecoveryTurns: number;
    severity: number;
  }
): CriticalCandidate[] {
  if (hasVisibleCriticalMissionProposal(context, target.planet, [FleetMissionType.TRANSPORT])) {
    return [];
  }

  const transportSource = selectCriticalTransportSource(context, target.planet, target.shortage);
  if (transportSource) {
    return [createFleetMissionCandidate({
      blockerFamily: 'LOGISTICS_DEADLOCK',
      responseSubtype: 'TRANSPORT',
      blockerKey: `critical:phase2:transport:${toCoordinatesKey(target.planet.coordinates)}`,
      originPlanet: transportSource.originPlanet,
      targetPlanet: target.planet,
      missionType: FleetMissionType.TRANSPORT,
      ships: transportSource.ships,
      cargo: transportSource.cargo,
      severity: target.severity,
      urgency: 82,
      risk: 8,
      confidence: 72,
      summary: `Critical transport response: move resources from ${transportSource.originPlanet.name} to ${target.planet.name}.`,
      debug: {
        responseSubtype: 'TRANSPORT',
        travelDistance: transportSource.travelDistance,
        travelTurns: transportSource.travelTurns,
        transportedResources: getTotalResourceAmount(transportSource.cargo),
        localRecoveryTurns: roundToTwoDecimals(target.localRecoveryTurns)
      }
    })];
  }

  const cargoProducer = selectBestCargoShipProducer(context.snapshot.planets);
  if (cargoProducer && !hasVisibleShipProposal(context, cargoProducer.planet, cargoProducer.shipType)) {
    return [createDemandOnlyShipyardCandidate({
      blockerFamily: 'LOGISTICS_DEADLOCK',
      blockerKey: `critical:phase2:transport-fallback:${toCoordinatesKey(cargoProducer.planet.coordinates)}:${cargoProducer.shipType}`,
      planet: cargoProducer.planet,
      shipType: cargoProducer.shipType,
      amount: 1,
      severity: target.severity,
      urgency: 74,
      requestedResources: resolveShipCost(cargoProducer.shipType, 1),
      reason: 'TRANSPORT',
      summary: `Critical transport fallback: produce ${cargoProducer.shipType} on ${cargoProducer.planet.name} for ${target.planet.name}.`,
      debug: {
        responseSubtype: 'TRANSPORT',
        targetPlanet: target.planet.name,
        totalShortage: target.totalShortage,
        localRecoveryTurns: roundToTwoDecimals(target.localRecoveryTurns)
      }
    })];
  }

  return [];
}

function evaluateCriticalRepairTarget(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): {
  planet: BotPlanetSnapshot;
  damageRatio: number;
  localRecoveryTurns: number;
  severity: number;
} | null {
  if (!isCriticalRepairTargetSafe(context, planet)) {
    return null;
  }

  if (!hasEmergencyInfrastructureDamage(planet.infrastructure, CRITICAL_REPAIR_DAMAGE_THRESHOLD_PERCENT)) {
    return null;
  }

  const localRecoveryTurns = estimateLocalRepairRecoveryTurns(planet);
  if (localRecoveryTurns <= CRITICAL_REPAIR_LOCAL_RECOVERY_TURNS) {
    return null;
  }

  const damageRatio = resolveEffectiveInfrastructureDamagePercent(planet.infrastructure);
  return {
    planet,
    damageRatio,
    localRecoveryTurns,
    severity: clampToHundred(Math.round(68 + Math.min(28, (damageRatio - CRITICAL_REPAIR_DAMAGE_THRESHOLD_PERCENT) * 1.1)))
  };
}

function evaluateCriticalTransportTarget(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): {
  planet: BotPlanetSnapshot;
  shortage: ResourceAmounts;
  totalShortage: number;
  localRecoveryTurns: number;
  severity: number;
} | null {
  if (planet.maturityStage !== 'BOOTSTRAP' && planet.maturityStage !== 'STABILIZING') {
    return null;
  }

  const shortage = resolveCriticalTransportShortage(context, planet);
  const totalShortage = getTotalResourceAmount(shortage);
  if (totalShortage <= 0 || totalShortage > MAX_CRITICAL_TRANSPORT_CARGO) {
    return null;
  }

  const localRecoveryTurns = estimateResourceRecoveryTurns(planet, shortage);
  if (localRecoveryTurns <= MAX_CRITICAL_TRANSPORT_LOCAL_RECOVERY_TURNS) {
    return null;
  }

  return {
    planet,
    shortage,
    totalShortage,
    localRecoveryTurns,
    severity: clampToHundred(Math.round(56 + Math.min(24, localRecoveryTurns * 2) + Math.min(16, totalShortage / 150)))
  };
}

function resolveEmergencySignals(context: BotSubsystemContext): EmergencySignals {
  const planets = context.snapshot.planets;
  return {
    needsSpyProbeCoverage: context.snapshot.empire.intelCandidates.some((entry) => entry.needsScan),
    needsCargoTransfer: hasCriticalCargoTransferProposal(context.priorProposals ?? []),
    needsRepairDroneTransfer: hasCriticalRepairTransferProposal(context.priorProposals ?? []),
    empireCargoCapacity: planets.reduce((sum, planet) => sum + resolveAvailableCargoCapacity(planet), 0),
    empireSpyProbeCount: planets.reduce((sum, planet) => sum + (planet.ships.installedCountByType[ShipType.SPY_PROBE] ?? 0), 0),
    empireRepairDroneCount: planets.reduce((sum, planet) => sum + (planet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0), 0)
  };
}

function hasCriticalCargoTransferProposal(priorProposals: BotProposal[]): boolean {
  return priorProposals.some((proposal) =>
    proposal.kind === 'FLEET_MISSION'
    && (
      proposal.requestPayload.missionType === FleetMissionType.TRANSPORT
      || proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
    )
  );
}

function hasCriticalRepairTransferProposal(priorProposals: BotProposal[]): boolean {
  return priorProposals.some((proposal) =>
    proposal.kind === 'FLEET_MISSION'
    && proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
    && Number(proposal.requestPayload.repairDroneAmount ?? 0) > 0
  );
}

function resolveStorageDeadlockProposal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): {
  proposal: BotProposal;
  resourceKey: ResourceKey;
  requestedAmount: number;
  capacity: number;
  ratio: number;
} | null {
  let best: {
    proposal: BotProposal;
    resourceKey: ResourceKey;
    requestedAmount: number;
    capacity: number;
    ratio: number;
  } | null = null;

  for (const proposal of context.priorProposals ?? []) {
    if (!sameCoordinates(proposal.targetCoordinates, planet.coordinates)) {
      continue;
    }
    if (proposal.kind !== 'BUILDING' && proposal.kind !== 'RESEARCH' && proposal.kind !== 'SHIPYARD') {
      continue;
    }

    for (const resourceKey of ['metal', 'crystal', 'deuterium'] as const) {
      const requestedAmount = Number(proposal.requestedResources?.[resourceKey] ?? 0);
      const capacity = planet.economy.storageCapacity[resourceKey];
      if (requestedAmount <= 0 || capacity <= 0) {
        continue;
      }

      const ratio = (requestedAmount * 1.5) / capacity;
      if (ratio <= 1) {
        continue;
      }

      if (!best || ratio > best.ratio) {
        best = {
          proposal,
          resourceKey,
          requestedAmount,
          capacity,
          ratio
        };
      }
    }
  }

  return best;
}

function evaluateIndustryChainLag(
  planet: BotPlanetSnapshot,
  buildingType: BuildingType,
  emergencySignals: EmergencySignals,
  context: BotSubsystemContext
): {
  buildingType: BuildingType;
  buildingEtc: number;
  averageOtherEtc: number;
  lagRatio: number;
  severity: number;
  directNeed: boolean;
} | null {
  if (!isCoreInfrastructureCandidateBuildableOrRecoverable(planet, buildingType)) {
    return null;
  }

  const buildingEtc = estimateNextBuildingEtc(planet, buildingType);
  const averageOtherEtc = averageIndustryEtcExcluding(planet, buildingType);
  const lagRatio = averageOtherEtc > 0 ? buildingEtc / averageOtherEtc : 0;
  const directNeed = hasDirectIndustryChainNeed(planet, buildingType, emergencySignals, context);
  const currentLevel = getBuildingLevel(planet, buildingType);

  if (!directNeed) {
    if (planet.defense.avgIndustryLevel < 6) {
      return null;
    }
    if (currentLevel <= 0 && buildingType !== BuildingType.NANITE_FACTORY) {
      return null;
    }
    if (
      buildingType === BuildingType.NANITE_FACTORY
      && (
        planet.defense.avgIndustryLevel < 7
        || planet.economy.roboticsLevel < 3
        || planet.economy.shipyardLevel < 3
      )
    ) {
      return null;
    }
  }

  if (!directNeed && lagRatio < 4) {
    return null;
  }

  const severity = clampToHundred(Math.round(
    directNeed
      ? 78 + Math.min(18, Math.max(0, lagRatio - 1) * 5)
      : 55 + Math.min(40, Math.max(0, lagRatio - 4) * 12)
  ));

  return {
    buildingType,
    buildingEtc,
    averageOtherEtc,
    lagRatio,
    severity,
    directNeed
  };
}

function hasDirectIndustryChainNeed(
  planet: BotPlanetSnapshot,
  buildingType: BuildingType,
  emergencySignals: EmergencySignals,
  context: BotSubsystemContext
): boolean {
  switch (buildingType) {
    case BuildingType.ROBOTICS_FACTORY:
      return getBuildingLevel(planet, BuildingType.ROBOTICS_FACTORY) <= 0
        && (
          planet.economy.energyGap > 0
          || hasVisibleSamePlanetProposal(context, planet, ['BUILDING'])
        );
    case BuildingType.SHIPYARD:
      return getBuildingLevel(planet, BuildingType.SHIPYARD) <= 0
        && (
          emergencySignals.needsSpyProbeCoverage
          || emergencySignals.needsCargoTransfer
          || selectHeavilyDamagedRepairTarget(context.snapshot.planets) !== null
        );
    case BuildingType.RESEARCH_LAB:
      return getBuildingLevel(planet, BuildingType.RESEARCH_LAB) <= 0
        && hasVisibleSamePlanetProposal(context, planet, ['RESEARCH']);
    case BuildingType.NANITE_FACTORY:
      return false;
    default:
      return false;
  }
}

function isCoreInfrastructureCandidateBuildableOrRecoverable(
  planet: BotPlanetSnapshot,
  buildingType: BuildingType
): boolean {
  const nextLevel = getBuildingLevel(planet, buildingType) + 1;
  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  if (!blueprint) {
    return false;
  }

  return snapshotHasBuildingRequirements(planet, blueprint, nextLevel)
    && snapshotHasBuildingTechnologyRequirements(planet, blueprint, nextLevel);
}

function selectBestEmergencyEnergyBuilding(planet: BotPlanetSnapshot): BuildingType | null {
  let best: { buildingType: BuildingType; score: number } | null = null;

  for (const buildingType of ENERGY_BUILDINGS) {
    const nextLevel = getBuildingLevel(planet, buildingType) + 1;
    const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
    if (
      !blueprint
      || !snapshotHasBuildingRequirements(planet, blueprint, nextLevel)
      || !snapshotHasBuildingTechnologyRequirements(planet, blueprint, nextLevel)
    ) {
      continue;
    }

    const currentOutput = resolveBuildingProductionValue(buildingType, nextLevel - 1);
    const nextOutput = resolveBuildingProductionValue(buildingType, nextLevel);
    const gain = Math.max(1, nextOutput - currentOutput);
    const cost = resolveBuildingCost(buildingType, nextLevel);
    const totalCost = Math.max(1, getTotalResourceAmount(cost ?? emptyResources()));
    const score = gain / totalCost;
    if (!best || score > best.score) {
      best = { buildingType, score };
    }
  }

  return best?.buildingType ?? null;
}

function selectBestCargoShipProducer(
  planets: BotPlanetSnapshot[]
): { planet: BotPlanetSnapshot; shipType: ShipType } | null {
  let best: { planet: BotPlanetSnapshot; shipType: ShipType; score: number } | null = null;

  for (const planet of planets) {
    for (const shipType of CARGO_SHIP_TYPES) {
      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      if (
        !blueprint
        || !snapshotHasShipBuildingRequirements(planet, blueprint)
        || !snapshotHasShipTechnologyRequirements(planet, blueprint)
      ) {
        continue;
      }

      const cargoCapacity = Math.max(1, blueprint.cargoCapacity ?? 0);
      const score = cargoCapacity * Math.max(1, planet.power.shipyardPower);
      if (!best || score > best.score) {
        best = { planet, shipType, score };
      }
    }
  }

  return best ? { planet: best.planet, shipType: best.shipType } : null;
}

function selectBestShipProducer(planets: BotPlanetSnapshot[], shipType: ShipType): BotPlanetSnapshot | null {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return null;
  }

  return [...planets]
    .filter((planet) =>
      snapshotHasShipBuildingRequirements(planet, blueprint)
      && snapshotHasShipTechnologyRequirements(planet, blueprint)
    )
    .sort((left, right) =>
      right.power.shipyardPower - left.power.shipyardPower
      || right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
      || left.name.localeCompare(right.name)
    )[0] ?? null;
}

function selectHeavilyDamagedRepairTarget(
  planets: BotPlanetSnapshot[]
): { planet: BotPlanetSnapshot; damageRatio: number; estimatedRepairTurns: number; severity: number } | null {
  const damaged = planets
    .map((planet) => {
      const damageRatio = resolveEffectiveInfrastructureDamagePercent(planet.infrastructure);
      const estimatedRepairTurns = planet.infrastructure.missingBuildingStructuralPoints
        / Math.max(1, planet.power.industryPower);
      if (!hasEmergencyInfrastructureDamage(planet.infrastructure, CRITICAL_REPAIR_DAMAGE_THRESHOLD_PERCENT)
        || estimatedRepairTurns <= CRITICAL_REPAIR_LOCAL_RECOVERY_TURNS) {
        return null;
      }

      return {
        planet,
        damageRatio,
        estimatedRepairTurns,
        severity: clampToHundred(Math.round(60 + Math.min(35, (damageRatio - 35) * 1.5)))
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) =>
      right.severity - left.severity || right.damageRatio - left.damageRatio || left.planet.name.localeCompare(right.planet.name)
    );

  return damaged[0] ?? null;
}

function selectSafeRepairDroneProducer(context: BotSubsystemContext): BotPlanetSnapshot | null {
  return [...context.snapshot.planets]
    .filter((planet) => isSafeMaturePlanet(context, planet))
    .filter((planet) => {
      const blueprint = SHIP_BLUEPRINTS.get(ShipType.REPAIR_DRONE);
      return !!blueprint
        && snapshotHasShipBuildingRequirements(planet, blueprint)
        && snapshotHasShipTechnologyRequirements(planet, blueprint);
    })
    .sort((left, right) =>
      right.power.shipyardPower - left.power.shipyardPower
      || right.defense.avgIndustryLevel - left.defense.avgIndustryLevel
      || left.name.localeCompare(right.name)
    )[0] ?? null;
}

function isSafeMaturePlanet(context: BotSubsystemContext, planet: BotPlanetSnapshot): boolean {
  const weightEntry = resolveWeightManagerPlanetEntry(context, planet.coordinates);
  if (weightEntry) {
    return weightEntry.maturePlanet && !weightEntry.inDangerPlanet && !weightEntry.constantlyAttackedPlanet;
  }

  return planet.defense.avgIndustryLevel > 4
    && !planet.defense.knownByWarFaction
    && planet.defense.recentHostileAttackCountLast20Turns < 3;
}

function resolveWeightManagerPlanetEntry(
  context: BotSubsystemContext,
  coordinates: BotMemoryCoordinates
): BotMemoryV2WeightManagerPlanetEntry | null {
  return context.memory.weightManager.planets.find((planet) => sameCoordinates(planet.coordinates, coordinates)) ?? null;
}

function selectCriticalCandidates(candidates: CriticalCandidate[]): CriticalCandidate[] {
  const selected: CriticalCandidate[] = [];
  const selectedPlanets = new Set<string>();

  const sorted = [...candidates].sort((left, right) =>
    compareBlockerFamilyPriority(left.blockerFamily, right.blockerFamily)
    || compareCriticalResponsePriority(left, right)
    || right.severity - left.severity
    || left.blockerKey.localeCompare(right.blockerKey)
  );

  for (const candidate of sorted) {
    if (selected.length >= 2) {
      break;
    }

    const planetKey = toCoordinatesKey(candidate.targetPlanet.coordinates);
    if (selectedPlanets.has(planetKey)) {
      continue;
    }

    selected.push(candidate);
    selectedPlanets.add(planetKey);
  }

  return selected;
}

function updateCriticalBlockerLedger(
  ledger: BotMemoryV2CriticalBlockerEntry[],
  detectedCandidates: CriticalCandidate[],
  selectedCandidates: CriticalCandidate[],
  currentTurn: number
): void {
  const existingByKey = new Map(ledger.map((entry) => [entry.blockerKey, entry]));
  const detectedByKey = new Map(detectedCandidates.map((entry) => [entry.blockerKey, entry]));
  const selectedKeys = new Set(selectedCandidates.map((entry) => entry.blockerKey));
  const nextLedger: BotMemoryV2CriticalBlockerEntry[] = [];

  for (const detected of detectedByKey.values()) {
    const existing = existingByKey.get(detected.blockerKey);
    const emitted = selectedKeys.has(detected.blockerKey);
    nextLedger.push({
      blockerKey: detected.blockerKey,
      blockerFamily: detected.blockerFamily,
      targetCoordinates: { ...detected.targetPlanet.coordinates },
      firstSeenTurn: existing?.firstSeenTurn ?? currentTurn,
      lastSeenTurn: currentTurn,
      severity: detected.severity,
      timesEmitted: emitted ? (existing?.timesEmitted ?? 0) + 1 : (existing?.timesEmitted ?? 0),
      lastProposalTurn: emitted ? currentTurn : (existing?.lastProposalTurn ?? null),
      resolvedTurn: null,
      active: true
    });
  }

  for (const existing of ledger) {
    if (detectedByKey.has(existing.blockerKey)) {
      continue;
    }

    nextLedger.push({
      ...existing,
      active: false,
      resolvedTurn: existing.resolvedTurn ?? currentTurn
    });
  }

  nextLedger.sort((left, right) =>
    Number(right.active) - Number(left.active)
    || right.lastSeenTurn - left.lastSeenTurn
    || left.blockerKey.localeCompare(right.blockerKey)
  );

  ledger.splice(0, ledger.length, ...nextLedger.slice(0, 400));
}

function createCriticalProposal(context: BotSubsystemContext, candidate: CriticalCandidate): BotProposal {
  return {
    proposalId: `${candidate.blockerKey}:${context.snapshot.turn}`,
    subsystemId: 'CRITICAL',
    kind: candidate.kind,
    status: 'PROPOSED',
    goalKey: candidate.blockerKey,
    dedupeKey: candidate.dedupeKey,
    summary: candidate.summary,
    planetId: candidate.proposalPlanet.planetId,
    targetCoordinates: { ...candidate.targetPlanet.coordinates },
    expectedValue: candidate.severity,
    urgency: candidate.urgency,
    risk: candidate.risk,
    confidence: candidate.confidence,
    requestedResources: { ...candidate.requestedResources },
    requestPayload: {
      blockerFamily: candidate.blockerFamily,
      ...candidate.requestPayload
    },
    blockers: [],
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      blockerFamily: candidate.blockerFamily,
      severity: candidate.severity,
      ...candidate.debug
    }
  };
}

function createBuildingCandidate(input: {
  blockerFamily: BotMemoryV2CriticalBlockerFamily;
  blockerKey: string;
  planet: BotPlanetSnapshot;
  buildingType: BuildingType;
  severity: number;
  urgency: number;
  requestedResources: ResourceAmounts;
  summary: string;
  debug: Record<string, string | number | boolean | null>;
}): CriticalCandidate {
  return {
    blockerKey: input.blockerKey,
    blockerFamily: input.blockerFamily,
    proposalPlanet: input.planet,
    targetPlanet: input.planet,
    kind: 'BUILDING',
    dedupeKey: `${input.blockerFamily}:${toCoordinatesKey(input.planet.coordinates)}:${input.buildingType}`,
    summary: input.summary,
    severity: input.severity,
    urgency: input.urgency,
    risk: 8,
    confidence: 76,
    requestedResources: input.requestedResources,
    requestPayload: {
      x: input.planet.coordinates.x,
      y: input.planet.coordinates.y,
      z: input.planet.coordinates.z,
      buildingType: input.buildingType
    },
    debug: {
      buildingType: input.buildingType,
      ...input.debug
    }
  };
}

function createShipyardCandidate(input: {
  blockerFamily: BotMemoryV2CriticalBlockerFamily;
  blockerKey: string;
  planet: BotPlanetSnapshot;
  shipType: ShipType;
  amount: number;
  severity: number;
  urgency: number;
  requestedResources: ResourceAmounts;
  summary: string;
  debug: Record<string, string | number | boolean | null>;
}): CriticalCandidate {
  return {
    blockerKey: input.blockerKey,
    blockerFamily: input.blockerFamily,
    proposalPlanet: input.planet,
    targetPlanet: input.planet,
    kind: 'SHIPYARD',
    dedupeKey: `${input.blockerFamily}:${toCoordinatesKey(input.planet.coordinates)}:${input.shipType}`,
    summary: input.summary,
    severity: input.severity,
    urgency: input.urgency,
    risk: 10,
    confidence: 72,
    requestedResources: input.requestedResources,
    requestPayload: {
      x: input.planet.coordinates.x,
      y: input.planet.coordinates.y,
      z: input.planet.coordinates.z,
      itemKind: 'ship',
      shipType: input.shipType,
      amount: input.amount
    },
    debug: {
      shipType: input.shipType,
      amount: input.amount,
      ...input.debug
    }
  };
}

function createDemandOnlyShipyardCandidate(input: {
  blockerFamily: BotMemoryV2CriticalBlockerFamily;
  blockerKey: string;
  planet: BotPlanetSnapshot;
  shipType: ShipType;
  amount: number;
  severity: number;
  urgency: number;
  requestedResources: ResourceAmounts;
  summary: string;
  reason: string;
  debug: Record<string, string | number | boolean | null>;
}): CriticalCandidate {
  const candidate = createShipyardCandidate({
    blockerFamily: input.blockerFamily,
    blockerKey: input.blockerKey,
    planet: input.planet,
    shipType: input.shipType,
    amount: input.amount,
    severity: input.severity,
    urgency: input.urgency,
    requestedResources: input.requestedResources,
    summary: input.summary,
    debug: {
      queueType: 'SHIP_NEED',
      reason: input.reason,
      ...input.debug
    }
  });

  candidate.requestPayload = {
    demandOnly: true,
    shipType: input.shipType,
    amount: input.amount,
    reason: input.reason
  };

  return candidate;
}

function createFleetMissionCandidate(input: {
  blockerFamily: BotMemoryV2CriticalBlockerFamily;
  responseSubtype: CriticalResponseSubtype;
  blockerKey: string;
  originPlanet: BotPlanetSnapshot;
  targetPlanet: BotPlanetSnapshot;
  missionType: FleetMissionType;
  ships: MissionShipSelection;
  cargo: ResourceAmounts;
  severity: number;
  urgency: number;
  risk: number;
  confidence: number;
  summary: string;
  debug: Record<string, string | number | boolean | null>;
}): CriticalCandidate {
  const repairDroneAmount = input.ships.reduce((sum, ship) =>
    ship.type === ShipType.REPAIR_DRONE ? sum + ship.undamagedAmount + ship.damagedAmount : sum, 0);

  return {
    blockerKey: input.blockerKey,
    blockerFamily: input.blockerFamily,
    proposalPlanet: input.originPlanet,
    targetPlanet: input.targetPlanet,
    kind: 'FLEET_MISSION',
    dedupeKey: `${input.blockerFamily}:${input.responseSubtype}:${toCoordinatesKey(input.originPlanet.coordinates)}:${toCoordinatesKey(input.targetPlanet.coordinates)}`,
    summary: input.summary,
    severity: input.severity,
    urgency: input.urgency,
    risk: input.risk,
    confidence: input.confidence,
    requestedResources: { ...input.cargo },
    requestPayload: {
      responseSubtype: input.responseSubtype,
      missionType: input.missionType,
      origin: { ...input.originPlanet.coordinates },
      target: { ...input.targetPlanet.coordinates },
      ships: input.ships.map((ship) => ({ ...ship })),
      carriedBombs: [],
      cargo: { ...input.cargo },
      repairDroneAmount,
      useJumpGate: false,
      bombardmentPriorities: null
    },
    debug: {
      responseSubtype: input.responseSubtype,
      originPlanet: input.originPlanet.name,
      targetPlanet: input.targetPlanet.name,
      missionType: input.missionType,
      repairDroneAmount,
      transportedResources: getTotalResourceAmount(input.cargo),
      ...input.debug
    }
  };
}

function hasQueuedBuilding(planet: BotPlanetSnapshot, buildingTypes: readonly BuildingType[]): boolean {
  return planet.queues.queuedBuildingTypes.some((buildingType) => buildingTypes.includes(buildingType));
}

function hasVisibleBuildingProposal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  buildingTypes: readonly BuildingType[]
): boolean {
  return (context.priorProposals ?? []).some((proposal) =>
    proposal.kind === 'BUILDING'
    && sameCoordinates(proposal.targetCoordinates, planet.coordinates)
    && buildingTypes.includes(proposal.requestPayload.buildingType as BuildingType)
  );
}

function hasVisibleShipProposal(context: BotSubsystemContext, planet: BotPlanetSnapshot, shipType: ShipType): boolean {
  return (context.priorProposals ?? []).some((proposal) =>
    proposal.kind === 'SHIPYARD'
    && sameCoordinates(proposal.targetCoordinates, planet.coordinates)
    && proposal.requestPayload.itemKind === 'ship'
    && proposal.requestPayload.shipType === shipType
  );
}

function hasVisibleCriticalMissionProposal(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot,
  missionTypes: FleetMissionType[]
): boolean {
  return (context.priorProposals ?? []).some((proposal) =>
    proposal.kind === 'FLEET_MISSION'
    && sameCoordinates(proposal.targetCoordinates, targetPlanet.coordinates)
    && missionTypes.includes(proposal.requestPayload.missionType as FleetMissionType)
  );
}

function hasVisibleSamePlanetProposal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  kinds: Array<'BUILDING' | 'RESEARCH' | 'SHIPYARD'>
): boolean {
  return (context.priorProposals ?? []).some((proposal) =>
    sameCoordinates(proposal.targetCoordinates, planet.coordinates)
    && kinds.includes(proposal.kind as 'BUILDING' | 'RESEARCH' | 'SHIPYARD')
  );
}

function isCriticalRepairTargetSafe(context: BotSubsystemContext, planet: BotPlanetSnapshot): boolean {
  const weightEntry = resolveWeightManagerPlanetEntry(context, planet.coordinates);
  const noDangerFlags = weightEntry
    ? !weightEntry.inDangerPlanet && !weightEntry.constantlyAttackedPlanet
    : !planet.defense.knownByWarFaction;
  return noDangerFlags
    && planet.defense.recentHostileAttackCountLast20Turns <= 0
    && planet.defense.recentHostileAttackStep <= 0;
}

function isCriticalRepairSourceSafe(context: BotSubsystemContext, planet: BotPlanetSnapshot): boolean {
  const damageRatio = resolveEffectiveInfrastructureDamagePercent(planet.infrastructure);
  const weightEntry = resolveWeightManagerPlanetEntry(context, planet.coordinates);
  const noDangerFlags = weightEntry
    ? !weightEntry.inDangerPlanet && !weightEntry.constantlyAttackedPlanet
    : !planet.defense.knownByWarFaction;
  return damageRatio < 10
    && noDangerFlags
    && planet.defense.recentHostileAttackCountLast20Turns <= 0
    && planet.defense.recentHostileAttackStep <= 0;
}

function estimateLocalRepairRecoveryTurns(planet: BotPlanetSnapshot): number {
  return planet.infrastructure.missingBuildingStructuralPoints / Math.max(1, planet.power.industryPower);
}

function selectCriticalRepairSource(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot
): {
  originPlanet: BotPlanetSnapshot;
  ships: MissionShipSelection;
  travelDistance: number;
  travelTurns: number;
} | null {
  return context.snapshot.planets
    .filter((originPlanet) => !sameCoordinates(originPlanet.coordinates, targetPlanet.coordinates))
    .filter((originPlanet) => isCriticalRepairSourceSafe(context, originPlanet))
    .map((originPlanet) => {
      const availableDrones = originPlanet.ships.undamagedCountByType[ShipType.REPAIR_DRONE] ?? 0;
      if (availableDrones <= 0) {
        return null;
      }

      const travelDistance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, travelDistance);
      if (travelTurns > MAX_CRITICAL_REPAIR_TURNS) {
        return null;
      }

      const ships: MissionShipSelection = [{
        type: ShipType.REPAIR_DRONE,
        undamagedAmount: Math.min(MAX_CRITICAL_REPAIR_SOURCE_DRONES, availableDrones),
        damagedAmount: 0
      }];
      if (!hasEnoughDeuteriumForShips(originPlanet, ships, travelDistance)) {
        return null;
      }

      return {
        originPlanet,
        ships,
        travelDistance,
        travelTurns
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) =>
      left.travelTurns - right.travelTurns
      || left.travelDistance - right.travelDistance
      || right.originPlanet.defense.avgIndustryLevel - left.originPlanet.defense.avgIndustryLevel
      || left.originPlanet.name.localeCompare(right.originPlanet.name)
    )[0] ?? null;
}

function selectCriticalArmamentDeliverySource(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot
): {
  originPlanet: BotPlanetSnapshot;
  ships: MissionShipSelection;
  cargo: ResourceAmounts;
  repairDroneAmount: number;
  travelDistance: number;
  travelTurns: number;
} | null {
  return context.snapshot.planets
    .filter((originPlanet) => !sameCoordinates(originPlanet.coordinates, targetPlanet.coordinates))
    .filter((originPlanet) => isCriticalRepairSourceSafe(context, originPlanet))
    .map((originPlanet) => {
      const availableDrones = originPlanet.ships.undamagedCountByType[ShipType.REPAIR_DRONE] ?? 0;
      if (availableDrones <= 0) {
        return null;
      }

      const repairDroneBlueprint = SHIP_BLUEPRINTS.get(ShipType.REPAIR_DRONE);
      const repairDroneSize = Math.max(1, repairDroneBlueprint?.size ?? 1);
      const repairDroneAmount = Math.min(MAX_CRITICAL_REPAIR_SOURCE_DRONES, availableDrones);
      const carrierSelection = selectUtilityHangarShips(originPlanet, repairDroneSize * repairDroneAmount);
      if (!carrierSelection) {
        return null;
      }

      const travelDistance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, travelDistance);
      if (travelTurns > MAX_CRITICAL_ARMAMENT_DELIVERY_TURNS) {
        return null;
      }

      const cargoCapacity = resolveSelectionCargoCapacity(carrierSelection);
      const resourceNeed = resolveEmergencyRepairResourceNeed(targetPlanet);
      const cargo = limitResourcesToCapacity(
        minResources(resolveRepairLogisticsSourceSurplus(originPlanet), resourceNeed),
        cargoCapacity
      );
      const ships: MissionShipSelection = [
        ...carrierSelection.map((ship) => ({ ...ship })),
        {
          type: ShipType.REPAIR_DRONE,
          undamagedAmount: repairDroneAmount,
          damagedAmount: 0
        }
      ];
      if (!hasEnoughDeuteriumForShips(originPlanet, ships, travelDistance)) {
        return null;
      }

      return {
        originPlanet,
        ships,
        cargo,
        repairDroneAmount,
        travelDistance,
        travelTurns
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) =>
      left.travelTurns - right.travelTurns
      || right.repairDroneAmount - left.repairDroneAmount
      || right.originPlanet.defense.avgIndustryLevel - left.originPlanet.defense.avgIndustryLevel
      || left.originPlanet.name.localeCompare(right.originPlanet.name)
    )[0] ?? null;
}

function selectCriticalTransportSource(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot,
  shortage: ResourceAmounts
): {
  originPlanet: BotPlanetSnapshot;
  ships: MissionShipSelection;
  cargo: ResourceAmounts;
  travelDistance: number;
  travelTurns: number;
} | null {
  const totalShortage = getTotalResourceAmount(shortage);
  return context.snapshot.planets
    .filter((originPlanet) => !sameCoordinates(originPlanet.coordinates, targetPlanet.coordinates))
    .filter((originPlanet) => isTransportSourcePlanetSafe(context, originPlanet))
    .map((originPlanet) => {
      const sourceSurplus = resolveSourceSurplus(originPlanet);
      const transferable = minResources(shortage, sourceSurplus);
      if (getTotalResourceAmount(transferable) < totalShortage) {
        return null;
      }

      const shipSelection = selectUtilityCargoShips(originPlanet, totalShortage);
      if (!shipSelection) {
        return null;
      }

      const travelDistance = calculateTravelDistance(originPlanet.coordinates, targetPlanet.coordinates);
      const travelTurns = resolveTravelTurns(originPlanet, travelDistance);
      if (travelTurns > MAX_CRITICAL_TRANSPORT_TURNS) {
        return null;
      }
      if (!hasEnoughDeuteriumForShips(originPlanet, shipSelection, travelDistance)) {
        return null;
      }

      return {
        originPlanet,
        ships: shipSelection,
        cargo: transferable,
        travelDistance,
        travelTurns
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((left, right) =>
      left.travelTurns - right.travelTurns
      || right.originPlanet.defense.avgIndustryLevel - left.originPlanet.defense.avgIndustryLevel
      || left.originPlanet.name.localeCompare(right.originPlanet.name)
    )[0] ?? null;
}

function selectCriticalRepairFallbackProducer(
  context: BotSubsystemContext,
  targetPlanet: BotPlanetSnapshot
): { planet: BotPlanetSnapshot; shipType: ShipType; reason: string } | null {
  const empireRepairDroneCount = context.snapshot.planets.reduce((sum, planet) =>
    sum + (planet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0), 0);

  if (empireRepairDroneCount <= 0) {
    const repairProducer = selectSafeRepairDroneProducer(context);
    return repairProducer
      ? { planet: repairProducer, shipType: ShipType.REPAIR_DRONE, reason: 'NO_REPAIR_DRONES_AVAILABLE' }
      : null;
  }

  if ((targetPlanet.ships.installedCountByType[ShipType.REPAIR_DRONE] ?? 0) <= 0) {
    for (const shipType of UTILITY_ARMAMENT_CARRIER_TYPES) {
      const producer = selectBestShipProducer(context.snapshot.planets, shipType);
      if (producer) {
        return { planet: producer, shipType, reason: 'NO_UTILITY_ARMAMENT_CARRIER' };
      }
    }
  }

  return null;
}

function resolveCriticalTransportShortage(context: BotSubsystemContext, planet: BotPlanetSnapshot): ResourceAmounts {
  let bestShortage = emptyResources();
  let bestTurnEstimate = 0;
  for (const proposal of context.priorProposals ?? []) {
    if (!sameCoordinates(proposal.targetCoordinates, planet.coordinates)) {
      continue;
    }
    if (proposal.kind !== 'BUILDING' && proposal.kind !== 'RESEARCH' && proposal.kind !== 'SHIPYARD') {
      continue;
    }

    const shortage = subtractResources(normalizeResources(proposal.requestedResources), planet.localResources);
    const totalShortage = getTotalResourceAmount(shortage);
    if (totalShortage <= 0) {
      continue;
    }

    const turnEstimate = estimateResourceRecoveryTurns(planet, shortage);
    if (
      turnEstimate > bestTurnEstimate
      || (turnEstimate === bestTurnEstimate && totalShortage > getTotalResourceAmount(bestShortage))
    ) {
      bestShortage = shortage;
      bestTurnEstimate = turnEstimate;
    }
  }

  return bestShortage;
}

function estimateResourceRecoveryTurns(planet: BotPlanetSnapshot, shortage: ResourceAmounts): number {
  return Math.max(
    estimateSingleResourceRecoveryTurns(shortage.metal, planet.economy.income.metal),
    estimateSingleResourceRecoveryTurns(shortage.crystal, planet.economy.income.crystal),
    estimateSingleResourceRecoveryTurns(shortage.deuterium, planet.economy.income.deuterium)
  );
}

function estimateSingleResourceRecoveryTurns(shortage: number, income: number): number {
  if (shortage <= 0) {
    return 0;
  }
  if (income <= 0) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.ceil(shortage / income);
}

function resolveEmergencyRepairResourceNeed(targetPlanet: BotPlanetSnapshot): ResourceAmounts {
  const reserve = {
    metal: Math.max(0, Math.floor(targetPlanet.economy.income.metal * 2)),
    crystal: Math.max(0, Math.floor(targetPlanet.economy.income.crystal * 2)),
    deuterium: Math.max(0, Math.floor(targetPlanet.economy.income.deuterium * 2))
  };
  return subtractResources(reserve, targetPlanet.localResources);
}

function isTransportSourcePlanetSafe(context: BotSubsystemContext, planet: BotPlanetSnapshot): boolean {
  const weightEntry = resolveWeightManagerPlanetEntry(context, planet.coordinates);
  const noDangerFlags = weightEntry
    ? !weightEntry.inDangerPlanet && !weightEntry.constantlyAttackedPlanet
    : !planet.defense.knownByWarFaction;
  return noDangerFlags
    && planet.defense.recentHostileAttackCountLast20Turns <= 1
    && getTotalResourceAmount(resolveSourceSurplus(planet)) > 0;
}

function selectUtilityCargoShips(
  planet: BotPlanetSnapshot,
  requiredCargo: number
): MissionShipSelection | null {
  if (requiredCargo <= 0) {
    return [];
  }

  const candidates = UTILITY_TRANSPORT_SHIP_TYPES
    .map((shipType) => ({
      shipType,
      amount: planet.ships.undamagedCountByType[shipType] ?? 0,
      blueprint: SHIP_BLUEPRINTS.get(shipType) ?? null
    }))
    .filter((entry) =>
      entry.amount > 0
      && !!entry.blueprint
      && (entry.blueprint.cargoCapacity ?? 0) > 0
    )
    .sort((left, right) =>
      (right.blueprint?.cargoCapacity ?? 0) - (left.blueprint?.cargoCapacity ?? 0)
    );

  let remainingCargo = requiredCargo;
  const selection: MissionShipSelection = [];
  for (const candidate of candidates) {
    if (remainingCargo <= 0) {
      break;
    }

    const cargoCapacity = candidate.blueprint?.cargoCapacity ?? 0;
    const amount = Math.min(candidate.amount, Math.max(1, Math.ceil(remainingCargo / Math.max(1, cargoCapacity))));
    selection.push({
      type: candidate.shipType,
      undamagedAmount: amount,
      damagedAmount: 0
    });
    remainingCargo -= cargoCapacity * amount;
  }

  return remainingCargo <= 0 ? selection : null;
}

function selectUtilityHangarShips(
  planet: BotPlanetSnapshot,
  requiredHangar: number
): MissionShipSelection | null {
  if (requiredHangar <= 0) {
    return [];
  }

  const candidates = UTILITY_ARMAMENT_CARRIER_TYPES
    .map((shipType) => ({
      shipType,
      amount: planet.ships.undamagedCountByType[shipType] ?? 0,
      blueprint: SHIP_BLUEPRINTS.get(shipType) ?? null
    }))
    .filter((entry) =>
      entry.amount > 0
      && !!entry.blueprint
      && (entry.blueprint.hangarCapacity ?? 0) > 0
    )
    .sort((left, right) =>
      (right.blueprint?.hangarCapacity ?? 0) - (left.blueprint?.hangarCapacity ?? 0)
    );

  let remainingHangar = requiredHangar;
  const selection: MissionShipSelection = [];
  for (const candidate of candidates) {
    if (remainingHangar <= 0) {
      break;
    }

    const hangarCapacity = candidate.blueprint?.hangarCapacity ?? 0;
    const amount = Math.min(candidate.amount, Math.max(1, Math.ceil(remainingHangar / Math.max(1, hangarCapacity))));
    selection.push({
      type: candidate.shipType,
      undamagedAmount: amount,
      damagedAmount: 0
    });
    remainingHangar -= hangarCapacity * amount;
  }

  return remainingHangar <= 0 ? selection : null;
}


function resolveBuildingCost(buildingType: BuildingType, nextLevel: number): ResourceAmounts | null {
  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  return blueprint ? normalizeResources(blueprint.getCostForLevel(nextLevel)) : null;
}

function resolveShipCost(shipType: ShipType, amount: number): ResourceAmounts {
  const blueprint = SHIP_BLUEPRINTS.get(shipType);
  if (!blueprint) {
    return emptyResources();
  }

  return multiplyResources(normalizeResources(blueprint.cost), amount);
}

function estimateNextBuildingEtc(planet: BotPlanetSnapshot, buildingType: BuildingType): number {
  const nextLevel = getBuildingLevel(planet, buildingType) + 1;
  const cost = resolveBuildingCost(buildingType, nextLevel);
  if (!cost) {
    return Number.POSITIVE_INFINITY;
  }

  const throughput = Math.max(1, planet.power.industryPower);
  return planet.power.buildingQueueRemainingEtc + Math.ceil(getTotalResourceAmount(cost) / throughput);
}

function averageIndustryEtcExcluding(planet: BotPlanetSnapshot, excludedBuildingType: BuildingType): number {
  const entries = INDUSTRY_ETC_BUILDINGS
    .filter((buildingType) => buildingType !== excludedBuildingType)
    .map((buildingType) => estimateNextBuildingEtc(planet, buildingType))
    .filter((entry) => Number.isFinite(entry) && entry > 0);

  if (entries.length <= 0) {
    return 0;
  }

  return entries.reduce((sum, entry) => sum + entry, 0) / entries.length;
}

function resolveAvailableCargoCapacity(planet: BotPlanetSnapshot): number {
  return Object.entries(planet.ships.installedCountByType)
    .reduce((sum, [shipTypeKey, amount]) => {
      const shipType = shipTypeKey as ShipType;
      const blueprint = SHIP_BLUEPRINTS.get(shipType);
      return sum + ((blueprint?.cargoCapacity ?? 0) * Math.max(0, Number(amount ?? 0)));
    }, 0);
}

function resolveSelectionCargoCapacity(ships: MissionShipSelection): number {
  return ships.reduce((total, ship) =>
    total + ((SHIP_BLUEPRINTS.get(ship.type)?.cargoCapacity ?? 0) * (ship.undamagedAmount + ship.damagedAmount)), 0);
}

function hasEnoughDeuteriumForShips(
  originPlanet: BotPlanetSnapshot,
  ships: MissionShipSelection,
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

function resolveTravelTurns(originPlanet: BotPlanetSnapshot | null, distance: number): number {
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

function resolveBuildingProductionValue(buildingType: BuildingType, level: number): number {
  if (level <= 0) {
    return 0;
  }

  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  const value = blueprint?.production1[level - 1] ?? 0;
  return Number.isFinite(value) ? value : 0;
}

function snapshotHasBuildingRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof BUILDING_BLUEPRINTS.get>>,
  nextLevel: number
): boolean {
  return blueprint.buildingRequirements.every((requirement) =>
    getBuildingLevel(planet, requirement.building) >= Math.ceil(nextLevel * requirement.level)
  );
}

function snapshotHasBuildingTechnologyRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof BUILDING_BLUEPRINTS.get>>,
  nextLevel: number
): boolean {
  return blueprint.techRequirements.every((requirement) =>
    getTechnologyLevel(planet, requirement.tech) >= Math.ceil(nextLevel * requirement.level)
  );
}

function snapshotHasShipBuildingRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof SHIP_BLUEPRINTS.get>>
): boolean {
  return blueprint.buildingRequirements.every((requirement) =>
    getBuildingLevel(planet, requirement.building) >= Math.ceil(requirement.level)
  );
}

function snapshotHasShipTechnologyRequirements(
  planet: BotPlanetSnapshot,
  blueprint: NonNullable<ReturnType<typeof SHIP_BLUEPRINTS.get>>
): boolean {
  return blueprint.techRequirements.every((requirement) =>
    getTechnologyLevel(planet, requirement.tech) >= Math.ceil(requirement.level)
  );
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

function countCandidatesByFamily(
  candidates: CriticalCandidate[],
  blockerFamily: BotMemoryV2CriticalBlockerFamily
): number {
  return candidates.filter((candidate) => candidate.blockerFamily === blockerFamily).length;
}

function compareBlockerFamilyPriority(
  left: BotMemoryV2CriticalBlockerFamily,
  right: BotMemoryV2CriticalBlockerFamily
): number {
  return BLOCKER_FAMILY_PRIORITY.indexOf(left) - BLOCKER_FAMILY_PRIORITY.indexOf(right);
}

function compareCriticalResponsePriority(left: CriticalCandidate, right: CriticalCandidate): number {
  const leftSubtype = left.requestPayload.responseSubtype as CriticalResponseSubtype | undefined;
  const rightSubtype = right.requestPayload.responseSubtype as CriticalResponseSubtype | undefined;
  const priority = ['REPAIR', 'ARMAMENT_DELIVERY', 'TRANSPORT'] as const;
  const leftIndex = leftSubtype ? priority.indexOf(leftSubtype) : Number.MAX_SAFE_INTEGER;
  const rightIndex = rightSubtype ? priority.indexOf(rightSubtype) : Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex;
}

function sameCoordinates(
  left: { x: number; y: number; z: number } | null | undefined,
  right: { x: number; y: number; z: number } | null | undefined
): boolean {
  return !!left && !!right && left.x === right.x && left.y === right.y && left.z === right.z;
}

function toCoordinatesKey(coordinates: { x: number; y: number; z: number }): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function dedupeCandidatesByBlockerKey(candidates: CriticalCandidate[]): CriticalCandidate[] {
  const byKey = new Map<string, CriticalCandidate>();
  for (const candidate of candidates) {
    const existing = byKey.get(candidate.blockerKey);
    if (!existing || candidate.severity > existing.severity) {
      byKey.set(candidate.blockerKey, candidate);
    }
  }

  return Array.from(byKey.values());
}

function normalizeResources(resources: { metal: number; crystal: number; deuterium: number }): ResourceAmounts {
  return {
    metal: Math.max(0, Math.floor(resources.metal)),
    crystal: Math.max(0, Math.floor(resources.crystal)),
    deuterium: Math.max(0, Math.floor(resources.deuterium))
  };
}

function multiplyResources(resources: ResourceAmounts, multiplier: number): ResourceAmounts {
  return {
    metal: Math.max(0, Math.floor(resources.metal * multiplier)),
    crystal: Math.max(0, Math.floor(resources.crystal * multiplier)),
    deuterium: Math.max(0, Math.floor(resources.deuterium * multiplier))
  };
}

function subtractResources(left: ResourceAmounts, right: ResourceAmounts): ResourceAmounts {
  return {
    metal: Math.max(0, left.metal - right.metal),
    crystal: Math.max(0, left.crystal - right.crystal),
    deuterium: Math.max(0, left.deuterium - right.deuterium)
  };
}

function minResources(left: ResourceAmounts, right: ResourceAmounts): ResourceAmounts {
  return {
    metal: Math.min(left.metal, right.metal),
    crystal: Math.min(left.crystal, right.crystal),
    deuterium: Math.min(left.deuterium, right.deuterium)
  };
}

function limitResourcesToCapacity(resources: ResourceAmounts, capacity: number): ResourceAmounts {
  if (capacity <= 0) {
    return emptyResources();
  }

  let remaining = Math.max(0, Math.floor(capacity));
  const result = emptyResources();
  for (const resourceKey of ['metal', 'crystal', 'deuterium'] as const) {
    const amount = Math.min(resources[resourceKey], remaining);
    result[resourceKey] = amount;
    remaining -= amount;
  }

  return result;
}

function resolveSourceSurplus(planet: BotPlanetSnapshot): ResourceAmounts {
  const reserveFloor = {
    metal: Math.max(planet.economy.income.metal * 3, Math.floor(planet.economy.storageCapacity.metal * 0.25)),
    crystal: Math.max(planet.economy.income.crystal * 3, Math.floor(planet.economy.storageCapacity.crystal * 0.25)),
    deuterium: Math.max(planet.economy.income.deuterium * 3, Math.floor(planet.economy.storageCapacity.deuterium * 0.25))
  };
  const effectiveStored = {
    metal: planet.localResources.metal * Math.max(0.1, planet.modifiers.metal),
    crystal: planet.localResources.crystal * Math.max(0.1, planet.modifiers.crystal),
    deuterium: planet.localResources.deuterium * Math.max(0.1, planet.modifiers.deuterium)
  };
  const maxEffective = Math.max(effectiveStored.metal, effectiveStored.crystal, effectiveStored.deuterium);
  const averageEffective = (effectiveStored.metal + effectiveStored.crystal + effectiveStored.deuterium) / 3;

  return {
    metal: effectiveStored.metal >= maxEffective && effectiveStored.metal > averageEffective
      ? Math.max(0, planet.localResources.metal - reserveFloor.metal)
      : 0,
    crystal: effectiveStored.crystal >= maxEffective && effectiveStored.crystal > averageEffective
      ? Math.max(0, planet.localResources.crystal - reserveFloor.crystal)
      : 0,
    deuterium: effectiveStored.deuterium >= maxEffective && effectiveStored.deuterium > averageEffective
      ? Math.max(0, planet.localResources.deuterium - reserveFloor.deuterium)
      : 0
  };
}

function resolveRepairLogisticsSourceSurplus(planet: BotPlanetSnapshot): ResourceAmounts {
  const reserveFloor = {
    metal: Math.max(planet.economy.income.metal * 3, Math.floor(planet.economy.storageCapacity.metal * 0.25)),
    crystal: Math.max(planet.economy.income.crystal * 3, Math.floor(planet.economy.storageCapacity.crystal * 0.25)),
    deuterium: Math.max(planet.economy.income.deuterium * 3, Math.floor(planet.economy.storageCapacity.deuterium * 0.25))
  };

  return {
    metal: Math.max(0, planet.localResources.metal - reserveFloor.metal),
    crystal: Math.max(0, planet.localResources.crystal - reserveFloor.crystal),
    deuterium: Math.max(0, planet.localResources.deuterium - reserveFloor.deuterium)
  };
}

function getTotalResourceAmount(resources: ResourceAmounts): number {
  return Math.max(0, resources.metal) + Math.max(0, resources.crystal) + Math.max(0, resources.deuterium);
}

export const __criticalTestInternals = {
  resolveSourceSurplus,
  resolveRepairLogisticsSourceSurplus
};

function emptyResources(): ResourceAmounts {
  return {
    metal: 0,
    crystal: 0,
    deuterium: 0
  };
}

function clampToHundred(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
