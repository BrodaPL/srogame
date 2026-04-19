import fs from 'node:fs';
import path from 'node:path';
import * as gameApiTypesModule from '../../src/app/models/game-api-types.js';
import * as buildingQueueEntryModule from '../../src/app/models/buildings/building-queue-entry.js';
import * as manyDefencesModule from '../../src/app/models/defences/many-defences.js';
import * as destinationModule from '../../src/app/models/fleets/destination.js';
import * as fleetModule from '../../src/app/models/fleets/fleet.js';
import * as manyShipsModule from '../../src/app/models/fleets/many-ships.js';
import * as playerMessageModule from '../../src/app/models/mail/player-message.js';
import * as playerModule from '../../src/app/models/player.js';
import * as galaxyModule from '../../src/app/models/planets/galaxy.js';
import * as planetModule from '../../src/app/models/planets/planet.js';
import * as planetaryParametersModule from '../../src/app/models/planets/planetary-parameters.js';
import * as solarSystemModule from '../../src/app/models/planets/solar-system.js';
import * as starSystemNoteModule from '../../src/app/models/planets/star-system-note.js';
import * as supportRequestModule from '../../src/app/models/requests/support-request.js';
import * as buildingQueueModule from '../../src/app/models/reports/building-queue.js';
import * as buildingsReportModule from '../../src/app/models/reports/buildings-report.js';
import * as colonizationReportModule from '../../src/app/models/reports/colonization-report.js';
import * as defenseReportModule from '../../src/app/models/reports/defense-report.js';
import * as defenceBuildingInstancesModule from '../../src/app/models/reports/defence-building-instances.js';
import * as defencesQueueModule from '../../src/app/models/reports/defences-queue.js';
import * as espionageReportDataModule from '../../src/app/models/reports/espionage-report-data.js';
import * as fleetReportModule from '../../src/app/models/reports/fleet-report.js';
import * as messageReportModule from '../../src/app/models/reports/message-report.js';
import * as productionReportModule from '../../src/app/models/reports/production-report.js';
import * as researchQueueModule from '../../src/app/models/reports/research-queue.js';
import * as researchReportModule from '../../src/app/models/reports/research-report.js';
import * as sensorPhalanxReportModule from '../../src/app/models/reports/sensor-phalanx-report.js';
import * as shipyardQueueModule from '../../src/app/models/reports/shipyard-queue.js';
import * as starSystemEspionageReportModule from '../../src/app/models/reports/star-system-espionage-report.js';
import * as resourcesPackModule from '../../src/app/models/resources-pack.js';
import * as reportTypeEnumModule from '../../src/app/models/enums/report-type.js';
import * as playerTypeEnumModule from '../../src/app/models/enums/player-type.js';
import * as shipyardQueueEntryModule from '../../src/app/models/fleets/shipyard-queue-entry.js';
import * as technologyQueueEntryModule from '../../src/app/models/tech/technology-queue-entry.js';
import * as researchHelperForModule from '../../src/app/models/tech/research-helper-for.js';
import type {
  GameSaveSummary,
  GalaxySetup
} from '../../src/app/models/game-api-types.ts';
import type { BuildingQueueEntry as BuildingQueueEntryModel } from '../../src/app/models/buildings/building-queue-entry.ts';
import type { Fleet as FleetModel } from '../../src/app/models/fleets/fleet.ts';
import type { ShipyardQueueEntry as ShipyardQueueEntryModel } from '../../src/app/models/fleets/shipyard-queue-entry.ts';
import type { PlayerReport } from '../../src/app/models/reports/player-report.ts';
import type { EspionageReportData } from '../../src/app/models/reports/espionage-report-data.ts';
import type { ManyShipsLike } from '../../src/app/models/fleets/many-ships.ts';
import type { ManyDefencesLike } from '../../src/app/models/defences/many-defences.ts';
import type { PlayerMessage } from '../../src/app/models/mail/player-message.ts';
import type { PlayerMessage as PlayerMessageModelType } from '../../src/app/models/mail/player-message.ts';
import type { Player as PlayerModel } from '../../src/app/models/player.ts';
import type { Galaxy as GalaxyModel } from '../../src/app/models/planets/galaxy.ts';
import type { Planet as PlanetModel } from '../../src/app/models/planets/planet.ts';
import type { SolarSystem as SolarSystemModel } from '../../src/app/models/planets/solar-system.ts';
import type { ResourcesPack } from '../../src/app/models/resources-pack.ts';
import type { ResourcesPack as ResourcesPackModelType } from '../../src/app/models/resources-pack.ts';
import type { PlanetaryParameters } from '../../src/app/models/planets/planetary-parameters.ts';
import type { PlanetaryParameters as PlanetaryParametersModelType } from '../../src/app/models/planets/planetary-parameters.ts';
import type { StarSystemNote } from '../../src/app/models/planets/star-system-note.ts';
import type { DefenceType } from '../../src/app/models/enums/defence-type.ts';
import type { TechnologyQueueEntry as TechnologyQueueEntryModel } from '../../src/app/models/tech/technology-queue-entry.ts';
import type { ResearchHelperFor as ResearchHelperForModel } from '../../src/app/models/tech/research-helper-for.ts';
import type { SupportRequest } from '../../src/app/models/requests/support-request.ts';

