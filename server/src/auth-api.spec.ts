import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

type AuthDataFile = {
  nextAccountId: number;
  accounts: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
};

type GameRegistryFile = {
  games: Array<Record<string, unknown>>;
};

let testBaseUrl = '';
let testServerLogs = '';

describe.sequential('auth api', () => {
  const originalAuthPath = process.env.SROGAME_AUTH_DATA_PATH;
  const originalGameRegistryPath = process.env.SROGAME_GAME_REGISTRY_DATA_PATH;
  const originalMembershipsPath = process.env.SROGAME_GAME_MEMBERSHIPS_DATA_PATH;
  const originalLobbyPath = process.env.SROGAME_MULTIPLAYER_LOBBY_STORE_DATA_PATH;
  const originalPresencePath = process.env.SROGAME_MULTIPLAYER_PRESENCE_DATA_PATH;
  const originalSavesPath = process.env.SROGAME_GAME_SAVES_DIRECTORY_PATH;
  const originalEmptyRuntimeUnloadMs = process.env.SROGAME_MULTIPLAYER_EMPTY_RUNTIME_UNLOAD_MS;
  const originalTurnstileBypass = process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV;
  const originalPort = process.env.PORT;

  let tempDir = '';
  let authPath = '';
  let serverProcess: ChildProcess | null = null;
  let baseUrl = '';
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'srogame-auth-api-'));
    authPath = path.join(tempDir, 'auth.json');
    testServerLogs = '';
    process.env.SROGAME_AUTH_DATA_PATH = authPath;
    process.env.SROGAME_GAME_REGISTRY_DATA_PATH = path.join(tempDir, 'games.json');
    process.env.SROGAME_GAME_MEMBERSHIPS_DATA_PATH = path.join(tempDir, 'game-memberships.json');
    process.env.SROGAME_MULTIPLAYER_LOBBY_STORE_DATA_PATH = path.join(tempDir, 'multiplayer-lobbies.json');
    process.env.SROGAME_MULTIPLAYER_PRESENCE_DATA_PATH = path.join(tempDir, 'multiplayer-presence.json');
    process.env.SROGAME_GAME_SAVES_DIRECTORY_PATH = path.join(tempDir, 'saves');
    process.env.SROGAME_MULTIPLAYER_EMPTY_RUNTIME_UNLOAD_MS = '250';
    process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV = 'true';
    process.env.PORT = '0';

    serverProcess = spawn(
      'npx tsx server/src/index.ts',
      {
        cwd: process.cwd(),
        env: process.env as NodeJS.ProcessEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true
      }
    );
    serverProcess.stdout?.on('data', (chunk) => {
      testServerLogs += chunk.toString();
    });
    serverProcess.stderr?.on('data', (chunk) => {
      testServerLogs += chunk.toString();
    });

    const port = await waitForServerPort();
    baseUrl = `http://127.0.0.1:${port}`;
    testBaseUrl = baseUrl;
    await waitForHealth(baseUrl);
  }, 30000);

  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise<void>((resolve) => {
        serverProcess?.once('exit', () => resolve());
        setTimeout(() => resolve(), 2000);
      });
    }

    process.env.SROGAME_AUTH_DATA_PATH = originalAuthPath;
    process.env.SROGAME_GAME_REGISTRY_DATA_PATH = originalGameRegistryPath;
    process.env.SROGAME_GAME_MEMBERSHIPS_DATA_PATH = originalMembershipsPath;
    process.env.SROGAME_MULTIPLAYER_LOBBY_STORE_DATA_PATH = originalLobbyPath;
    process.env.SROGAME_MULTIPLAYER_PRESENCE_DATA_PATH = originalPresencePath;
    process.env.SROGAME_GAME_SAVES_DIRECTORY_PATH = originalSavesPath;
    process.env.SROGAME_MULTIPLAYER_EMPTY_RUNTIME_UNLOAD_MS = originalEmptyRuntimeUnloadMs;
    process.env.TURNSTILE_BYPASS_FOR_LOCAL_DEV = originalTurnstileBypass;
    process.env.PORT = originalPort;

    fs.rmSync(tempDir, { recursive: true, force: true });
  }, 30000);

  beforeEach(() => {
    writeAuthData({
      nextAccountId: 1,
      accounts: [],
      sessions: []
    });
  });

  it('returns register config and creates a pending-confirmation account', async () => {
    const registerConfig = await request('GET', '/api/auth/register-config', undefined, '10.0.0.1');
    expect(registerConfig.status).toBe(200);
    expect(registerConfig.json).toEqual({
      registerEnabled: true,
      requiresTurnstile: false,
      turnstileSiteKey: null,
      registerUnavailableReason: null
    });

    const registerResponse = await request('POST', '/api/auth/register', {
      playerName: 'TestUserA',
      email: 'test-a@example.com',
      password: 'secret-123'
    }, '10.0.0.1');

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.json?.accountStatus).toBe('PENDING_CONFIRMATION');
    expect(registerResponse.json?.requiresConfirmation).toBe(true);

    const data = readAuthData();
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0]?.playerName).toBe('TestUserA');
    expect(data.accounts[0]?.email).toBe('test-a@example.com');
    expect(data.accounts[0]?.status).toBe('PENDING_CONFIRMATION');
    expect(data.sessions).toHaveLength(0);
  });

  it('blocks login for pending-confirmation accounts', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'TestUserB',
      email: 'test-b@example.com',
      password: 'secret-123'
    }, '10.0.0.2');

    const loginResponse = await request('POST', '/api/auth/login', {
      playerName: 'TestUserB',
      password: 'secret-123'
    }, '10.0.0.2');

    expect(loginResponse.status).toBe(403);
    expect(loginResponse.json).toEqual({ error: 'Account is not confirmed yet.' });
  });

  it('resends confirmation with cooldown and refreshes the pending expiry window', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'TestUserResend',
      email: 'test-resend@example.com',
      password: 'secret-123'
    }, '10.0.0.22');

    let resendResponse = await request('POST', '/api/auth/resend-confirmation', {
      email: 'test-resend@example.com'
    }, '10.0.0.22');
    expect(resendResponse.status).toBe(429);
    expect(resendResponse.json?.error).toContain('Confirmation can be resent again');

    const data = readAuthData();
    const account = data.accounts[0];
    if (!account) {
      throw new Error('Expected pending account for resend test.');
    }

    const now = Date.now();
    account.lastConfirmationSentAt = new Date(now - 20 * 60 * 1000).toISOString();
    account.confirmationExpiresAt = new Date(now + 10 * 60 * 1000).toISOString();
    writeAuthData(data);

    resendResponse = await request('POST', '/api/auth/resend-confirmation', {
      email: 'test-resend@example.com'
    }, '10.0.0.22');
    expect(resendResponse.status).toBe(200);
    expect(resendResponse.json?.message).toContain('pending account exists');
    expect(typeof resendResponse.json?.confirmationExpiresAt).toBe('string');
    expect(typeof resendResponse.json?.nextAllowedAt).toBe('string');

    const updatedData = readAuthData();
    expect(updatedData.accounts[0]?.lastConfirmationSentAt).not.toBe(account.lastConfirmationSentAt);
    expect(updatedData.accounts[0]?.confirmationExpiresAt).not.toBe(account.confirmationExpiresAt);
  });

  it('locks an account after five wrong passwords and keeps login blocked while locked', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'TestUserC',
      email: 'test-c@example.com',
      password: 'secret-123'
    }, '10.0.0.3');
    activateFirstPendingAccount();

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const response = await request('POST', '/api/auth/login', {
        playerName: 'TestUserC',
        password: 'wrong-pass'
      }, '10.0.0.3');

      expect(response.status).toBe(401);
      expect(response.json?.error).toContain('Wrong password.');
    }

    const fifthResponse = await request('POST', '/api/auth/login', {
      playerName: 'TestUserC',
      password: 'wrong-pass'
    }, '10.0.0.3');
    expect(fifthResponse.status).toBe(423);
    expect(fifthResponse.json?.error).toContain('Account login is locked');

    const lockedData = readAuthData();
    expect(lockedData.accounts[0]?.failedLoginAttempts).toBe(5);
    expect(typeof lockedData.accounts[0]?.loginLockedUntil).toBe('string');

    const blockedCorrectLogin = await request('POST', '/api/auth/login', {
      playerName: 'TestUserC',
      password: 'secret-123'
    }, '10.0.0.3');
    expect(blockedCorrectLogin.status).toBe(423);
  });

  it('clears failed-login state after a successful login and allows settings updates', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'TestUserD',
      email: 'test-d@example.com',
      password: 'secret-123'
    }, '10.0.0.4');
    activateFirstPendingAccount();

    await request('POST', '/api/auth/login', {
      playerName: 'TestUserD',
      password: 'wrong-pass'
    }, '10.0.0.4');
    await request('POST', '/api/auth/login', {
      playerName: 'TestUserD',
      password: 'wrong-pass'
    }, '10.0.0.4');

    let data = readAuthData();
    expect(data.accounts[0]?.failedLoginAttempts).toBe(2);

    const loginResponse = await request('POST', '/api/auth/login', {
      playerName: 'TestUserD',
      password: 'secret-123'
    }, '10.0.0.4');
    expect(loginResponse.status).toBe(200);
    expect(typeof loginResponse.json?.token).toBe('string');

    data = readAuthData();
    expect(data.accounts[0]?.failedLoginAttempts).toBe(0);
    expect(data.accounts[0]?.loginLockedUntil).toBeNull();

    const token = loginResponse.json?.token as string;
    const settingsResponse = await request('GET', '/api/account/settings', undefined, '10.0.0.5', token);
    expect(settingsResponse.status).toBe(200);
    expect(settingsResponse.json?.playerName).toBe('TestUserD');
    expect(settingsResponse.json?.email).toBe('test-d@example.com');

    const updateResponse = await request('POST', '/api/account/settings/preferences', {
      replaceWithBotOnLogout: true,
      logoutBotProfileId: 'TURTLE',
      language: 'en'
    }, '10.0.0.5', token);
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.json?.replaceWithBotOnLogout).toBe(true);
    expect(updateResponse.json?.logoutBotProfileId).toBe('TURTLE');
    expect(updateResponse.json?.language).toBe('en');

    data = readAuthData();
    expect(data.accounts[0]?.replaceWithBotOnLogout).toBe(true);
    expect(data.accounts[0]?.logoutBotProfileId).toBe('TURTLE');
    expect(data.accounts[0]?.language).toBe('en');
  });

  it('resets tutorial progress through the account settings endpoint', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'TestUserTutorials',
      email: 'test-tutorials@example.com',
      password: 'secret-123'
    }, '10.0.0.6');
    activateFirstPendingAccount();

    const loginResponse = await request('POST', '/api/auth/login', {
      playerName: 'TestUserTutorials',
      password: 'secret-123'
    }, '10.0.0.6');
    expect(loginResponse.status).toBe(200);

    const token = loginResponse.json?.token as string;
    const resetResponse = await request('POST', '/api/account/settings/tutorials/reset', {}, '10.0.0.6', token);
    expect(resetResponse.status).toBe(200);
    expect(resetResponse.json?.message).toBe('Tutorial progress was reset for your current session.');
    expect(resetResponse.json?.settings).toMatchObject({
      playerName: 'TestUserTutorials',
      email: 'test-tutorials@example.com'
    });
    expect(resetResponse.json?.player).toMatchObject({
      playerName: 'TestUserTutorials',
      token,
      currentGameId: null
    });
  });

  it('closes the current loaded single-player game, saves it, and clears the current game pointer', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'SingleplayerAdmin',
      email: 'singleplayer-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.7');
    activateAccount('SingleplayerAdmin', { localAdmin: true });

    const loginResponse = await request('POST', '/api/auth/login', {
      playerName: 'SingleplayerAdmin',
      password: 'secret-123'
    }, '10.0.0.7');
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.json?.token as string;

    const startResponse = await request('POST', '/api/game/start', {
      setup: createSingleplayerSetup('Close Test Sector')
    }, '10.0.0.7', token);
    expect(startResponse.status).toBe(200);
    const startedPlayer = startResponse.json?.player as Record<string, unknown> | undefined;
    const gameId = typeof startedPlayer?.currentGameId === 'string' ? startedPlayer.currentGameId : null;
    expect(typeof gameId).toBe('string');

    const closeResponse = await request('POST', `/api/games/${gameId}/close-current`, {}, '10.0.0.7', token);
    expect(closeResponse.status).toBe(200);
    expect(closeResponse.json).toEqual({
      currentGameId: null,
      game: null,
      canResume: false,
      unavailableReason: null
    });

    const authData = readAuthData();
    expect(authData.accounts[0]?.currentGameId).toBeNull();
    expect(authData.sessions[0]?.currentGameId).toBeNull();
    expect(authData.accounts[0]?.lastClosedGameId).toBe(gameId);
    expect(typeof authData.accounts[0]?.lastClosedAt).toBe('string');
    expect(authData.sessions[0]?.lastClosedGameId).toBe(gameId);
    expect(typeof authData.sessions[0]?.lastClosedAt).toBe('string');

    const registry = readGameRegistry();
    const game = registry.games.find((entry) => entry.gameId === gameId);
    expect(game?.kind).toBe('SINGLEPLAYER');
    expect(game?.status).toBe('RUNNING');
    expect(typeof game?.currentSaveId).toBe('string');

    const savesResponse = await request('GET', '/api/game/saves', undefined, '10.0.0.7', token);
    expect(savesResponse.status).toBe(200);
    expect(savesResponse.json?.currentSelectedGameId).toBeNull();
    expect((savesResponse.json?.recommendedReopen as Record<string, unknown>)?.gameId).toBe(gameId);
    expect(Array.isArray(savesResponse.json?.saveGroups)).toBe(true);
    const saveGroups = savesResponse.json?.saveGroups as Array<Record<string, unknown>>;
    expect(saveGroups[0]?.gameId).toBe(gameId);
    expect(saveGroups[0]?.isLastClosedGame).toBe(true);

    const currentResponse = await request('GET', '/api/games/current', undefined, '10.0.0.7', token);
    expect(currentResponse.status).toBe(200);
    expect(currentResponse.json).toEqual({
      currentGameId: null,
      game: null,
      canResume: false,
      unavailableReason: null
    });
  });

  it('classifies stale draft lobbies into other multiplayer games', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'DraftAdmin',
      email: 'draft-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.31');
    activateAccount('DraftAdmin', { localAdmin: true });

    const loginResponse = await request('POST', '/api/auth/login', {
      playerName: 'DraftAdmin',
      password: 'secret-123'
    }, '10.0.0.31');
    expect(loginResponse.status).toBe(200);
    const token = loginResponse.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.31', token);
    expect(createResponse.status).toBe(200);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    const registry = readGameRegistry();
    const game = registry.games.find((entry) => entry.gameId === gameId);
    if (!game) {
      throw new Error('Expected created draft game in registry.');
    }
    game.updatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    writeGameRegistry(registry);

    const browserResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.31', token);
    expect(browserResponse.status).toBe(200);
    expect(Array.isArray(browserResponse.json?.activeDraftLobbies)).toBe(true);
    expect(Array.isArray(browserResponse.json?.otherMultiplayerGames)).toBe(true);
    expect((browserResponse.json?.activeDraftLobbies as unknown[])).toHaveLength(0);
    expect((browserResponse.json?.otherMultiplayerGames as Array<Record<string, unknown>>)[0]).toMatchObject({
      gameId,
      status: 'DRAFT',
      statusLabel: 'DRAFT'
    });
  });

  it('leaving the last online multiplayer game saves and unloads it as inactive', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'RunAdmin',
      email: 'run-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.41');
    activateAccount('RunAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'RunGuest',
      email: 'run-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.42');
    activateAccount('RunGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'RunAdmin',
      password: 'secret-123'
    }, '10.0.0.41');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'RunGuest',
      password: 'secret-123'
    }, '10.0.0.42');
    expect(adminLogin.status).toBe(200);
    expect(guestLogin.status).toBe(200);
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.41', adminToken);
    expect(createResponse.status).toBe(200);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    const joinResponse = await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.42', guestToken);
    expect(joinResponse.status).toBe(200);
    const readyResponse = await request('POST', `/api/multiplayer/games/${gameId}/ready`, {
      ready: true
    }, '10.0.0.42', guestToken);
    expect(readyResponse.status).toBe(200);

    const startResponse = await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.41', adminToken);
    expect(startResponse.status).toBe(200);

    const leaveCurrentResponse = await request('POST', `/api/multiplayer/games/${gameId}/leave-current-game`, {}, '10.0.0.41', adminToken);
    expect(leaveCurrentResponse.status).toBe(200);
    expect(leaveCurrentResponse.json).toEqual({
      currentGameId: null,
      message: 'Not enough online players, saving and stopping the game.'
    });

    const browserResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.41', adminToken);
    expect(browserResponse.status).toBe(200);
    expect(browserResponse.json?.activeRunningGames).toEqual([]);
    expect((browserResponse.json?.otherMultiplayerGames as Array<Record<string, unknown>>)[0]).toMatchObject({
      gameId,
      status: 'RUNNING',
      statusLabel: 'Saved / Inactive'
    });

    const authData = readAuthData();
    const adminAccount = authData.accounts.find((entry) => entry.playerName === 'RunAdmin');
    expect(adminAccount?.currentGameId).toBeNull();
  });

  it('blocks multiplayer turn progression when fewer than two human players are online', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'TurnAdmin',
      email: 'turn-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.51');
    activateAccount('TurnAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'TurnGuest',
      email: 'turn-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.52');
    activateAccount('TurnGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'TurnAdmin',
      password: 'secret-123'
    }, '10.0.0.51');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'TurnGuest',
      password: 'secret-123'
    }, '10.0.0.52');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.51', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.52', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.52', guestToken);
    const startResponse = await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.51', adminToken);
    expect(startResponse.status).toBe(200);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.51', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.52', guestToken);

    const logoutResponse = await request('POST', '/api/auth/logout', {}, '10.0.0.52', guestToken);
    expect(logoutResponse.status).toBe(204);

    const turnStatusResponse = await request('GET', `/api/games/${gameId}/turn-status`, undefined, '10.0.0.51', adminToken);
    expect(turnStatusResponse.status).toBe(200);
    expect(turnStatusResponse.json).toMatchObject({
      onlineHumanCount: 1,
      minimumOnlineHumanCount: 2,
      progressionBlockedReason: 'At least 2 human players must be online to progress this multiplayer game.'
    });

    const endTurnResponse = await request('POST', `/api/games/${gameId}/end-turn`, {}, '10.0.0.51', adminToken);
    expect(endTurnResponse.status).toBe(409);
    expect(endTurnResponse.json).toEqual({
      error: 'At least 2 human players must be online to progress this multiplayer game.'
    });
  });

  it('allows one active human to progress when another present human is on auto skip turn', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'SkipAdmin',
      email: 'skip-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.71');
    activateAccount('SkipAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'SkipGuest',
      email: 'skip-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.72');
    activateAccount('SkipGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'SkipAdmin',
      password: 'secret-123'
    }, '10.0.0.71');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'SkipGuest',
      password: 'secret-123'
    }, '10.0.0.72');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.71', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.72', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.72', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.71', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.71', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.72', guestToken);

    const autoSkipResponse = await request('POST', `/api/multiplayer/games/${gameId}/auto-skip-turn`, {
      enabled: true,
      activateNow: true
    }, '10.0.0.72', guestToken);
    expect(autoSkipResponse.status).toBe(200);

    const turnStatusResponse = await request('GET', `/api/games/${gameId}/turn-status`, undefined, '10.0.0.71', adminToken);
    expect(turnStatusResponse.status).toBe(200);
    expect(turnStatusResponse.json).toMatchObject({
      onlineHumanCount: 2,
      minimumOnlineHumanCount: 2,
      progressionBlockedReason: null,
      waitingForPlayerNames: ['SkipAdmin']
    });

    const endTurnResponse = await request('POST', `/api/games/${gameId}/end-turn`, {}, '10.0.0.71', adminToken);
    expect(endTurnResponse.status).toBe(200);
    expect(endTurnResponse.json?.resolution).toBe('RESOLVED');
  });

  it('blocks multiplayer progression when all present humans are on auto skip turn', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'AllSkipAdmin',
      email: 'all-skip-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.81');
    activateAccount('AllSkipAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'AllSkipGuest',
      email: 'all-skip-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.82');
    activateAccount('AllSkipGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'AllSkipAdmin',
      password: 'secret-123'
    }, '10.0.0.81');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'AllSkipGuest',
      password: 'secret-123'
    }, '10.0.0.82');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.81', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.82', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.82', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.81', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.81', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.82', guestToken);

    await request('POST', `/api/multiplayer/games/${gameId}/auto-skip-turn`, {
      enabled: true,
      activateNow: true
    }, '10.0.0.81', adminToken);
    await request('POST', `/api/multiplayer/games/${gameId}/auto-skip-turn`, {
      enabled: true,
      activateNow: true
    }, '10.0.0.82', guestToken);

    const turnStatusResponse = await request('GET', `/api/games/${gameId}/turn-status`, undefined, '10.0.0.81', adminToken);
    expect(turnStatusResponse.status).toBe(200);
    expect(turnStatusResponse.json).toMatchObject({
      onlineHumanCount: 2,
      minimumOnlineHumanCount: 2,
      progressionBlockedReason: 'At least 1 active human player must be present to progress this multiplayer game.',
      waitingForPlayerNames: []
    });

    const endTurnResponse = await request('POST', `/api/games/${gameId}/end-turn`, {}, '10.0.0.81', adminToken);
    expect(endTurnResponse.status).toBe(409);
    expect(endTurnResponse.json).toEqual({
      error: 'At least 1 active human player must be present to progress this multiplayer game.'
    });
  });

  it('tracks multiplayer presence and auto skip turn state for the current player', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'PresenceAdmin',
      email: 'presence-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.61');
    activateAccount('PresenceAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'PresenceGuest',
      email: 'presence-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.62');
    activateAccount('PresenceGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'PresenceAdmin',
      password: 'secret-123'
    }, '10.0.0.61');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'PresenceGuest',
      password: 'secret-123'
    }, '10.0.0.62');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.61', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.62', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.62', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.61', adminToken);

    const presenceResponse = await request('POST', `/api/multiplayer/games/${gameId}/presence`, {}, '10.0.0.61', adminToken);
    expect(presenceResponse.status).toBe(200);
    expect(presenceResponse.json).toMatchObject({
      currentPlayerPresenceState: 'ACTIVE',
      currentPlayerAutoSkipEnabled: false,
      showAutoSkipReturnNotice: false
    });

    const enableResponse = await request('POST', `/api/multiplayer/games/${gameId}/auto-skip-turn`, {
      enabled: true
    }, '10.0.0.61', adminToken);
    expect(enableResponse.status).toBe(200);
    expect(enableResponse.json).toMatchObject({
      currentPlayerPresenceState: 'ACTIVE',
      currentPlayerAutoSkipEnabled: true,
      showAutoSkipReturnNotice: false
    });

    const activateResponse = await request('POST', `/api/multiplayer/games/${gameId}/auto-skip-turn`, {
      enabled: true,
      activateNow: true
    }, '10.0.0.61', adminToken);
    expect(activateResponse.status).toBe(200);
    expect(activateResponse.json).toMatchObject({
      currentPlayerPresenceState: 'AUTO_SKIP_TURN',
      currentPlayerAutoSkipEnabled: true,
      showAutoSkipReturnNotice: true
    });

    const acknowledgeResponse = await request('POST', `/api/multiplayer/games/${gameId}/presence`, {
      acknowledgeNotice: true
    }, '10.0.0.61', adminToken);
    expect(acknowledgeResponse.status).toBe(200);
    expect(acknowledgeResponse.json).toMatchObject({
      currentPlayerPresenceState: 'AUTO_SKIP_TURN',
      currentPlayerAutoSkipEnabled: true,
      showAutoSkipReturnNotice: false
    });
  });

  it('removes long-afk presence, clears ready state, and switches opted-in players to offline bot control', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'AfkAdmin',
      email: 'afk-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.91');
    activateAccount('AfkAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'AfkGuest',
      email: 'afk-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.92');
    activateAccount('AfkGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'AfkAdmin',
      password: 'secret-123'
    }, '10.0.0.91');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'AfkGuest',
      password: 'secret-123'
    }, '10.0.0.92');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const preferencesResponse = await request('POST', '/api/account/settings/preferences', {
      replaceWithBotOnLogout: true,
      logoutBotProfileId: 'TURTLE',
      language: null
    }, '10.0.0.92', guestToken);
    expect(preferencesResponse.status).toBe(200);

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.91', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.92', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.92', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.91', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.91', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.92', guestToken);

    setPresenceLastSeen(gameId!, 2, new Date(Date.now() - 31 * 60 * 1000).toISOString());

    const detailResponse = await request('GET', `/api/multiplayer/games/${gameId}`, undefined, '10.0.0.91', adminToken);
    expect(detailResponse.status).toBe(200);
    expect(detailResponse.json?.runningMembers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        playerName: 'AfkGuest',
        isAutoSkipTurn: false,
        isOfflineBotControlled: true,
        offlineBotProfileId: 'TURTLE'
      })
    ]));

    const turnStatusResponse = await request('GET', `/api/games/${gameId}/turn-status`, undefined, '10.0.0.91', adminToken);
    expect(turnStatusResponse.status).toBe(200);
    expect(turnStatusResponse.json).toMatchObject({
      onlineHumanCount: 1,
      minimumOnlineHumanCount: 2,
      waitingForPlayerNames: ['AfkAdmin'],
      progressionBlockedReason: 'At least 2 human players must be online to progress this multiplayer game.'
    });
  });

  it('saves and unloads a running multiplayer game after zero present humans remain past the unload grace period', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'EmptyAdmin',
      email: 'empty-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.93');
    activateAccount('EmptyAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'EmptyGuest',
      email: 'empty-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.94');
    activateAccount('EmptyGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'EmptyAdmin',
      password: 'secret-123'
    }, '10.0.0.93');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'EmptyGuest',
      password: 'secret-123'
    }, '10.0.0.94');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.93', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.94', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.94', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.93', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.93', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.94', guestToken);

    setPresenceLastSeen(gameId!, 1, new Date(Date.now() - 31 * 60 * 1000).toISOString());
    setPresenceLastSeen(gameId!, 2, new Date(Date.now() - 31 * 60 * 1000).toISOString());

    const beforeUnloadResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.93', adminToken);
    expect(beforeUnloadResponse.status).toBe(200);
    expect(beforeUnloadResponse.json?.activeRunningGames).toEqual(expect.arrayContaining([
      expect.objectContaining({ gameId })
    ]));

    await delay(350);

    const afterUnloadResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.93', adminToken);
    expect(afterUnloadResponse.status).toBe(200);
    expect(afterUnloadResponse.json?.activeRunningGames).toEqual([]);
    expect(afterUnloadResponse.json?.otherMultiplayerGames).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gameId,
        status: 'RUNNING',
        statusLabel: 'Saved / Inactive'
      })
    ]));
  });

  it('cancels the empty-runtime unload deadline when a human returns before unload', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'ReturnAdmin',
      email: 'return-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.95');
    activateAccount('ReturnAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'ReturnGuest',
      email: 'return-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.96');
    activateAccount('ReturnGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'ReturnAdmin',
      password: 'secret-123'
    }, '10.0.0.95');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'ReturnGuest',
      password: 'secret-123'
    }, '10.0.0.96');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.95', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.96', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.96', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.95', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.95', adminToken);
    await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.96', guestToken);

    setPresenceLastSeen(gameId!, 1, new Date(Date.now() - 31 * 60 * 1000).toISOString());
    setPresenceLastSeen(gameId!, 2, new Date(Date.now() - 31 * 60 * 1000).toISOString());

    const startUnloadResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.95', adminToken);
    expect(startUnloadResponse.status).toBe(200);

    const returnResponse = await request('GET', `/api/games/${gameId}/state`, undefined, '10.0.0.95', adminToken);
    expect(returnResponse.status).toBe(200);

    await delay(350);

    const browserResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.95', adminToken);
    expect(browserResponse.status).toBe(200);
    expect(browserResponse.json?.activeRunningGames).toEqual(expect.arrayContaining([
      expect.objectContaining({ gameId })
    ]));
    expect((browserResponse.json?.otherMultiplayerGames as Array<Record<string, unknown>>).some((entry) => entry.gameId === gameId)).toBe(false);
  });

  it('reopens a saved inactive multiplayer game as a resumed lobby and keeps it out of the inactive list', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'ResumeAdmin',
      email: 'resume-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.97');
    activateAccount('ResumeAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'ResumeGuest',
      email: 'resume-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.98');
    activateAccount('ResumeGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'ResumeAdmin',
      password: 'secret-123'
    }, '10.0.0.97');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'ResumeGuest',
      password: 'secret-123'
    }, '10.0.0.98');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.97', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.98', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.98', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.97', adminToken);
    await request('POST', `/api/multiplayer/games/${gameId}/leave-current-game`, {}, '10.0.0.97', adminToken);

    const resumeResponse = await request('POST', `/api/multiplayer/games/${gameId}/resume-lobby`, {}, '10.0.0.97', adminToken);
    expect(resumeResponse.status).toBe(200);
    expect(resumeResponse.json?.lobby).toMatchObject({
      isResumeLobby: true,
      mode: 'LOAD_SAVE'
    });

    const browserResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.97', adminToken);
    expect(browserResponse.status).toBe(200);
    expect(browserResponse.json?.activeDraftLobbies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gameId,
        isResumeLobby: true,
        statusLabel: 'Resumed lobby'
      })
    ]));
    expect((browserResponse.json?.otherMultiplayerGames as Array<Record<string, unknown>>).some((entry) => entry.gameId === gameId)).toBe(false);
  });

  it('archives an inactive multiplayer game for local admin', async () => {
    await request('POST', '/api/auth/register', {
      playerName: 'ArchiveAdmin',
      email: 'archive-admin@example.com',
      password: 'secret-123'
    }, '10.0.0.99');
    activateAccount('ArchiveAdmin', { localAdmin: true });

    await request('POST', '/api/auth/register', {
      playerName: 'ArchiveGuest',
      email: 'archive-guest@example.com',
      password: 'secret-123'
    }, '10.0.0.100');
    activateAccount('ArchiveGuest');

    const adminLogin = await request('POST', '/api/auth/login', {
      playerName: 'ArchiveAdmin',
      password: 'secret-123'
    }, '10.0.0.99');
    const guestLogin = await request('POST', '/api/auth/login', {
      playerName: 'ArchiveGuest',
      password: 'secret-123'
    }, '10.0.0.100');
    const adminToken = adminLogin.json?.token as string;
    const guestToken = guestLogin.json?.token as string;

    const createResponse = await request('POST', '/api/multiplayer/games', {}, '10.0.0.99', adminToken);
    const gameId = createResponse.json?.game && typeof createResponse.json.game === 'object'
      ? (createResponse.json.game as Record<string, unknown>).gameId as string
      : null;
    expect(typeof gameId).toBe('string');

    await request('POST', `/api/multiplayer/games/${gameId}/join`, {}, '10.0.0.100', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/ready`, { ready: true }, '10.0.0.100', guestToken);
    await request('POST', `/api/multiplayer/games/${gameId}/start`, {}, '10.0.0.99', adminToken);
    await request('POST', `/api/multiplayer/games/${gameId}/leave-current-game`, {}, '10.0.0.99', adminToken);

    const archiveResponse = await request('POST', `/api/multiplayer/games/${gameId}/archive`, {}, '10.0.0.99', adminToken);
    expect(archiveResponse.status).toBe(204);

    const browserResponse = await request('GET', '/api/multiplayer/games', undefined, '10.0.0.99', adminToken);
    expect(browserResponse.status).toBe(200);
    expect(browserResponse.json?.otherMultiplayerGames).toEqual(expect.arrayContaining([
      expect.objectContaining({
        gameId,
        status: 'ARCHIVED'
      })
    ]));

    const registry = readGameRegistry();
    expect(registry.games.find((entry) => entry.gameId === gameId)?.status).toBe('ARCHIVED');
  });

  function activateFirstPendingAccount(): void {
    const data = readAuthData();
    const account = data.accounts[0];
    if (!account) {
      throw new Error('No account available to activate.');
    }

    const now = new Date().toISOString();
    account.status = 'ACTIVE';
    account.emailConfirmedAt = now;
    account.confirmationExpiresAt = null;
    writeAuthData(data);
  }

  function activateAccount(playerName: string, options: { localAdmin?: boolean } = {}): void {
    const data = readAuthData();
    const account = data.accounts.find((entry) => entry.playerName === playerName);
    if (!account) {
      throw new Error(`No account found for ${playerName}.`);
    }

    const now = new Date().toISOString();
    account.status = 'ACTIVE';
    account.localAdmin = options.localAdmin === true;
    account.emailConfirmedAt = now;
    account.confirmationExpiresAt = null;
    writeAuthData(data);
  }

  function readAuthData(): AuthDataFile {
    return JSON.parse(fs.readFileSync(authPath, 'utf-8')) as AuthDataFile;
  }

  function writeAuthData(data: AuthDataFile): void {
    fs.writeFileSync(authPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  function readGameRegistry(): GameRegistryFile {
    return JSON.parse(fs.readFileSync(process.env.SROGAME_GAME_REGISTRY_DATA_PATH!, 'utf-8')) as GameRegistryFile;
  }

  function writeGameRegistry(data: GameRegistryFile): void {
    fs.writeFileSync(process.env.SROGAME_GAME_REGISTRY_DATA_PATH!, JSON.stringify(data, null, 2), 'utf-8');
  }

  function setPresenceLastSeen(gameId: string, accountId: number, lastSeenAt: string): void {
    const presencePath = process.env.SROGAME_MULTIPLAYER_PRESENCE_DATA_PATH;
    if (!presencePath) {
      throw new Error('Missing multiplayer presence path for auth API tests.');
    }

    const data = JSON.parse(fs.readFileSync(presencePath, 'utf-8')) as {
      presences?: Array<Record<string, unknown>>;
    };
    const entry = data.presences?.find((presence) =>
      presence.gameId === gameId && presence.accountId === accountId
    );
    if (!entry) {
      throw new Error(`Expected presence record for ${gameId}/${accountId}.`);
    }

    entry.lastSeenAt = lastSeenAt;
    fs.writeFileSync(presencePath, JSON.stringify(data, null, 2), 'utf-8');
  }
});

async function waitForHealth(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // server not ready yet
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Timed out waiting for auth test server to start.');
}

async function waitForServerPort(): Promise<number> {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const match = /SroGame server listening on http:\/\/localhost:(\d+)/.exec(testServerLogs);
    if (match) {
      return Number.parseInt(match[1] ?? '', 10);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for auth test server port. Logs:\n${testServerLogs}`);
}

async function request(
  method: 'GET' | 'POST',
  routePath: string,
  body?: unknown,
  forwardedFor = '127.0.0.1',
  token?: string
): Promise<{ status: number; json: Record<string, unknown> | null }> {
  const headers: Record<string, string> = {
    'x-forwarded-for': forwardedFor
  };
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
  }
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${testBaseUrl}${routePath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  const text = await response.text();
  return {
    status: response.status,
    json: text ? JSON.parse(text) as Record<string, unknown> : null
  };
}

async function delay(durationMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
}

function createSingleplayerSetup(galaxyName: string): Record<string, unknown> {
  return {
    gameType: 'Sandbox',
    galaxyName,
    galaxyWidth: 25,
    galaxyHeight: 20,
    galaxyCenterSize: 10,
    voidChance: 5,
    starsAmountModifier: [-1, 4],
    playerAmount: 1,
    botsAmount: 0,
    botDifficulty: 0,
    botProfileCounts: {
      TURTLE: 0,
      BALANCED: 0,
      RUSHER: 0,
      RECYCLER: 0,
      TECHNOLOGIST: 0
    },
    neutralBotsAmount: 1,
    neutralBotsDifficulty: 0,
    autoSaveTurns: 5,
    startingHomeworldPreset: 'Medium',
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    startingResources: {
      metal: 6,
      crystal: 3,
      deuterium: 1
    }
  };
}
