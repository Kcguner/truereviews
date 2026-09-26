import { describe, expect, it } from 'vitest';
import { locales } from '../i18n.config';
import { bandColor, bandOf, type NbPreview, type NbReport, type NbTone } from '../components/notebook/types';

// Palet gerçek değerleriyle (app/globals.css):
//   a → var(--moss)   yeşil   :root #4b7a45 · html.dark #8fbc7a
//   b → var(--amber)  sarı    :root #d8951f · html.dark #e0a83c
//   c → #C97A18       sabit hex (band 'b' ile aynı ton ailesi, koyu temada değişmez)
//   d → var(--clay)   kiremit :root #ac452f · html.dark #d4694e
const BAND_COLOR: Record<'a' | 'b' | 'c' | 'd', string> = {
  a: 'var(--moss)',
  b: 'var(--amber)',
  c: '#C97A18',
  d: 'var(--clay)'
};

describe('bandOf', () => {
  it('eşikleri doğru uygular', () => {
    expect(bandOf(100)).toBe('a');
    expect(bandOf(85)).toBe('a');
    expect(bandOf(84)).toBe('b');
    expect(bandOf(70)).toBe('b');
    expect(bandOf(69)).toBe('c');
    expect(bandOf(55)).toBe('c');
    expect(bandOf(54)).toBe('d');
    expect(bandOf(0)).toBe('d');
  });
  it('eşiklerin iki yanında bandı değiştirir', () => {
    for (const edge of [85, 70, 55]) {
      expect(bandOf(edge)).not.toBe(bandOf(edge - 1));
    }
  });
  it('aralık dışı ve geçersiz skorlarda çökmez', () => {
    expect(bandOf(-10)).toBe('d');
    expect(bandOf(1000)).toBe('a');
    expect(bandOf(Number.NaN)).toBe('d');
  });
});

describe('bandColor', () => {
  it('her banda tam olarak beklenen palet değerini döner', () => {
    expect(bandColor(95)).toBe('var(--moss)');
    expect(bandColor(85)).toBe('var(--moss)');
    expect(bandColor(75)).toBe('var(--amber)');
    expect(bandColor(70)).toBe('var(--amber)');
    expect(bandColor(60)).toBe('#C97A18');
    expect(bandColor(55)).toBe('#C97A18');
    expect(bandColor(30)).toBe('var(--clay)');
    expect(bandColor(0)).toBe('var(--clay)');
  });
  it('bandOf ile aynı bandı renklendirir', () => {
    for (const s of [100, 95, 85, 84, 75, 70, 69, 60, 55, 54, 30, 0, -5, 1000]) {
      expect(bandColor(s)).toBe(BAND_COLOR[bandOf(s)]);
    }
  });
  it('0-100 arası her skor yalnızca tanımlı palet değerlerinden birini alır', () => {
    const allowed = new Set(Object.values(BAND_COLOR));
    for (let s = 0; s <= 100; s++) {
      expect(allowed.has(bandColor(s)), `skor ${s}`).toBe(true);
    }
  });
});

describe('notebook tipleri', () => {
  it('NbTone yüzdeleri toplamı 100 kabul eder', () => {
    const tone: NbTone = { pos: 60, neu: 25, neg: 15 };
    expect(tone.pos + tone.neu + tone.neg).toBe(100);
  });
  it('NbPreview zorunlu alanları taşır, tone opsiyoneldir', () => {
    const preview: NbPreview = {
      score: 7.1,
      teaser: 'Yorumlar çoğunlukla olumlu.',
      business_name: 'Ornek Ev Yemekleri',
      review_count: 20
    };
    expect(preview.tone).toBeUndefined();
    expect(bandOf(Math.round(preview.score * 10))).toBe('b');
  });
  it('NbReport kilit duvarı sonrası alanları taşır, histogram opsiyoneldir', () => {
    const report: NbReport = {
      score: 4.2,
      summary: 'Sorunlar yığılıyor.',
      top_complaints: [{ topic: 'Bekleme', count: 9 }],
      top_praises: [],
      action_suggestion: 'Hafta içinde bekleme süresini ölç.',
      review_count: 20,
      business_name: 'Ornek Ev Yemekleri'
    };
    expect(report.rating_histogram).toBeUndefined();
    expect(bandOf(Math.round(report.score * 10))).toBe('d');
    expect(report.top_praises).toHaveLength(0);
  });
});

// app/[locale]/not-found.tsx yeni çeviri anahtarı EKLEMEYEN bir 404 basıyor;
// kullanılan anahtarların 10 dilde de var olduğunu burada sabitliyoruz.
describe('404 metinleri (10 dil)', () => {
  const keys = ['nb.brand.sub', 'nb.foot.tagline', 'nb.rpt.new'] as const;

  it.each(locales)('%s dilinde tüm anahtarlar dolu', async (locale) => {
    const mod = await import(`../messages/${locale}.json`);
    const messages = (mod.default ?? mod) as Record<string, unknown>;
    for (const key of keys) {
      const value = key
        .split('.')
        .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], messages);
      expect(typeof value, `${locale}:${key}`).toBe('string');
      expect(String(value).trim().length, `${locale}:${key}`).toBeGreaterThan(0);
    }
  });
});
