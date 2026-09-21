import { randomUUID } from 'crypto';
import { getRedis, keyLead, keyPlace, keyReport, keyToken } from './redis';
import { memStore, type StoredReport, type PreviewData, type AnalysisReport } from './types';

const CACHE_TTL_HOURS = Number(process.env.CACHE_TTL_HOURS || 24);
const TOKEN_TTL_SECONDS = 48 * 3600;

type TokenRow = { report_id: string; email: string; used: boolean };

async function setWithTtl(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

export async function findCachedReport(placeKey: string, locale: string): Promise<StoredReport | null> {
  const redis = getRedis();
  if (!redis) {
    const hit = memStore.memByPlace.get(`${placeKey}::${locale}`) || null;
    if (!hit) return null;
    const ageH = (Date.now() - new Date(hit.created_at).getTime()) / 3600_000;
    return ageH <= CACHE_TTL_HOURS ? hit : null;
  }
  const id = await redis.get<string>(keyPlace(placeKey, locale));
  if (!id) return null;
  const row = await redis.get<StoredReport>(keyReport(id));
  if (!row) return null;
  const ageH = (Date.now() - new Date(row.created_at).getTime()) / 3600_000;
  return ageH <= CACHE_TTL_HOURS ? row : null;
}

export async function saveReport(input: {
  place_url: string;
  place_key: string;
  business_name: string;
  reviews: StoredReport['reviews'];
  full_report: AnalysisReport;
  preview: PreviewData;
  locale: string;
  mocked: boolean;
  /** false ise place->id eşleşmesi yazılmaz: mock sonuçlar 24s önbelleğe
   *  girmez, aynı link bir sonraki seferde gerçek analizi tekrar dener. */
  indexPlace?: boolean;
}): Promise<StoredReport> {
  const redis = getRedis();
  const row: StoredReport = {
    id: randomUUID(),
    ...input,
    email_unlocked: null,
    created_at: new Date().toISOString()
  };
  const indexable = input.indexPlace !== false;
  if (!redis) {
    memStore.memReports.set(row.id, row);
    if (indexable) memStore.memByPlace.set(`${input.place_key}::${input.locale}`, row);
    return row;
  }
  const ttl = CACHE_TTL_HOURS * 3600;
  await setWithTtl(keyReport(row.id), row, ttl);
  if (indexable) await setWithTtl(keyPlace(input.place_key, input.locale), row.id, ttl);
  return row;
}

export async function getReportById(id: string): Promise<StoredReport | null> {
  const redis = getRedis();
  if (!redis) return memStore.memReports.get(id) || null;
  return (await redis.get<StoredReport>(keyReport(id))) || null;
}

export async function markReportUnlocked(id: string, email: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    const r = memStore.memReports.get(id);
    if (r) r.email_unlocked = email;
    return;
  }
  const key = keyReport(id);
  const row = await redis.get<StoredReport>(key);
  if (!row) return;
  row.email_unlocked = email;
  const ttl = await redis.ttl(key);
  await redis.set(key, JSON.stringify(row), { ex: ttl > 0 ? ttl : CACHE_TTL_HOURS * 3600 });
}

export async function upsertLead(email: string, reportId: string, locale: string, verified: boolean) {
  const norm = email.trim().toLowerCase();
  const redis = getRedis();
  if (!redis) {
    memStore.memLeads.push({ email: norm, report_id: reportId, locale, verified });
  } else {
    await redis.hset(keyLead(norm), { report_id: reportId, locale, verified: verified ? '1' : '0' });
    await redis.sadd('ya:leads', norm);
  }
  // Lead'in evi: Redis lead seti (dışa aktarım / bülten için).
  // Not: SendGrid Single Sender ile gönderim yapılır; toplu bülten için
  // ileride Marketing Contacts + doğrulanmış domain gerekir.
  return;
}

export async function createVerificationToken(reportId: string, email: string): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const redis = getRedis();
  if (!redis) {
    (memStore as unknown as { tokens: Map<string, unknown> }).tokens ??= new Map();
    ((memStore as unknown as { tokens: Map<string, unknown> }).tokens).set(token, {
      report_id: reportId,
      email,
      expires_at: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString(),
      used: false
    });
    return token;
  }
  const row: TokenRow = { report_id: reportId, email, used: false };
  await setWithTtl(keyToken(token), row, TOKEN_TTL_SECONDS);
  return token;
}

export async function consumeVerificationToken(
  token: string
): Promise<{ report_id: string; email: string } | null> {
  const redis = getRedis();
  if (!redis) {
    const map = (memStore as unknown as { tokens?: Map<string, { report_id: string; email: string; expires_at: string; used: boolean }> })
      .tokens;
    const row = map?.get(token);
    // Not: tek kullanımlık DEĞİL, TTL içinde idempotent — e-posta istemcisinin
    // linki önizleme için tekrar çağırması / React StrictMode çift istek /
    // sayfa yenileme "geçersiz link" hatasına düşmesin. Token 64-hex,
    // tek rapora bağlı ve 48 saatlik; tekrar kullanımı double opt-in'i
    // zayıflatmaz (e-posta zaten doğrulanmış sayılır).
    if (!row || new Date(row.expires_at).getTime() < Date.now()) return null;
    row.used = true;
    return { report_id: row.report_id, email: row.email };
  }
  const key = keyToken(token);
  const row = await redis.get<TokenRow>(key);
  if (!row) return null;
  if (!row.used) {
    row.used = true;
    const ttl = await redis.ttl(key);
    await redis.set(key, JSON.stringify(row), { ex: ttl > 0 ? ttl : TOKEN_TTL_SECONDS });
  }
  return { report_id: row.report_id, email: row.email };
}
