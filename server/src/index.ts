import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import galaxyCreatorModule from '../../src/app/models/planets/galaxy-creator.js';
import galaxyPresentationDataModule from '../../src/app/models/planets/galaxy-presentation-data.js';
import espionageReportGeneratorModule from '../../src/app/generators/espionage-report-generator.js';
import starSystemNoteModule from '../../src/app/models/planets/star-system-note.js';
import noteBorderColorModule from '../../src/app/models/enums/note-border-color.js';
import buildingTypeEnumModule from '../../src/app/models/enums/building-type.js';
import defenceTypeEnumModule from '../../src/app/models/enums/defence-type.js';
import technologyTypeEnumModule from '../../src/app/models/enums/technology-type.js';
import shipTypeEnumModule from '../../src/app/models/enums/ship-type.js';
import fleetMissionTypeEnumModule from '../../src/app/models/enums/fleet-mission-type.js';
import fleetModelModule from '../../src/app/models/fleets/fleet.js';
import manyShipsModule from '../../src/app/models/fleets/many-ships.js';
import reportTypeEnumModule from '../../src/app/models/enums/report-type.js';
import diplomaticStatusEnumModule from '../../src/app/models/diplomacy/diplomatic-status.js';
import diplomacyResolverModule from '../../src/app/models/diplomacy/diplomacy-resolver.js';
import planetaryBombModule from '../../src/app/models/defences/planetary-bomb.js';
import tutorialTypesModule from '../../src/app/tutorial/tutorial-types.js';
import buildingBlueprintsFactoryModule from '../../src/app/factories/building-blueprints.factory.js';
import defenceBlueprintsFactoryModule from '../../src/app/factories/defence-blueprints.factory.js';
import shipBlueprintsFactoryModule from '../../src/app/factories/ship-blueprints.factory.js';
import technologyBlueprintsFactoryModule from '../../src/app/factories/technology-blueprints.factory.js';
import fleetMissionRegistryModule from '../../src/app/models/missions/fleet-mission-registry.js';
import buildingQueueEntryModule from '../../src/app/models/buildings/building-queue-entry.js';
import shipyardQueueEntryModule from '../../src/app/models/fleets/shipyard-queue-entry.js';
import technologyQueueEntryModule from '../../src/app/models/tech/technology-queue-entry.js';
import researchHelperForModule from '../../src/app/models/tech/research-helper-for.js';
import technologyEffectsModule from '../../src/app/models/tech/technology-effects.js';
import phaseOneTurnResolverModule from '../../src/app/models/turns/phase-one-turn-resolver.js';
import smokeTestScenariosModule from '../../src/app/models/testing/smoke-test-scenarios.js';
import queueManagementModule from '../../src/app/models/queues/queue-management.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type {
  EndTurnResponse,
  GalaxySetup,
  PlayerSession,
  GalaxySnapshot,
  StartGameRequest,
  StartGameResponse,
  GameStateResponse,
  ClientGalaxyDto,
  GalaxyPresentationDataDto,
  GalaxyByteCellDto,
  OwnershipByteCellDto,
  StarSystemNoteDto,
  ClientStarSystemDto,
  ClientPlanetDto,
  ClientCoordinates,
  ClientReportDataDto,
  ResourcesPackDto,
  PlanetaryParametersDto,
  BuildingLevelEntry,
  BuildingPowerConsumptionEntry,
  BuildingStructuralPointsEntry,
  TechLevelEntry,
  ShipAmountEntry,
  CreateFleetShipSelectionEntry,
  ClientInfoDto,
  PlayerNameEntry,
  LoginRequest,
  RegisterRequest,
  UpsertStarSystemNoteRequest,
  SetBuildingPowerConsumptionRequest,
  SetBuildingPowerConsumptionResponse,
  StartBuildingConstructionRequest,
  ReorderBuildingQueueRequest,
  CancelBuildingQueueEntryRequest,
  StartShipyardConstructionRequest,
  ReorderShipyardQueueRequest,
  CancelShipyardQueueEntryRequest,
  StartTechnologyResearchRequest,
  CreateFleetMissionRequest,
  CreateFleetBombSelectionEntry,
  CreateFleetMissionResponse,
  PlayerReportDto,
  PlayerReportDtoBase,
  MessageReportDto,
  TextPlayerReportDto,
  EspionagePlayerReportDto,
  MarkPlayerReportReadRequest,
  DeletePlayerReportsRequest,
  DeletePlayerReportsResponse,
  DiplomaticRelationDto,
  SetDiplomaticRelationRequest
} from '../../src/app/models/game-api-types.ts';
import type { ClientGalaxy } from '../../src/app/models/planets/client-galaxy.ts';
import type { ClientStarSystem } from '../../src/app/models/planets/client-star-system.ts';
import type { ClientPlanet } from '../../src/app/models/planets/client-planet.ts';
import type { Planet } from '../../src/app/models/planets/planet.ts';
import type { PlanetaryParameters } from '../../src/app/models/planets/planetary-parameters.ts';
import type { ResourcesPack } from '../../src/app/models/resources-pack.ts';
import type { EspionageReportData } from '../../src/app/models/reports/espionage-report-data.ts';
import type { GalaxyPresentationData as GalaxyPresentationDataType } from '../../src/app/models/planets/galaxy-presentation-data.ts';
import type { GalaxyByteCell } from '../../src/app/models/planets/galaxy-byte-cell.ts';
import type { OwnershipByteCell } from '../../src/app/models/planets/ownership-byte-cell.ts';
import type { StarSystemNote as StarSystemNoteType } from '../../src/app/models/planets/star-system-note.ts';
import type { NoteBorderColor as NoteBorderColorType } from '../../src/app/models/enums/note-border-color.ts';
import type { BuildingType as BuildingTypeType } from '../../src/app/models/enums/building-type.ts';
import type { DefenceType as DefenceTypeType } from '../../src/app/models/enums/defence-type.ts';
import type { TechnologyType as TechnologyTypeType } from '../../src/app/models/enums/technology-type.ts';
import type { ShipType as ShipTypeType } from '../../src/app/models/enums/ship-type.ts';
import type { FleetMissionType as FleetMissionTypeType } from '../../src/app/models/enums/fleet-mission-type.ts';
import type { Building } from '../../src/app/models/buildings/building.ts';
import type { Defence } from '../../src/app/models/defences/defence.ts';
import type { Ship } from '../../src/app/models/fleets/ship.ts';
import type { Technology } from '../../src/app/models/tech/technology.ts';
import type { Player } from '../../src/app/models/player.ts';
import type { Fleet } from '../../src/app/models/fleets/fleet.ts';
import type { MissionLaunchContext } from '../../src/app/models/missions/mission-context.ts';
import type { DiplomaticStatus as DiplomaticStatusType } from '../../src/app/models/diplomacy/diplomatic-status.ts';
import type { DiplomaticRelation } from '../../src/app/models/diplomacy/diplomatic-relation.ts';
import type {
  ManyShips as ManyShipsType,
  ShipSelectionEntry as ShipSelectionEntryType
} from '../../src/app/models/fleets/many-ships.ts';
import type { PlayerReport } from '../../src/app/models/reports/player-report.ts';
import type { MessageReport } from '../../src/app/models/reports/message-report.ts';
import type { ReportType as ReportTypeType } from '../../src/app/models/enums/report-type.ts';

const { GalaxyCreator } = galaxyCreatorModule as {
  GalaxyCreator: typeof import('../../src/app/models/planets/galaxy-creator.js').GalaxyCreator;
};
const { GalaxyPresentationData } = galaxyPresentationDataModule as {
  GalaxyPresentationData: typeof import('../../src/app/models/planets/galaxy-presentation-data.js').GalaxyPresentationData;
};
const { EspionageReportGenerator } = espionageReportGeneratorModule as {
  EspionageReportGenerator: typeof import('../../src/app/generators/espionage-report-generator.js').EspionageReportGenerator;
};
const { StarSystemNote } = starSystemNoteModule as {
  StarSystemNote: typeof import('../../src/app/models/planets/star-system-note.js').StarSystemNote;
};
const { NoteBorderColor } = noteBorderColorModule as {
  NoteBorderColor: typeof import('../../src/app/models/enums/note-border-color.js').NoteBorderColor;
};
const { BuildingType } = buildingTypeEnumModule as {
  BuildingType: typeof import('../../src/app/models/enums/building-type.js').BuildingType;
};
const { DefenceType } = defenceTypeEnumModule as {
  DefenceType: typeof import('../../src/app/models/enums/defence-type.js').DefenceType;
};
const { TechnologyType } = technologyTypeEnumModule as {
  TechnologyType: typeof import('../../src/app/models/enums/technology-type.js').TechnologyType;
};
const { ShipType } = shipTypeEnumModule as {
  ShipType: typeof import('../../src/app/models/enums/ship-type.js').ShipType;
};
const { FleetMissionType } = fleetMissionTypeEnumModule as {
  FleetMissionType: typeof import('../../src/app/models/enums/fleet-mission-type.js').FleetMissionType;
};
const { FleetState } = fleetModelModule as {
  FleetState: typeof import('../../src/app/models/fleets/fleet.js').FleetState;
};
const { ManyShips } = manyShipsModule as {
  ManyShips: typeof import('../../src/app/models/fleets/many-ships.js').ManyShips;
};
const { ReportType } = reportTypeEnumModule as {
  ReportType: typeof import('../../src/app/models/enums/report-type.js').ReportType;
};
const { DiplomaticStatus } = diplomaticStatusEnumModule as {
  DiplomaticStatus: typeof import('../../src/app/models/diplomacy/diplomatic-status.js').DiplomaticStatus;
};
const { DiplomacyResolver } = diplomacyResolverModule as {
  DiplomacyResolver: typeof import('../../src/app/models/diplomacy/diplomacy-resolver.js').DiplomacyResolver;
};
const {
  countPlanetaryBombs,
  isPlanetaryBombDefenceType
} = planetaryBombModule as typeof import('../../src/app/models/defences/planetary-bomb.js');
const { TUTORIAL_VIEW_KEYS, createTutorialReadState } = tutorialTypesModule as typeof import('../../src/app/tutorial/tutorial-types.js');
const { BuildingBlueprintsFactory } = buildingBlueprintsFactoryModule as {
  BuildingBlueprintsFactory: typeof import('../../src/app/factories/building-blueprints.factory.js').BuildingBlueprintsFactory;
};
const { DefenceBlueprintsFactory } = defenceBlueprintsFactoryModule as {
  DefenceBlueprintsFactory: typeof import('../../src/app/factories/defence-blueprints.factory.js').DefenceBlueprintsFactory;
};
const { ShipBlueprintsFactory } = shipBlueprintsFactoryModule as {
  ShipBlueprintsFactory: typeof import('../../src/app/factories/ship-blueprints.factory.js').ShipBlueprintsFactory;
};
const { TechnologyBlueprintsFactory } = technologyBlueprintsFactoryModule as {
  TechnologyBlueprintsFactory: typeof import('../../src/app/factories/technology-blueprints.factory.js').TechnologyBlueprintsFactory;
};
const { FleetMissionRegistry } = fleetMissionRegistryModule as {
  FleetMissionRegistry: typeof import('../../src/app/models/missions/fleet-mission-registry.js').FleetMissionRegistry;
};
const { BuildingQueueEntry } = buildingQueueEntryModule as {
  BuildingQueueEntry: typeof import('../../src/app/models/buildings/building-queue-entry.js').BuildingQueueEntry;
};
const { ShipyardQueueEntry } = shipyardQueueEntryModule as {
  ShipyardQueueEntry: typeof import('../../src/app/models/fleets/shipyard-queue-entry.js').ShipyardQueueEntry;
};
const { TechnologyQueueEntry } = technologyQueueEntryModule as {
  TechnologyQueueEntry: typeof import('../../src/app/models/tech/technology-queue-entry.js').TechnologyQueueEntry;
};
const { ResearchHelperFor } = researchHelperForModule as {
  ResearchHelperFor: typeof import('../../src/app/models/tech/research-helper-for.js').ResearchHelperFor;
};
const { maxActiveFleets } = technologyEffectsModule as typeof import('../../src/app/models/tech/technology-effects.js');
const { resolvePhaseOneTurn } = phaseOneTurnResolverModule as typeof import('../../src/app/models/turns/phase-one-turn-resolver.js');
const { applySmokeTestScenario, isSmokeTestScenarioKey } = smokeTestScenariosModule as typeof import('../../src/app/models/testing/smoke-test-scenarios.js');
const {
  moveQueueEntry,
  calculateBuildingCancellationRefund,
  calculateShipyardCancellation
} = queueManagementModule as typeof import('../../src/app/models/queues/queue-management.js');

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

