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
      // Yapay zekâ / GEO botlarına açıkça izin. Dikkat: bir grup kendi user-agent'ıyla
      // eşleştiğinde '*' grubunun kuralları UYGULANMAZ — bu yüzden disallow'ları
      // burada da tekrarlamak zorundayız, aksi halde AI botları /api/'yi tarar.
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'CCBot', 'Google-Extended', 'Bytespider'],
        allow: '/',
        disallow: ['/api/', '/*/rapor']
      }
    ],
    sitemap: `${base}/sitemap.xml`
  };
}
