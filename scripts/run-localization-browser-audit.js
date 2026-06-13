const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { loadTestCredential } = require('./test-credential-loader');

const BASE_UI_URL = 'http://localhost:4200';
const BASE_API_URL = 'http://localhost:3000/api';
const OUTPUT_DIR = path.resolve(__dirname, '..', 'tmp', 'localization-browser-audit');
const RESULT_PATH = path.join(OUTPUT_DIR, 'result.json');
const CHROME_CANDIDATES = [
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

const ROUTES = [
  { id: 'main-menu', path: '/', en: 'Main Menu', pl: 'Menu glowne' },
  { id: 'login', path: '/login', en: 'Login or Register', pl: 'Logowanie lub Rejestracja', anonymous: true },
  { id: 'setup', path: '/setup', en: 'Galaxy Initialization', pl: 'Inicjalizacja Galaktyki' },
  { id: 'load', path: '/load', en: 'Load Game', pl: 'Wczytaj Gre' },
  { id: 'multiplayer', path: '/multiplayer', en: 'Lobby Browser', pl: 'Przeglad Lobbies' },
  { id: 'settings', path: '/settings', en: 'Account Settings', pl: 'Ustawienia konta' },
  { id: 'help', path: '/help', en: 'Help & About', pl: 'Pomoc i informacje' },
  { id: 'encyclopedia', path: '/encyclopedia', en: 'Encyclopedia', pl: 'Encyklopedia' },
  { id: 'encyclopedia-ships', path: '/encyclopedia/ships', en: 'Ships', pl: 'Statki' },
  { id: 'encyclopedia-defences', path: '/encyclopedia/defences', en: 'Defences', pl: 'Obrona' },
  { id: 'encyclopedia-buildings', path: '/encyclopedia/buildings', en: 'Buildings', pl: 'Budynki' },
  { id: 'encyclopedia-technologies', path: '/encyclopedia/technologies', en: 'Technologies', pl: 'Technologie' },
  { id: 'encyclopedia-mechanics', path: '/encyclopedia/mechanics', en: 'Mechanics', pl: 'Mechaniki' },
  { id: 'galactic', path: '/game/galactic', en: 'Galaxy Preview', pl: 'Podglad galaktyki' },
  { id: 'imperium', path: '/game/imperium', en: 'Empire Totals', pl: 'Suma imperium' },
  { id: 'star-system', path: '/game/star-system', en: 'Galactic', pl: 'Galaktyka' },
  { id: 'planet', path: '/game/planet', en: 'Planet Parameters', pl: 'Parametry planety', planet: true },
  { id: 'reports', path: '/game/reports', en: 'Inbox', pl: 'Skrzynka' },
  { id: 'mail', path: '/game/mail', en: 'Mail', pl: 'Poczta' },
  { id: 'diplomacy', path: '/game/diplomacy', en: 'Diplomacy', pl: 'Dyplomacja' },
  { id: 'researches', path: '/game/researches', en: 'Research Labs', pl: 'Laboratoria badawcze' },
  { id: 'production', path: '/game/production', en: 'Current Shipyard Queue', pl: 'Aktualna kolejka stoczni' },
  { id: 'buildings', path: '/game/buildings', en: 'Current Building Queue', pl: 'Aktualna kolejka budynkow' },
  { id: 'defence', path: '/game/defence', en: 'Defences', pl: 'Obrona' },
  { id: 'operations', path: '/game/operations', en: 'Operations', pl: 'Operacje' },
  { id: 'mission-planner', path: '/game/mission-planner', en: 'Mission Planner', pl: 'Planer Misji' },
  { id: 'bot-debug', path: '/game/bot-debug', en: 'Bot AI', englishOnly: true },
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

async function api(pathname, options = {}) {
  const response = await fetch(`${BASE_API_URL}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
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

function authed(pathname, token, options = {}) {
  return api(pathname, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
}

function buildSetup() {
  return {
    gameType: 'Sandbox',
    galaxyName: `Localization Audit ${Date.now() % 100000}`,
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
    botsUnitedAgainstHumans: false,
    autoSaveTurns: 0,
    scheduledTurns: { enabled: false, enabledHours: [12] },
    startingHomeworldPreset: 'Medium',
    createRandomPlanets: false,
    createStartingShips: false,
    skipTutorial: true,
    smokeTestScenario: 'routeSmoke',
    startingResources: { metal: 500, crystal: 500, deuterium: 500 },
  };
}

async function prepareGame() {
  const credentials = loadTestCredential('mcpSmoke');
  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
  assert(login.response.ok, `Login failed: ${login.response.status} ${JSON.stringify(login.data)}`);

  const settingsResult = await authed('/account/settings', login.data.token);
  assert(settingsResult.response.ok, `Settings load failed: ${settingsResult.response.status}`);

  const setup = buildSetup();
  const start = await authed('/game/start', login.data.token, {
    method: 'POST',
    body: JSON.stringify({ setup }),
  });
  assert(start.response.ok, `Game start failed: ${start.response.status} ${JSON.stringify(start.data)}`);

  const planets = await authed('/game/owned-planets', login.data.token);
  assert(planets.response.ok && Array.isArray(planets.data) && planets.data.length > 0, 'No owned planet available.');

  return {
    token: login.data.token,
    setup,
    settings: settingsResult.data,
    homePlanet: planets.data[0],
  };
}

async function updateLanguage(state, language) {
  const result = await authed('/account/settings/preferences', state.token, {
    method: 'POST',
    body: JSON.stringify({
      replaceWithBotOnLogout: state.settings.replaceWithBotOnLogout === true,
      logoutBotProfileId: state.settings.replaceWithBotOnLogout
        ? state.settings.logoutBotProfileId ?? 'BALANCED'
        : null,
      language,
    }),
  });
  assert(result.response.ok, `Language update failed: ${result.response.status} ${JSON.stringify(result.data)}`);

  const session = await authed('/auth/me', state.token);
  assert(session.response.ok, `Session refresh failed: ${session.response.status}`);
  return session.data;
}

function monitorPage(page) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedResponses = [];
  const failedRequests = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    const url = response.url();
    if ((url.startsWith(BASE_UI_URL) || url.startsWith(BASE_API_URL)) && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${url}`);
    }
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? 'unknown';
    if (failure !== 'net::ERR_ABORTED') {
      failedRequests.push(`${failure} ${request.url()}`);
    }
  });

  return { consoleErrors, pageErrors, failedResponses, failedRequests };
}

