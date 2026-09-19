import { describe, expect, it } from 'vitest';
import { locales } from '../i18n.config';
import { FAQS, getFaqHeading, getFaqs } from '../lib/faq';

describe('SSS kapsamı (10 dil)', () => {
  it('her dilde en az 3 soru-cevap var', () => {
    for (const locale of locales) {
      const faqs = FAQS[locale];
      expect(faqs, locale).toBeDefined();
      expect(faqs.length).toBeGreaterThanOrEqual(3);
      for (const f of faqs) {
        expect(f.q.trim().length).toBeGreaterThan(5);
        expect(f.a.trim().length).toBeGreaterThan(10);
      }
    }
  });
  it('bilinmeyen dil İngilizceye düşer', () => {
    expect(getFaqs('xx')).toEqual(FAQS.en);
  });
  it('her dilde başlık var', () => {
    for (const locale of locales) {
      expect(getFaqHeading(locale).trim().length).toBeGreaterThan(0);
    }
  });
});
