import type { ApiErrorResponse, ApiMessageMetadata, ApiMessageParams } from '../models/game-api-types';
import { I18nService } from './i18n.service';

type ApiTextSource = {
  text?: string | null;
  key?: string | null;
  params?: ApiMessageParams | null;
};

type HttpErrorLike = {
  status?: number;
  error?: ApiErrorResponse | string | null;
};

export function resolveApiMessage(
  i18n: I18nService,
  response: ({ message?: string | null } & ApiMessageMetadata) | null | undefined,
  fallbackMessage: string | null = null
): string | null {
  if (!response) {
    return fallbackMessage;
  }

  return resolveApiText(i18n, {
    text: response.message ?? null,
    key: response.messageKey ?? null,
    params: response.messageParams ?? null
  }, fallbackMessage);
}

export function resolveApiErrorMessage(
  i18n: I18nService,
  error: unknown,
  fallbackMessage: string
): string {
  const normalized = error as HttpErrorLike | null;
  const payload = typeof normalized?.error === 'string'
    ? { error: normalized.error }
    : normalized?.error ?? null;

  return resolveApiText(i18n, {
    text: payload?.error ?? null,
    key: payload?.errorKey ?? null,
    params: payload?.errorParams ?? null
  }, fallbackMessage) ?? fallbackMessage;
}

export function resolveApiText(
  i18n: I18nService,
  source: ApiTextSource | null | undefined,
  fallbackMessage: string | null = null
): string | null {
  if (source?.key) {
    return i18n.t(source.key, source.params ?? undefined);
  }

  if (typeof source?.text === 'string' && source.text.trim().length > 0) {
    return source.text;
  }

  return fallbackMessage;
}
