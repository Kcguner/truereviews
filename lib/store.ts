import { randomUUID } from 'crypto';
import type { Redis } from '@upstash/redis';
import { keyLead, keyLeadSet, keyPlace, keyReport, keyToken, safeRedis } from './redis';
import { envInt } from './quota';
import {
  memStore,
  normalizePlaceUrl,
  type StoredReport,
  type PreviewData,
  type AnalysisReport
} from './types';

// ---------------------------------------------------------------------------
// TTL'ler — modül yüklenirken BİR KEZ doğrulanır
// ---------------------------------------------------------------------------

/**
 * `CACHE_TTL_HOURS` doğrulaması MODÜL YÜKLENİRKEN yapılır (sabit pencere).
 *
 * ESKİ HATA: `Number(process.env.CACHE_TTL_HOURS || 24)`
 *  - `=0`  → `ttl = 0`  → `{ex:0}`  → Upstash `if (options.ex)` falsy olduğu
 *    için `EX` komutu HİÇ gönderilmiyor → `ya:place:*` / `ya:report:*`
 *    anahtarları (tam yorum metniyle) SONSUZA dek yaşıyor: hem sınırsız maliyet
 *    hem sınırsız KVKK saklama süresi.
 *  - `=abc` → `NaN` → `{"ex":null}` → aynı sonuç.
 * Bu yüzden `envInt` 1 saat tabanı + 30 gün tavanı uygular ve `writeJson`
 * ayrıca her seferinde `ex`'i pozitleştirir.
 */
export const CACHE_TTL_SECONDS = envInt('CACHE_TTL_HOURS', 24, { min: 1, max: 720 }) * 3600;
const TOKEN_TTL_SECONDS = 48 * 3600;
/** Hiçbir yerde `ex <= 0` göndermemek için taban değer (aşağıdaki `safeTtl`). */
const MIN_TTL_SECONDS = 60;

/**
 * Lead saklama süresi: 180 gün. `lib/legal.ts` (gizlilik + KVKK metinleri)
 * saklama süresi vaadinde bulunuyor ama lead kayıtlarının SİLİNMESİ için hiçbir
 * yol yoktu; bu TTL + `deleteLeadByEmail` birlikte vaadi uygulanabilir kılar.
 * KVKK/GDPR "amaçla sınırlı saklama" ilkesi gereği belirsiz süre yok.
 */
const LEAD_RETENTION_DAYS = 180;
const LEAD_TTL_SECONDS = LEAD_RETENTION_DAYS * 86400;

type TokenRow = { report_id: string; email: string; used: boolean };

/**
 * `mocked` alanı `StoredReport`ta beyan EDİLMİYOR (`lib/types.ts`, bu turun
 * kapsamı dışında). `...input` yayılması yüzünden alan çalışma zamanında
 * zaten satırda duruyordu; burada TİPİ bu dosyada tanımlayıp route'un
 * `(cached as unknown as {mocked?: boolean}).mocked ?? true` cast'ini (gerçek
 * raporu "mock" diye gösteren varsayılan) kaldırıyoruz.
 */
export type StoredReportWithMeta = StoredReport & { mocked: boolean };

/** `ex` ASLA 0/NaN/negatif olamaz — Upstash falsy `ex`'te EX göndermediği için
 *  anahtar sonsuza dek yaşardı. */
function safeTtl(ttlSeconds: number): number {
  const n = Math.floor(Number(ttlSeconds));
  if (!Number.isFinite(n) || n <= 0) return MIN_TTL_SECONDS;
  return Math.max(MIN_TTL_SECONDS, n);
}

async function writeJson(
  redis: Redis,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  await redis.set(key, JSON.stringify(value), { ex: safeTtl(ttlSeconds) });
}

/** Yazma: Redis yoksa/hata verirse bellek kopyasına düşer, asla reddetmez. */
async function safeSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await safeRedis(
    'store.set',
    async (redis) => writeJson(redis, key, value, ttlSeconds),
    () => undefined
  );
}

function isFresh(createdAt: string): boolean {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t <= CACHE_TTL_SECONDS * 1000;
}

/** Kalan TTL tahmini: Redis `ttl` yerine kayıt yaşından hesaplanır (taban korunur). */
function remainingTtlSeconds(createdAt: string): number {
  const t = new Date(createdAt).getTime();
  const ageS = Number.isFinite(t) ? Math.floor((Date.now() - t) / 1000) : 0;
  return CACHE_TTL_SECONDS - ageS;
}

/** `mocked` alanını normalize eder: satırda yoksa false (bilinen rapor). */
function withMocked(row: StoredReport): StoredReportWithMeta {
  return { ...row, mocked: (row as StoredReport & { mocked?: unknown }).mocked === true };
}

