import { describe, expect, it } from 'vitest';
import { sendDoubleOptInEmail } from '../lib/email';

describe('sendDoubleOptInEmail', () => {
  it('anahtar yoksa mock moda düşer', async () => {
    delete process.env.BREVO_API_KEY;
    await expect(sendDoubleOptInEmail('a@b.co', 'http://x/y?token=t', 'tr')).resolves.toEqual({
      mocked: true
    });
  });
  it('anahtar varken geçersiz FROM ile açıkça patlar', async () => {
    process.env.BREVO_API_KEY = 'xkeysib-test';
    process.env.BREVO_FROM = 'Test <rapor@ornek.com>';
    await expect(sendDoubleOptInEmail('a@b.co', 'http://x/y', 'tr')).rejects.toThrow(/BREVO_FROM/);
    delete process.env.BREVO_API_KEY;
    delete process.env.BREVO_FROM;
  });
});