function resolveModule<T>(module: T): T extends { default: infer U } ? U : T {
  return ((module as { default?: unknown }).default ?? module) as T extends { default: infer U } ? U : T;
}

const { BuildingQueueEntry } = resolveModule(buildingQueueEntryModule) as typeof import('../../src/app/models/buildings/building-queue-entry.js');
const { ManyDefences } = resolveModule(manyDefencesModule) as typeof import('../../src/app/models/defences/many-defences.js');
const { Destination } = resolveModule(destinationModule) as typeof import('../../src/app/models/fleets/destination.js');
const { Fleet } = resolveModule(fleetModule) as typeof import('../../src/app/models/fleets/fleet.js');
const { ManyShips } = resolveModule(manyShipsModule) as typeof import('../../src/app/models/fleets/many-ships.js');
const { PlayerMessage: PlayerMessageModel } = resolveModule(playerMessageModule) as typeof import('../../src/app/models/mail/player-message.js');
const { Player } = resolveModule(playerModule) as typeof import('../../src/app/models/player.js');
const { Galaxy } = resolveModule(galaxyModule) as typeof import('../../src/app/models/planets/galaxy.js');
const { Planet, PlanetBasicInfo, PlanetInfo, rBDSFTQ } = resolveModule(planetModule) as typeof import('../../src/app/models/planets/planet.js');
const { PlanetaryParameters: PlanetaryParametersModel } = resolveModule(planetaryParametersModule) as typeof import('../../src/app/models/planets/planetary-parameters.js');
const { SolarSystem } = resolveModule(solarSystemModule) as typeof import('../../src/app/models/planets/solar-system.js');
const { StarSystemNote: StarSystemNoteModel } = resolveModule(starSystemNoteModule) as typeof import('../../src/app/models/planets/star-system-note.js');
const { normalizeSupportResources } = resolveModule(supportRequestModule) as typeof import('../../src/app/models/requests/support-request.js');
const { BuildingQueue } = resolveModule(buildingQueueModule) as typeof import('../../src/app/models/reports/building-queue.js');
const { BuildingsReport } = resolveModule(buildingsReportModule) as typeof import('../../src/app/models/reports/buildings-report.js');
const { ColonizationReport } = resolveModule(colonizationReportModule) as typeof import('../../src/app/models/reports/colonization-report.js');
const { DefenseReport } = resolveModule(defenseReportModule) as typeof import('../../src/app/models/reports/defense-report.js');
const { DefenceBuildingInstances } = resolveModule(defenceBuildingInstancesModule) as typeof import('../../src/app/models/reports/defence-building-instances.js');
const { DefencesQueue } = resolveModule(defencesQueueModule) as typeof import('../../src/app/models/reports/defences-queue.js');
const { EspionageReportData: EspionageReportDataModel } = resolveModule(espionageReportDataModule) as typeof import('../../src/app/models/reports/espionage-report-data.js');
const { FleetReport } = resolveModule(fleetReportModule) as typeof import('../../src/app/models/reports/fleet-report.js');
const { MessageReport } = resolveModule(messageReportModule) as typeof import('../../src/app/models/reports/message-report.js');
const { ProductionReport } = resolveModule(productionReportModule) as typeof import('../../src/app/models/reports/production-report.js');
const { ResearchQueue } = resolveModule(researchQueueModule) as typeof import('../../src/app/models/reports/research-queue.js');
const { ResearchReport } = resolveModule(researchReportModule) as typeof import('../../src/app/models/reports/research-report.js');
const { SensorPhalanxReport } = resolveModule(sensorPhalanxReportModule) as typeof import('../../src/app/models/reports/sensor-phalanx-report.js');
const { ShipyardQueue } = resolveModule(shipyardQueueModule) as typeof import('../../src/app/models/reports/shipyard-queue.js');
const { StarSystemEspionageReport } = resolveModule(starSystemEspionageReportModule) as typeof import('../../src/app/models/reports/star-system-espionage-report.js');
const { ResourcesPack: ResourcesPackModel } = resolveModule(resourcesPackModule) as typeof import('../../src/app/models/resources-pack.js');
const { normalizeGalaxySetup } = resolveModule(gameApiTypesModule) as typeof import('../../src/app/models/game-api-types.js');
const { ReportType } = resolveModule(reportTypeEnumModule) as typeof import('../../src/app/models/enums/report-type.js');
const { PlayerType } = resolveModule(playerTypeEnumModule) as typeof import('../../src/app/models/enums/player-type.js');
const { ShipyardQueueEntry } = resolveModule(shipyardQueueEntryModule) as typeof import('../../src/app/models/fleets/shipyard-queue-entry.js');
const { TechnologyQueueEntry } = resolveModule(technologyQueueEntryModule) as typeof import('../../src/app/models/tech/technology-queue-entry.js');
const { ResearchHelperFor } = resolveModule(researchHelperForModule) as typeof import('../../src/app/models/tech/research-helper-for.js');

