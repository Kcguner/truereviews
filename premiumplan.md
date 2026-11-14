# PREMIUM PLAN — TrueReviews Kişisel Rapor

Bağımsız Python CLI. Girdi: Apify `compass/google-maps-reviews-scraper` JSON çıktısı.
Çıktı: mekan sahibine gönderilecek 2–3 sayfalık A4 PDF (TR/EN) + makine okunur dosyalar.
Web sitesinden tamamen bağımsız: `truereviews-cli/` alt klasörü, kendi venv'i, kendi `.env`'i, sıfır ortak import.

Tasarım referansı: kullanıcının verdiği 2 sayfalık "Örnek Pasta & Cafe" raporu. Birebir kopya değil; aynı bilgi mimarisi, aynı sakin editoryal dil, aynı renk disiplini.

---

## 1. İlkeler

1. **Sayılar koddan.** Ortalama, oran, dağılım, trend, skor yalnızca `metrics.py`/`insights.py` üretir. Model sayı yazmaz, var olanı cümleye çevirir.
2. **Her iddia kanıtlı.** Övgü/şikayet/tek adım blokları `review_ids`, alıntılar (`top_quotes` dahil) `review_id` taşır; doğrulama kapısı geçmeyen blok rapora girmez.
3. **Gizlilik.** Modele yorumcu adı, profil linki, fotoğraf, yorum URL'si gitmez. Rapor yorumcu adı içermez.
4. **Dürüstlük.** Eksik veri için boş kutu, "N/A", sıfır gösterimi yok; bölüm sessizce gizlenir. Kapsam, verinin gerçekten kapsadığı tarih aralığıdır.
5. **Sadelik.** Turuncu yok. Bölüm başına tek fikir. Süs değil, hiyerarşi.

---

## 2. Klasör yapısı

```
truereviews-cli/
├── pyproject.toml              # `rapor` entry point (typer)
├── requirements.txt
├── README.md
├── .env.example
├── providers.example.yaml
├── config.example.yaml
├── rapor/
│   ├── cli.py                  # run, batch, compare, thinking-test, review, approve, track
│   ├── config.py               # providers.yaml + config.yaml + .env; doğrulama
│   ├── normalize.py            # Apify JSON → Place/Review (field_map)
│   ├── schemas.py              # Place, Review, TagItem, WriteResult
│   ├── providers/
│   │   ├── base.py             # generate_json() tek arayüz; cache + limit + kullanım
│   │   ├── gemini.py
│   │   ├── openai_compat.py
│   │   └── opencode.py
│   ├── ratelimit.py            # semaphore + token bucket + günlük kota + state
│   ├── cache.py                # sha256(model, prompt, şema, thinking) disk cache
│   ├── usage.py                # token/süre/maliyet → usage.json
│   ├── pipeline/
│   │   ├── metrics.py          # A: deterministik metrikler + 0–100 skor
│   │   ├── insights.py         # A2: koddan verdict/trend/anomali cümleleri
│   │   ├── tag.py              # B: 20'lik gruplar, pydantic, grup retry
│   │   ├── aggregate.py        # C: konu kümesi, kanıt gücü, yanıtsız önceliği
│   │   ├── write.py            # D: sabit JSON şeması
│   │   └── validate.py         # E: alıntı birebirlik, id, sayı tutarlılığı
│   ├── pdf/
│   │   ├── report.py           # akış, sayfa bütçesi, kırpma, filigran, sayfa no
│   │   ├── components.py       # stat_box, topic_row, complaint_card, cta_box...
│   │   ├── charts.py           # aylık çizgi (anomali noktalı), dağılım, hizmet
│   │   ├── theme.py            # palet, font kaydı, ölçüler
│   │   └── i18n.py             # TR/EN metinler
│   ├── prompts.py              # tag/write promptları (TR/EN)
│   └── state.py                # out/ yapısı, slug, run/batch devam durumu (grup bazlı)
├── fonts/                      # DejaVuSans, DejaVuSans-Bold, DejaVuSerif-Italic + LICENSE
├── fixtures/                   # az, cok, yanitsiz, altpuansiz
└── tests/
```

---

## 3. Sağlayıcı katmanı

Tek arayüz:

```python
generate_json(profile, system, user, schema, thinking, max_tokens) -> LLMResult
```

`LLMResult`: `data` (parse edilmiş JSON), `usage` (giriş/çıkış/düşünme token, süre), `cached`.

