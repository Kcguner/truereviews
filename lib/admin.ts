/** Test/admin kolaylığı: double opt-in beklemeden raporu anında açan e-postalar.
 *
 * Kullanım (.env.local / Vercel env):
 *   ADMIN_EMAILS=senin@mail.com,ekip@mail.com
 *
 * Bu listedeki bir adres /api/lead'e gönderildiğinde onay e-postası
 * beklenmez; tam rapor yanıtta hemen döner. Normal kullanıcı akışı
 * (double opt-in) değişmez. Üretimde listeyi küçük tutun.
 */

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS || '';
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return getAdminEmails().includes(norm);
}

/** Kota/limit muafiyeti için gizli anahtar (sadece test).
 *  ADMIN_BYPASS_TOKEN tanımlıysa ve istekteki değerle birebir eşleşirse
 *  /api/analyze'taki rate-limit + günlük kota uygulanmaz ve sayaç işletilmez.
 *  Token server-only env'dedir, frontend'e gömülmez; bilen tarayıcısında
 *  localStorage'da saklar. Kimseyle paylaşılmamalı. */
export function isAdminBypass(provided: string | null | undefined): boolean {
  const token = process.env.ADMIN_BYPASS_TOKEN || '';
  if (!token) return false;
  return !!provided && provided === token;
}
