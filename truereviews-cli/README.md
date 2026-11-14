# TrueReviews Kişisel Rapor (`rapor`)

Apify `compass/google-maps-reviews-scraper` JSON çıktısından, mekan sahibine gönderilecek 2–3 sayfalık A4 PDF (TR/EN) ve makine okunur dosyalar üreten bağımsız Python CLI.

Web sitesinden tamamen ayrıdır: kendi venv'i, kendi `.env`'i, sıfır ortak import. `truereviews-cli/` klasörü tek başına taşınabilir.

## Kurulum

Python 3.11 veya üzeri gerekir.

```bash
cd truereviews-cli
python3.11 -m venv .venv
.venv/bin/pip install -e ".[dev]"
```

Dev araçları olmadan:

```bash
.venv/bin/pip install -r requirements.txt
```

Sonra anahtarları tanımlayın:

```bash
cp .env.example .env
cp providers.example.yaml providers.yaml
cp config.example.yaml config.yaml
```

`.env` içine yalnızca kullandığınız sağlayıcının anahtarını yazın: `GEMINI_API_KEY`, `GLM_API_KEY`, `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`. Anahtar yüklemede aranmaz; profil ilk kullanıldığında çözülür ve eksikse net hata verir (`GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin`).

## Yapılandırma

İki dosya vardır: `providers.yaml` (sağlayıcı profilleri) ve `config.yaml` (çalışma ayarları). İkisi de `--config-dir` ile verilen klasörde aranır (varsayılan: çalışma dizini). `--out` yalnızca çıktı kökünü belirler; config aramasını etkilemez.

### `providers.yaml`

Her profil adlandırılmış bir kayıttır; profil adı YAML anahtarıdır.

| Alan | Anlamı |
|---|---|
| `adapter` | `gemini`, `openai_compat`, `opencode`, `mock` |
| `model` | Sağlayıcı model kimliği (ör. `gemini-3.8-flash`, `glm-5.3-flash`, `deepseek-flash`) |
| `base_url` | `openai_compat` için zorunlu uç adresi |
| `api_key_env` | Anahtarın okunacağı ortam değişkeni |
| `thinking` | `gemini` için `low` / `medium` / `high`; diğer adaptörlerde serbest |
| `max_tokens` | Çıktı token üst sınırı |
| `concurrency` | Profil başına eşzamanlı istek sayısı |
| `requests_per_minute` | Token bucket hız sınırı |
| `daily_request_limit` | Günlük istek kotası; dolunca koşu durur |
| `pricing` | `{input, output}`: 1M token başına USD; yoksa maliyet alanı boş kalır |
| `extra_body` | Sağlayıcıya özel reasoning/thinking parametreleri (serbest sözlük) |

Adaptörler:

- `gemini`: Google Gen AI SDK, JSON modu + `response_schema`, `thinking_level`.
- `openai_compat`: OpenAI SDK + `base_url`. GLM (Z.ai), DeepSeek ve OpenRouter bu yolu kullanır.
- `opencode`: `opencode run -m provider/model --format json` alt süreci. Yapılandırılmış çıktı yoktur; JSON metinden ayrıştırılır.
- `mock`: Ağ ve anahtar gerektirmez; testler ve uçtan uca deneme için.

`gemini-3.8-flash` modelinde `thinking: minimal` config doğrulamasında reddedilir; `low`, `medium` veya `high` kullanın. `openai_compat` profilinde `base_url` boşsa config hatası verilir.

### `config.yaml`

| Bölüm | İçerik |
|---|---|
| `steps.tag.profile`, `steps.write.profile` | Etiketleme (B) ve yazma (D) adımının profili. `--tag-profile` / `--write-profile` ezer. |
| `field_map` | Mantıksal alan → Apify alanı. Farklı bir actor için yalnızca burayı değiştirin. |
| `topic_aliases` | Kanonik konu → eş anlamlılar (C adımında deterministik birleştirme). |
| `scoring.weights` | `average` / `positive_ratio` / `recent`; toplam 1.0 olmalı. |
| `bands` | 0–100 skor bantları; kesintisiz kapsamalı (`0–49`, `50–69`, `70–84`, `85–100`). |
| `tagging` | `group_size` (varsayılan 20), `max_group_retries`. |
| `pdf.footer` | CTA metni ve açma/kapama, künye, e-posta, imza. |

Varsayılan `field_map` eşlemesi:

| Mantıksal alan | Apify alanı |
|---|---|
| `text` | `text` |
| `stars` | `stars` |
| `date` | `publishedAtDate` |
| `id` | `reviewId` |
| `owner_response` | `responseFromOwnerText` |
| `images` | `reviewImageUrls` |
| `context` | `reviewContext` |
| `detailed_ratings` | `reviewDetailedRating` |
| `language` | `originalLanguage` |
| `title`, `category`, `city`, `country_code` | `title`, `categoryName`, `city`, `countryCode` |
| `total_score`, `reviews_count` | `totalScore`, `reviewsCount` |

