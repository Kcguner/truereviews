import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// DİKKAT: Vitest `.env`/`.env.local` dosyalarını yükler. `UPSTASH_REDIS_REST_*`
// tanımlıysa bu testler GERÇEK Redis'e yazar (tests/storage.test.ts'in bilinen
// kusuru). Aşağıda env'ler beforeAll'da SİLİNİR: tüm testler bellek yolunu
// deterministik olarak dener. IP'ler sabittir (Math.random() yok).

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

const IP_ABUSER = '203.0.113.10';
const IP_NORMAL = '203.0.113.20';
const IP_RACE = '203.0.113.30';
const IP_HIT = '203.0.113.40';
const IP_OTHER = '203.0.113.41';
const IP_REDIS_DOWN = '203.0.113.50';
const IP_BROKEN_URL = '203.0.113.51';
/** Farklı, sabit IP'ler (global kotayı tek IP'ye bağlamamak için). */
const spareIp = (i: number) => `198.51.100.${i}`;

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

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock('@upstash/redis');
  vi.resetModules();
});

/** Her test için sıfır bellek durumuyla taze modül örnekleri. */
async function load() {
  vi.resetModules();
  return {
    quota: await import('../lib/quota'),
    store: await import('../lib/store'),
    types: await import('../lib/types')
  };
}

function reportInput(placeKey = 'test-place') {
  return {
    place_url: `https://www.google.com/maps/place/${placeKey}`,
    place_key: placeKey,
    business_name: 'Test Mekan',
    reviews: [{ text: 'iyi', rating: 5 }],
    full_report: {
      score: 7,
      summary: 'Bir cümle. İkinci cümle.',
      top_complaints: [],
      top_praises: [],
      action_suggestion: 'a',
      review_count: 1,
      business_name: 'Test Mekan'
    },
    preview: { score: 7, teaser: 'Bir cümle.', business_name: 'Test Mekan', review_count: 1 },
    locale: 'tr',
    mocked: false
  };
}

describe('envInt: bozuk limitler sınırı sessizce KAPATMAZ', () => {
  it('sayı olmayan / 0 / negatif / boş değerlerde varsayılana döner', async () => {
    const { quota } = await load();
    for (const bad of ['twelve', '0', '-3', '', ' ', '1.5x', 'NaN']) {
      process.env.T_LIMIT_PROBE = bad;
      expect(quota.envInt('T_LIMIT_PROBE', 12)).toBe(12);
    }
    delete process.env.T_LIMIT_PROBE;
    expect(quota.envInt('T_LIMIT_PROBE', 12)).toBe(12);
    process.env.T_LIMIT_PROBE = '5';
    expect(quota.envInt('T_LIMIT_PROBE', 12)).toBe(5);
    process.env.T_LIMIT_PROBE = '900';
    expect(quota.envInt('T_LIMIT_PROBE', 12, { max: 100 })).toBe(100);
    delete process.env.T_LIMIT_PROBE;
  });

  it('NaN global limit ile günlük kota yine de 12 analizde durur', async () => {
    // ESKİ DAVRANIŞ: Number('twelve') = NaN → `count >= NaN` hep false → kota yok sayılırdı.
    process.env.DAILY_NEW_ANALYSIS_LIMIT = 'twelve';
    process.env.DAILY_PER_IP_ANALYSIS_LIMIT = '99';
    process.env.RATE_LIMIT_PER_HOUR = '99';
    const { quota } = await load();
    for (let i = 1; i <= 12; i += 1) {
      await expect(quota.reserveAnalysis(spareIp(i), 'place')).resolves.toEqual({ ok: true });
    }
    await expect(quota.reserveAnalysis(spareIp(99), 'place')).resolves.toEqual({
      ok: false,
      reason: 'daily_quota_exceeded'
    });
  });
});

