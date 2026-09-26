# TrueReviews

**Google Maps yorumlarının dürüst, tek sayfalık özeti — 10 dilde, kayıt ve ücret gerektirmez.**

Kullanıcı Google Maps işletme linkini yapıştırır, sistem son yorumları okuyup bir
memnuniyet skoru, tekrar eden övgü/şikayet konuları ve haftalık tek somut aksiyon
önerisi üretir. Önizleme anında ve ücretsizdir; tam rapor e-posta onayı ile açılır.
Hedef kitle, Google Maps'te gerçek bir vitrini olan küçük işletme sahipleri
(restoran, kafe, otel, eczane, servis vb.) — dashboard veya kurulum gerektirmeyen,
tek ekrana sığan dürüst bir özet.

[![CI](https://github.com/Kcguner/truereviews/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Kcguner/truereviews/actions/workflows/ci.yml)
[![Vitest](https://img.shields.io/badge/test-vitest%205.0.1-6E9F37?logo=vitest&logoColor=FFD34E)](https://vitest.dev)

- Kaynak kod: [github.com/Kcguner/truereviews](https://github.com/Kcguner/truereviews)
- Lisans: MIT
- Maliyet: **0 TL** (aşağıdaki ücretsiz katmanların hepsiyle çalışır)

## İçindekiler

- [Demo](#-demo)
- [Özellikler](#-özellikler)
- [Mimari](#-mimari)
- [Teknoloji](#-teknoloji)
- [Çoklu dil](#-çoklu-dil)
- [Güvenlik & KVKK](#-güvenlik--kvkk)
- [Maliyet](#-maliyet)
- [Kurulum](#-kurulum)
- [Ortam değişkenleri](#-ortam-değişkenleri)
- [Test & CI](#-test--ci)
- [Deploy](#-deploy)
- [Lisans](#-lisans)
- [Notlar](#-notlar)

## 🎬 Demo

**https://get-truereviews.vercel.app**

_Yayın adresi `.env.local` içindeki `APP_URL` değeriyle birebir aynıdır; canonical,
Open Graph ve sitemap bu değişkenden üretilir._

<!-- Görsel: rapor ekranının ekran görüntüsünü docs/screenshot.png olarak kaydet,
     sonra aşağıdaki satırın yorumunu kaldır. -->
<!-- ![TrueReviews rapor ekranı](docs/screenshot.png) -->

## ✨ Özellikler

- **Tek alan, tek tık:** Google Maps işletme linki (uzun `google.com/maps/place/…`,
  `goo.gl`, `maps.app.goo.gl` ve `g.page` kısaltmaları) yapıştırılır; sunucu
  linkin gerçekten bir işletme sayfası olduğunu doğrular. Yapıştırma butonu ve
  "örnek işletmeyle dene" kısayolu dahil.
- **Sunucuda kilitli önizleme (emailwall):** `/api/analyze` yanıtı yalnızca
  `reportId` + önizleme alanlarını içerir. Tam rapor (temalar + aksiyon önerisi)
  tarayıcıya **hiçbir koşulda gönderilmez**; CSS blur veya modal ile gizleme
  kullanılmaz — veri sunucuda kalır.
- **Gerçek yorum analizi:** Apify üzerindeki `compass/google-maps-reviews-scraper`
  actor'ü çalıştırılır, en fazla `MAX_REVIEWS` yorum alınır.
- **Dilinde üretilen rapor:** Gemma, okuduğu yorumların dilinden bağımsız olarak
  analizi **hedef dilde** yazar. Ayrı bir çeviri katmanı yoktur.
- **Sert JSON disiplini:** Prompt yalnızca JSON ister; modelin markdown fence veya
  ön/son açıklama sarması `extractJson` ile soyulur, alan şekli `isValidReport`
  ile doğrulanır. Geçersiz çıktı sessizce yutulmaz — heuristic rapora düşülür ve
  `mocked: true` işaretlenir.
- **Dayanıklı AI çağrısı:** `4xx` bir config hatasıdır ve yüksek sesle fırlatılır;
  kalıcı `5xx` / ağ hatası bir kez kısa bekleyip yeniden denenir, hâlâ başarısızsa
  kullanıcı yine de rapor alır.
- **24 saatlik önbellek:** Aynı işletme + aynı dil için tekrar analizde Apify ve
  Gemma'ya gidilmez. Mock sonuçlar önbelleğe *yazılmaz* — bir sonraki denemede
  gerçek analiz tekrar denenebilir.
- **İki kademeli quota:** IP başına saatlik + global günlük analiz sayacı, Redis
  üzerinde TTL'li sayaçlarla tutulur; kota aşımında `429` döner.
- **Çift onaylı (double opt-in) e-posta:** Tam rapor, e-postadaki onay linki
  tıklanmadan açılmaz. Onay token'ı 48 saat geçerli.
- **Token'ın kendisi rapor değildir:** `/[locale]/rapor?token=…` sayfası
  `GET /api/verify` çağırır; tam rapor yalnızca orada, sunucuda doğrulanmış
  olarak döner ve **yeni bir Apify/Gemma çağrısı yapılmaz**.
- **Geçici e-posta engeli:** `disposable-email-domains` listesi ile
  mailinator / 10minutemail gibi sağlayıcılar reddedilir; KVKK onayı e-posta
  kilidinin önünde zorunlu bir adımdır.
- **Bot koruması:** Cloudflare Turnstile; anahtar yoksa form çalışmaya devam eder,
  üretimde ise bu sessiz düşüş `[PROD-GUARD]` loguyla yüksek sesle bildirilir.
- **Tek sayfalık rapor görünümü:** Animasyonlu yarım daire skor göstergesi (0–100),
  övgü/nötr/şikayet dağılım çubuğu, konu listesi (kaç yorumda geçtiği ve gerçek
  yorum alıntısıyla) ve tek cümlelik aksiyon bloğu. Tarayıcının PDF dönüştürmesi
  ile tek tuşla yazdırma.
- **10 dil, tam i18n:** Arayüz, yasal sayfalar, SSS, meta etiketleri ve OG görseli
  seçilen dile göre üretilir. Arapça ve Farsça için tam RTL.
- **Yasal altyapı:** 10 dilde `sss`, `gizlilik`, `kvkk`, `iletisim` sayfaları;
  zorunlu KVKK onay metni her dilde ayrı yazılmış.
- **SEO / GEO:** Dile özel `canonical` + `hreflang` (x-default dahil), 10 dil için
  ana sayfa ve 40 yasal sayfalık `sitemap.xml`, `/api/` ve `/*/rapor` dışlayan
  `robots.txt`, `Organization` / `WebSite` / `SoftwareApplication` / `FAQPage`
  JSON-LD, dinamik OG görseli ve `public/llms.txt`.
- **Anahtar gerektirmeyen demo modu:** Tek bir API anahtarı olmadan gerçekçi mock
  yorumlar + heuristic (ortalama tabanlı) analizle uçtan uca çalışır.

## 🏗️ Mimari

```
Kullanıcı
  │
  ├─ GET /[locale]                     next-intl middleware · localePrefix: 'always'
  │                                    (NEXT_LOCALE çerezi → Accept-Language → 'tr')
  │
  ├─ POST /api/analyze  { placeUrl, locale, turnstileToken }
  │    │
  │    ├─ 1) URL doğrulama ............ google.* · goo.gl · maps.app.goo.gl · g.page
  │    ├─ 2) Turnstile ................ secret varsa doğrular, yoksa pasif mod
  │    ├─ 3) Kota .................... Redis: IP/saat (TTL 1h) + global/gün (TTL 24h)
  │    ├─ 4) Önbellek ................. aynı işletme + dil, 24 saat → HIT ise 5-6 atlanır
  │    ├─ 5) Apify ................... compass/google-maps-reviews-scraper → ≤ MAX_REVIEWS yorum
  │    ├─ 6) Gemma (Google AI Studio)  dilinde JSON: score, summary,
  │    │                               top_complaints, top_praises, action_suggestion
  │    │                               4xx → hata · 5xx/ağ → heuristic rapor
  │    └─ 7) Redis ................... ya:report:{uuid} + ya:place:{key}::{locale} (24h)
  │
  └─ ◀── { reportId, preview }         TAM RAPOR YANITTA DÖNMEZ

  ── emailwall: raporun kilidini aç ──────────────────────────────────────────

  ├─ POST /api/lead  { reportId, email }
  │    ├─ format doğrulama + disposable-email-domain kontrolü
  │    ├─ Turnstile
  │    ├─ 64-hex doğrulama token'ı (TTL 48 saat) + lead → verified: '0'
  │    └─ Brevo /v3/smtp/email ....... onay linki: /[locale]/rapor?token=…
  │
  ├─ kullanıcı onay linkine tıklar → GET /[locale]/rapor?token=…
  │
  └─ GET /api/verify?token=…
       ├─ token geçerliyse lead → verified: '1', rapor kilidi açılır
       └─ ◀── { report, businessName, reviewCount, createdAt }
              (Apify/Gemma'ya YENİ istek gitmez)
```

### "2. hak" neden ikinci bir maliyet üretmiyor

Kullanıcıya anlatılan "1. hak ücretsiz önizleme, 2. hak e-posta onayıyla tam rapor"
modeli bir **kullanıcı deneyimi** kurgusudur, backend'de iki ayrı analiz değildir.
`/api/analyze` raporu üretirken tam halini Redis'e yazar ve eline yalnızca
`reportId` verir; `/api/lead` ve `/api/verify` ise **zaten var olan** bu kaydı
açar. Bu yüzden:

- kullanıcı başına 1 Apify + 1 Gemma çağrısı olur, iki değil;
- ikinci "hak"ın maliyeti sıfırdır — çünkü hiçbir dış servise gitmez;
- 24 saatlik önbellek sayesinde aynı işletmeyi ikinci bir kullanıcı da analiz
  ettirmek istediğinde dış servise tekrar gidilmez.

Bu ayrım, ücretsiz katmanlarla (Apify aylık kredi, AI Studio günlük kota)
sürdürülebilir olmanın temelidir. Uygulama katmanı ise bunu ayrıca zorlar:
`/api/analyze` sadece önizleme döner, `/api/verify` dışında hiçbir route tam raporu
vermez, `robots.txt` de `/rapor` sayfalarını dizin dışı bırakır.

## 🛠️ Teknoloji

| Katman | Araç | Neden |
|---|---|---|
| Framework | **Next.js 14.2.35** (App Router) | Aynı projede SSR, route handler'lar ve statik üretim; ayrı backend yok |
| React | **React 18.3.1** | App Router ve Server/Client Component ayrımı |
| i18n | **next-intl 3.26.5** | Path-based locale routing (`/tr/…`), `NEXT_LOCALE` çerezi, sunucu tarafı mesaj yükleme |
| Stil | **Tailwind CSS 3.4** | Utility katmanı + `globals.css` içinde token tabanlı özel tasarım sistemi (light/dark) |
| Önbellek / Kota | **Upstash Redis** (`@upstash/redis`) | Serverless'ta kalıcı durum: rapor önbelleği, TTL'li kota sayaçları, doğrulama token'ları, lead'ler |
| Yorum çekme | **Apify** (`compass/google-maps-reviews-scraper`) | Google Maps sayfa yapısı değişse bile üçüncü taraf bakımı; kredi kartı gerektirmeyen aylık kredi |
| AI analiz | **Google AI Studio / Gemini API** (`gemma-4-31b-it`) | Ücretsiz kota, `responseMimeType: application/json` ile yapılandırılmış çıktı |
| E-posta | **Brevo** (`/v3/smtp/email`) | Doğrulanmış göndericiyle double opt-in; günde 300 ücretsiz e-posta |
| Bot koruması | **Cloudflare Turnstile** | reCAPTCHA'sız, gizlilik dostu; anahtar yoksa otomatik pasif mod |
| Barındırma | **Vercel** (`vercel.json`, bölge `fra1`) | Next.js ile sıfır ayarla deploy, otomatik HTTPS, `fra1` ile Avrupa'ya sabit bölge |
| Test | **Vitest 5.0.1** + Vite 8 | Hızlı, bağımlılıksız; `fetch` stub'ı ile AI/e-posta dal testleri |
| Tip | **TypeScript 5.9** (`strict`) | Route handler ve rapor şeması için tip güvenliği |

## 🌍 Çoklu dil

Desteklenen 10 locale ([`i18n.config.ts`](i18n.config.ts)):

| Kod | Dil | Kod | Dil |
|---|---|---|---|
| `tr` | Türkçe *(varsayılan)* | `fr` | Français |
| `en` | English | `es` | Español |
| `de` | Deutsch | `nl` | Nederlands |
| `ar` | العربية *(RTL)* | `fa` | فارسی *(RTL)* |
| `ru` | Русский | `az` | Azərbaycanca |

- **Path-based routing:** Her dil `/tr/`, `/en/`, `/ar/` … altında yaşar
  (`localePrefix: 'always'`). `middleware.ts` istekleri `NEXT_LOCALE` çerezi →
  `Accept-Language` → `tr` sırasıyla çözer; `app/[locale]/layout.tsx` listesinde
  olmayan bir locale için `notFound()` döner.
- **Arayüz metinleri:** `messages/{locale}.json` başına tek dosya, sunucu
  bileşenlerinde `useTranslations`, istemci bileşenlerinde `NextIntlClientProvider`.
- **Rapor içeriği:** Ayrı bir çeviri katmanı **yoktur**. `lib/gemma.ts` prompt'un
  sonuna "yanıtı X dilinde üret" talimatını ekler; model yorumları hangi dilde
  olursa olsun okuyup analiz sonucunu doğrudan hedef dilde üretir. Bu hem daha
  hızlı, hem token olarak daha ucuzdur.
- **Locale başına ayrı SEO:** `title`, `description`, `keywords`, `canonical`,
  `hreflang` ve `og:locale` sözlükleri 10 dil için ayrı ayrı tanımlıdır.
- **Kapsam farkı:** Yasal metinler `tr` / `en` / `de` için tam metindir; diğer
  dillerde İngilizce içerik + kullanıcıya gösterilen bir çeviri notu devreye girer.
  SSS, KVKK onay metni ve yasal sayfa meta verileri ise 10 dilin tamamında
  tanımlıdır ve testlerle doğrulanır.

## 🔒 Güvenlik & KVKK

**Kötüye kullanım koruması**

- **Turnstile:** `/api/analyze` ve `/api/lead` uçları sunucu tarafında
  `siteverify` çağrısı yapar. `TURNSTILE_SECRET_KEY` tanımlı değilse doğrulama
  **pasif moda düşer** ve form çalışmaya devam eder; üretimde bu sessiz düşüş
  `lib/env-guard.ts` üzerinden `[PROD-GUARD]` olarak loglanır, gizlenmez.
- **Kota ve rate limit:** Redis'te iki sayaç tutulur — `RATE_LIMIT_PER_HOUR`
  (varsayılan 2, IP başına) ve `DAILY_NEW_ANALYSIS_LIMIT` (varsayılan 12, global).
  Sayaçlar ilk yazımda TTL alır (1 saat / 24 saat), böylece sayaç kendini temizler.
  Kota aşımında `429` ve kullanıcı dostu Türkçe mesaj döner.
- **Geçici e-posta engeli:** `disposable-email-domains` paketinin statik listesi
  üzerinden domain eşleşmesi yapılır; liste `tests/validation.test.ts` içinde
  gerçek örneklerle test edilir.
- **Güvenlik başlıkları** ([`next.config.mjs`](next.config.mjs), tüm yollarda):
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: SAMEORIGIN`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`,
  `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
  `poweredByHeader` kapatılmıştır.
- **Sıkı çift onay:** Tam rapor için e-posta tek başına yeterli değildir; onay
  linki tıklanmalıdır. Token 64 hexadecimal karakterden oluşur, tek bir rapora
  bağlıdır ve 48 saat sonunda geçersizleşir.

**KVKK ve veri**

- **Yorum içeriği değiştirilmez, silinmez, satın alınmaz.** Alıntılar gerçek
  yorumlardan `clipQuote` ile kelime ortasından bölünmeden kısaltılır; puan
  dağılımı ve tema sayımları toplu istatistiktir.
- **Reklam yok, seri mail yok.** E-posta yalnızca double opt-in onayı ve isteğe
  bağlı tek seferlik güncellemedir; KVKK metni ve ana sayfa SSS'ı bunu açıkça
  belirtir.
- **Çerez:** Takip çerezi kullanılmaz; tema tercihi yalnızca `localStorage`'da
  saklanır. Analitik isteğe bağlıdır ve veri ayarı yoksa hiç render edilmez.
- **KVKK onayı zorunlu:** E-posta formundaki onay kutusu işaretlenmeden kilit
  açılmaz; onay metni her dilde ayrı yazılmıştır.
- **Yasal sayfalar:** 10 dilde `/{locale}/gizlilik`, `/{locale}/kvkk`,
  `/{locale}/sss` ve `/{locale}/iletisim`. Toplanan veriler, kullanım amacı,
  saklama ve silme, üçüncü taraflar ve m. 11 kapsamındaki haklar açıkça yazılıdır.

**Geliştirici kolaylığı (dev/test)**

`ADMIN_EMAILS` (virgülle ayrılmış adres listesi) ve `ADMIN_BYPASS_TOKEN`
(server-only, istek başlığı veya gövde ile gönderilen gizli test anahtarı) test
akışlarını hızlandırmak için vardır: listelenen adresler onay e-postası beklemeden
tam raporu görür, doğru anahtarı bilen istekler kota muafiyeti kazanır. Boş
bırakıldığında **kapalıdır** ve normal kullanıcı akışı hiç değişmez. Bu değerler
tarayıcıya gömülmez veya kodla paketlenmez; yalnızca tanımlı oldukları ortamda
etkindir. Kullanıcıya dönük bir özellik değil, geliştirme/test içindir.

## 💰 Maliyet

**Uygulamanın tamamı ücretsiz katmanlar üzerinde çalışır: toplam maliyet 0 TL.**

| Servis | Ücretsiz katman | Bu projedeki karşılığı |
|---|---|---|
| Vercel | Hobby plan | Barındırma + route handler'lar |
| Upstash Redis | Free database | Rapor önbelleği, kota, token, lead'ler |
| Apify | Aylık **$5** kredi, kredi kartı gerekmez | ~20 yorum/analiz ile yüzlerce analiz/ay |
| Google AI Studio | Günlük ücretsiz istek kotası | `MAX_REVIEWS` yorumdan tek Gemma çağrısı |
| Brevo | Günde 300 e-posta | Yalnızca double opt-in onayı |
| Cloudflare Turnstile | Ücretsiz | Bot koruması |
| next-intl, Tailwind, Vitest, TypeScript | Açık kaynak paketler | Sunucu/Servis maliyeti yok |

Dürüst olmak gerekirse bu, "her zaman bedava kalacak" bir garanti değildir:
sağlayıcıların ücretsiz koşulları değişebilir ve bir domain adı alınırsa yıllık
gerçek bir maliyet oluşur. Taahhüt, mimarinin bu değişikliklerden bağımsız olarak
ölçeklenebilir olmasıdır.

**Üretimde Redis zorunludur.** Upstash bağlı değilken kota, önbellek ve token'lar
in-memory `Map`'lere düşer. Bu geliştirme için yeterlidir; Vercel ise çok
instance'lı, kısa ömürlü bir ortamdır — her instance ve her deploy kendi
sayaçlarını unutur, raporlar ve onay token'ları uçar, limitler delinir.
`lib/redis.ts` bu durumu üretimde `[PROD-GUARD]` loguyla da bildirir.

## 🚀 Kurulum

**Tek bir API anahtarı olmadan uçtan uca çalışır:** gerçekçi mock yorumlar +
heuristic (ortalama tabanlı) analiz. Kurulum iki komuttan ibaret.

<details open>
<summary><b>Windows (PowerShell)</b></summary>

```powershell
Copy-Item .env.example .env.local
npm install
npm run dev
```

</details>

<details>
<summary><b>macOS / Linux (bash)</b></summary>

```bash
cp .env.example .env.local
npm install
npm run dev
```

</details>

Ardından tarayıcıdan **`http://localhost:3000/tr`** adresini açın:

1. Form alanına herhangi bir Google Maps işletme linki yapıştırın
   (veya "Örnek bir işletmeyle dene" kısayolunu kullanın).
2. Yorum yükleme sahneleri oynar; hızlı yanıtta bile en az 3,6 sn bekletilir
   (yapay bir gecikme değil, hızlı kurulumda boş ekran görünümüne karşı bir
   güvenlik payı) ve **önizleme** raporu ekrana gelir.
3. E-posta girip KVKK onayını işaretleyin. Brevo anahtarı olmadığı için e-posta
   gönderilmez; onay linki ekrandaki "geliştirici önizlemesi" kutusunda ve
   terminalde `[MOCK-EMAIL]` satırı olarak görünür.
4. O linke tıklayın — `/{locale}/rapor?token=…` açılır ve tam rapor görünür.

Gerçek servislerle çalıştırmak için tek yapmanız gereken `.env.local` içindeki
anahtarları doldurmak — şablon olarak [`.env.example`](.env.example) gelir.
Tam liste ve her anahtarın eksiklikteki davranışı aşağıdaki tablodadır.

## 🔑 Ortam değişkenleri

| Değişken | Zorunlu | Açıklama | Eksikse ne olur |
|---|---|---|---|
| `UPSTASH_REDIS_REST_URL` | Üretimde evet | Upstash Redis REST endpoint | In-memory moda düşer: çok instance'lı ortamda sayaç kaybolur, rapor ve token'lar uçar |
| `UPSTASH_REDIS_REST_TOKEN` | Üretimde evet | Upstash Redis REST token | Aynı şekilde in-memory fallback |
| `APIFY_API_TOKEN` | Hayır | Apify API token | Gerçekçi **mock yorumlar** döner; Apify kredisi harcanmaz |
| `APIFY_ACTOR_ID` | Hayır | Kullanılacak actor | `compass/google-maps-reviews-scraper` varsayılanı kullanılır |
| `GOOGLE_AI_API_KEY` | Hayır | Google AI Studio anahtarı | **Heuristic analiz**: puan ortalamasına dayalı özet, konu sayıları ve tek cümlelik öneri |
| `GEMMA_MODEL` | Hayır | AI Studio'daki gerçek model id'si | `gemma-4-31b-it` kullanılır. Yanlış id → API 404 → rapor üretilemez |
| `BREVO_API_KEY` | Hayır | Brevo API anahtarı | **Mock e-posta modu**: onay linki loglanır ve API yanıtında `devPreviewUrl` olarak döner; double opt-in akışı yine zorunlu kalır |
| `BREVO_FROM` | `BREVO_API_KEY` varsa evet | Doğrulanmış gönderici, örn. `TrueReviews <adres@domain>` | Anahtar varken istek **açıkça hata fırlatır** — sessiz gönderim yok. `ornek.com` / `example.com` placeholder'ı da reddedilir |
| `ADMIN_EMAILS` | Hayır | Virgülle ayrılmış geliştirici e-postaları | Boşsa admin bypass kapalı, normal akış |
| `ADMIN_BYPASS_TOKEN` | Hayır | Kota muafiyeti için server-only test anahtarı | Boşsa muafiyet yok; hiçbir istek muafiyet kazanamaz |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Hayır | Turnstile site key | Widget render edilmez |
| `TURNSTILE_SECRET_KEY` | Hayır | Turnstile secret key | Doğrulama **pasif moda düşer** (form çalışır, koruma yok); prod'da `[PROD-GUARD]` ile loglanır |
| `APP_URL` | Üretimde evet | Site kök URL'si (private env) | `https://get-truereviews.vercel.app` fallback'i (`lib/site.ts`) kullanılır — canonical, OG, sitemap ve JSON-LD bu adrese göre üretilir |
| `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | Hayır | Search Console doğrulama token'ı | `verification.google` meta etiketi eklenmez |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` | Hayır | Gizlilik dostu analitik alan adı | Analitik hiç render edilmez |
| `NEXT_PUBLIC_PLAUSIBLE_SRC` | Hayır | Self-host Plausible script adresi | `https://plausible.io/js/script.js` kullanılır |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Hayır | İletişim sayfasında gösterilecek adres | İletişim sayfasında e-posta bloğu gösterilmez |
| `DAILY_NEW_ANALYSIS_LIMIT` | Hayır | Global günlük analiz kotası | `12` |
| `RATE_LIMIT_PER_HOUR` | Hayır | IP başına saatlik istek sayısı | `2` |
| `CACHE_TTL_HOURS` | Hayır | Rapor önbelleği ve Redis TTL'i | `24` |
| `MAX_REVIEWS` | Hayır | Çekilecek azami yorum sayısı (üst sınır 50) | `20` |

## 🧪 Test & CI

```bash
npm test            # vitest run  →  10 dosya, 40 test
npx tsc --noEmit    # tip kontrolü
npm run build       # production build
```

Testler dış servislere ihtiyaç duymadan, `fetch` stub'ı ve in-memory fallback
üzerinden koşar; CI'da hiçbir secret yoktur.

| Test dosyası | Kapsam |
|---|---|
| [`tests/gemma.test.ts`](tests/gemma.test.ts) | Varsayılan model sabiti, prompt şeması ve dil yansıması, metinsiz yorumların prompta dağılım olarak girmesi, `extractJson` fence/ayrık metin ayıklama, kalıcı 5xx → heuristic, `4xx` → hata, `clipQuote` kelime sınırı |
| [`tests/validation.test.ts`](tests/validation.test.ts) | E-posta formatı (kabul/red), bilinen geçici domainler, Turnstile pasif mod |
| [`tests/storage.test.ts`](tests/storage.test.ts) | Kota (saatlik limit), rapor kaydet/getir/önbellek, `indexPlace:false`, token üretimi ve TTL içi idempotanslık, `upsertLead` |
| [`tests/admin.test.ts`](tests/admin.test.ts) | Admin e-posta listesi (normalizasyon), bypass anahtarı eşleşmesi ve boş değer |
| [`tests/url.test.ts`](tests/url.test.ts) | Google Maps linki kabul/red (`google.*`, `goo.gl`, `g.page`) |
| [`tests/legal.test.ts`](tests/legal.test.ts) | 10 dil × 4 yasal sayfa meta doğruluğu, slug doğrulama, KVKK onay metni kapsamı |
| [`tests/faq.test.ts`](tests/faq.test.ts) | 10 dilde SSS kapsamı, bilinmeyen dilde İngilizce fallback'i, başlık varlığı |
| [`tests/email.test.ts`](tests/email.test.ts) | Anahtar yoksa mock mod, anahtar varken geçersiz `BREVO_FROM` için açık hata |
| [`tests/site.test.ts`](tests/site.test.ts) | `getSiteUrl` fallback'i ve sondaki slash temizliği |
| [`tests/notebook.test.ts`](tests/notebook.test.ts) | 0–100 skor bant eşikleri ve bant renkleri |

**CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): `master` ve
`main` push'larında ve tüm pull request'lerde çalışır. `ubuntu-latest` +
Node 20 üzerinde sırasıyla `npm ci --legacy-peer-deps` → `npm test` →
`npx tsc --noEmit` → `npm run build` adımlarını koşar. Durum rozeti README'nin
üstündedir.

## 🚀 Deploy

1. Repo'yu GitHub'a push'layın: **github.com/Kcguner/truereviews**
2. [vercel.com](https://vercel.com) → **Add New → Project** → repo'yu içe aktarın.
   Framework olarak Next.js algılanır, `vercel.json` (`framework: nextjs`,
   `regions: ["fra1"]`) ve `next.config.mjs` baştan tanınır.
3. **Environment Variables** bölümüne yukarıdaki anahtarları ekleyin.
   Vercel'de env'leri **Production *ve* Preview** için ayrı ayrı tanımlayın;
   aksi halde her preview deploy'da sessizce mock moda düşersiniz.
4. `APP_URL` değerini gerçek domain ile yazın.
5. Deploy. `sitemap.xml` ve `robots.txt`, Next.js'in metadata route'ları olan
   [`app/sitemap.ts`](app/sitemap.ts) ve [`app/robots.ts`](app/robots.ts) üzerinden
   otomatik üretilir; ayrıca bir `postbuild` adımı gerekmez.

Dikkat edilmesi gerekenler:

- **`APP_URL` private env'dir — `NEXT_PUBLIC_` prefix'i yoktur.** Kod
  `NEXT_PUBLIC_APP_URL` okumaz; böyle bir değişken eklemek hiçbir işe yaramaz.
  Site kök URL'si sunucu tarafında `lib/site.ts` üzerinden tek noktadan gelir.
- **`NEXT_PUBLIC_*` değişiklikleri build-time'da gömülür.** Turnstile site key,
  Google doğrulama token'ı, Plausible veya iletişim e-postasını değiştirdiyseniz
  **Redeploy** gerekir; sadece env'i güncellemek yetmez.
- Üretim öncesi mutlaka `UPSTASH_REDIS_REST_URL` ve `UPSTASH_REDIS_REST_TOKEN`
  tanımlı olmalı. Ayrıca kotaların gerçekte sıkılaştırılması için
  `TURNSTILE_SECRET_KEY` de eklenmelidir.
- Domain değişirse `APP_URL` güncellenmeli; `sitemap`, `canonical`, `hreflang`
  ve JSON-LD hepsi bu tek değerden üretiliyor.

## 📄 Lisans

[MIT](https://opensource.org/licenses/MIT). Serbestçe kullanın, değiştirin ve
dağıtın.

## 📚 Notlar

- [`docs/proje-plani.md`](docs/proje-plani.md) — iş modeli, "2 hak" mantığının
  gerekçesi, kota hesabı ve güvenlik mimarisinin tamamı. Maliyet iddialarının
  dayandığı belge burasıdır.
- [`docs/tasarim.txt`](docs/tasarim.txt) — arayüz ve görsel dil notları.

Kod ile doküman arasında isimlendirme farkları olabilir: plan dokümanı
yol boyunca özgün tasarım kararlarını anlatır, uygulama ise o kararların
bugünkü hâlini içerir. Doğru davranışı belirleyen şey her zaman koddur.
