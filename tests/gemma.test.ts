import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEMMA_MODEL_DEFAULT, analyzeReviews, buildPrompt } from '../lib/gemma';

const REVIEWS = [
  { rating: 5, text: 'Harika yemekler, hızlı servis.' },
  { rating: 2, text: 'Çok bekledik, ilgi zayıftı.' }
];

const PREV_KEY = process.env.GOOGLE_AI_API_KEY;

afterEach(() => {
  vi.unstubAllGlobals();
  if (PREV_KEY === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = PREV_KEY;
});

describe('gemma', () => {
  it('varsayılan model sabit ve env ile ezilebilir olmalı', () => {
    expect(GEMMA_MODEL_DEFAULT).toBe('gemma-4-31b-it');
  });
  it('prompt beklenen JSON şemasını ister', () => {
    const p = buildPrompt('Örnek Lokanta', REVIEWS as never, 'tr');
    for (const key of ['"score"', '"summary"', '"top_complaints"', '"top_praises"', '"action_suggestion"']) {
      expect(p).toContain(key);
    }
    expect(p).toContain('Türkçe');
  });
  it('istenen dil prompta yansır', () => {
    expect(buildPrompt('X', REVIEWS as never, 'en')).toContain('English');
  });
  it('kalıcı 5xx -> heuristic fallback (mocked), patlamaz', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, text: async () => 'busy' }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(report.business_name).toBe('X');
    expect(report.review_count).toBe(2);
  });
  it('metinsiz yorumlar promptta dağılım notu olur, metin listesine girmez', () => {
    const mixed = [
      { rating: 5, text: 'Harika.' },
      { rating: 1, text: '' },
      { rating: 5, text: '   ' }
    ] as never;
    const p = buildPrompt('X', mixed, 'tr');
    expect(p).toContain('3 Google Maps yorumu var (1 metinli, 2 metinsiz)');
    expect(p).toContain('metinsiz (sadece puan)');
    expect(p).toContain('Harika.');
  });
  it('4xx -> config hatası olarak fırlar', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, text: async () => 'bad key' }) as never)
    );
    await expect(analyzeReviews('X', REVIEWS as never, 'tr')).rejects.toThrow('Gemma hatası (400)');
  });
});
