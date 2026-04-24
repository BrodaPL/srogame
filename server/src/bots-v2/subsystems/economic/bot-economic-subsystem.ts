import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import {
  BUILDING_BLUEPRINTS
} from '../../../game-commands/command-helpers.js';
import type {
  BotPlanetSnapshot,
  BotProposal,
  BotSubsystem,
  BotSubsystemContext,
  BotSubsystemResult
} from '../../bot-v2-types.ts';

export class BotEconomicSubsystem implements BotSubsystem {
  public readonly subsystemId = 'ECONOMIC' as const;

  public generate(context: BotSubsystemContext): BotSubsystemResult {
    const proposals: BotProposal[] = [];
    let blockedPlanetCount = 0;

    for (const planet of context.snapshot.planets) {
      const planetProposals = buildPlanetEconomicProposals(context, planet);
      if (planetProposals.length === 0) {
        blockedPlanetCount += 1;
      }
      proposals.push(...planetProposals);
    }

    return {
      subsystemId: this.subsystemId,
      proposals,
      debug: {
        blockedPlanetCount,
        planetCount: context.snapshot.planets.length
      }
    };
  }
}

function buildPlanetEconomicProposals(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot
): BotProposal[] {
  if (planet.blockers.queueSaturated) {
    return [];
  }

  const proposals: BotProposal[] = [];
  const queuedBuildingTypes = new Set(planet.queues.queuedBuildingTypes);

  if (planet.blockers.energyStarved && !queuedBuildingTypes.has(BuildingType.SOLAR_WIND_GEOTHERMAL)) {
    proposals.push(createBuildingProposal(
      context,
      planet,
      BuildingType.SOLAR_WIND_GEOTHERMAL,
      'stabilize_energy',
      95,
      100,
      5,
      90,
      {
        reason: 'energy_gap',
        energyGap: planet.economy.energyGap
      }
    ));
  }

  const highestStoragePressure = Math.max(
    planet.economy.storagePressure.metal,
    planet.economy.storagePressure.crystal,
    planet.economy.storagePressure.deuterium
  );
  if (highestStoragePressure >= 0.8) {
    const storageType = resolveStorageTypeForPressure(planet);
    if (!queuedBuildingTypes.has(storageType)) {
      proposals.push(createBuildingProposal(
        context,
        planet,
        storageType,
        'relieve_storage_pressure',
        80,
        Math.round(highestStoragePressure * 100),
        4,
        88,
        {
          reason: 'storage_pressure',
          storagePressure: roundToTwoDecimals(highestStoragePressure)
        }
      ));
    }
  }

  if (
    planet.blockers.missingRoboticsForGrowth
    && !queuedBuildingTypes.has(BuildingType.ROBOTICS_FACTORY)
  ) {
    proposals.push(createBuildingProposal(
      context,
      planet,
      BuildingType.ROBOTICS_FACTORY,
      'improve_industry_throughput',
      62,
      70,
      8,
      84,
      {
        reason: 'missing_robotics',
        averageMineLevel: roundToTwoDecimals(planet.economy.averageMineLevel)
      }
    ));
  }

  const mineType = resolveMinePriority(planet);
  if (!queuedBuildingTypes.has(mineType)) {
    proposals.push(createBuildingProposal(
      context,
      planet,
      mineType,
      'improve_economy_output',
      55,
      52,
      6,
      86,
      {
        reason: 'lowest_mine',
        selectedMine: mineType
      }
    ));
  }

  return proposals
    .sort((left, right) =>
      right.expectedValue - left.expectedValue || left.summary.localeCompare(right.summary)
    )
    .slice(0, 3);
}

