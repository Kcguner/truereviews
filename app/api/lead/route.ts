import { NextRequest, NextResponse } from 'next/server';
import { getReportById, upsertLead, createVerificationToken, markReportUnlocked } from '@/lib/store';
import { isValidEmailFormat, isDisposableEmail, verifyTurnstile } from '@/lib/validation';
import { isAdminEmail } from '@/lib/admin';
import { sendDoubleOptInEmail } from '@/lib/email';
import { locales } from '@/i18n.config';

function baseUrl(req: NextRequest): string {
  return (
    process.env.APP_URL ||
    req.headers.get('origin') ||
    'http://localhost:3000'
  ).replace(/\/+$/, '');
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      reportId?: string;
      email?: string;
      locale?: string;
      turnstileToken?: string;
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

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!(await verifyTurnstile(body?.turnstileToken || null, ip))) {
      return NextResponse.json({ error: 'bot_check_failed' }, { status: 403 });
    }

    const report = await getReportById(reportId);
    if (!report)
      return NextResponse.json(
        { error: 'not_found', message: 'Rapor bulunamadı — sayfayı yenileyip linki tekrar analiz edin.' },
        { status: 404 }
      );

    // Admin/test kolaylığı: ADMIN_EMAILS'teki adres onay e-postası beklemez,
    // tam rapor yanıtta hemen döner (yeni Apify/Gemma çağrısı YOK).
    if (isAdminEmail(email)) {
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

    const token = await createVerificationToken(reportId, email);
    await upsertLead(email, reportId, locale, false);

    const verifyUrl = `${baseUrl(req)}/${locale}/rapor?token=${encodeURIComponent(token)}`;
    const sent = await sendDoubleOptInEmail(email, verifyUrl, locale);

    return NextResponse.json({
      ok: true,
      // Sıkı double opt-in: rapor linki SADECE e-posta onayından sonra açılır.
      // Mock modda (SENDGRID yoksa) onay linki yanıtta devPreviewUrl olarak da döner.
      ...(sent.mocked ? { devPreviewUrl: verifyUrl, mockEmail: true } : {})
    });
  } catch (e) {
    console.error('lead error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