export const GAME_SAVE_VERSION = 3;
export const AUTO_SAVE_ROTATION_LIMIT = 5;
export const MAX_GAME_SAVE_FILES = 100;

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
  diff?: number;
  size?: number;
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
  type: PlayerModel['type'];
  tutorialRead: PlayerModel['tutorialRead'];
  nextReportId: number;
  nextMessageId: number;
  techLevels: Record<string, number>;
  planetCoordinates: SavedCoordinates[];
  fleetIds: number[];
  reports: SavedPlayerReport[];
  messages: SavedPlayerMessage[];
  botProfileId: PlayerModel['botProfileId'];
  botMemory: PlayerModel['botMemory'];
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
  missionType: FleetModel['missionType'];
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
  state: FleetModel['state'];
  createdAtTurn: number;
  carriedBombs: SavedManyDefences;
  orbitActivity: FleetModel['orbitActivity'];
  suspendedMissionType: FleetModel['suspendedMissionType'];
  returnReason: FleetModel['returnReason'];
  maintenanceRequestAvailable: boolean;
  pendingMaintenanceRequestId: number | null;
  usesJumpGate: boolean;
  pendingJumpGateRequestId: number | null;
  lastMaintenanceRequestTurn: number | null;
  bombardmentPriorities: FleetModel['bombardmentPriorities'];
  remainingFuelReserve: number;
};

type SavedResourceSupportRequest = Omit<
  Extract<SupportRequest, { supportType: 'RESOURCE_SUPPORT' }>,
  'targetCoordinates' | 'requestedResources' | 'approvedResources' | 'reservedSourceCoordinates'