| Adaptör | Yol | Not |
|---|---|---|
| `gemini` | google-genai SDK | `response_schema` + JSON modu; `thinking_level` low/medium/high. **gemini-3.8-flash'ta `minimal` config doğrulamasında reddedilir.** |
| `openai_compat` | openai SDK, `base_url` config'ten | GLM (Z.ai `open.bigmodel.cn/api/paas/v4`, `glm-5.3-flash`), DeepSeek (`deepseek-flash`), OpenRouter. Sağlayıcıya özel thinking/reasoning parametreleri `extra_body` ile serbest. |
| `opencode` | `opencode run -m provider/model --format json` (subprocess) | Non-interactive doğrulandı. JSON modu yok: metinden parse + pydantic + retry. Çalışmazsa "desteklenmiyor" kapatılır, sebep README'de; diğer adaptörler etkilenmez. |

- `providers.yaml`: adlandırılmış profiller — `{ad, adapter, model, base_url, api_key_env, thinking, max_tokens, concurrency, requests_per_minute, daily_request_limit, pricing, extra_body}`.
- Adım→profil: `config.yaml` → `steps.tag.profile`, `steps.write.profile`; CLI `--tag-profile/--write-profile` ezer.
- Varsayılan Gemini modeli: **gemini-3.8-flash**.
- Hız: profil başına semaphore + token bucket. 429/5xx/ağ → tenacity üstel geri çekilme. Günlük kota dolunca `state.json`'a yazıp dur. Devam: tag grup sonuçları `out/<slug>/state.json`'a grup bazında yazılır; `run` ve `batch` yeniden çalışınca yalnızca eksik gruplar koşulur, write cache'ten gelir.
- Kullanım: her çağrı `{adım, profil, model, in, out, thinking, süre, cached, tahmini_maliyet}` → `usage.json`. Fiyat yoksa maliyet boş.
- Cache: aynı `(adapter, model, thinking, max_tokens, schema, system, user)` → tek HTTP çağrısı. `--no-cache` ile kapanır.

---

## 4. Girdi, kapsam, gizlilik

`field_map` config'te (koda gömülü değil). Doğrulanan alanlar:

| İhtiyaç | Apify alanı |
|---|---|
| yorum metni | `text` (orijinal dil) |
| çeviri (kullanılmaz) | `textTranslated` |
| yıldız | `stars` |
| tarih | `publishedAtDate` (ISO) |
| kimlik | `reviewId` |
| sahip yanıtı | `responseFromOwnerText` |
| görseller | `reviewImageUrls` (yalnızca sayı) |
| bağlam | `reviewContext` |
| hizmet puanları | `reviewDetailedRating` |
| dil | `originalLanguage` |
| mekan | `title`, `categoryName`, `city`, `countryCode`, `totalScore`, `reviewsCount` |

- `text` orijinal dilde, `textTranslated` Google çevirisi → **orijinal kullanılır**, çeviri modele gitmez. ⚠ varsayım, README'de işaretli.
- Modele giden: `{id, text, stars, month, answered}`. Yorumcu adı/profil metadata'sı gitmez; ancak yorum *metni* kişi adı içerebilir — alıntı seçimi buna göre yapılır (D prompt kuralı).
- Alıntılar TR ve EN raporda da orijinal dilde birebir kalır (çeviri yok); rapor dili yalnızca üretilen metinleri/etiketleri belirler.
- Puan normalizasyonu web'deki `normalizeRating` ile birebir aynı (`lib/apify.ts`): okunamaz/≤0 → nötr 3; >10 → nötr 3; 6–10 → 5'e kırpılır; 1–5 arası ondalık korunur (0.1 hassasiyet, ör. 2.5).
- Görsel URL'leri modele gitmez, raporda kullanılmaz (yalnızca `image_count` ileride).
- Kapak kapsam satırı: `Google Maps · <başlangıç> – <bitiş> arasındaki N yorumun tamamı okundu`. "Son 12 ay" gibi sabit iddia yok; veri neyi kapsıyorsa o yazılır.

---

## 5. Pipeline

### A — `metrics.py` (kod)
Toplam, puan dağılımı (1–5), ortalama, olumlu oran (4–5★), aylık ortalama serisi, son 90 gün `{count, avg}`, yanıt oranı, hizmet bazlı ortalamalar, 0–100 skor. "Son 90 gün"ün referansı rapor tarihidir (çalışma günü); veri eskiyse kapsam satırı gerçek aralığı gösterir.

