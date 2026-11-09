import type { AnalysisReport } from './types';
import { normalizeRating, type ScrapedReview } from './apify';
import { warnProdOnce } from './env-guard';

/** Birincil model: hızlı ve ucuz Gemini 3.5 Flash-Lite (GEMMA_MODEL ile ezilir). */
export const GEMMA_MODEL_DEFAULT = 'gemini-3.5-flash-lite';

/** Birincil model hata verirse denenen yedek model (GEMMA_FALLBACK_MODEL ile ezilir). */
export const GEMMA_FALLBACK_MODEL_DEFAULT = 'gemma-4-26b-a4b-it';

/**
 * Tek bir model isteğinin zaman aşımı. Flash-Lite ve 26B MoE modeli için 15 sn
 * bol; üstü kilitlenmiş istek demek.
 */
const GEMMA_TIMEOUT_MS = 15_000;

/**
 * İki modelin TOPLAM bütçesi. Fonksiyonun `maxDuration`'ı 60 sn ve Apify en
 * fazla 30 sn bekliyor: 30 + 28 + ~1 (Redis) = 59 sn, yani platform fonksiyonu
 * öldürmeden kontrollü hata döneriz. Bütçe dolarsa kalan model denenmez.
 */
const GEMMA_TOTAL_BUDGET_MS = 28_000;

/** AI Studio'dan kopyalanmamış id kalıpları (ornek/example/your-model/…). */
const PLACEHOLDER_MODEL_RE = /^(ornek|example|your|model|test|xxx|placeholder)/i;

/**
 * Sözleşme aralığı (lib/types.ts: AnalysisReport.score 0-10).
 * Model çıktısı bu aralığın dışına çıkarsa REDDEDİLİR (heuristic'e düşülür);
 * heuristic hesabı da sonuçta clamp edilir. Böylece Gauge/ReportView'e
 * "470/100" gibi, yay ile çelişen bir sayı hiçbir yoldan ulaşamaz.
 */
const SCORE_MIN = 0;
const SCORE_MAX = 10;

const LANGUAGE_NAMES: Record<string, string> = {
  tr: 'Türkçe',
  en: 'English',
  de: 'Deutsch',
  ar: 'Arabic (العربية)',
  ru: 'Russian (Русский)',
  fr: 'Français',
  es: 'Español',
  nl: 'Nederlands',
  fa: 'Persian (فارسی)',
  az: 'Azerbaijani (Azərbaycanca)'
};

export function buildPrompt(
  businessName: string,
  reviews: ScrapedReview[],
  locale: string
): string {
  const lang = LANGUAGE_NAMES[locale] || 'Türkçe';
  const withText = reviews.filter((r) => r.text && r.text.trim());
  // Modele gösterilen puan da normalize edilir: ham veride 0 ya da 47 varsa
  // prompt "[47/5]" yazıp modelin çıktısını bozmamalı (apify.normalizeRating).
  const ratingOf = (r: ScrapedReview) => normalizeRating(r.rating);
  const lines = withText
    .map((r, i) => `${i + 1}. [${ratingOf(r)}/5] ${r.text}`)
    .join('\n');
  const emptyCount = reviews.length - withText.length;
  const emptyDist = [5, 4, 3, 2, 1]
    .map((s) => {
      const n = reviews.filter((r) => (!r.text || !r.text.trim()) && ratingOf(r) === s).length;
      return n > 0 ? `${s}★×${n}` : null;
    })
    .filter(Boolean)
    .join(', ');
  const extraLine =
    emptyCount > 0
      ? `\nNOT: Ayrıca ${emptyCount} metinsiz (sadece puan) yorum var${emptyDist ? ` — dağılım: ${emptyDist}` : ''}. Skoru bunları da hesaba katarak ver.`
      : '';
  return `Sen bir müşteri yorum analistisin. Aşağıda "${businessName}" adlı işletmenin ${reviews.length} Google Maps yorumu var (${withText.length} metinli${emptyCount > 0 ? `, ${emptyCount} metinsiz` : ''}).

YORUMLAR:
${lines}
${extraLine}
GÖREV: Yorumları analiz et ve SADECE şu JSON'u üret (başka metin yazma):
{
  "score": <0-10 arası ondalıklı genel duygu skoru>,
  "summary": "<2-3 cümlelik genel özet>",
  "top_complaints": [{"topic": "<şikayet konusu>", "count": <kaç yorumda geçti>, "example": "<kısa örnek cümle>"}] (en fazla 3),
  "top_praises": [{"topic": "<övgü konusu>", "count": <kaç yorumda geçti>, "example": "<kısa örnek cümle>"}] (en fazla 2),
  "action_suggestion": "<tek cümlelik en önemli aksiyon önerisi>"
}

Kurallar:
- Yanıtı ${lang} dilinde üret.
- Yorumlar hangi dilde olursa olsun analizi ${lang} dilinde yaz.
- SADECE ham JSON döndür: yanıtın ilk karakteri { , son karakteri } olmalı.
- \`\`\` gibi markdown fence KULLANMA; JSON'dan önce/sonra tek kelime bile açıklama YAZMA.
- Skor: 1-2 yıldız ağırlığı düşük, 4-5 yıldız ağırlığı yüksek puana yansısın.
- count değerleri gerçekçi tahmin olsun, toplam yorum sayısını aşmasın.`;
}

