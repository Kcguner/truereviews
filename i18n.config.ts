export const locales = ['tr', 'en', 'de', 'ar', 'ru', 'fr', 'es', 'nl', 'fa', 'az'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'tr';
export const localeNames: Record<Locale, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
  ar: 'العربية',
  ru: 'Русский',
  fr: 'Français',
  es: 'Español',
  nl: 'Nederlands',
  fa: 'فارسی',
  az: 'Azərbaycanca'
};
export const rtlLocales: Locale[] = ['ar', 'fa'];
