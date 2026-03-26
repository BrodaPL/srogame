const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { chromium } = require('playwright');

const BASE_UI_URL = 'http://localhost:4200';
const BASE_API_URL = 'http://localhost:3000/api';
const OUTPUT_PATH = path.resolve(__dirname, '..', 'tmp', 'smoke-test-results.json');

const CHROME_CANDIDATES = [
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe'
];

const SCENARIOS = [
  'routeSmoke',
  'turnProgression',
  'fleetLifecycle',
  'battleDebris',
  'damagedShipsUi',
  'shipRepairTurn',
  'orbitRepairLifecycle',
  'guardOrbitStatus',
  'repairWarningsUi',
  'smokeSuite'
];

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function uniquePlayerName(prefix) {
  return `${prefix}${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 1000)}`;
}

function buildSetup(smokeTestScenario) {
  return {
    gameType: 'Sandbox',
    galaxyName: `Smoke ${smokeTestScenario} ${Date.now() % 100000}`,
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
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    smokeTestScenario,
    startingResources: {
      metal: 500,
      crystal: 500,
      deuterium: 500
    }
  };
}

async function registerAndStartGame(smokeTestScenario) {
  const playerName = uniquePlayerName('Smoke');
  const password = 'smoke123';

  const register = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ playerName, password })
  });
  assert(register.response.ok, `Register failed for ${smokeTestScenario}: ${register.response.status}`);

  const setup = buildSetup(smokeTestScenario);
  const start = await authed('/game/start', register.data.token, {
    method: 'POST',
    body: JSON.stringify({ setup })
  });
  assert(
    start.response.ok,
    `Start game failed for ${smokeTestScenario}: ${start.response.status} ${JSON.stringify(start.data)}`
  );

  return {
    session: register.data,
    setup,
    playerName
  };
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

function toCoordString(coordinates) {
  return `${coordinates.x}:${coordinates.y}:${coordinates.z}`;
}

function buildingLevel(planet, buildingType) {
  return (planet.objects.buildingsLevels ?? []).find((entry) => entry.type === buildingType)?.level ?? 0;
}

function shipAmount(planet, shipType) {
  return Number(planet.objects.ships?.undamagedShipsCount?.[shipType] ?? 0)
    + (planet.objects.ships?.damagedShips ?? []).filter((entry) => entry.type === shipType).length;
}

function damagedShipCount(ships) {
  return (ships?.damagedShips ?? []).length;
}

function techLevelFromReport(planet, technologyType) {
  return (planet.reportData?.techLevels ?? []).find((entry) => entry.type === technologyType)?.level ?? 0;
}

function flattenVisiblePlanets(clientGalaxy) {
  return clientGalaxy.stars.flatMap((row) =>
    row.flatMap((system) =>
      (system.planets ?? []).map((planet) => ({
        ...planet,
        systemIsVoid: system.isVoid
      }))
    )
  );
}

async function expectOkResponse(result, message) {
  assert(result.response.ok, `${message}: ${result.response.status} ${JSON.stringify(result.data)}`);
  return result.data;
}

function pickChromeExecutable() {
  const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  assert(executablePath, 'Chrome executable not found.');
  return executablePath;
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

async function runRouteSmoke(browser) {
  const { session, setup, playerName } = await registerAndStartGame('routeSmoke');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets'
  );
  const homePlanet = ownedPlanets[0];
  assert(homePlanet, 'routeSmoke did not produce a home planet');

  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];

  try {
    await timeStep(stepTimings, 'mainMenu', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Srogame');
      await waitForText(browserSession.page, `Logged in as ${playerName}`);
      await dismissTutorialOverlay(browserSession.page);
    });

    await timeStep(stepTimings, 'planetView', async () => {
      await browserSession.page.goto(
        `${BASE_UI_URL}/game/planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        { waitUntil: 'domcontentloaded' }
      );
      await waitForText(browserSession.page, 'Planet Parameters');
      await waitForText(browserSession.page, homePlanet.basicInfo.name);
      await dismissTutorialOverlay(browserSession.page);
    });

    await timeStep(stepTimings, 'missionPlanner', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/mission-planner`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Mission type');
      await waitForText(browserSession.page, 'Launch Summary');
      await waitForText(browserSession.page, 'Fleet Composition');
      await dismissTutorialOverlay(browserSession.page);
    });

    await timeStep(stepTimings, 'operations', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/operations`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Operations');
      await waitForText(browserSession.page, 'No active fleets');
      await dismissTutorialOverlay(browserSession.page);
    });

    await timeStep(stepTimings, 'reports', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/reports`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Inbox');
      await waitForText(browserSession.page, 'Select all visible');
      await dismissTutorialOverlay(browserSession.page);
    });

    browserSession.monitor.assertClean();

    return {
      playerName,
      homePlanet: toCoordString(homePlanet.coordinates),
      stepTimings
    };
  } finally {
    await browserSession.close();
  }
}

