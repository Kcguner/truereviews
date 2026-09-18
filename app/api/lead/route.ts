import { NextRequest, NextResponse } from 'next/server';
import { getReportById, upsertLead, createVerificationToken } from '@/lib/store';
import { isValidEmailFormat, isDisposableEmail, verifyTurnstile } from '@/lib/validation';
import { sendDoubleOptInEmail } from '@/lib/email';
import { locales } from '@/i18n.config';

function baseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
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
    if (!report) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const token = await createVerificationToken(reportId, email);
    await upsertLead(email, reportId, locale, false);

    const verifyUrl = `${baseUrl(req)}/${locale}/rapor?token=${encodeURIComponent(token)}`;
    const sent = await sendDoubleOptInEmail(email, verifyUrl, locale);

    return NextResponse.json({
      ok: true,
      // Sıkı double opt-in: rapor linki SADECE e-posta onayından sonra açılır.
      // Mock modda (RESEND yoksa) onay linki yanıtta devPreviewUrl olarak da döner.
      ...(sent.mocked ? { devPreviewUrl: verifyUrl, mockEmail: true } : {})
    });
  } catch (e) {
    console.error('lead error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
