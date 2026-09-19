import { describe, expect, it } from 'vitest';
import { locales } from '../i18n.config';
import { LEGAL_SLUGS, getConsent, getLegalMeta, getLegalName, isLegalSlug } from '../lib/legal';

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