Skor: `100 × (w1·avg/5 + w2·positive_ratio + w3·recent_avg/5)`, varsayılan `0.60/0.25/0.15`. Son 90 günde yorum yoksa genel ortalama kullanılır (raporda not düşülür).

### A2 — `insights.py` (kod, yeni)
Raporun "zeki" görünen cümleleri buradan gelir; hepsi şablon + hesaplanmış sayı:

- **Bant**: `0–49 zayıf / 50–69 orta / 70–84 iyi / 85–100 çok iyi` (config). Örnek: 82 → "İyi".
- **Verdict**: bant + en güçlü sinyal (yalnızca koddan gelen sinyaller: trend, anomali, yanıt boşluğu). `"İyi — müşteriler genel olarak memnun; son 3 ayda ortalama puan 0,4 yıldız geriledi."`
- **Trend**: son 90 gün ortalaması genel ortalamanın `≥0.3` altındaysa "son 3 ayda düşüş". Son 90 günde yorum yoksa trend cümlesi üretilmez (skor fallback'i A'da tanımlı); anomali aylık seriden hesaplanır, recent boşluğundan etkilenmez.
- **Anomali**: aylık ortalama `<4.0` olan aylar işaretlenir; grafikte kırmızı nokta + tek cümle. Şablon gerçek ay adlarını/sayıyı kullanır: "Kırmızı noktalar: <ay adları> — ortalama puanın 4,0'ın altına indiği N ay." Aylar ardışık veya en son aylar olmak zorunda değil; sabit "son iki ay" ifadesi yok.
- **Yoğunluk**: konu yorumlarının tarih aralığı ve son 3 ay sayısı.
- **Yanıt boşluğu**: yanıt oranı `<%50` ise tek cümle; `%100` ise bölüm tamamen gizlenir.
- Gün/saat iddiası **yok**: "tamamı cumartesi öğleden sonra" yorum tarihinden kanıtlanamaz; v1'de üretilmez.

### B — `tag.py`
20'lik gruplar, ucuz profil, düşük düşünme. Çıktı: `{id, sentiment, topics[], products[], severity 1–3}`. Pydantic doğrulama; hatalı grup `max_group_retries` kez yeniden denenir, yine olmazsa o grup etiketsiz kalır (uyarı `review.md`'ye).

### C — `aggregate.py`
Önce konu kanonikleştirme: etiketler NFKC + casefold + trim ile normalize edilir; `config.yaml` → `topic_aliases` sözlüğü eş anlamlıları birleştirir ("garson", "servis hızı" → "servis"). Eşleşmeyen etiket ayrı konu kalır; birleştirme deterministiktir, model kullanılmaz. Sonra konu kümesi: ad, yorum sayısı, tarih aralığı, ortalama yıldız, duygu dağılımı, son 3 ay yoğunluğu, kanıt gücü (`≥3` güçlü, `1–2` izlenmeli). Kanıt gücü ve tüm sayılar burada hesaplanır, D'ye hazır gider. Övülen ürünler (aynı kanonikleştirme). Yanıtsız listesi: düşük puan + yeni önce.

### D — `write.py`
Güçlü profil, orta düşünme. Girdi: `metrics` + `insights` + C kümeleri + her kümenin kanıt yorumlarının ham metinleri (`{id, text, stars, month, answered}`) — birebir alıntı için ham metin şart. Sabit şema:

```json
{
  "themes_praise":     [{"name", "review_ids", "quote_review_id", "quote"}],
  "themes_complaint":  [{"name", "review_ids", "quote_review_id", "quote", "reply_draft"}],
  "products_praised":  [{"name", "review_ids"}],
  "instagram_caption": "...",
  "top_quotes":        [{"quote", "review_id"}],
  "single_step":       {"action", "reason", "evidence_review_ids", "effort", "how_to_measure"},
  "unanswered_reply_drafts": [{"review_id", "reply"}]
}
```

`strength` model çıktısı değildir: kanıt gücü ve rozet sayıları (`GÜÇLÜ SİNYAL · 5 yorum`) C'den gelip `report.json`'a koddan eklenir (İlke 1).

Prompt kuralları: sayı üretme; her iddiaya `review_ids`; tek adım gerçekten tek ve ölçülebilir; tek yorumluk şikayet kesin sorun değil; ton dürüst/sıcak/saygılı, klişe yok; taslaklar mekan adına, kısa, tazminat/söz yok; alıntıda kişi adı geçiyorsa başka alıntı seçilir (ad sansürlenmez, birebirlik bozulmaz). Taslak dili = rapor dili.

