# Proje Planı: Ücretsiz İşletme Yorum Analiz Aracı (Lead Magnet)

**Hedef:** İşletme sahiplerinin Google Maps yorumlarını otomatik analiz eden, e-posta karşılığı ücretsiz rapor sunan bir webapp. Amaç para kazanmak değil, e-posta listesi toplamak. **Toplam bütçe: 0 TL.**

---

## 1. Ürün Özeti

### Kullanıcı akışı
1. Kullanıcı siteye girer, Google Maps işletme linkini yapıştırır
2. Sistem 20 yorumu çeker (bkz. Bölüm 4 — kota hesabı)
3. Gemma 4 31B ile yorumlar analiz edilir: genel duygu skoru, en çok tekrar eden 3 şikayet/övgü konusu, 1 aksiyon önerisi
4. Kullanıcıya kısa bir önizleme gösterilir ("puanınız 7.2/10, en büyük sorun: X")
5. **1. hak (ücretsiz, e-postasız):** Kullanıcı hemen kısıtlı bir özet görür (skor + 1 genel tema) — hiçbir kayıt istenmez
6. Tam raporu görmek isterse e-posta ister; e-posta onaylanınca (double opt-in linkine tıklayınca) **tam rapor** açılır — bu, kullanıcının kullandığı **2. ve son hakkıdır**
7. Aynı kişi (aynı e-posta/IP) üçüncü kez denemek isterse sistem "günlük hakkınız doldu" mesajı gösterir

### Hak mantığı (netleştirme)
- **Hak 1 — Anlık, kayıtsız:** Herkes siteye girip linki yapıştırdığında otomatik 1 analiz hakkı kullanır, sadece kısıtlı önizleme görür
- **Hak 2 — E-posta onayından sonra:** Kullanıcı e-postasını girer, onay linkine tıklar, bu andan itibaren aynı analiz için **tam rapor** açılır
- Toplamda kişi başı **2 Apify/Gemma çağrısı** değil, **1 çağrı** yeterli olabilir — çünkü ikinci "hak" aslında yeni bir analiz değil, zaten yapılmış olan 1. analizin **kilidini açmak**tır. Bu ayrım kota hesabı için kritik, bkz. Bölüm 4.

### Neden bu sıra?
Önizleme + kilit (paywall yerine "emailwall") modeli, dönüşüm oranını artırır — kullanıcı zaten bir değer gördüğü için e-posta vermeye daha istekli olur.

---

## 1.1 Çok Dilli Destek (8-10 Dil)

### Hedef diller (öneri)
Türkiye pazarı + turizm/göçmen yoğun bölgeler + genel erişim düşünülürse:

