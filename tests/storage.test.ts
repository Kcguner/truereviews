import { describe, expect, it } from 'vitest';
import { checkQuota, logUsage } from '../lib/quota';
import {
  consumeVerificationToken,
  createVerificationToken,
  findCachedReport,
  getReportById,
  markReportUnlocked,
  saveReport,
  upsertLead
} from '../lib/store';

// Redis bağlı değilse memory fallback çalışır — CI'da env yok, bu yol test edilir.
const IP = `9.9.9.${Math.floor(Math.random() * 200) + 10}`;

describe('quota (memory fallback)', () => {
  it('temiz IP kotayı geçer', async () => {
    await expect(checkQuota(IP)).resolves.toEqual({ ok: true });
  });
  it('saatlik limit dolunca rate_limited döner', async () => {
    await logUsage(IP, 'place-a');
    await logUsage(IP, 'place-a');
    await expect(checkQuota(IP)).resolves.toEqual({ ok: false, reason: 'rate_limited' });
  });
});

describe('store (memory fallback)', () => {
  it('rapor kaydet → id ile getir → place önbelleği vurur', async () => {
    const saved = await saveReport({
      place_url: 'https://maps.test/x',
      place_key: 'test-place-x',
      business_name: 'Test',
      reviews: [],
      full_report: {
        score: 7,
        summary: 's',
        top_complaints: [],
        top_praises: [],
        action_suggestion: 'a',
        review_count: 0,
        business_name: 'Test'
      },
      preview: { score: 7, teaser: 't', business_name: 'Test', review_count: 0 },
      locale: 'tr',
      mocked: true
    });
    await expect(getReportById(saved.id)).resolves.toMatchObject({ id: saved.id });
    await expect(findCachedReport('test-place-x', 'tr')).resolves.toMatchObject({ id: saved.id });
    await markReportUnlocked(saved.id, 'a@b.co');
    await expect(getReportById(saved.id)).resolves.toMatchObject({ email_unlocked: 'a@b.co' });
  });
  it('token tek kullanımlıktır', async () => {
    const token = await createVerificationToken('rep-1', 'a@b.co');
    await expect(consumeVerificationToken(token)).resolves.toEqual({
      report_id: 'rep-1',
      email: 'a@b.co'
    });
    await expect(consumeVerificationToken(token)).resolves.toBeNull();
    await expect(consumeVerificationToken('yok-boyle-token')).resolves.toBeNull();
  });
  it('upsertLead e-posta servisi yokken patlamaz', async () => {
    await expect(upsertLead('lead@test.co', 'rep-1', 'tr', false)).resolves.toBeUndefined();
  });
});
