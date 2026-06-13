import type { TranslationParams } from './i18n.types';
import { I18nService } from './i18n.service';

const RUNTIME_TEXT_PREFIX = '__i18n__:';

export type RuntimeTextDescriptor = {
  key: string;
  params?: TranslationParams;
};

export function encodeRuntimeText(key: string, params?: TranslationParams): string {
  return `${RUNTIME_TEXT_PREFIX}${JSON.stringify({ key, params } satisfies RuntimeTextDescriptor)}`;
}

export function isEncodedRuntimeText(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(RUNTIME_TEXT_PREFIX);
}

export function resolveRuntimeText(i18n: I18nService, value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const descriptor = parseRuntimeTextDescriptor(value);
  if (!descriptor) {
    return value;
  }

  return i18n.t(descriptor.key, resolveRuntimeParams(i18n, descriptor.params));
}

export function resolveRuntimeTextBlock(
  i18n: I18nService,
  value: string | null | undefined,
): string {
  if (!value) {
    return '';
  }

  return value
    .split('\n')
    .map((line) => resolveRuntimeText(i18n, line))
    .join('\n');
}

export function parseRuntimeTextDescriptor(value: string): RuntimeTextDescriptor | null {
  if (!isEncodedRuntimeText(value)) {
    return null;
  }

  try {
    const parsed = JSON.parse(value.slice(RUNTIME_TEXT_PREFIX.length)) as RuntimeTextDescriptor;
    if (!parsed || typeof parsed.key !== 'string' || parsed.key.trim().length <= 0) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function resolveRuntimeParams(
  i18n: I18nService,
  params: TranslationParams | undefined,
): TranslationParams | undefined {
  if (!params) {
    return undefined;
  }

  const resolvedEntries = Object.entries(params).map(([key, rawValue]) => {
    if (typeof rawValue === 'string' && isEncodedRuntimeText(rawValue)) {
      return [key, resolveRuntimeText(i18n, rawValue)] as const;
    }

    return [key, rawValue] as const;
  });

  return Object.fromEntries(resolvedEntries);
}
