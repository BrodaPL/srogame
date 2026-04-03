import { EspionageReportGenerator } from '../../generators/espionage-report-generator';
import { createDiplomaticProposal } from '../diplomacy/diplomatic-proposal';
import { DiplomaticStatus } from '../diplomacy/diplomatic-status';
import { BuildingType } from '../enums/building-type';
import { PlayerType } from '../enums/player-type';
import { ShipType } from '../enums/ship-type';
import { Fleet } from '../fleets/fleet';
import { ManyShips } from '../fleets/many-ships';
import { Player } from '../player';
import { Planet } from '../planets/planet';
import { Galaxy } from '../planets/galaxy';
import { SolarSystem } from '../planets/solar-system';
import { ResourcesPack } from '../resources-pack';
import { createTutorialReadState } from '../../tutorial/tutorial-types';

export const BOT_BENCHMARK_SCENARIO_KEYS = [
  'botEconomyBootstrap',
  'botColonizeNearby',
  'botRejectRiskyAttack',
  'botFrontierReinforce',
  'botAcceptPeaceUnderPressure',
  'botRejectPeaceWhenDominant',
  'botProposePeaceWhenOverextended',
  'botProposeAllianceFromPeaceOnly'
] as const;

export type BotBenchmarkScenarioKey = typeof BOT_BENCHMARK_SCENARIO_KEYS[number];

export type BotBenchmarkScenario = {
  key: BotBenchmarkScenarioKey;
  galaxy: Galaxy;
  focusBot: Player;
  notes: string;
};

export function createBotBenchmarkScenario(key: BotBenchmarkScenarioKey): BotBenchmarkScenario {
  switch (key) {
    case 'botEconomyBootstrap':
      return createEconomyBootstrapScenario();
    case 'botColonizeNearby':
      return createColonizeNearbyScenario();
    case 'botRejectRiskyAttack':
      return createRejectRiskyAttackScenario();
    case 'botFrontierReinforce':
      return createFrontierReinforceScenario();
    case 'botAcceptPeaceUnderPressure':
      return createAcceptPeaceUnderPressureScenario();
    case 'botRejectPeaceWhenDominant':
      return createRejectPeaceWhenDominantScenario();
    case 'botProposePeaceWhenOverextended':
      return createProposePeaceWhenOverextendedScenario();
    case 'botProposeAllianceFromPeaceOnly':
      return createProposeAllianceFromPeaceOnlyScenario();
  }
}

function createEconomyBootstrapScenario(): BotBenchmarkScenario {
  const system = new SolarSystem('BenchEco', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('BenchEco I', 1, system, 1);
  system.planets[0] = homePlanet;

  const bot = new Player(1, 'Bot-1', [homePlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  initializePlanet(homePlanet, bot.playerId);
  homePlanet.rBDSFTQ.resources = new ResourcesPack(500, 500, 200);

  return {
    key: 'botEconomyBootstrap',
    galaxy: createGalaxy('Bot Economy Benchmark', [bot], [[system]], 1),
    focusBot: bot,
    notes: 'Bot should choose at least one economy action when it can afford one.'
  };
}

function createColonizeNearbyScenario(): BotBenchmarkScenario {
  const { galaxy, bot, homePlanet, targetPlanet } = createTwoPlanetGalaxy(null);
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 40);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.COLONIZER, 1);
  targetPlanet.info.ownerId = null;
  galaxy.currentTurn = 4;

  return {
    key: 'botColonizeNearby',
    galaxy,
    focusBot: bot,
    notes: 'Bot should launch a nearby colonization mission when a colonizer and target exist.'
  };
}

function createRejectRiskyAttackScenario(): BotBenchmarkScenario {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  homePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 120);
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 2);
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 6);
  targetPlanet.setBuildingLevel(BuildingType.BUNKER_NETWORK, 3);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  return {
    key: 'botRejectRiskyAttack',
    galaxy,
    focusBot: bot,
    notes: 'Bot should not launch an attack when known defender strength is clearly unfavorable.'
  };
}

