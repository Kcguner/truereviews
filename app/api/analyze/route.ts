import { NextRequest, NextResponse } from 'next/server';
import { fetchReviews } from '@/lib/apify';
import { analyzeReviews } from '@/lib/gemma';
import { findCachedReport, saveReport } from '@/lib/store';
import { normalizePlaceUrl, isGoogleMapsUrl, type PreviewData, type ToneSplit } from '@/lib/types';
import { checkQuota, logUsage } from '@/lib/quota';
import { verifyTurnstile } from '@/lib/validation';
import { locales } from '@/i18n.config';

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function toneSplit(ratings: number[]): ToneSplit {
  const total = Math.max(ratings.length, 1);
  const pos = ratings.filter((r) => (r || 3) >= 4).length;
  const neg = ratings.filter((r) => (r || 3) <= 2).length;
  const posPct = Math.round((pos / total) * 100);
  const negPct = Math.round((neg / total) * 100);
  return { pos: posPct, neu: Math.max(0, 100 - posPct - negPct), neg: negPct };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      placeUrl?: string;
      locale?: string;
      turnstileToken?: string;
    } | null;
    const placeUrl = (body?.placeUrl || '').trim();
    const locale = locales.includes(body?.locale as (typeof locales)[number])
      ? (body?.locale as string)
      : 'tr';

    if (!placeUrl || !isGoogleMapsUrl(placeUrl)) {
      return NextResponse.json(
        { error: 'invalid_url', message: 'Geçerli bir Google Maps işletme linki yapıştırın.' },
        { status: 400 }
      );
    }

    const ip = clientIp(req);
    const turnstileOk = await verifyTurnstile(body?.turnstileToken || null, ip);
    if (!turnstileOk) {
      return NextResponse.json(
        { error: 'bot_check_failed', message: 'Bot doğrulaması başarısız, tekrar deneyin.' },
        { status: 403 }
      );
    }

    const quota = await checkQuota(ip);
    if (!quota.ok) {
      const msg =
        quota.reason === 'daily_quota_exceeded'
          ? 'Günlük analiz kotası doldu, yarın tekrar deneyin.'
          : 'Çok sık denediniz, 1 saat sonra tekrar deneyin.';
      return NextResponse.json({ error: quota.reason, message: msg }, { status: 429 });
    }

    const placeKey = normalizePlaceUrl(placeUrl);

    // 24s cache: aynı link + dil için Apify/Gemma'ya tekrar gitme
    const cached = await findCachedReport(placeKey, locale);
    if (cached) {
      return NextResponse.json({
        reportId: cached.id,
        preview: cached.preview,
        cached: true,
        mocked: (cached as unknown as { mocked?: boolean }).mocked ?? true
      });
    }

    const maxReviews = Math.min(Number(process.env.MAX_REVIEWS || 20), 50);
    // Kullanıcının dili Apify'a aktarılır (yorum arayüz/çeviri dili için);
    // actor tanımadığı kodu varsayılana düşürür, analiz dili zaten Gemma'da üretilir.
    const apifyLanguage = ['tr', 'en', 'de', 'ar', 'ru', 'fr', 'es', 'nl'].includes(locale)
      ? locale
      : 'en';
    const { reviews, businessName, mocked: apifyMocked } = await fetchReviews(
      placeUrl,
      maxReviews,
      apifyLanguage
    );
    if (reviews.length === 0) {
      return NextResponse.json(
        { error: 'no_reviews', message: 'Bu işletme için yorum bulunamadı.' },
        { status: 404 }
      );
    }

    const { report, mocked: gemmaMocked } = await analyzeReviews(businessName, reviews, locale);

    // Puan dağılımı → ton yüzdeleri (önizlemede ve raporda ton çubuğu için; toplu istatistik, hassas veri değil)
    const tone = toneSplit(reviews.map((r) => r.rating));
    report.rating_histogram = tone;

    const preview: PreviewData = {
      score: report.score,
      teaser: report.summary.split('.').slice(0, 1).join('.') + '.',
      business_name: businessName,
      review_count: reviews.length,
      tone
    };

    const stored = await saveReport({
      place_url: placeUrl,
      place_key: placeKey,
      business_name: businessName,
      reviews: reviews.map((r) => ({ text: r.text, rating: r.rating, author: r.author })),
      full_report: report,
      preview,
      locale,
      mocked: apifyMocked || gemmaMocked
    });

    await logUsage(ip, placeKey);

    // GÜVENLİK: frontend'e SADECE önizleme + reportId döner, tam rapor asla dönmez.
    return NextResponse.json({
      reportId: stored.id,
      preview,
      cached: false,
      mocked: apifyMocked || gemmaMocked
    });
  } catch (e) {
    console.error('analyze error', e);
    return NextResponse.json(
      { error: 'server_error', message: 'Analiz sırasında hata oluştu, tekrar deneyin.' },
      { status: 500 }
    );
  }
}
