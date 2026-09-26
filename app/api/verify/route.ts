import { NextRequest, NextResponse } from 'next/server';
import { consumeVerificationToken, getReportById, markReportUnlocked, upsertLead } from '@/lib/store';
import { reserveRequest } from '@/lib/quota';
import { isAdminBypass } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** `/api/analyze` ile birebir aynı IP çıkarma kuralı (sayaç anahtarına girecek
 *  karakterleri ayıklayıp uzunluğu sınırlarız). Sayaç `ya:q:req:<ip>` altında
 *  İKİ route tarafından da paylaşıldığı için kuralın farklılaşması, bir IP'yi
 *  iki kat saymak (ya da saymamak) demektir. */
function clientIp(req: NextRequest): string {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '';
  const ip = raw.replace(/[^0-9a-fA-F.:_]/g, '').slice(0, 45);
  return ip || 'unknown';
}

/**
 * Doğrulama tokenı 64 hex karakterdir (iki `randomUUID`, tireler atılmış —
 * `lib/store.ts createVerificationToken`). Biçimi tutmayan bir token için
 * Redis'e hiç gidilmez: hem kazıyı ucuzlatır hem de "token yanlış" ile
 * "token biçimsiz" ayrımının zaman farkı yaratmasını engeller.
 */
const TOKEN_RE = /^[0-9a-f]{64}$/i;

export async function GET(req: NextRequest) {
  try {
    const token = new URL(req.url).searchParams.get('token') || '';
    if (!token) return NextResponse.json({ error: 'missing_token' }, { status: 400 });
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json(
        { error: 'invalid_or_expired', message: 'Onay linki geçersiz veya süresi dolmuş.' },
        { status: 400 }
      );
    }

    // GÜVENLİK: bu route TAM RAPORU döndürür, yani deneme (brute-force)
    // tarafı burasıdır. Token 64 hex olduğu için tahmin yazgınları çok
    // büyüktür ama "çok büyük" bir çabayı durdurmaz: IP başına saatlik istek
    // tavanı devreye girer. Aynı sayaç /api/analyze'in kullandığı
    // `ya:q:req:<ip>` sayacıdır (REQUEST_LIMIT_PER_HOUR, varsayılan 60), yani
    // tavan iki route'un toplamıdır — saldırgan bu ikisini birlikte
    // çalıştırarak tavanı esnetemez.
    // Not: Timing-safe karşılaştırma burada ANLAMSIZ: karşılaştırılacak gizli
    // bir sabit yok, token bir sözlük anahtarı olarak REDIS'te aranıyor
    // (düz metin eşitliği `===` ile yapılmıyor). Zamanlama sızıntısını
    // kapatacak yer sabiti `ADMIN_BYPASS_TOKEN`'dır; o `lib/admin.ts`in
    // `isAdminBypass()`'ında zaten `timingSafeEqual` ile karşılaştırılıyor.
    const admin = isAdminBypass(req.headers.get('x-admin-key'));
    if (!admin) {
      const request = await reserveRequest(clientIp(req));
      if (!request.ok) {
        // Hata şekli ve mesajı /api/analyze ile aynı (API sözleşmesi).
        return NextResponse.json(
          { error: request.reason, message: 'Çok sık denediniz, 1 saat sonra tekrar deneyin.' },
          { status: 429 }
        );
      }
    }

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
      report: report.full_report,
      businessName: report.business_name,
      // `review_count` bu alan eklenmeden önce yazılmış eski satırlarda
      // eksik olabilir: saklanan yorum sayısına düş (cast gerekmiyor,
      // `full_report` tipli).
      reviewCount: report.full_report.review_count ?? report.reviews.length,
      createdAt: report.created_at
    });
  } catch (e) {
    console.error('verify error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