const AUTH_DATA_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../data/auth.json'
);
const PLAYER_NAME_MIN = 3;
const PLAYER_NAME_MAX = 24;
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 72;
const PLAYER_TYPE_PLAYER = 'PLAYER' as const;
const SELF_REPORT_LEVEL = 999;
const STARTING_SYSTEM_REPORT_LEVEL = 1;
const STAR_SYSTEM_NOTE_TEXT_MAX_LENGTH = 500;
const NOTE_BORDER_COLOR_VALUES = new Set<string>(Object.values(NoteBorderColor));
const BUILDING_BLUEPRINTS = BuildingBlueprintsFactory.fromDefaultJson();
const DEFENCE_BLUEPRINTS = DefenceBlueprintsFactory.fromDefaultJson();
const SHIP_BLUEPRINTS = ShipBlueprintsFactory.fromDefaultJson();
const TECHNOLOGY_BLUEPRINTS = TechnologyBlueprintsFactory.fromDefaultJson();
const FLEET_MISSION_REGISTRY = FleetMissionRegistry.createDefault();
const BUILDING_TYPE_VALUES = new Set<string>(Array.from(BUILDING_BLUEPRINTS.buildingsMap.keys()));
const DEFENCE_TYPE_VALUES = new Set<string>(Array.from(DEFENCE_BLUEPRINTS.defencesMap.keys()));
const SHIP_TYPE_VALUES = new Set<string>(Object.values(ShipType));
const FLEET_MISSION_TYPE_VALUES = new Set<string>(Object.values(FleetMissionType));
const TECHNOLOGY_TYPE_VALUES = new Set<string>(Array.from(TECHNOLOGY_BLUEPRINTS.techByType.keys()));
const DIPLOMATIC_STATUS_VALUES = new Set<string>([
  DiplomaticStatus.ALLIED,
  DiplomaticStatus.PEACE,
  DiplomaticStatus.PASSIVE,
  DiplomaticStatus.WAR
]);
const TUTORIAL_VIEW_KEY_VALUES = new Set<string>(TUTORIAL_VIEW_KEYS);
const BUILDING_TYPE_ROBOTICS_FACTORY = BuildingType.ROBOTICS_FACTORY as BuildingTypeType;
const BUILDING_TYPE_SHIPYARD = BuildingType.SHIPYARD as BuildingTypeType;
const BUILDING_TYPE_RESEARCH_LAB = BuildingType.RESEARCH_LAB as BuildingTypeType;
const TECH_TYPE_COMPUTER_TECHNOLOGY = TechnologyType.COMPUTER_TECHNOLOGY as TechnologyTypeType;
const TECH_TYPE_INTERGALACTIC_RESEARCH_NETWORK = TechnologyType.INTERGALACTIC_RESEARCH_NETWORK as TechnologyTypeType;
const PHASE_ONE_MISSION_TYPES = new Set<FleetMissionTypeType>([
  FleetMissionType.MOVE as FleetMissionTypeType,
  FleetMissionType.TRANSPORT as FleetMissionTypeType,
  FleetMissionType.SPY as FleetMissionTypeType,
  FleetMissionType.BOMBARD as FleetMissionTypeType,
  FleetMissionType.SIEGE as FleetMissionTypeType,
  FleetMissionType.RECYCLE as FleetMissionTypeType,
  FleetMissionType.REPAIR as FleetMissionTypeType,
  FleetMissionType.COLONIZE as FleetMissionTypeType
]);

let currentGalaxy: Galaxy | null = null;
let currentGameOwnerId: number | null = null;
let currentGalaxyPresentationByPlayer = new Map<number, GalaxyPresentationDataType>();
let isTurnProcessing = false;

app.post('/api/auth/register', (req, res) => {
  const body = req.body as RegisterRequest | undefined;
  const playerName = normalizePlayerName(body?.playerName);
  const password = normalizePassword(body?.password);

  if (!playerName || !password) {
    return res.status(400).json({ error: 'Invalid player name or password.' });
  }

  const playerNameKey = toPlayerNameKey(playerName);
  const data = loadAuthData();
  if (data.accounts.some((account) => account.playerNameKey === playerNameKey)) {
    return res.status(409).json({ error: 'User already exists.' });
  }

  const now = new Date().toISOString();
  const account = {
    id: data.nextAccountId,
    playerName,
    playerNameKey,
    passwordHash: hashPassword(password),
    createdAt: now
  };

  data.nextAccountId += 1;
  data.accounts.push(account);

  const session = createSession(data, account, now);
  saveAuthData(data);

  return res.status(201).json(toPlayerSession(session));
});

app.post('/api/auth/login', (req, res) => {
  const body = req.body as LoginRequest | undefined;
  const playerName = normalizePlayerName(body?.playerName);
  const password = normalizePassword(body?.password);

  if (!playerName || !password) {
    return res.status(400).json({ error: 'Invalid player name or password.' });
  }

  const data = loadAuthData();
  const playerNameKey = toPlayerNameKey(playerName);
  const account = data.accounts.find((entry) => entry.playerNameKey === playerNameKey);
  if (!account) {
    return res.status(404).json({ error: 'No such user.' });
  }
  if (!verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'Wrong password.' });
  }

  const now = new Date().toISOString();
  const session = createSession(data, account, now);
  saveAuthData(data);

  return res.status(200).json(toPlayerSession(session));
});

app.get('/api/auth/me', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  return res.status(200).json(toPlayerSession(auth.session));
});

app.post('/api/auth/logout', (req, res) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const data = loadAuthData();
  data.sessions = data.sessions.filter((session) => session.token !== token);
  saveAuthData(data);

  return res.status(204).send();
});

app.post('/api/game/start', (req, res) => {
  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const body = req.body as StartGameRequest | undefined;
  if (!body || !isValidSetup(body.setup)) {
    return res.status(400).json({ error: 'Invalid setup payload.' });
  }

  currentGalaxy = new GalaxyCreator(body.setup).createGalaxy([auth.session.playerName]);
  if (body.setup.smokeTestScenario) {
    applySmokeTestScenario(currentGalaxy, body.setup.smokeTestScenario);
  }
  currentGameOwnerId = auth.session.accountId;
  generateSelfReportsForHumanPlayers(currentGalaxy, currentGalaxy.currentTurn);
  currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);

  const response: StartGameResponse = {
    player: toPlayerSession(auth.session, currentGalaxy),
    galaxy: buildGalaxySnapshot(currentGalaxy)
  };

  return res.status(200).json(response);
});

app.get('/api/game/state', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const response: GameStateResponse = {
    player: toPlayerSession(auth.session, currentGalaxy),
    galaxy: buildGalaxySnapshot(currentGalaxy)
  };

  return res.status(200).json(response);
});

app.get('/api/game/diplomacy', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  return res.status(200).json(toDiplomaticRelationDtos(currentGalaxy.diplomaticRelations));
});

app.post('/api/game/diplomacy', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const body = req.body as SetDiplomaticRelationRequest | undefined;
  const playerAId = parseBodyPositiveInt(body?.playerAId);
  const playerBId = parseBodyPositiveInt(body?.playerBId);
  const status = normalizeDiplomaticStatus(body?.status);

  if (playerAId === null || playerBId === null || !status) {
    return res.status(400).json({ error: 'Invalid diplomacy payload.' });
  }

  if (playerAId === playerBId) {
    return res.status(400).json({ error: 'Diplomacy relation must target two different players.' });
  }

  if (!resolvePlayerById(currentGalaxy, playerAId) || !resolvePlayerById(currentGalaxy, playerBId)) {
    return res.status(404).json({ error: 'One or more diplomacy players were not found.' });
  }

  upsertDiplomaticRelation(currentGalaxy, playerAId, playerBId, status);

  return res.status(200).json(toDiplomaticRelationDtos(currentGalaxy.diplomaticRelations));
});

