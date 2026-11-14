"""Tag (B) ve write (D) promptları — TR/EN (plan §5-B, §5-D).

Kurallar:

* Promptlar statik metin + parametre doldurmadır; modelden sayı istenmez.
* Modele giden yorum kaydı yalnızca `{id, text, stars, month, answered}`
  taşır (gizlilik, plan §4). Fazladan alan varsa süzülür.
* Tag promptu "etiket/sınıflandır" sözcüklerini taşır, write promptu
  "rapor/taslak" sözcüklerini; mock adaptör görev tipini böyle ayırır.
"""

from __future__ import annotations

import json
from typing import Any, Mapping, Sequence

__all__ = [
    "LANG_NAMES",
    "normalize_lang",
    "tag_system",
    "tag_user",
    "write_system",
    "write_user",
]

LANG_NAMES: dict[str, str] = {"tr": "Türkçe", "en": "English"}

TAG_REVIEW_FIELDS: tuple[str, ...] = ("id", "text", "stars", "month", "answered")


def normalize_lang(lang: str | None) -> str:
    """`tr`/`en` döner; desteklenmeyen dil `ValueError`."""
    key = str(lang or "tr").strip().lower()
    if key not in LANG_NAMES:
        raise ValueError(f"desteklenmeyen dil: '{lang}' (tr|en)")
    return key


def _get(source: Any, key: str, default: Any = None) -> Any:
    if source is None:
        return default
    if isinstance(source, Mapping):
        return source.get(key, default)
    return getattr(source, key, default)


def _review_record(review: Any) -> dict[str, Any]:
    """Gizlilik süzgeci: yalnızca izinli beş alan (plan §4)."""
    stars = _get(review, "stars")
    try:
        stars = float(stars)
    except (TypeError, ValueError):
        stars = 3.0
    return {
        "id": str(_get(review, "id", "")),
        "text": str(_get(review, "text", "")),
        "stars": stars,
        "month": str(_get(review, "month", "")),
        "answered": bool(_get(review, "answered", False)),
    }


def _records(reviews: Sequence[Any]) -> list[dict[str, Any]]:
    return [_review_record(review) for review in reviews]


def _json_block(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, default=str)


# ---------------------------------------------------------------------------
# B — etiketleme
# ---------------------------------------------------------------------------


_TAG_SYSTEM_TR = """Sen Google Maps yorumlarını sınıflandıran bir etiketleme modelisin. \
Her yorumu okuyup duygu, konu etiketleri, ürün adları ve ciddiyet ata.

Girdi: her yorum için yalnızca {{id, text, stars, month, answered}}. Başka alan \
yoktur; başka alan isteme.

Duygu (sentiment) yalnızca yorum METNİNE göre belirlenir, yıldız sayısına göre değil:
- positive: metin memnuniyet, övgü veya tavsiye içerir.
- negative: metin şikayet, hayal kırıklığı veya somut bir sorun anlatır.
- neutral: metin yalnızca bilgi verir; belirgin olumlu ya da olumsuz yargı yoktur.
Pragmatik kural: metin ile stars çelişirse METİN kazanır. Örneğin 5 yıldız verilmiş \
ama metin soğuk servisten yakınıyorsa sentiment negative olur.

Konular (topics): yorumda geçen konular için 1–3 kısa etiket yaz. Etiket en çok \
3 kelime olsun ve {lang_name} dilinde yazılsın. Yorumda belirgin konu yoksa boş \
liste ver.

Ürünler (products): yorumda adı geçen ürünleri aynen yaz (ör. flat white, \
cheesecake). Ürün adı geçmiyorsa boş liste ver.

Ciddiyet (severity):
1 = küçük, tek seferlik aksaklık;
2 = belirgin veya tekrar eden sorun;
3 = ciddi sorun (hijyen, güvenlik, para kaybı gibi acil konu).
Olumlu ve nötr yorumlarda severity 1'dir.

Çıktı yalnızca JSON dizisi olsun. Her girdi yorumu için tam bir nesne döndür; \
başka metin, açıklama veya markdown yok:
[{{"id": "...", "sentiment": "positive|negative|neutral", "topics": ["..."], \
"products": ["..."], "severity": 1}}]

Kurallar: her id'yi tam bir kez döndür; id'leri değiştirme; yeni id uydurma; \
girdide olmayan yorum ekleme."""