// ---------------------------------------------------------------------------
// Önbellek anahtarı kanonizasyonu
// ---------------------------------------------------------------------------

/**
 * Sorgu dizesindeki KİMLİK taşıyan parametreler. Bunlar dışındaki HER şey
 * (`utm_*`, `hl`, `gclid`, `fbclid`, `entry=ttu`, saldırganın uydurduğu her şey)
 * önbellek anahtarından düşer: aynı işletmenin her yeni parametresi ücretli bir
 * Apify + Gemma turu ve yeni bir Redis anahtarı demekti (maliyet çarpanı +
 * cache-poisoning yüzeyi).
 */
const IDENTIFYING_PARAMS = ['cid', 'place_id', 'ftid', 'data'] as const;

/**
 * Yolu tek biçime indirger: yüzde kodlaması çözülür, yeniden kodlanır ve
 * küçük harfe düşürülür. Aksi hâlde aynı işletmenin iki yazımı (`…/place/Örnek`
 * ve `…/place/%C3%96rnek`) iki farklı anahtar olurdu — çünkü ham metin
 * küçültüğünde `Ö`→`ö` olur ama kodlanmış `%C3%96`→`%c3%96` kalır ve `ö`'nün
 * kodlamasıyla (`%c3%b6`) eşleşmez.
 */
function canonicalPath(pathname: string): string {
  const raw = normalizePlaceUrl(pathname);
  // Kodlanmış '/' çözülürse segment ayırıcısı olur ve `/maps/place/A%2FB` ile
  // `/maps/place/A/B` aynı anahtara düşerdi. Böyle durumlarda çözme yapmıyoruz
  // (farklı işletmelerin önbellek çakışması, kazançlı görünen normalizasyondan
  // daha kötüdür).
  if (raw.includes('%2f')) return raw;
  let decoded: string;
  try {
    // ÖNCE çöz, sonra küçült: kodlanmış hâlde küçültmek işe yaramıyor
    // (`%C3%96`.toLowerCase() = `%c3%96`, ama `ö` = `%c3%b6`).
    decoded = decodeURIComponent(raw).toLowerCase();
  } catch {
    return raw; // bozuk yüzde kodlaması: ham hâli kullan
  }
  try {
    // Segment segment kodlanır: '/' ayırıcı korunur (encodeURIComponent '/' yutar).
    return normalizePlaceUrl(
      decoded
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/')
        .toLowerCase()
    );
  } catch {
    return raw;
  }
}

/**
 * Yer anahtarını kanonikleştirir: `…/maps/place/X`, `…/maps/place/X?hl=en` ve
 * `…/maps/place/X?utm_source=y` TEK anahtara düşer.
 *
 * Kural:
 *  1. Host ATILIR (`google.com` ile `google.com.tr` aynı işletmedir → tek önbellek),
 *     yol kanonik kodlanıp küçük harfe indirilir ve sondaki `/` atılır.
 *     (Yol boşalırsa — ör. `https://www.google.com/` — host'a düşülür, iki farklı
 *     host'un anahtarı çakışmasın.)
 *  2. Sorgu dizesinden yalnızca kimlik parametreleri tutulur, alfabetik sırayla
 *     birleştirilir (parametre sırası önemli değildir).
 *  3. Kimlik parametresi yoksa sonuç sadece yoldur: tüm `?…` atılır.
 *
 * Geriye uyum: eski anahtar tüm URL'di (küçük harf, sondaki `/` atılmış). Yeni
 * anahtarda host ve sorgu dizesi yok, bu yüzden eski önbellek "bir seferde
 * geçersizleşmez": `findCachedReport` eski anahtarı bir kez okuyup kanonik
 * anahtara taşır (kendi kendini onaran geçiş).
 */
