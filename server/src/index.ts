import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import galaxyCreatorModule from '../../src/app/models/planets/galaxy-creator.js';
import galaxyPresentationDataModule from '../../src/app/models/planets/galaxy-presentation-data.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.ts';
import type {
  GalaxySetup,
  PlayerSession,
  GalaxySnapshot,
  StartGameRequest,
  StartGameResponse,
  GameStateResponse,
  ClientGalaxyDto,
  GalaxyPresentationDataDto,
  GalaxyByteCellDto,
  PlanetReportEntryDto,
  ClientStarSystemDto,
  ClientPlanetDto,
  ClientCoordinates,
  ClientReportDataDto,
  ResourcesPackDto,
  PlanetaryParametersDto,
  BuildingLevelEntry,
  TechLevelEntry,
  ClientInfoDto,
  PlayerNameEntry,
  LoginRequest,
  RegisterRequest
} from '../../src/app/models/game-api-types.ts';
import type { ClientGalaxy } from '../../src/app/models/planets/client-galaxy.ts';
import type { ClientStarSystem } from '../../src/app/models/planets/client-star-system.ts';
import type { ClientPlanet } from '../../src/app/models/planets/client-planet.ts';
import type { PlanetaryParameters } from '../../src/app/models/planets/planetary-parameters.ts';
import type { ResourcesPack } from '../../src/app/models/resources-pack.ts';
import type { EspionageReportData } from '../../src/app/models/reports/espionage-report-data.ts';
import type { GalaxyPresentationData as GalaxyPresentationDataType } from '../../src/app/models/planets/galaxy-presentation-data.ts';
import type { GalaxyByteCell } from '../../src/app/models/planets/galaxy-byte-cell.ts';

const { GalaxyCreator } = galaxyCreatorModule as {
  GalaxyCreator: typeof import('../../src/app/models/planets/galaxy-creator.js').GalaxyCreator;
};
const { GalaxyPresentationData } = galaxyPresentationDataModule as {
  GalaxyPresentationData: typeof import('../../src/app/models/planets/galaxy-presentation-data.js').GalaxyPresentationData;
};

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

let currentGalaxy: Galaxy | null = null;
let currentGameOwnerId: number | null = null;
let currentGalaxyPresentationByPlayer = new Map<number, GalaxyPresentationDataType>();

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
  currentGameOwnerId = auth.session.accountId;
  currentGalaxyPresentationByPlayer = buildPresentationDataByPlayer(currentGalaxy);

  const response: StartGameResponse = {
    player: toPlayerSession(auth.session),
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
    player: toPlayerSession(auth.session),
    galaxy: buildGalaxySnapshot(currentGalaxy)
  };

  return res.status(200).json(response);
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
  const response: GalaxyPresentationDataDto = toGalaxyPresentationDataDto(presentation);
  return res.status(200).json(response);
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

function toPlayerSession(session: AuthSession): PlayerSession {
  return {
    id: session.accountId,
    playerName: session.playerName,
    token: session.token
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

function toTechLevelEntries(map: Map<string, number>): TechLevelEntry[] {
  const entries: TechLevelEntry[] = [];
  for (const [type, level] of map.entries()) {
    entries.push({ type, level } as TechLevelEntry);
  }
  return entries;
}

function toClientReportDataDto(reportData: EspionageReportData): ClientReportDataDto {
  return {
    reportDate: reportData.reportDate,
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
    ships: reportData.ships,
    shipyardProduction: reportData.shipyardProduction,
    defencesProduction: reportData.defencesProduction,
    researchProduction: reportData.researchProduction,
    buildingProduction: reportData.buildingProduction
  };
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
      planetaryParameters: toPlanetaryParametersDto(clientPlanet.info.planetaryParameters)
    },
    objects: {
      resources: toResourcesPackDto(clientPlanet.rBDSFTQ.resources),
      buildingsLevels: toBuildingLevelEntries(clientPlanet.rBDSFTQ.buildingsLevels),
      defences: clientPlanet.rBDSFTQ.defences,
      ships: clientPlanet.rBDSFTQ.ships,
      technologyQueue: clientPlanet.rBDSFTQ.technologyQueue,
      buildingQueue: clientPlanet.rBDSFTQ.buildingQueue,
      shipyardQueue: clientPlanet.rBDSFTQ.shipyardQueue,
      orbitShips: clientPlanet.rBDSFTQ.orbitShips,
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

function toGalaxyByteCellDto(cell: GalaxyByteCell): GalaxyByteCellDto {
  return {
    planetsAndAsteroids: [cell.planetsAndAsteroids[0], cell.planetsAndAsteroids[1]]
  };
}

function toPlanetReportEntryDto(
  coordinates: { x: number; y: number; z: number },
  reportData: EspionageReportData
): PlanetReportEntryDto {
  return {
    coordinates: {
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z
    },
    reportData: toClientReportDataDto(reportData)
  };
}

function toGalaxyPresentationDataDto(data: GalaxyPresentationDataType): GalaxyPresentationDataDto {
  const reportMap: PlanetReportEntryDto[] = [];
  for (const [coordinates, reportData] of data.reportMap.entries()) {
    reportMap.push(toPlanetReportEntryDto(coordinates, reportData));
  }

  return {
    reportMap,
    galaxyBytes: data.galaxyBytes.map((row) => row.map((cell) => toGalaxyByteCellDto(cell))),
    ownedPlanets: data.ownedPlanets.map((planet) => toClientPlanetDtoFromClientPlanet(planet))
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
    Number.isFinite(setup.startingResources?.metal) &&
    setup.startingResources.metal >= 0 &&
    Number.isFinite(setup.startingResources?.crystal) &&
    setup.startingResources.crystal >= 0 &&
    Number.isFinite(setup.startingResources?.deuterium) &&
    setup.startingResources.deuterium >= 0
  );
}


