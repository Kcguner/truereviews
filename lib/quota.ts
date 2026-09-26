import { keyDay, keyHour, keyIpDay, keyIpRequest, safeRedis } from './redis';
import { memStore } from './types';
import { warnProdOnce } from './env-guard';

// ---------------------------------------------------------------------------
// Sınırlar (env'ten, DOĞRULANMIŞ okunur)
// ---------------------------------------------------------------------------

/** `reason` değerleri route'ta kullanıcı mesajına çevriliyor; DEĞİŞTİRME. */
export type QuotaReason = 'daily_quota_exceeded' | 'rate_limited';
export type QuotaResult = { ok: boolean; reason?: QuotaReason };

const HOUR_WINDOW_SECONDS = 3600;
const DAY_WINDOW_SECONDS = 86400;

/** Global (tüm kullanıcılar) günlük analiz tavanı. */
const dailyGlobalLimit = (): number => envInt('DAILY_NEW_ANALYSIS_LIMIT', 12);
/** IP başına günlük analiz tavanı — global bütçenin tek istemciye gitmesini engeller. */
const dailyIpLimit = (): number => envInt('DAILY_PER_IP_ANALYSIS_LIMIT', 4);
/** IP başına saatlik analiz tavanı (her analiz = ücretli Apify + Gemma çağrısı). */
const hourlyAnalysisLimit = (): number => envInt('RATE_LIMIT_PER_HOUR', 2);
/**
 * IP başına saatlik İSTEK tavanı: cache hit dâhil HER istek sayılır.
 * Varsayılan bilinçli olarak yüksek (60): CGNAT/ofis NAT arkasındaki birden çok
 * gerçek kullanıcı aynı IP'yi paylaşır, düşük bir tavan meşru kullanıcıları
 * kilitler. Amaç maliyet çarpanını sınırlamak değil (onu analiz kotası yapar),
 * tek linki kovalayan istemciyi ve fonksiyon yükünü sınırlamak.
 */
const hourlyRequestLimit = (): number => envInt('REQUEST_LIMIT_PER_HOUR', 60);

/**
 * Sayısal env değişkenini güvenli okur.
 *
 * ESKİ HATA: `Number(process.env.DAILY_NEW_ANALYSIS_LIMIT || 12)`
 *  - `DAILY_NEW_ANALYSIS_LIMIT=twelve` → `NaN` → `count >= NaN` her zaman false
 *    → günlük kota SESSİZCE tamamen kapalı (kimse fark etmez).
 *  - `=0` / `=-5` → karşılaştırma yine sessizce anlamsızlaşıyor.
 *  - Aynı desen `CACHE_TTL_HOURS` için çok daha kötü: `0` → `{ex:0}` →
 *    Upstash `if (options.ex)` falsy olduğu için `EX` hiç gönderilmiyor →
 *    anahtarlar (tam yorum metniyle) SONSUZA dek yaşıyor.
 *
 * KURAL: `Number.isFinite` + `>= 1` kontrolünden geçmeyen değer reddedilir,
 * `warnProdOnce` ile prod'da bağırılır ve varsayılana dönülür. `max` verilmişse
 * değer mantıklı bir üst sınıra kırpılır (saklama/maliyet sınırı).
 *
 * NOT: Bu yardımcı aslında `lib/env-guard.ts`in (`warnProdOnce`'ın evi) yanına
 * ait; o dosya bu turun kapsamı dışında olduğu için burada yaşıyor.
 */
export function envInt(
  name: string,
  fallback: number,
  opts?: { min?: number; max?: number }
): number {
  const min = opts?.min ?? 1;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  const clamp = (n: number): number => Math.min(Math.max(Math.floor(n), min), max);
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return clamp(fallback);
  const n = Number(raw.trim());
  if (!Number.isFinite(n)) return badEnv(name, raw, 'sayı değil', clamp(fallback));
  if (n < 1) return badEnv(name, raw, '1 veya daha büyük değil', clamp(fallback));
  if (n > max) {
    warnProdOnce(
      `env-int-max:${name}`,
      `${name}=${raw} aşırı yüksek — ${max} değerine kırpıldı (saklama/maliyet sınırı).`
    );
    return max;
  }
  return Math.floor(n);
}

function badEnv(name: string, raw: string, why: string, fallback: number): number {
  warnProdOnce(
    `env-int:${name}`,
    `${name}="${raw}" geçersiz (${why}) — varsayılan değere dönülüyor. Bozuk bir limit sessizce SINIRSIZ limit demektir, bu yüzden varsayılan kullanılıyor.`
  );
  return fallback;
}

// ---------------------------------------------------------------------------
// Atomik sayaçlar (Redis: tek Lua çağrısı / bellek: senkron defter)
// ---------------------------------------------------------------------------

