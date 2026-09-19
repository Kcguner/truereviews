import { warnProdOnce } from './env-guard';

export function isEmailConfigured(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
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
    // eslint-disable-next-line no-console
    console.log(`[MOCK-EMAIL] to=${to} locale=${locale} verifyUrl=${verifyUrl}`);
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

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject: 'Raporunuz hazır — e-postanızı onaylayın',
      htmlContent: `<p>Merhaba,</p><p>Yorum analiz raporunuz hazır. Tam raporu görmek için aşağıdaki linke tıklayın:</p><p><a href="${verifyUrl}">Raporu Aç</a></p><p>Bu link 48 saat geçerlidir.</p>`
    })
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Brevo hatası (${res.status}): ${t.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as { messageId?: string };
  return { mocked: false, id: data.messageId };
}