app.post('/api/game/end-turn', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  if (isTurnProcessing) {
    return res.status(409).json({ error: 'Turn processing is already in progress.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  isTurnProcessing = true;

  try {
    const resolvedTurnNumber = currentGalaxy.currentTurn + 1;
    resolvePhaseOneTurn(currentGalaxy, resolvedTurnNumber);
    currentGalaxy.currentTurn = resolvedTurnNumber;
    refreshOwnedPlanetSelfReportsForHumanPlayers(currentGalaxy, currentGalaxy.currentTurn);
    currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);

    const response: EndTurnResponse = {
      player: toPlayerSession(auth.session, currentGalaxy),
      galaxy: buildGalaxySnapshot(currentGalaxy)
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('End-turn processing failed.', error);
    return res.status(500).json({ error: 'Turn processing failed.' });
  } finally {
    isTurnProcessing = false;
  }
});

app.get('/api/game/galaxy-presentation-data', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const presentation = getPresentationData(currentGalaxy, playerId);
  const starSystemNotes = GalaxyPresentationData.collectStarSystemNotes(currentGalaxy, playerId);
  const response: GalaxyPresentationDataDto = toGalaxyPresentationDataDto(
    presentation,
    starSystemNotes
  );
  return res.status(200).json(response);
});

app.post('/api/game/star-system-note', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as UpsertStarSystemNoteRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const borderColor = normalizeStarSystemNoteBorderColor(body?.borderColor);
  const text = normalizeStarSystemNoteText(body?.text);

  if (x === null || y === null || !borderColor || !text) {
    return res.status(400).json({ error: 'Invalid star system note payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  if (system.isVoid || system.isGalaxyCenter) {
    return res.status(400).json({ error: 'Cannot set note for Void or Galaxy Center.' });
  }

  const note = new StarSystemNote({ x, y }, borderColor, text);
  system.starSystemNotes.set(playerId, note);

  const response: StarSystemNoteDto = toStarSystemNoteDto(note);
  return res.status(200).json(response);
});

app.delete('/api/game/star-system-note', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  if (x === null || y === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  if (system.isVoid || system.isGalaxyCenter) {
    return res.status(400).json({ error: 'Cannot delete note for Void or Galaxy Center.' });
  }

  system.starSystemNotes.delete(playerId);
  return res.status(204).send();
});

app.get('/api/game/client-galaxy', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const includePlanets = parseIncludePlanets(req.query.includePlanets);
  const clientGalaxy = currentGalaxy.createClientGalaxy(playerId, includePlanets);
  const response: ClientGalaxyDto = toClientGalaxyDto(clientGalaxy, includePlanets);
  return res.status(200).json(response);
});

app.get('/api/game/client-star-system', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  const z = parseOptionalInt(req.query.z);
  if (x === null || y === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }
  if (z !== null && z >= 0) {
    return res.status(400).json({ error: 'z must be < 0 for star system requests.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const clientSystem = currentGalaxy.createClientStarSystem(system, playerId, true);
  const response: ClientStarSystemDto = toClientStarSystemDto(clientSystem, true);
  return res.status(200).json(response);
});

app.get('/api/game/client-planet', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const x = parseNonNegativeInt(req.query.x);
  const y = parseNonNegativeInt(req.query.y);
  const z = parseNonNegativeInt(req.query.z);
  if (x === null || y === null || z === null) {
    return res.status(400).json({ error: 'Invalid coordinates.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, {
    x,
    y,
    z
  });
  return res.status(200).json(response);
});

app.post('/api/game/building-queue', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as StartBuildingConstructionRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const buildingType = normalizeBuildingType(body?.buildingType);
  if (x === null || y === null || z === null || !buildingType) {
    return res.status(400).json({ error: 'Invalid building queue payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueLimit = calculateMaxBuildingQueueLength(planet, player);
  if (planet.rBDSFTQ.buildingQueue.length >= queueLimit) {
    return res.status(400).json({ error: 'Queue full.' });
  }

  const alreadyQueued = planet.rBDSFTQ.buildingQueue.some(
    (entry) => entry.buildingType === buildingType
  );
  if (alreadyQueued) {
    return res.status(400).json({ error: 'Building type is already queued.' });
  }

  const building = BUILDING_BLUEPRINTS.get(buildingType);
  if (!building) {
    return res.status(400).json({ error: 'Unknown building type.' });
  }

  const nextLevel = planet.getBuildingLevel(buildingType) + 1;
  if (!hasBuildingRequirements(planet, building, nextLevel)) {
    return res.status(400).json({ error: 'Building requirements are not met.' });
  }

  if (!hasTechnologyRequirements(player, building, nextLevel)) {
    return res.status(400).json({ error: 'Technology requirements are not met.' });
  }

  const cost = building.getCostForLevel(nextLevel);
  if (!planet.rBDSFTQ.resources.isSufficient(cost)) {
    return res.status(400).json({ error: 'Insufficient resources.' });
  }

  planet.rBDSFTQ.resources.subtractResourcePack(cost);
  planet.rBDSFTQ.buildingQueue.push(new BuildingQueueEntry(buildingType, nextLevel, 0));

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/building-queue/reorder', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as ReorderBuildingQueueRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const fromIndex = parseBodyNonNegativeInt(body?.fromIndex);
  const toIndex = parseBodyNonNegativeInt(body?.toIndex);
  if (x === null || y === null || z === null || fromIndex === null || toIndex === null) {
    return res.status(400).json({ error: 'Invalid building queue reorder payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueLength = planet.rBDSFTQ.buildingQueue.length;
  if (fromIndex >= queueLength || toIndex >= queueLength) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  if (fromIndex !== toIndex) {
    moveQueueEntry(planet.rBDSFTQ.buildingQueue, fromIndex, toIndex);
  }

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/building-queue/cancel', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CancelBuildingQueueEntryRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const index = parseBodyNonNegativeInt(body?.index);
  if (x === null || y === null || z === null || index === null) {
    return res.status(400).json({ error: 'Invalid building queue cancel payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueEntry = planet.rBDSFTQ.buildingQueue[index];
  if (!queueEntry) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  const building = BUILDING_BLUEPRINTS.get(queueEntry.buildingType);
  if (!building) {
    return res.status(400).json({ error: 'Unknown queued building type.' });
  }

  const refund = calculateBuildingCancellationRefund(building, queueEntry);
  planet.rBDSFTQ.resources.addResourcePack(refund);
  planet.rBDSFTQ.buildingQueue.splice(index, 1);

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/shipyard-queue', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as StartShipyardConstructionRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const itemKind = body?.itemKind === 'defence' ? 'defence' : body?.itemKind === 'ship' ? 'ship' : null;
  const shipType = normalizeShipType(body?.shipType);
  const defenceType = normalizeDefenceType(body?.defenceType);
  const amount = parseBodyIntInRange(body?.amount, 1, 100000);
  if (
    x === null
    || y === null
    || z === null
    || !itemKind
    || amount === null
    || (itemKind === 'ship' && !shipType)
    || (itemKind === 'defence' && !defenceType)
  ) {
    return res.status(400).json({ error: 'Invalid shipyard queue payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const shipyardLevel = planet.getBuildingLevel(BUILDING_TYPE_SHIPYARD);
  if (shipyardLevel <= 0) {
    return res.status(400).json({ error: 'Build Shipyard first.' });
  }

  const queueLimit = calculateMaxShipyardQueueLength(planet, player);
  if (planet.rBDSFTQ.shipyardQueue.length >= queueLimit) {
    return res.status(400).json({ error: 'Queue full.' });
  }

  const ship = itemKind === 'ship' && shipType ? SHIP_BLUEPRINTS.get(shipType) : null;
  const defence = itemKind === 'defence' && defenceType ? DEFENCE_BLUEPRINTS.get(defenceType) : null;
  const blueprint = ship ?? defence;
  if (!blueprint) {
    return res.status(400).json({ error: itemKind === 'ship' ? 'Unknown ship type.' : 'Unknown defence type.' });
  }

  const hasBuildingReqs = itemKind === 'ship'
    ? hasShipBuildingRequirements(planet, ship!)
    : hasDefenceBuildingRequirements(planet, defence!);
  if (!hasBuildingReqs) {
    return res.status(400).json({ error: 'Building requirements are not met.' });
  }

  const hasTechReqs = itemKind === 'ship'
    ? hasShipTechnologyRequirements(player, ship!)
    : hasDefenceTechnologyRequirements(player, defence!);
  if (!hasTechReqs) {
    return res.status(400).json({ error: 'Technology requirements are not met.' });
  }

  if (
    itemKind === 'defence'
    && defenceType
    && isPlanetaryBombDefenceType(defenceType as DefenceTypeType)
  ) {
    const bombDepotCapacity = Math.max(0, Math.floor(planet.getBuildingProductionValue1(BuildingType.BOMB_DEPOT as BuildingTypeType)));
    const queuedBombs = planet.rBDSFTQ.shipyardQueue
      .filter((entry) => entry.itemKind === 'defence' && isPlanetaryBombDefenceType(entry.defenceType as DefenceTypeType))
      .reduce((sum, entry) => sum + Math.max(0, Math.floor(entry.amount)), 0);
    const totalBombsAfterQueue = countPlanetaryBombs(planet.rBDSFTQ.defences) + queuedBombs + amount;
    if (totalBombsAfterQueue > bombDepotCapacity) {
      return res.status(400).json({ error: 'Bomb Depot capacity reached.' });
    }
  }

  const totalCost = multiplyResourcePack(blueprint.cost, amount);
  if (!planet.rBDSFTQ.resources.isSufficient(totalCost)) {
    return res.status(400).json({ error: 'Insufficient resources.' });
  }

  planet.rBDSFTQ.resources.subtractResourcePack(totalCost);
  planet.rBDSFTQ.shipyardQueue.push(
    itemKind === 'ship'
      ? ShipyardQueueEntry.ship(shipType as ShipTypeType, amount, 0)
      : ShipyardQueueEntry.defence(defenceType as DefenceTypeType, amount, 0)
  );

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/shipyard-queue/reorder', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as ReorderShipyardQueueRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const fromIndex = parseBodyNonNegativeInt(body?.fromIndex);
  const toIndex = parseBodyNonNegativeInt(body?.toIndex);
  if (x === null || y === null || z === null || fromIndex === null || toIndex === null) {
    return res.status(400).json({ error: 'Invalid shipyard queue reorder payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueLength = planet.rBDSFTQ.shipyardQueue.length;
  if (fromIndex >= queueLength || toIndex >= queueLength) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  if (fromIndex !== toIndex) {
    moveQueueEntry(planet.rBDSFTQ.shipyardQueue, fromIndex, toIndex);
  }

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/shipyard-queue/cancel', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CancelShipyardQueueEntryRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const index = parseBodyNonNegativeInt(body?.index);
  if (x === null || y === null || z === null || index === null) {
    return res.status(400).json({ error: 'Invalid shipyard queue cancel payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const queueEntry = planet.rBDSFTQ.shipyardQueue[index];
  if (!queueEntry) {
    return res.status(400).json({ error: 'Queue index out of range.' });
  }

  const blueprint = queueEntry.itemKind === 'defence'
    ? (queueEntry.defenceType ? DEFENCE_BLUEPRINTS.get(queueEntry.defenceType) : null)
    : (queueEntry.shipType ? SHIP_BLUEPRINTS.get(queueEntry.shipType) : null);
  if (!blueprint) {
    return res.status(400).json({ error: 'Unknown queued shipyard item type.' });
  }

  const cancellation = calculateShipyardCancellation(blueprint, queueEntry);
  if (cancellation.deliveredAmount > 0) {
    addProducedShipyardUnitsToPlanet(planet, blueprint, queueEntry.itemKind, cancellation.deliveredAmount);
  }
  planet.rBDSFTQ.resources.addResourcePack(cancellation.refund);
  planet.rBDSFTQ.shipyardQueue.splice(index, 1);

  const clientPlanet = currentGalaxy.createClientPlanet(planet, playerId);
  const response: ClientPlanetDto = toClientPlanetDto(clientPlanet, { x, y, z });
  return res.status(200).json(response);
});

app.post('/api/game/technology-queue', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as StartTechnologyResearchRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const technologyType = normalizeTechnologyType(body?.technologyType);
  const helperCoordinates = parseResearchHelperCoordinates(body?.helperPlanets);
  if (x === null || y === null || z === null || !technologyType || helperCoordinates === null) {
    return res.status(400).json({ error: 'Invalid technology queue payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  if (planet.getBuildingLevel(BUILDING_TYPE_RESEARCH_LAB) <= 0) {
    return res.status(400).json({ error: 'Build Research Lab first.' });
  }

  if (planet.rBDSFTQ.currentResearchQueue) {
    return res.status(400).json({ error: 'Queue full.' });
  }

  if (planet.rBDSFTQ.researchHelperFor) {
    return res.status(400).json({ error: 'Research Lab is currently assigned as helper.' });
  }

  const technology = TECHNOLOGY_BLUEPRINTS.get(technologyType);
  if (!technology) {
    return res.status(400).json({ error: 'Unknown technology type.' });
  }

  const technologyAlreadyQueued = player.planets.some((entry) => {
    const queue = entry.rBDSFTQ.currentResearchQueue;
    return queue !== null && queue.technologyType === technologyType;
  });
  if (technologyAlreadyQueued) {
    return res.status(400).json({ error: 'Technology is already being researched.' });
  }

  const maxLabsPerTechnology = calculateMaxLabsPerTechnology(player);

  const starterCoordinates: ClientCoordinates = { x, y, z };
  const uniqueHelperCoordinates: ClientCoordinates[] = [];
  const helperPlanets: Planet[] = [];
  const helperIds = new Set<string>();

  for (const coordinates of helperCoordinates) {
    if (sameCoordinates(coordinates, starterCoordinates)) {
      continue;
    }

    const helperId = toCoordinatesId(coordinates);
    if (helperIds.has(helperId)) {
      continue;
    }

    const helperSystem = currentGalaxy.stars[coordinates.y]?.[coordinates.x];
    if (!helperSystem) {
      return res.status(404).json({ error: 'Helper planet star system not found.' });
    }

    const helperPlanet = helperSystem.planets[coordinates.z];
    if (!helperPlanet) {
      return res.status(404).json({ error: 'Helper planet not found.' });
    }

    if (helperPlanet.info.ownerId !== playerId) {
      return res.status(403).json({ error: 'Helper planet must be owned by you.' });
    }

    if (helperPlanet.getBuildingLevel(BUILDING_TYPE_RESEARCH_LAB) <= 0) {
      return res.status(400).json({ error: 'Selected helper planet has no Research Lab.' });
    }

    if (helperPlanet.rBDSFTQ.currentResearchQueue || helperPlanet.rBDSFTQ.researchHelperFor) {
      return res.status(400).json({ error: 'Selected helper lab is busy.' });
    }

    helperIds.add(helperId);
    uniqueHelperCoordinates.push(coordinates);
    helperPlanets.push(helperPlanet);
  }

  if ((1 + uniqueHelperCoordinates.length) > maxLabsPerTechnology) {
    return res.status(400).json({ error: 'Too many helper labs assigned.' });
  }

  const nextLevel = player.getTechLevel(technologyType) + 1;
  if (!hasResearchBuildingRequirements(planet, technology, nextLevel)) {
    return res.status(400).json({ error: 'Building requirements are not met.' });
  }

  if (!hasResearchTechnologyRequirements(player, technology, nextLevel)) {
    return res.status(400).json({ error: 'Technology requirements are not met.' });
  }

  const cost = technology.getCostForLevel(nextLevel);
  if (!planet.rBDSFTQ.resources.isSufficient(cost)) {
    return res.status(400).json({ error: 'Insufficient resources.' });
  }

  planet.rBDSFTQ.resources.subtractResourcePack(cost);
  planet.rBDSFTQ.currentResearchQueue = new TechnologyQueueEntry(
    technologyType,
    nextLevel,
    0,
    uniqueHelperCoordinates
  );

  for (const helperPlanet of helperPlanets) {
    helperPlanet.rBDSFTQ.researchHelperFor = new ResearchHelperFor(
      {
        x: starterCoordinates.x,
        y: starterCoordinates.y,
        z: starterCoordinates.z
      },
      technologyType
    );
  }

  const presentation = getPresentationData(currentGalaxy, playerId);
  const response = presentation.ownedPlanets.map((entry) => toClientPlanetDtoFromClientPlanet(entry));
  return res.status(200).json(response);
});

app.post('/api/game/power-consumption', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as SetBuildingPowerConsumptionRequest | undefined;
  const x = parseBodyNonNegativeInt(body?.x);
  const y = parseBodyNonNegativeInt(body?.y);
  const z = parseBodyNonNegativeInt(body?.z);
  const buildingType = normalizeBuildingType(body?.buildingType);
  const currentPowerConsumption = parseBodyNonNegativeNumber(body?.currentPowerConsumption);

  if (x === null || y === null || z === null || !buildingType || currentPowerConsumption === null) {
    return res.status(400).json({ error: 'Invalid power consumption payload.' });
  }

  const system = currentGalaxy.stars[y]?.[x];
  if (!system) {
    return res.status(404).json({ error: 'Star system not found.' });
  }

  const planet = system.planets[z];
  if (!planet) {
    return res.status(404).json({ error: 'Planet not found.' });
  }

  if (planet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Only your own planets can be modified.' });
  }

  const maxConsumption = planet.getMaxBuildingPowerConsumption(buildingType);
  const powerPerLevel = BUILDING_BLUEPRINTS.get(buildingType)?.powerConsumption ?? 0;
  if (maxConsumption <= 0 && currentPowerConsumption > 0) {
    return res.status(400).json({ error: 'Building has no available power consumption.' });
  }

  if (powerPerLevel > 0) {
    const withinBounds = currentPowerConsumption >= 0 && currentPowerConsumption <= maxConsumption;
    const ratio = currentPowerConsumption / powerPerLevel;
    const isMultiple = Math.abs(ratio - Math.round(ratio)) < 1e-9;
    if (!withinBounds || !isMultiple) {
      return res.status(400).json({ error: 'Invalid power consumption value for current building level.' });
    }
  }

  const updatedPowerConsumption = planet.setCurrentBuildingPowerConsumption(
    buildingType,
    currentPowerConsumption
  );

  const response: SetBuildingPowerConsumptionResponse = {
    buildingType,
    currentPowerConsumption: updatedPowerConsumption
  };
  return res.status(200).json(response);
});

app.get('/api/game/owned-planets', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const presentation = getPresentationData(currentGalaxy, playerId);
  const response = presentation.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet));
  return res.status(200).json(response);
});

app.get('/api/game/reports', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const response = [...player.reports]
    .sort((left, right) => right.createdTurn - left.createdTurn || right.reportId - left.reportId)
    .map((report) => toPlayerReportDto(report));
  return res.status(200).json(response);
});

app.post('/api/game/reports/read', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as MarkPlayerReportReadRequest | undefined;
  const reportId = parseBodyNonNegativeInt(body?.reportId);
  if (reportId === null) {
    return res.status(400).json({ error: 'Invalid report id.' });
  }

  const wasUpdated = player.markReportAsRead(reportId);
  if (!wasUpdated) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  const report = player.reports.find((entry) => entry.reportId === reportId);
  if (!report) {
    return res.status(404).json({ error: 'Report not found.' });
  }

  return res.status(200).json(toPlayerReportDto(report));
});

app.post('/api/game/reports/delete', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as DeletePlayerReportsRequest | undefined;
  const reportIds = parseBodyReportIds(body?.reportIds);
  if (!reportIds) {
    return res.status(400).json({ error: 'Invalid report ids.' });
  }

  const deletedCount = player.deleteReports(reportIds);
  const response: DeletePlayerReportsResponse = { deletedCount };
  return res.status(200).json(response);
});

app.post('/api/game/tutorial-read', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as { viewKey?: string; markAllRead?: boolean } | undefined;
  if (body?.markAllRead === true) {
    player.markAllTutorialsRead();
    return res.status(200).json(toPlayerSession(auth.session, currentGalaxy));
  }

  if (!body?.viewKey || !TUTORIAL_VIEW_KEY_VALUES.has(body.viewKey)) {
    return res.status(400).json({ error: 'Invalid tutorial view key.' });
  }

  player.markTutorialRead(body.viewKey as keyof typeof player.tutorialRead);
  return res.status(200).json(toPlayerSession(auth.session, currentGalaxy));
});

app.get('/api/game/active-fleets', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const response = currentGalaxy.activeFleets.filter((fleet) => fleet.ownerId === playerId);
  return res.status(200).json(response);
});

app.post('/api/game/active-fleets', (req, res) => {
  if (!currentGalaxy || currentGameOwnerId === null) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const auth = getAuthSession(req);
  if (!auth) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  if (auth.session.accountId !== currentGameOwnerId) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const playerId = resolvePlayerId(currentGalaxy, auth.session);
  if (playerId === null) {
    return res.status(404).json({ error: 'Player not found in galaxy.' });
  }

  const body = req.body as CreateFleetMissionRequest | undefined;
  const missionType = normalizeFleetMissionType(body?.missionType);
  const origin = parseMissionCoordinates(body?.origin);
  const target = parseMissionCoordinates(body?.target);
  const ships = parseFleetShipSelections(body?.ships);
  const carriedBombs = parseFleetBombSelections(body?.carriedBombs);
  const cargo = parseResourcesPackPayload(body?.cargo);

  if (!missionType || !origin || !target || !ships || !carriedBombs || !cargo) {
    return res.status(400).json({ error: 'Invalid fleet mission payload.' });
  }

  if (!PHASE_ONE_MISSION_TYPES.has(missionType)) {
    return res.status(400).json({ error: 'Mission type is not available in phase 1.' });
  }

  const mission = FLEET_MISSION_REGISTRY.get(missionType);
  if (!mission) {
    return res.status(400).json({ error: 'Mission definition not found.' });
  }
  const diplomacyResolver = createDiplomacyResolver(currentGalaxy);

  const originSystem = currentGalaxy.stars[origin.y]?.[origin.x];
  const targetSystem = currentGalaxy.stars[target.y]?.[target.x];
  const originPlanet = originSystem?.planets[origin.z];
  const targetPlanet = targetSystem?.planets[target.z];

  if (!originSystem || !originPlanet) {
    return res.status(404).json({ error: 'Origin planet not found.' });
  }

  if (!targetSystem || !targetPlanet) {
    return res.status(404).json({ error: 'Target planet not found.' });
  }

  if (originPlanet.info.ownerId !== playerId) {
    return res.status(403).json({ error: 'Origin planet must be owned by you.' });
  }

  const player = resolvePlayerById(currentGalaxy, playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found.' });
  }

  const playerActiveFleetCount = currentGalaxy.activeFleets.filter((fleet) => fleet.ownerId === playerId).length;
  const playerMaxActiveFleets = maxActiveFleets(player.getTechLevel(TECH_TYPE_COMPUTER_TECHNOLOGY));
  if (playerActiveFleetCount >= playerMaxActiveFleets) {
    return res.status(400).json({ error: 'Active fleet limit reached. Upgrade COMPUTER_TECHNOLOGY to control more fleets.' });
  }

  if (ships.length === 0) {
    return res.status(400).json({ error: 'Select at least one ship.' });
  }

  const availableUndamagedShipsByType = countPlanetUndamagedShipsByType(originPlanet);
  const availableDamagedShipsByType = countPlanetDamagedShipsByType(originPlanet);
  for (const ship of ships) {
    const availableUndamagedAmount = availableUndamagedShipsByType.get(ship.type) ?? 0;
    if (availableUndamagedAmount < ship.undamagedAmount) {
      return res.status(400).json({ error: `${ship.type}: not enough ready ships on origin planet.` });
    }

    const availableDamagedAmount = availableDamagedShipsByType.get(ship.type) ?? 0;
    if (availableDamagedAmount < ship.damagedAmount) {
      return res.status(400).json({ error: `${ship.type}: not enough damaged ships on origin planet.` });
    }
  }

  const availableBombsByType = countPlanetBombsByType(originPlanet);
  for (const bomb of carriedBombs) {
    const availableAmount = availableBombsByType.get(bomb.type) ?? 0;
    if (availableAmount < bomb.amount) {
      return res.status(400).json({ error: `${bomb.type}: not enough bombs in BOMB_DEPOT.` });
    }
  }

  const totalShipAmounts = toShipAmountEntriesFromSelections(ships);
  const selectedFleetShips = toManyShipsFromShipAmounts(totalShipAmounts);
  const totalHangarCapacity = ManyShips.totalTravelHangarCapacity(selectedFleetShips);
  const totalBomberHangarCapacity = ManyShips.totalBomberHangarCapacity(selectedFleetShips);
  const usedBombHangarCapacity = calculateBombHangarUsage(carriedBombs);
  const usedHangarCapacity = ManyShips.totalRequiredHangarCapacity(selectedFleetShips) + usedBombHangarCapacity;
  if (usedHangarCapacity > totalHangarCapacity) {
    return res.status(400).json({ error: 'Insufficient hangar space for carried ships and bombs.' });
  }
  if (usedBombHangarCapacity > totalBomberHangarCapacity) {
    return res.status(400).json({ error: 'Insufficient bomber hangar space for carried bombs.' });
  }

  const totalCargoCapacity = calculateFleetCargoCapacity(totalShipAmounts);
  const usedCargoCapacity = cargo.metal + cargo.crystal + cargo.deuterium;
  if (usedCargoCapacity > totalCargoCapacity) {
    return res.status(400).json({ error: 'Insufficient cargo space.' });
  }

  const travelDistance = calculateTravelDistance(origin, target);
  const travelTurns = Math.max(1, travelDistance);
  const fuelMultiplier = mission.minimumFuelReserves;
  const fuelCost = calculateFuelCost(totalShipAmounts, travelDistance, fuelMultiplier);

  const hasMilitaryShips = totalShipAmounts.some((entry) => {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(entry.type);
    return blueprint ? blueprint.weapons.length > 0 : false;
  });
  const missionLaunchContext: MissionLaunchContext = {
    selection: {
      ships,
      carriedBombs,
      cargo
    },
    playerId,
    originPlanet,
    targetPlanet,
    activeFleetCount: playerActiveFleetCount,
    maxActiveFleetCount: playerMaxActiveFleets,
    totalCargoCapacity,
    usedCargoCapacity,
    totalHangarCapacity,
    usedHangarCapacity,
    hasMilitaryShips,
    fuelCost,
    diplomacyResolver
  };
  const missionErrors = mission.validateLaunch(missionLaunchContext);
  if (missionErrors.length > 0) {
    return res.status(400).json({ error: missionErrors[0].text });
  }

  const totalRequiredResources = {
    metal: cargo.metal,
    crystal: cargo.crystal,
    deuterium: cargo.deuterium + fuelCost
  } as ResourcesPack;
  if (!originPlanet.rBDSFTQ.resources.isSufficient(totalRequiredResources)) {
    return res.status(400).json({ error: 'Insufficient resources for cargo and fuel.' });
  }

  let fleetShips: ManyShipsType;
  try {
    fleetShips = originPlanet.rBDSFTQ.ships.extractSelectedShips(ships);
  } catch (error) {
    console.error('Fleet launch ship extraction failed.', error);
    return res.status(400).json({ error: 'Requested ship selection is no longer available on origin planet.' });
  }
  const fleetBombs = originPlanet.rBDSFTQ.defences.extractAnyDefencesByType(carriedBombs);

  originPlanet.rBDSFTQ.resources.subtractResourcePack(totalRequiredResources);

  const fleet = {
    fleetId: currentGalaxy.nextFleetId,
    ownerId: playerId,
    missionType,
    origin: { x: origin.x, y: origin.y, z: origin.z },
    target: { x: target.x, y: target.y, z: target.z },
    originPlanetName: originPlanet.basicInfo.name,
    targetPlanetName: targetPlanet.basicInfo.name,
    ships: fleetShips,
    carriedBombs: fleetBombs,
    cargo: {
      metal: cargo.metal,
      crystal: cargo.crystal,
      deuterium: cargo.deuterium
    },
    fuelCost,
    totalCargoCapacity,
    usedCargoCapacity,
    travelTurns,
    returnTurns: travelTurns,
    state: FleetState.MOVING_TO_TARGET,
    createdAtTurn: currentGalaxy.currentTurn
  } as Fleet;

  currentGalaxy.nextFleetId += 1;
  currentGalaxy.activeFleets.push(fleet);

  const presentation = getPresentationData(currentGalaxy, playerId);
  const response: CreateFleetMissionResponse = {
    ownedPlanets: presentation.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet)),
    activeFleets: currentGalaxy.activeFleets.filter((entry) => entry.ownerId === playerId)
  };
  return res.status(201).json(response);
});

app.get('/api/health', (_req, res) => {
  return res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`SroGame server listening on http://localhost:${PORT}`);
});

type AuthAccount = {
  id: number;
  playerName: string;
  playerNameKey: string;
  passwordHash: string;
  createdAt: string;
};

type AuthSession = {
  token: string;
  accountId: number;
  playerName: string;
  createdAt: string;
  lastSeenAt: string;
};

type AuthData = {
  nextAccountId: number;
  accounts: AuthAccount[];
  sessions: AuthSession[];
};

function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length < PLAYER_NAME_MIN || trimmed.length > PLAYER_NAME_MAX) {
    return null;
  }

  return trimmed;
}

function toPlayerNameKey(playerName: string): string {
  return playerName.trim().toLowerCase();
}

function normalizePassword(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  if (value.length < PASSWORD_MIN || value.length > PASSWORD_MAX) {
    return null;
  }

  return value;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (expected.length !== derived.length) {
    return false;
  }

  return timingSafeEqual(expected, derived);
}

function loadAuthData(): AuthData {
  ensureAuthDirectory();

  try {
    const raw = fs.readFileSync(AUTH_DATA_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as AuthData;
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid auth data');
    }

    const accounts = Array.isArray(parsed.accounts) ? parsed.accounts : [];
    const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];

    for (const entry of accounts) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }

      const account = entry as AuthAccount;
      if (typeof account.playerName === 'string') {
        account.playerNameKey = toPlayerNameKey(account.playerName);
      }
    }

    return {
      nextAccountId: Number.isInteger(parsed.nextAccountId) ? parsed.nextAccountId : 1,
      accounts,
      sessions
    };
  } catch {
    const fallback: AuthData = { nextAccountId: 1, accounts: [], sessions: [] };
    saveAuthData(fallback);
    return fallback;
  }
}

function saveAuthData(data: AuthData): void {
  ensureAuthDirectory();
  fs.writeFileSync(AUTH_DATA_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function ensureAuthDirectory(): void {
  const dir = path.dirname(AUTH_DATA_PATH);
  fs.mkdirSync(dir, { recursive: true });
}

function createSession(data: AuthData, account: AuthAccount, timestamp: string): AuthSession {
  const session: AuthSession = {
    token: randomUUID(),
    accountId: account.id,
    playerName: account.playerName,
    createdAt: timestamp,
    lastSeenAt: timestamp
  };

  data.sessions.push(session);
  return session;
}

function toPlayerSession(session: AuthSession, galaxy: Galaxy | null = currentGalaxy): PlayerSession {
  const player = galaxy ? resolvePlayerFromSession(galaxy, session) : null;
  return {
    id: session.accountId,
    playerName: session.playerName,
    token: session.token,
    tutorialRead: player?.tutorialRead ?? createTutorialReadState(false)
  };
}

function getTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';
  return token.trim() ? token.trim() : null;
}

function getAuthSession(req: Request): { data: AuthData; session: AuthSession } | null {
  const token = getTokenFromRequest(req);
  if (!token) {
    return null;
  }

  const data = loadAuthData();
  const session = data.sessions.find((entry) => entry.token === token);
  if (!session) {
    return null;
  }

  const account = data.accounts.find((entry) => entry.id === session.accountId);
  if (!account || account.playerName !== session.playerName) {
    data.sessions = data.sessions.filter((entry) => entry.token !== token);
    saveAuthData(data);
    return null;
  }

  session.lastSeenAt = new Date().toISOString();
  saveAuthData(data);

  return { data, session };
}

function resolvePlayerId(galaxy: Galaxy, session: AuthSession): number | null {
  return galaxy.playerNameMap.get(session.playerName) ?? null;
}

function resolvePlayerById(galaxy: Galaxy, playerId: number): Player | null {
  for (const player of galaxy.players) {
    if (player.playerId === playerId) {
      return player;
    }
  }

  return null;
}

function upsertDiplomaticRelation(
  galaxy: Galaxy,
  leftPlayerId: number,
  rightPlayerId: number,
  status: DiplomaticStatusType
): void {
  const playerAId = Math.min(leftPlayerId, rightPlayerId);
  const playerBId = Math.max(leftPlayerId, rightPlayerId);
  const existingIndex = galaxy.diplomaticRelations.findIndex((relation) =>
    relation.playerAId === playerAId && relation.playerBId === playerBId
  );

  if (status === DiplomaticStatus.WAR) {
    if (existingIndex >= 0) {
      galaxy.diplomaticRelations.splice(existingIndex, 1);
    }
    return;
  }

  const nextRelation: DiplomaticRelation = {
    playerAId,
    playerBId,
    status
  };

  if (existingIndex >= 0) {
    galaxy.diplomaticRelations[existingIndex] = nextRelation;
  } else {
    galaxy.diplomaticRelations.push(nextRelation);
  }

  galaxy.diplomaticRelations.sort((left, right) =>
    left.playerAId - right.playerAId || left.playerBId - right.playerBId
  );
}

function createDiplomacyResolver(galaxy: Galaxy) {
  return new DiplomacyResolver(galaxy.diplomaticRelations);
}

function resolvePlayerFromSession(galaxy: Galaxy, session: AuthSession): Player | null {
  const playerId = resolvePlayerId(galaxy, session);
  if (playerId === null) {
    return null;
  }

  return resolvePlayerById(galaxy, playerId);
}

function calculateMaxBuildingQueueLength(planet: Planet, player: Player): number {
  const roboticsFactoryLevel = planet.getBuildingLevel(BUILDING_TYPE_ROBOTICS_FACTORY);
  const computerTechnologyLevel = player.getTechLevel(TECH_TYPE_COMPUTER_TECHNOLOGY);
  const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechnologyLevel + roboticsFactoryLevel));
  return Math.max(1, Math.floor(rawLimit));
}

function calculateMaxShipyardQueueLength(planet: Planet, player: Player): number {
  const shipyardLevel = planet.getBuildingLevel(BUILDING_TYPE_SHIPYARD);
  const computerTechnologyLevel = player.getTechLevel(TECH_TYPE_COMPUTER_TECHNOLOGY);
  const rawLimit = 1 + Math.sqrt(Math.max(0, computerTechnologyLevel + shipyardLevel));
  return Math.max(1, Math.floor(rawLimit));
}

function calculateMaxLabsPerTechnology(player: Player): number {
  const irnLevel = player.getTechLevel(TECH_TYPE_INTERGALACTIC_RESEARCH_NETWORK);
  const rawLimit = Math.floor((1.5 * Math.sqrt(Math.max(0, irnLevel))) + 1);
  return Math.max(1, rawLimit);
}

function hasBuildingRequirements(
  planet: Planet,
  building: Building,
  nextLevel: number
): boolean {
  for (const requirement of building.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasTechnologyRequirements(player: Player, building: Building, nextLevel: number): boolean {
  for (const requirement of building.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasShipBuildingRequirements(planet: Planet, ship: Ship): boolean {
  for (const requirement of ship.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasShipTechnologyRequirements(player: Player, ship: Ship): boolean {
  for (const requirement of ship.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasDefenceBuildingRequirements(planet: Planet, defence: Defence): boolean {
  for (const requirement of defence.buildingRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasDefenceTechnologyRequirements(player: Player, defence: Defence): boolean {
  for (const requirement of defence.techRequirements) {
    const requiredLevel = Math.ceil(requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasResearchBuildingRequirements(
  planet: Planet,
  technology: Technology,
  nextLevel: number
): boolean {
  for (const requirement of technology.buildingRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = planet.getBuildingLevel(requirement.building as BuildingTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function hasResearchTechnologyRequirements(
  player: Player,
  technology: Technology,
  nextLevel: number
): boolean {
  for (const requirement of technology.techRequirements) {
    const requiredLevel = Math.ceil(nextLevel * requirement.level);
    const currentLevel = player.getTechLevel(requirement.tech as TechnologyTypeType);
    if (currentLevel < requiredLevel) {
      return false;
    }
  }

  return true;
}

function parseOptionalInt(value: unknown): number | null {
  if (Array.isArray(value)) {
    return parseOptionalInt(value[0]);
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return null;
  }

  return parsed;
}

function parseNonNegativeInt(value: unknown): number | null {
  const parsed = parseOptionalInt(value);
  if (parsed === null || parsed < 0) {
    return null;
  }
  return parsed;
}

function parseBodyNonNegativeInt(value: unknown): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const parsed = value as number;
  if (parsed < 0) {
    return null;
  }

  return parsed;
}

function parseBodyPositiveInt(value: unknown): number | null {
  return parseBodyIntInRange(value, 1, Number.MAX_SAFE_INTEGER);
}

function parseBodyIntInRange(value: unknown, min: number, max: number): number | null {
  if (!Number.isInteger(value)) {
    return null;
  }

  const parsed = value as number;
  if (parsed < min || parsed > max) {
    return null;
  }

  return parsed;
}

function normalizeDiplomaticStatus(value: unknown): DiplomaticStatusType | null {
  if (typeof value !== 'string' || !DIPLOMATIC_STATUS_VALUES.has(value)) {
    return null;
  }

  return value as DiplomaticStatusType;
}

function parseBodyReportIds(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const reportIds: number[] = [];
  for (const item of value) {
    const reportId = parseBodyNonNegativeInt(item);
    if (reportId === null) {
      return null;
    }

    reportIds.push(reportId);
  }

  return reportIds;
}

function parseBodyNonNegativeNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value < 0) {
    return null;
  }

  return value;
}

function normalizeStarSystemNoteText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > STAR_SYSTEM_NOTE_TEXT_MAX_LENGTH) {
    return null;
  }

  return trimmed;
}

function normalizeStarSystemNoteBorderColor(value: unknown): NoteBorderColorType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return NOTE_BORDER_COLOR_VALUES.has(value) ? (value as NoteBorderColorType) : null;
}

function normalizeBuildingType(value: unknown): BuildingTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return BUILDING_TYPE_VALUES.has(value) ? (value as BuildingTypeType) : null;
}

function normalizeShipType(value: unknown): ShipTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return SHIP_TYPE_VALUES.has(value) ? (value as ShipTypeType) : null;
}

function normalizeDefenceType(value: unknown): DefenceTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return DEFENCE_TYPE_VALUES.has(value) ? (value as DefenceTypeType) : null;
}

function normalizeFleetMissionType(value: unknown): FleetMissionTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return FLEET_MISSION_TYPE_VALUES.has(value) ? (value as FleetMissionTypeType) : null;
}

function normalizeTechnologyType(value: unknown): TechnologyTypeType | null {
  if (typeof value !== 'string') {
    return null;
  }

  return TECHNOLOGY_TYPE_VALUES.has(value) ? (value as TechnologyTypeType) : null;
}

function parseResearchHelperCoordinates(value: unknown): ClientCoordinates[] | null {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const parsed: ClientCoordinates[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as { x?: unknown; y?: unknown; z?: unknown };
    const x = parseBodyNonNegativeInt(candidate.x);
    const y = parseBodyNonNegativeInt(candidate.y);
    const z = parseBodyNonNegativeInt(candidate.z);
    if (x === null || y === null || z === null) {
      return null;
    }

    parsed.push({ x, y, z });
  }

  return parsed;
}

function parseMissionCoordinates(value: unknown): ClientCoordinates | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { x?: unknown; y?: unknown; z?: unknown };
  const x = parseBodyNonNegativeInt(candidate.x);
  const y = parseBodyNonNegativeInt(candidate.y);
  const z = parseBodyNonNegativeInt(candidate.z);
  if (x === null || y === null || z === null) {
    return null;
  }

  return { x, y, z };
}

function parseResourcesPackPayload(value: unknown): ResourcesPack | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { metal?: unknown; crystal?: unknown; deuterium?: unknown };
  const metal = parseBodyNonNegativeInt(candidate.metal);
  const crystal = parseBodyNonNegativeInt(candidate.crystal);
  const deuterium = parseBodyNonNegativeInt(candidate.deuterium);
  if (metal === null || crystal === null || deuterium === null) {
    return null;
  }

  return {
    metal,
    crystal,
    deuterium
  } as ResourcesPack;
}

function parseFleetShipSelections(value: unknown): CreateFleetShipSelectionEntry[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const combined = new Map<ShipTypeType, { undamagedAmount: number; damagedAmount: number }>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as {
      type?: unknown;
      undamagedAmount?: unknown;
      damagedAmount?: unknown;
    };
    const shipType = normalizeShipType(candidate.type);
    const undamagedAmount = parseBodyIntInRange(candidate.undamagedAmount ?? 0, 0, 100000);
    const damagedAmount = parseBodyIntInRange(candidate.damagedAmount ?? 0, 0, 100000);
    if (!shipType || undamagedAmount === null || damagedAmount === null) {
      return null;
    }

    if (undamagedAmount <= 0 && damagedAmount <= 0) {
      return null;
    }

    const current = combined.get(shipType) ?? { undamagedAmount: 0, damagedAmount: 0 };
    current.undamagedAmount += undamagedAmount;
    current.damagedAmount += damagedAmount;
    combined.set(shipType, current);
  }

  return Array.from(combined.entries()).map(([type, amounts]) => ({
    type,
    undamagedAmount: amounts.undamagedAmount,
    damagedAmount: amounts.damagedAmount
  }));
}

function parseFleetBombSelections(value: unknown): CreateFleetBombSelectionEntry[] | null {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    return null;
  }

  const combined = new Map<DefenceTypeType, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return null;
    }

    const candidate = item as {
      type?: unknown;
      amount?: unknown;
    };
    const defenceType = normalizeDefenceType(candidate.type);
    const amount = parseBodyIntInRange(candidate.amount, 1, 100000);
    if (!defenceType || amount === null || !isPlanetaryBombDefenceType(defenceType)) {
      return null;
    }

    combined.set(defenceType, (combined.get(defenceType) ?? 0) + amount);
  }

  return Array.from(combined.entries()).map(([type, amount]) => ({ type, amount }));
}

function countPlanetUndamagedShipsByType(planet: Planet): Map<ShipTypeType, number> {
  return ManyShips.undamagedCountByType(planet.rBDSFTQ.ships);
}

function countPlanetDamagedShipsByType(planet: Planet): Map<ShipTypeType, number> {
  return ManyShips.damagedCountByType(planet.rBDSFTQ.ships);
}

function countPlanetBombsByType(planet: Planet): Map<DefenceTypeType, number> {
  const counts = new Map<DefenceTypeType, number>();
  for (const [type, amount] of planet.rBDSFTQ.defences.countByType().entries()) {
    if (!isPlanetaryBombDefenceType(type)) {
      continue;
    }

    counts.set(type, amount);
  }

  return counts;
}

function toShipAmountEntriesFromSelections(
  ships: Array<Pick<ShipSelectionEntryType, 'type' | 'undamagedAmount' | 'damagedAmount'>>
): Array<{ type: ShipTypeType; amount: number }> {
  return ships.map((ship) => ({
    type: ship.type,
    amount: ship.undamagedAmount + ship.damagedAmount
  }));
}

function toManyShipsFromShipAmounts(
  ships: Array<{ type: ShipTypeType; amount: number }>
): ManyShipsType {
  const manyShips = ManyShips.empty();
  for (const ship of ships) {
    manyShips.addUndamaged(ship.type, ship.amount);
  }

  return manyShips;
}

function calculateBombHangarUsage(bombs: Array<{ type: DefenceTypeType; amount: number }>): number {
  let total = 0;
  for (const bomb of bombs) {
    const blueprint = DEFENCE_BLUEPRINTS.defencesMap.get(bomb.type);
    if (!blueprint) {
      continue;
    }

    total += Math.max(0, blueprint.size) * Math.max(0, bomb.amount);
  }

  return total;
}

function calculateFleetCargoCapacity(ships: Array<{ type: ShipTypeType; amount: number }>): number {
  let capacity = 0;
  for (const ship of ships) {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(ship.type);
    if (!blueprint) {
      continue;
    }

    capacity += blueprint.cargoCapacity * ship.amount;
  }

  return capacity;
}

function calculateTravelDistance(origin: ClientCoordinates, target: ClientCoordinates): number {
  return Math.abs(origin.x - target.x) + Math.abs(origin.y - target.y) + Math.abs(origin.z - target.z);
}

function calculateFuelCost(
  ships: Array<{ type: ShipTypeType; amount: number }>,
  distance: number,
  multiplier = 1
): number {
  let totalFuel = 0;
  for (const ship of ships) {
    const blueprint = SHIP_BLUEPRINTS.shipsMap.get(ship.type);
    if (!blueprint || !blueprint.canJump) {
      continue;
    }

    totalFuel += blueprint.jumpCost * Math.max(1, distance) * ship.amount;
  }

  return Math.max(0, totalFuel * Math.max(1, multiplier));
}

function sameCoordinates(left: ClientCoordinates, right: ClientCoordinates): boolean {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function toCoordinatesId(coordinates: ClientCoordinates): string {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function multiplyResourcePack(base: ResourcesPack, amount: number): ResourcesPack {
  return {
    metal: base.metal * amount,
    crystal: base.crystal * amount,
    deuterium: base.deuterium * amount
  } as ResourcesPack;
}

function addProducedShipyardUnitsToPlanet(
  planet: Planet,
  blueprint: Ship | Defence,
  itemKind: 'ship' | 'defence',
  amount: number
): void {
  const normalizedAmount = Math.max(0, Math.floor(amount));
  if (normalizedAmount <= 0) {
    return;
  }

  if (itemKind === 'defence') {
    planet.rBDSFTQ.defences.addUndamaged((blueprint as Defence).type, normalizedAmount);
    return;
  }

  planet.rBDSFTQ.ships.addUndamaged((blueprint as Ship).type, normalizedAmount);
}

function toResourcesPackDto(pack: ResourcesPack): ResourcesPackDto {
  return {
    metal: pack.metal,
    crystal: pack.crystal,
    deuterium: pack.deuterium
  };
}

function toPlanetaryParametersDto(parameters: PlanetaryParameters): PlanetaryParametersDto {
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

function toBuildingLevelEntries(map: Map<string, number>): BuildingLevelEntry[] {
  const entries: BuildingLevelEntry[] = [];
  for (const [type, level] of map.entries()) {
    entries.push({ type, level } as BuildingLevelEntry);
  }
  return entries;
}

function toBuildingPowerConsumptionEntries(clientPlanet: ClientPlanet): BuildingPowerConsumptionEntry[] {
  const entries: BuildingPowerConsumptionEntry[] = [];
  for (const [type] of clientPlanet.rBDSFTQ.buildingsLevels.entries()) {
    entries.push({
      type: type as BuildingTypeType,
      currentPowerConsumption: clientPlanet.getCurrentBuildingPowerConsumption(type as BuildingTypeType)
    });
  }

  return entries;
}

function toBuildingStructuralPointsEntries(clientPlanet: ClientPlanet): BuildingStructuralPointsEntry[] {
  const entries: BuildingStructuralPointsEntry[] = [];
  for (const [type] of clientPlanet.rBDSFTQ.buildingsLevels.entries()) {
    entries.push({
      type: type as BuildingTypeType,
      currentStructuralPoints: clientPlanet.getCurrentBuildingStructuralPoints(type as BuildingTypeType),
      maxStructuralPoints: clientPlanet.getMaxBuildingStructuralPoints(type as BuildingTypeType)
    });
  }

  return entries;
}

function toTechLevelEntries(map: Map<string, number>): TechLevelEntry[] {
  const entries: TechLevelEntry[] = [];
  for (const [type, level] of map.entries()) {
    entries.push({ type, level } as TechLevelEntry);
  }
  return entries;
}

function toShipAmountEntries(map: Map<unknown, number>): ShipAmountEntry[] {
  const entries: ShipAmountEntry[] = [];
  for (const [type, amount] of map.entries()) {
    entries.push({ type: String(type), amount } as ShipAmountEntry);
  }

  return entries;
}

function toPlayerReportBaseDto(report: PlayerReport): PlayerReportDtoBase {
  return {
    reportId: report.reportId,
    reportType: report.reportType as ReportTypeType,
    createdTurn: report.createdTurn,
    title: report.title,
    isRead: report.isRead,
    sourceCoordinates: report.sourceCoordinates
      ? {
        x: report.sourceCoordinates.x,
        y: report.sourceCoordinates.y,
        z: report.sourceCoordinates.z
      }
      : null,
    sourcePlanetName: report.sourcePlanetName,
    sourceSystemName: report.sourceSystemName,
    senderPlayerName: report.senderPlayerName
  };
}

function toClientReportDataDto(reportData: EspionageReportData): ClientReportDataDto {
  return {
    ...toPlayerReportBaseDto(reportData),
    planetaryParameters: toPlanetaryParametersDto(reportData.planetaryParameters),
    averageBuildingLevel: reportData.averageBuildingLevel,
    averageTotalResources: reportData.averageTotalResources,
    averageTechLevel: reportData.averageTechLevel,
    totalDefencesAmount: reportData.totalDefencesAmount,
    totalShipsAmount: reportData.totalShipsAmount,
    buildingsLevels: toBuildingLevelEntries(reportData.buildingsLevels),
    resourcesAmount: toResourcesPackDto(reportData.resourcesAmount),
    techLevels: toTechLevelEntries(reportData.techLevels),
    defences: reportData.defences,
    ships: toShipAmountEntries(reportData.ships),
    shipyardProduction: reportData.shipyardProduction,
    defencesProduction: reportData.defencesProduction,
    researchProduction: reportData.researchProduction,
    buildingProduction: reportData.buildingProduction
  };
}

function toMessageReportDto(report: MessageReport): MessageReportDto {
  return {
    ...toPlayerReportBaseDto(report),
    messageBody: report.messageBody
  };
}

function toTextPlayerReportDto(report: PlayerReport & { body: string }): TextPlayerReportDto {
  return {
    ...toPlayerReportBaseDto(report),
    body: report.body
  };
}

function toEspionagePlayerReportDto(report: EspionageReportData): EspionagePlayerReportDto {
  return {
    ...toPlayerReportBaseDto(report),
    planetaryParameters: toPlanetaryParametersDto(report.planetaryParameters),
    averageBuildingLevel: report.averageBuildingLevel,
    averageTotalResources: report.averageTotalResources,
    averageTechLevel: report.averageTechLevel,
    totalDefencesAmount: report.totalDefencesAmount,
    totalShipsAmount: report.totalShipsAmount,
    buildingsLevels: toBuildingLevelEntries(report.buildingsLevels),
    resourcesAmount: toResourcesPackDto(report.resourcesAmount),
    techLevels: toTechLevelEntries(report.techLevels),
    defences: report.defences,
    ships: toShipAmountEntries(report.ships),
    shipyardProduction: report.shipyardProduction,
    defencesProduction: report.defencesProduction,
    researchProduction: report.researchProduction,
    buildingProduction: report.buildingProduction
  };
}

function toPlayerReportDto(report: PlayerReport): PlayerReportDto {
  switch (report.reportType) {
    case ReportType.MESSAGE:
      return toMessageReportDto(report as MessageReport);
    case ReportType.ESPIONAGE_REPORT:
      return toEspionagePlayerReportDto(report as EspionageReportData);
    default:
      return toTextPlayerReportDto(report as PlayerReport & { body: string });
  }
}

function toClientPlanetDto(clientPlanet: ClientPlanet, coordinates: ClientCoordinates): ClientPlanetDto {
  return {
    coordinates,
    basicInfo: {
      name: clientPlanet.basicInfo.name,
      type: clientPlanet.basicInfo.type,
      colonizationDifficulty: clientPlanet.basicInfo.colonizationDifficulty,
      order: clientPlanet.basicInfo.order,
      image: clientPlanet.basicInfo.image,
      size: clientPlanet.basicInfo.size
    },
    info: {
      ownerId: clientPlanet.info.ownerId,
      ownerPlayerType: clientPlanet.ownerPlayerType,
      ownerPlayerName: clientPlanet.ownerPlayerName,
      planetaryParameters: toPlanetaryParametersDto(clientPlanet.info.planetaryParameters)
    },
    objects: {
      resources: toResourcesPackDto(clientPlanet.rBDSFTQ.resources),
      buildingsLevels: toBuildingLevelEntries(clientPlanet.rBDSFTQ.buildingsLevels),
      buildingsCurrentPowerConsumption: toBuildingPowerConsumptionEntries(clientPlanet),
      buildingsCurrentStructuralPoints: toBuildingStructuralPointsEntries(clientPlanet),
      defences: clientPlanet.rBDSFTQ.defences,
      ships: clientPlanet.rBDSFTQ.ships,
      currentResearchQueue: clientPlanet.rBDSFTQ.currentResearchQueue,
      researchHelperFor: clientPlanet.rBDSFTQ.researchHelperFor,
      buildingQueue: clientPlanet.rBDSFTQ.buildingQueue,
      shipyardQueue: clientPlanet.rBDSFTQ.shipyardQueue,
      fleets: clientPlanet.rBDSFTQ.fleets,
      spaceDebris: toResourcesPackDto(clientPlanet.rBDSFTQ.spaceDebris)
    },
    reportData: clientPlanet.reportData ? toClientReportDataDto(clientPlanet.reportData) : null
  };
}

function toClientPlanetDtoFromClientPlanet(clientPlanet: ClientPlanet): ClientPlanetDto {
  const systemCoordinates = clientPlanet.basicInfo.solarSystem.coordinates;
  const z = Math.max(0, clientPlanet.basicInfo.order - 1);
  return toClientPlanetDto(clientPlanet, {
    x: systemCoordinates.x,
    y: systemCoordinates.y,
    z
  });
}

function buildPresentationDataByPlayer(galaxy: Galaxy): Map<number, GalaxyPresentationDataType> {
  const map = new Map<number, GalaxyPresentationDataType>();
  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    map.set(player.playerId, GalaxyPresentationData.fromGalaxy(galaxy, player.playerId));
  }
  return map;
}

function getPresentationData(galaxy: Galaxy, playerId: number): GalaxyPresentationDataType {
  const cached = currentGalaxyPresentationByPlayer.get(playerId);
  if (cached) {
    return cached;
  }

  const computed = GalaxyPresentationData.fromGalaxy(galaxy, playerId);
  currentGalaxyPresentationByPlayer.set(playerId, computed);
  return computed;
}

function generateSelfReportsForHumanPlayers(galaxy: Galaxy, turnNumber: number): void {
  const reportGenerator = new EspionageReportGenerator();
  const playersById = new Map<number, (typeof galaxy.players)[number]>();
  for (const entry of galaxy.players) {
    playersById.set(entry.playerId, entry);
  }

  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    for (const row of galaxy.stars) {
      for (const system of row) {
        for (const planet of system.planets) {
          if (planet.info.ownerId !== player.playerId) {
            continue;
          }

          const report = reportGenerator.createEspionageReport(
            player,
            player,
            planet,
            0,
            {
              reportId: player.createReportId(),
              forcedReportLevel: SELF_REPORT_LEVEL,
              createdTurn: turnNumber
            }
          );
          planet.lastReportData.set(player.playerId, report.copy());
          player.addReport(report.copy());
        }
      }
    }

    const homePlanet = player.planets[0];
    const startingSystem = homePlanet?.basicInfo.solarSystem;
    if (!homePlanet || !startingSystem) {
      continue;
    }

    for (const planet of startingSystem.planets) {
      if (planet === homePlanet || planet.lastReportData.has(player.playerId)) {
        continue;
      }

      const ownerId = planet.info.ownerId;
      const planetOwner = ownerId === null ? null : playersById.get(ownerId) ?? null;
      const report = reportGenerator.createEspionageReport(
        player,
        planetOwner,
        planet,
        0,
        {
          reportId: player.createReportId(),
          forcedReportLevel: STARTING_SYSTEM_REPORT_LEVEL,
          createdTurn: turnNumber
        }
      );
      planet.lastReportData.set(player.playerId, report.copy());
      player.addReport(report.copy());
    }
  }
}

function refreshOwnedPlanetSelfReportsForHumanPlayers(galaxy: Galaxy, turnNumber: number): void {
  const reportGenerator = new EspionageReportGenerator();

  for (const player of galaxy.players) {
    if (player.type !== PLAYER_TYPE_PLAYER) {
      continue;
    }

    for (const planet of player.planets) {
      const report = reportGenerator.createEspionageReport(
        player,
        player,
        planet,
        0,
        {
          reportId: player.createReportId(),
          forcedReportLevel: SELF_REPORT_LEVEL,
          createdTurn: turnNumber
        }
      );
      planet.lastReportData.set(player.playerId, report.copy());
    }
  }
}

function toGalaxyByteCellDto(cell: GalaxyByteCell): GalaxyByteCellDto {
  return {
    planetsAndAsteroids: [cell.planetsAndAsteroids[0], cell.planetsAndAsteroids[1]]
  };
}

function toOwnershipByteCellDto(cell: OwnershipByteCell | null): OwnershipByteCellDto | null {
  if (!cell) {
    return null;
  }

  return {
    ownership: [cell.ownership[0], cell.ownership[1], cell.ownership[2], cell.ownership[3]]
  };
}

function toStarSystemNoteDto(note: StarSystemNoteType): StarSystemNoteDto {
  return {
    coordinates: {
      x: note.coordinates.x,
      y: note.coordinates.y
    },
    borderColor: note.borderColor,
    text: note.text
  };
}

function toGalaxyPresentationDataDto(
  data: GalaxyPresentationDataType,
  starSystemNotes: StarSystemNoteType[]
): GalaxyPresentationDataDto {
  return {
    galaxyBytes: data.galaxyBytes.map((row) => row.map((cell) => toGalaxyByteCellDto(cell))),
    ownershipBytes: data.ownershipBytes.map((row) =>
      row.map((cell) => toOwnershipByteCellDto(cell))
    ),
    ownedPlanets: data.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet)),
    starSystemNotes: starSystemNotes.map((note) => toStarSystemNoteDto(note))
  };
}

function toClientInfoDto(clientInfo: ClientStarSystem['clientInfo']): ClientInfoDto {
  return {
    ownedPlanetCount: clientInfo.ownedPlanetCount,
    neutralPlanetCount: clientInfo.neutralPlanetCount,
    botPlanetCount: clientInfo.botPlanetCount,
    humanPlanetCount: clientInfo.humanPlanetCount
  };
}

function toClientStarSystemDto(system: ClientStarSystem, includePlanets: boolean): ClientStarSystemDto {
  const systemCoordinates: ClientCoordinates = {
    x: system.coordinates.x,
    y: system.coordinates.y,
    z: -1
  };
  const planets = includePlanets
    ? system.planets.map((planet, index) =>
      toClientPlanetDto(planet, {
        x: system.coordinates.x,
        y: system.coordinates.y,
        z: index
      })
    )
    : [];

  return {
    coordinates: systemCoordinates,
    name: system.name,
    isGalaxyCenter: system.isGalaxyCenter,
    isVoid: system.isVoid,
    isCenterEdge: system.isCenterEdge,
    discoveredByPlayer: Array.from(system.discoveredByPlayer),
    planets,
    clientInfo: toClientInfoDto(system.clientInfo)
  };
}

function toPlayerNameEntries(playerNameMap: Map<number, string>): PlayerNameEntry[] {
  const entries: PlayerNameEntry[] = [];
  for (const [playerId, playerName] of playerNameMap.entries()) {
    entries.push({ playerId, playerName });
  }
  return entries;
}

function toClientGalaxyDto(clientGalaxy: ClientGalaxy, includePlanets: boolean): ClientGalaxyDto {
  return {
    name: clientGalaxy.name,
    stars: clientGalaxy.stars.map((row) =>
      row.map((system) => toClientStarSystemDto(system, includePlanets))
    ),
    playerNames: toPlayerNameEntries(clientGalaxy.playerNameMap)
  };
}

function parseIncludePlanets(value: unknown): boolean {
  if (Array.isArray(value)) {
    return parseIncludePlanets(value[0]);
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function buildGalaxySnapshot(galaxy: Galaxy): GalaxySnapshot {
  return {
    name: galaxy.name,
    currentTurn: galaxy.currentTurn,
    diplomaticRelations: toDiplomaticRelationDtos(galaxy.diplomaticRelations),
    stars: galaxy.stars.map((row) =>
      row.map((system) => ({
        isVoid: system.isVoid,
        isGalaxyCenter: system.isGalaxyCenter,
        coordinates: {
          x: system.coordinates.x,
          y: system.coordinates.y
        }
      }))
    )
  };
}

function toDiplomaticRelationDtos(relations: DiplomaticRelation[]): DiplomaticRelationDto[] {
  return relations.map((relation) => ({
    playerAId: relation.playerAId,
    playerBId: relation.playerBId,
    status: relation.status
  }));
}

function isValidSetup(setup: GalaxySetup): boolean {
  const gameTypeValue = (setup as { gameType?: unknown }).gameType;
  const gameTypeValid =
    gameTypeValue === undefined ||
    gameTypeValue === 'PvP' ||
    gameTypeValue === 'PvPvE' ||
    gameTypeValue === 'PvE' ||
    gameTypeValue === 'Sandbox';

  return (
    !!setup &&
    gameTypeValid &&
    typeof setup.galaxyName === 'string' &&
    setup.galaxyName.trim().length > 0 &&
    Number.isInteger(setup.galaxyWidth) &&
    setup.galaxyWidth >= 10 &&
    setup.galaxyWidth <= 100 &&
    Number.isInteger(setup.galaxyHeight) &&
    setup.galaxyHeight >= 10 &&
    setup.galaxyHeight <= 100 &&
    Number.isInteger(setup.galaxyCenterSize) &&
    setup.galaxyCenterSize >= 5 &&
    setup.galaxyCenterSize <= 35 &&
    Number.isInteger(setup.voidChance) &&
    setup.voidChance >= 0 &&
    setup.voidChance <= 35 &&
    Array.isArray(setup.starsAmountModifier) &&
    setup.starsAmountModifier.length === 2 &&
    Number.isInteger(setup.starsAmountModifier[0]) &&
    setup.starsAmountModifier[0] >= -10 &&
    setup.starsAmountModifier[0] <= 0 &&
    Number.isInteger(setup.starsAmountModifier[1]) &&
    setup.starsAmountModifier[1] >= 1 &&
    setup.starsAmountModifier[1] <= 9 &&
    Number.isInteger(setup.playerAmount) &&
    setup.playerAmount >= 1 &&
    setup.playerAmount <= 4 &&
    Number.isInteger(setup.botsAmount) &&
    setup.botsAmount >= 0 &&
    setup.botsAmount <= 12 &&
    Number.isInteger(setup.botDifficulty) &&
    setup.botDifficulty >= -75 &&
    setup.botDifficulty <= 200 &&
    Number.isInteger(setup.neutralBotsAmount) &&
    setup.neutralBotsAmount >= 0 &&
    setup.neutralBotsAmount <= 10 &&
    Number.isInteger(setup.neutralBotsDifficulty) &&
    setup.neutralBotsDifficulty >= -100 &&
    setup.neutralBotsDifficulty <= 200 &&
    (setup.createRandomPlanets === undefined || typeof setup.createRandomPlanets === 'boolean') &&
    (setup.createStartingShips === undefined || typeof setup.createStartingShips === 'boolean') &&
    (setup.skipTutorial === undefined || typeof setup.skipTutorial === 'boolean') &&
    (setup.smokeTestScenario === undefined || isSmokeTestScenarioKey(setup.smokeTestScenario)) &&
    Number.isFinite(setup.startingResources?.metal) &&
    setup.startingResources.metal >= 0 &&
    Number.isFinite(setup.startingResources?.crystal) &&
    setup.startingResources.crystal >= 0 &&
    Number.isFinite(setup.startingResources?.deuterium) &&
    setup.startingResources.deuterium >= 0
  );
}