async function runTurnProgression() {
  const { session } = await registerAndStartGame('turnProgression');
  const beforeOwnedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets before turn progression'
  );
  const homeBefore = beforeOwnedPlanets[0];
  assert(homeBefore, 'turnProgression did not produce a home planet');

  const resourcesBefore = { ...homeBefore.objects.resources };
  const shipyardLevelBefore = buildingLevel(homeBefore, 'Shipyard');
  const fightersBefore = shipAmount(homeBefore, 'Fighter');

  await expectOkResponse(
    await authed('/game/end-turn', session.token, { method: 'POST', body: JSON.stringify({}) }),
    'Unable to resolve end turn for turnProgression'
  );

  const afterOwnedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets after turn progression'
  );
  const homeAfter = afterOwnedPlanets.find((planet) => toCoordString(planet.coordinates) === toCoordString(homeBefore.coordinates));
  assert(homeAfter, 'turnProgression lost the original home planet');

  assert(homeAfter.objects.resources.metal > resourcesBefore.metal, 'Metal did not increase after turn');
  assert(homeAfter.objects.resources.crystal > resourcesBefore.crystal, 'Crystal did not increase after turn');
  assert(homeAfter.objects.resources.deuterium > resourcesBefore.deuterium, 'Deuterium did not increase after turn');
  assert(homeAfter.objects.buildingQueue.length === 0, 'Building queue did not finish');
  assert(homeAfter.objects.shipyardQueue.length === 0, 'Shipyard queue did not finish');
  assert(homeAfter.objects.currentResearchQueue === null, 'Research queue did not finish');
  assert(buildingLevel(homeAfter, 'Shipyard') === shipyardLevelBefore + 1, 'Shipyard level did not advance');
  assert(shipAmount(homeAfter, 'Fighter') === fightersBefore + 1, 'Fighter production did not complete');
  assert(techLevelFromReport(homeAfter, 'Energy Technology') >= 1, 'Energy Technology did not complete');

  return {
    homePlanet: toCoordString(homeBefore.coordinates),
    resourcesBefore,
    resourcesAfter: homeAfter.objects.resources
  };
}

