import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { warnProdOnce } from './env-guard';

let cached: SupabaseClient | null = null;
let warnedMissing = false;

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getSupabaseAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const key = serviceKey || anonKey;
  if (!url || !key) {
    if (!warnedMissing) {
      warnedMissing = true;
      warnProdOnce(
        'supabase-missing',
        'Supabase bağlı değil — kota/önbellek in-memory çalışıyor. Vercel multi-instance ortamda limitler delinebilir, deploy öncesi bağlayın.'
      );
    }
    return null;
  }
  if (!cached) cached = createClient(url, key);
  return cached;
}
