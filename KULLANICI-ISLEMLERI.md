# KULLANICI İŞLEMİ GEREKEN YERLER (tek dosyalık kontrol listesi)

Kodun %100'ü yazıldı ve mock modda çalışıyor. Gerçek servislere bağlanmak için
sadece aşağıdaki 5-10 dakikalık işlemler sizde kaldı (API anahtarları bende yok):

## 1) Upstash Redis (zorunlu — gerçek veri için)
1. https://console.upstash.com → yeni database açın (free tier)
2. REST API sekmesindeki `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`
   değerlerini `.env.local` dosyasına yazın
3. Not: bu anahtarlar girilene kadar sistem bellek-içi (in-memory) modda çalışır;
   Vercel'de her deploy/instance veriyi unutur. Gerçek kullanım öncesi şart.
   (Eski Supabase talimatı geçersizdir — kodda hiç SUPABASE geçmiyor.)

## 2) Apify (zorunlu — gerçek yorumlar için)
1. https://console.apify.com → kayıt (kredi kartsız free plan, $5 kredi/ay)
2. Account → Integrations → API token alıp `APIFY_API_TOKEN` olarak yazın
3. Kredi kartı BAĞLAMAYIN. Kota bitince `/api/analyze` zaten 429 döner.
4. Token yokken sistem gerçekçi mock yorumlarla çalışır (kota yakmaz).

## 3) Google AI Studio (zorunlu — gerçek AI analizi için)
1. https://aistudio.google.com/app/apikey → API key alın
2. `GOOGLE_AI_API_KEY` olarak yazın
3. `GEMMA_MODEL` varsayılanı `gemma-3-27b-it`. Plandaki "Gemma 4 31B" adı
   AI Studio'da farklıysa listedeki gerçek model id'yi yazın.
4. Anahtar yokken heuristic (ortalama-bazlı) özet üretilir.

## 4) Brevo (double opt-in e-postası için — domainsiz sender)
1. https://brevo.com → ücretsiz hesap (telefon istemez, e-posta doğrulamalı)
2. Senders bölümünde Gmail adresinizi doğrulayın (gelen kutunuza kod gelir)
3. SMTP & API sayfasından API key üretin
4. `BREVO_API_KEY` + `BREVO_FROM` (örn. `TrueReviews <adres@gmail.com>`,
   doğruladığınız adresle birebir) yazın
5. Anahtar yokken MOCK e-posta moduna düşer: onay linki ekrandaki
   "geliştirici önizlemesi" kutusunda + Vercel loglarında görünür.
   Sıkı double opt-in akışı yine de zorunludur (linke tıklanmadan rapor açılmaz).
   Ücretsiz kota: günde 300 e-posta.

## 5) Cloudflare Turnstile (önerilir — bot koruması)
1. https://dash.cloudflare.com → Turnstile → site ekleyin
2. `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` yazın
3. Yokken doğrulama pasif moda düşer (form çalışır, koruma olmaz).

## 6) Vercel deploy
1. Repo'yu GitHub'a push'layın → https://vercel.com → Import
2. Environment Variables'a yukarıdaki anahtarları ekleyin (Production + Preview)
3. `APP_URL` alanına `https://<projeniz>.vercel.app` yazın (private env, `NEXT_PUBLIC_`
   prefix YOK — `NEXT_PUBLIC_APP_URL` diye bir değişken eklemeyin, kod bunu okumuyor)
4. Deploy. `vercel.json` + `next-sitemap` (sitemap/robots) hazır.
   Not: `NEXT_PUBLIC_*` değişirse Redeploy şart (build-time gömülür).

## Hızlı test (anahtarsız)
```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
# http://localhost:3000/tr adresine gidin, herhangi bir google maps linki yapıştırın
# (mock yorum + heuristic analiz döner), e-posta girin, çıkan devPreviewUrl linkine tıklayın.
```