async function runFleetLifecycle(browser) {
  const { session, setup } = await registerAndStartGame('fleetLifecycle');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for fleetLifecycle'
  );
  const homePlanet = ownedPlanets.find((planet) =>
    shipAmount(planet, 'Cruiser') >= 1
    && shipAmount(planet, 'Transporter') >= 1
    && shipAmount(planet, 'Spy Probe') >= 1
  );
  assert(homePlanet, 'fleetLifecycle did not produce a home planet');
  const remoteOwnedPlanet = ownedPlanets.find((planet) => toCoordString(planet.coordinates) !== toCoordString(homePlanet.coordinates));
  assert(remoteOwnedPlanet, 'fleetLifecycle did not produce a remote owned planet');

  const clientGalaxy = await expectOkResponse(
    await authed('/game/client-galaxy?includePlanets=true', session.token),
    'Unable to load client galaxy for fleetLifecycle'
  );
  const spyTarget = flattenVisiblePlanets(clientGalaxy).find((planet) =>
    !planet.systemIsVoid
    && planet.basicInfo?.type !== 'Asteroids'
    && planet.info.ownerId !== homePlanet.info.ownerId
    && toCoordString(planet.coordinates) !== toCoordString(homePlanet.coordinates)
    && toCoordString(planet.coordinates) !== toCoordString(remoteOwnedPlanet.coordinates)
  );
  assert(spyTarget, 'fleetLifecycle did not produce a spy target');

  let activeFleets = await expectOkResponse(
    await authed('/game/active-fleets', session.token),
    'Unable to load initial active fleets for fleetLifecycle'
  );
  assert(activeFleets.length === 0, 'fleetLifecycle should start with no active fleets');

  await expectOkResponse(
    await authed('/game/active-fleets', session.token, {
      method: 'POST',
      body: JSON.stringify({
        missionType: 'Move',
        origin: homePlanet.coordinates,
        target: remoteOwnedPlanet.coordinates,
        ships: [{ type: 'Cruiser', undamagedAmount: 1, damagedAmount: 0 }],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      })
    }),
    'Unable to create Move mission'
  );

  await expectOkResponse(
    await authed('/game/active-fleets', session.token, {
      method: 'POST',
      body: JSON.stringify({
        missionType: 'Transport',
        origin: homePlanet.coordinates,
        target: remoteOwnedPlanet.coordinates,
        ships: [{ type: 'Transporter', undamagedAmount: 1, damagedAmount: 0 }],
        cargo: { metal: 100, crystal: 40, deuterium: 20 }
      })
    }),
    'Unable to create Transport mission'
  );

  await expectOkResponse(
    await authed('/game/active-fleets', session.token, {
      method: 'POST',
      body: JSON.stringify({
        missionType: 'Spy',
        origin: homePlanet.coordinates,
        target: spyTarget.coordinates,
        ships: [{ type: 'Spy Probe', undamagedAmount: 1, damagedAmount: 0 }],
        cargo: { metal: 0, crystal: 0, deuterium: 0 }
      })
    }),
    'Unable to create Spy mission'
  );

  activeFleets = await expectOkResponse(
    await authed('/game/active-fleets', session.token),
    'Unable to load created active fleets for fleetLifecycle'
  );

  const moveFleet = activeFleets.find((fleet) => fleet.missionType === 'Move');
  const transportFleet = activeFleets.find((fleet) => fleet.missionType === 'Transport');
  const spyFleet = activeFleets.find((fleet) => fleet.missionType === 'Spy');

  assert(moveFleet, 'Move fleet was not created');
  assert(transportFleet, 'Transport fleet was not created');
  assert(spyFleet, 'Spy fleet was not created');

  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];
  let transportReturningSeen = false;
  let moveMerged = false;
  let transportResolved = false;
  let spyReportSeen = false;

  try {
    await timeStep(stepTimings, 'operationsInitial', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/operations`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Operations');
      await waitForText(browserSession.page, 'Move | MOVING TO TARGET');
      await waitForText(browserSession.page, 'Transport | MOVING TO TARGET');
      await waitForText(browserSession.page, 'Spy | MOVING TO TARGET');
      await dismissTutorialOverlay(browserSession.page);
    });

    await timeStep(stepTimings, 'turnResolution', async () => {
      for (let turn = 0; turn < 10; turn += 1) {
        await expectOkResponse(
          await authed('/game/end-turn', session.token, { method: 'POST', body: JSON.stringify({}) }),
          'Unable to resolve end turn for fleetLifecycle'
        );

        const reports = await expectOkResponse(
          await authed('/game/reports', session.token),
          'Unable to load reports during fleetLifecycle'
        );
        const fleets = await expectOkResponse(
          await authed('/game/active-fleets', session.token),
          'Unable to load active fleets during fleetLifecycle'
        );
        const remoteOwnedPlanetState = await expectOkResponse(
          await authed(
            `/game/client-planet?x=${remoteOwnedPlanet.coordinates.x}&y=${remoteOwnedPlanet.coordinates.y}&z=${remoteOwnedPlanet.coordinates.z}`,
            session.token
          ),
          'Unable to load remote owned planet during fleetLifecycle'
        );

        if (fleets.some((fleet) => fleet.fleetId === transportFleet.fleetId && fleet.state === 'RETURNING')) {
          transportReturningSeen = true;
        }

        if (!fleets.some((fleet) => fleet.fleetId === moveFleet.fleetId)
          && shipAmount(remoteOwnedPlanetState, 'Cruiser') >= 1) {
          moveMerged = true;
        }

        if (transportReturningSeen && !fleets.some((fleet) => fleet.fleetId === transportFleet.fleetId)) {
          transportResolved = true;
        }

        if (reports.some((report) => report.reportType === 'Espionage Report')) {
          spyReportSeen = true;
        }

        if (moveMerged && transportResolved && spyReportSeen) {
          break;
        }
      }
    });

    assert(moveMerged, 'Move mission did not merge into the remote owned planet');
    assert(transportReturningSeen, 'Transport mission never entered RETURNING');
    assert(transportResolved, 'Transport mission did not resolve after returning');
    assert(spyReportSeen, 'Spy mission did not create an espionage report');

    await timeStep(stepTimings, 'reportsView', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/reports`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Inbox');
      await waitForText(browserSession.page, 'Espionage Report');
      await dismissTutorialOverlay(browserSession.page);
    });

    browserSession.monitor.assertClean();

    return {
      homePlanet: toCoordString(homePlanet.coordinates),
      remoteOwnedPlanet: toCoordString(remoteOwnedPlanet.coordinates),
      spyTarget: toCoordString(spyTarget.coordinates),
      transportReturningSeen,
      moveMerged,
      transportResolved,
      spyReportSeen,
      stepTimings
    };
  } finally {
    await browserSession.close();
  }
}