## Komutlar

Tüm komutlar `.venv/bin/rapor` ile çalışır.

| Komut | Davranış |
|---|---|
| `run` | Tek mekan JSON'u işler, `out/<slug>/` altına rapor üretir. |
| `batch` | Bir klasördeki tüm JSON'ları işler; `out/<slug>/report.json` varsa atlar. |
| `compare` | Aynı girdiyi birden çok **write** profiliyle koşar, tablo karşılaştırır. |
| `thinking-test` | Aynı işi farklı `thinking` seviyeleriyle koşar; token/kalite farkı verir. |
| `review` | Üretilmiş raporları listeler (skor, uyarı, doğrulama oranı). |
| `approve` | Raporun `rapor.pdf`'ini `out/ready/<slug>.pdf` olarak **kopyalar** ve `out/tracking.csv`'ye `yanit_durumu=hazır` satırı ekler; aynı slug zaten varsa satır tekrarlanmaz. |
| `track` | `out/tracking.csv`'yi tablo olarak basar: mekan, gönderim tarihi, kanal, yanıt durumu. |

Örnekler:

```bash
# Tek mekan
.venv/bin/rapor run fixtures/cok.json

# Dil, profil ve çıktı kökü
.venv/bin/rapor run mekan.json --lang en --tag-profile deepseek --write-profile gemini-write --out cikti/

# Demo (ÖRNEK filigranı) ve cache kapalı
.venv/bin/rapor run mekan.json --demo --no-cache

# Ağsız deneme
.venv/bin/rapor run mekan.json --tag-profile mock --write-profile mock

# Klasör
.venv/bin/rapor batch fixtures/ --lang tr

# Yazma profillerini karşılaştır (etiketleme sabit)
.venv/bin/rapor compare mekan.json --profiles gemini-write,glm,deepseek

# Düşünme seviyesi karşılaştırması
.venv/bin/rapor thinking-test mekan.json --profile gemini-write --levels low,medium,high

# Üretilenleri listele, onayla, takip et
.venv/bin/rapor review out/
.venv/bin/rapor approve mavi-firin-ve-kahve
.venv/bin/rapor track
```

`run` bayrakları: `--lang` (`tr` | `en`, varsayılan `tr`), `--demo`, `--no-cache`, `--out` (çıktı kökü; raporlar `<kök>/out/<slug>/` altına yazılır), `--config-dir` (config klasörü, varsayılan `.`), `--tag-profile`, `--write-profile`. `batch` aynı bayrakları alır. `compare` bayrakları: `--profiles` (write profilleri), `--tag-profile`, `--lang`, `--demo`, `--no-cache`, `--out`, `--config-dir`. `thinking-test` bayrakları: `--profile`, `--levels`, `--lang`, `--tag-profile`, `--demo`, `--no-cache`, `--out`, `--config-dir`. `approve` ve `track` yalnızca `--out` alır.

`compare` etiketleme adımını bir kez `out/compare/<slug>-tag/` altında koşar; write sonuçları profil başına `out/compare/<slug>-<profil>/` altına yazılır. `thinking-test` sonuçları `out/thinking/<slug>-<düzey>/` altına yazılır.

### Çıktı sözleşmesi

`out/<slug>/`:

| Dosya | İçerik |
|---|---|
| `rapor.pdf` | Final PDF (A4, en fazla 3 sayfa) |
| `metrics.json` | Yalnızca koddan gelen sayılar; deterministik |
| `report.json` | `meta`, `place`, `scope`, `metrics`, `insights`, `verdict`, temalar, ürünler, Instagram metni, yanıtsızlar, tek adım, `warnings`, `validation` |
| `review.md` | İnsan özeti: skor, uyarılar, doğrulama oranı, gizlenen bölümler |
| `usage.json` | Çağrı bazında token/süre/maliyet + toplam |
| `state.json` | Etiketleme gruplarının ilerlemesi (devam için) |

Kök altında: `out/ready/` (onaylı kopyalar), `out/tracking.csv`, `out/batch_summary.csv`. Takip CSV'sinin sütunları: `slug, mekan, gönderim_tarihi, kanal, yanit_durumu`. Batch özeti: mekan, skor, durum, uyarı, token, maliyet.

`approve` taşımaz, kopyalar: `out/<slug>/` batch devamı için yerinde kalır. İnsan onayı olmadan hiçbir rapor "hazır" sayılmaz.

## Nasıl çalışır

Pipeline beş adımdır:

