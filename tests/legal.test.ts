import { describe, expect, it } from 'vitest';
import { locales } from '../i18n.config';
import { LEGAL_SLUGS, getConsent, getLegalDoc, getLegalMeta, getLegalName, isLegalSlug } from '../lib/legal';

/** Gövdesi DOCS'te kendi dilinde yazan diller. */
const TRANSLATED = ['tr', 'en', 'de'] as const;
/** Gövde İngilizceye düşen, bu yüzden `noindex, follow` alan diller. */
const FALLBACK_LOCALES = ['fr', 'es', 'nl', 'ar', 'ru', 'fa', 'az'] as const;

describe('yasal sayfa meta (10 dil x 4 sayfa)', () => {
  it('her slug geçerli', () => {
    expect(LEGAL_SLUGS).toEqual(['sss', 'gizlilik', 'kvkk', 'iletisim']);
    expect(isLegalSlug('rapor')).toBe(false);
    expect(isLegalSlug('sss')).toBe(true);
  });
  it('her dilde title + description dolu', () => {
    for (const slug of LEGAL_SLUGS) {
      for (const locale of locales) {
        const meta = getLegalMeta(slug, locale);
        expect(meta.title.length, `${slug}/${locale}`).toBeGreaterThan(5);
        expect(meta.description.length, `${slug}/${locale}`).toBeGreaterThan(5);
        expect(getLegalName(slug, locale).length).toBeGreaterThan(0);
      }
    }
  });
  it('KVKK onayı her dilde tanımlı', () => {
    for (const locale of locales) {
      const c = getConsent(locale);
      expect(c.label.length).toBeGreaterThan(5);
      expect(c.link.length).toBeGreaterThan(0);
      expect(c.error.length).toBeGreaterThan(0);
    }
  });
});

describe('çeviri düşüşü (fallback) bayrağı', () => {
  it('dil listesi tam: her locale ya çevrili ya fallback listesinde', () => {
    // Yeni bir dil eklenirse bu test kırılır → robots kararı elle düşünülmüş olur.
    expect([...TRANSLATED, ...FALLBACK_LOCALES].sort()).toEqual([...locales].sort());
  });

  it('SSS 10 dilde de özgün (FAQ verisi tam) → düşüş yok', () => {
    for (const locale of locales) {
      const r = getLegalDoc('sss', locale);
      expect(r.fallback, locale).toBe(false);
      expect(r.fallbackNote, locale).toBe('');
    }
  });

  it('gizlilik/kvkk/iletisim: tr/en/de kendi metninde, düşüş yok', () => {
    for (const slug of ['gizlilik', 'kvkk', 'iletisim'] as const) {
      for (const locale of TRANSLATED) {
        const r = getLegalDoc(slug, locale);
        expect(r.fallback, `${slug}/${locale}`).toBe(false);
        expect(r.fallbackNote, `${slug}/${locale}`).toBe('');
        // Her çevrili dil kendi metninde (hiçbiri İngilizce kopyası değil).
        for (const other of TRANSLATED) {
          if (other === locale) continue;
          expect(r.doc, `${slug}/${locale}≠${other}`).not.toEqual(getLegalDoc(slug, other).doc);
        }
      }
    }
  });

  it('gizlilik/kvkk/iletisim: 7 dil İngilizceye düşer, not basar, bayrak true', () => {
    for (const slug of ['gizlilik', 'kvkk', 'iletisim'] as const) {
      for (const locale of FALLBACK_LOCALES) {
        const r = getLegalDoc(slug, locale);
        expect(r.fallback, `${slug}/${locale}`).toBe(true);
        expect(r.fallbackNote.length, `${slug}/${locale}`).toBeGreaterThan(10);
        // Düşen çeviri tam olarak İngilizce gövdeyi vermeli.
        expect(r.doc, `${slug}/${locale}`).toEqual(getLegalDoc(slug, 'en').doc);
      }
    }
  });

  it('bayrak ile not birbirini tutarlı (robots kararının dayandığı tek sinyal)', () => {
    for (const slug of LEGAL_SLUGS) {
      for (const locale of locales) {
        const r = getLegalDoc(slug, locale);
        expect(r.fallback, `${slug}/${locale}`).toBe(r.fallbackNote.length > 0);
      }
    }
  });
});
