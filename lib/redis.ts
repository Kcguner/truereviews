import { Redis } from '@upstash/redis';
import { warnProdOnce } from './env-guard';

let cached: Redis | null = null;
let warned = false;

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  );
}

/** Upstash Redis yoksa null döner (çağıran memory fallback'e düşer). */
export function getRedis(): Redis | null {
  if (!isRedisConfigured()) {
    if (!warned) {
      warned = true;
      warnProdOnce(
        'redis-missing',
        'Upstash Redis bağlı değil — kota/önbellek in-memory çalışıyor. Vercel multi-instance ortamda limitler delinebilir ve restartta raporlar uçar; deploy öncesi Redis bağlayın.'
      );
    }
    return null;
  }
  if (!cached) cached = Redis.fromEnv();
  return cached;
}

export const keyReport = (id: string) => `ya:report:${id}`;
export const keyPlace = (placeKey: string, locale: string) => `ya:place:${placeKey}::${locale}`;
export const keyToken = (token: string) => `ya:token:${token}`;
export const keyLead = (email: string) => `ya:lead:${email.toLowerCase()}`;
export const keyHour = (ip: string) => `ya:q:h:${ip}`;
export const keyDay = (day: string) => `ya:q:d:${day}`;
