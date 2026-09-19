import { getRedis, keyDay, keyHour } from './redis';
import { memStore } from './types';

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const dailyLimit = () => Number(process.env.DAILY_NEW_ANALYSIS_LIMIT || 12);
const perHour = () => Number(process.env.RATE_LIMIT_PER_HOUR || 2);

export async function checkQuota(ip: string): Promise<{ ok: boolean; reason?: string }> {
  const redis = getRedis();
  if (!redis) return checkQuotaMemory(ip);

  const day = todayKey();
  const [dayCount, ipCount] = (await redis.mget<number[]>(keyDay(day), keyHour(ip))) || [];
  if ((dayCount || 0) >= dailyLimit()) return { ok: false, reason: 'daily_quota_exceeded' };
  if ((ipCount || 0) >= perHour()) return { ok: false, reason: 'rate_limited' };
  return { ok: true };
}

export async function logUsage(ip: string, _placeKey: string): Promise<void> {
  const redis = getRedis();
  if (!redis) {
    memStore.memUsage.push({
      date: todayKey(),
      ip,
      place_key: _placeKey,
      ts: Date.now()
    } as unknown as { date: string; ip: string; place_key: string });
    return;
  }
  // Sayaç + ilk yazımda TTL (sabit pencere).
  const day = todayKey();
  const d = await redis.incr(keyDay(day));
  if (d === 1) await redis.expire(keyDay(day), 86400);
  const h = await redis.incr(keyHour(ip));
  if (h === 1) await redis.expire(keyHour(ip), 3600);
}

function checkQuotaMemory(ip: string): { ok: boolean; reason?: string } {
  const now = Date.now();
  const day = todayKey();
  const todayAll = memStore.memUsage.filter((u) => u.date === day);
  if (todayAll.length >= dailyLimit()) return { ok: false, reason: 'daily_quota_exceeded' };
  const hourAgo = now - 3600_000;
  const ipRecent = memStore.memUsage.filter(
    (u) => u.ip === ip && (u as unknown as { ts: number }).ts > hourAgo
  );
  if (ipRecent.length >= perHour()) return { ok: false, reason: 'rate_limited' };
  return { ok: true };
}