1. Türkçe (ana dil, varsayılan)
2. İngilizce (global erişim, en yüksek arama hacmi)
3. Almanca (Almanya'da yaşayan Türkler + Alman turist işletmeleri)
4. Arapça (Ortadoğu turizmi, Türkiye'deki Arap yatırımcı/işletme sahipleri)
5. Rusça (Antalya, Alanya gibi bölgelerde yoğun talep)
6. Fransızca
7. İspanyolca
8. Felemenkçe (Hollanda pazarı, orantısız yüksek işletme sahipliği)
9. Farsça (opsiyonel — İran turizmi)
10. Azerice (opsiyonel — dilsel yakınlık, düşük çeviri maliyeti)

Gemma 4'ün <cite>140+ dilde native destek</cite> vermesi sayesinde hem arayüz metinlerini hem de üretilen raporun kendisini (yorumlar hangi dilde olursa olsun) seçilen dilde üretmek teknik olarak sorunsuz.

### Teknik yaklaşım
- **next-intl** veya **next-i18next** kütüphanesi ile Next.js'e çoklu dil desteği eklenir (ikisi de ücretsiz, açık kaynak)
- URL yapısı `/tr/`, `/en/`, `/de/` gibi **path-based** olmalı (subdomain değil) — SEO için en sağlam yöntem, ayrı sunucu/DNS gerektirmez
- Arayüz metinleri (buton, form, açıklama) için her dilde bir JSON çeviri dosyası (`tr.json`, `en.json` vb.) — bunları siz manuel yazmak yerine Gemma'ya "bu metni şu dile çevir" diye tek seferlik çevirtebilirsiniz, sıfır maliyetli
- **Rapor içeriği** zaten Gemma tarafından üretildiği için, kullanıcının seçtiği dile göre prompt'un sonunda "yanıtı X dilinde üret" talimatı yeterli — ayrı bir çeviri katmanına gerek yok

### Dikkat edilmesi gereken nokta
Yorumların kendisi genelde yerel dilde olur (örn. bir İzmir restoranının yorumları çoğunlukla Türkçe). Kullanıcı raporu İngilizce isterse, Gemma orijinal yorumları okuyup **analiz sonucunu** İngilizce üretir — yorumları tek tek çevirmesi gerekmez, bu hem daha hızlı hem daha ucuzdur (token tasarrufu).

---

## 2. Tech Stack (Tamamen Ücretsiz Katmanlar)

| Katman | Araç | Neden | Ücretsiz Sınır |
|---|---|---|---|
| Frontend | **Next.js** (React) | Vercel ile birebir uyumlu, SSR kolay, form yönetimi basit | — |
| Hosting | **Vercel (Hobby plan)** | Next.js için sıfır konfigürasyonla deploy, otomatik HTTPS, custom domain destekli | 100 GB bandwidth/ay, sınırsız deploy |
| Backend/API | **Next.js API Routes** (Vercel Functions) | Ayrı bir backend sunucusu kurmaya gerek yok, aynı projede | Vercel Hobby fonksiyon limiti içinde |
| Veritabanı | **Supabase (Free tier)** | E-posta listesi + geçmiş analizleri saklamak için Postgres, ayrıca auth gerekirse hazır | 500 MB veritabanı, 50.000 aylık aktif kullanıcı |
| Yorum Çekme | **Apify (Free plan)** — `compass/google-maps-reviews-scraper` | Google Maps yorumlarını place URL'den çeker, TOS riskini Apify üstlenir | $5 ücretsiz kredi/ay (~ayda 300-600 işletme, 25-50 yorum/işletme ile) |
| AI Analiz | **Google AI Studio — Gemma 4 31B** | Ücretsiz kota, native JSON çıktı, 256K context | 14.000 istek/gün |
| E-posta Toplama/Gönderme | **Resend (Free tier)** veya **Supabase + form** | Rapor e-postayla gönderilecekse Resend; sadece listeye eklemek yeterliyse Supabase tablo | Resend: 3.000 e-posta/ay, 100/gün |
| Analitik (opsiyonel) | **Vercel Analytics (Free)** veya **Plausible self-host yerine Umami Cloud free** | Kaç kişi geldi, kaç e-posta bıraktı görmek için | Vercel: temel analiz ücretsiz |
| Domain | **Vercel'in verdiği `.vercel.app` alt alan adı** (başlangıç için) | Sıfır maliyet | Sınırsız |
| Çoklu Dil | **next-intl** (npm) | Next.js için açık kaynak, path-based routing + çeviri yönetimi | Sınırsız (kütüphane, servis değil) |
| SEO / Sitemap | **next-sitemap** (npm) | Dil bazlı sitemap.xml ve robots.txt otomatik üretimi | Sınırsız |
| Bot Koruması | **Cloudflare Turnstile** | reCAPTCHA'ya ücretsiz, gizlilik dostu alternatif; form spam/bot koruması | Sınırsız istek |
| Geçici E-posta Filtreleme | **disposable-email-domains** (npm) | Bilinen çöp e-posta servislerini engellemek için açık kaynak liste | Sınırsız (statik liste) |

> **Not:** Kendi alan adınızı (`.com`, `.com.tr`) almak isterseniz bu tek gerçek maliyet kalemi olur (~yıllık 150-400 TL). Sıfır maliyet hedefiyle başlarken `.vercel.app` ile başlayıp, proje işe yararsa domain alabilirsiniz.

---

## 2.1 Dile Bağlı SEO Ayarları

Çok dilli bir yapıda SEO'yu doğru kurmazsanız arama motorları içeriği "kopya/duplicate content" sanabilir veya yanlış dildeki sayfayı yanlış ülkede gösterebilir. Sıfır maliyetli ama teknik olarak doğru bir kurulum için:

### hreflang etiketleri
Her sayfanın `<head>` kısmına, o içeriğin hangi dillerde de mevcut olduğunu belirten `hreflang` etiketleri eklenmeli:
```html
<link rel="alternate" hreflang="tr" href="https://siteniz.com/tr/" />
<link rel="alternate" hreflang="en" href="https://siteniz.com/en/" />
<link rel="alternate" hreflang="de" href="https://siteniz.com/de/" />
<link rel="alternate" hreflang="x-default" href="https://siteniz.com/en/" />
```
Next.js'te bu, `next-intl`'in `alternates` desteğiyle veya `generateMetadata` fonksiyonu içinde otomatik üretilebilir — elle yazmaya gerek kalmaz.

### Dile özel metadata
Her dil için ayrı `title`, `description`, `og:title`, `og:description` üretilmeli — doğrudan çeviri değil, o dilin arama alışkanlığına uygun anahtar kelimelerle (örn. Türkçe'de "google yorum analizi ücretsiz", İngilizce'de "free google reviews analyzer"). Bu metinleri de Gemma'ya tek seferlik ürettirebilirsiniz.

### Sitemap ve robots.txt
- `next-sitemap` paketi (ücretsiz, npm) ile her dil/sayfa kombinasyonunu otomatik `sitemap.xml`'e ekleyin
- `robots.txt` içinde tüm dil path'lerinin taranmasına izin verin, sadece `/api/` klasörünü engelleyin

### URL yapısı özeti
- Path-based (`/tr/`, `/en/`) tercih edilmeli — ccTLD (`.com.tr`, `.de` gibi ayrı domainler) veya subdomain (`tr.site.com`) hem maliyetli hem karmaşık, sıfır bütçeli bir projede gereksiz
- Her dil sayfasının kendi kanonik (`canonical`) URL'si olmalı, aksi halde arama motoru hangi sürümü öne çıkaracağını şaşırabilir

### Performans SEO'nun bir parçasıdır
Vercel'in otomatik CDN + Next.js'in image optimization'ı (ücretsiz, ekstra kurulum gerektirmez) sayfa hızını doğal olarak iyi tutar — Core Web Vitals için ayrıca bir şey yapmanıza gerek kalmayabilir.

---

## 3. Mimari Akış

```
[Kullanıcı] 
    → Next.js frontend (Vercel)
    → Google Maps linki gönderir (Hak 1 — kayıtsız, otomatik tüketilir)
    → API Route: /api/analyze
        → Apify Actor tetiklenir (place URL, maxReviews: 20)
        → Yorumlar JSON olarak döner
        → Gemma 4 31B'ye prompt olarak gönderilir (structured JSON output istenir)
        → Sonuç: { skor, sikayet_konulari[], oneri, ozet }
        → Tam sonuç Supabase'e UUID ile kaydedilir (bkz. Bölüm 4.1)
    → Frontend'de SADECE önizleme gösterilir (skor + 1 örnek bulgu)
    → Kullanıcı e-posta girer (Hak 2 — bu, YENİ bir analiz değil, mevcut analizin kilidini açar)
    → API Route: /api/lead
        → Onay e-postası gönderilir (double opt-in)
    → Kullanıcı onay linkine tıklar
    → API Route: /api/report?id=UUID&token=...
        → E-posta doğrulanmış olarak Supabase'e kaydedilir
        → Aynı UUID'ye ait, ZATEN üretilmiş olan tam rapor döner (yeni Apify/Gemma çağrısı YAPILMAZ)
```

> **Önemli:** Bu akışta Hak 1 ve Hak 2 aynı analiz verisini kullanır — Apify ve Gemma'ya sadece **1 kez** istek gidiyor. "2 hak" kullanıcı deneyiminde bir kısıtlama/teşvik mekanizması, backend'de ise **1 analiz = 1 Apify çağrısı** anlamına gelir. Bu, kota hesabınızı ciddi ölçüde rahatlatır (bkz. aşağıdaki güncellenmiş hesap).

---

## 4. Maliyeti Sıfırda Tutmak İçin Kritik Kurallar

Bu bölüm en önemli kısım — dikkatli okuyun, aksi halde "ücretsiz" planlar sizi aşabilir ve kredi kartı bilgisi istenebilir.

### Güncel kota hesabı (1 ücretsiz + mail onayı sonrası 1 hak modeline göre)

- Apify ücretsiz kredisi: **$5/ay**, gösterge olarak **~8.333 yorum/ay** (Apify panelindeki "up to" rakamı — muhtemelen platform/compute maliyetini de düştüğü için $5÷$0.30/1000'in verdiği teorik 16.666'dan düşük; **8.333'e güvenmek daha güvenli**)
- Mekan başı **20 yorum** çekildiğini varsayarsak: 8.333 ÷ 20 = **~416 analiz/ay** kapasiteniz var
- Siz zaten Hak 1 + Hak 2'yi **tek Apify çağrısına** bağladığınız için (yukarıdaki mimari), "günde 20 kişi × 3 hak" gibi bir çarpım yerine **günde kaç farklı işletme analiz edildiği** önemli
- Günlük 416 ÷ 30 = **~13-14 analiz/gün** güvenle karşılanabilir — siz zaten "her gün 20 kişi girmez" dediğiniz için bu, gerçekçi kullanımınızla uyumlu bir tampon
- **Aynı kişi aynı işletmeyi tekrar tekrar analiz ederse** (örneğin sayfayı yenileyip yeniden link yapıştırırsa) her seferinde yeni bir Apify çağrısı tetiklenir — bunu önlemek için **aynı Google Maps linkine son 24 saat içinde tekrar Apify çağrısı yapılmaması**, bunun yerine Supabase'de zaten var olan sonucun tekrar gösterilmesi gerekir (bu hem kota tasarrufu hem hız kazancı sağlar — küçük bir "cache" mantığı)

1. **Apify'da kredi kartı bağlamayın.** Free plan kredi kartsız başlar. $5 kredi bitince sistem otomatik durur, sizden para çekilmez — ama uygulamanızda "kota bitti, yarın tekrar deneyin" mesajı göstermeniz gerekir.
2. **Günlük/aylık sayaç kendiniz kodlayın.** Supabase'de basit bir `usage_log` tablosu tutup, ayda kaç **benzersiz** Apify çağrısı yaptığınızı sayın (tekrar analizler cache'den karşılanmalı, bkz. yukarı). Güvenli tarafta kalmak için **günde maksimum 12-13 yeni analiz** ile sınırlayın — bu, ayda ~380-400 analiz eder ve $5 kredinin altında rahat bir tampon bırakır.
3. **Gemma tarafında 14.000/gün kotası zaten çok yüksek** — bu konuda risk yok, ama yine de bir istek sınırı (rate limit) koyup kötüye kullanımı (bot saldırısı, aynı kişinin sürekli tekrar analiz etmesi) önleyin.
4. **Vercel Hobby plan ticari kullanım için teknik olarak "kişisel proje" şartına tabidir** — proje büyürse (ciddi trafik alırsa) Vercel sizi Pro plana yükseltmeye yönlendirebilir. Bu bir hukuki risk değil ama bilmeniz gereken bir sınırdır.
5. **Resend'in 100 e-posta/gün sınırı** — eğer her analiz sonrası otomatik e-posta gönderiyorsanız, günde 100 rapor sınırına dikkat edin. Alternatif: e-postayı göndermek yerine, kullanıcıya e-posta girdikten sonra raporu **doğrudan sayfada** gösterin (e-posta göndermeye hiç gerek kalmaz, sadece veritabanına kaydedersiniz). Bu hem daha ucuz hem daha basit.
6. **Rate limiting olmadan asla canlıya almayın.** Birisi botla siteye saldırıp Apify kredinizi bir günde bitirebilir. IP başına saatte 1-2 analiz sınırı koyun (Vercel Edge Middleware ile kolayca yapılır, ücretsiz).

---

## 4.1 "E-posta Vermeden Rapor Alınamasın" — Güvenlik Mimarisi

Bu, projenin iş modelinin temeli olduğu için ayrıca ve dikkatle ele alınmalı. Sorun şu: bir web sayfasında "sonucu görmek için e-posta gir" dediğinizde, teknik bilgisi olan biri tarayıcının **Geliştirici Araçları (DevTools)** üzerinden ağ isteklerini (network request) izleyip, e-posta göndermeden doğrudan API'den veriyi çekmeye çalışabilir. Bunu tamamen imkansız kılmak yok ama pratikte yeterince zorlaştırmak mümkün.

### Temel prensip: Analiz sonucu asla frontend'e e-postadan önce tam olarak gönderilmemeli
En sık yapılan hata: `/api/analyze` çağrısı tüm raporu (skor, şikayetler, öneriler) frontend'e gönderip, arayüzde sadece CSS ile bulanıklaştırmak (blur) veya bir modal ile üzerini kapatmak. **Bu güvenli değildir** — veri zaten tarayıcıya gelmiştir, biri DevTools > Network sekmesinden ham JSON yanıtını görebilir. Doğru yöntem, veriyi **sunucu tarafında iki aşamaya bölmek**:

1. **Aşama 1 — Önizleme çağrısı (`/api/preview`):** Sadece sınırlı bilgi döner (örn. genel skor + 1 genel cümle). Şikayet detayları, öneriler gibi "asıl değer" sunucuda tutulur, hiç frontend'e gönderilmez.
2. **Aşama 2 — Tam rapor çağrısı (`/api/report`):** Yalnızca geçerli bir e-posta ile birlikte çağrılabilir. Bu route içinde e-posta doğrulaması yapılmadan tam veri asla dönmez.

Bu şekilde, kullanıcı DevTools'u açsa bile göreceği tek şey önizleme verisidir — tam rapor sunucuda, e-posta doğrulanana kadar hiç var olmaz.

### Ek katman: Analiz sonucunu geçici bir kimlikle (token) sunucuda saklamak
- `/api/analyze` çağrıldığında, tam rapor Supabase'e kaydedilir ve karşılığında rastgele, tahmin edilemez bir `report_id` (UUID) üretilir — frontend'e sadece bu ID ve önizleme verisi gönderilir
- Kullanıcı e-posta girip gönderince, `/api/report?id=UUID&email=...` çağrılır; backend e-postayı kaydeder VE o UUID'ye karşılık gelen tam raporu döner
- UUID tahmin edilemeyecek kadar rastgele olduğu için (örn. `crypto.randomUUID()`), biri ID'yi bilmeden veriye ulaşamaz

### E-posta doğrulama (gerçek bir e-posta mı, çöp mü?)
Sahte e-posta (`asdasd@asdasd.com` gibi) girilmesini tamamen engellemek zor ama listenin kalitesini artıracak ücretsiz önlemler:
- **Format doğrulama:** Basit regex ile `@` ve geçerli bir alan adı yapısı kontrolü (client + server tarafında)
- **Bilinen çöp/geçici e-posta servislerini engelleme:** `mailinator.com`, `10minutemail.com` gibi bilinen geçici e-posta sağlayıcılarının açık kaynak listeleri var (GitHub'da ücretsiz, örn. `disposable-email-domains` npm paketi) — bu domainlerden gelen e-postaları reddedebilirsiniz
- **Çift onay (double opt-in) — opsiyonel ama önerilir:** E-posta girildiğinde rapor hemen gösterilmez, e-postaya bir onay linki gönderilir, link tıklanınca rapor açılır. Bu, sahte e-posta girme oranını ciddi düşürür ama bir sürtünme adımı eklediği için dönüşüm oranını biraz azaltabilir — "hemen göster" ile "onaylat" arasında bir denge kararı sizin tercihinize kalır.

### Bot/otomasyon koruması
- **Cloudflare Turnstile** (ücretsiz, reCAPTCHA'nın açık/gizli gereksinim istemeyen alternatifi) e-posta formuna eklenerek botların otomatik, toplu sahte kayıt oluşturmasının önüne geçilir
- Bu aynı zamanda Bölüm 4'teki Apify/Gemma kotasının bir bot tarafından kötüye kullanılmasını da engeller — güvenlik ve maliyet koruması burada birleşiyor

### Özet akış (güvenlik + hak katmanlı)
```
1. Kullanıcı Google Maps linkini gönderir
   → Rate limit kontrolü (IP başına saatte 1-2 istek)
   → Cache kontrolü: bu link son 24 saatte analiz edildi mi? Edildiyse Apify'a gitmeden mevcut sonucu kullan
   → Cloudflare Turnstile doğrulaması

2. /api/analyze çağrılır (Hak 1 — sadece burada, gerekiyorsa, Apify+Gemma tetiklenir)
   → Apify + Gemma ile tam rapor üretilir
   → Tam rapor Supabase'e kaydedilir, rastgele report_id üretilir
   → Frontend'e SADECE önizleme + report_id döner (tam rapor asla gönderilmez)

3. Kullanıcı e-posta girer (Hak 2'nin başlangıcı — yeni analiz DEĞİL, kilit açma isteği)
   → Format + geçici e-posta kontrolü
   → Onay e-postası gönderilir, link tıklanmasını bekler (double opt-in)

4. Kullanıcı onay linkine tıklar → /api/report?id=...&token=... çağrılır
   → E-posta doğrulanmış "lead" olarak Supabase'e kaydedilir
   → SADECE bu noktada, aynı UUID'ye ait zaten var olan tam rapor frontend'e döner
   → Apify/Gemma'ya YENİ bir istek GİTMEZ — Hak 2 mevcut veriyi açar, yeni veri üretmez
```

Bu mimari ekstra bir maliyet getirmez (Supabase'in ücretsiz katmanı UUID saklamak için fazlasıyla yeterli), sadece kod yazarken doğru sırayı takip etmeyi gerektirir. Ayrıca bu yapı sayesinde "2 hak" kullanıcı için anlamlı bir teşvik olsa da, sizin için pratikte **1 Apify çağrısı** maliyetine denk gelir — bu, Bölüm 4'teki kota hesabının neden bu kadar rahat olduğunu açıklıyor.

---

## 5. Bakım/Sürdürme Açısından "Kur ve Bırak" Uyumluluğu

Sormuş olduğunuz "birkaç ay bakım gerektirmesin" hedefi için:

- **Sunucu yönetimi yok** — Vercel ve Supabase tamamen yönetilen (managed) servisler, güncelleme/patch/yeniden başlatma gibi işler sizin değil.
- **Otomatik durdurma mantığı kurun** — kota bittiğinde sistem kendi kendine "şu an müsait değiliz" mesajı göstersin, sizin manuel müdahale etmenize gerek kalmasın.
- **Apify Actor'ünün üçüncü taraf bir geliştirici tarafından bakımı yapılıyor** — Google'ın sayfa yapısı değişirse Apify'daki actor kendiliğinden güncellenir, sizin kod yazmanıza gerek kalmaz. Bu yüzden kendi scraping kodunuzu yazmak yerine hazır Actor kullanmak "bırak, unut" hedefine çok uygun.
- **Riskli tek nokta:** Google Places sayfası büyük bir yapı değişikliği yaparsa Apify Actor'ü geçici olarak bozulabilir — bu durumda sizin yapabileceğiniz bir şey yok, Apify'ın güncellemesini beklemeniz gerekir (genelde birkaç gün içinde düzelir).

---

## 6. Yol Haritası (Aşamalı Kurulum)

| Aşama | İçerik | Tahmini Süre |
|---|---|---|
| 1 | Next.js projesi kur, `next-intl` ile çoklu dil iskeletini oluştur, Vercel'e bağla | 2-3 saat |
| 2 | Supabase projesi aç, `leads`, `usage_log`, `reports` (UUID bazlı geçici rapor tablosu) oluştur | 45 dk |
| 3 | Apify hesabı aç, Actor'ü test et (Console üzerinden manuel çalıştırıp çıktıyı incele) | 30 dk |
| 4 | `/api/analyze` route'unu yaz: Apify çağrısı + Gemma prompt (dile göre) + JSON parse + Supabase'e UUID ile kayıt | 3-4 saat |
| 5 | `/api/report` route'unu yaz: e-posta doğrulama + UUID kontrolü + tam rapor dönüşü | 1-2 saat |
| 6 | Frontend'de önizleme + e-posta formu + Cloudflare Turnstile entegrasyonu | 2-3 saat |
| 7 | Rate limiting ve kota sayacı ekle (kritik — atlamayın) | 1-2 saat |
| 8 | hreflang, sitemap, dile özel metadata kurulumu (`next-sitemap` ile) | 1-2 saat |
| 9 | Diğer dillerin arayüz çevirilerini Gemma ile toplu üret, gözden geçir | 1-2 saat |
| 10 | Test: 10-15 gerçek işletme, 2-3 farklı dil ile deneyip kaliteyi kontrol et | 2 saat |
| 11 | Yayına al, birkaç kişiye paylaşıp geri bildirim topla | — |

Toplam aktif geliştirme süresi: **~2-3 gün** (deneyime bağlı, çok dil ve güvenlik katmanları eklendiği için önceki tahminden biraz uzun).

---

## 7. Gemma Prompt Taslağı (Başlangıç Noktası)

Yorumları JSON olarak Gemma'ya gönderirken şu yapıda bir sistem talimatı işe yarar:

- Girdi: işletme adı + 25-50 yorumun metni ve puanı
- İstenen çıktı formatı (JSON): genel duygu skoru (0-10), en sık geçen 3 şikayet teması, en sık geçen 2 övgü teması, 1 cümlelik aksiyon önerisi
- Gemma'nın native JSON/structured output desteği sayesinde bu, prompt hackleme gerektirmeden düzgün formatta gelir

Bu prompt'u birlikte detaylandırıp test etmek isterseniz, geliştirme aşamasına geçtiğinizde ayrıca çalışabiliriz.

---

## 8. Riskler ve Gerçekçi Beklentiler

- **Google TOS riski devam ediyor** (bkz. önceki konuşma) — Apify kullanmak riski azaltır ama sıfırlamaz. Bunu bir "yan proje / deneme" olarak görüp üzerine kritik bir iş kurmadan önce talebi test etmek mantıklı.
- **"Ücretsiz kalır mı" garantisi yok** — Vercel, Supabase, Apify, Resend gibi servislerin hepsi ücretsiz katmanlarını değiştirebilir (fiyatlandırma politikaları zamanla değişebilir). Bu bir SaaS kurma riski değil, bir hobi/deneme projesi riski olarak görülmeli.
- **E-posta listesi tek başına gelir değildir** — topladığınız listeyle ne yapacağınızı (ücretli ürün, danışmanlık, ajans hizmeti) ilerleyen aşamada netleştirmeniz gerekecek.

---

## 9. Sonraki Adım

Bu plan onaylanırsa bir sonraki mesajda:
1. Next.js proje iskeletini kurabilirim
2. Supabase tablo şemasını yazabilirim
3. Apify + Gemma entegrasyon kodunu (API route) hazırlayabilirim

Hangisinden başlamak istediğinizi söylemeniz yeterli.
