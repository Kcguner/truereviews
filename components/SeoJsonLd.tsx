import { getSiteUrl } from '@/lib/site';
import { getFaqs } from '@/lib/faq';

/** Organization + WebSite + SoftwareApplication + (tr/en/de) FAQPage — GEO için JSON-LD */
export default function SeoJsonLd({
  locale,
  title,
  description
}: {
  locale: string;
  title: string;
  description: string;
}) {
  const base = getSiteUrl();
  const faqs = getFaqs(locale);
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
      inLanguage: locale
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'TrueReviews',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      url: `${base}/${locale}`,
      description,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'TRY' }
    }
  ];
  // JSON-LD, sayfadaki görünür SSS ile birebir aynı içerik olmalı.
  data.push({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
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
