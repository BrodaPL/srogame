import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import type { BotProposal } from '../../bot-v2-types.ts';
import { ManyShips } from '../../../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { __criticalTestInternals, BotCriticalSubsystem } from './bot-critical-subsystem.js';

describe('BotCriticalSubsystem', () => {
  it('emits an emergency energy proposal and records the blocker in the ledger', () => {
    const { galaxy, bot, homePlanet } = createCriticalWorld();
    configureStablePlanet(homePlanet, 7);
    homePlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);

    const { result, memory } = runCriticalSubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.requestPayload.blockerFamily === 'ENERGY_DEADLOCK'
      && [
        BuildingType.SOLAR_WIND_GEOTHERMAL,
        BuildingType.NUCLEAR_PLANT,
        BuildingType.FUSION_REACTOR
      ].includes(proposal.requestPayload.buildingType as BuildingType)
    )).toBe(true);
    expect(memory.critical.blockerLedger.some((entry) =>
      entry.blockerFamily === 'ENERGY_DEADLOCK'
      && entry.active
      && entry.timesEmitted >= 1
    )).toBe(true);
  });

  it('does not duplicate an energy deadlock when a visible energy fix proposal already exists', () => {
    const { galaxy, bot, homePlanet } = createCriticalWorld();
    configureStablePlanet(homePlanet, 7);
    homePlanet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 1);

    const priorProposal = createPriorProposal({
      subsystemId: 'ECONOMIC',
      kind: 'BUILDING',
      target: homePlanet,
      requestedResources: { metal: 100, crystal: 100, deuterium: 100 },
      requestPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.SOLAR_WIND_GEOTHERMAL }
    });

    const { result } = runCriticalSubsystem(galaxy, bot, createDefaultBotMemoryV2(), [priorProposal]);

    expect(result.proposals.some((proposal) =>
      proposal.requestPayload.blockerFamily === 'ENERGY_DEADLOCK'
      && proposal.targetCoordinates?.x === homePlanet.basicInfo.solarSystem.coordinates.x
      && proposal.targetCoordinates?.y === homePlanet.basicInfo.solarSystem.coordinates.y
      && proposal.targetCoordinates?.z === homePlanet.basicInfo.order
    )).toBe(false);
  });

  it('emits the relevant storage building when a visible request exceeds current storage envelope', () => {
    const { galaxy, bot, homePlanet } = createCriticalWorld();
    configureStablePlanet(homePlanet, 5);
    homePlanet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
    homePlanet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
    homePlanet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);

    const priorProposal = createPriorProposal({
      subsystemId: 'WARFARE',
      kind: 'SHIPYARD',
      target: homePlanet,
      requestedResources: { metal: 50000, crystal: 0, deuterium: 0 },
      requestPayload: { x: 0, y: 0, z: 1, itemKind: 'ship', shipType: ShipType.TRANSPORTER, amount: 1 }
    });

    const { result } = runCriticalSubsystem(galaxy, bot, createDefaultBotMemoryV2(), [priorProposal]);
    const storageProposal = result.proposals.find((proposal) =>
      proposal.requestPayload.blockerFamily === 'STORAGE_DEADLOCK'
    );

    expect(storageProposal?.requestPayload.buildingType).toBe(BuildingType.METAL_STORAGE);
  });

  it('promotes shipyard recovery through industry-chain deadlock when intel is blocked and no shipyard exists', () => {
    const { galaxy, bot, homePlanet, supportPlanet } = createCriticalWorld();
    configureStablePlanet(homePlanet, 6);
    configureStablePlanet(supportPlanet, 6);
    homePlanet.setBuildingLevel(BuildingType.SHIPYARD, 0);
    supportPlanet.setBuildingLevel(BuildingType.SHIPYARD, 0);

    const { result } = runCriticalSubsystem(galaxy, bot);
    const shipyardRecovery = result.proposals.find((proposal) =>
      proposal.requestPayload.blockerFamily === 'INDUSTRY_CHAIN_DEADLOCK'
      && proposal.requestPayload.buildingType === BuildingType.SHIPYARD
    );

    expect(shipyardRecovery).toBeDefined();
  });

  it('emits cargo ship production when a logistics transfer is proposed but no inactive cargo ships exist', () => {
    const { galaxy, bot, homePlanet } = createCriticalWorld();
    configureStablePlanet(homePlanet, 6);

    const priorProposal = createPriorProposal({
      subsystemId: 'STRATEGIC_DEVELOPMENT',
      kind: 'FLEET_MISSION',
      target: homePlanet,
      requestedResources: { metal: 0, crystal: 0, deuterium: 0 },
      requestPayload: {
        missionType: FleetMissionType.TRANSPORT,
        origin: { x: 0, y: 0, z: 1 },
        target: { x: 1, y: 0, z: 1 },
        cargo: { metal: 500, crystal: 0, deuterium: 0 }
      }
    });

    const { result } = runCriticalSubsystem(galaxy, bot, createDefaultBotMemoryV2(), [priorProposal]);
    const logisticsProposal = result.proposals.find((proposal) =>
      proposal.requestPayload.blockerFamily === 'LOGISTICS_DEADLOCK'
      && proposal.kind === 'SHIPYARD'
    );

    expect([
      ShipType.TRANSPORTER,
      ShipType.MASS_HAULER,
      ShipType.CARGO_SUPPORT
    ]).toContain(logisticsProposal?.requestPayload.shipType as ShipType);
  });

  it('emits spy probe production when intel candidates need coverage and no probes exist', () => {
    const { galaxy, bot, homePlanet } = createCriticalWorld();
    configureStablePlanet(homePlanet, 6);

    const { result } = runCriticalSubsystem(galaxy, bot);
    const intelProposal = result.proposals.find((proposal) =>
      proposal.requestPayload.blockerFamily === 'INTEL_DEADLOCK'
      && proposal.requestPayload.shipType === ShipType.SPY_PROBE
    );

    expect(intelProposal?.kind).toBe('SHIPYARD');
  });

  it('emits a REPAIR fleet mission when a safe owned helper with repair drones exists even without local target drones', () => {
    const { galaxy, bot, homePlanet, supportPlanet } = createCriticalWorld();
    configureRepairEmergencyPlanet(homePlanet);
    configureStablePlanet(supportPlanet, 6);
    homePlanet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 3);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    applyHeavyStructuralDamage(homePlanet);

    const { result } = runCriticalSubsystem(galaxy, bot);
    const repairProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.REPAIR
    );

    expect(repairProposal).toBeDefined();
    expect(repairProposal?.requestPayload.responseSubtype).toBe('REPAIR');
  });

  it('prefers REPAIR over ARMAMENT_DELIVERY when both helper drones and a carrier are available', () => {
    const { galaxy, bot, homePlanet, supportPlanet } = createCriticalWorld();
    configureRepairEmergencyPlanet(homePlanet);
    configureStablePlanet(supportPlanet, 6);
    homePlanet.setBuildingLevel(BuildingType.SHIPYARD, 1);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.REPAIR_DRONE, 3);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CARRIER, 1);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    supportPlanet.rBDSFTQ.resources.metal = 12000;
    supportPlanet.rBDSFTQ.resources.crystal = 12000;
    supportPlanet.rBDSFTQ.resources.deuterium = 12000;
    applyHeavyStructuralDamage(homePlanet);

    const { result } = runCriticalSubsystem(galaxy, bot);
    const repairProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.REPAIR
    );
    const armamentProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ARMAMENT_DELIVERY
    );

    expect(repairProposal).toBeDefined();
    expect(armamentProposal).toBeUndefined();
  });

  it('keeps dominant-only surplus for TRANSPORT but allows balanced surplus for repair logistics', () => {
    const { galaxy, bot, supportPlanet } = createCriticalWorld();
    configureStablePlanet(supportPlanet, 6);
    supportPlanet.rBDSFTQ.resources.metal = 12000;
    supportPlanet.rBDSFTQ.resources.crystal = 12000;
    supportPlanet.rBDSFTQ.resources.deuterium = 12000;

    const balancedSnapshot = buildBotWorldSnapshot(galaxy, bot, {
      enabled: true,
      shadowMode: true,
      enabledSubsystems: {
        economic: false,
        defensive: false,
        warfare: false,
        critical: true,
        strategicDevelopment: false,
        strategicMilitary: false,
        strategicDiplomatic: false,
        weightManager: false
      },
      allowSupervisorAcceptance: false,
      allowExecution: false
    }).planets[1]!;
    const dominantSurplus = __criticalTestInternals.resolveSourceSurplus(balancedSnapshot);
    const repairSurplus = __criticalTestInternals.resolveRepairLogisticsSourceSurplus(balancedSnapshot);

    expect(dominantSurplus.metal + dominantSurplus.crystal + dominantSurplus.deuterium).toBe(0);
    expect(repairSurplus.metal).toBeGreaterThan(0);
    expect(repairSurplus.crystal).toBeGreaterThan(0);
    expect(repairSurplus.deuterium).toBeGreaterThan(0);
  });

  it('emits a TRANSPORT fleet mission for an immature planet that is really blocked on immediate resources', () => {
    const { galaxy, bot, homePlanet, supportPlanet } = createCriticalWorld();
    configureImmaturePlanet(homePlanet);
    configureStablePlanet(supportPlanet, 6);
    supportPlanet.rBDSFTQ.resources.metal = 12000;
    supportPlanet.rBDSFTQ.resources.crystal = 1000;
    supportPlanet.rBDSFTQ.resources.deuterium = 1000;
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CARGO_SUPPORT, 4);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    homePlanet.rBDSFTQ.resources.metal = 0;
    homePlanet.rBDSFTQ.resources.crystal = 0;
    homePlanet.rBDSFTQ.resources.deuterium = 0;

    const priorProposal = createPriorProposal({
      subsystemId: 'ECONOMIC',
      kind: 'BUILDING',
      target: homePlanet,
      requestedResources: { metal: 1800, crystal: 0, deuterium: 0 },
      requestPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.METAL_MINE }
    });

    const { result } = runCriticalSubsystem(galaxy, bot, createDefaultBotMemoryV2(), [priorProposal]);
    const transportProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.TRANSPORT
    );

    expect(transportProposal).toBeDefined();
    expect(transportProposal?.requestPayload.responseSubtype).toBe('TRANSPORT');
  });

  it('does not emit Critical TRANSPORT when local recovery should happen within five turns', () => {
    const { galaxy, bot, homePlanet, supportPlanet } = createCriticalWorld();
    configureImmaturePlanet(homePlanet);
    configureStablePlanet(supportPlanet, 6);
    supportPlanet.rBDSFTQ.resources.metal = 12000;
    supportPlanet.rBDSFTQ.resources.crystal = 1000;
    supportPlanet.rBDSFTQ.resources.deuterium = 1000;
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CARGO_SUPPORT, 4);
    supportPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    homePlanet.rBDSFTQ.resources.metal = 0;
    homePlanet.rBDSFTQ.resources.crystal = 0;
    homePlanet.rBDSFTQ.resources.deuterium = 0;

    const priorProposal = createPriorProposal({
      subsystemId: 'ECONOMIC',
      kind: 'BUILDING',
      target: homePlanet,
      requestedResources: { metal: 30, crystal: 0, deuterium: 0 },
      requestPayload: { x: 0, y: 0, z: 1, buildingType: BuildingType.ROBOTICS_FACTORY }
    });

    const { result } = runCriticalSubsystem(galaxy, bot, createDefaultBotMemoryV2(), [priorProposal]);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.TRANSPORT
    )).toBe(false);
  });
});

