import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Fraunces, Karla, IBM_Plex_Mono } from 'next/font/google';
import { locales, rtlLocales, type Locale } from '@/i18n.config';
import { LEGAL_SLUGS, getLegalName } from '@/lib/legal';
import {
  OG_IMAGE_SIZE,
  getAlternates,
  getHomeMeta,
  getOgImageUrl,
  getOgLocale,
  getOgLocaleAlternates
} from '@/lib/seo';
import Analytics from '@/components/Analytics';
import SeoJsonLd from '@/components/SeoJsonLd';
import LangMenu from '@/components/notebook/LangMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { ThemeProvider, ThemeScript } from '@/components/ThemeProvider';

const display = Fraunces({ subsets: ['latin', 'latin-ext'], variable: '--nb-display' });
const bodyFont = Karla({ subsets: ['latin', 'latin-ext'], variable: '--nb-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '600'], variable: '--nb-mono' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const { title, description, keywords } = getHomeMeta(params.locale);
  const { canonical, languages } = getAlternates(params.locale);
  const ogImage = getOgImageUrl(params.locale);
  return {
    title,
    description,
    keywords,
    authors: [{ name: 'TrueReviews' }],
    creator: 'TrueReviews',
    publisher: 'TrueReviews',
    category: 'business',
    alternates: { canonical, languages },
    openGraph: {
      type: 'website',
      siteName: 'TrueReviews',
      locale: getOgLocale(params.locale),
      alternateLocale: getOgLocaleAlternates(params.locale),
      url: canonical,
      title,
      description,
      images: [{ url: ogImage, width: OG_IMAGE_SIZE.width, height: OG_IMAGE_SIZE.height, alt: title }]
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImage]
    },
    // `robots` BİLEREK layout'ta değil: layout her sayfaya miras kalır, 404 sınırı
    // da bu layout'un içinde render edilir ve `index, follow` ile `noindex` iki ayrı
    // meta olarak basılırdı. Robots yönergesi gerçek içerik sayfalarının kendi
    // `generateMetadata`'sinde (app/[locale]/page.tsx ve [page]/page.tsx) veriliyor.
    icons: {
      icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
      shortcut: '/icon.svg',
      apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
    },
    manifest: '/manifest.webmanifest',
    verification: {
      google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || undefined
    }
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#17463c'
};

function BrandMark() {
  return (
    <svg className="brand__mark" viewBox="0 0 34 34" fill="none" aria-hidden="true">
      <rect x="3.5" y="2.5" width="27" height="29" rx="2.5" fill="var(--card)" stroke="var(--ink)" strokeWidth="2" />
      <path d="M11 2.5v29" stroke="var(--ink)" strokeWidth="1.6" />
      <path d="M15.5 18.2l4 4 8.4-9.4" stroke="var(--amber)" strokeWidth="3.1" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="27" cy="6.5" r="2.6" fill="var(--brand)" />
    </svg>
  );
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!(locales as readonly string[]).includes(params.locale)) notFound();
  unstable_setRequestLocale(params.locale);
  const messages = await getMessages();
  const t = await getTranslations('nb');
  const locale = params.locale as Locale;
  const dir = rtlLocales.includes(locale) ? 'rtl' : 'ltr';
  const m = getHomeMeta(locale);

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${display.variable} ${bodyFont.variable} ${mono.variable}`}
    >
      <body className="nb-body">
        <Analytics />
        <SeoJsonLd locale={locale} title={m.title} description={m.description} />
        <ThemeScript />
        <div className="grain" aria-hidden="true" />
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <header className="site-head">
              <div className="wrap wrap--wide head-in">
                <a className="brand" href={`/${locale}`} aria-label="TrueReviews">
                  <BrandMark />
                  <span>
                    <span className="brand__name">
                      True<em>Reviews</em>
                    </span>
                    <span className="brand__sub">{t('brand.sub')}</span>
                  </span>
                </a>
                <div className="head-right">
                  <span className="head-note">{t('head.note')}</span>
                  <LangMenu current={locale} />
                  <ThemeToggle />
                </div>
              </div>
            </header>

            <main>{children}</main>

            <footer className="site-foot">
              <div className="wrap wrap--wide foot-in">
                <div>
                  <span className="brand__name" style={{ fontSize: 18 }}>
                    True<em>Reviews</em>
                  </span>
                  <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 8, maxWidth: '38ch' }}>
                    {t('foot.tagline')}
                  </p>
                  <p className="foot-mono">© 2026 · {t('foot.made')}</p>
                </div>
                <nav className="foot-links" aria-label="Alt bilgi">
                  {LEGAL_SLUGS.map((slug) => (
                    <a key={slug} href={`/${locale}/${slug}`}>
                      {getLegalName(slug, locale)}
                    </a>
                  ))}
                </nav>
              </div>
            </footer>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
