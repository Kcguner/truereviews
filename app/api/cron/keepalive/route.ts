import { NextRequest, NextResponse } from 'next/server';
import { getRedis, isRedisConfigured } from '@/lib/redis';

export const dynamic = 'force-dynamic';

/**
 * Upstash FREE veritabanları 14 gün boyunca tek bir komut çalışmazsa
 * otomasyonla SİLİNİYOR (gerçek olay: 10 Kasım 2026 "Database Deleted",
 * lead'ler yedekten geri dönmek zorunda kaldı). Vercel cron bu ucu günde
 * bir kez çağırır; tek bir PING bile "activity" sayıldığı için silme
 * otomasyonu bir daha tetiklenmez. Site trafiği olsa da olmasa da çalışır.
 *
 * Yetki: CRON_SECRET tanımlıysa Vercel çağrıya `Authorization: Bearer <secret>`
 * başlığını otomatik ekler ve uç yabancı çağrılara kapanır. Tanımlı değilse
 * uç açık kalır ama yaptığı tek şey PING olduğundan suistimal yüzeyi yoktur
 * (kota sayaçlarına dokunmaz, veri yazmaz).
 */
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  if (!isRedisConfigured()) {
    // Yapılandırma hatası da cron loglarında görünsün, ama 500 üretmesin:
    // cron'un görevi sessiz tutmak, alarm üretmek değil.
    console.error('[keepalive] UPSTASH_REDIS_REST_URL/TOKEN tanımlı değil — ping atılamadı.');
    return NextResponse.json({ ok: false, redis: 'not_configured' });
  }

  try {
    const redis = getRedis();
    if (!redis) {
      return NextResponse.json({ ok: false, redis: 'client_error' });
    }
    const pong = await redis.ping();
    return NextResponse.json({ ok: pong === 'PONG' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Buradaki hata PROD-GUARD'a gitmez: bu uç kullanıcı yolunda değil ve
    // günlük bir kez çalışır; başarısızlık Vercel cron loglarında yeter.
    console.error(`[keepalive] Redis ping başarısız: ${msg}`);
    return NextResponse.json({ ok: false, redis: 'error' });
  }
}
