const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { spawn } = require('child_process');

const BASE_UI_URL = 'http://localhost:4200';
const BASE_API_URL = 'http://localhost:3000/api';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'tmp', 'mcp-route-smoke');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'result.json');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv) {
  return {
    headed: argv.includes('--headed'),
    verbose: argv.includes('--verbose')
  };
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_API_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  return { response, data };
}

async function authed(pathname, token, options = {}) {
  return api(pathname, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {})
    }
  });
}

async function waitForService(checkFn, failureMessage, timeoutMs = 90000, pollMs = 1000) {
  const startedAt = performance.now();
  let lastError = null;
  while ((performance.now() - startedAt) < timeoutMs) {
    try {
      await checkFn();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  if (lastError instanceof Error) {
    throw new Error(`${failureMessage} Last error: ${lastError.message}`);
  }

  throw new Error(failureMessage);
}

async function ensureServicesAvailable() {
  await waitForService(
    async () => {
      const uiResponse = await fetch(BASE_UI_URL);
      assert(uiResponse.ok, `UI is not reachable at ${BASE_UI_URL}`);
    },
    'UI service did not become ready in time.'
  );

  await waitForService(
    async () => {
      const apiResponse = await fetch(`${BASE_API_URL}/auth/me`);
      assert(
        apiResponse.status === 401,
        `API is not reachable at ${BASE_API_URL} or auth behavior changed`
      );
    },
    'API service did not become ready in time.'
  );
}

function buildSetup() {
  return {
    gameType: 'Sandbox',
    galaxyName: `MCP Smoke ${Date.now() % 100000}`,
    galaxyWidth: 10,
    galaxyHeight: 10,
    galaxyCenterSize: 5,
    voidChance: 0,
    starsAmountModifier: [0, 1],
    playerAmount: 1,
    botsAmount: 0,
    botDifficulty: 0,
    neutralBotsAmount: 0,
    neutralBotsDifficulty: 0,
    autoSaveTurns: 0,
    startingHomeworldPreset: 'Medium',
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    smokeTestScenario: 'routeSmoke',
    startingResources: {
      metal: 500,
      crystal: 500,
      deuterium: 500
    }
  };
}

function resolveCredentials() {
  return {
    playerName: process.env.SROGAME_MCP_USER ?? 'TestUserA',
    password: process.env.SROGAME_MCP_PASSWORD ?? '***REMOVED***'
  };
}

async function loginAndStartGame() {
  const credentials = resolveCredentials();

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials)
  });
  assert(
    login.response.ok,
    `Login failed for ${credentials.playerName}: ${login.response.status} ${JSON.stringify(login.data)}`
  );

  const setup = buildSetup();
  const start = await authed('/game/start', login.data.token, {
    method: 'POST',
    body: JSON.stringify({ setup })
  });
  assert(
    start.response.ok,
    `Start game failed: ${start.response.status} ${JSON.stringify(start.data)}`
  );

  const ownedPlanets = await authed('/game/owned-planets', login.data.token);
  assert(
    ownedPlanets.response.ok && Array.isArray(ownedPlanets.data) && ownedPlanets.data.length > 0,
    `Unable to load owned planets: ${ownedPlanets.response.status} ${JSON.stringify(ownedPlanets.data)}`
  );

  return {
    session: login.data,
    setup,
    playerName: credentials.playerName,
    homePlanet: ownedPlanets.data[0]
  };
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function roundDuration(durationMs) {
  return Math.round(durationMs * 100) / 100;
}

function extractText(result) {
  return (result?.content ?? [])
    .filter((item) => item?.type === 'text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n');
}

class McpClient {
  constructor({ headed, verbose }) {
    this.headed = headed;
    this.verbose = verbose;
    this.child = null;
    this.buffer = '';
    this.nextId = 1;
    this.pending = new Map();
  }

  async start() {
    const args = ['/c', 'npx', '-y', 'chrome-devtools-mcp@latest', '--isolated', '--no-usage-statistics', '--no-performance-crux'];
    if (!this.headed) {
      args.push('--headless');
    }

    this.child = spawn('cmd.exe', args, {
      cwd: path.resolve(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk) => this.handleStdout(chunk));

    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk) => {
      if (this.verbose) {
        process.stdout.write(chunk);
      }
    });

    this.child.on('exit', (code) => {
      for (const { reject } of this.pending.values()) {
        reject(new Error(`chrome-devtools-mcp exited with code ${code ?? 'null'}`));
      }
      this.pending.clear();
    });

    await this.request('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'srogame-mcp-smoke',
        version: '0.1.0'
      }
    }, 60000);

    this.notify('notifications/initialized');
  }

  handleStdout(chunk) {
    this.buffer += chunk;
    let lineBreakIndex = this.buffer.indexOf('\n');
    while (lineBreakIndex >= 0) {
      const line = this.buffer.slice(0, lineBreakIndex).trim();
      this.buffer = this.buffer.slice(lineBreakIndex + 1);
      if (line.length > 0) {
        const message = JSON.parse(line);
        this.handleMessage(message);
      }
      lineBreakIndex = this.buffer.indexOf('\n');
    }
  }

  handleMessage(message) {
    if (typeof message.id === 'number' && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result);
      }
    }
  }

  request(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    this.child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    }) + '\n');

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.has(id)) {
          return;
        }

        this.pending.delete(id);
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        }
      });
    });
  }

  notify(method, params = {}) {
    this.child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method,
      params
    }) + '\n');
  }

  async callTool(name, args = {}, timeoutMs = 30000) {
    const result = await this.request('tools/call', {
      name,
      arguments: args
    }, timeoutMs);

    if (result?.isError) {
      throw new Error(`${name} failed: ${extractText(result)}`);
    }

    return result;
  }

  async stop() {
    if (!this.child) {
      return;
    }

    const child = this.child;
    this.child = null;
    child.stdin.end();

    await new Promise((resolve) => setTimeout(resolve, 200));

    if (child.exitCode === null) {
      await new Promise((resolve) => {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore'
        });
        killer.on('exit', () => resolve());
        killer.on('error', () => resolve());
      });
    }
  }
}

