import { NextRequest, NextResponse } from 'next/server';
import { consumeVerificationToken, getReportById, markReportUnlocked, upsertLead } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });

    const consumed = await consumeVerificationToken(token);
    if (!consumed) {
      return NextResponse.json(
        { error: 'invalid_or_expired', message: 'Onay linki geçersiz veya süresi dolmuş.' },
        { status: 400 }
      );
    }

    const report = await getReportById(consumed.report_id);
    if (!report) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    await markReportUnlocked(report.id, consumed.email);
    await upsertLead(consumed.email, report.id, report.locale, true);

    // Sıkı double opt-in: tam rapor SADECE bu noktada döner. Yeni Apify/Gemma çağrısı YOK.
    return NextResponse.json({
      ok: true,
      email: consumed.email,
      report: (report as unknown as { full_report: unknown }).full_report,
      businessName: report.business_name,
      reviewCount: (report.full_report as unknown as { review_count?: number }).review_count ?? report.reviews.length,
      createdAt: report.created_at
    });
  } catch (e) {
    console.error('verify error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
