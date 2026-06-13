import { enTranslations } from './locales/en';
import {
  parseRuntimeTextDescriptor,
  type RuntimeTextDescriptor,
} from './runtime-text.utils';

const MAX_CACHE_ENTRIES = 10_000;
const resolvedTextCache = new Map<string, string>();
const resolvedBlockCache = new Map<string, string>();

export function resolveEnglishRuntimeText(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const cachedValue = resolvedTextCache.get(value);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const descriptor = parseRuntimeTextDescriptor(value);
  const resolvedValue = descriptor ? resolveDescriptor(descriptor) : value;
  cacheValue(resolvedTextCache, value, resolvedValue);
  return resolvedValue;
}

export function resolveEnglishRuntimeTextBlock(value: string | null | undefined): string {
  if (!value) {
    return '';
  }

  const cachedValue = resolvedBlockCache.get(value);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const resolvedValue = value
    .split('\n')
    .map((line) => resolveEnglishRuntimeText(line))
    .join('\n');
  cacheValue(resolvedBlockCache, value, resolvedValue);
  return resolvedValue;
}

function resolveDescriptor(descriptor: RuntimeTextDescriptor): string {
  const template = lookupTranslation(descriptor.key);
  if (!descriptor.params) {
    return template;
  }

  const params = Object.fromEntries(
    Object.entries(descriptor.params).map(([key, value]) => [
      key,
      typeof value === 'string' ? resolveEnglishRuntimeText(value) : value,
    ]),
  );
  return template.replace(/\{\{(\w+)\}\}/g, (_match, token: string) => {
    const value = params[token];
    return value === undefined || value === null ? '' : String(value);
  });
}

function lookupTranslation(key: string): string {
  let current: unknown = enTranslations;
  for (const segment of key.split('.')) {
    if (!current || typeof current !== 'object' || !(segment in current)) {
      return key;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === 'string' ? current : key;
}

function cacheValue(cache: Map<string, string>, key: string, value: string): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value as string);
  }
  cache.set(key, value);
}