describe('kota: global günlük + IP günlük + IP saatlik', () => {
  it('global bütçe tek bir istemci tarafından tüketilemez (IP günlük sınırı)', async () => {
    process.env.DAILY_NEW_ANALYSIS_LIMIT = '12';
    process.env.DAILY_PER_IP_ANALYSIS_LIMIT = '3';
    process.env.RATE_LIMIT_PER_HOUR = '99';
    const { quota } = await load();

    for (let i = 0; i < 3; i += 1) {
      await expect(quota.reserveAnalysis(IP_ABUSER, `place-${i}`)).resolves.toEqual({ ok: true });
    }
    await expect(quota.reserveAnalysis(IP_ABUSER, 'place-4')).resolves.toEqual({
      ok: false,
      reason: 'daily_quota_exceeded'
    });
    // Suçlayıcı tıkandı ama global bütçe 3/12'de kaldı: diğer kullanıcılar etkilenmez.
    await expect(quota.reserveAnalysis(IP_NORMAL, 'place-x')).resolves.toEqual({ ok: true });
    await expect(quota.checkQuota(IP_ABUSER)).resolves.toEqual({
      ok: false,
      reason: 'daily_quota_exceeded'
    });
    await expect(quota.checkQuota(IP_NORMAL)).resolves.toEqual({ ok: true });
  });

  it('IP saatlik sınırı korunur (rate_limited)', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '2';
    process.env.DAILY_NEW_ANALYSIS_LIMIT = '99';
    process.env.DAILY_PER_IP_ANALYSIS_LIMIT = '99';
    const { quota } = await load();
    await quota.reserveAnalysis(IP_HIT, 'a');
    await quota.reserveAnalysis(IP_HIT, 'b');
    await expect(quota.reserveAnalysis(IP_HIT, 'c')).resolves.toEqual({
      ok: false,
      reason: 'rate_limited'
    });
  });

  it('eşzamanlı rezervasyonlar sınırı aşamaz (atomiklik)', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '2';
    process.env.DAILY_NEW_ANALYSIS_LIMIT = '99';
    process.env.DAILY_PER_IP_ANALYSIS_LIMIT = '99';
    const { quota } = await load();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => quota.reserveAnalysis(IP_RACE, 'race'))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(2);
    // Kontrol de aynı sayıyı görüyor (kontrol tüketmez, yalnızca okur).
    await expect(quota.checkQuota(IP_RACE)).resolves.toEqual({
      ok: false,
      reason: 'rate_limited'
    });
  });

  it('logUsage eski imzayı korur ve sayacı artırır', async () => {
    process.env.RATE_LIMIT_PER_HOUR = '2';
    process.env.DAILY_NEW_ANALYSIS_LIMIT = '99';
    process.env.DAILY_PER_IP_ANALYSIS_LIMIT = '99';
    const { quota } = await load();
    await quota.logUsage(IP_OTHER, 'place-a');
    await quota.logUsage(IP_OTHER, 'place-a');
    await expect(quota.checkQuota(IP_OTHER)).resolves.toEqual({
      ok: false,
      reason: 'rate_limited'
    });
  });
});

describe('istek tavanı (cache HIT de sayılır)', () => {
  it('analiz sayacından bağımsız çalışır ve diğer IP\'yi etkilemez', async () => {
    process.env.REQUEST_LIMIT_PER_HOUR = '3';
    process.env.RATE_LIMIT_PER_HOUR = '99';
    const { quota } = await load();
    for (let i = 0; i < 3; i += 1) {
      await expect(quota.reserveRequest(IP_HIT)).resolves.toEqual({ ok: true });
    }
    await expect(quota.reserveRequest(IP_HIT)).resolves.toEqual({
      ok: false,
      reason: 'rate_limited'
    });
    await expect(quota.reserveRequest(IP_OTHER)).resolves.toEqual({ ok: true });
    // Hiç analiz yapılmadı: analiz kotası boş kalmalı.
    await expect(quota.checkQuota(IP_HIT)).resolves.toEqual({ ok: true });
  });
});

