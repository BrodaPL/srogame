import { describe, expect, it } from 'vitest';
import { BuildingType } from '../../../../../src/app/models/enums/building-type.js';
import { FleetMissionType } from '../../../../../src/app/models/enums/fleet-mission-type.js';
import { PlayerType } from '../../../../../src/app/models/enums/player-type.js';
import { ShipType } from '../../../../../src/app/models/enums/ship-type.js';
import { TechnologyType } from '../../../../../src/app/models/enums/technology-type.js';
import { EspionageReportGenerator } from '../../../../../src/app/generators/espionage-report-generator.js';
import { ManyShips } from '../../../../../src/app/models/fleets/many-ships.js';
import { Galaxy } from '../../../../../src/app/models/planets/galaxy.js';
import { Planet } from '../../../../../src/app/models/planets/planet.js';
import { SolarSystem } from '../../../../../src/app/models/planets/solar-system.js';
import { Player } from '../../../../../src/app/models/player.js';
import type { BotMemoryV2 } from '../../../../../src/app/models/player.js';
import { ResourcesPack } from '../../../../../src/app/models/resources-pack.js';
import { FleetReport } from '../../../../../src/app/models/reports/fleet-report.js';
import { createTutorialReadState } from '../../../../../src/app/tutorial/tutorial-types.js';
import { createDefaultBotMemoryV2 } from '../../bot-v2-memory.js';
import { buildBotWorldSnapshot } from '../../snapshot/build-bot-world-snapshot.js';
import { BotStrategicMilitarySubsystem } from './bot-strategic-military-subsystem.js';

describe('BotStrategicMilitarySubsystem', () => {
  it('emits spy missions for unscanned foreign planets', () => {
    const { galaxy, bot, homePlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 2);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.SPY
    )).toBe(true);
  });

  it('emits a break attack for scanned neutral planets with remaining defenders', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.SPY_PROBE, 1);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const attackProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
    );

    expect(attackProposal).toBeDefined();
    expect(attackProposal?.debug.missionPhase).toBe('BREAK');
    expect(attackProposal?.requestPayload.origin).toEqual({ x: 0, y: 0, z: 1 });
    expect(attackProposal?.requestPayload.target).toEqual({ x: 0, y: 0, z: 2 });
  });

  it('emits a plunder attack for opened neutral farms with enough loot at arrival', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const attackProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'PLUNDER'
    );

    expect(attackProposal).toBeDefined();
    expect(attackProposal?.requestPayload.ships.some((ship: { type: ShipType }) => ship.type === ShipType.TRANSPORTER)).toBe(true);
    expect(attackProposal?.requestPayload.ships.some((ship: { type: ShipType }) => ship.type === ShipType.FIGHTER)).toBe(true);
  });

  it('emits a ship-need request when current fleets cannot clear a scanned neutral target', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 4);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const shipNeedProposal = result.proposals.find((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    );

    expect(shipNeedProposal).toBeDefined();
    expect(shipNeedProposal?.debug.queueType).toBe('SHIP_NEED');
    expect(shipNeedProposal?.requestPayload.shipType).toBe(ShipType.FIGHTER);
    expect(shipNeedProposal?.requestPayload.amount).toBeGreaterThan(0);
  });

  it('uses report-derived farm resources instead of live hidden planet resources', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);

    const result = runStrategicMilitarySubsystem(galaxy, bot);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'PLUNDER'
    )).toBe(true);
  });

  it('uses battle reports to open a neutral farm for plunder without reading live defenders', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 2);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.currentTurn = 2;
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const attackProposal = result.proposals.find((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.requestPayload.missionType === FleetMissionType.ATTACK
      && proposal.debug.missionPhase === 'PLUNDER'
    );

    expect(attackProposal).toBeDefined();
  });

  it('uses plunder reports to suppress immediate re-plunder after a farm was drained', () => {
    const memory = createDefaultBotMemoryV2();
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.TRANSPORTER, 1);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    galaxy.currentTurn = 2;
    addBattleReport(bot, neutralPlanet, galaxy.currentTurn, {
      survivingShipsLine: 'Enemy survivors by type: none',
      survivingDefencesLine: 'Enemy defense survivors by type: none'
    });
    addPlunderReport(bot, neutralPlanet, galaxy.currentTurn, new ResourcesPack(300, 300, 300));
    neutralPlanet.rBDSFTQ.resources = new ResourcesPack(300, 300, 300);

    const result = runStrategicMilitarySubsystem(galaxy, bot, memory);

    expect(result.proposals.some((proposal) =>
      proposal.kind === 'FLEET_MISSION'
      && proposal.debug.missionPhase === 'PLUNDER'
    )).toBe(false);
  });

  it('caps ship-need output to one shortage request per origin planet', () => {
    const { galaxy, bot, neutralOwner, homePlanet, neutralPlanet, foreignPlanet } = createStrategicMilitaryWorld();
    configureOriginPlanet(homePlanet);
    homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.FIGHTER, 1);
    neutralPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 4);
    foreignPlanet.info.ownerId = neutralOwner.playerId;
    neutralOwner.planets.push(foreignPlanet);
    foreignPlanet.rBDSFTQ.ships.addUndamaged(ShipType.BATTLE_SHIP, 5);
    markPlanetScanned(bot, neutralOwner, neutralPlanet, galaxy.currentTurn);
    markPlanetScanned(bot, neutralOwner, foreignPlanet, galaxy.currentTurn);

    const result = runStrategicMilitarySubsystem(galaxy, bot);
    const shipNeedProposals = result.proposals.filter((proposal) =>
      proposal.kind === 'SHIPYARD'
      && proposal.requestPayload.demandOnly === true
    );

    expect(shipNeedProposals).toHaveLength(1);
  });
});