> & {
  targetCoordinates: SavedCoordinates;
  requestedResources: SavedResourcesPack;
  approvedResources: SavedResourcesPack | null;
  reservedSourceCoordinates: SavedCoordinates | null;
};

type SavedOffensiveSupportRequest = Omit<
  Extract<SupportRequest, { supportType: 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }>,
  'targetCoordinates' | 'launchOriginCoordinates'
> & {
  targetCoordinates: SavedCoordinates;
  launchOriginCoordinates: SavedCoordinates | null;
};

type SavedPassiveSupportRequest = Omit<
  Exclude<
    SupportRequest,
    Extract<SupportRequest, { supportType: 'RESOURCE_SUPPORT' | 'ATTACK_TARGET' | 'BOMBARD_TARGET' | 'SIEGE_TARGET' }>
  >,
  'targetCoordinates'
> & {
  targetCoordinates: SavedCoordinates;
};

type SavedSupportRequest =
  | SavedResourceSupportRequest
  | SavedOffensiveSupportRequest
  | SavedPassiveSupportRequest;

type SavedPlanet = {
  basicInfo: {
    name: string;
    type: PlanetModel['basicInfo']['type'];
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
    fusionReactorSelectedStage?: number | null;
    buildingsCurrentStructuralPoints: Record<string, number>;
    defences: SavedManyDefences;
    ships: SavedManyShips;
    currentResearchQueue: TechnologyQueueEntryModel | null;
    researchHelperFor: ResearchHelperForModel | null;
    buildingQueue: BuildingQueueEntryModel[];
    shipyardQueue: ShipyardQueueEntryModel[];
    fleetIds: number[];
    spaceDebris: SavedResourcesPack;
    tradePortOffers: PlanetModel['rBDSFTQ']['tradePortOffers'];
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
  nextSupportRequestId: number;
  players: SavedPlayer[];
  stars: SavedSolarSystem[][];
  activeFleets: SavedFleet[];
  diplomaticRelations: GalaxyModel['diplomaticRelations'];
  diplomaticProposals: GalaxyModel['diplomaticProposals'];
  jumpGateRequests: GalaxyModel['jumpGateRequests'];
  maintenanceRequests: GalaxyModel['maintenanceRequests'];
  supportRequests: SavedSupportRequest[];
};

export type SavedGameFile = {
  version: number;
  gameId: string | null;
  saveType: 'AUTOSAVE';
  autoSaveSlot: number | null;
  savedAt: string;
  ownerAccountId: number;
  ownerPlayerName: string | null;
  setup: GalaxySetup;
  galaxy: SavedGalaxy;
};

export type HydratedGameSave = {
  gameId: string | null;
  ownerAccountId: number;
  ownerPlayerName: string | null;
  setup: GalaxySetup;
  galaxy: GalaxyModel;
};

export type GameSaveLoadAccess = {
  canLoad: boolean;
  canLoadReason: string | null;
};

export type RotatingAutoSaveOptions = {
  rotationLimit?: number;
  maxSaveFiles?: number;
  savedAt?: string;
  gameId?: string | null;
};

export function createGameSave(
  galaxy: GalaxyModel,
  ownerAccountId: number,
  setup: GalaxySetup,
  savedAt = new Date().toISOString(),
  autoSaveSlot: number | null = null,
  gameId: string | null = null
): SavedGameFile {
  const planetCoordinatesByReference = buildPlanetCoordinateMap(galaxy);

  return {
    version: GAME_SAVE_VERSION,
    gameId,
    saveType: 'AUTOSAVE',
    autoSaveSlot,
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
      nextSupportRequestId: galaxy.nextSupportRequestId,
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
      })),
      supportRequests: galaxy.supportRequests.map((request) => serializeSupportRequest(request))
    }
  };
}

export function saveGameFile(saveFilePath: string, data: SavedGameFile): void {
  ensureSaveDirectory(saveFilePath);
  fs.writeFileSync(saveFilePath, JSON.stringify(data, null, 2), 'utf-8');
}