_TAG_SYSTEM_EN = """You are a tagging model that classifies Google Maps reviews. \
Read every review and assign sentiment, topic tags, product names and severity.

Input: for each review only {{id, text, stars, month, answered}}. No other field \
exists; do not ask for one.

Sentiment is decided from the review TEXT only, not from the star rating:
- positive: the text shows satisfaction, praise or a recommendation.
- negative: the text reports a complaint, disappointment or a concrete problem.
- neutral: the text only gives information; no clear positive or negative judgement.
Pragmatic rule: when text and stars conflict, TEXT wins. For example, 5 stars with \
a text about cold service means sentiment negative.

Topics: give 1–3 short tags for the subjects in the review. A tag is at most \
3 words and in {lang_name}. If there is no clear subject, return an empty \
list.

Products: copy product names that appear in the review (for example flat white, \
cheesecake). Return an empty list when no product is named.

Severity:
1 = minor, one-off glitch;
2 = clear or recurring problem;
3 = serious problem (hygiene, safety, loss of money and similar urgent issues).
Positive and neutral reviews get severity 1.

Output only a JSON array. Return exactly one object per input review; no other \
text, explanation or markdown:
[{{"id": "...", "sentiment": "positive|negative|neutral", "topics": ["..."], \
"products": ["..."], "severity": 1}}]

Rules: return every id exactly once; never change an id; never invent an id; \
never add a review that is not in the input."""


def tag_system(lang: str = "tr") -> str:
    """Etiketleme sistem promptu (TR/EN)."""
    key = normalize_lang(lang)
    template = _TAG_SYSTEM_TR if key == "tr" else _TAG_SYSTEM_EN
    return template.format(lang_name=LANG_NAMES[key])


def tag_user(reviews: Sequence[Any], lang: str = "tr") -> str:
    """Etiketlenecek yorumları JSON olarak taşıyan kullanıcı promptu.

    Gizlilik: yalnızca `id, text, stars, month, answered` yazılır; yorumcu
    adı/profil/fotoğraf hiçbir biçimde prompta girmez.
    """
    key = normalize_lang(lang)
    payload = _records(reviews)
    if key == "tr":
        header = (
            "Etiketlenecek yorumlar aşağıda JSON dizisi olarak verilmiştir. "
            "Her yorum için bir nesne döndür. Yalnızca JSON dizisi yaz."
        )
    else:
        header = (
            "The reviews to tag are given below as a JSON array. "
            "Return one object per review. Write only the JSON array."
        )
    return f"{header}\n```json\n{_json_block(payload)}\n```"


# ---------------------------------------------------------------------------
# D — yazım
# ---------------------------------------------------------------------------


_WRITE_SYSTEM_TR = """Sen bir mekan sahibi için müşteri yorumlarından kişisel bir \
değerlendirme metni yazan editörsün. Yazdığın metinler ve taslaklar {lang_name} \
dilinde olacak; alıntılar hariç.

Kurallar:
1. Sayı üretme. Yalnızca sana verilen girdideki sayıları kullan; yeni sayı, oran, \
yüzde, tarih veya sıralama uydurma. Hesaplama yapma.
2. Her iddiaya kanıt: her tema, ürün ve tek adım için o iddiayı destekleyen \
yorumların id'lerini `review_ids` (tek adımda `evidence_review_ids`) alanına yaz. \
Girdide olmayan id kullanma. Boş liste yasak.
3. Tek adım gerçekten tek olsun: bu hafta uygulanabilir tek bir eylem yaz; \
ölçülebilir bir sonuç ve nasıl ölçüleceğini (`how_to_measure`) belirt. Birden çok \
işi tek adım diye paketleme.
4. Tek yorumluk şikayet kesin sorun değildir. Tek yorumda geçen konuyu genelleme; \
"bazı müşteriler" gibi dürüst ifade kullan. Kanıt 1–2 yorumsa temkinli yaz.
5. Ton dürüst, sıcak ve saygılı olsun. Abartı, klişe ve pazarlama dili yok; boş \
övgü ve slogan kullanma. Suçlayıcı veya savunmacı olma.
6. Taslaklar mekan adına yazılır: kısa (en çok 3 cümle), nazik ve somut olsun. \
Tazminat, indirim, ücretsiz ürün veya gelecek sözü verme; kesin taahhüt etme.
7. Alıntı seçimi: alıntı kaynak yorumdan birebir kopyalanır. Kişi adı geçen \
yorumu alıntı olarak SEÇME; başka bir yorumdan alıntı seç. Adı sansürleme, alıntıyı \
değiştirme, kelime ekleme veya çıkarma.
8. Alıntılar orijinal dilde ve birebir kalır; çeviri yapma. Rapor dili yalnızca \
senin yazdığın metinleri ve taslakları belirler.
9. Alıntı en çok 15 kelime olsun; kaynak metnin başından kesintisiz bir parça al.

Çıktı yalnızca JSON nesnesi olsun; alan adları birebir şunlar: themes_praise, \
themes_complaint, products_praised, instagram_caption, top_quotes, single_step, \
unanswered_reply_drafts."""

