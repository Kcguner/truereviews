# KABUL — plan §9 kanıt tablosu

Tarih: 14 Kasım 2026 · Paket: `truereviews-cli` · Python: `.venv/bin/python`
Test sonucu: **425 passed** (`.venv/bin/python -m pytest -q`).

Kabul koşusu `mock` profiliyle, ağ olmadan yapıldı. Config geçici dizine
kopyalandı (`providers.yaml` + `config.yaml`, `steps.tag/write.profile: mock`);
repoya `providers.yaml` / `config.yaml` işlenmedi. Komutlar repo kökünden
`--config-dir <tmp> --out .` ile çalıştırıldı: `state.out_dir_for(root, slug)`
`<root>/out/<slug>` ürettiği için `--out .` çıktıyı `truereviews-cli/out/`
altına yazar.

## Özet

| # | Kabul maddesi | Durum | Kanıt |
|---|---|---|---|
| 1 | 4 fixture PDF'i üretildi, yolları listelendi | ✓ | 4 PDF, her biri 2 sayfa (≤3); her dizinde `rapor.pdf`, `report.json`, `metrics.json`, `review.md`, `usage.json`. Yollar aşağıda. |
| 2 | Her alıntı kaynakta birebir; doğrulama kanıtlı | ✓ | `out/` içindeki 4 `report.json`'da 8 tema alıntısı + `kabul-artifacts/` ile 12 alıntı, 0 sorun; 12 `top_quotes` ayrıca 0 sorun. Her koşuda `validation.ratio = 1.0`, `hidden_blocks = []`. |
| 3 | `gemini`, `openai_compat` (GLM + DeepSeek), `opencode` config'ten seçilebilir; anahtarsız net hata | ✓ | `tests/test_config.py` (adapter/profil, `test_api_key_missing_message`, `test_unknown_adapter_rejected`), `tests/test_gemini.py` (10), `tests/test_openai_compat.py` (14), `tests/test_opencode.py` (7), `tests/test_cli.py::test_missing_api_key_message`. |
| 4 | 429/ağ hatasında çökme yok, kaldığı yerden devam | ✓ | `tests/test_openai_compat.py` (429 → retry → başarı, kota), `tests/test_tag.py` (grup retry, uyarı). Canlı kanıt: `cok` state'inden grup 2 silindi → yeniden koşuda tag çağrısı 6 → 7 (yalnızca 1 grup), çökme yok. |
| 5 | README: kurulum, `.env`, `providers.yaml`, komutlar, bilinen sınırlar + abonelik notu | ✓ | `README.md` 209 satır; kurulum `.env`/`providers.yaml` bölümleri, komut tablosu, "Bilinen sınırlar ve varsayımlar" (satır 185+) ve istenen abonelik/coding-plan notu (satır 197). |

## 1 — PDF üretimi (mutlak yollar)

| Fixture | PDF | Sayfa | Dosyalar |
|---|---|---|---|
| `az` (8 yorum, TR) | `/Users/kaan/Desktop/PROJELER/truereviews/truereviews-cli/out/kucuk-fincan/rapor.pdf` | 2 | 5/5 tam |
| `cok` (120 yorum, TR) | `/Users/kaan/Desktop/PROJELER/truereviews/truereviews-cli/out/mavi-firin-ve-kahve/rapor.pdf` | 2 | 5/5 tam |
| `yanitsiz` (30 yorum, TR) | `/Users/kaan/Desktop/PROJELER/truereviews/truereviews-cli/out/yesil-bahce-kahvalti-salonu/rapor.pdf` | 2 | 5/5 tam |
| `altpuansiz` (25 yorum, TR) | `/Users/kaan/Desktop/PROJELER/truereviews/truereviews-cli/out/nar-cicegi-kafe/rapor.pdf` | 2 | 5/5 tam |
| `az` `--demo` | `/Users/kaan/Desktop/PROJELER/truereviews/truereviews-cli/kabul-artifacts/demo-az/rapor.pdf` | 2 | 5/5 tam |
| `az` `--lang en` | `/Users/kaan/Desktop/PROJELER/truereviews/truereviews-cli/kabul-artifacts/en-az/rapor.pdf` | 2 | 5/5 tam |

Not: `--demo` ve `--lang en` koşuları aynı slug'ı (`kucuk-fincan`) ürettiği
için normal TR koşusundan önce çalıştırıldı ve çıktıları
`kabul-artifacts/demo-az/`, `kabul-artifacts/en-az/` altına kopyalandı. `out/`
altındaki dört fixture normal TR raporudur.

Her koşu: `Uyarı: 0`, `Doğrulama: %100`.

## 2 — Alıntı birebirlik kanıtı

Doğrulama betiği `rapor.pipeline.validate.normalize_quote` ile substring
kontrolü yaptı (NFKC + casefold + boşluk/noktalama normalizasyonu):

