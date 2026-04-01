import fs from 'node:fs';
import path from 'node:path';
import { normalizeGalaxySetup } from '../../src/app/models/game-api-types.js';
import { BuildingQueueEntry } from '../../src/app/models/buildings/building-queue-entry.js';
import { ManyDefences } from '../../src/app/models/defences/many-defences.js';
import { Destination } from '../../src/app/models/fleets/destination.js';
import { Fleet } from '../../src/app/models/fleets/fleet.js';
import { ManyShips } from '../../src/app/models/fleets/many-ships.js';
import { PlayerMessage as PlayerMessageModel } from '../../src/app/models/mail/player-message.js';
import { Player } from '../../src/app/models/player.js';
import { Galaxy } from '../../src/app/models/planets/galaxy.js';
import { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } from '../../src/app/models/planets/planet.js';
import { PlanetaryParameters as PlanetaryParametersModel } from '../../src/app/models/planets/planetary-parameters.js';
import { SolarSystem } from '../../src/app/models/planets/solar-system.js';
import { StarSystemNote as StarSystemNoteModel } from '../../src/app/models/planets/star-system-note.js';
import { BuildingQueue } from '../../src/app/models/reports/building-queue.js';
import { BuildingsReport } from '../../src/app/models/reports/buildings-report.js';
import { ColonizationReport } from '../../src/app/models/reports/colonization-report.js';
import { DefenseReport } from '../../src/app/models/reports/defense-report.js';
import { DefenceBuildingInstances } from '../../src/app/models/reports/defence-building-instances.js';
import { DefencesQueue } from '../../src/app/models/reports/defences-queue.js';
import { EspionageReportData as EspionageReportDataModel } from '../../src/app/models/reports/espionage-report-data.js';
import { FleetReport } from '../../src/app/models/reports/fleet-report.js';
import { MessageReport } from '../../src/app/models/reports/message-report.js';
import { ProductionReport } from '../../src/app/models/reports/production-report.js';
import { ResearchQueue } from '../../src/app/models/reports/research-queue.js';
import { ResearchReport } from '../../src/app/models/reports/research-report.js';
import { SensorPhalanxReport } from '../../src/app/models/reports/sensor-phalanx-report.js';
import { ShipyardQueue } from '../../src/app/models/reports/shipyard-queue.js';
import { StarSystemEspionageReport } from '../../src/app/models/reports/star-system-espionage-report.js';
import { ResourcesPack as ResourcesPackModel } from '../../src/app/models/resources-pack.js';
import { ReportType } from '../../src/app/models/enums/report-type.js';
import { PlayerType } from '../../src/app/models/enums/player-type.js';
import { ShipyardQueueEntry } from '../../src/app/models/fleets/shipyard-queue-entry.js';
import { TechnologyQueueEntry } from '../../src/app/models/tech/technology-queue-entry.js';
import { ResearchHelperFor } from '../../src/app/models/tech/research-helper-for.js';
import type {
  GameSaveSummary,
  GalaxySetup
} from '../../src/app/models/game-api-types.ts';
import type { PlayerReport } from '../../src/app/models/reports/player-report.ts';
import type { EspionageReportData } from '../../src/app/models/reports/espionage-report-data.ts';
import type { ManyShipsLike } from '../../src/app/models/fleets/many-ships.ts';
import type { ManyDefencesLike } from '../../src/app/models/defences/many-defences.ts';
import type { PlayerMessage } from '../../src/app/models/mail/player-message.ts';
import type { ResourcesPack } from '../../src/app/models/resources-pack.ts';
import type { PlanetaryParameters } from '../../src/app/models/planets/planetary-parameters.ts';
import type { StarSystemNote } from '../../src/app/models/planets/star-system-note.ts';
import type { DefenceType } from '../../src/app/models/enums/defence-type.ts';

export const GAME_SAVE_VERSION = 1;

type SavedCoordinates = {
  x: number;
  y: number;
  z: number;
};

type SavedPlanetaryParameters = {
  metalModifier: number;
  crystalModifier: number;
  deuteriumModifier: number;
  energyModifierRES: number;
  energyModifierNuclear: number;
  scienceModifier: number;
  industryModifier: number;
  anomaliesAndNoise: number;
  hyperspaceParameters: number;
};

type SavedResourcesPack = {
  metal: number;
  crystal: number;
  deuterium: number;
};

type SavedManyShips = {
  undamagedShipsCount: ManyShipsLike['undamagedShipsCount'];
  damagedShips: ManyShipsLike['damagedShips'];
};

type SavedManyDefences = {
  undamagedDefencesCount: ManyDefencesLike['undamagedDefencesCount'];
  damagedDefences: ManyDefencesLike['damagedDefences'];
};

type SavedPlayerReportBase = {
  reportType: PlayerReport['reportType'];
  reportId: number;
  createdTurn: number;
  title: string;
  isRead: boolean;
  sourceCoordinates: SavedCoordinates | null;
  sourcePlanetName: string | null;
  sourceSystemName: string | null;
  senderPlayerName: string | null;
};

type SavedTextPlayerReport = SavedPlayerReportBase & {
  body: string;
};