export function canonicalPlaceKey(placeUrl: string): string {
  const base = normalizePlaceUrl(placeUrl);
  let u: URL;
  try {
    u = new URL(placeUrl.trim());
  } catch {
    return base; // URL değilse eski davranış (önbellek yazılmaz, hata 400 döner)
  }
  const path = canonicalPath(u.pathname) || `/${u.hostname.toLowerCase()}`;
  const pairs: string[] = [];
  u.searchParams.forEach((value, key) => {
    if ((IDENTIFYING_PARAMS as readonly string[]).includes(key)) pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  return pairs.length ? `${path}?${pairs.join('&')}` : path;
}

async function readByPlace(
  placeKey: string,
  locale: string
): Promise<StoredReportWithMeta | null> {
  return safeRedis<StoredReportWithMeta | null>(
    'store.findCachedReport',
    async (redis) => {
      const id = await redis.get<string>(keyPlace(placeKey, locale));
      if (!id) return null;
      const row = await redis.get<StoredReport>(keyReport(id));
      return row ? withMocked(row) : null;
    },
    () => {
      const hit = memStore.memByPlace.get(`${placeKey}::${locale}`);
      return hit ? withMocked(hit) : null;
    }
  );
}

/** Kanalizasyon öncesi yazılmış anahtarı kanonik anahtara taşır (kendi kendini onarır). */
async function reindexPlace(
  placeKey: string,
  locale: string,
  row: StoredReportWithMeta
): Promise<void> {
  const memKey = `${placeKey}::${locale}`;
  if (!memStore.memByPlace.has(memKey)) memStore.memByPlace.set(memKey, row);
  await safeSet(keyPlace(placeKey, locale), row.id, remainingTtlSeconds(row.created_at));
}

/**
 * @param legacyPlaceKey Kanalizasyon öncesi (sorgu dizesi içeren) anahtar; verilirse
 *  kanonik anahtarda isabet yoksa bir kez okunur ve kanonik anahtara taşınır.
 */
export async function findCachedReport(
  placeKey: string,
  locale: string,
  legacyPlaceKey?: string
): Promise<StoredReportWithMeta | null> {
  const hit = await readByPlace(placeKey, locale);
  if (hit) return hit && isFresh(hit.created_at) ? hit : null;
  if (!legacyPlaceKey || legacyPlaceKey === placeKey) return null;
  const legacy = await readByPlace(legacyPlaceKey, locale);
  if (!legacy) return null;
  const fresh = isFresh(legacy.created_at) ? legacy : null;
  if (fresh) await reindexPlace(placeKey, locale, fresh);
  return fresh;
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
}): Promise<StoredReportWithMeta> {
  // `mocked`/`indexPlace` StoredReport'ta beyan edilmiyor: yaymak yerine
  // ayrıştırıp yalnızca kalıcı alanları satıra koyuyoruz.
  const { mocked, indexPlace, ...persist } = input;
  const row: StoredReportWithMeta = {
    id: randomUUID(),
    ...persist,
    mocked: mocked === true,
    email_unlocked: null,
    created_at: new Date().toISOString()
  };
  const indexable = indexPlace !== false;
  // Redis yazımı patlarsa aynı instance'ta bellek kopyası tutulur: kullanıcı
  // raporu yine alır, /api/verify de aynı instance'ta çalışır (500 yerine
  // "yavaş ama çalışan" bir akış).
  await safeRedis(
    'store.saveReport',
    async (redis) => {
      await writeJson(redis, keyReport(row.id), row, CACHE_TTL_SECONDS);
      if (indexable) {
        await writeJson(redis, keyPlace(row.place_key, row.locale), row.id, CACHE_TTL_SECONDS);
      }
    },
    () => {
      memStore.memReports.set(row.id, row);
      if (indexable) memStore.memByPlace.set(`${row.place_key}::${row.locale}`, row);
    }
  );
  return row;
}

export async function getReportById(id: string): Promise<StoredReport | null> {
  return safeRedis<StoredReport | null>(
    'store.getReportById',
    async (redis) => {
      const row = await redis.get<StoredReport>(keyReport(id));
      return row ?? null;
    },
    () => memStore.memReports.get(id) || null
  );
}

export async function markReportUnlocked(id: string, email: string): Promise<void> {
  const key = keyReport(id);
  await safeRedis(
    'store.markReportUnlocked',
    async (redis) => {
      const row = await redis.get<StoredReport>(key);
      if (!row) return;
      row.email_unlocked = email;
      const ttl = await redis.ttl(key);
      await writeJson(redis, key, row, ttl > 0 ? ttl : CACHE_TTL_SECONDS);
    },
    () => {
      const r = memStore.memReports.get(id);
      if (r) r.email_unlocked = email;
    }
  );
}

/**
 * Lead kaydı + lead dizini.
 *
 * SAKLAMA: lead hash'ine LEAD_TTL_SECONDS (180 gün) TTL yazılır — eskiden
 * `ya:lead:<email>` ve `ya:leads` kümesi SONUZA dek yaşıyordu. Küme üye bazlı
 * TTL'e sahip olmadığından kayan bir TTL ile (son lead yazımından itibaren
 * 180 gün) kendini temizler; üye hash'leri kendi 180 günlük sürelerinde düşer.
 * Kalıcı silme için `deleteLeadByEmail` gerekir (KVKK m.11 silme hakkı).
 */
export async function upsertLead(
  email: string,
  reportId: string,
  locale: string,
  verified: boolean
): Promise<void> {
  const norm = email.trim().toLowerCase();
  if (!norm) return;
  await safeRedis(
    'store.upsertLead',
    async (redis) => {
      await redis.hset(keyLead(norm), {
        report_id: reportId,
        locale,
        verified: verified ? '1' : '0'
      });
      await redis.sadd(keyLeadSet, norm);
      await redis.expire(keyLeadSet, LEAD_TTL_SECONDS);
    },
    () => {
      memStore.memLeads.push({ email: norm, report_id: reportId, locale, verified });
    }
  );
  // Lead'in evi: Redis lead seti (dışa aktarım / bülten için).
  // Not: SendGrid Single Sender ile gönderim yapılır; toplu bülten için
  // ileride Marketing Contacts + doğrulanmış domain gerekir.
  return;
}

/**
 * KVKK "silme talebi" yolunun uygulanabilir kısmı (henüz bir route'a bağlı DEĞİL;
 * route eklemek bu turun kapsamı dışında).
 *
 * Kapsam: lead hash'i, lead dizini (küme) ve ilişkili raporun `email_unlocked`
 * alanı. Rapor satırının kendisi zaten CACHE_TTL_SECONDS içinde düşer.
 * Doğrulama token'ı 48 saatlik TTL'ini bu çağrıdan BAĞIMSIZ olarak yaşar (token
 * rapor id'sine değil e-posta'ya bağlı değil; token e-postayı içerir ama anahtarı
 * token'dır, KVKK 12. md "yasal saklama" gereği kısa tutulur).
 */
export async function deleteLeadByEmail(email: string): Promise<boolean> {
  const norm = email.trim().toLowerCase();
  if (!norm) return false;
  return safeRedis<boolean>(
    'store.deleteLead',
    async (redis) => {
      const lead = await redis.hgetall<Record<string, string>>(keyLead(norm));
      const removedHash = await redis.del(keyLead(norm));
      const removedSet = await redis.srem(keyLeadSet, norm);
      const reportId = lead?.report_id;
      if (!reportId) return removedHash + removedSet > 0;
      const rk = keyReport(reportId);
      const report = await redis.get<StoredReport>(rk);
      if (!report || (report.email_unlocked || '').toLowerCase() !== norm) return true;
      report.email_unlocked = null;
      const ttl = await redis.ttl(rk);
      await writeJson(redis, rk, report, ttl > 0 ? ttl : CACHE_TTL_SECONDS);
      return true;
    },
    () => {
      let hit = false;
      for (let i = memStore.memLeads.length - 1; i >= 0; i -= 1) {
        const row = memStore.memLeads[i] as { email?: string } | undefined;
        if (row?.email === norm) {
          memStore.memLeads.splice(i, 1);
          hit = true;
        }
      }
      // Not: Map.forEach — `for..of` + `.values()` ES5 hedefte derlenmez.
      memStore.memReports.forEach((report) => {
        if ((report.email_unlocked || '').toLowerCase() === norm) report.email_unlocked = null;
      });
      return hit;
    }
  );
}

export async function createVerificationToken(reportId: string, email: string): Promise<string> {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();
  await safeRedis(
    'store.createToken',
    async (redis) => {
      const row: TokenRow = { report_id: reportId, email, used: false };
      await writeJson(redis, keyToken(token), row, TOKEN_TTL_SECONDS);
    },
    () => {
      const holder = memStore as unknown as {
        tokens?: Map<string, { report_id: string; email: string; expires_at: string; used: boolean }>;
      };
      holder.tokens ??= new Map();
      holder.tokens.set(token, {
        report_id: reportId,
        email,
        expires_at: expiresAt,
        used: false
      });
    }
  );
  return token;
}

export async function consumeVerificationToken(
  token: string
): Promise<{ report_id: string; email: string } | null> {
  const key = keyToken(token);
  return safeRedis<{ report_id: string; email: string } | null>(
    'store.consumeToken',
    async (redis) => {
      const row = await redis.get<TokenRow>(key);
      if (!row) return null;
      if (!row.used) {
        row.used = true;
        const ttl = await redis.ttl(key);
        await writeJson(redis, key, row, ttl > 0 ? ttl : TOKEN_TTL_SECONDS);
      }
      return { report_id: row.report_id, email: row.email };
    },
    () => {
      const map = (
        memStore as unknown as {
          tokens?: Map<string, { report_id: string; email: string; expires_at: string; used: boolean }>;
        }
      ).tokens;
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
  );
}
