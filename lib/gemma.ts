import type { AnalysisReport } from './types';
import type { ScrapedReview } from './apify';

/** Varsayılan model. Üretimde GEMMA_MODEL ile AI Studio'daki gerçek id yazılmalı. */
export const GEMMA_MODEL_DEFAULT = 'gemma-4-31b-it';

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
  const lines = withText
    .map((r, i) => `${i + 1}. [${r.rating}/5] ${r.text}`)
    .join('\n');
  const emptyCount = reviews.length - withText.length;
  const emptyDist = [5, 4, 3, 2, 1]
    .map((s) => {
      const n = reviews.filter((r) => (!r.text || !r.text.trim()) && (r.rating || 3) === s).length;
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
- Skor: 1-2 yıldız ağırlığı düşük, 4-5 yıldız ağırlığı yüksek puana yansısın.
- count değerleri gerçekçi tahmin olsun, toplam yorum sayısını aşmasın.`;
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
  const ratings = reviews.map((r) => r.rating || 3);
  const avg = ratings.length
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 3;
  const score = Math.round(((avg / 5) * 10) * 10) / 10;
  // 3★ ve puanı okunamayanlar nötrdür; konu örneklerine girmez
  // (aksi halde olumlu bir yorum "şikayet" altında görünür).
  const low = reviews.filter((r) => r.rating >= 1 && r.rating <= 2);
  const high = reviews.filter((r) => r.rating >= 4);
  void locale;
  return {
    score,
    summary: `${businessName}: ${reviews.length} yorumun ortalaması ${avg.toFixed(1)}/5. Bu özet puan ortalamasına dayanır; yapay zekâ destekli detaylı analiz yakında bu alanda olacak.`,
    top_complaints: low.slice(0, 3).map((r) => ({
      topic: 'Genel iyileştirme alanı',
      count: Math.max(1, Math.round(low.length / 3)),
      example: r.text ? clipQuote(r.text) : 'Metinsiz puan'
    })),
    top_praises: high.slice(0, 2).map((r) => ({
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

export async function analyzeReviews(
  businessName: string,
  reviews: ScrapedReview[],
  locale: string
): Promise<{ report: AnalysisReport; mocked: boolean }> {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { report: heuristicReport(businessName, reviews, locale), mocked: true };

  const model = process.env.GEMMA_MODEL || GEMMA_MODEL_DEFAULT;
  const prompt = buildPrompt(businessName, reviews, locale);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = JSON.stringify({
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  // 503/yoğunluk dalgaları geçicidir: bir kez kısa bekleyip tekrar dene.
  // Hâlâ 5xx gelirse heuristic'e düş (kullanıcı rapor alır, mocked işaretlenir).
  // 4xx ise config hatasıdır (anahtar/model) — yüksek sesle patlamalı.
  let lastStatus = 0;
  let lastText = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2500));
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      });
    } catch {
      lastStatus = 0;
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      try {
        const parsed = JSON.parse(text) as AnalysisReport;
        parsed.review_count = reviews.length;
        parsed.business_name = businessName;
        return { report: parsed, mocked: false };
      } catch {
        return { report: heuristicReport(businessName, reviews, locale), mocked: true };
      }
    }
    lastStatus = res.status;
    lastText = (await res.text().catch(() => '')).slice(0, 300);
    if (res.status < 500) {
      throw new Error(`Gemma hatası (${res.status}): ${lastText}`);
    }
  }
  if (lastStatus !== 0 && lastStatus < 500) {
    throw new Error(`Gemma hatası (${lastStatus}): ${lastText}`);
  }
  // eslint-disable-next-line no-console
  console.warn(`Gemma 5xx/ağ hatası sonrası heuristic fallback (status=${lastStatus})`);
  return { report: heuristicReport(businessName, reviews, locale), mocked: true };
}