/**
 * Analiz kotası rezervasyonu — TEK Redis çağrısında kontrol + tüketim.
 *
 * ESKİ HATA (check-then-consume): `checkQuota` sayaçları OKUR, route tam bir
 * Apify + Gemma turu çalıştırır, SONRA `logUsage` sayaçları ARTIRIR. Aynı IP'den
 * gelen N paralel istek aynı sayacı okur, hepsi sınırın altında görür ve hepsi
 * geçer → saatlik sınır paralel istekle çevre dışı bırakılır.
 *
 * ÇÖZÜM: Redis script'leri TEK thread'li motor içinde atomik çalışır; araya başka
 * istek giremez. Burada okuma → karşılaştırma → artırma zinciri tek bir EVAL
 * içindedir, yani kaç istek gelirse gelsin sınıra ulaşıldığı anda artırma
 * durur. Sıralı testlerin yanı sıra eşzamanlı (concurrent) istekler de sınırı
 * aşamaz.
 *
 * KEYS[1] = ya:q:d:<gün>       global günlük analiz sayacı
 * KEYS[2] = ya:q:pd:<ip>:<gün> IP'nin günlük analiz sayacı
 * KEYS[3] = ya:q:h:<ip>        IP'nin saatlik analiz sayacı
 * ARGV[1] = global günlük sınır
 * ARGV[2] = IP günlük sınır
 * ARGV[3] = IP saatlik sınır
 * ARGV[4] = gün penceresi (sn)
 * ARGV[5] = saat penceresi (sn)
 * Dönüş: {0,…} izin verildi | {1} daily_quota_exceeded | {2} rate_limited
 *
 * TTL kuralı: EXPIRE yalnızca sayaç İLK OLUŞTUĞUNDA (INCR==1) yazılır → sabit
 * pencere korunur, her istekte pencere kaymaz.
 */
const RESERVE_ANALYSIS_LUA = `local function cur(k)
  local v = redis.call('GET', k)
  if not v then return 0 end
  return tonumber(v) or 0
end
local dayAll = cur(KEYS[1])
local dayIp = cur(KEYS[2])
local hourIp = cur(KEYS[3])
if dayAll >= tonumber(ARGV[1]) or dayIp >= tonumber(ARGV[2]) then return {1} end
if hourIp >= tonumber(ARGV[3]) then return {2} end
local a = redis.call('INCR', KEYS[1])
if a == 1 then redis.call('EXPIRE', KEYS[1], ARGV[4]) end
local b = redis.call('INCR', KEYS[2])
if b == 1 then redis.call('EXPIRE', KEYS[2], ARGV[4]) end
local c = redis.call('INCR', KEYS[3])
if c == 1 then redis.call('EXPIRE', KEYS[3], ARGV[5]) end
return {0, a, b, c}`;

/**
 * Saatlik İSTEK sayacı — analiz sayacından bağımsız, cache hit'lerde de artar.
 * KEYS[1] = ya:q:req:<ip> | ARGV[1] = sınır | ARGV[2] = pencere (sn)
 * Dönüş: {1,…} izin | {0,…} sınır aşıldı
 * Sayaç sınırı aşsa da artmaya devam eder: kovalayan istemci pencereyi uzatamaz,
 * pencere içinde kalan istek sayısı doğru ölçülür.
 */
const RESERVE_REQUEST_LUA = `local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
if c > tonumber(ARGV[1]) then return {0, c} end
return {1, c}`;

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Dışa açılan API
// ---------------------------------------------------------------------------

/**
 * SALT-OKUNUR ön kontrol: sayacı TUTMAZ, sadece "şu an kota var mı" diye bakar.
 *
 * /api/analyze artık bunu kullanmıyor (gerçek kapı `reserveAnalysis`'dır):
 * okuma + sonradan artırma arasındaki boşlukta ücretli iş çalışacağı için
 * güvenli değildir. Yine de API olarak duruyor: ön kontrol (erken 429) ve testler
 * için kullanılır ve eski çağıranların davranışını bozmaz.
 */
export async function checkQuota(ip: string): Promise<QuotaResult> {
  return safeRedis<QuotaResult>(
    'quota.check',
    async (redis) => {
      const day = todayKey();
      const [dayCount, ipDayCount, ipCount] =
        (await redis.mget<number[]>(keyDay(day), keyIpDay(ip, day), keyHour(ip))) || [];
      return evaluate(Number(dayCount) || 0, Number(ipDayCount) || 0, Number(ipCount) || 0);
    },
    () => {
      const { dayAll, dayIp, hourIp } = snapshot(ip);
      return evaluate(dayAll, dayIp, hourIp);
    }
  );
}