function createInitScript(session, setup) {
  return `
    localStorage.setItem('srogame:player', ${JSON.stringify(JSON.stringify(session))});
    localStorage.setItem('srogame:setup', ${JSON.stringify(JSON.stringify(setup))});
  `;
}

async function saveSnapshot(client, name) {
  const snapshotPath = path.join(OUTPUT_DIR, `${name}.txt`);
  await client.callTool('take_snapshot', { filePath: snapshotPath }, 30000);
  return snapshotPath;
}

async function saveScreenshot(client, name) {
  const screenshotPath = path.join(OUTPUT_DIR, `${name}.png`);
  await client.callTool('take_screenshot', { filePath: screenshotPath, fullPage: true }, 30000);
  return screenshotPath;
}

async function timeStep(stepTimings, name, fn) {
  const startedAt = performance.now();
  const value = await fn();
  stepTimings.push({
    name,
    durationMs: roundDuration(performance.now() - startedAt)
  });
  return value;
}

async function runRouteSmokeViaMcp(options) {
  ensureOutputDir();
  await ensureServicesAvailable();

  const { session, setup, playerName, homePlanet } = await loginAndStartGame();
  const client = new McpClient(options);
  const stepTimings = [];
  const artifacts = {};

  try {
    await client.start();
    await client.callTool('new_page', { url: 'about:blank', timeout: 10000 }, 60000);

    const initScript = createInitScript(session, setup);

    await timeStep(stepTimings, 'mainMenu', async () => {
      await client.callTool('navigate_page', {
        type: 'url',
        url: `${BASE_UI_URL}/`,
        initScript,
        timeout: 30000
      }, 60000);
      await client.callTool('wait_for', { text: ['Srogame', `Logged in as ${playerName}`], timeout: 30000 }, 35000);
      artifacts.mainMenuSnapshot = await saveSnapshot(client, 'main-menu');
    });

    await timeStep(stepTimings, 'planetView', async () => {
      await client.callTool('navigate_page', {
        type: 'url',
        url: `${BASE_UI_URL}/game/planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        timeout: 30000
      }, 60000);
      await client.callTool('wait_for', {
        text: ['Planet Parameters', homePlanet.basicInfo.name],
        timeout: 30000
      }, 35000);
      artifacts.planetSnapshot = await saveSnapshot(client, 'planet-view');
    });

    await timeStep(stepTimings, 'missionPlanner', async () => {
      await client.callTool('navigate_page', {
        type: 'url',
        url: `${BASE_UI_URL}/game/mission-planner`,
        timeout: 30000
      }, 60000);
      await client.callTool('wait_for', {
        text: ['Mission type', 'Launch Summary', 'Fleet Composition'],
        timeout: 30000
      }, 35000);
      artifacts.missionPlannerSnapshot = await saveSnapshot(client, 'mission-planner');
    });

    await timeStep(stepTimings, 'operations', async () => {
      await client.callTool('navigate_page', {
        type: 'url',
        url: `${BASE_UI_URL}/game/operations`,
        timeout: 30000
      }, 60000);
      await client.callTool('wait_for', {
        text: ['Operations', 'No active fleets'],
        timeout: 30000
      }, 35000);
      artifacts.operationsSnapshot = await saveSnapshot(client, 'operations');
    });

    await timeStep(stepTimings, 'reports', async () => {
      await client.callTool('navigate_page', {
        type: 'url',
        url: `${BASE_UI_URL}/game/reports`,
        timeout: 30000
      }, 60000);
      await client.callTool('wait_for', {
        text: ['Inbox', 'Select all visible'],
        timeout: 30000
      }, 35000);
      artifacts.reportsSnapshot = await saveSnapshot(client, 'reports');
      artifacts.reportsScreenshot = await saveScreenshot(client, 'reports');
    });

    const consoleMessages = extractText(await client.callTool('list_console_messages', {}, 30000));
    const networkRequests = extractText(await client.callTool('list_network_requests', {}, 30000));
    fs.writeFileSync(path.join(OUTPUT_DIR, 'console-messages.txt'), consoleMessages);
    fs.writeFileSync(path.join(OUTPUT_DIR, 'network-requests.txt'), networkRequests);

    const locationResult = await client.callTool('evaluate_script', {
      function: '() => ({ href: location.href, title: document.title })'
    }, 30000);

    const result = {
      playerName,
      homePlanet: `${homePlanet.coordinates.x}:${homePlanet.coordinates.y}:${homePlanet.coordinates.z}`,
      headed: options.headed,
      stepTimings,
      artifacts: {
        ...artifacts,
        consoleMessages: path.join(OUTPUT_DIR, 'console-messages.txt'),
        networkRequests: path.join(OUTPUT_DIR, 'network-requests.txt')
      },
      location: extractText(locationResult)
    };

    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`);
    return result;
  } finally {
    await client.stop();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const result = await runRouteSmokeViaMcp(options);
  const summary = {
    ...result,
    totalDurationMs: roundDuration(performance.now() - startedAt)
  };
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
