import express from 'express';
import type { Request } from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import galaxyCreatorModule from '../../src/app/models/planets/galaxy-creator.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.js';
import type {
  GalaxySetup,
  PlayerSession,
  GalaxySnapshot,
  StartGameRequest,
  StartGameResponse,
  GameStateResponse,
  LoginRequest,
  RegisterRequest
} from '../../src/app/models/game-api-types.js';

const { GalaxyCreator } = galaxyCreatorModule as {
  GalaxyCreator: typeof import('../../src/app/models/planets/galaxy-creator.js').GalaxyCreator;
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

let currentGalaxy: Galaxy | null = null;
let currentGameOwnerId: number | null = null;

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
    return res.status(409).json({ error: 'Player name already exists.' });
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
  if (!account || !verifyPassword(password, account.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
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

  currentGalaxy = new GalaxyCreator(body.setup).createGalaxy();
  currentGameOwnerId = auth.session.accountId;

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
    gameTypeValue === 'PvE';

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
