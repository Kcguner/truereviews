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
  const lines = reviews
    .map((r, i) => `${i + 1}. [${r.rating}/5] ${r.text}`)
    .join('\n');
  return `Sen bir müşteri yorum analistisin. Aşağıda "${businessName}" adlı işletmenin ${reviews.length} Google Maps yorumu var.

YORUMLAR:
${lines}

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
  const low = reviews.filter((r) => (r.rating || 3) <= 3);
  const high = reviews.filter((r) => (r.rating || 3) >= 4);
  return {
    score,
    summary: `(${locale}) ${businessName}: ${reviews.length} yorumun ortalaması ${avg.toFixed(1)}/5. Mock/heuristic analiz — GOOGLE_AI_API_KEY eklendiğinde GEMMA_MODEL (${GEMMA_MODEL_DEFAULT}) ile gerçek analiz üretilir.`,
    top_complaints: low.slice(0, 3).map((r) => ({
      topic: 'Genel iyileştirme alanı',
      count: Math.max(1, Math.round(low.length / 3)),
      example: r.text.slice(0, 120)
    })),
    top_praises: high.slice(0, 2).map((r) => ({
      topic: 'Müşteri memnuniyeti',
      count: Math.max(1, Math.round(high.length / 2)),
      example: r.text.slice(0, 120)
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
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        generationConfig: { responseMimeType: 'application/json', temperature: 0.3 },
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    }
  );
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemma hatası (${res.status}): ${t.slice(0, 300)}`);
  }
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
