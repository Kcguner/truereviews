import { warnProdOnce } from './env-guard';

export interface ScrapedReview {
  text: string;
  rating: number;
  author?: string;
}

/** Puan okunamaz/eksik/0 ise kullanılan nötr varsayılan (Google Maps 1-5 yıldız). */
export const DEFAULT_RATING = 3;

/**
 * Ham actor puanını TEK noktada 1-5 aralığına indirger. Kaynak güvenilmez:
 * alan adı değişebilir, değer null/NaN/0/47/"abc" gelebilir.
 * - 0, negatif, NaN, null, okunamayan → NÖTR (3): hem ortalamaya katılır hem de
 *   raporun nötr dışı temalarında görünmez. lib/gemma.ts ve /api/analyze aynı
 *   kuralı kullanır; 0'ın "ortalamada 3 iken rapordan düşmesi" çelişkisi böylece biter.
 * - 5-10 arası (olası 0-10 ölçeği) → 5'e kırpılır.
 * - 10 üstü (0-100 ölçeği ya da bozuk veri) → ayrıştırılamaz sayılıp nötr: 47
 *   yıldızı "en iyi yorum" gibi göstermektense nötr bırakmak dürüsttür.
 */
export function normalizeRating(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_RATING;
  if (n > 10) return DEFAULT_RATING;
  return Math.min(5, Math.max(1, Math.round(n * 10) / 10));
}

/**
 * Apify çağrı bütçeleri.
 * - REQUEST_TIMEOUT: tek bir REST isteği (run başlat / durum / dataset) kısa
 *   kalmalı; 15 sn bir REST çağrısı için bol.
 * - POLL_BUDGET: toplam bekleme. Google Maps yorum kazıyıcıları rutin olarak
 *   30-120 sn sürüyor, ama bütçe `maxDuration`'ın ALTINDA kalmak zorunda:
 *   bütçe dolunca kontrollü hata fırlatırız, `maxDuration` dolunca platform
 *   fonksiyonu öldürüp kullanıcıya 504 verir. İkincisi daha kötüdür (Apify
 *   kredisi harcanmış, hiçbir şey saklanmamış, JSON bile yok).
 *   Aritmetik (`app/api/analyze/route.ts` ve `vercel.json`: 60 sn):
 *     30 sn (Apify) + 8-15 sn (tipik Gemma) + ~1 sn (Redis yazma) = 39-46 sn,
 *     yani 14+ sn güvenlik payı kalıyor.
 *   Dürüstlük notu: Gemma'nın en kötü yolu iki deneme × 20 sn + 2,5 sn bekleme
 *   = ~42,5 sn; 30 + 42,5 = 72,5 sn > 60 sn, yani ÇİFT zaman aşımı olan nadir
 *   yolda platform yine de 504 verebilir. Bunu tamamen kapatmanın tek yolu
 *   bütçeyi ~15 sn'ye indirmekti; o zaman kazıyıcıların çoğu (30-120 sn) zaman
 *   aşımına uğrar ve ürün hiç çalışmaz. Seçim: "çoğu analiz bitsin, nadir çift
 *   zaman-aşımı yolu 504 olsun". Yüksek başarı oranı isteniyorsa plan
 *   yükseltilmeli ve `maxDuration` ile bu bütçe BİRLİKTE ~150/90 sn'ye
 *   çıkarılmalıdır; tek başına birini yükseltmek diğerini ölü kod yapar.
 * - POLL_INTERVAL: 3 sn yeterli; actor'ı daha sık yoklamak kotaları yiyip
 *   hiçbir şey kazandırmıyor.
 * Bütçe APIFY_TIMEOUT_MS ile DAHA DA daraltılabilir (CI/kısa süreli deploy);
 * değer yalnızca düşürülebilir, çünkü tavan bu sabittir.
 */
const APIFY_REQUEST_TIMEOUT_MS = 15_000;
const APIFY_POLL_BUDGET_MS = 30_000;
const APIFY_POLL_INTERVAL_MS = 3_000;

