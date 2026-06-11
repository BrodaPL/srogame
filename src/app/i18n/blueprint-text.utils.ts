import { I18nService } from './i18n.service';

export function resolveBlueprintText(i18n: I18nService, value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  return value.startsWith('blueprints.') ? i18n.t(value) : value;
}
