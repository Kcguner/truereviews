import { afterEach, describe, expect, it, vi } from 'vitest';
import { GEMMA_MODEL_DEFAULT, analyzeReviews, buildPrompt, clipQuote, extractJson } from '../lib/gemma';

const REVIEWS = [
  { rating: 5, text: 'Harika yemekler, hızlı servis.' },
  { rating: 2, text: 'Çok bekledik, ilgi zayıftı.' }
];

const PREV_KEY = process.env.GOOGLE_AI_API_KEY;
const PREV_MODEL = process.env.GEMMA_MODEL;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (PREV_KEY === undefined) delete process.env.GOOGLE_AI_API_KEY;
  else process.env.GOOGLE_AI_API_KEY = PREV_KEY;
  if (PREV_MODEL === undefined) delete process.env.GEMMA_MODEL;
  else process.env.GEMMA_MODEL = PREV_MODEL;
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
  it('heuristic örneklerde metinli yorum önden gelir', async () => {
    delete process.env.GOOGLE_AI_API_KEY;
    const revs = [
      { rating: 5, text: '' },
      { rating: 5, text: 'Gerçek bir övgü metni.' },
      { rating: 1, text: '' },
      { rating: 1, text: 'Gerçek bir şikayet metni.' }
    ] as never;
    const { report, mocked } = await analyzeReviews('X', revs, 'tr');
    expect(mocked).toBe(true);
    expect(report.top_praises[0].example).toContain('Gerçek bir övgü');
    expect(report.top_complaints[0].example).toContain('Gerçek bir şikayet');
  });
  it('clipQuote kelime ortasından bölmez', () => {
    expect(clipQuote('kısa metin')).toBe('kısa metin');
    const long = 'Servis bilmiyorsanız Pastane olarak kalmaya devam edin lütfen teşekkürler';
    const clipped = clipQuote(long, 30);
    expect(clipped.endsWith('…')).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(31);
    expect(/\s$/.test(clipped.slice(0, -1))).toBe(false);
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
  it('score 47 (0-10 sözleşmesi dışı) -> heuristic fallback, 500 değil', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      score: 47,
                      summary: 'Süper.',
                      top_complaints: [],
                      top_praises: [],
                      action_suggestion: 'Devam.'
                    })
                  }
                ]
              }
            }
          ]
        })
      }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    // Gauge "470/100" yazacaktı; sözleşme 0-10.
    expect(report.score).toBeGreaterThanOrEqual(0);
    expect(report.score).toBeLessThanOrEqual(10);
  });

  it('negatif / NaN-benzeri / string score -> heuristic fallback', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    for (const score of [-3, null, '8.5']) {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    // JSON'da NaN ifadesi yok; null en yakın karşılığı.
                    text: `{"score": ${JSON.stringify(score)}, "summary": "S.", "top_complaints": [], "top_praises": [], "action_suggestion": "D."}`
                  }
                ]
              }
            }
          ]
        })
      }) as never);
      vi.stubGlobal('fetch', fetchMock);
      const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
      expect(mocked).toBe(true);
      expect(report.score).toBeLessThanOrEqual(10);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it('NaN içeren gövde parse edilemez -> heuristic fallback, patlamaz', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  { text: '{"score": NaN, "summary": "S.", "top_complaints": [], "top_praises": [], "action_suggestion": "D."}' }
                ]
              }
            }
          ]
        })
      }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(report.review_count).toBe(2);
  });

  it('tema count sayı değilse -> heuristic fallback (theme çubukları çökmez)', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      score: 8,
                      summary: 'İyi.',
                      top_complaints: [{ topic: 'Servis', count: '3' }],
                      top_praises: [{ topic: 'Lezzet', count: 4 }],
                      action_suggestion: 'Devam.'
                    })
                  }
                ]
              }
            }
          ]
        })
      }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    // Heuristic'in count'ları daima sonlu sayı.
    for (const t of [...report.top_complaints, ...report.top_praises]) {
      expect(typeof t.count).toBe('number');
      expect(Number.isFinite(t.count)).toBe(true);
    }
  });

  it('negatif / boş topic veya string example -> heuristic fallback', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    const bad = [
      { topic: '', count: 2, example: 'x' },
      { topic: 'Konu', count: -1, example: 'x' },
      { topic: 'Konu', count: 2, example: { bad: true } }
    ];
    for (const item of bad) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        score: 7,
                        summary: 'İyi.',
                        top_complaints: [item],
                        top_praises: [],
                        action_suggestion: 'Devam.'
                      })
                    }
                  ]
                }
              }
            ]
          })
        }) as never)
      );
      const { mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
      expect(mocked).toBe(true);
    }
  });

  it('ok ama JSON olmayan gövde (proxy HTML) -> heuristic fallback, SyntaxError sızmaz', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        }
      }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(report.business_name).toBe('X');
    expect(report.score).toBeLessThanOrEqual(10);
  });

  it('ok ama literal null gövde -> heuristic fallback, TypeError sızmaz', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json: async () => null }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(report.review_count).toBe(2);
  });

  it('ok ama dizi/boş gövde -> heuristic fallback', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    for (const body of [[], 'metin', 42]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as never)
      );
      const { mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
      expect(mocked).toBe(true);
    }
  });

  it('candidates bozuksa (metin yok) -> heuristic fallback', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: '' }] } }] })
      }) as never)
    );
    const { mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
  });

  it('fetch kendi hata fırlatırsa (timeout/abort) -> heuristic fallback', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('The operation was aborted due to timeout');
      })
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(Number.isFinite(report.score)).toBe(true);
  });

  it('model 404 -> heuristic fallback (500 değil) ve prod uyarısı', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    delete process.env.GEMMA_MODEL;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn(async () => ({ ok: false, status: 404, text: async () => 'not found' }) as never);
    vi.stubGlobal('fetch', fetchMock);
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(report.review_count).toBe(2);
    // 404'te tekrar denenmez.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('GEMMA_MODEL');
    delete process.env.GEMMA_MODEL;
  });

  it('429 kota -> heuristic fallback, tekrar denemez', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    const fetchMock = vi.fn(async () => ({ ok: false, status: 429, text: async () => 'quota' }) as never);
    vi.stubGlobal('fetch', fetchMock);
    const { mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('401/403 anahtar hatası yine de açıkça fırlar', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    for (const status of [401, 403]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => ({ ok: false, status, text: async () => 'nope' }) as never)
      );
      await expect(analyzeReviews('X', REVIEWS as never, 'tr')).rejects.toThrow(
        `Gemma hatası (${status})`
      );
    }
  });

  it('Gemini isteği timeout sinyali taşır', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal);
        return { ok: false, status: 503, text: async () => 'busy' } as never;
      })
    );
    await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(signals.length).toBeGreaterThanOrEqual(2);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  it('anahtar yoksa üretimde uyarı loglar (sessiz sahte analiz olmaz)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.GOOGLE_AI_API_KEY;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(true);
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('GOOGLE_AI_API_KEY');
  });

  it('4xx -> config hatası olarak fırlar', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 400, text: async () => 'bad key' }) as never)
    );
    await expect(analyzeReviews('X', REVIEWS as never, 'tr')).rejects.toThrow('Gemma hatası (400)');
  });
  it('extractJson fence ve düz yazıyı ayıklar', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('İşte analiz:\n{"a":2}\nUmarım yardımcı olur.')).toEqual({ a: 2 });
    expect(() => extractJson('düz yazı, json yok')).toThrow();
  });
  it('fence sarılı geçerli JSON gerçek rapor sayılır', async () => {
    process.env.GOOGLE_AI_API_KEY = 'test-key';
    const payload =
      '```json\n{"score":8.5,"summary":"Güzel mekan.","top_complaints":[],"top_praises":[],"action_suggestion":"Devam."}\n```';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ candidates: [{ content: { parts: [{ text: payload }] } }] })
      }) as never)
    );
    const { report, mocked } = await analyzeReviews('X', REVIEWS as never, 'tr');
    expect(mocked).toBe(false);
    expect(report.score).toBe(8.5);
    expect(report.business_name).toBe('X');
  });
});
