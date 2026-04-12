export type AppLanguage = 'en' | 'pl';

export type TranslationValue = string | TranslationDictionary;

export type TranslationDictionary = {
  [key: string]: TranslationValue;
};

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
