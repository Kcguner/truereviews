import { NextRequest, NextResponse } from 'next/server';
import { getReportById, upsertLead, createVerificationToken, markReportUnlocked } from '@/lib/store';
import { isValidEmailFormat, isDisposableEmail, verifyTurnstile } from '@/lib/validation';
import { isAdminBypass } from '@/lib/admin';
import { sendDoubleOptInEmail } from '@/lib/email';
import { locales } from '@/i18n.config';

const DEV_BASE_URL = 'http://localhost:3000';

/** Doğrulama linkinin taban adresi: YALNIZCA sunucu tarafındaki APP_URL.
 *
 *  GÜVENLİK: Taban adres hiçbir istek başlığından (`Origin`, `Host`, `Referer`,
 *  `X-Forwarded-Host` …) türetilmez. Aksi halde saldırgan `Origin:
 *  https://attacker.com` gönderip 48 saatlik doğrulama token'ını kendi
 *  domainindeki linke yönlendirebilirdi (open redirect → token hırsızlığı).
 *
 *  APP_URL bozuk/eksikse istek başlığına DÜŞÜLMEZ: üretimde hata fırlatılır
 *  (fail-closed → 500 server_error), geliştirmede localhost'a düşülür ki lokal
 *  akış çalışsın. Geri dönüş değeri mutlaka düz (path'siz ya da basePath'li)
 *  bir http(s) origin'dir; sondaki '/'ler atılmış hâlde döner. */
function resolveBaseUrl(): string {
  const isProd = process.env.NODE_ENV === 'production';
  const raw = (process.env.APP_URL || '').trim();

  if (!raw) {
    if (isProd) {
      throw new Error(
        'APP_URL tanımlı değil — doğrulama linki güvenli biçimde üretilemiyor (istek başlığına düşmek yerine hata verildi).'
      );
    }
    return DEV_BASE_URL;
  }
  if (/[\s\u0000-\u001f\u007f]/.test(raw)) {
    throw new Error('APP_URL geçersiz: boşluk/kontrol karakteri içeriyor.');
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('APP_URL geçersiz: mutlak bir URL değil.');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`APP_URL geçersiz: sadece http(s) şeması kabul edilir (verilen: ${parsed.protocol}).`);
  }
  if (isProd && parsed.protocol !== 'https:') {
    throw new Error('APP_URL geçersiz: üretimde https zorunlu.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('APP_URL geçersiz: kimlik bilgisi (user:pass) içeremez.');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('APP_URL geçersiz: query/fragment içeremez.');
  }
  if (!parsed.hostname) throw new Error('APP_URL geçersiz: host boş.');

  return parsed.toString().replace(/\/+$/, '');
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      reportId?: string;
      email?: string;
      locale?: string;
      turnstileToken?: string;
      adminKey?: string;
    } | null;
    const reportId = (body?.reportId || '').trim();
    const email = (body?.email || '').trim().toLowerCase();
    const locale = locales.includes(body?.locale as (typeof locales)[number])
      ? (body?.locale as string)
      : 'tr';

    if (!reportId) return NextResponse.json({ error: 'missing_report' }, { status: 400 });
    if (!isValidEmailFormat(email))
      return NextResponse.json({ error: 'invalid_email', message: 'Geçerli bir e-posta girin.' }, { status: 400 });
    if (isDisposableEmail(email))
      return NextResponse.json(
        { error: 'disposable_email', message: 'Geçici e-posta adresleri kabul edilmiyor.' },
        { status: 400 }
      );

    const ip = clientIp(req);
    // GÜVENLİK: Yetki YALNIZCA sunucu tarafındaki gizli anahtardan (ADMIN_BYPASS_TOKEN)
    // gelir; gövdedeki `email` doğrulanmamış ve çağıran tarafından seçilebilir olduğu
    // için asla yetkilendirme ölçütü olamaz. /api/analyze ile aynı sözleşme.
    const admin = isAdminBypass(body?.adminKey || req.headers.get('x-admin-key'));
    if (!(await verifyTurnstile(body?.turnstileToken || null, ip))) {
      return NextResponse.json({ error: 'bot_check_failed' }, { status: 403 });
    }

    const report = await getReportById(reportId);
    if (!report)
      return NextResponse.json(
        { error: 'not_found', message: 'Rapor bulunamadı — sayfayı yenileyip linki tekrar analiz edin.' },
        { status: 404 }
      );

    // Admin/test kolaylığı: sunucu anahtarı (ADMIN_BYPASS_TOKEN) doğrulanmışsa onay
    // e-postası beklemez, tam rapor yanıtta hemen döner (yeni Apify/Gemma çağrısı YOK).
    if (admin) {
      await markReportUnlocked(report.id, email);
      await upsertLead(email, report.id, locale, true);
      return NextResponse.json({
        ok: true,
        adminBypass: true,
        report: (report as unknown as { full_report: unknown }).full_report,
        businessName: report.business_name,
        reviewCount:
          (report.full_report as unknown as { review_count?: number }).review_count ?? report.reviews.length
      });
    }

    // Taban adres yalnızca APP_URL'den; hatalı/eksikse istek başlığına düşülmez.
    // YAN ETKİ YAZMADAN ÖNCE çözülür: aksi halde token üretilip lead yazıldıktan
    // SONRA hata dönüp kullanıcıya 500 gider, ama lead kaydı ve orphan token kalırdı.
    let base: string;
    try {
      base = resolveBaseUrl();
    } catch (e) {
      console.error('lead base url error', e);
      return NextResponse.json({ error: 'server_error' }, { status: 500 });
    }

    const token = await createVerificationToken(reportId, email);

    const verifyUrl = `${base}/${locale}/rapor?token=${encodeURIComponent(token)}`;
    const sent = await sendDoubleOptInEmail(email, verifyUrl, locale);

    // Lead yalnızca e-posta gönderilebildiğinde kaydedilir: Brevo hata verirse
    // kullanıcı yeniden deneyebilsin, ama "doğrulanmamış lead" birikmesin.
    await upsertLead(email, reportId, locale, false);

    // Sıkı double opt-in: rapor linki SADECE e-posta onayından sonra açılır.
    // Mock link (token'ı taşıyan doğrulama URL'si) üretimde ASLA dönmez —
    // lib/email.ts üretimde anahtarsızsa zaten hata fırlatır; bu ikinci katman.
    const exposePreview = sent.mocked && process.env.NODE_ENV !== 'production';
    return NextResponse.json({
      ok: true,
      ...(exposePreview ? { devPreviewUrl: verifyUrl, mockEmail: true } : {})
    });
  } catch (e) {
    console.error('lead error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
