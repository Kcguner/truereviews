import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n.config';
import { getContactEmail, getSiteUrl } from '@/lib/site';
import { LEGAL_SLUGS, getLegalDoc, getLegalMeta, isLegalSlug } from '@/lib/legal';
import { getFaqHeading, getFaqs } from '@/lib/faq';
import {
  OG_IMAGE_SIZE,
  ROBOTS_INDEX,
  getAlternates,
  getOgImageUrl,
  getOgLocale,
  getOgLocaleAlternates,
  normalizeLocale
} from '@/lib/seo';

type Params = { locale: string; page: string };

/**
 * ISR — 24 SAATTE BİR YENİDEN ÜRETİM.
 *
 * Bu sayfa `generateStaticParams` ile build'de üretilir; `revalidate`
 * tanımlanmazsa `todayLabel()` içindeki `new Date()` DERLEME anında bir kez
 * çalışır ve donup kalır — üretimde eylül yapılmış bir "Gizlilik Politikası"
 * süresiz "Eylül 2026" başlığı basardı. 86400 ile sayfa en geç günde bir
 * yeniden üretilir, yani tarih en fazla bir gün eski olur.
 *
 * Neden istemci tarafı (b) değil: tarih sunucu HTML'ine girmez; JS kapalıyken
 * ve ilk boyamada görünmez, üstelik mount sonrası değişen metin hydration
 * mismatch üretir (bu dosya sunucu bileşeni; düzeltmek için ayrı bir client
 * bileşen + mount bayrağı gerekir ki o zaman SSR'de tarih yine kaybolur).
 * Neden tarihi tamamen kaldırmak (c) değil: KVKK/GDPR metinlerinde "son
 * güncelleme" tarihi hukuki bir bilgilendirmedir; bir günlük bayatlama bu
 * bilgiyi yanlış yapmaz, yalnızca geciktirir. Yanlış tarih ise (dondurulmuş
 * derleme tarihi) doğrudan yanıltıcıdır.
 *
 * Not: `components/notebook/ReportView.tsx` aynı `todayLabel` kopyasını kendi
 * içinde taşıyor (o dosya rapor sayfası, client bileşeni — orada tarih zaten
 * tarayıcıda hesaplandığı için sorun yok). Tek kaynak istenirse
 * `lib/site.ts` gibi ortak bir modüle taşınmalı.
 */
export const revalidate = 86400;

/**
 * Çevirisi olmayan yasal sayfalar için robots yönergesi.
 *
 * `getLegalDoc` gövdeyi İngilizceye düşürdüğünde (fr, es, nl, ar, ru, fa, az)
 * sayfa İngilizce metni kendi canonical adresiyle `index, follow` olarak
 * yayımlıyordu: aynı içeriğin 7 kendi-kendine-canonical kopyası (duplicate
 * content) ve "10 dildeyiz" iddiasının içi boş. Bu yüzden düşen çeviriler
 * `noindex, follow` alır — `follow` korunur, çünkü sayfadaki bağlantılar
 * (footer/dil menüsü) hâlâ takip edilsin; sadece sayfanın kendi dizin değeri
 * düşer. Canonical ve hreflang çıktısı DEĞİŞMEZ: `noindex`'li bir sayfa
 * hreflang kümesinin meşru üyesi olabilir, Google küme içinden dil seçer.
 */
const ROBOTS_FALLBACK = {
  index: false,
  follow: true,
  googleBot: {
    index: false,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1
  }
} as const;

