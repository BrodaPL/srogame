const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { chromium } = require('playwright');

const BASE_UI_URL = process.env.SROGAME_UI_URL ?? 'http://localhost:4200';
const BASE_API_URL = process.env.SROGAME_API_URL ?? 'http://localhost:3000/api';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'tmp', 'bot-smoke-results.json');

const TEST_USER_NAME = process.env.SROGAME_BOT_SMOKE_USER ?? 'TestUserA';
const TEST_USER_PASSWORD = process.env.SROGAME_BOT_SMOKE_PASSWORD ?? '***REMOVED***';

const CHROME_CANDIDATES = [
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function expectOkResponse(result, message) {
  assert(result.response.ok, `${message}: ${result.response.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

function pickBrowserLaunchOptions() {
  const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (executablePath) {
    return {
      executablePath,
      headless: true
    };
  }

  return { headless: true };
}

async function ensureServicesAvailable() {
  await waitForService(async () => {
    const uiResponse = await fetch(BASE_UI_URL);
    assert(uiResponse.ok, `UI is not reachable at ${BASE_UI_URL}`);
  }, 'UI service did not become ready in time.');

  await waitForService(async () => {
    const apiResponse = await fetch(`${BASE_API_URL}/auth/me`);
    assert(apiResponse.status === 401, `API is not reachable at ${BASE_API_URL} or auth behavior changed`);
  }, 'API service did not become ready in time.');
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

async function loginLocalAdmin() {
  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      playerName: TEST_USER_NAME,
      password: TEST_USER_PASSWORD
    })
  });
  assert(login.response.ok, `Login failed for ${TEST_USER_NAME}: ${login.response.status}`);
  return login.data;
}

function buildBotSmokeSetup() {
  return {
    gameType: 'Sandbox',
    galaxyName: `Bot Smoke ${Date.now() % 100000}`,
    galaxyWidth: 18,
    galaxyHeight: 14,
    galaxyCenterSize: 6,
    voidChance: 3,
    starsAmountModifier: [0, 2],
    playerAmount: 1,
    botsAmount: 3,
    botDifficulty: 25,
    neutralBotsAmount: 1,
    neutralBotsDifficulty: 0,
    createRandomPlanets: false,
    createStartingShips: true,
    skipTutorial: true,
    startingResources: {
      metal: 800,
      crystal: 500,
      deuterium: 250
    }
  };
}

async function startBotSmokeGame(session, setup) {
  const start = await authed('/game/start', session.token, {
    method: 'POST',
    body: JSON.stringify({ setup })
  });
  return expectOkResponse(start, 'Unable to start bot smoke game');
}

async function loadMail(token) {
  return expectOkResponse(await authed('/game/mail', token), 'Unable to load mail view');
}

async function clearMailBlockers(token) {
  const before = await loadMail(token);
  let unreadMessagesCleared = 0;
  let requestsResolved = 0;

  for (const message of before.messages.filter((entry) => !entry.isRead)) {
    await expectOkResponse(
      await authed('/game/mail/messages/read', token, {
        method: 'POST',
        body: JSON.stringify({ messageId: message.messageId })
      }),
      `Unable to mark message ${message.messageId} as read`
    );
    unreadMessagesCleared += 1;
  }

  for (const request of before.requests.filter((entry) =>
    entry.direction === 'incoming' && entry.state === 'PENDING'
  )) {
    switch (request.requestType) {
      case 'DIPLOMACY_PROPOSAL':
        await expectOkResponse(
          await authed(`/game/diplomacy/proposals/${request.requestId}/reject`, token, {
            method: 'POST',
            body: JSON.stringify({})
          }),
          `Unable to reject diplomacy proposal ${request.requestId}`
        );
        requestsResolved += 1;
        break;
      case 'JUMP_GATE':
        await expectOkResponse(
          await authed(`/game/mail/jump-gate-requests/${request.requestId}/reject`, token, {
            method: 'POST',
            body: JSON.stringify({})
          }),
          `Unable to reject Jump Gate request ${request.requestId}`
        );
        requestsResolved += 1;
        break;
      case 'MAINTENANCE':
        await expectOkResponse(
          await authed(`/game/mail/maintenance-requests/${request.requestId}/reject`, token, {
            method: 'POST',
            body: JSON.stringify({})
          }),
          `Unable to reject maintenance request ${request.requestId}`
        );
        requestsResolved += 1;
        break;
      default:
        break;
    }
  }

  const after = await loadMail(token);
  return {
    unreadMessagesCleared,
    requestsResolved,
    pendingAfter: after.pendingRequestCount,
    unreadAfter: after.unreadMessageCount,
    pendingRequestTitles: after.requests
      .filter((entry) => entry.direction === 'incoming' && entry.state === 'PENDING')
      .map((entry) => `${entry.requestType}:${entry.requestId}`)
  };
}

async function advanceTurns(token, turnsToRun) {
  const turnResults = [];

  for (let turnIndex = 0; turnIndex < turnsToRun; turnIndex += 1) {
    const blockerClear = await clearMailBlockers(token);
    const endTurn = await authed('/game/end-turn', token, {
      method: 'POST',
      body: JSON.stringify({})
    });
    if (!endTurn.response.ok) {
      return {
        completedTurns: turnIndex,
        stoppedEarly: true,
        stopReason: `End turn failed: ${endTurn.response.status} ${JSON.stringify(endTurn.data)}`,
        turnResults
      };
    }

    const gameState = endTurn.data;
    const activeFleets = await expectOkResponse(
      await authed('/game/active-fleets', token),
      'Unable to load active fleets during bot smoke'
    );
    const botTraces = await expectOkResponse(
      await authed('/admin/bots/traces', token),
      'Unable to load bot traces during bot smoke'
    );
    const diplomacyView = await expectOkResponse(
      await authed('/game/diplomacy-view', token),
      'Unable to load diplomacy view during bot smoke'
    );
    const mailView = await loadMail(token);

    turnResults.push({
      turn: gameState.galaxy.currentTurn,
      blockerClear,
      activeFleetCount: activeFleets.length,
      botTraceCount: botTraces.traces.length,
      diplomacyContactCount: diplomacyView.contacts.length,
      pendingMailCount: mailView.pendingRequestCount,
      unreadMailCount: mailView.unreadMessageCount,
      proposalActionCount: botTraces.traces.reduce((sum, trace) => sum + trace.chosenActions.filter((action) =>
        action.kind.startsWith('propose-') || action.kind.startsWith('approve-') || action.kind.startsWith('reject-')
      ).length, 0)
    });
  }

  return {
    completedTurns: turnsToRun,
    stoppedEarly: false,
    stopReason: null,
    turnResults
  };
}

function createBrowserMonitor(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('response', (response) => {
    const url = response.url();
    if (!url.startsWith(BASE_UI_URL) && !url.startsWith(BASE_API_URL)) {
      return;
    }
    if (response.status() >= 400) {
      failedResponses.push(`${response.status()} ${url}`);
    }
  });

  return {
    assertClean() {
      assert(consoleErrors.length === 0, `Browser console errors: ${JSON.stringify(consoleErrors)}`);
      assert(pageErrors.length === 0, `Browser page errors: ${JSON.stringify(pageErrors)}`);
      assert(failedResponses.length === 0, `Browser failed responses: ${JSON.stringify(failedResponses)}`);
    }
  };
}

async function createScenarioPage(browser, session, setup) {
  const context = await browser.newContext();
  await context.addInitScript(({ savedSession, savedSetup }) => {
    localStorage.setItem('srogame:player', JSON.stringify(savedSession));
    localStorage.setItem('srogame:setup', JSON.stringify(savedSetup));
  }, {
    savedSession: session,
    savedSetup: setup
  });

  const page = await context.newPage();
  const monitor = createBrowserMonitor(page);

  return {
    context,
    page,
    monitor,
    async close() {
      await context.close();
    }
  };
}

async function waitForText(page, text, timeout = 20000) {
  await page.locator(`text=${text}`).first().waitFor({ state: 'visible', timeout });
}

async function dismissTutorialOverlay(page) {
  const closeButton = page.getByRole('button', { name: 'Close tutorial' });
  if (await closeButton.count() <= 0) {
    return;
  }

  const isVisible = await closeButton.first().isVisible().catch(() => false);
  if (!isVisible) {
    return;
  }

  await closeButton.first().click();
}

async function capturePageChecks(browser, session, setup, summary) {
  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];

  try {
    const { page } = browserSession;

    await timeStep(stepTimings, 'operationsView', async () => {
      await page.goto(`${BASE_UI_URL}/game/operations`, { waitUntil: 'domcontentloaded' });
      await waitForText(page, 'Operations');
      await dismissTutorialOverlay(page);
      if (summary.activeFleetCount > 0) {
        await waitForText(page, 'Fleet #');
      } else {
        await waitForText(page, 'No active fleets');
      }
    });

    await timeStep(stepTimings, 'mailView', async () => {
      await page.goto(`${BASE_UI_URL}/game/mail`, { waitUntil: 'domcontentloaded' });
      await waitForText(page, 'Mail');
      await waitForText(page, 'Pending Requests');
      await waitForText(page, 'Unread messages');
      await dismissTutorialOverlay(page);
    });

    await timeStep(stepTimings, 'diplomacyView', async () => {
      await page.goto(`${BASE_UI_URL}/game/diplomacy`, { waitUntil: 'domcontentloaded' });
      await waitForText(page, 'Diplomacy');
      await waitForText(page, 'Discovered Contacts');
      await waitForText(page, 'Pending proposals');
      await dismissTutorialOverlay(page);
    });

    await timeStep(stepTimings, 'botDebugView', async () => {
      await page.goto(`${BASE_UI_URL}/game/bot-debug`, { waitUntil: 'domcontentloaded' });
      await waitForText(page, 'Bot Decision Traces');
      await waitForText(page, 'Stored traces');
      await dismissTutorialOverlay(page);
      if (summary.botTraceCount > 0) {
        await waitForText(page, 'Chosen actions');
      }
    });

    browserSession.monitor.assertClean();
    return stepTimings;
  } finally {
    await browserSession.close();
  }
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

function roundDuration(durationMs) {
  return Math.round(durationMs * 100) / 100;
}

async function runLiveBotSingleplayer(browser) {
  const session = await loginLocalAdmin();
  const setup = buildBotSmokeSetup();
  await startBotSmokeGame(session, setup);

  const turnRun = await advanceTurns(session.token, 10);
  const finalState = await expectOkResponse(
    await authed('/game/state', session.token),
    'Unable to load game state after bot smoke turn run'
  );
  const activeFleets = await expectOkResponse(
    await authed('/game/active-fleets', session.token),
    'Unable to load active fleets after bot smoke turn run'
  );
  const botTraces = await expectOkResponse(
    await authed('/admin/bots/traces', session.token),
    'Unable to load bot traces after bot smoke turn run'
  );
  const diplomacyView = await expectOkResponse(
    await authed('/game/diplomacy-view', session.token),
    'Unable to load diplomacy view after bot smoke turn run'
  );
  const mailView = await loadMail(session.token);

  const proposalActionCount = botTraces.traces.reduce((sum, trace) => sum + trace.chosenActions.filter((action) =>
    action.kind.startsWith('propose-') || action.kind.startsWith('approve-') || action.kind.startsWith('reject-')
  ).length, 0);

  const finalSummary = {
    turn: finalState.galaxy.currentTurn,
    activeFleetCount: activeFleets.length,
    botTraceCount: botTraces.traces.length,
    diplomacyContactCount: diplomacyView.contacts.length,
    pendingMailCount: mailView.pendingRequestCount,
    unreadMailCount: mailView.unreadMessageCount,
    proposalActionCount
  };

  const stepTimings = await capturePageChecks(browser, session, setup, finalSummary);

  return {
    advisoryChecks: {
      activeFleetSeen: activeFleets.length > 0,
      botTraceSeen: botTraces.traces.length > 0,
      diplomacyActionSeen: proposalActionCount > 0,
      diplomacyPageLoaded: true,
      mailPageLoaded: true
    },
    turnRun,
    finalSummary,
    stepTimings
  };
}

async function main() {
  await ensureServicesAvailable();

  const browser = await chromium.launch(pickBrowserLaunchOptions());
  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();
  let result = null;

  try {
    result = await runScenario(browser, 'liveBotSingleplayer', runLiveBotSingleplayer);
  } finally {
    await browser.close();
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalDurationMs: roundDuration(performance.now() - startedAtPerf),
    scenarios: [result]
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Saved advisory bot smoke results to ${OUTPUT_PATH}`);

  const advisory = result.details?.advisoryChecks ?? null;
  if (advisory) {
    console.log(`Advisory: activeFleetSeen=${advisory.activeFleetSeen}, botTraceSeen=${advisory.botTraceSeen}, diplomacyActionSeen=${advisory.diplomacyActionSeen}`);
  }
}

async function runScenario(browser, scenarioName, runner) {
  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();
  try {
    const details = await runner(browser);
    console.log(`OK ${scenarioName} ${roundDuration(performance.now() - startedAtPerf)}ms`);
    return {
      scenario: scenarioName,
      passed: true,
      startedAt,
      durationMs: roundDuration(performance.now() - startedAtPerf),
      details
    };
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.log(`ERR ${scenarioName} ${roundDuration(performance.now() - startedAtPerf)}ms`);
    console.log(`  ${message}`);
    return {
      scenario: scenarioName,
      passed: false,
      startedAt,
      durationMs: roundDuration(performance.now() - startedAtPerf),
      error: message
    };
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
