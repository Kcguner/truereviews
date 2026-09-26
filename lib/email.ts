import { warnProdOnce } from './env-guard';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
}

/** HTML kaçışı: e-posta GÖVDESİNE giren her dinamik değer bununla sarılır.
 *  (JSON alanlarına giren değerler — to/from — kaçırılmaz, biçimleri doğrulanır.) */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Log/HTML içeriğinde doğrulama token'ını gizler: token tek kullanımlık değil
 *  ve 48 saat geçerli; loglara (ya da ekrana) düşerse rapor ele geçirilebilir. */
function redactToken(url: string): string {
  return url.replace(/([?&](?:token|tk)=)[^&#]*/gi, '$1[REDACTED]');
}

function parseFrom(raw: string): { name: string; email: string } | null {
  const m = raw.match(/^(.*)<([^<>@\s]+@[^<>@\s]+)>\s*$/);
  if (m) return { name: m[1].trim().replace(/^["']|["']$/g, '') || 'TrueReviews', email: m[2].trim() };
  const email = raw.trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { name: 'TrueReviews', email };
  return null;
}

export async function sendDoubleOptInEmail(
  to: string,
  verifyUrl: string,
  locale: string
): Promise<{ mocked: boolean; id?: string }> {
  const apiKey = process.env.BREVO_API_KEY;
  const fromRaw = process.env.BREVO_FROM;

  // Mock mod: e-posta gönderilmez, link loglanır + API yanıtında devPreviewUrl döner.
  if (!apiKey) {
    warnProdOnce(
      'email-mock',
      'BREVO_API_KEY tanımlı değil — üretimde MOCK e-posta modundasınız, leadler e-posta almaz!'
    );
    // Token loglanmaz (rapor ele geçirilebilir): linkin şeması/host'u korunur, gizli kısım maskelenir.
    // eslint-disable-next-line no-console
    console.log(`[MOCK-EMAIL] to=${to} locale=${locale} verifyUrl=${redactToken(verifyUrl)}`);
    // GÜVENLİK: Doğrulama linki 48 saat geçerli ve TEK KULLANIMLI DEĞİL
    // (lib/store.ts consumeVerificationToken idempotenttir). Üretimde anahtar
    // yoksa linki çağırıya döndürmek, double opt-in'i e-posta sahipliği
    // doğrulanmadan atlatmak demektir. Bu yüzden üretimde fail-closed:
    // mock link YALNIZCA geliştirme ortamında döner.
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'BREVO_API_KEY tanımlı değil — doğrulama e-postası gönderilemiyor, üretimde mock link döndürülemez.'
      );
    }
    return { mocked: true };
  }

  // Doğrulanmamış/placeholder göndericiyle atım deliverability'yi öldürür:
  // sessizce devam etmek yerine yüksek sesle patla.
  const sender = fromRaw ? parseFrom(fromRaw) : null;
  if (!sender || /ornek\.com|example\.com/i.test(sender.email)) {
    throw new Error(
      'BREVO_FROM eksik ya da geçersiz (örn. "TrueReviews <adresin@gmail.com>"). Brevo → Senders bölümünde adresinizi doğrulayıp env olarak tanımlayın.'
    );
  }

  // `to` gövdeye JSON olarak gider (HTML değil) — bu yüzden HTML kaçışı
  // UYGULANMAZ (kaçış e-posta adresini bozardı); bunun yerine biçim doğrulanır.
  const toAddr = to.trim();
  if (!/^[^<>\s"']+@[^<>\s"']+\.[^<>\s"']+$/.test(toAddr)) {
    throw new Error('Geçersiz alıcı e-posta adresi (beklenmeyen veri) — gönderim iptal edildi.');
  }

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: toAddr }],
      // Konu statik metindir; gövdedeki tek dinamik alan `verifyUrl` — HTML kaçışı şart.
      subject: 'Raporunuz hazır — e-postanızı onaylayın',
      htmlContent: `<p>Merhaba,</p><p>Yorum analiz raporunuz hazır. Tam raporu görmek için aşağıdaki linke tıklayın:</p><p><a href="${escapeHtml(verifyUrl)}">Raporu Aç</a></p><p>Bu link 48 saat geçerlidir.</p>`
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Brevo hatası (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { mocked: false, id: data.messageId };
}
