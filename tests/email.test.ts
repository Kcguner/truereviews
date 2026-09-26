import { describe, expect, it, afterEach, vi } from 'vitest';
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

  // Regresyon: token 48 saat geçerli ve tek kullanımlı DEĞİL. Mock modda
  // çağırıya döndürülen devPreviewUrl, e-posta sahipliği doğrulanmadan
  // double opt-in'i atlatıyordu. Üretimde fail-closed olmalı.
  describe('üretim güvenliği: mock link sızdırmaz', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      delete process.env.BREVO_API_KEY;
    });

    it('NODE_ENV=production + anahtar yoksa hata fırlatır (mock link üretilmez)', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.BREVO_API_KEY;
      await expect(
        sendDoubleOptInEmail('a@b.co', 'https://site.test/tr/rapor?token=deadbeef', 'tr')
      ).rejects.toThrow(/BREVO_API_KEY/);
    });

    it('üretimde loglanan mock linkte token maskelenir', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      delete process.env.BREVO_API_KEY;
      const lines: string[] = [];
      const orig = console.log;
      console.log = (...a: unknown[]) => lines.push(a.join(' '));
      try {
        await sendDoubleOptInEmail('a@b.co', 'https://site.test/tr/rapor?token=deadbeef', 'tr').catch(() => {});
      } finally {
        console.log = orig;
      }
      const logged = lines.join('\n');
      expect(logged).not.toContain('deadbeef');
      expect(logged).toContain('REDACTED');
    });
  });
});
