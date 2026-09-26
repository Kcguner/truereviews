// Değer importu relative: vitest `@/` alias'ı çözmez (bkz. lib/legal.ts'in
// yalnızca type importu kullanması).
import { locales, type Locale } from '../i18n.config';
import { getSiteUrl } from './site';

/**
 * SEO'nun TEK kaynağı. Metadata, sitemap, JSON-LD ve testler buradan beslenir.
 * Böylece 10 dil için title/description/keywords/hreflang birbirinden ayrışamaz.
 */

export type HomeMeta = { title: string; description: string; keywords: string[] };

/**
 * Ana sayfa metinleri. Her dilde:
 *  - title: birincil anahtar kelimeyi içerir, marka sonda (marka önde değil —
 *    SERP'te anahtar kelime eşleşmesi önceliklidir).
 *  - description: 140-160 karakter, birincil + ikincil anahtar kelime + değer + CTA.
 *  - keywords: 8-10 hedef sorgu (tr/en/de daha geniş, diğerleri yerel uzun kuyruk).
 */
export const HOME_META: Record<Locale, HomeMeta> = {
  tr: {
    title: 'Google Yorum Analizi — Ücretsiz Özet | TrueReviews',
    description:
      'Google yorum analizi ücretsiz: Google Maps işletme linkinizi yapıştırın; memnuniyet skorunuzu, tekrar eden övgü ve şikayetleri tek sayfada görün. Kayıt gerekmez.',
    keywords: [
      'google yorum analizi',
      'google maps yorum analizi',
      'google yorum özeti',
      'google değerlendirme analizi',
      'müşteri yorum analizi',
      'işletme yorum analizi',
      'yorum analizi aracı',
      'müşteri memnuniyeti ölçme',
      'google maps yorumları',
      'online itibar analizi'
    ]
  },
  en: {
    title: 'Google Review Analysis — Free Summary | TrueReviews',
    description:
      'Google review analysis, free: paste your Google Maps link and get an honest one-page summary — satisfaction score, recurring praise and complaints, one weekly action.',
    keywords: [
      'google review analysis',
      'google maps review summary',
      'google review summarizer',
      'business review insights',
      'customer feedback analysis',
      'review sentiment analysis',
      'google maps reviews',
      'customer satisfaction score',
      'online reputation analysis',
      'review analysis tool'
    ]
  },
  de: {
    title: 'Google-Bewertungsanalyse — Kostenlos | TrueReviews',
    description:
      'Google-Bewertungsanalyse kostenlos: Fügen Sie Ihren Maps-Link ein und erhalten Sie eine ehrliche Zusammenfassung – Score, wiederkehrende Themen, ein Wochenschritt.',
    keywords: [
      'google bewertungsanalyse',
      'google maps bewertungen zusammenfassung',
      'kundenfeedback analyse',
      'bewertungen analysieren tool',
      'google maps rezensionen',
      'kundenzufriedenheit messen',
      'online bewertungen auswerten',
      'reputationsanalyse',
      'geschmacksbewertung analyse'
    ]
  },
  fr: {
    title: 'Analyse avis Google — Résumé gratuit | TrueReviews',
    description:
      "Analyse d'avis Google gratuite : collez le lien Maps de votre établissement et obtenez un résumé honnête sur une page – score, thèmes récurrents, une action pour la semaine.",
    keywords: [
      'analyse avis google',
      'résumé avis google maps',
      'analyse avis clients',
      'outil analyse avis',
      'avis google maps',
      'satisfaction client',
      'analyse réputation en ligne',
      'résumé avis clients',
      'sentiment analysis avis'
    ]
  },
  es: {
    title: 'Análisis de reseñas de Google — Resumen gratis | TrueReviews',
    description:
      'Análisis de reseñas de Google gratis: pega el enlace de tu negocio y obtén un resumen honesto en una página: puntuación, temas que se repiten y una acción semanal.',
    keywords: [
      'análisis reseñas google',
      'resumen reseñas google maps',
      'análisis reseñas clientes',
      'herramienta análisis reseñas',
      'opiniones google maps',
      'satisfacción del cliente',
      'análisis reputación online',
      'resumen valoraciones google',
      'análisis sentimiento reseñas'
    ]
  },
  nl: {
    title: 'Google reviewanalyse — Gratis samenvatting | TrueReviews',
    description:
      'Google reviewanalyse gratis: plak de Maps-link van je bedrijf en krijg een eerlijke samenvatting op één pagina – score, terugkerende punten en één concrete stap deze week.',
    keywords: [
      'google review analyse',
      'google maps reviews samenvatting',
      'klantfeedback analyse',
      'reviews analyseren tool',
      'google maps recensies',
      'klanttevredenheid meten',
      'online reputatie analyse',
      'samenvatting klantreviews',
      'sentiment analyse reviews'
    ]
  },
  ar: {
    title: 'تحليل تقييمات جوجل — ملخص مجاني | TrueReviews',
    description: 'تحليل تقييمات جوجل مجانًا: الصق رابط خرائط جوجل لمشتركك واحصل على ملخص صادق في صفحة واحدة — درجة الرضا، أكثر الشكاوى تكرارًا، وخطوة عملية لهذا الأسبوع.',
    keywords: [
      'تحليل تقييمات جوجل',
      'ملخص تقييمات خرائط جوجل',
      'تحليل آراء العملاء',
      'تقييمات خرائط جوجل',
      'رضا العملاء',
      'تحليل السمعة الرقمية',
      'ملخص تقييمات المطعم',
      'أداة تحليل التقييمات'
    ]
  },
  ru: {
    title: 'Анализ отзывов Google — Бесплатно | TrueReviews',
    description: 'Анализ отзывов Google бесплатно: вставьте ссылку Google Maps на компанию и получите честную сводку на одной странице — оценка, повторяющиеся темы и шаг на неделю.',
    keywords: [
      'анализ отзывов google',
      'сводка отзывов google maps',
      'анализ отзывов клиентов',
      'отзывы google maps',
      'удовлетворённость клиентов',
      'анализ репутации',
      'разбор отзывов',
      'инструмент анализа отзывов'
    ]
  },
  fa: {
    title: 'تحلیل نظرات گوگل — خلاصه رایگان | TrueReviews',
    description: 'تحلیل نظرات گوگل رایگان: پیوند کسب‌وکارتان در گوگل‌مپس را بچسبانید و خلاصه‌ای صادقانه در یک صفحه بگیرید — امتیاز رضایت، موضوعات پرتکرار و یک اقدام هفتگی.',
    keywords: [
      'تحلیل نظرات گوگل',
      'خلاصه نظرات گوگل مپس',
      'تحلیل نظر مشتریان',
      'نظرات گوگل مپس',
      'رضایت مشتری',
      'تحلیل اعتبار آنلاین',
      'خلاصه نظرات رستوران',
      'ابزار تحلیل نظرات'
    ]
  },
  az: {
    title: 'Google rəy təhlili — Pulsuz xülasə | TrueReviews',
    description: 'Google rəy təhlili pulsuz: Google Maps-də müəssisə linkini yapışdırın, bir səhifədə dürüst xülasə alın — məmnuniyyət balı, təkrarlanan tərif və şikayətlər, bir konkret addım.',
    keywords: [
      'google rəy təhlili',
      'google maps rəylər xülasəsi',
      'müştəri rəylərinin təhlili',
      'google maps rəyləri',
      'müştəri məmnuniyyəti',
      'onlayn reputasiya təhlili',
      'rəy təhlili aləti',
      'müştəri geri bildirimi'
    ]
  }
};

