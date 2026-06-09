import { authEn } from './auth.en';
import { apiEn } from './api.en';
import { commonEn } from './common.en';
import { gameShellEn } from './game-shell.en';
import { loadGameEn } from './load-game.en';
import { mainMenuEn } from './main-menu.en';
import { multiplayerEn } from './multiplayer.en';
import { settingsEn } from './settings.en';
import { setupEn } from './setup.en';
import { topMenuEn } from './top-menu.en';

export const enTranslations = {
  auth: authEn,
  api: apiEn,
  common: commonEn,
  gameShell: gameShellEn,
  loadGame: loadGameEn,
  mainMenu: mainMenuEn,
  multiplayer: multiplayerEn,
  settings: settingsEn,
  setup: setupEn,
  topMenu: topMenuEn
} as const;
