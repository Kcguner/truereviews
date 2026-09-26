import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RATING, fetchReviews, mockBusinessName, mockReviews, normalizeRating } from '../lib/apify';

const PREV_TOKEN = process.env.APIFY_API_TOKEN;
const PREV_ACTOR = process.env.APIFY_ACTOR_ID;
const PREV_BUDGET = process.env.APIFY_TIMEOUT_MS;
const PLACE_URL = 'https://www.google.com/maps/place/abc';

function restore(key: string, prev: string | undefined): void {
  if (prev === undefined) delete process.env[key];
  else process.env[key] = prev;
}

/** fetch takma adı: url hangi uç noktaya gitti? */
function routes(handler: (url: string) => { ok: boolean; status?: number; body?: unknown }): string[] {
  const seen: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      seen.push(u);
      const r = handler(u);
      return {
        ok: r.ok,
        status: r.status ?? (r.ok ? 200 : 500),
        json: async () => r.body,
        text: async () => JSON.stringify(r.body ?? {})
      } as never;
    })
  );
  return seen;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  restore('APIFY_API_TOKEN', PREV_TOKEN);
  restore('APIFY_ACTOR_ID', PREV_ACTOR);
  restore('APIFY_TIMEOUT_MS', PREV_BUDGET);
});

describe('normalizeRating', () => {
  it('1-5 aralığındaki puanı olduğu gibi bırakır', () => {
    expect(normalizeRating(5)).toBe(5);
    expect(normalizeRating(1)).toBe(1);
    expect(normalizeRating(3)).toBe(3);
    expect(normalizeRating('4')).toBe(4);
  });

  it('0 / negatif / NaN / null / eksik alan → nötr 3', () => {
    // Regresyon: apify `Number(...) || 0` 0 üretiyordu, gemma ise 0'ı ortalamada
    // 3 sayıp raporun dışında bırakıyordu. Artık her yol aynı: nötr.
    expect(normalizeRating(0)).toBe(DEFAULT_RATING);
    expect(normalizeRating(-3)).toBe(DEFAULT_RATING);
    expect(normalizeRating(NaN)).toBe(DEFAULT_RATING);
    expect(normalizeRating(null)).toBe(DEFAULT_RATING);
    expect(normalizeRating(undefined)).toBe(DEFAULT_RATING);
    expect(normalizeRating('abc')).toBe(DEFAULT_RATING);
    expect(normalizeRating({})).toBe(DEFAULT_RATING);
  });

  it('5 dışı ölçeği 1-5 aralığına indirger, imkânsız puan üretmez', () => {
    expect(normalizeRating(0.4)).toBe(1);
    expect(normalizeRating(7)).toBe(5);
    expect(normalizeRating(10)).toBe(5);
    // 0-100 ölçeği ya da bozuk veri: "en iyi yorum" gibi göstermektense nötr.
    expect(normalizeRating(47)).toBe(DEFAULT_RATING);
    expect(normalizeRating(100)).toBe(DEFAULT_RATING);
    for (const raw of [0, -1, 1, 2.5, 3, 5, 6, 47, NaN, null, undefined, 'x']) {
      const r = normalizeRating(raw);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThanOrEqual(5);
    }
  });
});

describe('fetchReviews — mock yol', () => {
  it('token yoksa mock doner, mocked=true, network dokunulmaz', async () => {
    delete process.env.APIFY_API_TOKEN;
    const seen = routes(() => ({ ok: true, body: [] }));
    const res = await fetchReviews(PLACE_URL, 4, 'tr');
    expect(res.mocked).toBe(true);
    expect(res.reviews).toHaveLength(4);
    expect(res.businessName).toBe(mockBusinessName(PLACE_URL));
    expect(seen).toHaveLength(0);
    // Mock yorumlar da normalize sözleşmesine uyar.
    for (const r of res.reviews) {
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  });

  it('üretimde token yoksa uyarı loglar (sessiz mock degradasyonu olmaz)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    delete process.env.APIFY_API_TOKEN;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { mocked } = await fetchReviews(PLACE_URL, 2, 'tr');
    expect(mocked).toBe(true);
    const logged = errSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logged).toContain('APIFY_API_TOKEN');
    expect(logged).toContain('FABRİK');
  });
});