/** Pollde başarısız durumlar: tekrar denemeye değmez, açık hata verilir. */
const APIFY_FATAL_STATUSES = new Set(['FAILED', 'ABORTED', 'TIMED-OUT']);

const MOCK_BUSINESSES = [
  'Örnek Kebap Salonu',
  'Demo Cafe & Restaurant',
  'Test Otel Antalya'
];

const MOCK_TEXTS_TR = [
  'Servis biraz yavaştı ama lezzetler harikaydı, fiyatlar makul.',
  'Garsonlar çok ilgiliydi, ortam temiz ve ferah.',
  'Yoğun saatlerde bekleme süresi uzuyor, rezervasyon öneririm.',
  'Porsiyonlar doyurucu, özellikle tatlıları tavsiye ederim.',
  'Otopark sorunu var, onun dışında her şey güzeldi.',
  'Fiyat/performans olarak gayet iyi, tekrar gelirim.',
  'Müzik biraz yüksekti, konuşmak zor oldu.',
  'Temizlik ve hijyen konusunda çok iyiler.',
  'Sipariş yanlış geldi ama hızlıca düzelttiler.',
  'Manzarası muhteşem, kahvaltısı zengin.'
];

/** Apify yoksa gerçekçi mock yorum üretir (kota yakmadan test imkânı). */
export function mockReviews(businessName: string, count: number): ScrapedReview[] {
  const out: ScrapedReview[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      text: MOCK_TEXTS_TR[i % MOCK_TEXTS_TR.length],
      rating: [5, 4, 5, 3, 4, 5, 2, 5, 4, 3][i % 10],
      author: `Kullanıcı ${i + 1}`
    });
  }
  return out;
}

export function mockBusinessName(placeUrl: string): string {
  let h = 0;
  for (const c of placeUrl) h = (h * 31 + c.charCodeAt(0)) % 1000;
  return MOCK_BUSINESSES[h % MOCK_BUSINESSES.length];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Ortam değişkeninden pozitif tam sayı okur; geçersizse fallback'e döner. */
function numEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

/**
 * Apify REST çağrısı: kısa timeout + anlaşılır hata. Ağ hatası, abort ve
 * okunamayan gövde AYRI ayrı yakalanır — hiçbir yol yakalanmamış reddedilme
 * (unhandled rejection) bırakmaz.
 */
async function apifyJson(url: string, init: RequestInit, step: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(APIFY_REQUEST_TIMEOUT_MS) });
  } catch (e) {
    throw new Error(`Apify ${step} isteği başarısız (ağ hatası/zaman aşımı): ${errorMessage(e)}`);
  }
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Apify hatası (${res.status}): ${t.slice(0, 300)}`);
  }
  try {
    return await res.json();
  } catch {
    throw new Error(`Apify ${step} yanıtı okunamadı (geçersiz ya da boş JSON gövde).`);
  }
}

function pollBudgetMs(): number {
  return numEnv('APIFY_TIMEOUT_MS', APIFY_POLL_BUDGET_MS, 100, APIFY_POLL_BUDGET_MS);
}

/**
 * Asenkron actor çalıştırma + dataset toplama.
 *
 * DAVRANIŞ DEĞİŞİKLİĞİ: eskiden `run-sync-get-dataset-items` tek HTTP isteğinde
 * actor bitene kadar bekliyordu (30-120 sn, timeout'suz). Artık run başlatılır
 * (`POST /v2/acts/{id}/runs`) ve durum tekrarlarla izlenir
 * (`GET /v2/actor-tasks/{taskId}`), sonuç `GET
 * /v2/actor-tasks/{taskId}/dataset/items?format=json` ile alınır. Her HTTP
 * isteği kısa (15 sn) ve timeout'lu; toplam bekleme bütçesi APIFY_TIMEOUT_MS
 * (varsayılan 30 sn) ile sınırlı. Bütçe dolarsa ya da actor FAILED/ABORTED/
 * TIMED-OUT olursa açık bir hata fırlatılır — kullanıcıya sahte/m mock veri
 * SIZDIRILMAZ (mock yalnızca APIFY_API_TOKEN yokken devreye girer).
 * Not: fonksiyon hâlâ poll döngüsü boyunca açık kalır; gerçekten bloke etmeyen
 * bir tasarım için kuyruk/webhook gerekir. Bütçe, deploy'un maxDuration'ının
 * ALTINDA olacak şekilde ayarlanmalıdır (üstteki aritmetik).
 */
async function collectItems(
  actorId: string,
  token: string,
  input: Record<string, unknown>
): Promise<Record<string, unknown>[]> {
  const auth = `token=${encodeURIComponent(token)}`;
  const started = (await apifyJson(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/runs?${auth}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
    'çalıştırma başlatma'
  )) as { data?: { id?: string } } | null;
  const taskId = started?.data?.id;
  if (!taskId) {
    throw new Error('Apify yanıtı beklenmeyen biçimde: run id (taskId) yok.');
  }

  const budget = pollBudgetMs();
  const deadline = Date.now() + budget;
  for (;;) {
    const task = (await apifyJson(
      `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}?${auth}`,
      {},
      'durum sorgulama'
    )) as { data?: { status?: string } } | null;
    const status = (task?.data?.status || '').toUpperCase();
    if (status === 'SUCCEEDED') break;
    if (APIFY_FATAL_STATUSES.has(status)) {
      throw new Error(`Apify actor ${status} (task ${taskId}).`);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `Apify zaman aşımı: actor ${Math.round(budget / 1000)} saniyede bitmedi (task ${taskId}).`
      );
    }
    await sleep(Math.min(APIFY_POLL_INTERVAL_MS, remaining));
  }

  const items = await apifyJson(
    `https://api.apify.com/v2/actor-tasks/${encodeURIComponent(taskId)}/dataset/items?format=json&${auth}`,
    {},
    'dataset okuma'
  );
  if (!Array.isArray(items)) {
    throw new Error('Apify dataset beklenmeyen biçimde (dizi değil).');
  }
  return items as Record<string, unknown>[];
}