type SavedEspionagePlayerReport = SavedPlayerReportBase & {
  planetaryParameters: SavedPlanetaryParameters;
  averageBuildingLevel: number;
  averageTotalResources: number;
  averageTechLevel: number;
  totalDefencesAmount: number;
  totalShipsAmount: number;
  buildingsLevels: Record<string, number>;
  resourcesAmount: SavedResourcesPack;
  techLevels: Record<string, number>;
  defences: Array<{ type: DefenceType; amount: number }>;
  ships: Record<string, number>;
  shipyardProduction: Record<string, never>;
  defencesProduction: Record<string, never>;
  researchProduction: Record<string, never>;
  buildingProduction: Record<string, never>;
};

export type SavedPlayerReport = SavedTextPlayerReport | SavedEspionagePlayerReport;

type SavedPlayerMessage = {
  messageId: number;
  createdTurn: number;
  title: string;
  body: string;
  isRead: boolean;
  senderPlayerId: number | null;
  senderPlayerName: string | null;
};

type SavedPlayer = {
  playerId: number;
  playerName: string;
  type: Player['type'];
  tutorialRead: Player['tutorialRead'];
  nextReportId: number;
  nextMessageId: number;
  techLevels: Record<string, number>;
  planetCoordinates: SavedCoordinates[];
  fleetIds: number[];
  reports: SavedPlayerReport[];
  messages: SavedPlayerMessage[];
};

type SavedStarSystemNote = {
  playerId: number;
  coordinates: { x: number; y: number };
  borderColor: StarSystemNote['borderColor'];
  text: string;
};

type SavedFleet = {
  fleetId: number;
  ownerId: number;
  missionType: Fleet['missionType'];
  origin: SavedCoordinates;
  target: SavedCoordinates;
  originPlanetName: string;
  targetPlanetName: string;
  ships: SavedManyShips;
  cargo: SavedResourcesPack;
  fuelCost: number;
  totalCargoCapacity: number;
  usedCargoCapacity: number;
  travelTurns: number;
  returnTurns: number;
  state: Fleet['state'];
  createdAtTurn: number;
  carriedBombs: SavedManyDefences;
  orbitActivity: Fleet['orbitActivity'];
  suspendedMissionType: Fleet['suspendedMissionType'];
  returnReason: Fleet['returnReason'];
  maintenanceRequestAvailable: boolean;
  pendingMaintenanceRequestId: number | null;
  usesJumpGate: boolean;
  pendingJumpGateRequestId: number | null;
  lastMaintenanceRequestTurn: number | null;
  bombardmentPriorities: Fleet['bombardmentPriorities'];
  remainingFuelReserve: number;
};

type SavedPlanet = {
  basicInfo: {
    name: string;
    type: Planet['basicInfo']['type'];
    colonizationDifficulty: number;
    order: number;
    image: string;
    baseSize: number;
    terraformerSizeBonus: number;
  };
  info: {
    ownerId: number | null;
    planetaryParameters: SavedPlanetaryParameters;
  };
  rBDSFTQ: {
    resources: SavedResourcesPack;
    buildingsLevels: Record<string, number>;
    buildingsCurrentPowerConsumption: Record<string, number>;
    buildingsCurrentStructuralPoints: Record<string, number>;
    defences: SavedManyDefences;
    ships: SavedManyShips;
    currentResearchQueue: TechnologyQueueEntry | null;
    researchHelperFor: ResearchHelperFor | null;
    buildingQueue: BuildingQueueEntry[];
    shipyardQueue: ShipyardQueueEntry[];
    fleetIds: number[];
    spaceDebris: SavedResourcesPack;
    tradePortOffers: Planet['rBDSFTQ']['tradePortOffers'];
    sensorPhalanxScansUsedTurn: number | null;
    sensorPhalanxScansUsed: number;
    sensorPhalanxKnownIncomingFleetIds: number[];
  };
  lastReportData: Array<{
    playerId: number;
    report: SavedEspionagePlayerReport;
  }>;
};

type SavedSolarSystem = {
  name: string;
  isGalaxyCenter: boolean;
  isVoid: boolean;
  isCenterEdge: boolean;
  coordinates: { x: number; y: number };
  discoveredByPlayer: number[];
  starSystemNotes: SavedStarSystemNote[];
  planets: SavedPlanet[];
};

type SavedGalaxy = {
  name: string;
  currentTurn: number;
  nextFleetId: number;
  nextDiplomaticProposalId: number;
  nextJumpGateRequestId: number;
  nextMaintenanceRequestId: number;
  players: SavedPlayer[];
  stars: SavedSolarSystem[][];
  activeFleets: SavedFleet[];
  diplomaticRelations: Galaxy['diplomaticRelations'];
  diplomaticProposals: Galaxy['diplomaticProposals'];
  jumpGateRequests: Galaxy['jumpGateRequests'];
  maintenanceRequests: Galaxy['maintenanceRequests'];
};

export type SavedGameFile = {
  version: number;
  savedAt: string;
  ownerAccountId: number;
  ownerPlayerName: string | null;
  setup: GalaxySetup;
  galaxy: SavedGalaxy;
};

export type HydratedGameSave = {
  ownerAccountId: number;
  ownerPlayerName: string | null;
  setup: GalaxySetup;
  galaxy: Galaxy;
};

export type GameSaveLoadAccess = {
  canLoad: boolean;
  canLoadReason: string | null;
};