function createFrontierReinforceScenario(): BotBenchmarkScenario {
  const { galaxy, bot, reservePlanet, frontierPlanet, threatPlanet, threatOwner } = createGuardScenarioGalaxy();
  reservePlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 160);
  reservePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 6);
  frontierPlanet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
  threatPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, threatOwner, threatPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 5
    })
  );
  galaxy.currentTurn = 5;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: threatOwner.playerId, status: DiplomaticStatus.PASSIVE }
  ];

  return {
    key: 'botFrontierReinforce',
    galaxy,
    focusBot: bot,
    notes: 'Bot should guard a weak frontier when nearby hostile pressure is known.'
  };
}

function createAcceptPeaceUnderPressureScenario(): BotBenchmarkScenario {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 1);
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 7);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const proposal = createDiplomaticProposal(
    1,
    targetOwner.playerId,
    bot.playerId,
    DiplomaticStatus.PEACE,
    galaxy.currentTurn,
    galaxy.currentTurn + 1
  );
  galaxy.diplomaticProposals = [proposal];
  galaxy.nextDiplomaticProposalId = 2;

  return {
    key: 'botAcceptPeaceUnderPressure',
    galaxy,
    focusBot: bot,
    notes: 'Bot should accept PEACE when outgunned on a live border.'
  };
}

function createRejectPeaceWhenDominantScenario(): BotBenchmarkScenario {
  const { galaxy, bot, homePlanet, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  bot.botProfileId = 'AGGRESSOR';
  homePlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 1);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  const proposal = createDiplomaticProposal(
    1,
    targetOwner.playerId,
    bot.playerId,
    DiplomaticStatus.PEACE,
    galaxy.currentTurn,
    galaxy.currentTurn + 1
  );
  galaxy.diplomaticProposals = [proposal];
  galaxy.nextDiplomaticProposalId = 2;

  return {
    key: 'botRejectPeaceWhenDominant',
    galaxy,
    focusBot: bot,
    notes: 'Aggressor bot should reject PEACE when it has a clear advantage.'
  };
}

function createProposePeaceWhenOverextendedScenario(): BotBenchmarkScenario {
  const { galaxy, bot, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.WAR }
  ];
  bot.botProfileId = 'AVOIDER';
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 8);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  return {
    key: 'botProposePeaceWhenOverextended',
    galaxy,
    focusBot: bot,
    notes: 'Avoider bot should initiate PEACE from a pressured war border.'
  };
}

function createProposeAllianceFromPeaceOnlyScenario(): BotBenchmarkScenario {
  const { galaxy, bot, targetPlanet, targetOwner } = createTwoPlanetGalaxy(PlayerType.PLAYER);
  galaxy.currentTurn = 6;
  galaxy.diplomaticRelations = [
    { playerAId: bot.playerId, playerBId: targetOwner.playerId, status: DiplomaticStatus.PEACE }
  ];
  bot.botProfileId = 'TURTLE';
  targetPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 7);
  targetPlanet.lastReportData.set(
    bot.playerId,
    new EspionageReportGenerator().createEspionageReport(bot, targetOwner, targetPlanet, 4, {
      forcedReportLevel: 12,
      createdTurn: 6
    })
  );

  return {
    key: 'botProposeAllianceFromPeaceOnly',
    galaxy,
    focusBot: bot,
    notes: 'Bot should only propose ALLIED from an existing PEACE relation.'
  };
}