/**
 * Analiz kotasını ATOMİK olarak rezerve eder (tek Lua).
 *
 * Çağırmak = "bu analiz için ücretli işe giriyorum" demektir; çağrıldığı anda
 * sayaçlar harcanır. /api/analyze bunu cache MISS durumunda, Apify'ye girmeden
 * ÖNCE çağırır: aksi hâlde kazanılmış (race kazanılmış) kota ücretli işe
 * dönüşür.
 *
 * Bilinçli trade-off: sonradan başarısız olan analizler (Apify hatası, "yorum
 * bulunamadı" 404'ü) kotayı harcamış olur. Doğru bir iade (refund) yolu
 * eşzamanlı INCR/DECR yarışı üretirdi; sınırlı sayıda başarısız isteği kabul
 * etmek, kotanın hiç korunmamasından iyidir.
 */
export async function reserveAnalysis(ip: string, placeKey = ''): Promise<QuotaResult> {
  const day = todayKey();
  const limits: [number, number, number] = [
    dailyGlobalLimit(),
    dailyIpLimit(),
    hourlyAnalysisLimit()
  ];
  return safeRedis<QuotaResult>(
    'quota.reserveAnalysis',
    async (redis) => {
      const res = await redis.eval<[number, number, number, number, number], number[]>(
        RESERVE_ANALYSIS_LUA,
        [keyDay(day), keyIpDay(ip, day), keyHour(ip)],
        [limits[0], limits[1], limits[2], DAY_WINDOW_SECONDS, HOUR_WINDOW_SECONDS]
      );
      const code = Number(res?.[0] ?? 0);
      if (code === 1) return { ok: false, reason: 'daily_quota_exceeded' };
      if (code === 2) return { ok: false, reason: 'rate_limited' };
      return { ok: true };
    },
    () => reserveAnalysisMemory(ip, placeKey)
  );
}

/**
 * Saatlik İSTEK tavanı: HER istekte (cache hit dâhil) bir kez artar.
 *
 * Neden ayrı? /api/analyze cache HIT'te erkenden dönüyordu, dolayısıyla
 * `RATE_LIMIT_PER_HOUR` yalnızca *farklı* analizleri sınırlıyordu: bir istemci
 * tek bir cache'li linki binlerce kez çalıştırıp sıfır maliyetle trafik
 * üretebiliyor, üstelik throttlendikten sonra da aynı linki çalıştırmaya devam
 * edebiliyordu. Analiz kotası anlamı BOZULMAZ: ödeme yapan işler yine
 * `reserveAnalysis` sayacından düşüyor.
 */
export async function reserveRequest(ip: string): Promise<QuotaResult> {
  const limit = hourlyRequestLimit();
  return safeRedis<QuotaResult>(
    'quota.reserveRequest',
    async (redis) => {
      const res = await redis.eval<[number, number], number[]>(
        RESERVE_REQUEST_LUA,
        [keyIpRequest(ip)],
        [limit, HOUR_WINDOW_SECONDS]
      );
      return Number(res?.[0] ?? 0) === 0 ? { ok: false, reason: 'rate_limited' } : { ok: true };
    },
    () => reserveRequestMemory(ip)
  );
}

/**
 * Eski imza korunur; artık `reserveAnalysis` sarmalayıcısıdır.
 *
 * ÖNEMLİ: /api/analyze artık burayı çağırmıyor. Sayaç artırması zaten ücretli
 * işten önce yapıldığı için burada ikinci kez artırmak her analizi iki kat
 * sayardı. Bu işlev testler/harici çağıranlar için "kullanımı kaydet" giriş
 * noktası olarak duruyor ve TUTARLI davranıyor (sayaç yine artar).
 */
export async function logUsage(ip: string, placeKey: string): Promise<void> {
  await reserveAnalysis(ip, placeKey);
}

// ---------------------------------------------------------------------------
// Teaser (e-posta duvarı)
// ---------------------------------------------------------------------------

/**
 * Önizleme teaser'ı: ilk cümle + sert karakter bütçesi.
 *
 * ESKİ HATA: `report.summary.split('.').slice(0, 1).join('.') + '.'`
 *  - Özet noktayla bitmiyorsa (LLM'de çok yaygın) teaser TÜM özete eşit olur →
 *    e-posta duvarı sessizce delinir.
 *  - Özet ondalıkla başlıyorsa (`"4.5 yıldız…"`) teaser `"4."` olur.
 *
 * NOT: Bu saf bir fonksiyondur ama içinde bulunduğu modül sunucuya özeldir
 * (`./redis` importu). İstemci tarafında kullanılmak istenirse (bkz.
 * app/[locale]/rapor/page.tsx:31'deki kopyası) bağımlılığı olmayan ortak bir
 * modüle taşınmalıdır.
 */