function createBuildingProposal(
  context: BotSubsystemContext,
  planet: BotPlanetSnapshot,
  buildingType: BuildingType,
  goalSuffix: string,
  expectedValue: number,
  urgency: number,
  risk: number,
  confidence: number,
  debug: Record<string, string | number | boolean | null>
): BotProposal {
  const nextLevel = resolveNextLevel(planet, buildingType);
  const blueprint = BUILDING_BLUEPRINTS.get(buildingType);
  const cost = blueprint?.getCostForLevel(nextLevel) ?? { metal: 0, crystal: 0, deuterium: 0 };
  const blockers: string[] = [];

  if (planet.localResources.metal < cost.metal) {
    blockers.push('INSUFFICIENT_LOCAL_METAL');
  }
  if (planet.localResources.crystal < cost.crystal) {
    blockers.push('INSUFFICIENT_LOCAL_CRYSTAL');
  }
  if (planet.localResources.deuterium < cost.deuterium) {
    blockers.push('INSUFFICIENT_LOCAL_DEUTERIUM');
  }

  return {
    proposalId: `economic:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${buildingType}:${nextLevel}:${context.snapshot.turn}`,
    subsystemId: 'ECONOMIC',
    kind: 'BUILDING',
    status: blockers.length > 0 ? 'BLOCKED' : 'PROPOSED',
    goalKey: `economic:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${goalSuffix}`,
    dedupeKey: `economic:building:${planet.coordinates.x}:${planet.coordinates.y}:${planet.coordinates.z}:${buildingType}`,
    summary: `Queue ${buildingType} on ${planet.name}.`,
    planetId: planet.planetId,
    targetCoordinates: { ...planet.coordinates },
    expectedValue,
    urgency,
    risk,
    confidence,
    requestedResources: {
      metal: Math.max(0, Math.floor(cost.metal)),
      crystal: Math.max(0, Math.floor(cost.crystal)),
      deuterium: Math.max(0, Math.floor(cost.deuterium))
    },
    requestPayload: {
      x: planet.coordinates.x,
      y: planet.coordinates.y,
      z: planet.coordinates.z,
      buildingType
    },
    blockers,
    expiresOnTurn: context.snapshot.turn + 1,
    debug: {
      ...debug,
      nextLevel,
      buildingType
    }
  };
}

function resolveStorageTypeForPressure(planet: BotPlanetSnapshot): BuildingType {
  if (
    planet.economy.storagePressure.metal >= planet.economy.storagePressure.crystal
    && planet.economy.storagePressure.metal >= planet.economy.storagePressure.deuterium
  ) {
    return BuildingType.METAL_STORAGE;
  }
  if (planet.economy.storagePressure.crystal >= planet.economy.storagePressure.deuterium) {
    return BuildingType.CRYSTAL_STORAGE;
  }
  return BuildingType.DEUTERIUM_TANK;
}

function resolveMinePriority(planet: BotPlanetSnapshot): BuildingType {
  const mineLevels = [
    { type: BuildingType.METAL_MINE, level: planet.economy.metalMineLevel },
    { type: BuildingType.CRYSTAL_MINE, level: planet.economy.crystalMineLevel },
    { type: BuildingType.DEUTERIUM_SYNTHESIZER, level: planet.economy.deuteriumSynthesizerLevel }
  ];

  return mineLevels.sort((left, right) => left.level - right.level || left.type.localeCompare(right.type))[0]?.type
    ?? BuildingType.METAL_MINE;
}

function resolveNextLevel(planet: BotPlanetSnapshot, buildingType: BuildingType): number {
  switch (buildingType) {
    case BuildingType.METAL_MINE:
      return planet.economy.metalMineLevel + 1;
    case BuildingType.CRYSTAL_MINE:
      return planet.economy.crystalMineLevel + 1;
    case BuildingType.DEUTERIUM_SYNTHESIZER:
      return planet.economy.deuteriumSynthesizerLevel + 1;
    case BuildingType.SOLAR_WIND_GEOTHERMAL:
      return planet.economy.solarLevel + 1;
    case BuildingType.NUCLEAR_PLANT:
      return planet.economy.nuclearLevel + 1;
    case BuildingType.FUSION_REACTOR:
      return planet.economy.fusionLevel + 1;
    case BuildingType.METAL_STORAGE:
      return planet.economy.metalStorageLevel + 1;
    case BuildingType.CRYSTAL_STORAGE:
      return planet.economy.crystalStorageLevel + 1;
    case BuildingType.DEUTERIUM_TANK:
      return planet.economy.deuteriumTankLevel + 1;
    case BuildingType.ROBOTICS_FACTORY:
      return planet.economy.roboticsLevel + 1;
    case BuildingType.NANITE_FACTORY:
      return planet.economy.naniteLevel + 1;
    default:
      return 1;
  }
}

function roundToTwoDecimals(value: number): number {
  return Math.round(value * 100) / 100;
}