async function runBattleDebris() {
  const { session } = await registerAndStartGame('battleDebris');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for battleDebris'
  );
  const homePlanet = ownedPlanets[0];
  assert(homePlanet, 'battleDebris did not produce an owned target planet');

  const targetBefore = await expectOkResponse(
    await authed(
      `/game/client-planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
      session.token
    ),
    'Unable to load battle target before turn'
  );
  assert(targetBefore.objects.spaceDebris.metal === 0, 'battleDebris target started with metal debris');
  assert(targetBefore.objects.spaceDebris.crystal === 0, 'battleDebris target started with crystal debris');
  assert(targetBefore.objects.spaceDebris.deuterium === 0, 'battleDebris target started with deuterium debris');

  let targetAfter = targetBefore;
  let battleReportSeen = false;
  for (let turn = 0; turn < 3; turn += 1) {
    await expectOkResponse(
      await authed('/game/end-turn', session.token, { method: 'POST', body: JSON.stringify({}) }),
      'Unable to resolve end turn for battleDebris'
    );

    targetAfter = await expectOkResponse(
      await authed(
        `/game/client-planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        session.token
      ),
      'Unable to load battle target after turn'
    );
    const reports = await expectOkResponse(
      await authed('/game/reports', session.token),
      'Unable to load reports after battleDebris turn'
    );
    battleReportSeen = reports.some((report) =>
      report.reportType === 'Fleet report' && report.title.includes('Battle Report')
    );

    if (
      battleReportSeen
      && (
        targetAfter.objects.spaceDebris.metal > 0
        || targetAfter.objects.spaceDebris.crystal > 0
        || targetAfter.objects.spaceDebris.deuterium > 0
      )
    ) {
      break;
    }
  }

  assert(battleReportSeen, 'battleDebris did not produce a battle report');
  assert(
    targetAfter.objects.spaceDebris.metal > 0
      || targetAfter.objects.spaceDebris.crystal > 0
      || targetAfter.objects.spaceDebris.deuterium > 0,
    'battleDebris did not create debris'
  );

  return {
    targetPlanet: toCoordString(homePlanet.coordinates),
    spaceDebris: targetAfter.objects.spaceDebris
  };
}

