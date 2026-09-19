import type { MetadataRoute } from 'next';
import { locales } from '@/i18n.config';
import { getSiteUrl } from '@/lib/site';
import { LEGAL_SLUGS } from '@/lib/legal';

/**
 * Dil ana sayfaları + yasal sayfalar. /rapor bilerek DAHİL DEĞİL:
 * token'lı özel rapor sayfaları arama dizinine girmemeli.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();
  const home: MetadataRoute.Sitemap = locales.map((locale) => ({
    url: `${base}/${locale}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: locale === 'tr' ? 1 : 0.9,
    alternates: {
      languages: Object.fromEntries([
        ...locales.map((l) => [l, `${base}/${l}`]),
        ['x-default', base]
      ])
    }
  }));
  const legal: MetadataRoute.Sitemap = locales.flatMap((locale) =>
    LEGAL_SLUGS.map((slug) => ({
      url: `${base}/${locale}/${slug}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.5
    }))
  );
  return [...home, ...legal];
}