/** `og:locale` değerlerinin tipi: Next.js `Locale` = `` `${string}_${string}` ``. */
export type OgLocale = `${string}_${string}`;

/** Open Graph / hreflang için locale → BCP-47 (`og:locale` formatı `tr_TR`). */
export const OG_LOCALE: Record<Locale, OgLocale> = {
  tr: 'tr_TR',
  en: 'en_US',
  de: 'de_DE',
  fr: 'fr_FR',
  es: 'es_ES',
  nl: 'nl_NL',
  ar: 'ar_AR',
  ru: 'ru_RU',
  fa: 'fa_IR',
  az: 'az_AZ'
};

/** Fiyat 0 olduğu için para birimi yalnızca `offers` şemasında görünür. */
export const CURRENCY: Record<Locale, string> = {
  tr: 'TRY',
  en: 'USD',
  de: 'EUR',
  fr: 'EUR',
  es: 'EUR',
  nl: 'EUR',
  ar: 'AED',
  ru: 'RUB',
  fa: 'IRT',
  az: 'AZN'
};

/** `x-default` site kökünü işaret eder; middleware eşleşmeyen istekleri
 *  `NEXT_LOCALE` → `Accept-Language` → `tr` sırasıyla yönlendirir. */
export const X_DEFAULT = 'x-default';

export function isLocale(locale: string): locale is Locale {
  return (locales as readonly string[]).includes(locale);
}

/** Tanımsız locale → `tr` (URL'den gelen serbest metin). */
export function normalizeLocale(locale: string): Locale {
  return isLocale(locale) ? locale : 'tr';
}

/** `${base}/${locale}` veya `${base}/${locale}/${slug}` */
export function localeUrl(locale: string, slug?: string): string {
  const base = getSiteUrl();
  return slug ? `${base}/${locale}/${slug}` : `${base}/${locale}`;
}

/**
 * Aynı sayfanın 10 dildeki mutlak adresleri + x-default.
 * `pathFor` verilmezse ana sayfa varsayılır.
 */
export function hreflangMap(pathFor?: (locale: Locale) => string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const l of locales) map[l] = pathFor ? pathFor(l) : localeUrl(l);
  map[X_DEFAULT] = getSiteUrl();
  return map;
}

/** Metadata API'sinin `alternates` alanı: canonical + hreflang haritası. */
export function getAlternates(locale: string, slug?: string) {
  const pathFor = (l: Locale) => (slug ? localeUrl(l, slug) : localeUrl(l));
  return { canonical: pathFor(normalizeLocale(locale)), languages: hreflangMap(pathFor) };
}

/** `og:locale` — tanımsız dilde İngilizce. */
export function getOgLocale(locale: string): OgLocale {
  return OG_LOCALE[normalizeLocale(locale)];
}

/** `og:locale:alternate` — sayfanın kendi dili hariç diğer 9 dil. */
export function getOgLocaleAlternates(locale: string): OgLocale[] {
  const self = getOgLocale(locale);
  return locales.map((l) => OG_LOCALE[l]).filter((l) => l !== self);
}

/**
 * İndekslenen tüm sayfalarda ortak robots yönergeleri.
 * `max-image-preview:large` görsel sonuçları (LG), `max-snippet:-1` tam metin.
 */
export const ROBOTS_INDEX = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1
  }
} as const;

export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export function getOgImageUrl(locale: string): string {
  return localeUrl(locale, 'opengraph-image');
}

export function getHomeMeta(locale: string): HomeMeta {
  return HOME_META[normalizeLocale(locale)];
}