### E — `validate.py`
- Alıntı: NFKC + casefold + boşluk/noktalama normalizasyonu sonrası kaynak metinde substring; `≤15` kelime.
- `quote_review_id`, `top_quotes[].review_id` ve tüm `review_ids` gerçek yorumlarda var mı; alıntı kuralları `top_quotes` için de aynen uygulanır.
- Şema: pydantic; boş `review_ids` reddedilir.
- Sayı tutarsızlığı (yöntem): alıntılar hariç model metinlerinden sayılar regex ile çıkarılır (`\d+([.,]\d+)?`, yüzde dahil). İzin verilen küme = metrics/insights sayıları + konu/kanıt sayıları + `review_ids` uzunlukları; küme dışı sayı → uyarı + blok gizlenir. Alıntılar kaynak metin olduğu için tarama dışıdır.
- Rozet/meta sayıları koddan yazılır; `review_ids` uzunluğuyla eşitliği PDF kurulumunda doğrulanır.
- Geçmeyen blok gizlenir; `review.md`'ye `uyarı` satırı. `report.json.validation` oranları `compare` için sayılır.

---

## 6. PDF — rapor anatomisi

**Hedef 2 sayfa, üst sınır 3.** Taşma kırpma sırası: izlenmeli kartları → fazla övgü konuları → `top_quotes` → grafikler (hizmet → dağılım → çizgi) → yanıtsız satırları → kart özet modu (alıntı + taslak tek satır) → en düşük kanıtlı tema kartlarının tamamen düşürülmesi. Tek adım, yöntem notu ve alt bilgi asla düşmez. Bölümler `KeepTogether`; başlık tek başına sayfa sonunda kalmaz.

### Palet (turuncu yok)
| Rol | Renk |
|---|---|
| mürekkep | `#14201E` |
| ana (koyu yeşil-teal) | `#1F4E4A` |
| ana yumuşak zemin | `#E8F0ED` |
| şikayet (sıcak kırmızı) | `#B0432F` |
| şikayet zemini | `#F7EAE6` |
| izlenmeli (gri-mavi) | `#7086A0` |
| çizgi | `#D9DEDB` |
| kağıt | `#FCFCFA` |

### Tipografi
- Gövde/başlık: **DejaVu Sans**, **DejaVu Sans Bold**.
- Alıntılar: **DejaVu Serif Italic** (el yapımı, editoryal his).
- Türkçe karakterler üç fontta da tam. Lisans dosyası repoda.

### Sayfa 1
1. **Üst çizgi**: sol `TrueReviews · Kişisel Rapor`, sağ `Rapor tarihi: <gün ay yıl>`, altında ince çizgi.
2. **H1**: mekan adı (büyük, sıkı). Altında kapsam satırı (gri, küçük).
3. **5 kutu**: birincil değer büyük + BÜYÜK HARF etiket + alt açıklama.
   - Google puanı (varsa "112 yorum üzerinden")
   - Okunan yorum (veri aralığı)
   - Son 90 gün yorum sayısı
   - Yanıt oranı (`12 / 64`)
   - Memnuniyet skoru `82` / 100
4. **1 · Genel görünüm** — iki kolon:
   - Sol: `82/100` büyük, bant etiketi, verdict cümlesi, "Nasıl hesaplandı?" paragrafı (gerçek sayılarla, 2 cümle).
   - Sağ: aylık ortalama çizgi grafiği; eşik altı aylar kırmızı nokta; altında tek satır anomali notu.
5. **Puan dağılımı** (sol) + **Hizmet bazlı puan** (sağ, veri varsa):
   - Dağılım çubukları 5→1, sağda sayı; 4–5 teal, 3 nötr, 1–2 kırmızı.
   - Hizmet çubukları + tek cümle çıkarım ("Yemek önde; servis en düşük").
6. **2 · Müşteriler en çok neyi övüyor?**
   - Konu satırı: ad (bold) + "22 yorumda geçiyor" + oransal çubuk (en yüksek konuya göre) + tek alıntı (serif italic, gerekirse `…`).
   - "En çok övülen ürünler: ..." tek satır.
   - Instagram kutusu: yumuşak yeşil zemin, "Bu hafta Instagram'da paylaşabilirsiniz:" + metin.