export function listGameSaveSummaries(saveDirectoryPath: string): GameSaveSummary[] {
  if (!fs.existsSync(saveDirectoryPath)) {
    return [];
  }

  return fs.readdirSync(saveDirectoryPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => {
      const save = readGameSave(path.join(saveDirectoryPath, entry.name));
      return save ? buildGameSaveSummary(save, entry.name) : null;
    })
    .filter((summary): summary is GameSaveSummary => !!summary)
    .sort(compareGameSaveSummariesDesc);
}

export function listGameSaveSummariesForGame(
  saveDirectoryPath: string,
  gameId: string | null
): GameSaveSummary[] {
  return listGameSaveSummaries(saveDirectoryPath).filter((summary) => summary.gameId === gameId);
}

export function readGameSaveById(
  saveDirectoryPath: string,
  saveId: string
): SavedGameFile | null {
  const safeSaveId = normalizeSaveId(saveId);
  if (!safeSaveId) {
    return null;
  }

  return readGameSave(path.join(saveDirectoryPath, safeSaveId));
}

export function deleteGameSaveById(
  saveDirectoryPath: string,
  saveId: string
): boolean {
  const safeSaveId = normalizeSaveId(saveId);
  if (!safeSaveId) {
    return false;
  }

  const savePath = path.join(saveDirectoryPath, safeSaveId);
  if (!fs.existsSync(savePath)) {
    return false;
  }

  fs.rmSync(savePath, { force: true });
  return true;
}

