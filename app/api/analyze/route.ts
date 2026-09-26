import { NextRequest, NextResponse } from 'next/server';
import { fetchReviews } from '@/lib/apify';
import { analyzeReviews } from '@/lib/gemma';
import { canonicalPlaceKey, findCachedReport, saveReport } from '@/lib/store';
import { normalizePlaceUrl, isGoogleMapsUrl, type PreviewData, type ToneSplit } from '@/lib/types';
import { buildTeaser, envInt, reserveAnalysis, reserveRequest, type QuotaResult } from '@/lib/quota';
import { isAdminBypass } from '@/lib/admin';
import { verifyTurnstile } from '@/lib/validation';
import { locales } from '@/i18n.config';

/**
 * Vercel varsayılanı (10s) bu route için çok kısa: Apify `run-sync-get-dataset-items`
 * tüm actor süresince (30-120s) bloklar, `analyzeReviews` retry ekler. Fonksiyon
 * ortasında öldürülürse kullanıcı 504 + JSON'suz hata görür, Apify kredisi harcanmış
 * olur ve hiçbir şey saklanmaz. Not: fetch zaman aşımları `lib/apify.ts` ve
 * `lib/gemma.ts` içinde (o dosyalar başka bir turun sahibinde).
 */
export const maxDuration = 60;

function clientIp(req: NextRequest): string {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';
  // Başlık istemciden gelir: sayaç anahtarına (`ya:q:pd:<ip>`) sokulacak
  // karakterleri ayıklayıp uzunluğu sınırlarız.
  const ip = raw.replace(/[^0-9a-fA-F.:_]/g, '').slice(0, 45);
  return ip || 'unknown';
}

function toneSplit(ratings: number[]): ToneSplit {
  const total = Math.max(ratings.length, 1);
  const pos = ratings.filter((r) => (r || 3) >= 4).length;
  const neg = ratings.filter((r) => (r || 3) <= 2).length;
  const posPct = Math.round((pos / total) * 100);
  const negPct = Math.round((neg / total) * 100);
  return { pos: posPct, neu: Math.max(0, 100 - posPct - negPct), neg: negPct };
}

/** Kota reddini kullanıcı mesajına çevirir. `reason` değerleri API sözleşmesidir. */
function quotaResponse(result: QuotaResult): NextResponse {
  const message =
    result.reason === 'daily_quota_exceeded'
      ? 'Günlük analiz kotası doldu, yarın tekrar deneyin.'
      : 'Çok sık denediniz, 1 saat sonra tekrar deneyin.';
  return NextResponse.json({ error: result.reason, message }, { status: 429 });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      placeUrl?: string;
      locale?: string;
      turnstileToken?: string;
      adminKey?: string;
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
    const admin = isAdminBypass(body?.adminKey || req.headers.get('x-admin-key'));
    const turnstileOk = await verifyTurnstile(body?.turnstileToken || null, ip);
    if (!turnstileOk) {
      return NextResponse.json(
        { error: 'bot_check_failed', message: 'Bot doğrulaması başarısız, tekrar deneyin.' },
        { status: 403 }
      );
    }

    // 1) İSTEK tavanı: cache HIT dahil HER istek sayılır. Önceden yalnızca
    //    analiz sayacı vardı ve o yalnızca cache MISS'te artıyordu; yani bir
    //    istemci tek bir cache'li linki sınırsız kez çalıştırabiliyor, üstelik
    //    throttlendikten sonra da aynı linki çalıştırmaya devam edebiliyordu.
    if (!admin) {
      const request = await reserveRequest(ip);
      if (!request.ok) return quotaResponse(request);
    }

    // Sorgu dizesi (`?hl=tr`, `?utm_source=x`, …) önbellek anahtarına girmiyor:
    // aynı işletme her yeni parametrede ücretli bir tur demekti.
    const placeKey = canonicalPlaceKey(placeUrl);
    const legacyPlaceKey = normalizePlaceUrl(placeUrl);

    // 24s cache: aynı link + dil için Apify/Gemma'ya tekrar gitme
    const cached = await findCachedReport(placeKey, locale, legacyPlaceKey);
    if (cached) {
      return NextResponse.json({
        reportId: cached.id,
        preview: cached.preview,
        cached: true,
        // Not: `mocked` StoredReport tipinde beyan değil; store.ts `mocked`'ı
        // tiplenmiş döndürüyor. `?? true` ile gerçek raporu "mock" göstermek artık
        // mümkün değil.
        mocked: cached.mocked,
        ...(admin ? { admin: true } : {})
      });
    }

    // 2) ANALİZ kotası: tek Lua'da kontrol + tüketim, ÜCRETLİ işe girmeden ÖNCE.
    //    (Eski akış: kontrol → Apify → Gemma → artır. Aynı IP'den gelen paralel
    //    istekler aynı sayacı okuyup hepsi geçiyordu.)
    if (!admin) {
      const analysis = await reserveAnalysis(ip, placeKey);
      if (!analysis.ok) return quotaResponse(analysis);
    }

    const maxReviews = envInt('MAX_REVIEWS', 20, { max: 50 });
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
      // İlk cümle + sert karakter bütçesi: noktayla bitmeyen özetler tüm
      // özeti (e-posta duvarının deliği) olarak sızdırmasın.
      teaser: buildTeaser(report.summary),
      business_name: businessName,
      review_count: reviews.length,
      tone
    };

    const mocked = apifyMocked || gemmaMocked;
    const stored = await saveReport({
      place_url: placeUrl,
      place_key: placeKey,
      business_name: businessName,
      reviews: reviews.map((r) => ({ text: r.text, rating: r.rating, author: r.author })),
      full_report: report,
      preview,
      locale,
      mocked,
      // Mock sonuç önbelleğe girmez: aynı link bir dahaki sefere gerçeği dener.
      indexPlace: !mocked
    });

    // GÜVENLİK: frontend'e SADECE önizleme + reportId döner, tam rapor asla dönmez.
    return NextResponse.json({
      reportId: stored.id,
      preview,
      cached: false,
      mocked,
      ...(admin ? { admin: true } : {})
    });
  } catch (e) {
    console.error('analyze error', e);
    return NextResponse.json(
      { error: 'server_error', message: 'Analiz sırasında hata oluştu, tekrar deneyin.' },
      { status: 500 }
    );
  }
}
