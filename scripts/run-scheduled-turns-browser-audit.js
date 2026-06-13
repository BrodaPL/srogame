const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const AUTH_PATH = path.join(ROOT, 'server', 'data', 'auth.json');
const OUTPUT_DIR = path.join(ROOT, 'tmp', 'scheduled-turns-browser-audit');
const RESULT_PATH = path.join(OUTPUT_DIR, 'result.json');
const UI_BASE_URL = 'http://localhost:4200';
const API_BASE_URL = 'http://localhost:3000/api';
const HOST_NAME = 'TestUserA';
const GUEST_NAME = 'McpScenarioB';
const CONTROLLED_CLOCK_PATH = process.env.SROGAME_CONTROLLED_CLOCK_PATH ?? null;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function latestStoredSession(playerName) {
  const auth = JSON.parse(fs.readFileSync(AUTH_PATH, 'utf8'));
  const account = auth.accounts.find((candidate) => candidate.playerName === playerName);
  assert(account, `Missing local test account ${playerName}.`);
  const session = auth.sessions
    .filter((candidate) => candidate.accountId === account.id)
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))[0];
  assert(session, `Missing local test session for ${playerName}.`);
  return { account, token: session.token };
}

async function api(pathname, token, options = {}) {
  const response = await fetch(`${API_BASE_URL}${pathname}`, {
    method: options.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  return {
    response,
    data: text ? JSON.parse(text) : null,
  };
}

async function playerSession(token) {
  const result = await api('/auth/me', token);
  assert(result.response.ok, `Unable to load player session: ${result.response.status}.`);
  return result.data;
}

async function createContext(browser, session) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript((savedSession) => {
    localStorage.setItem('srogame:player', JSON.stringify(savedSession));
    localStorage.setItem('srogame:language', 'en');
  }, session);
  return context;
}

function monitorPage(page) {
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    if (failure !== 'net::ERR_ABORTED') {
      errors.push(`request: ${failure} ${request.url()}`);
    }
  });
  return errors;
}

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry while the local server starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Local API did not become healthy.');
}