export function generateStaticParams() {
  return locales.flatMap((locale) => LEGAL_SLUGS.map((page) => ({ locale, page })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isLegalSlug(params.page)) return {};
  const locale = normalizeLocale(params.locale);
  const meta = getLegalMeta(params.page, locale);
  const ogImage = getOgImageUrl(locale);
  const { canonical, languages } = getAlternates(locale, params.page);
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical, languages },
    openGraph: {
      type: 'article',
      siteName: 'TrueReviews',
      locale: getOgLocale(locale),
      alternateLocale: getOgLocaleAlternates(locale),
      url: canonical,
      title: meta.title,
      description: meta.description,
      images: [{ url: ogImage, width: OG_IMAGE_SIZE.width, height: OG_IMAGE_SIZE.height, alt: meta.title }]
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      images: [ogImage]
    },
    // `fallback` yalnızca İÇERİK dilini bilir; URL dili her zaman 10 dilde
    // yayımlanıyor, bu yüzden karar `generateMetadata`'de (yani `<head>`'de)
    // veriliyor — `robots.txt` seviyesinde değil, çünkü o zaman tüm diller
    // tek blokta taranır.
    robots: getLegalDoc(params.page, locale).fallback ? ROBOTS_FALLBACK : ROBOTS_INDEX
  };
}

function todayLabel(locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return new Date().toLocaleDateString();
  }
}

export default function LegalPage({ params }: { params: Params }) {
  const { locale: rawLocale, page } = params;
  const locale = normalizeLocale(rawLocale);
  if (!isLegalSlug(page) || !(locales as readonly string[]).includes(rawLocale)) notFound();
  const base = getSiteUrl();
  const meta = getLegalMeta(page, locale);
  const { doc, fallbackNote } = getLegalDoc(page, locale);
  const url = `${base}/${locale}/${page}`;

  // BreadcrumbList + WebPage: legal sayfalar ana sayfaya bağlı alt sayfalardır.
  const jsonLd: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      url,
      inLanguage: locale,
      isPartOf: { '@type': 'WebSite', name: 'TrueReviews', url: base }
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'TrueReviews', item: `${base}/${locale}` },
        { '@type': 'ListItem', position: 2, name: doc.title, item: url }
      ]
    }
  ];

  // FAQPage yalnızca /sss sayfasında: JSON-LD sayfadaki görünür SSS ile birebir aynı
  // olmalı, aksi halde Google rich result vermez.
  if (page === 'sss') {
    jsonLd.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: locale,
      mainEntity: getFaqs(locale).map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a }
      }))
    });
  }

  return (
    <section className="screen">
      <div className="wrap wrap--report rpt">
        {jsonLd.map((node, i) => (
          <script
            key={i}
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(node).replace(/</g, '\\u003c') }}
          />
        ))}
        <div className="rpt__nav">
          <a className="linkish" href={`/${locale}`}>
            ← TrueReviews
          </a>
        </div>
        <header className="rpt__head">
          <p className="eyebrow">{todayLabel(locale)}</p>
          <h1>{doc.title}</h1>
          <p className="rpt__sub">{doc.intro}</p>
        </header>

        {fallbackNote && <p className="mailnote">{fallbackNote}</p>}

        {page === 'sss' && (
          <div className="gets__grid">
            {getFaqs(locale).map((f) => (
              <details className="get" key={f.q} open>
                <summary>
                  <h5>{f.q}</h5>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        )}

        {page === 'iletisim' && <ContactBlock locale={locale} />}

        {doc.sections.map((s) => (
          <section className="block" key={s.h}>
            <div className="block__h">
              <h3>{s.h}</h3>
              <span className="rule" />
            </div>
            {s.p.map((t, i) => (
              <p key={i} style={{ color: 'var(--ink-2)', marginTop: i ? 8 : 0 }}>
                {t}
              </p>
            ))}
          </section>
        ))}

        {page === 'sss' && (
          <p style={{ marginTop: 16 }}>
            <a className="btn btn--primary" href={`/${locale}`}>
              {getFaqHeading(locale)} →
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

function ContactBlock({ locale }: { locale: string }) {
  const email = getContactEmail();
  if (!email) return null;
  return (
    <section className="block">
      <div className="block__h">
        <h3>{email}</h3>
        <span className="rule" />
      </div>
      <p>
        <a className="linkish" href={`mailto:${email}`} dir="ltr">
          {email}
        </a>
      </p>
    </section>
  );
}
