import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // API ve token'lı özel rapor sayfaları taranmamalı
        disallow: ['/api/', '/*/rapor']
      },
      // Yapay zekâ / GEO botlarına açıkça izin
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot', 'Google-Extended', 'Bytespider'],
        allow: '/'
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