async function runDamagedShipsUi(browser) {
  const { session, setup } = await registerAndStartGame('damagedShipsUi');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for damagedShipsUi'
  );
  const homePlanet = ownedPlanets[0];
  assert(homePlanet, 'damagedShipsUi did not produce a home planet');
  assert(homePlanet.objects.ships.damagedShips.length > 0, 'damagedShipsUi did not seed damaged ships');

  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];

  try {
    await timeStep(stepTimings, 'planetShipTab', async () => {
      await browserSession.page.goto(
        `${BASE_UI_URL}/game/planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        { waitUntil: 'domcontentloaded' }
      );
      await waitForText(browserSession.page, 'Planet Parameters');
      await dismissTutorialOverlay(browserSession.page);
      await browserSession.page.getByRole('button', { name: 'Ships' }).click();
      await waitForText(browserSession.page, 'Ship Damage Status');
      await waitForText(browserSession.page, 'Undamaged ships %');
      await waitForText(browserSession.page, 'Damaged ships %');
    });

    await timeStep(stepTimings, 'missionPlanner', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/mission-planner`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Fleet Composition');
      await dismissTutorialOverlay(browserSession.page);
      const pageText = await browserSession.page.locator('body').textContent();
      assert(/\(Damaged:\s*[1-9]/.test(pageText), 'Mission Planner did not show damaged-ship availability');
    });

    browserSession.monitor.assertClean();

    return {
      homePlanet: toCoordString(homePlanet.coordinates),
      damagedShips: homePlanet.objects.ships.damagedShips.length,
      stepTimings
    };
  } finally {
    await browserSession.close();
  }
}

async function runShipRepairTurn() {
  const { session } = await registerAndStartGame('shipRepairTurn');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for shipRepairTurn'
  );
  const homePlanetBefore = ownedPlanets[0];
  assert(homePlanetBefore, 'shipRepairTurn did not produce a home planet');
  assert(damagedShipCount(homePlanetBefore.objects.ships) > 0, 'shipRepairTurn did not seed damaged ships');

  await expectOkResponse(
    await authed('/game/end-turn', session.token, { method: 'POST', body: JSON.stringify({}) }),
    'Unable to resolve end turn for shipRepairTurn'
  );

  const homePlanetAfter = await expectOkResponse(
    await authed(
      `/game/client-planet?x=${homePlanetBefore.coordinates.x}&y=${homePlanetBefore.coordinates.y}&z=${homePlanetBefore.coordinates.z}`,
      session.token
    ),
    'Unable to load home planet after shipRepairTurn'
  );

  assert(damagedShipCount(homePlanetAfter.objects.ships) === 0, 'shipRepairTurn did not fully repair stationed ships');

  return {
    homePlanet: toCoordString(homePlanetBefore.coordinates),
    damagedBefore: damagedShipCount(homePlanetBefore.objects.ships),
    damagedAfter: damagedShipCount(homePlanetAfter.objects.ships)
  };
}

async function runOrbitRepairLifecycle() {
  const { session } = await registerAndStartGame('orbitRepairLifecycle');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for orbitRepairLifecycle'
  );
  const homePlanetBefore = ownedPlanets[0];
  assert(homePlanetBefore, 'orbitRepairLifecycle did not produce a home planet');

  const activeFleetsBefore = await expectOkResponse(
    await authed('/game/active-fleets', session.token),
    'Unable to load active fleets for orbitRepairLifecycle'
  );
  assert(activeFleetsBefore.length === 1, 'orbitRepairLifecycle did not seed one idle orbit fleet');
  assert(damagedShipCount(homePlanetBefore.objects.ships) > 0, 'orbitRepairLifecycle did not seed damaged planet ships');
  assert(damagedShipCount(activeFleetsBefore[0].ships) > 0, 'orbitRepairLifecycle did not seed damaged orbit fleet ships');

  await expectOkResponse(
    await authed('/game/end-turn', session.token, { method: 'POST', body: JSON.stringify({}) }),
    'Unable to resolve end turn for orbitRepairLifecycle'
  );

  const homePlanetAfter = await expectOkResponse(
    await authed(
      `/game/client-planet?x=${homePlanetBefore.coordinates.x}&y=${homePlanetBefore.coordinates.y}&z=${homePlanetBefore.coordinates.z}`,
      session.token
    ),
    'Unable to load home planet after orbitRepairLifecycle'
  );
  const activeFleetsAfter = await expectOkResponse(
    await authed('/game/active-fleets', session.token),
    'Unable to load active fleets after orbitRepairLifecycle'
  );

  assert(damagedShipCount(homePlanetAfter.objects.ships) === 0, 'orbitRepairLifecycle did not repair planet ships first');
  assert(activeFleetsAfter.length === 1, 'orbitRepairLifecycle lost the idle orbit fleet');
  assert(damagedShipCount(activeFleetsAfter[0].ships) === 0, 'orbitRepairLifecycle did not spill repair into the idle orbit fleet');

  return {
    homePlanet: toCoordString(homePlanetBefore.coordinates),
    planetDamagedBefore: damagedShipCount(homePlanetBefore.objects.ships),
    planetDamagedAfter: damagedShipCount(homePlanetAfter.objects.ships),
    fleetDamagedBefore: damagedShipCount(activeFleetsBefore[0].ships),
    fleetDamagedAfter: damagedShipCount(activeFleetsAfter[0].ships)
  };
}

