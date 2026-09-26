import type { MetadataRoute } from 'next';
import { defaultLocale, locales } from '@/i18n.config';
import { LEGAL_SLUGS } from '@/lib/legal';
import { hreflangMap, localeUrl } from '@/lib/seo';

/**
 * Dil ana sayfaları + yasal sayfalar. /rapor bilerek DAHİL DEĞİL:
 * token'lı özel rapor sayfaları arama dizinine girmemeli.
 *
 * Her URL kendi 10 dildeki karşılığıyla birlikte `alternates.languages` taşır;
 * Google sitemap'teki hreflang'i sayfadaki hreflang ile karşılaştırır, ikisi
 * tutmazsa ikisini de yok sayar.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  // Tek bir build içinde tüm lastModified aynı olsun: her URL için ayrı `new Date()`
  // çağırmak zaman damgalarını birbirinden ayırır ve gereksiz yeniden tarama yaratır.
  const lastModified = new Date();

  const home: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: localeUrl(locale),
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: locale === defaultLocale ? 1 : 0.9,
    alternates: { languages: hreflangMap() }
  }));

  const legal: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    LEGAL_SLUGS.map((slug) => ({
      url: localeUrl(locale, slug),
      lastModified,
      changeFrequency: 'monthly' as const,
      priority: 0.5,
      alternates: { languages: hreflangMap((l) => localeUrl(l, slug)) }
    }))
  );

  return [...home, ...legal];
}
