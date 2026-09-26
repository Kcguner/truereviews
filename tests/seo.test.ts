import { describe, expect, it } from 'vitest';
import { locales } from '../i18n.config';
import { LEGAL_SLUGS } from '../lib/legal';
import { getSiteUrl } from '../lib/site';
import {
  CURRENCY,
  HOME_META,
  OG_LOCALE,
  X_DEFAULT,
  getAlternates,
  getHomeMeta,
  getOgLocale,
  getOgLocaleAlternates,
  hreflangMap,
  isLocale,
  localeUrl,
  normalizeLocale
} from '../lib/seo';

describe('ana sayfa meta (10 dil)', () => {
  it('her dilde title + description + keywords dolu', () => {
    for (const locale of locales) {
      const m = HOME_META[locale];
      expect(m, locale).toBeDefined();
      expect(m.title.length, locale).toBeGreaterThan(20);
      expect(m.description.length, locale).toBeGreaterThan(60);
      expect(m.keywords.length, locale).toBeGreaterThanOrEqual(8);
      for (const k of m.keywords) expect(k.trim().length, `${locale}/${k}`).toBeGreaterThan(2);
    }
  });

  it('title SERP için makul uzunlukta (<= 65 karakter)', () => {
    for (const locale of locales) {
      expect(HOME_META[locale].title.length, locale).toBeLessThanOrEqual(65);
    }
  });

  it('description meta description sınırında (70-175 karakter)', () => {
    for (const locale of locales) {
      const len = HOME_META[locale].description.length;
      expect(len, locale).toBeGreaterThanOrEqual(70);
      expect(len, locale).toBeLessThanOrEqual(175);
    }
  });

  it('her dil kendi birincil anahtar kelimesini description içinde taşır', () => {
    // Anahtar kelime description'da geçmezse SERP'te eşleşme zayıflar. Almanca
    // "google bewertungsanalyse" → metinde "Google-Bewertungsanalyse" olarak bileşik
    // yazılır; bu yüzden tire ve boşluk normalize edilip TOKEN token eşleşiyoruz.
    const norm = (s: string) =>
      s
        .toLowerCase()
        .replace(/[\s\-_‌‍]/g, ' ')
        .trim();
    for (const locale of locales) {
      const description = norm(HOME_META[locale].description);
      for (const token of norm(HOME_META[locale].keywords[0]).split(' ')) {
        expect(description.includes(token), `${locale} → "${token}"`).toBe(true);
      }
    }
  });

  it('title de birincil anahtar kelimeyi içerir', () => {
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_‌‍]/g, ' ');
    for (const locale of locales) {
      const title = norm(HOME_META[locale].title);
      for (const token of norm(HOME_META[locale].keywords[0]).split(' ')) {
        expect(title.includes(token), `${locale} → "${token}"`).toBe(true);
      }
    }
  });

  it('title ve description içinde marka adı geçer', () => {
    for (const locale of locales) {
      expect(HOME_META[locale].title, locale).toContain('TrueReviews');
    }
  });

  it('her dil özgündür (çeviri kopyası yok)', () => {
    const descriptions = locales.map((l) => HOME_META[l].description);
    expect(new Set(descriptions).size).toBe(locales.length);
  });

  it('tanımsız dil Türkçeye düşer', () => {
    expect(getHomeMeta('xx')).toEqual(HOME_META.tr);
  });
});

describe('hreflang / canonical', () => {
  it('10 dil + x-default üretir', () => {
    const map = hreflangMap();
    for (const locale of locales) expect(map[locale], locale).toBe(`${getSiteUrl()}/${locale}`);
    expect(map[X_DEFAULT]).toBe(getSiteUrl());
    expect(Object.keys(map).length).toBe(locales.length + 1);
  });

  it('slug verildiğinde aynı yasal sayfanın 10 dilini eşler', () => {
    for (const slug of LEGAL_SLUGS) {
      const map = hreflangMap((l) => `${getSiteUrl()}/${l}/${slug}`);
      for (const locale of locales) expect(map[locale], slug).toBe(`${getSiteUrl()}/${locale}/${slug}`);
      expect(map[X_DEFAULT], slug).toBe(getSiteUrl());
    }
  });

  it('localeUrl slug alır / almaz', () => {
    expect(localeUrl('en')).toBe(`${getSiteUrl()}/en`);
    expect(localeUrl('en', 'sss')).toBe(`${getSiteUrl()}/en/sss`);
  });

  it('getAlternates canonical + languages döndürür', () => {
    const a = getAlternates('de');
    expect(a.canonical).toBe(`${getSiteUrl()}/de`);
    expect(a.languages.de).toBe(`${getSiteUrl()}/de`);

    const b = getAlternates('fa', 'kvkk');
    expect(b.canonical).toBe(`${getSiteUrl()}/fa/kvkk`);
    expect(b.languages.tr).toBe(`${getSiteUrl()}/tr/kvkk`);
    expect(b.languages[X_DEFAULT]).toBe(getSiteUrl());
  });
});

describe('og:locale', () => {
  it('her dil için BCP-47 tanımlı ve benzersiz', () => {
    const values = locales.map((l) => OG_LOCALE[l]);
    for (const v of values) expect(v).toMatch(/^[a-z]{2}_[A-Z]{2}$/);
    expect(new Set(values).size).toBe(locales.length);
  });

  it('locale:alternate kendi dilini içermez, 9 dil içerir', () => {
    for (const locale of locales) {
      const alt = getOgLocaleAlternates(locale);
      expect(alt.length, locale).toBe(locales.length - 1);
      expect(alt, locale).not.toContain(getOgLocale(locale));
    }
  });

  it('tanımsız dil İngilizceye düşer', () => {
    expect(getOgLocale('xx')).toBe(OG_LOCALE.tr);
  });
});

describe('para birimi', () => {
  it('her dil için tanımlı', () => {
    for (const locale of locales) expect(CURRENCY[locale], locale).toMatch(/^[A-Z]{3}$/);
  });
});

describe('locale normalizasyonu', () => {
  it('isLocale yalnızca geçerli kodları kabul eder', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('rapor')).toBe(false);
  });
  it('normalizeLocale geçersizde tr döner', () => {
    expect(normalizeLocale('ar')).toBe('ar');
    expect(normalizeLocale('xx')).toBe('tr');
  });
});
