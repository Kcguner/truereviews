/** Admin/test yetkilendirmesi.
 *
 * TEK yetkilendirme yolu sunucu tarafındaki gizli anahtardır:
 *   ADMIN_BYPASS_TOKEN=<rastgele uzun değer>
 * Anahtar istek gövdesindeki `adminKey` ya da `x-admin-key` başlığından gelir
 * ve `isAdminBypass()` içinde sabit zamanlı (timing-safe) karşılaştırmayla
 * eşleştirilir. Token server-only env'dedir, frontend'e gömülmez; bilen
 * tarayıcısında localStorage'da saklar. KİMSEYLE PAYLAŞILMAMALIDIR.
 *
 * `getAdminEmails` / `isAdminEmail` YETKİLENDİRME MEKANİZMASI DEĞİLDİR.
 * Onaylanmamış ve çağıran tarafından seçilebilir bir e-posta üzerinden
 * erişim kapısı açamazlar; yalnızca env listesini okumak/normalleştirmek
 * için yardımcıdır (ve testlerde bu davranışları sınanır). /api/lead artık
 * e-posta listesine bakmaz: tam rapor orada yalnızca `isAdminBypass()` ile
 * açılır, aksi halde herhangi bir `ADMIN_EMAILS` üyesi adına (adresi doğrulanmadan)
 * rapor okuyabilirdi.
 */

import { timingSafeEqual } from 'crypto';

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** @deprecated Yetkilendirme için KULLANILMAZ (bkz. dosya başlığı). */
export function isAdminEmail(email: string): boolean {
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return getAdminEmails().includes(norm);
}

/** Uzunluk farkında timingSafeEqual'in patlamaması için eşit-uzunluk kontrolü.
 *  Farklı uzunluklar zaten eşleşme olamaz; aynı uzunluktaki byte dizileri
 *  sabit zamanlı karşılaştırılır (zamanlama sızıntısı kapatılır). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Kota/limit muafiyeti + test için gizli anahtar (sadece sunucu).
 *  ADMIN_BYPASS_TOKEN tanımlıysa ve istekteki değerle birebir eşleşirse
 *  /api/analyze'taki rate-limit + günlük kota uygulanmaz ve sayaç işletilmez.
 *  /api/lead ise bu anahtarla doğrulama e-postasını atlayıp tam raporu döner. */
export function isAdminBypass(provided: string | null | undefined): boolean {
  const token = process.env.ADMIN_BYPASS_TOKEN || '';
  if (!token) return false;
  if (!provided) return false;
  return safeEqual(provided, token);
}
