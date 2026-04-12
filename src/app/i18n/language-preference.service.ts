import { Injectable } from '@angular/core';
import type { AppLanguage } from './i18n.types';

@Injectable({
  providedIn: 'root'
})
export class LanguagePreferenceService {
  private readonly storageKey = 'srogame:language';

  public load(): AppLanguage | null {
    try {
      const value = localStorage.getItem(this.storageKey);
      return value === 'en' || value === 'pl' ? value : null;
    } catch {
      return null;
    }
  }

  public save(language: AppLanguage): void {
    try {
      localStorage.setItem(this.storageKey, language);
    } catch {
      // Ignore storage failures and keep language only in memory.
    }
  }
}