function runStrategicMilitarySubsystem(galaxy: Galaxy, bot: Player, memory: BotMemoryV2 = createDefaultBotMemoryV2()) {
  const snapshot = buildBotWorldSnapshot(galaxy, bot, {
    enabled: true,
    shadowMode: true,
    enabledSubsystems: {
      economic: false,
      defensive: false,
      warfare: false,
      critical: false,
      strategicDevelopment: false,
      strategicMilitary: true,
      strategicDiplomatic: false
    },
    allowSupervisorAcceptance: false,
    allowExecution: false
  });

  return new BotStrategicMilitarySubsystem().generate({
    snapshot,
    memory
  });
}

function createStrategicMilitaryWorld() {
  const system = new SolarSystem('BotSys', 3, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('BotSys I', 1, system, 1);
  const neutralPlanet = Planet.createStartingPlanet('BotSys II', 2, system, 1);
  const foreignPlanet = Planet.createStartingPlanet('BotSys III', 3, system, 1);
  system.planets[0] = homePlanet;
  system.planets[1] = neutralPlanet;
  system.planets[2] = foreignPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [homePlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  setBasicShipTech(bot);
  const humanEnemy = new Player(
    2,
    'Human-2',
    [foreignPlanet],
    new Map(),
    [],
    PlayerType.PLAYER,
    createTutorialReadState(true)
  );
  const neutralOwner = new Player(
    3,
    'Neutral-3',
    [neutralPlanet],
    new Map(),
    [],
    PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );
  homePlanet.info.ownerId = bot.playerId;
  neutralPlanet.info.ownerId = neutralOwner.playerId;
  foreignPlanet.info.ownerId = humanEnemy.playerId;

  const galaxy = new Galaxy(
    'Bot Test',
    [bot, humanEnemy, neutralOwner],
    [[system]],
    1,
    [],
    1,
    new Map([[humanEnemy.playerId, humanEnemy]]),
    new Map([[bot.playerId, bot]]),
    new Map([[neutralOwner.playerId, neutralOwner]]),
    new Map([
      [bot.playerName, bot.playerId],
      [humanEnemy.playerName, humanEnemy.playerId],
      [neutralOwner.playerName, neutralOwner.playerId]
    ])
  );

  return { galaxy, bot, humanEnemy, neutralOwner, homePlanet, neutralPlanet, foreignPlanet };
}

function configureOriginPlanet(planet: Planet): void {
  planet.setBuildingLevel(BuildingType.METAL_MINE, 3);
  planet.setBuildingLevel(BuildingType.CRYSTAL_MINE, 3);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_SYNTHESIZER, 3);
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 3);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 3);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 3);
  planet.setBuildingLevel(BuildingType.SOLAR_WIND_GEOTHERMAL, 5);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 2);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 3);
  planet.rBDSFTQ.resources = new ResourcesPack(30000, 30000, 30000);
  planet.rBDSFTQ.ships = ManyShips.empty();
}

function markPlanetScanned(
  bot: Player,
  owner: Player,
  planet: Planet,
  createdTurn: number
): void {
  const report = new EspionageReportGenerator().createEspionageReport(bot, owner, planet, 4, {
    createdTurn,
    reportLevelBonus: 10
  });
  planet.lastReportData.set(bot.playerId, report);
}

function addBattleReport(
  bot: Player,
  planet: Planet,
  createdTurn: number,
  lines: {
    survivingShipsLine: string;
    survivingDefencesLine: string;
  }
): void {
  bot.addReport(new FleetReport(
    {
      reportId: bot.createReportId(),
      createdTurn,
      title: `Battle Report: ${planet.basicInfo.solarSystem.coordinates.x}:${planet.basicInfo.solarSystem.coordinates.y}:${planet.basicInfo.order}`,
      sourceCoordinates: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order
      },
      sourcePlanetName: planet.basicInfo.name,
      sourceSystemName: planet.basicInfo.solarSystem.name
    },
    [
      'Battle result: ATTACKER',
      lines.survivingShipsLine,
      lines.survivingDefencesLine
    ].join('\n')
  ));
}

function addPlunderReport(
  bot: Player,
  planet: Planet,
  createdTurn: number,
  stolenResources: ResourcesPack
): void {
  bot.addReport(new FleetReport(
    {
      reportId: bot.createReportId(),
      createdTurn,
      title: `Plunder Report: ${planet.basicInfo.name}`,
      sourceCoordinates: {
        x: planet.basicInfo.solarSystem.coordinates.x,
        y: planet.basicInfo.solarSystem.coordinates.y,
        z: planet.basicInfo.order
      },
      sourcePlanetName: planet.basicInfo.name,
      sourceSystemName: planet.basicInfo.solarSystem.name
    },
    `Resources stolen: Metal ${stolenResources.metal}, Crystal ${stolenResources.crystal}, Deuterium ${stolenResources.deuterium}.`
  ));
}

function setBasicShipTech(bot: Player): void {
  bot.setTechLevel(TechnologyType.ENERGY_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.FUSION_DRIVE, 2);
  bot.setTechLevel(TechnologyType.HYPERSPACE_DRIVE, 2);
  bot.setTechLevel(TechnologyType.ESPIONAGE_TECHNOLOGY, 2);
  bot.setTechLevel(TechnologyType.BEAMS_WEAPONS, 2);
  bot.setTechLevel(TechnologyType.COMPUTER_TECHNOLOGY, 2);
}
