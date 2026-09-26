import type { MetadataRoute } from 'next';
import { defaultLocale, locales } from '@/i18n.config';
import { LEGAL_SLUGS } from '@/lib/legal';
import { hreflangMap, localeUrl } from '@/lib/seo';

/**
 * ISR — 24 SAATTE BİR YENİDEN ÜRETİM.
 *
 * `lastModified` = `new Date()` olduğu için sitemap, `revalidate` tanımlı
 * değilse build sırasında bir kez üretilen statik bir dosyadır: tüm zaman
 * damgaları sonsuza dek build gününde kalır ve arama motorlarına "bu site
 * hiç değişmiyor" sinyali verir. 86400 ile /sitemap.xml günde bir yeniden
 * üretilir; `lastModified` yalnızca o günün tarihiyle ilgili olduğu için
 * günlük çözümleme yeterlidir (saatlik gereksiz iş, yıllık ise yine yanlış).
 *
 * Not: Next.js metadata route'ları da segment config'i okur —
 * `next-metadata-route-loader` kullanıcı export'larını (default ve
 * `generateSitemaps` hariç) route modülüne yeniden dışa aktarır, derleme de
 * `routeModule.userland.revalidate` değerini kullanır. Yani bu export
 * gerçekten ISR tetikler, dekoratif değildir.
 */
export const revalidate = 86400;

/**
 * Dil ana sayfaları + yasal sayfalar. /rapor bilerek DAHİL DEĞİL:
 * token'lı özel rapor sayfaları arama dizinine girmemeli.
 *
 * Her URL kendi 10 dildeki karşılığıyla birlikte `alternates.languages` taşır;
 * Google sitemap'teki hreflang'i sayfadaki hreflang ile karşılaştırır, ikisi
 * tutmazsa ikisini de yok sayar.
 *
 * Çevirisi olmayan yasal sayfalar (`noindex, follow`) burada BİLEREK kalıyor:
 * hreflang kümeleri karşılıklı (reciprocal) olmak zorunda, yani bir dilin
 * sayfası listede yoksa Google o kümenin tamamını geçersiz sayabilir. Sitemap
 * bir "indirilecekler" listesi değil, bir keşif ipucudur; dizine alma kararını
 * sayfanın kendi `robots` meta'sı verir.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  // Tek bir üretim içinde tüm lastModified aynı olsun: her URL için ayrı `new Date()`
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