async function waitForAutomaticTurn(gameId, token, initialTurn) {
  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const status = await api(`/games/${gameId}/turn-status`, token);
    if (status.response.ok && status.data.currentTurn > initialTurn) {
      return status.data;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Scheduled turn did not advance within 45 seconds of entering the configured slot.');
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await waitForHealth();

  const host = latestStoredSession(HOST_NAME);
  const guest = latestStoredSession(GUEST_NAME);
  const hostSession = await playerSession(host.token);
  const guestSession = await playerSession(guest.token);
  const previousCurrentGameIds = {
    host: hostSession.currentGameId,
    guest: guestSession.currentGameId,
  };
  const gameName = `Scheduled Turns Browser Audit ${Date.now()}`;
  const nextHour = ((new Date().getHours() + 1) % 24) || 24;
  const result = {
    gameName,
    gameId: null,
    previousCurrentGameIds,
    checks: [],
    browserErrors: [],
    cleanupRequiresServerRestart: true,
  };

  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const hostContext = await createContext(browser, hostSession);
  const guestContext = await createContext(browser, guestSession);
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  const hostErrors = monitorPage(hostPage);
  const guestErrors = monitorPage(guestPage);

  try {
    const initialBrowserState = await api('/multiplayer/games', host.token);
    assert(initialBrowserState.response.ok, 'Unable to load initial multiplayer browser state.');
    const initialGameIds = new Set([
      ...initialBrowserState.data.activeDraftLobbies,
      ...initialBrowserState.data.activeRunningGames,
      ...initialBrowserState.data.otherMultiplayerGames,
    ].map((item) => item.gameId));

    await hostPage.goto(`${UI_BASE_URL}/multiplayer`, { waitUntil: 'domcontentloaded' });
    await hostPage.getByRole('button', { name: 'Create Draft Lobby' }).click();
    await hostPage.locator('#galaxyName').waitFor({ state: 'visible' });
    await hostPage.waitForTimeout(1000);

    const browserState = await api('/multiplayer/games', host.token);
    const createdLobby = browserState.data.activeDraftLobbies.find(
      (item) => item.hostAccountId === host.account.id && !initialGameIds.has(item.gameId),
    );
    assert(createdLobby, 'The newly created draft lobby was not returned by the browser API.');
    result.gameId = createdLobby.gameId;
    result.checks.push('Host created a draft lobby through the multiplayer UI.');

    await hostPage.locator('#galaxyName').fill(gameName);
    await hostPage.locator('#galaxyWidth').fill('16');
    await hostPage.locator('#galaxyHeight').fill('16');
    await hostPage.locator('#scheduledTurnsEnabled').check();
    await hostPage.getByRole('button', { name: 'Edit Schedule' }).click();

    const hourInputs = hostPage.locator('.scheduled-turn-grid input[type="checkbox"]');
    await hourInputs.first().waitFor({ state: 'visible' });
    for (let index = 0; index < await hourInputs.count(); index += 1) {
      const input = hourInputs.nth(index);
      if (await input.isChecked()) {
        const inputId = await input.getAttribute('id');
        await hostPage.locator(`label[for="${inputId}"]`).click();
      }
    }
    await hostPage.locator(`label[for="scheduled-turn-hour-${nextHour}"]`).click();
    await hostPage.getByText('1 selected', { exact: false }).waitFor({ state: 'visible' });
    await hostPage.getByRole('button', { name: 'Close' }).click();
    await hostPage.getByRole('button', { name: 'Save Lobby Setup' }).click();
    await hostPage.getByText('Lobby setup saved.', { exact: false }).waitFor({ state: 'visible' });

    const detail = await api(`/multiplayer/games/${result.gameId}`, host.token);
    assert(detail.response.ok, 'Unable to reload the configured lobby.');
    assert(detail.data.lobby.setup.scheduledTurns.enabled === true, 'Scheduled Turns was not saved.');
    assert(
      JSON.stringify(detail.data.lobby.setup.scheduledTurns.enabledHours) === JSON.stringify([nextHour]),
      'The selected scheduled hour was not saved.',
    );
    assert(detail.data.lobby.setup.galaxyWidth === 16 && detail.data.lobby.setup.galaxyHeight === 16,
      'The minimum Scheduled Turns map dimensions were not saved.');
    result.checks.push('Scheduled Turns, one hourly slot, and the 16x16 minimum map were persisted.');

    await guestPage.goto(`${UI_BASE_URL}/multiplayer`, { waitUntil: 'domcontentloaded' });
    const draftCard = guestPage.locator('.multiplayer-browser-card').filter({ hasText: gameName });
    await draftCard.waitFor({ state: 'visible' });
    await draftCard.locator('.multiplayer-browser-card__select').click();
    await guestPage.getByRole('button', { name: 'Join Draft Lobby' }).click();
    await guestPage.getByRole('button', { name: 'Ready', exact: true }).click();
    await guestPage.getByText('Marked ready.', { exact: false }).waitFor({ state: 'visible' });
    result.checks.push('The second isolated browser joined the draft and marked itself ready.');

    await hostPage.reload({ waitUntil: 'domcontentloaded' });
    const hostDraftCard = hostPage.locator('.multiplayer-browser-card').filter({ hasText: gameName });
    await hostDraftCard.waitFor({ state: 'visible' });
    await hostDraftCard.locator('.multiplayer-browser-card__select').click();
    const startButton = hostPage.getByRole('button', { name: 'Start Multiplayer Game' });
    await startButton.waitFor({ state: 'visible' });
    assert(!(await startButton.isDisabled()), 'The ready two-player Scheduled Turns lobby should be startable.');
    await startButton.click();
    await hostPage.waitForURL('**/game/imperium', { timeout: 30000 });
    result.checks.push('The host started the ready Scheduled Turns lobby.');

    const hostScheduledButton = hostPage.getByRole('button', { name: 'Scheduled Turns' });
    await hostScheduledButton.waitFor({ state: 'visible' });
    assert(await hostScheduledButton.isDisabled(), 'Manual End Turn control is not disabled in Scheduled Turns.');
    await hostPage.getByText('Next turn in', { exact: false }).waitFor({ state: 'visible' });
    await hostPage.screenshot({ path: path.join(OUTPUT_DIR, 'host-running.png'), fullPage: true });

    const hostStatus = await api(`/games/${result.gameId}/turn-status`, host.token);
    assert(hostStatus.response.ok, `Host turn status failed: ${hostStatus.response.status}.`);
    assert(hostStatus.data.scheduledTurnsEnabled === true, 'Turn status does not mark Scheduled Turns enabled.');
    assert(hostStatus.data.requiresAllPlayersReady === false, 'Scheduled Turns unexpectedly requires all players ready.');
    assert(hostStatus.data.minimumOnlineHumanCount === 1, 'Scheduled Turns minimum online count is not one.');
    assert(typeof hostStatus.data.scheduledTurnsNextTurnAt === 'string', 'Next scheduled turn timestamp is missing.');
    const expectedNextHour = nextHour === 24 ? 0 : nextHour;
    assert(
      new Date(hostStatus.data.scheduledTurnsNextTurnAt).getHours() === expectedNextHour,
      'Next scheduled turn timestamp does not match the selected hour.',
    );
    result.checks.push('Turn status exposes the one-player rule and the expected next scheduled timestamp.');

    const manualEndTurn = await api(`/games/${result.gameId}/end-turn`, host.token, { method: 'POST', body: {} });
    assert(manualEndTurn.response.status === 409, `Manual End Turn returned ${manualEndTurn.response.status}, expected 409.`);
    assert(
      manualEndTurn.data?.errorKey === 'api.gameplay.endTurn.scheduledTurnsManualDisabled',
      'Manual End Turn returned the wrong localized error key.',
    );
    result.checks.push('The server rejects manual End Turn with the Scheduled Turns error key.');

    if (CONTROLLED_CLOCK_PATH) {
      const initialTurn = hostStatus.data.currentTurn;
      const nextTurnMs = Date.parse(hostStatus.data.scheduledTurnsNextTurnAt);
      assert(!Number.isNaN(nextTurnMs), 'Cannot advance the controlled clock without a valid next turn timestamp.');
      fs.writeFileSync(CONTROLLED_CLOCK_PATH, new Date(nextTurnMs + 60000).toISOString());
      const advancedStatus = await waitForAutomaticTurn(result.gameId, host.token, initialTurn);
      assert(advancedStatus.currentTurn === initialTurn + 1, 'Scheduled processing advanced more than one turn in one slot.');
      result.checks.push('The 30-second scheduler automatically advanced exactly one turn in the configured hour.');
    }

    await guestPage.goto(`${UI_BASE_URL}/multiplayer`, { waitUntil: 'domcontentloaded' });
    const runningCard = guestPage.locator('.multiplayer-browser-card').filter({ hasText: gameName });
    await runningCard.waitFor({ state: 'visible' });
    await runningCard.getByRole('button', { name: 'Enter' }).click();
    await guestPage.waitForURL('**/game/imperium', { timeout: 30000 });
    await guestPage.getByRole('button', { name: 'Scheduled Turns' }).waitFor({ state: 'visible' });
    await guestPage.getByText('Next turn in', { exact: false }).waitFor({ state: 'visible' });
    await guestPage.screenshot({ path: path.join(OUTPUT_DIR, 'guest-running.png'), fullPage: true });

    const guestState = await api('/game/state', guest.token);
    assert(guestState.response.ok, `Guest could not load game state: ${guestState.response.status}.`);
    assert(guestState.data.player.currentGameId === result.gameId, 'Guest did not enter the running game.');
    const guestStatus = await api(`/games/${result.gameId}/turn-status`, guest.token);
    assert(guestStatus.response.ok, 'Guest could not load turn status.');
    assert(guestStatus.data.scheduledTurnsEnabled === true, 'Guest is not in Scheduled Turns mode.');
    result.checks.push('The non-admin member entered the running game and received Scheduled Turns state.');

    result.browserErrors = [...hostErrors, ...guestErrors];
    assert(result.browserErrors.length === 0, `Browser errors detected: ${result.browserErrors.join(' | ')}`);
    result.checks.push('No console, page, or failed-request errors occurred in either browser context.');
    result.passed = true;
  } catch (error) {
    result.passed = false;
    result.error = error instanceof Error ? error.stack ?? error.message : String(error);
    result.browserErrors = [...hostErrors, ...guestErrors];
    await hostPage.screenshot({ path: path.join(OUTPUT_DIR, 'failure-host.png'), fullPage: true }).catch(() => {});
    await guestPage.screenshot({ path: path.join(OUTPUT_DIR, 'failure-guest.png'), fullPage: true }).catch(() => {});
  } finally {
    if (result.gameId) {
      await api(`/multiplayer/games/${result.gameId}/leave-current-game`, guest.token, { method: 'POST', body: {} }).catch(() => {});
      await api(`/multiplayer/games/${result.gameId}/leave-current-game`, host.token, { method: 'POST', body: {} }).catch(() => {});
      await api(`/multiplayer/games/${result.gameId}/leave`, guest.token, { method: 'POST', body: {} }).catch(() => {});
      await api(`/multiplayer/games/${result.gameId}/leave`, host.token, { method: 'POST', body: {} }).catch(() => {});
    }
    await hostContext.close();
    await guestContext.close();
    await browser.close();
    fs.writeFileSync(RESULT_PATH, JSON.stringify(result, null, 2));
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