describe('fetchReviews — gerçek yol (asenkron run + poll)', () => {
  beforeEach(() => {
    process.env.APIFY_API_TOKEN = 'test-token';
  });

  it('run başlatır, durum yoklar, datasetten yorum toplar', async () => {
    const seen = routes((u) => {
      if (u.includes('/runs?')) return { ok: true, body: { data: { id: 'TASK1', status: 'READY' } } };
      if (u.includes('/actor-tasks/TASK1?')) return { ok: true, body: { data: { status: 'SUCCEEDED' } } };
      if (u.includes('/actor-tasks/TASK1/dataset/items')) {
        return {
          ok: true,
          body: [
            {
              title: 'Örnek Lokanta',
              reviews: [
                { text: 'Harika', stars: 5, author: 'Ayşe' },
                { reviewText: 'Berbat', score: 1 }
              ]
            }
          ]
        };
      }
      throw new Error(`beklenmeyen istek: ${u}`);
    });

    const res = await fetchReviews(PLACE_URL, 10, 'tr');
    expect(res.mocked).toBe(false);
    expect(res.businessName).toBe('Örnek Lokanta');
    expect(res.reviews).toEqual([
      { text: 'Harika', rating: 5, author: 'Ayşe' },
      { text: 'Berbat', rating: 1, author: undefined }
    ]);
    // Senkron uç nokta artık kullanılmıyor: run + poll + dataset.
    expect(seen.some((u) => u.includes('run-sync-get-dataset-items'))).toBe(false);
    expect(seen.some((u) => u.includes('/actor-tasks/TASK1/dataset/items?format=json'))).toBe(true);
  });

  it('dataset yorumlarını normalize eder ve maxReviews ile sınırlar', async () => {
    routes((u) => {
      if (u.includes('/runs?')) return { ok: true, body: { data: { id: 'T2' } } };
      if (u.includes('/actor-tasks/T2?')) return { ok: true, body: { data: { status: 'SUCCEEDED' } } };
      return {
        ok: true,
        body: [
          { text: 'a', stars: 0 },
          { text: 'b', rating: 'abc' },
          { text: 'c' },
          { text: 'd', score: 47 },
          { text: 'e', stars: 9 }
        ]
      };
    });
    const { reviews } = await fetchReviews(PLACE_URL, 10, 'tr');
    expect(reviews.map((r) => r.rating)).toEqual([3, 3, 3, 3, 5]);
  });

  it('her fetch timeout sinyali taşır', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        signals.push(init.signal);
        if (String(_url).includes('/runs?')) {
          return { ok: true, status: 200, json: async () => ({ data: { id: 'T3' } }) } as never;
        }
        if (String(_url).includes('/actor-tasks/T3?')) {
          return { ok: true, status: 200, json: async () => ({ data: { status: 'SUCCEEDED' } }) } as never;
        }
        return { ok: true, status: 200, json: async () => [] } as never;
      })
    );
    await fetchReviews(PLACE_URL, 3, 'tr');
    expect(signals.length).toBeGreaterThanOrEqual(3);
    for (const s of signals) {
      expect(s).toBeInstanceOf(AbortSignal);
    }
  });

  it('actor FAILED olursa açık hata verir (sahte veri sızdırmaz)', async () => {
    routes((u) => {
      if (u.includes('/runs?')) return { ok: true, body: { data: { id: 'T4' } } };
      return { ok: true, body: { data: { status: 'FAILED' } } };
    });
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/Apify actor FAILED/);
  });

  it('bütçe dolarsa zaman aşımı hatası verir, reddedilme sızmaz', async () => {
    process.env.APIFY_TIMEOUT_MS = '100';
    routes((u) => {
      if (u.includes('/runs?')) return { ok: true, body: { data: { id: 'T5' } } };
      return { ok: true, body: { data: { status: 'RUNNING' } } };
    });
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/zaman aşımı/);
  });

  it('ağ hatası/timeout açık hataya çevrilir', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('socket hang up');
      })
    );
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/başarısız/);
  });

  it('ok gövdesi JSON değilse SyntaxError sızmaz, açık hata verir', async () => {
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        call++;
        if (call === 1) return { ok: true, status: 200, json: async () => ({ data: { id: 'T7' } }) } as never;
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError('Unexpected token < in JSON at position 0');
          }
        } as never;
      })
    );
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/okunamadı/);
  });

  it('dataset dizi değilse açık hata verir', async () => {
    routes((u) => {
      if (u.includes('/runs?')) return { ok: true, body: { data: { id: 'T6' } } };
      if (u.includes('/actor-tasks/T6?')) return { ok: true, body: { data: { status: 'SUCCEEDED' } } };
      return { ok: true, body: { nope: true } };
    });
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/dizi değil/);
  });

  it('HTTP hatası durum koduyla birlikte fırlatılır', async () => {
    routes(() => ({ ok: false, status: 401, body: { error: 'unauthorized' } }));
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/Apify hatası \(401\)/);
  });

  it('run yanıtında taskId yoksa açık hata verir', async () => {
    routes(() => ({ ok: true, body: { data: {} } }));
    await expect(fetchReviews(PLACE_URL, 3, 'tr')).rejects.toThrow(/taskId/);
  });
});

describe('mock yardımcıları', () => {
  it('mockReviews istenen sayıda 1-5 puanlı yorum üretir', () => {
    const out = mockReviews('X', 12);
    expect(out).toHaveLength(12);
    for (const r of out) {
      expect(Number.isFinite(r.rating)).toBe(true);
      expect(r.rating).toBeGreaterThanOrEqual(1);
      expect(r.rating).toBeLessThanOrEqual(5);
    }
  });
  it('mockBusinessName link başına sabit isim verir', () => {
    expect(mockBusinessName(PLACE_URL)).toBe(mockBusinessName(PLACE_URL));
    expect(mockBusinessName(PLACE_URL).length).toBeGreaterThan(0);
  });
});
