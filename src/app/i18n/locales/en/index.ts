import { authEn } from './auth.en';
import { apiEn } from './api.en';
import { commonEn } from './common.en';
import { gameShellEn } from './game-shell.en';
import { mainMenuEn } from './main-menu.en';
import { settingsEn } from './settings.en';
import { topMenuEn } from './top-menu.en';

export const enTranslations = {
  auth: authEn,
  api: apiEn,
  common: commonEn,
  gameShell: gameShellEn,
  mainMenu: mainMenuEn,
  settings: settingsEn,
  topMenu: topMenuEn
} as const;
