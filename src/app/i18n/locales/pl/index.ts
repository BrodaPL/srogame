import { authPl } from './auth.pl';
import { apiPl } from './api.pl';
import { blueprintsPl } from './blueprints.pl';
import { buildingsPl } from './buildings.pl';
import { commonPl } from './common.pl';
import { communicationsPl } from './communications.pl';
import { encyclopediaPl } from './encyclopedia.pl';
import { galacticPl } from './galactic.pl';
import { gameShellPl } from './game-shell.pl';
import { helpAboutPl } from './help-about.pl';
import { imperiumPl } from './imperium.pl';
import { loadGamePl } from './load-game.pl';
import { mainMenuPl } from './main-menu.pl';
import { missionPlannerPl } from './mission-planner.pl';
import { multiplayerPl } from './multiplayer.pl';
import { operationsPl } from './operations.pl';
import { planetViewPl } from './planet-view.pl';
import { productionPl } from './production.pl';
import { researchesPl } from './researches.pl';
import { settingsPl } from './settings.pl';
import { setupPl } from './setup.pl';
import { terminologyPl } from './terminology.pl';
import { topMenuPl } from './top-menu.pl';

export const plTranslations = {
  auth: authPl,
  api: apiPl,
  blueprints: blueprintsPl,
  buildings: buildingsPl,
  common: commonPl,
  communications: communicationsPl,
  encyclopedia: encyclopediaPl,
  galactic: galacticPl,
  gameShell: gameShellPl,
  helpAbout: helpAboutPl,
  imperium: imperiumPl,
  loadGame: loadGamePl,
  mainMenu: mainMenuPl,
  missionPlanner: missionPlannerPl,
  multiplayer: multiplayerPl,
  operations: operationsPl,
  planetView: planetViewPl,
  production: productionPl,
  researches: researchesPl,
  settings: settingsPl,
  setup: setupPl,
  terminology: terminologyPl,
  topMenu: topMenuPl,
} as const;
