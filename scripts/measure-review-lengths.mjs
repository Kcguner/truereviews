#!/usr/bin/env node
/**
 * GERÇEK yorum uzunlugu olcumu (tahmin degil).
 *
 * Neden: `lib/apify.ts` yorum basina 2000 karakter SINIRINI uyguluyor
 * (`.slice(0, 2000)`). Bu bir tavan, tamamlama degil: 100 karakterlik bir
 * yorum 100 karakter gonderir. Soru su: gercek yorumlar bu tavana ne kadar
 * yakin? Cogu 2000'in cok altindaysa tavan zararsizdir ve prompt zaten kucuk
 * demektir; cok uzun yorumlar yogunsa tavan her seferinde isabet ediyor
 * demektir.
 *
 * Veri nereden: Upstash Redis'teki `ya:report:*` kayitlari, `reviews` alani
 * tam yorum metnini icerir. Yani canli kazima yapmadan gercek dagilim olculur.
 *
 * Kullanim:
 *   UPSTASH_REDIS_REST_URL=... UPSTASH_REDIS_REST_TOKEN=... \
 *     node scripts/measure-review-lengths.mjs
 *
 * Girisler `.env.local` varsa oradan okunur.
 */
import { readFileSync, existsSync } from 'node:fs';

function loadEnv() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^["']|["']$/g, '');
    if (v && !process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv();

const url = process.env.UPSTASH_REDIS_REST_URL || '';
const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';

// Placeholder tespiti: .env.local'de degerler 1 karakterlik sahte oluyor.
const looksReal = (v) => v && v.length >= 20 && !/^[a-z]$/i.test(v);
if (!looksReal(url) || !looksReal(token)) {
  console.error(
    'UPSTASH_REDIS_REST_URL / TOKEN gercek degil (yerel .env.local placeholder).\n' +
      'Bu olcum GERCEK canli veri gerektirir. Vercel ortam degerleriyle calistir:\n' +
      '  UPSTASH_REDIS_REST_URL=<...> UPSTASH_REDIS_REST_TOKEN=<...> \\\n' +
      '    node scripts/measure-review-lengths.mjs'
  );
  process.exit(1);
}

const { Redis } = await import('@upstash/redis');
const redis = Redis.fromEnv();

const CAPS = [500, 800, 1200, 2000];
const perReport = [];

let cursor = 0;
let scanned = 0;
do {
  const res = await redis.scan(cursor, { match: 'ya:report:*', count: 200 });
  cursor = Number(res.nextCursor || 0);
  for (const key of res.keys || []) {
    const row = await redis.get(key);
    if (!row || !Array.isArray(row.reviews)) continue;
    scanned++;
    const texts = row.reviews
      .map((r) => (typeof r?.text === 'string' ? r.text : ''))
      .filter((t) => t.trim().length > 0);
    if (texts.length) perReport.push({ id: key, texts });
  }
} while (cursor !== 0);

const all = perReport.flatMap((r) => r.texts.map((t) => t.length)).sort((a, b) => a - b);
if (!all.length) {
  console.error('Redis\'te yorum metni bulunamadı. En az bir gerçek analiz çalıştırılmış olmalı.');
  process.exit(1);
}

const pct = (p) => all[Math.min(all.length - 1, Math.floor((p / 100) * all.length))];
const total = all.reduce((a, b) => a + b, 0);

console.log(`\nRapor sayisi      : ${perReport.length}`);
console.log(`Toplam yorum      : ${all.length}`);
console.log(`Yorum basina ortalama: ${Math.round(total / all.length)} karakter\n`);
console.log('Dagilim (karakter):');
console.log(`  min   : ${all[0]}`);
console.log(`  p50   : ${pct(50)}`);
console.log(`  p75   : ${pct(75)}`);
console.log(`  p90   : ${pct(90)}`);
console.log(`  p95   : ${pct(95)}`);
console.log(`  p99   : ${pct(99)}`);
console.log(`  max   : ${all[all.length - 1]}\n`);

console.log('Tavanin gercek etkisi (kac yorum kirpilir):');
for (const c of CAPS) {
  const n = all.filter((l) => l > c).length;
  const saved = all.filter((l) => l > c).reduce((a, l) => a + (l - c), 0);
  console.log(
    `  ${String(c).padStart(4)} karakter -> ${String(n).padStart(4)} yorum kirpilir ` +
      `(%${((n / all.length) * 100).toFixed(1)}  kazanilan toplam: ${saved} karakter)`
  );
}

const sizes = perReport.map((r) => r.texts.join('\n').length).sort((a, b) => a - b);
const psz = (p) => sizes[Math.min(sizes.length - 1, Math.floor((p / 100) * sizes.length))];
console.log('\nBir raporun yorum govdesi toplam karakter (prompt\'un degisken kismi):');
console.log(`  p50 : ${psz(50)}`);
console.log(`  p90 : ${psz(90)}`);
console.log(`  max : ${sizes[sizes.length - 1]}`);
console.log(`\nSabit yonlendirme metni ~1.5k karakter; yukaridaki degiskendir.`);
console.log('Yorum basina TAVAN 2000 degil, kirpma noktasi. 800e indirmenin');
console.log('getirisi = yukarida 800 satiri: gercek kazanc (0 ise yapma).\n');