- **A / A2 — kod.** `metrics` toplam, dağılım, ortalama, olumlu oran, aylık seri, son 90 gün, yanıt oranı, hizmet ortalamaları ve 0–100 skoru üretir. `insights` bant, verdict, trend, anomali, yoğunluk ve yanıt boşluğu cümlelerini yalnızca hesaplanmış sayılardan kurar.
- **B — etiketleme.** Yorumlar 20'lik gruplarla modele gider; çıktı `{id, sentiment, topics[], products[], severity}` olarak pydantic ile doğrulanır. Hatalı grup yeniden denenir, yine olmazsa etiketsiz kalır ve `review.md`'ye uyarı yazılır.
- **C — kümeleme.** Etiketler normalize edilip `topic_aliases` ile birleştirilir. Konu başına yorum sayısı, tarih aralığı, ortalama yıldız, duygu dağılımı, son 3 ay yoğunluğu ve kanıt gücü (`≥3` güçlü, `1–2` izlenmeli) burada hesaplanır.
- **D — yazma.** Model, C'nin sayıları ve kanıt yorumlarının ham metniyle sabit şemalı JSON üretir.
- **E — doğrulama.** Alıntılar normalize edilmiş kaynak metinde birebir aranır ve en fazla 15 kelimedir; tüm `review_id`'ler gerçek yorumlara çözülür; model metinlerindeki sayılar izin verilen kümeyle karşılaştırılır. Geçmeyen blok rapora girmez, `review.md`'ye uyarı düşer.

Gizlilik: modele yalnızca `{id, text, stars, month, answered}` gider. Yorumcu adı, profil linki, fotoğraf ve yorum URL'si hiçbir adımda modele ulaşmaz; rapor da yorumcu adı içermez. Alıntılar orijinal dilde ve birebir kalır.

Sayılar yalnızca koddan gelir; model var olanı cümleye çevirir. Devam durumu grup bazlıdır: tag sonuçları `state.json`'a yazılır, yeniden çalıştırmada yalnızca eksik gruplar koşulur, write çıktısı cache'ten gelir. Günlük kota dolunca koşu durur ve sonraki çalıştırmada kaldığı yerden devam eder. 429, 5xx ve ağ hatalarında üstel geri çekilme uygulanır; süreç çökmez.

Cache anahtarı `(adapter, model, thinking, max_tokens, schema, system, user)` bileşimidir. `--no-cache` kapatır.

## Testler

```bash
.venv/bin/python -m pytest -q
```

Canlı API testleri `live` işaretlidir ve varsayılan olarak çalışmaz (`pyproject.toml` içinde `-m "not live"`). Yalnızca onları koşmak için:

```bash
.venv/bin/python -m pytest -m live
```

## Bilinen sınırlar ve varsayımlar

- Apify actor'ü `compass/google-maps-reviews-scraper` varsayılır. Alan adları bu actor'ün dokümanından doğrulanmıştır; farklı bir actor için `config.yaml` içindeki `field_map` yeterlidir.
- `text` alanı orijinal dil kabul edilir. `textTranslated` (Google çevirisi) hiçbir adımda kullanılmaz; çeviri modele de rapora da girmez.
- `opencode` adaptöründe yapılandırılmış çıktı yoktur: JSON metinden ayrıştırılır, şema doğrulanır ve 2 kez yeniden denenir. CLI çıktısında token bilgisi yoksa 0 olarak loglanır.
- PDF en fazla 3 sayfadır. Çok sayıda güçlü tema varsa en yüksek kanıtlı olanlar kalır; kırpma yapıldıysa `review.md`'ye uyarı yazılır.
- "Hafta sonu / öğleden sonra" gibi ziyaret zamanı iddiaları yorum verisinden kanıtlanamaz; üretilmez.
- Gemini model kimliği `gemini-3.8-flash` olarak ayarlıdır. API'de ad değişirse yalnızca `providers.yaml` güncellenir.
- PDF metinleri Türkçe veya İngilizce üretilir; alıntılar her iki dilde de kaynak dilinde kalır.

## Sağlayıcı şartları

> Bir sağlayıcıya abonelik/coding-plan üzerinden erişiyorsan, otomatik/toplu kullanıma izin verip vermediğini sağlayıcının şartlarından kontrol et.

## Demo modu

`--demo` raporu örnek veriyle üretir: sayfa ortasında açık gri, döndürülmüş `ÖRNEK` filigranı ve her sayfanın altında "Bu sayfadaki mekan, yorumlar ve rakamlar örnek amaçlıdır." disclaimer'ı bulunur. Filigran metnin okunmasını engellemez; çıktı gerçek rapor olarak kullanılamaz.

## Kabul

1. Dört fixture (`az`, `cok`, `yanitsiz`, `altpuansiz`) için PDF üretildi ve yolları listelendi.
2. Her alıntı kaynakta birebir; doğrulama raporu kanıtlı.
3. `gemini`, `openai_compat` (GLM + DeepSeek) ve `opencode` config'ten seçilebilir; anahtar yoksa net hata verir.
4. 429/ağ hatasında çökme yok; koşu kaldığı yerden devam eder.
5. README; kurulum, `.env`, `providers.yaml`, komutlar ve bilinen sınırları içerir.