async function runRepairWarningsUi(browser) {
  const { session, setup } = await registerAndStartGame('repairWarningsUi');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for repairWarningsUi'
  );
  const homePlanet = ownedPlanets[0];
  assert(homePlanet, 'repairWarningsUi did not produce a home planet');
  assert(damagedShipCount(homePlanet.objects.ships) > 0, 'repairWarningsUi did not seed damaged ships');

  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];

  try {
    await timeStep(stepTimings, 'planetWarnings', async () => {
      await browserSession.page.goto(
        `${BASE_UI_URL}/game/planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        { waitUntil: 'domcontentloaded' }
      );
      await waitForText(browserSession.page, 'Needs Attention');
      await waitForText(browserSession.page, 'Damaged ships present');
      await waitForText(browserSession.page, 'Damaged ships without repair capability');
      await waitForText(browserSession.page, 'Ship repair: 0');
      await waitForText(browserSession.page, 'Industry repair:');
      await waitForText(browserSession.page, 'Drone repair: 0');
      await dismissTutorialOverlay(browserSession.page);
    });

    await timeStep(stepTimings, 'imperiumWarnings', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/imperium`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Needs Attention');
      await waitForText(browserSession.page, 'Damaged ships present');
      await waitForText(browserSession.page, 'Damaged ships without repair capability');
      await waitForText(browserSession.page, 'Ship repair:');
      await waitForText(browserSession.page, 'Industry repair:');
      await waitForText(browserSession.page, 'Drone repair:');
      await dismissTutorialOverlay(browserSession.page);
    });

    browserSession.monitor.assertClean();

    return {
      homePlanet: toCoordString(homePlanet.coordinates),
      damagedShips: damagedShipCount(homePlanet.objects.ships),
      stepTimings
    };
  } finally {
    await browserSession.close();
  }
}

