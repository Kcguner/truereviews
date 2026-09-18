import { getSupabaseAdmin } from './supabase';
import { memStore } from './types';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function checkQuota(ip: string): Promise<{ ok: boolean; reason?: string }> {
  const dailyLimit = Number(process.env.DAILY_NEW_ANALYSIS_LIMIT || 12);
  const perHour = Number(process.env.RATE_LIMIT_PER_HOUR || 2);
  const now = Date.now();

  const sb = getSupabaseAdmin();
  if (!sb) {
    // Mock: in-memory sayaç
    const day = todayKey();
    const todayAll = memStore.memUsage.filter((u) => u.date === day);
    if (todayAll.length >= dailyLimit)
      return { ok: false, reason: 'daily_quota_exceeded' };
    const hourAgo = now - 3600_000;
    const ipRecent = memStore.memUsage.filter(
      (u) => u.ip === ip && (u as unknown as { ts: number }).ts > hourAgo
    );
    if (ipRecent.length >= perHour) return { ok: false, reason: 'rate_limited' };
    return { ok: true };
  }

  const day = todayKey();
  const { count: dayCount } = await sb
    .from('usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('log_date', day);
  if ((dayCount || 0) >= dailyLimit) return { ok: false, reason: 'daily_quota_exceeded' };

  const hourAgoIso = new Date(now - 3600_000).toISOString();
  const { count: ipCount } = await sb
    .from('usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', hourAgoIso);
  if ((ipCount || 0) >= perHour) return { ok: false, reason: 'rate_limited' };
  return { ok: true };
}

export async function logUsage(ip: string, placeKey: string): Promise<void> {
  const sb = getSupabaseAdmin();
  if (!sb) {
    memStore.memUsage.push({
      date: todayKey(),
      ip,
      place_key: placeKey,
      ts: Date.now()
    } as unknown as { date: string; ip: string; place_key: string });
    return;
  }
  await sb.from('usage_log').insert({ ip, place_key: placeKey, log_date: todayKey() });
}