function sliceMonitor(monitor, start) {
  return {
    consoleErrors: monitor.consoleErrors.slice(start.consoleErrors),
    pageErrors: monitor.pageErrors.slice(start.pageErrors),
    failedResponses: monitor.failedResponses.slice(start.failedResponses),
    failedRequests: monitor.failedRequests.slice(start.failedRequests),
  };
}

function monitorStart(monitor) {
  return {
    consoleErrors: monitor.consoleErrors.length,
    pageErrors: monitor.pageErrors.length,
    failedResponses: monitor.failedResponses.length,
    failedRequests: monitor.failedRequests.length,
  };
}

async function createContext(browser, session, setup, language) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ savedSession, savedSetup, savedLanguage }) => {
    if (savedSession) {
      localStorage.setItem('srogame:player', JSON.stringify(savedSession));
    } else {
      localStorage.removeItem('srogame:player');
    }
    localStorage.setItem('srogame:setup', JSON.stringify(savedSetup));
    localStorage.setItem('srogame:language', savedLanguage);
  }, { savedSession: session, savedSetup: setup, savedLanguage: language });
  return context;
}

function routeUrl(route, homePlanet) {
  if (!route.planet) {
    return `${BASE_UI_URL}${route.path}`;
  }
  const { x, y, z } = homePlanet.coordinates;
  return `${BASE_UI_URL}${route.path}?x=${x}&y=${y}&z=${z}`;
}

