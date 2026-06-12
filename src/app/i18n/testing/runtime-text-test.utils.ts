import type { I18nService } from '../i18n.service';
import { communicationsEn } from '../locales/en/communications.en';
import { generatedEn } from '../locales/en/generated.en';
import { resolveRuntimeText, resolveRuntimeTextBlock } from '../runtime-text.utils';

const dictionaries = {
  communications: communicationsEn,
  generated: generatedEn,
} as const;

export function resolveEnglishRuntimeText(value: string): string {
  return resolveRuntimeText(runtimeTestI18n as I18nService, value);
}

export function resolveEnglishRuntimeTextBlock(value: string): string {
  return resolveRuntimeTextBlock(runtimeTestI18n as I18nService, value);
}

const runtimeTestI18n = {
  t(key: string, params?: Record<string, unknown>): string {
    const template = lookupTranslation(key);
    return interpolate(template, params);
  },
};

function lookupTranslation(key: string): string {
  const segments = key.split('.');
  let current: unknown = dictionaries;

  for (const segment of segments) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return key;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return typeof current === 'string' ? current : key;
}

function interpolate(template: string, params?: Record<string, unknown>): string {
  if (!params) {
    return template;
  }

  return template.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? '' : String(value);
  });
}
