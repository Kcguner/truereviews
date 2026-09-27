#!/usr/bin/env node
/**
 * GERCEK Gemma gecikme olcumu + thinking A/B testi.
 *
 * Amac: "Gemma ~10 sn" dedigimiz sey NEREDEN geliyor? Iki aday:
 *   (a) prompt PREFILL'i (yorumlari okumak)  -> prompt kucultmekle hizlanir
 *   (b) cikti DECODE + modelin DUSUNMESI      -> prompt kucultmekle HIZLANMAZ
 * Bu betik ikisini ayirir: ayni gercek yorumlarla, thinking acik/kapali,
 * istek basina sure ve token sayisi olcer.
 *
 * Girdi: `measure-review-lengths.mjs` ile Redis'ten cekilen gercek yorumlar.
 * Once o betigi calistirip ciktida "Toplam yorum" degerini buraya vererek
 * --reviews <yorum_sayisi> ile calistirabilirsin; ya da asagidaki gibi
 * gercek bir rapor id'si verilir.
 *
 * Kullanim:
 *   GOOGLE_AI_API_KEY=... GEMMA_MODEL=... node scripts/measure-gemma-latency.mjs --report <ya:report:id>
 *   veya yorum sayisi ile (metin uretmez, yalnizca sure olcer):
 *   GOOGLE_AI_API_KEY=... GEMMA_MODEL=... node scripts/measure-gemma-latency.mjs --synthetic 20
 *
 * Cikis: her senaryo icin sure, HTTP durumu, token sayilari (varsa) ve
 * uretilen ozetin uzunlugu. Boylece "10 sn kisa prompttan mi geliyor"
 * sorusu sayisal olarak cevaplanir.
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

const KEY = process.env.GOOGLE_AI_API_KEY || '';
const MODEL = process.env.GEMMA_MODEL || '';
if (!KEY || KEY.length < 20) {
  console.error('GOOGLE_AI_API_KEY gercek degil (yerel .env.local placeholder).');
  console.error('Vercel degeriyle calistir:  GOOGLE_AI_API_KEY=<...> node scripts/measure-gemma-latency.mjs --synthetic 20');
  process.exit(1);
}
if (!MODEL) {
  console.error('GEMMA_MODEL tanimsiz. Vercel degerini ver:  GEMMA_MODEL=<...>');
  process.exit(1);
}

const args = process.argv.slice(2);
const arg = (k) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : null;
};
const reportId = arg('--report');
const syntheticCount = Number(arg('--synthetic') || 20);

async function loadReviews() {
  if (reportId) {
    const { Redis } = await import('@upstash/redis');
    const url = process.env.UPSTASH_REDIS_REST_URL || '';
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    if (url.length < 20 || token.length < 20) throw new Error('Redis icin gercek UPSTASH_* gerekli.');
    const row = await Redis.fromEnv().get(reportId);
    const rv = row?.reviews || [];
    if (!rv.length) throw new Error(`${reportId} icinde yorum yok.`);
    return rv.map((r) => ({ text: String(r?.text ?? ''), rating: Number(r?.rating) || 3 }));
  }
  // Yedek: gercek dagilima yakin uzunlukta sentetik yorumlar. MUTLAKA
  // gercek veriyle degistirin; sentetik sadece "hangi katsayi azaltiriz"
  // sorusuna ilk bakis verir.
  const base =
    'Cafe gerçekten çok temizti, personeller ilgiliydi ama fiyatlar biraz yüksek. Kahve tam kıvamındaydı. ' +
    'Kahvaltı çeşidi azdı, pastane kalitesinde değildi. Servis hızlıydı, teşekkürler. Yan yana oturduğumuz için masalar biraz yakın.';
  return Array.from({ length: syntheticCount }, (_, i) => ({
    text: base.slice(0, 150 + ((i * 97) % 700)),
    rating: 1 + (i % 5)
  }));
}

const reviews = await loadReviews();
const body = reviews
  .map((r, i) => `${i + 1}. [${r.rating}/5] ${r.text}`)
  .join('\n');

const PROMPT = `Sen bir müşteri yorum analistisin. Aşağıda bir işletmenin ${reviews.length} Google Maps yorumu var.

YORUMLAR:
${body}

GÖREV: Yorumları analiz et ve SADECE şu JSON'u üret:
{"score": <0-10>, "summary": "<2-3 cümle>", "top_complaints": [{"topic":"","count":0,"example":""}],"top_praises":[{"topic":"","count":0,"example":""}],"action_suggestion": "<tek cümle>"}

Kurallar: SADECE ham JSON döndür. Skor 1-2 yıldız düşük, 4-5 yıldız yüksek puana yansısın.`;

const promptChars = PROMPT.length;
console.log(`Model      : ${MODEL}`);
console.log(`Yorum      : ${reviews.length} adet, govde ${body.length} karakter`);
console.log(`Prompt     : ${promptChars} karakter (~${Math.round(promptChars / 3.5)} token kaba tahmin)\n`);

async function run(label, extra) {
  const t0 = Date.now();
  let res;
  let out = null;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: PROMPT }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.3, ...extra }
        })
      }
    );
    out = await res.json().catch(() => null);
  } catch (e) {
    console.log(`${label.padEnd(26)} HATA (ag)        : ${Date.now() - t0} ms  ${e.message}`);
    return;
  }
  const ms = Date.now() - t0;
  const text =
    out?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const usage = out?.usageMetadata;
  console.log(`${label.padEnd(26)} ${String(res.status).padEnd(4)} ${String(ms + ' ms').padStart(8)}`);
  if (usage) {
    console.log(
      `${''.padEnd(26)} token: giris ${usage.promptTokenCount ?? '?'} / cikti ${usage.candidatesTokenCount ?? '?'}` +
        (usage.thoughtsTokenCount ? ` / dusunme ${usage.thoughtsTokenCount}` : '')
    );
  }
  console.log(`${''.padEnd(26)} cikti metni: ${text.length} karakter`);
  if (!res.ok) console.log(`${''.padEnd(26)} hata: ${JSON.stringify(out).slice(0, 220)}`);
  return { ms, text, out, status: res.status };
}

console.log('--- senaryolar (her biri tek sefer) ---');
const plain = await run('thinking yok (simdiki hali)', {});
console.log('');
const zero = await run('thinkingBudget 0', { thinkingConfig: { thinkingBudget: 0 } });
console.log('');
const low = await run('thinkingBudget 1024', { thinkingConfig: { thinkingBudget: 1024 } });

console.log('\n--- yorum ---');
if (zero?.status && zero.status !== 200) {
  console.log('thinkingConfig bu modelde DESTEKLENMIYOR olabilir (yukaridaki hata satiri).');
  console.log('O durumda 10 sn saf decode+prefill demektir; prompt kucultme isi yaramaz.');
} else if (plain && zero && zero.ms < plain.ms * 0.6) {
  console.log(`thinking kapatmak belirgin hizlanti: ${plain.ms} ms -> ${zero.ms} ms.`);
  console.log('AMA kaliteyi AYNI yorumlarda karsilastirmadan karar verme.');
} else {
  console.log('Belirgin hizlanma yok -> prompt boyutu veya thinking ana darboğaz degil.');
}
console.log('\nKaliteyi korumak icin A/B: ayni yorumlarla iki ciktinin summary/topic');
console.log('alanlarini karsilastir. Ayirt edemiyorsan hiz kazanci kalite bedelinden geliyordur.');