export async function fetchReviews(
  placeUrl: string,
  maxReviews: number,
  language = 'tr'
): Promise<{ reviews: ScrapedReview[]; businessName: string; mocked: boolean }> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID || 'compass/google-maps-reviews-scraper';

  if (!token) {
    // Sessizce mock'a düşmek en tehlikeli durum: kullanıcı sahte yorumların
    // analizini gerçek sanıyor. Üretimde bir kez yüksek sesle logla.
    warnProdOnce(
      'apify-mock',
      'APIFY_API_TOKEN tanımlı değil — üretimde FABRİK (mock) yorumlar dönüyor; kullanıcı sahte veriyi gerçek analiz sanıyor.'
    );
    return {
      reviews: mockReviews(placeUrl, maxReviews),
      businessName: mockBusinessName(placeUrl),
      mocked: true
    };
  }

  const items = await collectItems(actorId, token, {
    startUrls: [{ url: placeUrl }],
    maxReviews,
    reviewsSort: 'newest',
    language
  });

  const reviews: ScrapedReview[] = [];
  let businessName = mockBusinessName(placeUrl);
  for (const it of items) {
    const arr = Array.isArray(it.reviews) ? (it.reviews as Record<string, unknown>[]) : [it];
    if (typeof it.title === 'string' && it.title) businessName = it.title;
    for (const r of arr) {
      const text =
        (r.text as string) || (r.reviewText as string) || (r.comment as string) || '';
      // Puan TEK noktada normalize edilir (1-5, okunamazsa 3): hem scrape
      // çıktısı tutarlı olur hem de lib/gemma.ts aynı değeri görür.
      const rating = normalizeRating(r.stars ?? r.rating ?? r.score);
      // Metinsiz (sadece puan) yorumlar da skora/tona katılır;
      // metin analizi buildPrompt'ta metinlilerle sınırlanır.
      reviews.push({
        text: String(text).slice(0, 2000),
        rating,
        author: (r.author as string) || undefined
      });
      if (reviews.length >= maxReviews) break;
    }
    if (reviews.length >= maxReviews) break;
  }
  return { reviews, businessName, mocked: false };
}