export function writeRotatingAutoSave(
  saveDirectoryPath: string,
  galaxy: GalaxyModel,
  ownerAccountId: number,
  setup: GalaxySetup,
  options: RotatingAutoSaveOptions = {}
): GameSaveSummary {
  const rotationLimit = normalizePositiveInteger(options.rotationLimit, AUTO_SAVE_ROTATION_LIMIT);
  const maxSaveFiles = normalizePositiveInteger(options.maxSaveFiles, MAX_GAME_SAVE_FILES);
  const gameId = normalizeGameIdOrNull(options.gameId);
  const existingSaves = gameId === null
    ? listGameSaveSummaries(saveDirectoryPath)
    : listGameSaveSummariesForGame(saveDirectoryPath, gameId);
  const autosaves = existingSaves.filter((save) => save.saveType === 'AUTOSAVE');
  const latestAutosave = autosaves[0] ?? null;
  const nextSlot = latestAutosave?.autoSaveSlot
    ? (latestAutosave.autoSaveSlot % rotationLimit) + 1
    : 1;

  const existingSlotSave = autosaves.find((save) => save.autoSaveSlot === nextSlot);
  if (existingSlotSave) {
    deleteGameSaveById(saveDirectoryPath, existingSlotSave.saveId);
  }

  const save = createGameSave(
    galaxy,
    ownerAccountId,
    setup,
    options.savedAt ?? new Date().toISOString(),
    nextSlot,
    gameId
  );
  const saveId = buildGameSaveFileName(save);
  saveGameFile(path.join(saveDirectoryPath, saveId), save);
  pruneGameSaves(saveDirectoryPath, maxSaveFiles);

  return buildGameSaveSummary(save, saveId);
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
    gameId: normalizeGameIdOrNull(parsed.gameId),
    saveType: parsed.saveType === 'AUTOSAVE' ? parsed.saveType : 'AUTOSAVE',
    autoSaveSlot: typeof parsed.autoSaveSlot === 'number' && Number.isInteger(parsed.autoSaveSlot)
      ? parsed.autoSaveSlot
      : null,
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

export function buildGameSaveSummary(save: SavedGameFile, saveId = buildGameSaveFileName(save)): GameSaveSummary {
  return {
    gameId: save.gameId,
    saveId,
    displayName: buildGameSaveDisplayName(save),
    saveType: save.saveType,
    autoSaveSlot: save.autoSaveSlot,
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
  currentAccountId: number | null,
  currentIsLocalAdmin: boolean
): GameSaveLoadAccess {
  if (!save) {
    return { canLoad: false, canLoadReason: 'No saved game found.' };
  }

  if (currentAccountId === null) {
    return { canLoad: false, canLoadReason: 'Login required to load the saved game.' };
  }

  if (!currentIsLocalAdmin) {
    return { canLoad: false, canLoadReason: 'Local admin privileges are required to load the saved game.' };
  }

  return { canLoad: true, canLoadReason: null };
}

export function getLatestGameSaveSummary(saveDirectoryPath: string): GameSaveSummary | null {
  return listGameSaveSummaries(saveDirectoryPath)[0] ?? null;
}

export function getLatestGameSaveSummaryForGame(
  saveDirectoryPath: string,
  gameId: string | null
): GameSaveSummary | null {
  return listGameSaveSummariesForGame(saveDirectoryPath, gameId)[0] ?? null;
}

export function readLatestGameSave(saveDirectoryPath: string): SavedGameFile | null {
  const latestSummary = getLatestGameSaveSummary(saveDirectoryPath);
  if (!latestSummary) {
    return null;
  }

  return readGameSaveById(saveDirectoryPath, latestSummary.saveId);
}

export function readLatestGameSaveForGame(
  saveDirectoryPath: string,
  gameId: string | null
): SavedGameFile | null {
  const latestSummary = getLatestGameSaveSummaryForGame(saveDirectoryPath, gameId);
  if (!latestSummary) {
    return null;
  }

  return readGameSaveById(saveDirectoryPath, latestSummary.saveId);
}

export function hydrateGameSave(save: SavedGameFile): HydratedGameSave {
  const players = save.galaxy.players.map((player) => hydrateSavedPlayer(player));
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const planetsByCoordinates = new Map<string, PlanetModel>();
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
      .filter((planet): planet is PlanetModel => !!planet);
    player.fleets = savedPlayer.fleetIds
      .map((fleetId) => fleetsById.get(fleetId))
      .filter((fleet): fleet is FleetModel => !!fleet);
  }

  for (const [coordinatesKey, planet] of planetsByCoordinates.entries()) {
    const fleetIds = planetFleetIdsByCoordinates.get(coordinatesKey) ?? [];
    planet.rBDSFTQ.fleets = fleetIds
      .map((fleetId) => fleetsById.get(fleetId))
      .filter((fleet): fleet is FleetModel => !!fleet);
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
    (save.galaxy.jumpGateRequests ?? []).map((request) => ({
      ...request,
      originCoordinates: serializeCoordinates(request.originCoordinates),
      targetCoordinates: serializeCoordinates(request.targetCoordinates)
    })),
    save.galaxy.nextJumpGateRequestId ?? 1,
    (save.galaxy.maintenanceRequests ?? []).map((request) => ({
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
    save.galaxy.nextMaintenanceRequestId ?? 1,
    (save.galaxy.supportRequests ?? []).map((request) => hydrateSupportRequest(request)),
    save.galaxy.nextSupportRequestId ?? 1
  );

  return {
    gameId: save.gameId,
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

function hydrateSavedPlayer(savedPlayer: SavedPlayer): PlayerModel {
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
    savedPlayer.nextMessageId,
    {
      botProfileId: savedPlayer.botProfileId ?? null,
      botMemory: Player.normalizeBotMemory(savedPlayer.botMemory ?? null)
    }
  );

  player.nextReportId = savedPlayer.nextReportId;
  player.nextMessageId = savedPlayer.nextMessageId;
  return player;
}

function hydrateSavedSolarSystem(
  savedSystem: SavedSolarSystem,
  planetsByCoordinates: Map<string, PlanetModel>,
  planetFleetIdsByCoordinates: Map<string, number[]>
): SolarSystemModel {
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

function hydrateSavedPlanet(savedPlanet: SavedPlanet, system: SolarSystemModel): PlanetModel {
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
      typeof savedPlanet.rBDSFTQ.fusionReactorSelectedStage === 'number'
        ? savedPlanet.rBDSFTQ.fusionReactorSelectedStage
        : null,
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

  planet.normalizeBuildingQueueProgress();

  return planet;
}

function hydrateSavedFleet(savedFleet: SavedFleet): FleetModel {
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

function hydrateSavedPlayerMessage(savedMessage: SavedPlayerMessage): PlayerMessageModelType {
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
        savedReport.diff ?? 0,
        savedReport.size ?? 0,
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

function hydrateSavedResourcesPack(savedResources: SavedResourcesPack): ResourcesPackModelType {
  return new ResourcesPackModel(savedResources.metal, savedResources.crystal, savedResources.deuterium);
}

function hydrateSavedPlanetaryParameters(savedParameters: SavedPlanetaryParameters): PlanetaryParametersModelType {
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

function buildPlanetCoordinateMap(galaxy: GalaxyModel): Map<PlanetModel, SavedCoordinates> {
  const map = new Map<PlanetModel, SavedCoordinates>();
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
  player: PlayerModel,
  planetCoordinatesByReference: Map<PlanetModel, SavedCoordinates>
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
    messages: player.messages.map((message) => serializePlayerMessage(message)),
    botProfileId: player.botProfileId,
    botMemory: player.botMemory
      ? {
        currentGoal: player.botMemory.currentGoal,
        goalTarget: player.botMemory.goalTarget ? { ...player.botMemory.goalTarget } : null,
        goalExpiresTurn: player.botMemory.goalExpiresTurn,
        reservedResources: { ...player.botMemory.reservedResources },
        lastSpyTargets: player.botMemory.lastSpyTargets.map((entry) => ({ ...entry })),
        lastAttackTargets: player.botMemory.lastAttackTargets.map((entry) => ({ ...entry })),
        recentDiplomacyTargets: player.botMemory.recentDiplomacyTargets.map((entry) => ({ ...entry })),
        goodwillByPlayer: (player.botMemory.goodwillByPlayer ?? []).map((entry) => ({ ...entry })),
        recentSupportRequests: (player.botMemory.recentSupportRequests ?? []).map((entry) => ({
          ...entry,
          targetCoordinates: { ...entry.targetCoordinates }
        })),
        processedSupportOutcomeIds: [...(player.botMemory.processedSupportOutcomeIds ?? [])],
        farmTargets: (player.botMemory.farmTargets ?? []).map((entry) => ({
          ...entry,
          targetCoordinates: { ...entry.targetCoordinates }
        })),
        lastProcessedFleetReportId: player.botMemory.lastProcessedFleetReportId ?? null
      }
      : null
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

function serializePlanet(planet: PlanetModel): SavedPlanet {
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
      fusionReactorSelectedStage: planet.getFusionReactorSelectedStage(),
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

function serializeSupportRequest(request: SupportRequest): SavedSupportRequest {
  if (request.supportType === 'RESOURCE_SUPPORT') {
    return {
      ...request,
      targetCoordinates: serializeCoordinates(request.targetCoordinates),
      requestedResources: {
        metal: request.requestedResources.metal,
        crystal: request.requestedResources.crystal,
        deuterium: request.requestedResources.deuterium
      },
      approvedResources: request.approvedResources
        ? {
          metal: request.approvedResources.metal,
          crystal: request.approvedResources.crystal,
          deuterium: request.approvedResources.deuterium
        }
        : null,
      reservedSourceCoordinates: request.reservedSourceCoordinates
        ? serializeCoordinates(request.reservedSourceCoordinates)
        : null
    };
  }

  if (
    request.supportType === 'ATTACK_TARGET'
    || request.supportType === 'BOMBARD_TARGET'
    || request.supportType === 'SIEGE_TARGET'
  ) {
    return {
      ...request,
      targetCoordinates: serializeCoordinates(request.targetCoordinates),
      launchOriginCoordinates: request.launchOriginCoordinates
        ? serializeCoordinates(request.launchOriginCoordinates)
        : null
    };
  }

  return {
    ...request,
    targetCoordinates: serializeCoordinates(request.targetCoordinates)
  };
}

function hydrateSupportRequest(request: SavedSupportRequest): SupportRequest {
  if (request.supportType === 'RESOURCE_SUPPORT') {
    return {
      ...request,
      targetCoordinates: serializeCoordinates(request.targetCoordinates),
      requestedResources: normalizeSupportResources(request.requestedResources),
      approvedResources: request.approvedResources
        ? normalizeSupportResources(request.approvedResources)
        : null,
      reservedSourceCoordinates: request.reservedSourceCoordinates
        ? serializeCoordinates(request.reservedSourceCoordinates)
        : null
    };
  }

  if (
    request.supportType === 'ATTACK_TARGET'
    || request.supportType === 'BOMBARD_TARGET'
    || request.supportType === 'SIEGE_TARGET'
  ) {
    return {
      ...request,
      targetCoordinates: serializeCoordinates(request.targetCoordinates),
      launchOriginCoordinates: request.launchOriginCoordinates
        ? serializeCoordinates(request.launchOriginCoordinates)
        : null
    };
  }

  return {
    ...request,
    targetCoordinates: serializeCoordinates(request.targetCoordinates)
  };
}

function serializeFleet(fleet: FleetModel): SavedFleet {
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
    diff: report.diff,
    size: report.size,
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

function resolveGalaxySaveOwnerPlayerName(galaxy: GalaxyModel): string | null {
  return galaxy.players.find((player) => player.type === 'PLAYER')?.playerName ?? null;
}

function resolveSavedOwnerPlayerName(save: SavedGameFile): string | null {
  return save.ownerPlayerName ?? resolveSavedOwnerPlayerNameFromGalaxy(save.galaxy);
}

function resolveSavedOwnerPlayerNameFromGalaxy(galaxy: SavedGalaxy): string | null {
  return galaxy.players.find((player) => player.type === 'PLAYER')?.playerName ?? null;
}

function buildGameSaveFileName(save: SavedGameFile): string {
  const galaxySlug = slugifySaveName(save.galaxy.name);
  const gameSuffix = save.gameId ? `-game-${slugifySaveName(save.gameId).slice(0, 16)}` : '';
  const timestamp = formatSaveTimestamp(save.savedAt);
  const slotSuffix = save.autoSaveSlot !== null ? `-autosave-${save.autoSaveSlot}` : '';
  return `${galaxySlug}${gameSuffix}-turn-${save.galaxy.currentTurn}-${timestamp}${slotSuffix}.json`;
}

function buildGameSaveDisplayName(save: SavedGameFile): string {
  const slotLabel = save.autoSaveSlot !== null ? ` (Autosave ${save.autoSaveSlot})` : '';
  return `${save.galaxy.name} - Turn ${save.galaxy.currentTurn} - ${save.savedAt}${slotLabel}`;
}

function slugifySaveName(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

  return slug || 'galaxy-save';
}

function formatSaveTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '00000000-000000';
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');

  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function compareGameSaveSummariesDesc(left: GameSaveSummary, right: GameSaveSummary): number {
  const leftTime = Date.parse(left.savedAt);
  const rightTime = Date.parse(right.savedAt);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return right.saveId.localeCompare(left.saveId);
}

function normalizeGameIdOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : null;
}

function normalizeSaveId(saveId: string): string | null {
  const normalized = path.basename(saveId).trim();
  if (!normalized || normalized !== saveId || !normalized.endsWith('.json')) {
    return null;
  }

  return normalized;
}

function pruneGameSaves(saveDirectoryPath: string, maxSaveFiles: number): void {
  const saves = listGameSaveSummaries(saveDirectoryPath);
  if (saves.length <= maxSaveFiles) {
    return;
  }

  for (const save of saves.slice(maxSaveFiles)) {
    deleteGameSaveById(saveDirectoryPath, save.saveId);
  }
}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function buildPlayerTypeMap(
  players: PlayerModel[],
  playerType: PlayerModel['type']
): Map<number, PlayerModel> {
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