/** Model düz yazı/fence ile sarılmış JSON döndüğünde ham JSON'u ayıklar. */
export function extractJson(text: string): unknown {
  let t = (text || '').trim();
  // ```json ... ``` fence'lerini sök
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = (fence[1] || '').trim();
  // Baştaki/sondaki düz yazıyı at: ilk { ile son } arasını al
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t);
}

/** Sözleşme guard'ı: score her yolda 0-10 aralığında kalmalı. */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return SCORE_MIN;
  return Math.min(SCORE_MAX, Math.max(SCORE_MIN, n));
}

/**
 * Tema satırı sözleşmesi: { topic: string; count: number; example?: string }.
 * `count` string/NaN olursa ReportView'daki Math.max(1, ...counts) NaN'a düşer ve
 * tema çubukları çöker; negatif sayı da anlamsız. `example` opsiyoneldir ama
 * string olmalıdır (React çocuk render'ı).
 */
function isValidThemeItem(x: unknown): boolean {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  if (typeof o.topic !== 'string' || !o.topic.trim()) return false;
  if (typeof o.count !== 'number' || !Number.isFinite(o.count) || o.count < 0) return false;
  if (o.example !== undefined && typeof o.example !== 'string') return false;
  return true;
}

function isValidReport(r: unknown): r is AnalysisReport {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return false;
  const o = r as Record<string, unknown>;
  const score = o.score;
  // Not: review_count/business_name model çıktısından alınmaz, istekten doldurulur
  // (aşağıda) — bu yüzden burada doğrulanmaz; doğrulanırsa modelin uydurduğu
  // değer yüzünden geçerli rapor gereksiz yere reddedilirdi.
  return (
    typeof score === 'number' &&
    Number.isFinite(score) &&
    score >= SCORE_MIN &&
    score <= SCORE_MAX &&
    typeof o.summary === 'string' &&
    o.summary.trim().length > 0 &&
    Array.isArray(o.top_complaints) &&
    o.top_complaints.every(isValidThemeItem) &&
    Array.isArray(o.top_praises) &&
    o.top_praises.every(isValidThemeItem) &&
    typeof o.action_suggestion === 'string' &&
    o.action_suggestion.trim().length > 0
  );
}
 /** Alıntıyı kelime ortasından bölmeden kısaltır. */
export function clipQuote(text: string, max = 120): string {
  const t = (text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).trimEnd() + '…';
}