function runCriticalSubsystem(
  galaxy: Galaxy,
  bot: Player,
  memory = createDefaultBotMemoryV2(),
  priorProposals: BotProposal[] = []
): {
  result: ReturnType<BotCriticalSubsystem['generate']>;
  memory: ReturnType<typeof createDefaultBotMemoryV2>;
} {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
    enabled: true,
    shadowMode: true,
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: true,
      strategicDevelopment: false,
      strategicMilitary: false,
      strategicDiplomatic: false,
      weightManager: false
    },
    allowSupervisorAcceptance: false,
    allowExecution: false
  });

  return {
    result: new BotCriticalSubsystem().generate({
      snapshot,
      memory,
      priorProposals
    }),
    memory
  };
}

function createCriticalWorld(): {
  galaxy: Galaxy;
  bot: Player;
  homePlanet: Planet;
  supportPlanet: Planet;
  neutralPlanet: Planet;
} {
  const botSystem = new SolarSystem('CriticalBot', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const neutralSystem = new SolarSystem('CriticalNeutral', 2, false, false, { x: 1, y: 0 }, new Set(), new Map());

  const homePlanet = Planet.createStartingPlanet('Critical I', 1, botSystem, 1);
  const supportPlanet = Planet.createStartingPlanet('Critical II', 2, botSystem, 1);
  botSystem.planets[0] = homePlanet;
  botSystem.planets[1] = supportPlanet;

  const neutralPlanet = Planet.createStartingPlanet('Neutral I', 1, neutralSystem, 0);
  neutralSystem.planets[0] = neutralPlanet;

  const bot = new Player(
    1,
    'CriticalBot',
    [homePlanet, supportPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, 2);
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 1);
  bot.setTechLevel(TechnologyType.HYPERSPACE_TECHNOLOGY, 1);
  bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 1);
  bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 1);
  bot.setTechLevel(TechnologyType.MATERIAL_TECHNOLOGY, 1);
  bot.setTechLevel(TechnologyType.ARMOUR_TECHNOLOGY, 1);
  bot.setTechLevel(TechnologyType.SHIELDING_TECHNOLOGY, 1);
  bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 1);

  for (const planet of bot.planets) {
    planet.info.ownerId = bot.playerId;
    configureStablePlanet(planet, 5);
    planet.rBDSFTQ.ships = ManyShips.empty();
    planet.rBDSFTQ.resources.metal = 5000;
    planet.rBDSFTQ.resources.crystal = 5000;
    planet.rBDSFTQ.resources.deuterium = 5000;
  }
  neutralPlanet.info.ownerId = null;
  configureStablePlanet(neutralPlanet, 4);
  neutralPlanet.rBDSFTQ.ships = ManyShips.empty();

  const galaxy = new Galaxy(
    'Critical Test',
    [bot],
    [[botSystem, neutralSystem]],
    1,
    [],
    1,
    new Map(),
    new Map([[bot.playerId, bot]]),
    new Map(),
    new Map([[bot.playerName, bot.playerId]])
  );

  return {
    galaxy,
    bot,
    homePlanet,
    supportPlanet,
    neutralPlanet
  };
}

