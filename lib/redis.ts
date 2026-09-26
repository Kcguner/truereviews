import { Redis } from '@upstash/redis';
import { warnProdOnce } from './env-guard';

let cached: Redis | null = null;
/** Bozuk istemci yapılandırmasında her istekte yeniden denemeyelim. */
let clientBroken = false;

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/** Upstash Redis yoksa null döner (çağıran memory fallback'e düşer). */
export function getRedis(): Redis | null {
  if (!isRedisConfigured()) {
    // Ayrı bir "bir kez uyar" bayrağı yok: `warnProdOnce` anahtarı kendisi
    // tekilleştiriyor ve bu anahtar yalnızca burada kullanılıyor.
    warnProdOnce(
      'redis-missing',
      'Upstash Redis bağlı değil — kota/önbellek in-memory çalışıyor. Vercel multi-instance ortamda limitler delinebilir ve restartta raporlar uçar; deploy öncesi Redis bağlayın.'
    );
    return null;
  }
  if (cached) return cached;
  if (clientBroken) return null;
  try {
    cached = Redis.fromEnv();
    return cached;
  } catch (e) {
    // `Redis.fromEnv()` BOZUK bir URL'de (örn. Vercel'e yapıştırılırken bozulan
    // "https://…" ya da boşluk/içinde satır sonu olan değer) UrlError FIRSATLA
    // atıyordu; bu, yapılandırma hatasını kullanıcıya 500 olarak gösteriyordu.
    // Artık istemci kurulamazsa bellek yoluna düşüyor ve neden prod'da bağırıyor.
    clientBroken = true;
    const msg = e instanceof Error ? e.message : String(e);
    warnProdOnce(
      'redis-client-broken',
      `Upstash Redis istemcisi oluşturulamadı (${msg}) — bellek yoluna düşüldü. UPSTASH_REDIS_REST_URL biçimini (https://… , tırnak/boşluk yok) kontrol edin.`
    );
    // eslint-disable-next-line no-console
    console.error(`[redis] istemci oluşturulamadı: ${msg}`);
    return null;
  }
}

/** Aynı işlem için tekrar tekrar log basmayı önler (5xx fırtınasında log şişmesin). */
const loggedOps = new Set<string>();

/**
 * Redis çağrısını hata yutucu sarmalayıcıyla çalıştırır.
 *
 * Neden: Upstash REST bir anda 5xx / timeout verdiğinde `redis.mget()` reddedilir,
 * reddi yakalamayan çağıran route'un catch'ine düşer ve HER kullanıcıya 500 döner.
 * Daha kötüsü: `incr` ücretli Apify/Gemma işi bittikten sonra patlarsa kullanıcı
 * parasını harcar, hata görür, sayacı da artmaz. Burada hata `fallback()`'e
 * çevrilir; böylece Redis geçici bir kesintide uygulama AYAKTA kalır.
 *
 * KOTA İÇİN FAIL-OPEN KARARI: Kota kontrolünde Redis düşerse istek REDDEDİLMEZ,
 * bellek (saatlik/daily) sınırlayıcısına düşülür. Lead-magnet bir uygulamada
 * fail-closed, tek bir Upstash 5xx'te tüm siteyi 500'e düşürmek (dönüşüm = 0)
 * demektir; bellek yolu en kötü ihtimalde instance başına sınırlar uygular ve
 * kullanıcı yine hizmet alır. Bütünlük açısından kritik olan tek şey sayacın
 * KAYBOLMAMASI: bu yüzden `logUsage` gibi "tüketim" çağrıları artık
 * `reserveAnalysis` (tek Lua) ile yapılır ve hata halinde belleğe yazılır.
 *
 * @param op işlem adı (log ve uyarı anahtarı)
 * @param run Redis'e yapılacak asıl iş
 * @param fallback Redis yoksa VEYA hata olursa çalışacak iş
 */
export async function safeRedis<T>(
  op: string,
  run: (redis: Redis) => Promise<T>,
  fallback: () => T | Promise<T>
): Promise<T> {
  try {
    // Not: `getRedis()` de try'nin İÇİNDE: istemci kurulumu da patlayabilir
    // (bozuk URL) ve o da 500'e dönüşmemeli.
    const redis = getRedis();
    if (!redis) return await fallback();
    return await run(redis);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!loggedOps.has(op)) {
      loggedOps.add(op);
      // eslint-disable-next-line no-console
      console.error(`[redis] "${op}" başarısız, bellek yoluna düşüldü: ${msg}`);
    }
    warnProdOnce(
      `redis-error:${op}`,
      `Redis "${op}" hatası — bellek yoluna düşüldü. Redis varsa bu yalnızca geçici bir kesintidir ama bu işlem instance belleğiyle sınırlanmıştır: ${msg}`
    );
    return await fallback();
  }
}

export const keyReport = (id: string) => `ya:report:${id}`;
export const keyPlace = (placeKey: string, locale: string) => `ya:place:${placeKey}::${locale}`;
export const keyToken = (token: string) => `ya:token:${token}`;
export const keyLead = (email: string) => `ya:lead:${email.toLowerCase()}`;
/** Lead dizini (bülten/dışa aktarım). Kayan TTL: son lead yazımından LEAD_TTL sonra düşer. */
export const keyLeadSet = 'ya:leads';
export const keyHour = (ip: string) => `ya:q:h:${ip}`;
export const keyDay = (day: string) => `ya:q:d:${day}`;
/** IP'nin günlük analiz sayacı — global günlük kotanın tek istemci tarafından
 *  tüketilip siteyi kilitlemesini engeller (global sayaç: ya:q:d:<gün>). */
export const keyIpDay = (ip: string, day: string) => `ya:q:pd:${ip}:${day}`;
/** IP'nin saatlik İSTEK sayacı — analiz sayacından ayrıdır: cache HIT de sayılır,
 *  aksi hâlde bir istemci tek bir cache'li linki sınırsız kez çalıştırıp
 *  kota maliyeti olmadan trafik üretebilirdi. */
export const keyIpRequest = (ip: string) => `ya:q:req:${ip}`;