function heuristicReport(
  businessName: string,
  reviews: ScrapedReview[],
  locale: string
): AnalysisReport {
  // 0/NaN/eksik puan NÖTR (3) sayılır — apify.normalizeRating ile AYNI kural
  // (0 artık "ortalamada 3 iken rapordan kaybolan" yorum değil, tutarlı biçimde
  // nötr; /api/analyze'in (r || 3) davranışıyla da örtüşüyor).
  const ratings = reviews.map((r) => normalizeRating(r.rating));
  const avg = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 3;
  // Actor 1-5 dışı bir ölçek döndüyse ortalamayı normalizeRating zaten 1-5'e
  // indiriyor; yine de sonuç clamp edilir ki 0-10 sözleşmesi istisnasız tutulsun.
  const score = clampScore(Math.round(((avg / 5) * 10) * 10) / 10);
  // 3★ ve puanı okunamayanlar nötrdür; konu örneklerine girmez
  // (aksi halde olumlu bir yorum "şikayet" altında görünür).
  const low = reviews.filter((r) => normalizeRating(r.rating) <= 2);
  const high = reviews.filter((r) => normalizeRating(r.rating) >= 4);
  // Örnek alıntılarda metinli yorumlar önden: vitrine "Metinsiz puan"
  // çıkmasın; hiç metin yoksa o zaman fallback yazılır.
  const textFirst = (arr: ScrapedReview[]) => [
    ...arr.filter((r) => r.text && r.text.trim()),
    ...arr.filter((r) => !r.text || !r.text.trim())
  ];
  void locale;
  return {
    score,
    summary: `${businessName}: ${reviews.length} yorumun ortalaması ${avg.toFixed(1)}/5. Bu özet puan ortalamasına dayanır; yapay zekâ destekli detaylı analiz yakında bu alanda olacak.`,
    top_complaints: textFirst(low).slice(0, 3).map((r) => ({
      topic: 'Genel iyileştirme alanı',
      count: Math.max(1, Math.round(low.length / 3)),
      example: r.text ? clipQuote(r.text) : 'Metinsiz puan'
    })),
    top_praises: textFirst(high).slice(0, 2).map((r) => ({
      topic: 'Müşteri memnuniyeti',
      count: Math.max(1, Math.round(high.length / 2)),
      example: r.text ? clipQuote(r.text) : 'Metinsiz puan'
    })),
    action_suggestion:
      'En sık tekrar eden düşük puanlı temayı seçip 2 hafta içinde somut bir iyileştirme duyurun.',
    review_count: reviews.length,
    business_name: businessName
  };
}

type ModelResult =
  | { ok: true; report: AnalysisReport }
  | { ok: false; retryable: true; kind: string; status: number; detail?: string }
  | { ok: false; retryable: false; error: Error };

/**
 * Tek bir modele istek atar. Dönen `retryable` sonuçlarda çağıran yedek modele
 * geçer; `retryable: false` (400/401/403) anahtar/yapılandırma hatasıdır ve
 * yedek model de aynı anahtarı kullanacağı için açıkça fırlatılır.
 */
async function requestModel(
  model: string,
  prompt: string,
  apiKey: string,
  deadline: number
): Promise<ModelResult> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return { ok: false, retryable: true, kind: 'zaman-butcesi', status: 0 };
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(Math.min(GEMMA_TIMEOUT_MS, remaining))
    });
  } catch {
    return { ok: false, retryable: true, kind: 'ag-hatasi', status: 0 };
  }

  if (!res.ok) {
    // KVKK: bu gövde Google'ın hata açıklamasıdır, model çıktısı/yorum metni
    // değildir; yine de kısa tutulur ve yalnızca console.warn'a gider.
    let detail = '';
    try {
      detail = (await res.text()).slice(0, 300).replace(/\s+/g, ' ').trim();
    } catch {
      detail = '';
    }
    if (res.status === 404 || res.status === 429 || res.status >= 500) {
      const kind =
        res.status === 404 ? 'model-404' : res.status === 429 ? 'kota-429' : '5xx-veya-ag';
      return { ok: false, retryable: true, kind, status: res.status, detail };
    }
    return {
      ok: false,
      retryable: false,
      error: new Error(`Gemma hatası (${res.status}): ${detail}`)
    };
  }

  // res.ok JSON garantisi DEĞİLDİR: edge/proxy HTML hata sayfası, kesik gövde,
  // boş gövde ya da literal `null` burada SyntaxError/TypeError üretir.
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, retryable: true, kind: 'bozuk-govde', status: 0 };
  }
  const text =
    (data as { candidates?: { content?: { parts?: { text?: string }[] } }[] })
      .candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('') || '';
  try {
    const parsed = extractJson(text) as AnalysisReport;
    if (!isValidReport(parsed)) throw new Error('eksik/geçersiz alan');
    return { ok: true, report: parsed };
  } catch (e) {
    return {
      ok: false,
      retryable: true,
      kind: 'parse-veya-sema',
      status: 0,
      detail: e instanceof Error ? e.name : 'Error'
    };
  }
}

