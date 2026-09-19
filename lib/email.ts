import { warnProdOnce } from './env-guard';

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

const PLACEHOLDER_FROM = 'rapor@ornek.com';

export async function sendDoubleOptInEmail(
  to: string,
  verifyUrl: string,
  locale: string
): Promise<{ mocked: boolean; id?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  // Mock mod: e-posta gönderilmez, link loglanır + API yanıtında devPreviewUrl döner.
  if (!apiKey) {
    warnProdOnce(
      'resend-mock',
      'RESEND_API_KEY tanımlı değil — üretimde MOCK e-posta modundasınız, leadler e-posta almaz!'
    );
    console.log(`[MOCK-EMAIL] to=${to} locale=${locale} verifyUrl=${verifyUrl}`);
    return { mocked: true };
  }

  // Anahtar varken placeholder göndericiyle mail atmak deliverability'yi öldürür:
  // sessizce devam etmek yerine yüksek sesle patla.
  if (!from || from.includes('ornek.com') || from.includes(PLACEHOLDER_FROM)) {
    throw new Error(
      'RESEND_FROM eksik ya da placeholder (rapor@ornek.com). Resend dashboardda domain doğrulayıp gerçek gönderici adresini tanımlayın.'
    );
  }

  const { Resend } = await import('resend');
  const resend = new Resend(apiKey);
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject: 'Raporunuz hazır — e-postanızı onaylayın',
    html: `<p>Merhaba,</p><p>Yorum analiz raporunuz hazır. Tam raporu görmek için aşağıdaki linke tıklayın:</p><p><a href="${verifyUrl}">Raporu Aç</a></p><p>Bu link 48 saat geçerlidir.</p>`
  });
  if (error) throw new Error(`Resend hatası: ${error.message}`);
  return { mocked: false, id: data?.id };
}