async function inspectRoute(page, route, language, homePlanet, monitor) {
  const start = monitorStart(monitor);
  const expected = route[language];
  const url = routeUrl(route, homePlanet);
  const result = {
    id: route.id,
    language,
    url,
    expected,
    passed: false,
    issues: [],
  };

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800);
    const expectedVisible = await page
      .getByText(expected, { exact: false })
      .first()
      .isVisible()
      .catch(() => false);
    if (!expectedVisible) {
      result.issues.push(`Expected localized text is not visible: ${expected}`);
    }

    const inspection = await page.evaluate(() => {
      const bodyText = document.body?.innerText ?? '';
      const keyPattern = /\b(?:api|auth|blueprints|buildings|common|communications|encyclopedia|galactic|gameShell|generated|helpAbout|imperium|loadGame|mainMenu|missionPlanner|multiplayer|operations|planetView|production|researches|settings|setup|terminology|topMenu)(?:\.[A-Za-z0-9_-]+){1,}\b/g;
      const unresolvedKeys = [...new Set(bodyText.match(keyPattern) ?? [])]
        .filter((value) => !/\.(?:json|js|ts|css|html|md)$/.test(value));
      const encodedRuntimeText = bodyText.includes('__i18n__:');
      const unresolvedInterpolation = /{{\s*[A-Za-z0-9_]+\s*}}/.test(bodyText);
      const brokenImages = [...document.images]
        .filter((image) => {
          const style = getComputedStyle(image);
          const rect = image.getBoundingClientRect();
          const intersectsViewport = rect.bottom > 0
            && rect.right > 0
            && rect.top < innerHeight
            && rect.left < innerWidth;
          return intersectsViewport
            && style.display !== 'none'
            && style.visibility !== 'hidden'
            && image.complete
            && image.naturalWidth === 0;
        })
        .map((image) => image.currentSrc || image.src || image.alt || '<unknown>');
      return {
        title: document.title,
        bodyLength: bodyText.trim().length,
        textExcerpt: bodyText.replace(/\s+/g, ' ').trim().slice(0, 500),
        unresolvedKeys,
        encodedRuntimeText,
        unresolvedInterpolation,
        brokenImages,
      };
    });

    const routeMonitor = sliceMonitor(monitor, start);
    if (inspection.bodyLength === 0) result.issues.push('Empty body text.');
    if (inspection.unresolvedKeys.length) result.issues.push(`Unresolved keys: ${inspection.unresolvedKeys.join(', ')}`);
    if (inspection.encodedRuntimeText) result.issues.push('Encoded runtime i18n descriptor is visible.');
    if (inspection.unresolvedInterpolation) result.issues.push('Unresolved interpolation token is visible.');
    if (inspection.brokenImages.length) result.issues.push(`Broken images: ${inspection.brokenImages.join(', ')}`);
    if (routeMonitor.consoleErrors.length) result.issues.push(`Console errors: ${routeMonitor.consoleErrors.join(' | ')}`);
    if (routeMonitor.pageErrors.length) result.issues.push(`Page errors: ${routeMonitor.pageErrors.join(' | ')}`);
    if (routeMonitor.failedResponses.length) result.issues.push(`Failed responses: ${routeMonitor.failedResponses.join(' | ')}`);
    if (routeMonitor.failedRequests.length) result.issues.push(`Failed requests: ${routeMonitor.failedRequests.join(' | ')}`);

    result.inspection = inspection;
    result.monitor = routeMonitor;
    result.passed = result.issues.length === 0;
    if (language === 'pl' || !result.passed) {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${language}-${route.id}.png`),
        fullPage: false,
      });
    }
  } catch (error) {
    result.issues.push(error instanceof Error ? error.message : String(error));
    try {
      await page.screenshot({
        path: path.join(OUTPUT_DIR, `${language}-${route.id}-failure.png`),
        fullPage: false,
      });
    } catch {}
  }

  return result;
}

async function runLanguage(browser, state, language) {
  const session = await updateLanguage(state, language);
  const routes = ROUTES.filter((route) => !route.englishOnly || language === 'en');
  const authenticatedContext = await createContext(browser, session, state.setup, language);
  const anonymousContext = await createContext(browser, null, state.setup, language);
  const results = [];

  try {
    for (const route of routes) {
      const context = route.anonymous ? anonymousContext : authenticatedContext;
      const page = await context.newPage();
      const monitor = monitorPage(page);
      try {
        const result = await inspectRoute(page, route, language, state.homePlanet, monitor);
        results.push(result);
        console.log(`${result.passed ? 'PASS' : 'FAIL'} ${language} ${route.id}`);
        for (const issue of result.issues) {
          console.log(`  ${issue}`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await authenticatedContext.close();
    await anonymousContext.close();
  }

  return results;
}

async function main() {
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const executablePath = CHROME_CANDIDATES.find((candidate) => fs.existsSync(candidate));
  assert(executablePath, 'Chrome executable not found.');
  const state = await prepareGame();
  const browser = await chromium.launch({ executablePath, headless: true });
  const startedAt = new Date().toISOString();
  let results = [];

  try {
    results = [
      ...(await runLanguage(browser, state, 'en')),
      ...(await runLanguage(browser, state, 'pl')),
    ];
  } finally {
    const summary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      passed: results.filter((entry) => entry.passed).length,
      failed: results.filter((entry) => !entry.passed).length,
      results,
    };
    fs.writeFileSync(RESULT_PATH, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
    console.log(`Saved localization audit to ${RESULT_PATH}`);
    await withTimeout(browser.close(), 5000);
    await withTimeout(updateLanguage(state, state.settings.language ?? 'en'), 5000);
    process.exit(summary.failed > 0 ? 1 : 0);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
