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

export function isGoogleMapsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    const host = u.hostname.toLowerCase();
    // google.* (google.com, google.com.tr, maps.google.com, business.google.com…),
    // goo.gl / maps.app.goo.gl kısaltmaları ve işletmelerin sık paylaştığı g.page kısaltmaları.
    return (
      host.includes('google.') ||
      host.includes('goo.gl') ||
      host.includes('maps.app.goo.gl') ||
      host === 'g.page' ||
      host.endsWith('.g.page')
    );
  } catch {
    return false;
  }
}