| Kaynak | Kontrol edilen alıntı | Sorun |
|---|---|---|
| 4 fixture `report.json` (`themes_praise` + `themes_complaint`) | 8 | 0 |
| + `kabul-artifacts/demo-az`, `en-az` `report.json` | 12 | 0 |
| `top_quotes` (mock write çıktısı; her fixture 3) | 12 | 0 |

`report.json` sözleşmesi (plan §7) `top_quotes` alanını taşımaz; bu alıntılar
E adımında `validate_report` ile denetlenir ve her koşuda
`validation.valid_blocks = 9 / 9` (içinde `top_quotes` bloğu var),
`hidden_blocks = []` olur. Ek olarak mock write çıktısı doğrudan üretilip 12
`top_quotes` kaynak metinde birebir doğrulandı.

Alıntılar ≤15 kelime; alıntı seçimi mock'ta yorumun ilk 8–10 kelimesidir
(kaynak metnin prefix'i).

## 3 — Sağlayıcı seçimi

`providers.yaml` profilleri `adapter` alanıyla seçilir (`gemini`,
`openai_compat`, `opencode`, `mock`). Adım→profil eşlemesi `config.yaml`
`steps.tag.profile` / `steps.write.profile`; CLI `--tag-profile` /
`--write-profile` ezer. Anahtar yalnızca profil kullanılınca çözülür; eksikse
`GEMINI_API_KEY tanımlı değil …` mesajı ve sıfır olmayan çıkış kodu
(`tests/test_cli.py::test_missing_api_key_message`,
`tests/test_config.py::test_api_key_missing_message`).

## 4 — Dayanıklılık ve devam

* 429/5xx/ağ: üstel geri çekilme; `tests/test_openai_compat.py` HTTP
  seviyesinde mock'lu.
* Günlük kota: `state.json`'a yazılır, sonraki koşu kaldığı yerden devam eder.
* Grup bazlı devam (canlı kanıt, `cok` = 6 grup):

```
önce completed: [0, 1, 2, 3, 4, 5]   gruplar: ['0','1','2','3','4','5']
state.json'dan grup 2 silindi
sonra completed: [0, 1, 3, 4, 5]     gruplar: ['0','1','3','4','5']
önce tag çağrısı: 6  →  sonra tag çağrısı: 7
```

Tam yeniden koşu yerine yalnızca 1 grup koştu; skor ve doğrulama değişmedi
(`76.96/100`, `%100`).

## 5 — Determinizm

Aynı fixture iki kez koşuldu (ikinci koşu `state.json` + cache kullanır);
`metrics.json` diff sonucu:

| Fixture | Sonuç |
|---|---|
| `az` | AYNI |
| `cok` | AYNI |
| `yanitsiz` | AYNI |
| `altpuansiz` | AYNI |

## Mock düzeltmeleri (bu koşu için)

1. **Görev ayrımı**: `--lang en` etiket promptunun kullanıcı metnindeki
   "Write only the JSON array." cümlesi `_is_write_task`'i write moduna
   sokuyordu; tag grubu düşüyordu. Yeni öncelik sırası: sistem metninde write
   şema işareti (`themes_praise`, `single_step`, …) → write; sistem metninde
   etiket işareti (`etiketle`, `classif`, `tagging`, `sentiment`) → tag; aksi
   hâlde daraltılmış anahtar kelime taraması. Genel `"write"` sözcüğü listeden
   çıkarıldı. Determinizm korunur (girdi aynıysa çıktı aynı).
2. **Serbest metin sayıları**: `how_to_measure` içindeki "Sonraki 30 günde"
   sayısı izinli kümenin dışında kalıp `single_step` bloğunu gizletiyordu.
   Mock artık serbest metinde rakam üretmez (`"Bir hafta boyunca bu konu geçen
   yorumların ortalama puanı"`, emek: `"yaklaşık bir saat"`). Böylece tüm
   serbest metin sayıları metrics/insights/kanıt kümesinden gelir.

Testler: `tests/test_mock.py` 14 passed (TR/EN gerçek promptlarla görev ayrımı,
rakamsız serbest metin + `validation.ratio == 1.0`, determinizm, sentiment-stars,
şema uyumu); `tests/test_cli.py` 12 passed (`test_run_lang_en_keeps_tags_and_single_step`).

## Eksik / not

- `report.json` plan §7 sözleşmesinde `top_quotes` alanı yok. Bu yüzden
  `top_quotes` birebirlik kanıtı dosyadan değil, E adımı doğrulamasından
  (`9/9` blok) ve mock write çıktısından üretildi. Sözleşmeye `top_quotes`
  eklenmesi istenirse `rapor/cli.py` (bu görevin dosyası değil) değişir.
- Koşu tarihi `datetime.date.today()` (14 Kasım 2026); "son 90 gün" penceresi
  bu tarihe göre hesaplanır.
- `--out out` yazılsaydı çıktı `out/out/<slug>` olurdu; kanonik `out/<slug>`
  için `--out .` kullanıldı.
