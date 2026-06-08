import { authPl } from './auth.pl';
import { apiPl } from './api.pl';
import { commonPl } from './common.pl';
import { gameShellPl } from './game-shell.pl';
import { mainMenuPl } from './main-menu.pl';
import { settingsPl } from './settings.pl';
import { topMenuPl } from './top-menu.pl';

export const plTranslations = {
  auth: authPl,
  api: apiPl,
  common: commonPl,
  gameShell: gameShellPl,
  mainMenu: mainMenuPl,
  settings: settingsPl,
  topMenu: topMenuPl
} as const;