export function buildTeaser(summary: string, maxChars = 140): string {
  const text = (summary || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const end = firstSentenceEnd(text);
  let teaser = (end >= 0 ? text.slice(0, end + 1) : text).trim();
  if (teaser.length > maxChars) teaser = cutAtWord(teaser, maxChars);
  if (teaser && !/[.!?]$/.test(teaser)) teaser += '.';
  return teaser;
}

/** İlk noktalama işareti cümle sonudur; ondalık ayırıcı (`4.5`) sayılmaz. */
function firstSentenceEnd(text: string): number {
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    if (ch === '.' && /\d/.test(text[i + 1] || '')) continue;
    return i;
  }
  return -1;
}

function cutAtWord(text: string, maxChars: number): string {
  const slice = text.slice(0, Math.max(1, maxChars));
  const sp = slice.lastIndexOf(' ');
  return (sp > maxChars / 2 ? slice.slice(0, sp) : slice).trim();
}

// ---------------------------------------------------------------------------
// Bellek yolu (Redis yoksa veya Redis hata verirse)
// ---------------------------------------------------------------------------

/**
 * Bellek yolunda kullanılan analiz defteri `memStore.memUsage`ın KENDİSİDİR
 * (yeni dizi DEĞİL — kimlik korunur, yani `lib/types.ts`in yazdığı satırlar
 * buradan da görünür). Satır tipi artık `lib/types.ts`te beyan edildiği için
 * `as unknown as` genişletmesine gerek yoktur.
 */
const memUsage: { date: string; ip: string; place_key: string; ts: number }[] = memStore.memUsage;

/**
 * Saatlik istek defteri. Analiz kayıtlarından AYRI tutulur: istek sayısı
 * analiz sayısından büyüktür (cache hit de sayılır) ve aynı dizide karışırsa
 * hem sayaç hem de "kayıt" anlamı bozulurdu.
 */
const memRequests: { ip: string; ts: number }[] = [];

/** Bellek defterleri serverless'ta ölür; yine de uzun ömürlü instance'da
 *  sınırsız büyümeyi engelle (yalnızca 48 saatten eski analiz satırları atılır —
 *  günlük pencere zaten 24 saat). */
function pruneMemory(now: number): void {
  const cutoff = now - 2 * DAY_WINDOW_SECONDS * 1000;
  for (let i = memUsage.length - 1; i >= 0; i -= 1) {
    const ts = memUsage[i]?.ts ?? 0;
    if (ts < cutoff) memUsage.splice(i, 1);
  }
  for (let i = memRequests.length - 1; i >= 0; i -= 1) {
    const ts = memRequests[i]?.ts ?? 0;
    if (ts < cutoff) memRequests.splice(i, 1);
  }
}

function snapshot(ip: string): { dayAll: number; dayIp: number; hourIp: number } {
  const now = Date.now();
  pruneMemory(now);
  const day = todayKey();
  const hourAgo = now - HOUR_WINDOW_SECONDS * 1000;
  let dayAll = 0;
  let dayIp = 0;
  let hourIp = 0;
  for (const u of memUsage) {
    if (u.date === day) {
      dayAll += 1;
      if (u.ip === ip) dayIp += 1;
    }
    if (u.ip === ip && u.ts > hourAgo) hourIp += 1;
  }
  return { dayAll, dayIp, hourIp };
}

function evaluate(dayAll: number, dayIp: number, hourIp: number): QuotaResult {
  if (dayAll >= dailyGlobalLimit() || dayIp >= dailyIpLimit()) {
    return { ok: false, reason: 'daily_quota_exceeded' };
  }
  if (hourIp >= hourlyAnalysisLimit()) return { ok: false, reason: 'rate_limited' };
  return { ok: true };
}

/**
 * Bellek yolunda rezervasyon. Kilit/await YOKTUR: okuma ile yazma arasında
 * bekleyen bir işlem olmadığı için Node'un tek iş parçacığında bu blok
 * kesintisiz çalışır, yani "eşzamanlı" istekler sırayla gelir ve sınırı aşamaz
 * (Redis'in atomikliğinin bellek karşılığı).
 */
function reserveAnalysisMemory(ip: string, placeKey: string): QuotaResult {
  const { dayAll, dayIp, hourIp } = snapshot(ip);
  const verdict = evaluate(dayAll, dayIp, hourIp);
  if (!verdict.ok) return verdict;
  memUsage.push({ date: todayKey(), ip, place_key: placeKey, ts: Date.now() });
  return { ok: true };
}

function reserveRequestMemory(ip: string): QuotaResult {
  const now = Date.now();
  pruneMemory(now);
  memRequests.push({ ip, ts: now });
  const limit = hourlyRequestLimit();
  const count = memRequests.filter((r) => r.ip === ip).length;
  if (count > limit) return { ok: false, reason: 'rate_limited' };
  return { ok: true };
}
