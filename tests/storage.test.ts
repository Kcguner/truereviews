import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

// DİKKAT: Vitest `.env`/`.env.local` dosyalarını yükler. `UPSTASH_REDIS_REST_*`
// tanımlıysa (`.env.example` bunları istediği için tanımlı olması OLASI) bu
// testler GERÇEK Redis'e yazar: `ya:report:*` / `ya:token:*` anahtarları
// kalıcı veri, `ya:q:*` sayaçları gerçek kotadan düşer ve `rate_limited`
// iddiası ortamın kotasına göre değişir. Env'ler `beforeAll`'da SİLİNİR
// (tests/quota.test.ts ile aynı yaklaşım) ve IP SABİTTİR: `Math.random()` bir
// sonraki koşuda limit dolmuş bir IP'ye denk gelip testi kırıyordu.
const ENV_KEYS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'DAILY_NEW_ANALYSIS_LIMIT',
  'DAILY_PER_IP_ANALYSIS_LIMIT',
  'RATE_LIMIT_PER_HOUR',
  'REQUEST_LIMIT_PER_HOUR',
  'CACHE_TTL_HOURS'
] as const;

const savedEnv: Record<string, string | undefined> = {};

/** RFC 5737 test ağı: gerçek bir IP değil, üstelik Redis'e gidilmiyor. */
const IP = '203.0.113.9';

beforeAll(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

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
  it('token TTL içinde idempotenttir (çift tıklama/yenileme patlamaz)', async () => {
    const token = await createVerificationToken('rep-1', 'a@b.co');
    await expect(consumeVerificationToken(token)).resolves.toEqual({
      report_id: 'rep-1',
      email: 'a@b.co'
    });
    await expect(consumeVerificationToken(token)).resolves.toEqual({
      report_id: 'rep-1',
      email: 'a@b.co'
    });
    await expect(consumeVerificationToken('yok-boyle-token')).resolves.toBeNull();
  });
  it('indexPlace:false raporu id ile verir ama önbelleğe sokmaz', async () => {
    const saved = await saveReport({
      place_url: 'https://maps.test/mock',
      place_key: 'test-place-mock',
      business_name: 'Mock',
      reviews: [],
      full_report: {
        score: 5,
        summary: 's',
        top_complaints: [],
        top_praises: [],
        action_suggestion: 'a',
        review_count: 0,
        business_name: 'Mock'
      },
      preview: { score: 5, teaser: 't', business_name: 'Mock', review_count: 0 },
      locale: 'tr',
      mocked: true,
      indexPlace: false
    });
    await expect(getReportById(saved.id)).resolves.toMatchObject({ id: saved.id });
    await expect(findCachedReport('test-place-mock', 'tr')).resolves.toBeNull();
  });
  it('upsertLead e-posta servisi yokken patlamaz', async () => {
    await expect(upsertLead('lead@test.co', 'rep-1', 'tr', false)).resolves.toBeUndefined();
  });
});
