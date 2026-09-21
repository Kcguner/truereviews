export interface ScrapedReview {
  text: string;
  rating: number;
  author?: string;
}

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

export async function fetchReviews(
  placeUrl: string,
  maxReviews: number,
  language = 'tr'
): Promise<{ reviews: ScrapedReview[]; businessName: string; mocked: boolean }> {
  const token = process.env.APIFY_API_TOKEN;
  const actorId = process.env.APIFY_ACTOR_ID || 'compass/google-maps-reviews-scraper';

  if (!token) {
    return {
      reviews: mockReviews(placeUrl, maxReviews),
      businessName: mockBusinessName(placeUrl),
      mocked: true
    };
  }

  // Gerçek Apify çağrısı: actor'ü senkron çalıştır, dataset items'ları al.
  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startUrls: [{ url: placeUrl }],
        maxReviews,
        reviewsSort: 'newest',
        language
      })
    }
  );
  if (!runRes.ok) {
    const t = await runRes.text().catch(() => '');
    throw new Error(`Apify hatası (${runRes.status}): ${t.slice(0, 300)}`);
  }
  const items = (await runRes.json()) as Record<string, unknown>[];
  const reviews: ScrapedReview[] = [];
  let businessName = mockBusinessName(placeUrl);
  for (const it of items) {
    const arr = Array.isArray(it.reviews) ? (it.reviews as Record<string, unknown>[]) : [it];
    if (typeof it.title === 'string' && it.title) businessName = it.title;
    for (const r of arr) {
      const text =
        (r.text as string) || (r.reviewText as string) || (r.comment as string) || '';
      const rating = Number(r.stars ?? r.rating ?? r.score ?? 0) || 0;
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
