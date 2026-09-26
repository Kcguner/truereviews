export interface ToneSplit {
  pos: number; // yüzde
  neu: number; // yüzde
  neg: number; // yüzde
}

export interface AnalysisReport {
  score: number; // 0-10
  summary: string;
  top_complaints: { topic: string; count: number; example?: string }[];
  top_praises: { topic: string; count: number; example?: string }[];
  action_suggestion: string;
  review_count: number;
  business_name: string;
  rating_histogram?: ToneSplit;
}

export interface PreviewData {
  score: number;
  teaser: string;
  business_name: string;
  review_count: number;
  tone?: ToneSplit;
}

export interface StoredReport {
  id: string;
  place_url: string;
  place_key: string;
  business_name: string;
  reviews: { text: string; rating: number; author?: string }[];
  full_report: AnalysisReport;
  preview: PreviewData;
  locale: string;
  created_at: string;
  email_unlocked: string | null;
}

// ---- In-memory fallback (Redis yokken / mock mod) ----
// Not: serverless ortamda kalıcı değildir; gerçek kullanımda Upstash Redis şarttır.
const memReports = new Map<string, StoredReport>();
const memByPlace = new Map<string, StoredReport>();
const memLeads: Record<string, unknown>[] = [];
const memUsage: { date: string; ip: string; place_key: string }[] = [];

export const memStore = { memReports, memByPlace, memLeads, memUsage };

export function normalizePlaceUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/+$/, '');
}

// ---- Google Maps host allowlisti ----
// GÜVENLİK DÜZELTMESİ: eski kod `host.includes('google.')` / `host.includes('goo.gl')`
// ile substring eşleştiriyordu. Substring eşleşmesi `notgoogle.com`, `google.evil.com`,
// `evilgoo.gl.attacker.com` gibi sahte hostları da geçiriyordu; bu hostlar ücretli Apify
// çağrısını tetikleyip Redis cache anahtarını zehirleyebiliyordu.
// Artık sadece tam eşleşme veya NOKTA sınırında suffix eşleşmesi kabul edilir;
// `includes()`/`startsWith()` içermeyen substring kontrollerine GERİ DÖNMEMELİYİZ.

// Alt domain (maps., business., www. …) + `google` + ülke uzantısı (com, com.tr, co.uk, de, com.au …).
// Son iki label saf alfabetik olmak zorunda: "google.evil.com" ve "google.com.tr.evil.com" bu yüzden elenir.
const GOOGLE_HOST_RE = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)*google\.[a-z]{2,3}(?:\.[a-z]{2,3})?$/;

// Kısaltma domainleri. `maps.app.goo.gl` ayrı bir kural gerektirmez: `.goo.gl` suffix'i zaten onu kapsar.
const GOOGLE_SHORT_HOSTS = ['goo.gl', 'g.page'];

// Savunma-için-derinlik: Google'ın KULLANMADIĞI, ücretsiz/ucuz kayıt yapılabilen uzantılar.
// Bu liste olmadan `https://google.zz/maps` gibi squat edilebilir sahte hostlar geçerdi.
// (Google'ın gerçek ülke domainleri bu listede yoktur; liste sadece kapsam dışı bırakılır.)
const SQUATTABLE_TLDS = new Set([
  'ai', 'cf', 'fm', 'ga', 'gq', 'la', 'ml', 'ms', 'nu', 'pw', 'sh', 'st', 'tc', 'to', 'tk', 'zz',
]);

// Nokta sınırı şart: `endsWith('.goo.gl')` "xgoo.gl" ve "evilgoo.gl.attacker.com" değerlerini
// eler, düz `includes('goo.gl')` ise ikisini de geçirirdi.
function matchesGoogleHost(host: string): boolean {
  if (SQUATTABLE_TLDS.has(host.slice(host.lastIndexOf('.') + 1))) {
    return false;
  }
  if (GOOGLE_HOST_RE.test(host)) {
    return true;
  }
  return GOOGLE_SHORT_HOSTS.some((allowed) => host === allowed || host.endsWith('.' + allowed));
}

export function isGoogleMapsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    // Sadece http/https: javascript:, data:, file:, ftp: gibi şemaları reddet.
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return false;
    }
    // Sondaki nokta: "https://google.com./maps" -> "google.com"
    const host = u.hostname.toLowerCase().replace(/\.+$/, '');
    if (!host) {
      return false;
    }
    // google.* (google.com, google.com.tr, maps.google.com, business.google.com…),
    // goo.gl / maps.app.goo.gl kısaltmaları ve işletmelerin sık paylaştığı g.page kısaltmaları.
    return matchesGoogleHost(host);
  } catch {
    return false;
  }
}
