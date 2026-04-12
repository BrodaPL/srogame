import { Injectable, effect, inject, signal } from '@angular/core';
import { AuthStateService } from '../core/auth-state.service';
import type { LanguagePreference } from '../models/game-api-types';
import { enTranslations } from './locales/en';
import { plTranslations } from './locales/pl';
import { LanguagePreferenceService } from './language-preference.service';
import type {
  AppLanguage,
  TranslationDictionary,
  TranslationParams,
  TranslationValue
} from './i18n.types';

const translationsByLanguage: Record<AppLanguage, TranslationDictionary> = {
  en: enTranslations,
  pl: plTranslations
};

const localeByLanguage: Record<AppLanguage, string> = {
  en: 'en-US',
  pl: 'pl-PL'
};

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly authState = inject(AuthStateService);
  private readonly languagePreference = inject(LanguagePreferenceService);
  private readonly languageSignal = signal<AppLanguage>('en');
  private initialized = false;

  public readonly language = this.languageSignal.asReadonly();

  constructor() {
    effect(() => {
      const sessionLanguage = this.normalizeLanguage(this.authState.session()?.language ?? null);
      if (sessionLanguage && sessionLanguage !== this.languageSignal()) {
        this.setLanguage(sessionLanguage);
      }
    });
  }

  public init(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    const sessionLanguage = this.normalizeLanguage(this.authState.session()?.language ?? null);
    const storedLanguage = this.languagePreference.load();
    const browserLanguage = this.resolveBrowserLanguage();
    this.setLanguage(sessionLanguage ?? storedLanguage ?? browserLanguage ?? 'en');
  }

  public setLanguage(language: AppLanguage): void {
    this.languageSignal.set(language);
    this.languagePreference.save(language);
  }

  public t(key: string, params?: TranslationParams): string {
    const language = this.languageSignal();
    const translated = this.resolveKey(translationsByLanguage[language], key)
      ?? this.resolveKey(translationsByLanguage.en, key);
    if (typeof translated !== 'string') {
      return key;
    }

    return this.interpolate(translated, params);
  }

  public formatDateTime(value: string | Date | number | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat(localeByLanguage[this.languageSignal()], {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date);
  }

  private resolveBrowserLanguage(): AppLanguage | null {
    if (typeof navigator === 'undefined' || typeof navigator.language !== 'string') {
      return null;
    }

    const normalized = navigator.language.toLowerCase();
    if (normalized.startsWith('pl')) {
      return 'pl';
    }
    if (normalized.startsWith('en')) {
      return 'en';
    }

    return null;
  }

  private normalizeLanguage(language: LanguagePreference | null | undefined): AppLanguage | null {
    return language === 'en' || language === 'pl' ? language : null;
  }

  private resolveKey(dictionary: TranslationDictionary, key: string): TranslationValue | null {
    const segments = key.split('.');
    let current: TranslationValue = dictionary;
    for (const segment of segments) {
      if (!current || typeof current === 'string' || !(segment in current)) {
        return null;
      }

      current = current[segment];
    }

    return current ?? null;
  }

  private interpolate(template: string, params?: TranslationParams): string {
    if (!params) {
      return template;
    }

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key: string) => {
      const value = params[key];
      return value === null || value === undefined ? '' : String(value);
    });
  }
}