async function runGuardOrbitStatus(browser) {
  const { session, setup } = await registerAndStartGame('guardOrbitStatus');
  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];

  try {
    await timeStep(stepTimings, 'operationsOrbitLabels', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/operations`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Operations');
      await waitForText(browserSession.page, 'Guard | ORBITING | GUARDING ORBIT');
      await waitForText(browserSession.page, 'Hold | ORBITING | PASSIVE ORBIT');
      await dismissTutorialOverlay(browserSession.page);
    });

    browserSession.monitor.assertClean();

    return {
      stepTimings
    };
  } finally {
    await browserSession.close();
  }
}

async function runSmokeSuite(browser) {
  const { session, setup } = await registerAndStartGame('smokeSuite');
  const ownedPlanets = await expectOkResponse(
    await authed('/game/owned-planets', session.token),
    'Unable to load owned planets for smokeSuite'
  );
  const homePlanet = ownedPlanets[0];
  assert(homePlanet, 'smokeSuite did not produce a home planet');

  const browserSession = await createScenarioPage(browser, session, setup);
  const stepTimings = [];
  let battleReportSeen = false;
  const damagedShipsBefore = damagedShipCount(homePlanet.objects.ships);

  try {
    await timeStep(stepTimings, 'planetAndQueues', async () => {
      await browserSession.page.goto(
        `${BASE_UI_URL}/game/planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        { waitUntil: 'domcontentloaded' }
      );
      await waitForText(browserSession.page, 'Planet Parameters');
      await dismissTutorialOverlay(browserSession.page);
      await browserSession.page.getByRole('button', { name: 'Ships' }).click();
      await waitForText(browserSession.page, 'Ship Damage Status');
      await browserSession.page.getByRole('button', { name: /Queue/i }).click();
      await waitForText(browserSession.page, 'Queued Buildings');
      await waitForText(browserSession.page, 'Queued Shipyard');
      await waitForText(browserSession.page, 'Research');
    });

    await timeStep(stepTimings, 'resolveCombinedTurn', async () => {
      for (let turn = 0; turn < 3; turn += 1) {
        await expectOkResponse(
          await authed('/game/end-turn', session.token, { method: 'POST', body: JSON.stringify({}) }),
          'Unable to resolve end turn for smokeSuite'
        );

        const targetState = await expectOkResponse(
          await authed(
            `/game/client-planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
            session.token
          ),
          'Unable to load smokeSuite target during turn resolution'
        );
        const reports = await expectOkResponse(
          await authed('/game/reports', session.token),
          'Unable to load smokeSuite reports during turn resolution'
        );
        battleReportSeen = reports.some((report) =>
          report.reportType === 'Fleet report' && report.title.includes('Battle Report')
        );

        if (
          battleReportSeen
          && (
          targetState.objects.spaceDebris.metal > 0
          || targetState.objects.spaceDebris.crystal > 0
          || targetState.objects.spaceDebris.deuterium > 0
          )
        ) {
          break;
        }
      }
    });

    const homeAfter = await expectOkResponse(
      await authed(
        `/game/client-planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        session.token
      ),
      'Unable to load home planet after smokeSuite turn'
    );
    const targetAfter = await expectOkResponse(
      await authed(
        `/game/client-planet?x=${homePlanet.coordinates.x}&y=${homePlanet.coordinates.y}&z=${homePlanet.coordinates.z}`,
        session.token
      ),
      'Unable to load smokeSuite target after turn'
    );

    assert(homeAfter.objects.buildingQueue.length === 0, 'smokeSuite building queue did not resolve');
    assert(homeAfter.objects.shipyardQueue.length === 0, 'smokeSuite shipyard queue did not resolve');
    assert(homeAfter.objects.currentResearchQueue === null, 'smokeSuite research queue did not resolve');
    assert(
      damagedShipCount(homeAfter.objects.ships) <= damagedShipsBefore,
      'smokeSuite increased damaged ships unexpectedly'
    );
    assert(battleReportSeen, 'smokeSuite did not produce a battle report');
    assert(
      targetAfter.objects.spaceDebris.metal > 0
        || targetAfter.objects.spaceDebris.crystal > 0
        || targetAfter.objects.spaceDebris.deuterium > 0,
      'smokeSuite did not create battle debris'
    );

    await timeStep(stepTimings, 'reportsAfterTurn', async () => {
      await browserSession.page.goto(`${BASE_UI_URL}/game/reports`, { waitUntil: 'domcontentloaded' });
      await waitForText(browserSession.page, 'Inbox');
      await dismissTutorialOverlay(browserSession.page);
    });

    browserSession.monitor.assertClean();

    return {
      homePlanet: toCoordString(homePlanet.coordinates),
      targetPlanet: toCoordString(homePlanet.coordinates),
      spaceDebris: targetAfter.objects.spaceDebris,
      stepTimings
    };
  } finally {
    await browserSession.close();
  }
}

const scenarioRunners = {
  routeSmoke: runRouteSmoke,
  turnProgression: runTurnProgression,
  fleetLifecycle: runFleetLifecycle,
  battleDebris: runBattleDebris,
  damagedShipsUi: runDamagedShipsUi,
  shipRepairTurn: runShipRepairTurn,
  orbitRepairLifecycle: runOrbitRepairLifecycle,
  guardOrbitStatus: runGuardOrbitStatus,
  repairWarningsUi: runRepairWarningsUi,
  smokeSuite: runSmokeSuite
};

async function runScenario(browser, scenarioName) {
  const startedAtIso = new Date().toISOString();
  const startedAt = performance.now();
  try {
    const details = await scenarioRunners[scenarioName](browser);
    return {
      scenario: scenarioName,
      passed: true,
      startedAt: startedAtIso,
      durationMs: roundDuration(performance.now() - startedAt),
      details
    };
  } catch (error) {
    return {
      scenario: scenarioName,
      passed: false,
      startedAt: startedAtIso,
      durationMs: roundDuration(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  await ensureServicesAvailable();

  const executablePath = pickChromeExecutable();
  const browser = await chromium.launch({
    executablePath,
    headless: true
  });

  const startedAt = new Date().toISOString();
  const startedAtPerf = performance.now();
  const results = [];

  try {
    for (const scenario of SCENARIOS) {
      const result = await runScenario(browser, scenario);
      results.push(result);
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(`${status} ${scenario} ${result.durationMs}ms`);
      if (!result.passed) {
        console.log(`  ${result.error}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    startedAt,
    finishedAt: new Date().toISOString(),
    totalDurationMs: roundDuration(performance.now() - startedAtPerf),
    scenarios: results
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`Saved smoke test results to ${OUTPUT_PATH}`);

  if (results.some((result) => !result.passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
