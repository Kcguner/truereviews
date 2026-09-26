import { locales } from '@/i18n.config';
import { getSiteUrl } from '@/lib/site';
import { getFaqs } from '@/lib/faq';
import { CURRENCY, getOgImageUrl, normalizeLocale } from '@/lib/seo';

/**
 * Organization + WebSite + WebPage + SoftwareApplication + FAQPage — GEO için JSON-LD.
 * Her dil kendi `inLanguage`'i ve para birimini alır; `x-default` kök olduğu için
 * WebSite tüm locale'leri `inLanguage` dizisinde taşır.
 */
export default function SeoJsonLd({
  locale: rawLocale,
  title,
  description
}: {
  locale: string;
  title: string;
  description: string;
}) {
  const locale = normalizeLocale(rawLocale);
  const base = getSiteUrl();
  const faqs = getFaqs(locale);
  const url = `${base}/${locale}`;

  const data: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'TrueReviews',
      url: base,
      logo: `${base}/icon.svg`
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'TrueReviews',
      url: base,
      inLanguage: locales
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: title,
      description,
      url,
      inLanguage: locale,
      isPartOf: { '@type': 'WebSite', name: 'TrueReviews', url: base }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'TrueReviews',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Review Analytics',
      operatingSystem: 'Web',
      url,
      description,
      inLanguage: locale,
      image: getOgImageUrl(locale),
      isAccessibleForFree: true,
      featureList: [
        'Satisfaction score (0-100)',
        'Praise / neutral / complaint split',
        'Recurring review themes',
        'One concrete weekly action'
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: CURRENCY[locale] }
    }
  ];

  // JSON-LD, sayfadaki görünür SSS ile birebir aynı içerik olmalı.
  data.push({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: locale,
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