export function createGameSave(
  galaxy: Galaxy,
  ownerAccountId: number,
  setup: GalaxySetup,
  savedAt = new Date().toISOString()
): SavedGameFile {
  const planetCoordinatesByReference = buildPlanetCoordinateMap(galaxy);

  return {
    version: GAME_SAVE_VERSION,
    savedAt,
    ownerAccountId,
    ownerPlayerName: resolveGalaxySaveOwnerPlayerName(galaxy),
    setup,
    galaxy: {
      name: galaxy.name,
      currentTurn: galaxy.currentTurn,
      nextFleetId: galaxy.nextFleetId,
      nextDiplomaticProposalId: galaxy.nextDiplomaticProposalId,
      nextJumpGateRequestId: galaxy.nextJumpGateRequestId,
      nextMaintenanceRequestId: galaxy.nextMaintenanceRequestId,
      players: galaxy.players.map((player) => serializePlayer(player, planetCoordinatesByReference)),
      stars: galaxy.stars.map((row) => row.map((system) => ({
        name: system.name,
        isGalaxyCenter: system.isGalaxyCenter,
        isVoid: system.isVoid,
        isCenterEdge: system.isCenterEdge,
        coordinates: { x: system.coordinates.x, y: system.coordinates.y },
        discoveredByPlayer: [...system.discoveredByPlayer].sort((left, right) => left - right),
        starSystemNotes: [...system.starSystemNotes.entries()]
          .map(([playerId, note]) => serializeStarSystemNote(playerId, note))
          .sort((left, right) => left.playerId - right.playerId),
        planets: system.planets.map((planet) => serializePlanet(planet))
      }))),
      activeFleets: galaxy.activeFleets.map((fleet) => serializeFleet(fleet)),
      diplomaticRelations: galaxy.diplomaticRelations.map((relation) => ({ ...relation })),
      diplomaticProposals: galaxy.diplomaticProposals.map((proposal) => ({ ...proposal })),
      jumpGateRequests: galaxy.jumpGateRequests.map((request) => ({
        ...request,
        originCoordinates: serializeCoordinates(request.originCoordinates),
        targetCoordinates: serializeCoordinates(request.targetCoordinates)
      })),
      maintenanceRequests: galaxy.maintenanceRequests.map((request) => ({
        ...request,
        targetCoordinates: serializeCoordinates(request.targetCoordinates),
        requested: {
          fuel: request.requested.fuel,
          ships: request.requested.ships.map((entry) => ({ ...entry })),
          bombs: request.requested.bombs.map((entry) => ({ ...entry }))
        },
        approved: request.approved
          ? {
            fuel: request.approved.fuel,
            ships: request.approved.ships.map((entry) => ({ ...entry })),
            bombs: request.approved.bombs.map((entry) => ({ ...entry }))
          }
          : null
      }))
    }
  };
}

