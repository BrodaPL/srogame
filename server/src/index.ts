import express from 'express';
import cors from 'cors';
import { randomUUID } from 'node:crypto';
import galaxyCreatorModule from '../../src/app/models/planets/galaxy-creator.js';
import type { Galaxy } from '../../src/app/models/planets/galaxy.js';
import type {
  GalaxySetup,
  PlayerSession,
  GalaxySnapshot,
  StartGameRequest,
  StartGameResponse,
  GameStateResponse
} from '../../src/app/models/game-api-types.js';

const { GalaxyCreator } = galaxyCreatorModule as {
  GalaxyCreator: typeof import('../../src/app/models/planets/galaxy-creator.js').GalaxyCreator;
};

const app = express();
const PORT = Number(process.env.PORT ?? 3000);

app.use(cors({ origin: 'http://localhost:4200' }));
app.use(express.json());

let currentGalaxy: Galaxy | null = null;
let currentPlayer: PlayerSession | null = null;

app.post('/api/game/start', (req, res) => {
  const body = req.body as StartGameRequest | undefined;
  if (!body || !isValidSetup(body.setup)) {
    return res.status(400).json({ error: 'Invalid setup payload.' });
  }

  const playerName =
    typeof body.playerName === 'string' && body.playerName.trim().length > 0
      ? body.playerName.trim()
      : 'Commander';

  currentGalaxy = new GalaxyCreator(body.setup).createGalaxy();
  currentPlayer = {
    id: 1,
    name: playerName,
    token: randomUUID()
  };

  const response: StartGameResponse = {
    player: currentPlayer,
    galaxy: buildGalaxySnapshot(currentGalaxy)
  };

  return res.status(200).json(response);
});

app.get('/api/game/state', (req, res) => {
  if (!currentGalaxy || !currentPlayer) {
    return res.status(404).json({ error: 'No active game.' });
  }

  const authHeader = req.headers.authorization ?? '';
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : '';

  if (!token || token !== currentPlayer.token) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const response: GameStateResponse = {
    player: currentPlayer,
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