describe('kanonik önbellek anahtarı', () => {
  it('izleme/yerelleştirme parametreleri anahtarı değiştirmez', async () => {
    const { store } = await load();
    const base = 'https://www.google.com/maps/place/Örnek+Kebap';
    const key = store.canonicalPlaceKey(base);
    expect(key).not.toContain('?');
    expect(key).not.toContain('utm_');
    expect(store.canonicalPlaceKey(`${base}?hl=tr`)).toBe(key);
    expect(store.canonicalPlaceKey(`${base}/?utm_source=twitter&utm_medium=social`)).toBe(key);
    expect(store.canonicalPlaceKey(`${base}?gclid=abc&fbclid=xyz`)).toBe(key);
    // Aynı işletmenin farklı ülke domaini tek anahtara düşer.
    expect(store.canonicalPlaceKey('https://www.google.com.tr/maps/place/örnek+kebap')).toBe(key);
    // Aynı isim, farklı yüzde kodlaması → yine tek anahtar.
    expect(store.canonicalPlaceKey('https://www.google.com/maps/place/%C3%96rnek+Kebap')).toBe(key);
    // Yol boşalırsa (kök URL) host'a düşülür: iki host'un anahtarı çakışmaz.
    expect(store.canonicalPlaceKey('https://www.google.com/')).not.toBe(
      store.canonicalPlaceKey('https://www.google.com.tr/')
    );
    // Kodlanmış '/' çözülmez: `A%2FB` ile `A/B` farklı işletmelerdir.
    expect(store.canonicalPlaceKey('https://www.google.com/maps/place/A%2FB')).not.toBe(
      store.canonicalPlaceKey('https://www.google.com/maps/place/A/B')
    );
  });

  it('kimlik parametreleri korunur, sıra ve diğer parametreler önemsizdir', async () => {
    const { store } = await load();
    expect(store.canonicalPlaceKey('https://www.google.com/maps?ftid=0x1')).toBe(
      store.canonicalPlaceKey('https://www.google.com/maps?hl=en&ftid=0x1')
    );
    expect(store.canonicalPlaceKey('https://www.google.com/maps?cid=123')).toBe(
      store.canonicalPlaceKey('https://www.google.com/maps?utm_source=x&cid=123')
    );
    expect(store.canonicalPlaceKey('https://www.google.com/maps?cid=123')).not.toBe(
      store.canonicalPlaceKey('https://www.google.com/maps?cid=456')
    );
    // Kısaltma linkler: yol kimliğin kendisidir.
    expect(store.canonicalPlaceKey('https://goo.gl/AbCd12')).toBe('/abcd12');
  });

  it('URL değilse sessizce boş anahtar üretmez (normalizePlaceUrl\'a düşer)', async () => {
    const { store, types } = await load();
    expect(store.canonicalPlaceKey('  not-a-url  ')).toBe(types.normalizePlaceUrl('  not-a-url  '));
  });

  it('kanonik anahtar önbelleğe yazar, eski anahtar bir kez okunup taşınır', async () => {
    const { store, types } = await load();
    const url = 'https://www.google.com/maps/place/Örnek+Kebap?hl=en&utm_source=x';
    const legacyKey = types.normalizePlaceUrl(url);
    const saved = await store.saveReport(reportInput(legacyKey));
    expect(await store.findCachedReport(legacyKey, 'tr')).toMatchObject({ id: saved.id });
    // Kanalizasyonlu istek: eski anahtardan bulur ve kanonik anahtara taşır.
    const migrated = await store.findCachedReport(store.canonicalPlaceKey(url), 'tr', legacyKey);
    expect(migrated).toMatchObject({ id: saved.id });
    // Bundan sonra eski anahtara gerek yok.
    await expect(store.findCachedReport(store.canonicalPlaceKey(url), 'tr')).resolves.toMatchObject({
      id: saved.id
    });
  });
});

describe('önbellek TTL doğrulaması', () => {
  it('0 / negatif / sayı olmayan CACHE_TTL_HOURS sonsuz yaşayan anahtar üretmez', async () => {
    process.env.CACHE_TTL_HOURS = '0';
    vi.resetModules();
    expect((await import('../lib/store')).CACHE_TTL_SECONDS).toBe(24 * 3600);
    process.env.CACHE_TTL_HOURS = '-5';
    vi.resetModules();
    expect((await import('../lib/store')).CACHE_TTL_SECONDS).toBe(24 * 3600);
    process.env.CACHE_TTL_HOURS = 'abc';
    vi.resetModules();
    expect((await import('../lib/store')).CACHE_TTL_SECONDS).toBe(24 * 3600);
    // 1 saat tabanı: sıfırdan büyük ama anlamlı.
    process.env.CACHE_TTL_HOURS = '1';
    vi.resetModules();
    expect((await import('../lib/store')).CACHE_TTL_SECONDS).toBe(3600);
    // Tavan: 30 gün.
    process.env.CACHE_TTL_HOURS = '5000';
    vi.resetModules();
    expect((await import('../lib/store')).CACHE_TTL_SECONDS).toBe(720 * 3600);
  });
});