export function saveGameFile(saveFilePath: string, data: SavedGameFile): void {
  ensureSaveDirectory(saveFilePath);
  fs.writeFileSync(saveFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function readGameSave(saveFilePath: string): SavedGameFile | null {
  if (!fs.existsSync(saveFilePath)) {
    return null;
  }

  const raw = fs.readFileSync(saveFilePath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<SavedGameFile> | null;
  if (!parsed || typeof parsed !== 'object' || !parsed.galaxy || !parsed.setup) {
    throw new Error('Invalid saved game file.');
  }

  const setup = normalizeGalaxySetup(parsed.setup as GalaxySetup);
  const ownerPlayerName = typeof parsed.ownerPlayerName === 'string'
    ? parsed.ownerPlayerName
    : resolveSavedOwnerPlayerNameFromGalaxy(parsed.galaxy as SavedGalaxy);

  return {
    ...(parsed as SavedGameFile),
    version: typeof parsed.version === 'number' && Number.isInteger(parsed.version)
      ? parsed.version
      : GAME_SAVE_VERSION,
    savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date(0).toISOString(),
    ownerAccountId: typeof parsed.ownerAccountId === 'number' && Number.isInteger(parsed.ownerAccountId)
      ? parsed.ownerAccountId
      : 0,
    ownerPlayerName,
    setup
  };
}

export function readGameSaveSummary(saveFilePath: string): GameSaveSummary | null {
  const save = readGameSave(saveFilePath);
  return save ? buildGameSaveSummary(save) : null;
}

export function buildGameSaveSummary(save: SavedGameFile): GameSaveSummary {
  return {
    savedAt: save.savedAt,
    ownerAccountId: save.ownerAccountId,
    ownerPlayerName: save.ownerPlayerName ?? resolveSavedOwnerPlayerName(save),
    galaxyName: save.galaxy.name,
    currentTurn: save.galaxy.currentTurn,
    autoSaveTurns: save.setup.autoSaveTurns
  };
}

export function resolveGameSaveLoadAccess(
  save: SavedGameFile | null,
  currentAccountId: number | null
): GameSaveLoadAccess {
  if (!save) {
    return { canLoad: false, canLoadReason: 'No saved game found.' };
  }

  if (currentAccountId === null) {
    return { canLoad: false, canLoadReason: 'Login required to load the saved game.' };
  }

  if (save.ownerAccountId !== currentAccountId) {
    return { canLoad: false, canLoadReason: 'Only the saved owner can load this game.' };
  }

  return { canLoad: true, canLoadReason: null };
}

export function hydrateGameSave(save: SavedGameFile): HydratedGameSave {
  const players = save.galaxy.players.map((player) => hydrateSavedPlayer(player));
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const planetsByCoordinates = new Map<string, Planet>();
  const planetFleetIdsByCoordinates = new Map<string, number[]>();

  const stars = save.galaxy.stars.map((row) =>
    row.map((system) => hydrateSavedSolarSystem(system, planetsByCoordinates, planetFleetIdsByCoordinates))
  );

  const activeFleets = save.galaxy.activeFleets.map((fleet) => hydrateSavedFleet(fleet));
  const fleetsById = new Map(activeFleets.map((fleet) => [fleet.fleetId, fleet]));

  for (const savedPlayer of save.galaxy.players) {
    const player = playersById.get(savedPlayer.playerId);
    if (!player) {
      continue;
    }

    player.planets = savedPlayer.planetCoordinates
      .map((coordinates) => planetsByCoordinates.get(toCoordinatesKey(coordinates)))
      .filter((planet): planet is Planet => !!planet);
    player.fleets = savedPlayer.fleetIds
      .map((fleetId) => fleetsById.get(fleetId))
      .filter((fleet): fleet is Fleet => !!fleet);
  }

  for (const [coordinatesKey, planet] of planetsByCoordinates.entries()) {
    const fleetIds = planetFleetIdsByCoordinates.get(coordinatesKey) ?? [];
    planet.rBDSFTQ.fleets = fleetIds
      .map((fleetId) => fleetsById.get(fleetId))
      .filter((fleet): fleet is Fleet => !!fleet);
  }

  const galaxy = new Galaxy(
    save.galaxy.name,
    players,
    stars,
    save.galaxy.currentTurn,
    activeFleets,
    save.galaxy.nextFleetId,
    buildPlayerTypeMap(players, PlayerType.PLAYER),
    buildPlayerTypeMap(players, PlayerType.BOT),
    buildPlayerTypeMap(players, PlayerType.NEUTRAL),
    new Map(players.map((player) => [player.playerName, player.playerId])),
    save.galaxy.diplomaticRelations.map((relation) => ({ ...relation })),
    save.galaxy.diplomaticProposals.map((proposal) => ({ ...proposal })),
    save.galaxy.nextDiplomaticProposalId,
    save.galaxy.jumpGateRequests.map((request) => ({
      ...request,
      originCoordinates: serializeCoordinates(request.originCoordinates),
      targetCoordinates: serializeCoordinates(request.targetCoordinates)
    })),
    save.galaxy.nextJumpGateRequestId,
    save.galaxy.maintenanceRequests.map((request) => ({
      ...request,
      targetCoordinates: serializeCoordinates(request.targetCoordinates),
      requested: {
        fuel: request.requested.fuel,
        ships: request.requested.ships.map((entry) => ({ ...entry })),
        bombs: request.requested.bombs.map((entry) => ({ ...entry }))
      },
      approved: request.approved
        ? {
          fuel: request.approved.fuel,
          ships: request.approved.ships.map((entry) => ({ ...entry })),
          bombs: request.approved.bombs.map((entry) => ({ ...entry }))
        }
        : null
    })),
    save.galaxy.nextMaintenanceRequestId
  );

  return {
    ownerAccountId: save.ownerAccountId,
    ownerPlayerName: save.ownerPlayerName ?? resolveSavedOwnerPlayerName(save),
    setup: normalizeGalaxySetup(save.setup),
    galaxy
  };
}

export function shouldAutoSaveAfterTurn(currentTurn: number, autoSaveTurns: number): boolean {
  if (!Number.isInteger(currentTurn) || !Number.isInteger(autoSaveTurns) || autoSaveTurns <= 0) {
    return false;
  }

  return currentTurn > 1 && ((currentTurn - 1) % autoSaveTurns) === 0;
}

function ensureSaveDirectory(saveFilePath: string): void {
  fs.mkdirSync(path.dirname(saveFilePath), { recursive: true });
}

function hydrateSavedPlayer(savedPlayer: SavedPlayer): Player {
  const player = new Player(
    savedPlayer.playerId,
    savedPlayer.playerName,
    [],
    Player.techLevelsFromRecord(savedPlayer.techLevels),
    [],
    savedPlayer.type,
    Player.tutorialReadStateFromRecord(savedPlayer.tutorialRead, false),
    savedPlayer.reports.map((report) => hydrateSavedPlayerReport(report)),
    savedPlayer.nextReportId,
    savedPlayer.messages.map((message) => hydrateSavedPlayerMessage(message)),
    savedPlayer.nextMessageId
  );

  player.nextReportId = savedPlayer.nextReportId;
  player.nextMessageId = savedPlayer.nextMessageId;
  return player;
}

function hydrateSavedSolarSystem(
  savedSystem: SavedSolarSystem,
  planetsByCoordinates: Map<string, Planet>,
  planetFleetIdsByCoordinates: Map<string, number[]>
): SolarSystem {
  const starSystemNotes = new Map(
    savedSystem.starSystemNotes.map((note) => [
      note.playerId,
      new StarSystemNoteModel(
        { x: note.coordinates.x, y: note.coordinates.y },
        note.borderColor,
        note.text
      )
    ])
  );
  const system = new SolarSystem(
    savedSystem.name,
    -3,
    savedSystem.isGalaxyCenter,
    savedSystem.isVoid,
    { x: savedSystem.coordinates.x, y: savedSystem.coordinates.y },
    new Set(savedSystem.discoveredByPlayer),
    starSystemNotes
  );
  system.name = savedSystem.name;
  system.isCenterEdge = savedSystem.isCenterEdge;
  system.planets = savedSystem.planets.map((planet) => {
    const hydratedPlanet = hydrateSavedPlanet(planet, system);
    const coordinates = {
      x: savedSystem.coordinates.x,
      y: savedSystem.coordinates.y,
      z: hydratedPlanet.basicInfo.order - 1
    };
    const key = toCoordinatesKey(coordinates);
    planetsByCoordinates.set(key, hydratedPlanet);
    planetFleetIdsByCoordinates.set(key, [...planet.rBDSFTQ.fleetIds]);
    return hydratedPlanet;
  });

  return system;
}

function hydrateSavedPlanet(savedPlanet: SavedPlanet, system: SolarSystem): Planet {
  const currentResearchQueue = savedPlanet.rBDSFTQ.currentResearchQueue
    ? new TechnologyQueueEntry(
      savedPlanet.rBDSFTQ.currentResearchQueue.technologyType,
      savedPlanet.rBDSFTQ.currentResearchQueue.nextLevel,
      savedPlanet.rBDSFTQ.currentResearchQueue.investedResearchPower,
      savedPlanet.rBDSFTQ.currentResearchQueue.helperLabs.map((entry) => serializeCoordinates(entry))
    )
    : null;
  const researchHelperFor = savedPlanet.rBDSFTQ.researchHelperFor
    ? new ResearchHelperFor(
      serializeCoordinates(savedPlanet.rBDSFTQ.researchHelperFor.mainResearchCoordinates),
      savedPlanet.rBDSFTQ.researchHelperFor.technologyType
    )
    : null;

  const planet = new Planet(
    new PlanetBasicInfo(
      savedPlanet.basicInfo.name,
      savedPlanet.basicInfo.type,
      savedPlanet.basicInfo.colonizationDifficulty,
      savedPlanet.basicInfo.order,
      system,
      savedPlanet.basicInfo.image,
      savedPlanet.basicInfo.baseSize,
      savedPlanet.basicInfo.terraformerSizeBonus
    ),
    new PlanetInfo(
      savedPlanet.info.ownerId,
      hydrateSavedPlanetaryParameters(savedPlanet.info.planetaryParameters)
    ),
    new rBDSFTQ(
      hydrateSavedResourcesPack(savedPlanet.rBDSFTQ.resources),
      mapFromNumericRecord(savedPlanet.rBDSFTQ.buildingsLevels),
      mapFromNumericRecord(savedPlanet.rBDSFTQ.buildingsCurrentPowerConsumption),
      mapFromNumericRecord(savedPlanet.rBDSFTQ.buildingsCurrentStructuralPoints),
      ManyDefences.fromData(savedPlanet.rBDSFTQ.defences),
      ManyShips.fromData(savedPlanet.rBDSFTQ.ships),
      currentResearchQueue,
      researchHelperFor,
      savedPlanet.rBDSFTQ.buildingQueue.map((entry) =>
        new BuildingQueueEntry(entry.buildingType, entry.nextLevel, entry.investedIndustryPower)
      ),
      savedPlanet.rBDSFTQ.shipyardQueue.map((entry) =>
        new ShipyardQueueEntry(entry.itemKind, entry.itemKind === 'ship' ? entry.shipType! : entry.defenceType!, entry.amount, entry.investedShipyardPower)
      ),
      [],
      hydrateSavedResourcesPack(savedPlanet.rBDSFTQ.spaceDebris),
      savedPlanet.rBDSFTQ.tradePortOffers.map((offer) => ({ ...offer })),
      savedPlanet.rBDSFTQ.sensorPhalanxScansUsedTurn,
      savedPlanet.rBDSFTQ.sensorPhalanxScansUsed,
      [...savedPlanet.rBDSFTQ.sensorPhalanxKnownIncomingFleetIds]
    ),
    new Map(
      savedPlanet.lastReportData.map((entry) => [
        entry.playerId,
        hydrateSavedPlayerReport(entry.report) as EspionageReportData
      ])
    )
  );

  return planet;
}

function hydrateSavedFleet(savedFleet: SavedFleet): Fleet {
  const fleet = new Fleet(
    savedFleet.fleetId,
    savedFleet.ownerId,
    savedFleet.missionType,
    new Destination(savedFleet.origin.x, savedFleet.origin.y, savedFleet.origin.z),
    new Destination(savedFleet.target.x, savedFleet.target.y, savedFleet.target.z),
    savedFleet.originPlanetName,
    savedFleet.targetPlanetName,
    ManyShips.fromData(savedFleet.ships),
    hydrateSavedResourcesPack(savedFleet.cargo),
    savedFleet.fuelCost,
    savedFleet.totalCargoCapacity,
    savedFleet.usedCargoCapacity,
    savedFleet.travelTurns,
    savedFleet.returnTurns,
    savedFleet.state,
    savedFleet.createdAtTurn,
    ManyDefences.fromData(savedFleet.carriedBombs),
    savedFleet.orbitActivity,
    savedFleet.suspendedMissionType,
    savedFleet.returnReason,
    savedFleet.maintenanceRequestAvailable,
    savedFleet.pendingMaintenanceRequestId,
    savedFleet.usesJumpGate,
    savedFleet.pendingJumpGateRequestId,
    savedFleet.lastMaintenanceRequestTurn,
    savedFleet.bombardmentPriorities ? { ...savedFleet.bombardmentPriorities } : null,
    savedFleet.remainingFuelReserve
  );

  return fleet;
}

function hydrateSavedPlayerMessage(savedMessage: SavedPlayerMessage): PlayerMessageModel {
  return new PlayerMessageModel({
    messageId: savedMessage.messageId,
    createdTurn: savedMessage.createdTurn,
    title: savedMessage.title,
    body: savedMessage.body,
    isRead: savedMessage.isRead,
    senderPlayerId: savedMessage.senderPlayerId,
    senderPlayerName: savedMessage.senderPlayerName
  });
}

function hydrateSavedPlayerReport(savedReport: SavedPlayerReport): PlayerReport {
  const baseData = {
    reportId: savedReport.reportId,
    createdTurn: savedReport.createdTurn,
    title: savedReport.title,
    isRead: savedReport.isRead,
    sourceCoordinates: savedReport.sourceCoordinates ? serializeCoordinates(savedReport.sourceCoordinates) : null,
    sourcePlanetName: savedReport.sourcePlanetName,
    sourceSystemName: savedReport.sourceSystemName,
    senderPlayerName: savedReport.senderPlayerName
  };

  switch (savedReport.reportType) {
    case ReportType.ESPIONAGE_REPORT: {
      if (!isSavedEspionagePlayerReport(savedReport)) {
        return new ProductionReport(baseData, '');
      }

      return new EspionageReportDataModel(
        baseData,
        hydrateSavedPlanetaryParameters(savedReport.planetaryParameters),
        savedReport.averageBuildingLevel,
        savedReport.averageTotalResources,
        savedReport.averageTechLevel,
        savedReport.totalDefencesAmount,
        savedReport.totalShipsAmount,
        mapFromNumericRecord(savedReport.buildingsLevels),
        hydrateSavedResourcesPack(savedReport.resourcesAmount),
        mapFromNumericRecord(savedReport.techLevels),
        savedReport.defences.map((entry) => new DefenceBuildingInstances(entry.type, entry.amount)),
        mapFromNumericRecord(savedReport.ships),
        Object.assign(new ShipyardQueue(), savedReport.shipyardProduction),
        Object.assign(new DefencesQueue(), savedReport.defencesProduction),
        Object.assign(new ResearchQueue(), savedReport.researchProduction),
        Object.assign(new BuildingQueue(), savedReport.buildingProduction)
      );
    }
    case ReportType.DEFENSE_REPORT:
      return new DefenseReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.RESEARCH_REPORT:
      return new ResearchReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.PRODUCTION_REPORT:
      return new ProductionReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.BUILDINGS_REPORT:
      return new BuildingsReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.FLEET_REPORT:
      return new FleetReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.STAR_SYSTEM_ESPIONAGE_REPORT:
      return new StarSystemEspionageReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.SENSOR_PHALANX_REPORT:
      return new SensorPhalanxReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.COLONIZATION_REPORT:
      return new ColonizationReport(baseData, getSavedTextReportBody(savedReport));
    case ReportType.MESSAGE:
      return new MessageReport(baseData, getSavedTextReportBody(savedReport));
    default:
      return new ProductionReport(baseData, getSavedTextReportBody(savedReport));
  }
}

function hydrateSavedResourcesPack(savedResources: SavedResourcesPack): ResourcesPackModel {
  return new ResourcesPackModel(savedResources.metal, savedResources.crystal, savedResources.deuterium);
}

function hydrateSavedPlanetaryParameters(savedParameters: SavedPlanetaryParameters): PlanetaryParametersModel {
  return new PlanetaryParametersModel(
    savedParameters.metalModifier,
    savedParameters.crystalModifier,
    savedParameters.deuteriumModifier,
    savedParameters.energyModifierRES,
    savedParameters.energyModifierNuclear,
    savedParameters.scienceModifier,
    savedParameters.industryModifier,
    savedParameters.anomaliesAndNoise,
    savedParameters.hyperspaceParameters
  );
}

function buildPlanetCoordinateMap(galaxy: Galaxy): Map<Planet, SavedCoordinates> {
  const map = new Map<Planet, SavedCoordinates>();
  for (const row of galaxy.stars) {
    for (const system of row) {
      for (const planet of system.planets) {
        map.set(planet, {
          x: system.coordinates.x,
          y: system.coordinates.y,
          z: planet.basicInfo.order - 1
        });
      }
    }
  }

  return map;
}

function serializePlayer(
  player: Player,
  planetCoordinatesByReference: Map<Planet, SavedCoordinates>
): SavedPlayer {
  return {
    playerId: player.playerId,
    playerName: player.playerName,
    type: player.type,
    tutorialRead: { ...player.tutorialRead },
    nextReportId: player.nextReportId,
    nextMessageId: player.nextMessageId,
    techLevels: mapToNumericRecord(player.tech),
    planetCoordinates: player.planets
      .map((planet) => planetCoordinatesByReference.get(planet))
      .filter((coordinates): coordinates is SavedCoordinates => !!coordinates)
      .map((coordinates) => ({ ...coordinates })),
    fleetIds: player.fleets.map((fleet) => fleet.fleetId),
    reports: player.reports.map((report) => serializePlayerReport(report)),
    messages: player.messages.map((message) => serializePlayerMessage(message))
  };
}

function serializeStarSystemNote(playerId: number, note: StarSystemNote): SavedStarSystemNote {
  return {
    playerId,
    coordinates: {
      x: note.coordinates.x,
      y: note.coordinates.y
    },
    borderColor: note.borderColor,
    text: note.text
  };
}

function serializePlanet(planet: Planet): SavedPlanet {
  return {
    basicInfo: {
      name: planet.basicInfo.name,
      type: planet.basicInfo.type,
      colonizationDifficulty: planet.basicInfo.colonizationDifficulty,
      order: planet.basicInfo.order,
      image: planet.basicInfo.image,
      baseSize: planet.basicInfo.baseSize,
      terraformerSizeBonus: planet.basicInfo.terraformerSizeBonus
    },
    info: {
      ownerId: planet.info.ownerId,
      planetaryParameters: serializePlanetaryParameters(planet.info.planetaryParameters)
    },
    rBDSFTQ: {
      resources: serializeResourcesPack(planet.rBDSFTQ.resources),
      buildingsLevels: mapToNumericRecord(planet.rBDSFTQ.buildingsLevels),
      buildingsCurrentPowerConsumption: mapToNumericRecord(planet.rBDSFTQ.buildingsCurrentPowerConsumption),
      buildingsCurrentStructuralPoints: mapToNumericRecord(planet.rBDSFTQ.buildingsCurrentStructuralPoints),
      defences: serializeManyDefences(planet.rBDSFTQ.defences),
      ships: serializeManyShips(planet.rBDSFTQ.ships),
      currentResearchQueue: planet.rBDSFTQ.currentResearchQueue
        ? {
          technologyType: planet.rBDSFTQ.currentResearchQueue.technologyType,
          nextLevel: planet.rBDSFTQ.currentResearchQueue.nextLevel,
          investedResearchPower: planet.rBDSFTQ.currentResearchQueue.investedResearchPower,
          helperLabs: planet.rBDSFTQ.currentResearchQueue.helperLabs.map((entry) => serializeCoordinates(entry))
        }
        : null,
      researchHelperFor: planet.rBDSFTQ.researchHelperFor
        ? {
          mainResearchCoordinates: serializeCoordinates(
            planet.rBDSFTQ.researchHelperFor.mainResearchCoordinates
          ),
          technologyType: planet.rBDSFTQ.researchHelperFor.technologyType
        }
        : null,
      buildingQueue: planet.rBDSFTQ.buildingQueue.map((entry) => ({
        buildingType: entry.buildingType,
        nextLevel: entry.nextLevel,
        investedIndustryPower: entry.investedIndustryPower
      })),
      shipyardQueue: planet.rBDSFTQ.shipyardQueue.map((entry) => ({
        itemKind: entry.itemKind,
        shipType: entry.shipType,
        defenceType: entry.defenceType,
        amount: entry.amount,
        investedShipyardPower: entry.investedShipyardPower
      })),
      fleetIds: planet.rBDSFTQ.fleets.map((fleet) => fleet.fleetId),
      spaceDebris: serializeResourcesPack(planet.rBDSFTQ.spaceDebris),
      tradePortOffers: planet.rBDSFTQ.tradePortOffers.map((offer) => ({ ...offer })),
      sensorPhalanxScansUsedTurn: planet.rBDSFTQ.sensorPhalanxScansUsedTurn,
      sensorPhalanxScansUsed: planet.rBDSFTQ.sensorPhalanxScansUsed,
      sensorPhalanxKnownIncomingFleetIds: [...planet.rBDSFTQ.sensorPhalanxKnownIncomingFleetIds]
    },
    lastReportData: [...planet.lastReportData.entries()]
      .map(([playerId, report]) => ({
        playerId,
        report: serializeEspionageReport(report)
      }))
      .sort((left, right) => left.playerId - right.playerId)
  };
}

function serializeFleet(fleet: Fleet): SavedFleet {
  return {
    fleetId: fleet.fleetId,
    ownerId: fleet.ownerId,
    missionType: fleet.missionType,
    origin: serializeCoordinates(fleet.origin),
    target: serializeCoordinates(fleet.target),
    originPlanetName: fleet.originPlanetName,
    targetPlanetName: fleet.targetPlanetName,
    ships: serializeManyShips(fleet.ships),
    cargo: serializeResourcesPack(fleet.cargo),
    fuelCost: fleet.fuelCost,
    totalCargoCapacity: fleet.totalCargoCapacity,
    usedCargoCapacity: fleet.usedCargoCapacity,
    travelTurns: fleet.travelTurns,
    returnTurns: fleet.returnTurns,
    state: fleet.state,
    createdAtTurn: fleet.createdAtTurn,
    carriedBombs: serializeManyDefences(fleet.carriedBombs),
    orbitActivity: fleet.orbitActivity,
    suspendedMissionType: fleet.suspendedMissionType,
    returnReason: fleet.returnReason,
    maintenanceRequestAvailable: fleet.maintenanceRequestAvailable,
    pendingMaintenanceRequestId: fleet.pendingMaintenanceRequestId,
    usesJumpGate: fleet.usesJumpGate,
    pendingJumpGateRequestId: fleet.pendingJumpGateRequestId,
    lastMaintenanceRequestTurn: fleet.lastMaintenanceRequestTurn,
    bombardmentPriorities: fleet.bombardmentPriorities
      ? { ...fleet.bombardmentPriorities }
      : null,
    remainingFuelReserve: fleet.remainingFuelReserve
  };
}

function serializePlayerMessage(message: PlayerMessage): SavedPlayerMessage {
  return {
    messageId: message.messageId,
    createdTurn: message.createdTurn,
    title: message.title,
    body: message.body,
    isRead: message.isRead,
    senderPlayerId: message.senderPlayerId,
    senderPlayerName: message.senderPlayerName
  };
}

function serializePlayerReport(report: PlayerReport): SavedPlayerReport {
  if (isEspionageReport(report)) {
    return serializeEspionageReport(report);
  }

  return {
    ...serializePlayerReportBase(report),
    body: 'body' in report && typeof report.body === 'string'
      ? report.body
      : report.show()
  };
}

function serializeEspionageReport(report: EspionageReportData): SavedEspionagePlayerReport {
  return {
    ...serializePlayerReportBase(report),
    planetaryParameters: serializePlanetaryParameters(report.planetaryParameters),
    averageBuildingLevel: report.averageBuildingLevel,
    averageTotalResources: report.averageTotalResources,
    averageTechLevel: report.averageTechLevel,
    totalDefencesAmount: report.totalDefencesAmount,
    totalShipsAmount: report.totalShipsAmount,
    buildingsLevels: mapToNumericRecord(report.buildingsLevels),
    resourcesAmount: serializeResourcesPack(report.resourcesAmount),
    techLevels: mapToNumericRecord(report.techLevels),
    defences: report.defences.map((entry) => ({
      type: entry.type,
      amount: entry.amount
    })),
    ships: mapToNumericRecord(report.ships),
    shipyardProduction: {},
    defencesProduction: {},
    researchProduction: {},
    buildingProduction: {}
  };
}

function serializePlayerReportBase(report: PlayerReport): SavedPlayerReportBase {
  return {
    reportType: report.reportType,
    reportId: report.reportId,
    createdTurn: report.createdTurn,
    title: report.title,
    isRead: report.isRead,
    sourceCoordinates: report.sourceCoordinates
      ? serializeCoordinates(report.sourceCoordinates)
      : null,
    sourcePlanetName: report.sourcePlanetName,
    sourceSystemName: report.sourceSystemName,
    senderPlayerName: report.senderPlayerName
  };
}

function serializeCoordinates(coordinates: SavedCoordinates): SavedCoordinates {
  return {
    x: coordinates.x,
    y: coordinates.y,
    z: coordinates.z
  };
}

function serializeResourcesPack(resources: ResourcesPack): SavedResourcesPack {
  return {
    metal: resources.metal,
    crystal: resources.crystal,
    deuterium: resources.deuterium
  };
}

function serializePlanetaryParameters(parameters: PlanetaryParameters): SavedPlanetaryParameters {
  return {
    metalModifier: parameters.metalModifier,
    crystalModifier: parameters.crystalModifier,
    deuteriumModifier: parameters.deuteriumModifier,
    energyModifierRES: parameters.energyModifierRES,
    energyModifierNuclear: parameters.energyModifierNuclear,
    scienceModifier: parameters.scienceModifier,
    industryModifier: parameters.industryModifier,
    anomaliesAndNoise: parameters.anomaliesAndNoise,
    hyperspaceParameters: parameters.hyperspaceParameters
  };
}

function serializeManyShips(ships: ManyShipsLike): SavedManyShips {
  return {
    undamagedShipsCount: { ...(ships.undamagedShipsCount ?? {}) },
    damagedShips: (ships.damagedShips ?? []).map((entry) => ({
      type: entry.type,
      hull: entry.hull
    }))
  };
}

function serializeManyDefences(defences: ManyDefencesLike): SavedManyDefences {
  return {
    undamagedDefencesCount: { ...(defences.undamagedDefencesCount ?? {}) },
    damagedDefences: (defences.damagedDefences ?? []).map((entry) => ({
      type: entry.type,
      hull: entry.hull
    }))
  };
}

function mapToNumericRecord<T>(
  map: Map<T, number> | null | undefined
): Record<string, number> {
  const record: Record<string, number> = {};
  if (!map) {
    return record;
  }

  for (const [key, value] of map.entries()) {
    if (!Number.isFinite(value)) {
      continue;
    }

    record[String(key)] = value;
  }

  return record;
}

function isEspionageReport(report: PlayerReport): report is EspionageReportData {
  return 'planetaryParameters' in report
    && 'averageBuildingLevel' in report
    && 'buildingsLevels' in report
    && 'techLevels' in report;
}

function isSavedEspionagePlayerReport(
  report: SavedPlayerReport
): report is SavedEspionagePlayerReport {
  return report.reportType === ReportType.ESPIONAGE_REPORT
    && 'planetaryParameters' in report
    && 'resourcesAmount' in report;
}

function getSavedTextReportBody(report: SavedPlayerReport): string {
  return 'body' in report && typeof report.body === 'string'
    ? report.body
    : '';
}

function resolveGalaxySaveOwnerPlayerName(galaxy: Galaxy): string | null {
  return galaxy.players.find((player) => player.type === 'PLAYER')?.playerName ?? null;
}

function resolveSavedOwnerPlayerName(save: SavedGameFile): string | null {
  return save.ownerPlayerName ?? resolveSavedOwnerPlayerNameFromGalaxy(save.galaxy);
}

function resolveSavedOwnerPlayerNameFromGalaxy(galaxy: SavedGalaxy): string | null {
  return galaxy.players.find((player) => player.type === 'PLAYER')?.playerName ?? null;
}

function buildPlayerTypeMap(
  players: Player[],
  playerType: Player['type']
): Map<number, Player> {
  return new Map(
    players
      .filter((player) => player.type === playerType)
      .map((player) => [player.playerId, player])
  );
}

function mapFromNumericRecord<T>(
  record: Record<string, number> | null | undefined
): Map<T, number> {
  const map = new Map<T, number>();
  if (!record) {
    return map;
  }

  for (const [key, value] of Object.entries(record)) {
    if (!Number.isFinite(value)) {
      continue;
    }

    map.set(key as T, value);
  }

  return map;
}

function toCoordinatesKey(coordinates: SavedCoordinates): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}