_WRITE_SYSTEM_EN = """You are an editor writing a personal assessment for a venue \
owner from customer reviews. Your text and drafts are in {lang_name}; quotes are \
the exception.

Rules:
1. Do not produce numbers. Use only numbers present in the given input; never \
invent a number, ratio, percentage, date or ranking. Do not calculate.
2. Evidence for every claim: for each theme, product and the single step, put the \
ids of the reviews that support the claim in `review_ids` (in the single step use \
`evidence_review_ids`). Never use an id that is not in the input. An empty list is \
not allowed.
3. The single step must really be one step: one action doable this week; state a \
measurable outcome and how it will be measured (`how_to_measure`). Do not bundle \
several jobs into one step.
4. A complaint from a single review is not a confirmed problem. Do not generalise \
a subject seen in one review; use honest wording such as "some customers". If the \
evidence is 1–2 reviews, write cautiously.
5. Tone is honest, warm and respectful. No exaggeration, cliché or marketing \
language; no empty praise or slogans. Do not blame or defend.
6. Drafts are written on behalf of the venue: short (at most 3 sentences), polite \
and concrete. Offer no compensation, discount, free product or future promise; make \
no firm commitment.
7. Quote selection: a quote is copied verbatim from its source review. Do NOT \
choose a review that contains a person's name as the quote; pick a quote from \
another review. Do not censor a name, do not alter the quote, do not add or remove \
words.
8. Quotes stay in their original language and verbatim; do not translate. The \
report language only decides the text and drafts you write.
9. A quote is at most 15 words; take a continuous fragment from the start of the \
source text.

Output only a JSON object; field names are exactly: themes_praise, \
themes_complaint, products_praised, instagram_caption, top_quotes, single_step, \
unanswered_reply_drafts."""


def write_system(lang: str = "tr") -> str:
    """Yazım (D) sistem promptu; tüm D kurallarını taşır (TR/EN)."""
    key = normalize_lang(lang)
    template = _WRITE_SYSTEM_TR if key == "tr" else _WRITE_SYSTEM_EN
    return template.format(lang_name=LANG_NAMES[key])


_WRITE_SCHEMA_TR = """{
  "themes_praise":     [{"name": "...", "review_ids": ["..."], "quote_review_id": "...", "quote": "..."}],
  "themes_complaint":  [{"name": "...", "review_ids": ["..."], "quote_review_id": "...", "quote": "...", "reply_draft": "..."}],
  "products_praised":  [{"name": "...", "review_ids": ["..."]}],
  "instagram_caption": "...",
  "top_quotes":        [{"quote": "...", "review_id": "..."}],
  "single_step":       {"action": "...", "reason": "...", "evidence_review_ids": ["..."], "effort": "...", "how_to_measure": "..."},
  "unanswered_reply_drafts": [{"review_id": "...", "reply": "..."}]
}"""


def write_user(aggregate: Any, evidence_reviews: Sequence[Any], lang: str = "tr") -> str:
    """Yazım kullanıcı promptu: C çıktısı + ham kanıt yorumları (plan §5-D).

    `aggregate` metrikler/içgörüler/konu kümeleridir; `evidence_reviews`
    alıntı için ham metinleri taşır (yalnızca izinli beş alan).
    """
    key = normalize_lang(lang)
    if hasattr(aggregate, "model_dump"):
        aggregate_payload = aggregate.model_dump(mode="json")
    elif isinstance(aggregate, Mapping):
        aggregate_payload = dict(aggregate)
    else:
        aggregate_payload = aggregate

    evidence_payload = _records(evidence_reviews)

    if key == "tr":
        header = (
            "Aşağıda hesaplanmış veriler (aggregate) ve alıntı için kanıt "
            "yorumlarının ham metinleri var. Yalnızca bu verilere dayanarak "
            "istenen JSON nesnesini üret. Yalnızca JSON yaz."
        )
        labels = ("Hesaplanmış veriler", "Kanıt yorumları", "Çıktı iskeleti")
    else:
        header = (
            "Below are the computed data (aggregate) and the raw text of the "
            "evidence reviews for quoting. Produce the requested JSON object "
            "using only this data. Write only JSON."
        )
        labels = ("Computed data", "Evidence reviews", "Output skeleton")

    return (
        f"{header}\n\n"
        f"### {labels[0]}\n```json\n{_json_block(aggregate_payload)}\n```\n\n"
        f"### {labels[1]}\n```json\n{_json_block(evidence_payload)}\n```\n\n"
        f"### {labels[2]}\n```json\n{_WRITE_SCHEMA_TR}\n```"
    )
