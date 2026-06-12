import { I18nService } from './i18n.service';
import type { MissionCheck } from '../models/missions/mission-check';

export function resolveMissionCheckText(i18n: I18nService, check: MissionCheck): string {
  if (check.textKey) {
    return i18n.t(check.textKey, check.textParams);
  }

  return check.text;
}