### Sayfa 2
7. **3 · Nerede sorun var?**
   - Giriş: "Sinyal gücü: 3+ yorumda geçen konu 'güçlü', 1–2 yorumda geçen 'izlenmeli'."
   - **Güçlü kart**: sol kırmızı dikey şerit; başlık + rozet `GÜÇLÜ SİNYAL · 5 yorum` (sayı = `review_ids` uzunluğu, koddan); meta satır `Eylül–Kasım arasında 4 yorum, ortalama 2,2 ★` (koddan); alıntı; `HAZIR YANIT TASLAĞI` etiketi + taslak kutusu.
   - **İzlenmeli kart**: gri-mavi rozet, aynı iskelet, daha kısa; taslak yalnızca varsa.
   - En çok 3 güçlü + 2 izlenmeli.
8. **4 · Yanıtsız kalan yorumlar**
   - Tek cümle oran + tablo: `PUAN | YORUM | HAZIR YANIT TASLAĞI`, en önemli 3 satır (düşük puan + yeni önce). Yıldız rengi puana göre. Tarih `Eki 2026`.
   - Yanıt oranı `%100` ise bölüm yok.
9. **5 · Bu hafta atacağınız tek adım**
   - Tam genişlik **koyu teal** kutu, beyaz metin: kalın eylem cümlesi; altında `Neden:`, `Emek:`, `Ölçüm:` satır içi kalın etiketlerle.
