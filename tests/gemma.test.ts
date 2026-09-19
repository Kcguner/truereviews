import { describe, expect, it } from 'vitest';
import { GEMMA_MODEL_DEFAULT, buildPrompt } from '../lib/gemma';

const REVIEWS = [
  { rating: 5, text: 'Harika yemekler, hızlı servis.' },
  { rating: 2, text: 'Çok bekledik, ilgi zayıftı.' }
];

describe('gemma', () => {
  it('varsayılan model sabit ve env ile ezilebilir olmalı', () => {
    expect(GEMMA_MODEL_DEFAULT).toBe('gemma-3-27b-it');
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
});