function configureStablePlanet(planet: Planet, level: number): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, level);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, level);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, level);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, Math.max(level + 10, 16));
  planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 1);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, Math.max(2, level - 2));
  planet.setBuildingLevel(BuildingType.SHIPYARD, Math.max(2, level - 3));
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, Math.max(1, level - 4));
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, Math.max(1, level - 2));
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, Math.max(1, level - 2));
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, Math.max(1, level - 2));
}

function configureImmaturePlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 2);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 2);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 2);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 14);
  planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 0);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 0);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 10);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 10);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 10);
}

function configureRepairEmergencyPlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 18);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 18);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 18);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 12);
  planet.setBuildingLevel(BuildingType.NUCLEAR_PLANT, 0);
  planet.setBuildingLevel(BuildingType.FUSION_REACTOR, 0);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 8);
  planet.setBuildingLevel(BuildingType.NANITE_FACTORY, 0);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 6);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 6);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 8);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 8);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 8);
}

function applyHeavyStructuralDamage(planet: Planet): void {
  for (const buildingType of [
    BuildingType.METAL_MINE,
    BuildingType.CRYSTAL_MINE,
    BuildingType.DEUTERIUM_SYNTHESIZER,
    BuildingType.ROBOTICS_FACTORY,
    BuildingType.SHIPYARD,
    BuildingType.RESEARCH_LAB,
    BuildingType.METAL_STORAGE,
    BuildingType.CRYSTAL_STORAGE,
    BuildingType.DEUTERIUM_TANK
  ]) {
    planet.setCurrentBuildingStructuralPoints(buildingType, 0);
  }
}

function createPriorProposal(input: {
  subsystemId: BotProposal['subsystemId'];
  kind: BotProposal['kind'];
  target: Planet;
  requestedResources: { metal: number; crystal: number; deuterium: number };
  requestPayload: Record<string, unknown>;
}): BotProposal {
  const coordinates = {
    x: input.target.basicInfo.solarSystem.coordinates.x,
    y: input.target.basicInfo.solarSystem.coordinates.y,
    z: input.target.basicInfo.order
  };

  return {
    proposalId: `prior:${input.subsystemId}:${input.kind}:${coordinates.x}:${coordinates.y}:${coordinates.z}`,
    subsystemId: input.subsystemId,
    kind: input.kind,
    status: 'PROPOSED',
    goalKey: `prior:${input.kind}`,
    dedupeKey: `prior:${input.kind}:${coordinates.x}:${coordinates.y}:${coordinates.z}`,
    summary: 'Prior test proposal',
    planetId: null,
    targetCoordinates: coordinates,
    expectedValue: 50,
    urgency: 50,
    risk: 10,
    confidence: 80,
    requestedResources: { ...input.requestedResources },
    requestPayload: { ...input.requestPayload },
    blockers: [],
    expiresOnTurn: 2,
    debug: {}
  };
}
