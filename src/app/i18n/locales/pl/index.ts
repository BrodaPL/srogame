import { apiPl } from './api.pl';
import { commonPl } from './common.pl';
import { mainMenuPl } from './main-menu.pl';
import { settingsPl } from './settings.pl';

export const plTranslations = {
  api: apiPl,
  common: commonPl,
  mainMenu: mainMenuPl,
  settings: settingsPl
} as const;