describe('teaser (e-posta duvarı)', () => {
  it('ondalıkla başlayan özet "4." olarak kırpılmaz', async () => {
    const { quota } = await load();
    expect(quota.buildTeaser('4.5 yıldız. İkinci cümle sızmamalı.')).toBe('4.5 yıldız.');
  });

  it('noktayla bitmeyen özette tüm özet sızmaz', async () => {
    const { quota } = await load();
    const teaser = quota.buildTeaser('Birinci cümle burada. İkinci cümle burada da var');
    expect(teaser).toBe('Birinci cümle burada.');
  });

  it('sert karakter bütçesi uygulanır (kelime sınırında keser)', async () => {
    const { quota } = await load();
    const long = 'x '.repeat(200).trim();
    const teaser = quota.buildTeaser(long);
    expect(teaser.length).toBeLessThanOrEqual(141);
    expect(teaser.endsWith('.')).toBe(true);
    expect(quota.buildTeaser(long, 20).length).toBeLessThanOrEqual(21);
  });

  it('boş özet boş teaser verir', async () => {
    const { quota } = await load();
    expect(quota.buildTeaser('')).toBe('');
    expect(quota.buildTeaser('   ')).toBe('');
  });
});

describe('Redis hatası 500 üretmez', () => {
  it('kota ve depolama işlemleri bellek yoluna düşer', async () => {
    const boom = () => Promise.reject(new Error('upstash 503'));
    const failingRedis = {
      mget: boom,
      get: boom,
      set: boom,
      incr: boom,
      expire: boom,
      ttl: boom,
      hset: boom,
      hgetall: boom,
      sadd: boom,
      srem: boom,
      del: boom,
      eval: boom
    };
    // Yalnızca üçüncü taraf istemci sahte: lib/redis.ts'in gerçek hata yutucusu test edilir.
    vi.resetModules();
    vi.doMock('@upstash/redis', () => ({ Redis: { fromEnv: () => failingRedis } }));
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const quota = await import('../lib/quota');
    const store = await import('../lib/store');

    await expect(quota.checkQuota(IP_REDIS_DOWN)).resolves.toEqual({ ok: true });
    await expect(quota.reserveRequest(IP_REDIS_DOWN)).resolves.toEqual({ ok: true });
    await expect(quota.reserveAnalysis(IP_REDIS_DOWN, 'k')).resolves.toEqual({ ok: true });
    await expect(store.findCachedReport('k', 'tr')).resolves.toBeNull();
    const saved = await store.saveReport(reportInput('down'));
    expect(saved.id).toBeTruthy();
    // Belleğe düştüğü için aynı instance'ta okunabilir olmalı.
    await expect(store.getReportById(saved.id)).resolves.toMatchObject({ id: saved.id });
    await expect(store.upsertLead('down@test.co', saved.id, 'tr', true)).resolves.toBeUndefined();
    await expect(store.deleteLeadByEmail('down@test.co')).resolves.toBe(true);
    const token = await store.createVerificationToken(saved.id, 'down@test.co');
    await expect(store.consumeVerificationToken(token)).resolves.toEqual({
      report_id: saved.id,
      email: 'down@test.co'
    });
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });

  it('bozuk UPSTASH_REDIS_REST_URL (istemci kurulumu patlar) 500 üretmez', async () => {
    // `Redis.fromEnv()` geçersiz URL'de UrlError FIRLATIRDI: bu, saf bir
    // yapılandırma hatasının kullanıcıya 500 olarak yansımasıydı.
    process.env.UPSTASH_REDIS_REST_URL = 'not-a-url';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'token';
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { quota, store } = await load();
    await expect(quota.checkQuota(IP_BROKEN_URL)).resolves.toEqual({ ok: true });
    await expect(quota.reserveRequest(IP_BROKEN_URL)).resolves.toEqual({ ok: true });
    await expect(quota.reserveAnalysis(IP_BROKEN_URL, 'k')).resolves.toEqual({ ok: true });
    await expect(store.findCachedReport('k', 'tr')).resolves.toBeNull();
    log.mockRestore();
  });
});

describe('KVKK silme yolu', () => {
  it('deleteLeadByEmail lead kaydını ve rapordaki e-postayı temizler', async () => {
    const { store } = await load();
    const saved = await store.saveReport(reportInput('silme-testi'));
    await store.markReportUnlocked(saved.id, 'Sil@Gmail.com');
    await store.upsertLead('Sil@Gmail.com', saved.id, 'tr', true);
    await expect(store.getReportById(saved.id)).resolves.toMatchObject({
      email_unlocked: 'Sil@Gmail.com'
    });
    await expect(store.deleteLeadByEmail('sil@gmail.com')).resolves.toBe(true);
    await expect(store.getReportById(saved.id)).resolves.toMatchObject({ email_unlocked: null });
    // Tekrar çağırmak hata vermez (idempotent silme talebi).
    await expect(store.deleteLeadByEmail('sil@gmail.com')).resolves.toBe(false);
    await expect(store.deleteLeadByEmail('')).resolves.toBe(false);
  });
});