export async function analyzeReviews(
  businessName: string,
  reviews: ScrapedReview[],
  locale: string
): Promise<{ report: AnalysisReport; mocked: boolean }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    // Anahtar yoksa HER kullanıcı puan ortalaması tabanlı sahte "AI analizi"
    // görüyor; üretimde bunu loglamazsak sorun günlerce fark edilmez.
    warnProdOnce(
      'gemma-key-missing',
      'GOOGLE_AI_API_KEY tanımlı değil — üretimde yapay zekâ analizi YOK; her kullanıcıya puan ortalamasından üretilmiş sahte "AI analizi" gösteriliyor.'
    );
    return { report: heuristicReport(businessName, reviews, locale), mocked: true };
  }

  const envModel = process.env.GEMMA_MODEL;
  const primaryModel = envModel || GEMMA_MODEL_DEFAULT;
  const fallbackModel = process.env.GEMMA_FALLBACK_MODEL || GEMMA_FALLBACK_MODEL_DEFAULT;
  // Kopyala-yapıştır örnek değerleri (ornek/example/your-model/…) sessizce 404
  // üretmesin; varsayılanlar gerçek model id'leri olduğu için uyarılmaz.
  if (envModel && PLACEHOLDER_MODEL_RE.test(envModel)) {
    warnProdOnce(
      'gemma-model-placeholder',
      `GEMMA_MODEL gerçek bir model id'si değil ("${primaryModel}") — Google 404 dönecek, istekler yedek modele düşecek. AI Studio'daki gerçek id'yi yazın.`
    );
  }

  const prompt = buildPrompt(businessName, reviews, locale);
  const deadline = Date.now() + GEMMA_TOTAL_BUDGET_MS;
  const models = [primaryModel, fallbackModel];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const result = await requestModel(model, prompt, apiKey, deadline);
    if (result.ok) {
      if (i > 0) {
        warnProdOnce(
          'gemma-primary-failed',
          `Birincil model "${primaryModel}" başarısız — yedek model "${fallbackModel}" kullanılıyor; yedek de başarısız olursa heuristic rapor üretilecek.`
        );
      }
      result.report.review_count = reviews.length;
      result.report.business_name = businessName;
      return { report: result.report, mocked: false };
    }
    if (!result.retryable) throw result.error;
    // KVKK: yalnızca kategori/status ve Google'ın hata açıklaması loglanır;
    // model çıktısı ya da yorum metni asla.
    // eslint-disable-next-line no-console
    console.warn(
      `Gemma "${model}" başarısız (${result.kind}${result.status ? `, status=${result.status}` : ''})` +
        `${result.detail ? `: ${result.detail.slice(0, 200)}` : ''}`
    );
  }

  warnProdOnce(
    'gemma-fallback-heuristic',
    `Gemma birincil ("${primaryModel}") ve yedek ("${fallbackModel}") model başarısız — heuristic rapora düşülüyor; gerçek AI analizi üretilmiyor.`
  );
  return { report: heuristicReport(businessName, reviews, locale), mocked: true };
}