10. **Yöntem notu** (küçük paragraf): sayılar kodla, alıntılar birebir ve kısaltılmış, yorumcu adı yok.
11. **Alt satır**: sol "İsterseniz bu raporu her ay yeni yorumlarla güncelleyip size gönderelim." (config'ten kapatılabilir); sağ `Kaan Can Güner · TrueReviews` / `kcguner@gmail.com` / `<KCG />`.
12. **Her sayfa altı**: sol demo modunda "Bu sayfadaki mekan, yorumlar ve rakamlar örnek amaçlıdır."; sağ `1 / 2`. Gerçek raporda sol tarafta kısa yöntem izi.

### Demo modu
`--demo`: sayfa ortasında açık gri, döndürülmüş `ÖRNEK` filigranı (metin çizilebilir kalır) + alt bilgi disclaimer.

### Teknik
- `SimpleDocTemplate`, A4, 18 mm kenar.
- Grafikler `reportlab.graphics` (harici görsel yok, deterministik).
- Sayfa sayısı `doc.page` ile ölçülür; 3'ü aşarsa kırpma sırası uygulanıp yeniden kurulur. Döngü sonludur: sıra tükenince özet modu, sonra kart düşürme; korunan çekirdek (tek adım + yöntem notu + alt bilgi) 3 sayfaya sığmazsa koşu hata verir. Özet modu/kart düşürme kullanıldıysa `review.md`'ye uyarı yazılır.
- Fontlar `pdfmetrics.registerFont(TTFont(...))`.

---

## 7. Çıktı sözleşmesi

`out/<slug>/`:

| Dosya | İçerik |
|---|---|
| `rapor.pdf` | final PDF |
| `metrics.json` | yalnızca koddan gelen sayılar (deterministik) |
| `report.json` | `meta`, `place`, `scope`, `metrics`, `insights`, `verdict`, `themes_*`, `products`, `instagram_caption`, `unanswered`, `single_step`, `warnings`, `validation` |
| `review.md` | insan özeti: skor, uyarılar, doğrulama oranı, gizlenen bölümler |
| `usage.json` | çağrı bazında token/süre/maliyet + toplam |

`out/ready/` onaylı raporlar; `tracking.csv`; `out/batch_summary.csv`.

---

## 8. CLI (typer)

| Komut | Davranış |
|---|---|
| `rapor run mekan.json --lang tr --tag-profile X --write-profile Y` | tek mekan; `--demo`, `--no-cache`, `--out` |
| `rapor batch klasor/ --lang tr` | tüm JSON'lar; tamamlanmış slug = `out/<slug>/report.json` mevcut → atlanır; sonunda CSV özet (mekan, skor, durum, uyarı, token, maliyet) |
| `rapor compare mekan.json --profiles a,b,c` | yalnızca **write** profili değişir (tag sabit: config veya `--tag-profile`); profil başına koşu; tablo: şema geçerlilik, alıntı doğrulama, süre, token, maliyet, tek adım metinleri yan yana |
| `rapor thinking-test mekan.json --profile P --levels low,medium` | aynı iş, farklı düşünme; token/kalite farkı |
| `rapor review klasor/` | raporları listele (skor, uyarı, doğrulama) |
| `rapor approve <slug>` | `out/ready/`'ye **kopyalar** (taşıma yok; `out/<slug>` batch devamı için yerinde kalır) + takip CSV'sine "hazır"; insan onayı olmadan hiçbir şey hazır sayılmaz |
| `rapor track` | takip CSV'si: mekan, gönderim tarihi, kanal (mail/instagram), yanıt durumu (elle) |

Hata davranışı: anahtar yoksa net mesaj (`GEMINI_API_KEY tanımlı değil — .env dosyasına ekleyin`), eksik config'te hangi alan olduğu, 429/ağ'da çökme yok.

---

## 9. Test ve kabul

Fixture'lar: `az` (8 yorum), `cok` (~120 yorum, karışık yanıt), `yanitsiz` (hiç yanıt yok), `altpuansiz` (hizmet puanı yok).

Testler:
- `metrics`: sayım, dağılım, ortalama, olumlu oran, 90 gün, yanıt oranı, skor ağırlıkları; `normalizeRating` paritesi (0→3, 7→5, 2.5→2.5, 47→3).
- `insights`: bant, verdict, anomali, trend; boş recent'ta trend cümlesi yok; aynı girdi → aynı cümle.
- `aggregate`: `topic_aliases` birleştirme; kanıt gücü eşikleri; yanıtsız sıralama.
- `validate`: birebir alıntı geçer; noktalama normalizasyonlu geçer; 16 kelime reddedilir; bilinmeyen id reddedilir; küme dışı sayı reddedilir; `top_quotes` id kontrolü; blok gizlenir + uyarı.
- `schemas`: tag/write pydantic; gemini-3.8-flash + `minimal` config hatası.
- `pdf`: 4 fixture'da üretim hatasız, sayfa ≤3, gömülü font, eksik veride bölüm gizli.
- Determinizm: aynı girdi + sahte model, iki koşu → `metrics.json` birebir aynı.
- `providers`: respx ile 429 → retry → başarı; günlük kota → durum kaydı; cache isabeti.
- `live` işaretli gerçek API testi ayrı (`-m "not live"` varsayılan).

Kabul:
1. 4 fixture PDF'i üretildi, yolları listelendi.
2. Her alıntı kaynakta birebir; doğrulama raporu kanıtlı.
3. `gemini`, `openai_compat` (GLM + DeepSeek), `opencode` config'ten seçilebilir; anahtarsız net hata.
4. 429/ağ hatasında çökme yok, kaldığı yerden devam.
5. README: kurulum, `.env`, `providers.yaml`, komutlar, bilinen sınırlar + not:
   > Bir sağlayıcıya abonelik/coding-plan üzerinden erişiyorsan, otomatik/toplu kullanıma izin verip vermediğini sağlayıcının şartlarından kontrol et.

---

## 10. Varsayımlar ve sınırlar

- ⚠ Apify actor'ü `compass/google-maps-reviews-scraper`; alan adları dokümandan doğrulandı, farklı actor için `field_map` yeterli.
- ⚠ `text` orijinal dil kabul edildi; `textTranslated` hiç kullanılmaz.
- ⚠ `opencode` adaptöründe yapılandırılmış çıktı yok: JSON metinden ayrıştırılır, şema doğrulanır, 2 kez yeniden denenir. Token bilgisi CLI çıktısında yoksa 0 olarak loglanır ve README'de belirtilir.
- Gemini model kimliği `gemini-3.8-flash`; API'de ad değişirse yalnızca config güncellenir.
- PDF en fazla 3 sayfa; çok sayıda güçlü tema varsa en yüksek kanıtlı olanlar kalır.
- "Hafta sonu / öğleden sonra" gibi ziyaret zamanı iddiaları veriden kanıtlanamaz; üretilmez.

---

## 11. Yapım sırası (her faz çalışır durumda)

1. İskelet + config + `normalize` + fixture'lar.
2. Sağlayıcı katmanı: `openai_compat` → `gemini` → `opencode`; cache/limit/kullanım.
3. Pipeline A, A2, B, C, D, E; mock adaptörle uçtan uca.
4. PDF: tema, bileşenler, grafikler, sayfa bütçesi; fixture'larla görsel kontrol (PNG'ye render edip bak).
5. CLI komutları + batch/compare/track.
6. Testler, README, örnek config'ler, kabul kanıtları.