function createTwoPlanetGalaxy(targetOwnerType: PlayerType | null): {
  galaxy: Galaxy;
  bot: Player;
  homePlanet: Planet;
  targetPlanet: Planet;
  targetOwner: Player;
} {
  const system = new SolarSystem('BenchSys', 2, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const homePlanet = Planet.createStartingPlanet('BenchSys I', 1, system, 1);
  const targetPlanet = Planet.createStartingPlanet('BenchSys II', 2, system, 2);
  system.planets[0] = homePlanet;
  system.planets[1] = targetPlanet;

  const bot = new Player(1, 'Bot-1', [homePlanet], new Map(), [], PlayerType.BOT, createTutorialReadState(true));
  const targetOwner = new Player(
    2,
    'Target',
    [targetPlanet],
    new Map(),
    [],
    targetOwnerType ?? PlayerType.NEUTRAL,
    createTutorialReadState(true)
  );

  initializePlanet(homePlanet, bot.playerId);
  initializePlanet(targetPlanet, targetOwner.playerId);
  targetPlanet.rBDSFTQ.resources = new ResourcesPack(100, 60, 30);

  return {
    galaxy: createGalaxy('Bot Benchmark', [bot, targetOwner], [[system]], 1),
    bot,
    homePlanet,
    targetPlanet,
    targetOwner
  };
}

function createGuardScenarioGalaxy(): {
  galaxy: Galaxy;
  bot: Player;
  reservePlanet: Planet;
  frontierPlanet: Planet;
  threatPlanet: Planet;
  threatOwner: Player;
} {
  const reserveSystem = new SolarSystem('Reserve', 1, false, false, { x: 0, y: 0 }, new Set(), new Map());
  const frontierSystem = new SolarSystem('Frontier', 1, false, false, { x: 1, y: 0 }, new Set(), new Map());
  const threatSystem = new SolarSystem('Threat', 1, false, false, { x: 2, y: 0 }, new Set(), new Map());
  const reservePlanet = Planet.createStartingPlanet('Reserve I', 1, reserveSystem, 1);
  const frontierPlanet = Planet.createStartingPlanet('Frontier I', 1, frontierSystem, 1);
  const threatPlanet = Planet.createStartingPlanet('Threat I', 1, threatSystem, 1);
  reserveSystem.planets[0] = reservePlanet;
  frontierSystem.planets[0] = frontierPlanet;
  threatSystem.planets[0] = threatPlanet;

  const bot = new Player(
    1,
    'Bot-1',
    [reservePlanet, frontierPlanet],
    new Map(),
    [],
    PlayerType.BOT,
    createTutorialReadState(true)
  );
  const threatOwner = new Player(
    2,
    'Threat',
    [threatPlanet],
    new Map(),
    [],
    PlayerType.PLAYER,
    createTutorialReadState(true)
  );

  initializePlanet(reservePlanet, bot.playerId);
  initializePlanet(frontierPlanet, bot.playerId);
  initializePlanet(threatPlanet, threatOwner.playerId);
  frontierPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CORVETTE, 1);
  threatPlanet.rBDSFTQ.ships.addUndamaged(ShipType.CRUISER, 5);

  return {
    galaxy: createGalaxy(
      'Bot Frontier Benchmark',
      [bot, threatOwner],
      [[reserveSystem, frontierSystem, threatSystem]],
      1
    ),
    bot,
    reservePlanet,
    frontierPlanet,
    threatPlanet,
    threatOwner
  };
}

function createGalaxy(
  galaxyName: string,
  players: Player[],
  stars: SolarSystem[][],
  currentTurn: number,
  activeFleets: Fleet[] = []
): Galaxy {
  const humanPlayerMap = new Map<number, Player>();
  const botPlayerMap = new Map<number, Player>();
  const neutralPlayerMap = new Map<number, Player>();
  const playerNameMap = new Map<string, number>();

  for (const player of players) {
    playerNameMap.set(player.playerName, player.playerId);
    switch (player.type) {
      case PlayerType.BOT:
        botPlayerMap.set(player.playerId, player);
        break;
      case PlayerType.NEUTRAL:
        neutralPlayerMap.set(player.playerId, player);
        break;
      default:
        humanPlayerMap.set(player.playerId, player);
        break;
    }
  }

  return new Galaxy(
    galaxyName,
    players,
    stars,
    currentTurn,
    activeFleets,
    1,
    humanPlayerMap,
    botPlayerMap,
    neutralPlayerMap,
    playerNameMap
  );
}

function initializePlanet(planet: Planet, ownerId: number): void {
  planet.info.ownerId = ownerId;
  planet.setBuildingLevel(BuildingType.METAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.CRYSTAL_STORAGE, 1);
  planet.setBuildingLevel(BuildingType.DEUTERIUM_TANK, 1);
  planet.setBuildingLevel(BuildingType.ROBOTICS_FACTORY, 1);
  planet.setBuildingLevel(BuildingType.RESEARCH_LAB, 1);
  planet.setBuildingLevel(BuildingType.SHIPYARD, 1);
  planet.rBDSFTQ.resources = new ResourcesPack(0, 0, 0);
  planet.rBDSFTQ.ships = ManyShips.empty();
  planet.lastReportData.clear();
}
