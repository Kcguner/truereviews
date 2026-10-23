import { NextRequest, NextResponse } from 'next/server';
import { deleteLeadByEmail } from '@/lib/store';
import { isValidEmailFormat } from '@/lib/validation';
import { isAdminBypass } from '@/lib/admin';

export const dynamic = 'force-dynamic';

/** `/api/verify` ile aynı IP çıkarma kuralı (yalnızca log satırı için). */
function clientIp(req: NextRequest): string {
  const raw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '';
  return raw.replace(/[^0-9a-fA-F.:_]/g, '').slice(0, 45) || 'unknown';
}

/**
 * KVKK m.11 silme talebi — SADECE admin.
 *
 * Kapsam (`lib/store.ts deleteLeadByEmail`): lead hash'i, lead kümesindeki üyelik
 * ve ilişkili raporun `email_unlocked` alanı temizlenir.
 *
 * Kapsam DIŞI (dürüstçe): rapor gövdesi silinmez, `CACHE_TTL_HOURS` ile düşer; aynı
 * adresle açılmış BAŞKA raporların `email_unlocked` alanı yeniden yazılmaz (yalnızca
 * lead hash'inde kayıtlı tek `report_id` ele alınır). Doğrulama token'ları 48 saatlik
 * TTL ile bu çağrıdan bağımsız yaşar.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as {
      email?: string;
      adminKey?: string;
    } | null;
    const email = (body?.email || '').trim().toLowerCase();

    // GÜVENLİK: yıkıcı uç. Yetki yalnızca sunucu tarafındaki gizli anahtardan gelir
    // (gövdedeki `adminKey` ya da `x-admin-key` başlığı). Gövdedeki `email` çağıran
    // tarafından seçilebildiği için asla yetkilendirme ölçütü olamaz.
    // Anahtar yoksa e-posta doğrulamasından ÖNCE reddedilir (geçerlilik sızdırmaz).
    if (!isAdminBypass(body?.adminKey || req.headers.get('x-admin-key'))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!isValidEmailFormat(email))
      return NextResponse.json(
        { error: 'invalid_email', message: 'Geçerli bir e-posta girin.' },
        { status: 400 }
      );

    const deleted = await deleteLeadByEmail(email);
    // E-posta loglanmaz: silinen talebi log'a yeniden yazmak anlamsız olurdu.
    console.log('data-deletion', { ip: clientIp(req), deleted });
    return NextResponse.json({ ok: true, deleted });
  } catch (e) {
    console.error('data-deletion error', e);
    return NextResponse.json({ error: 'server_error' }, { status: 500 });
  }
}
