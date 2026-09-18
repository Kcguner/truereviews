import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Fraunces, Karla, IBM_Plex_Mono } from 'next/font/google';
import { locales, defaultLocale, rtlLocales, type Locale } from '@/i18n.config';
import LangMenu from '@/components/notebook/LangMenu';
import ThemeToggle from '@/components/ThemeToggle';
import { ThemeProvider, ThemeScript } from '@/components/ThemeProvider';

const display = Fraunces({ subsets: ['latin', 'latin-ext'], variable: '--nb-display' });
const bodyFont = Karla({ subsets: ['latin', 'latin-ext'], variable: '--nb-body' });
const mono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '600'], variable: '--nb-mono' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const META: Record<string, { title: string; description: string }> = {
  tr: {
    title: 'YorumAnalizi — Google yorumlarının dürüst özeti',
    description: "Google Maps linkini yapıştır; yorumlarının tamamını okuyup sana bir sayfalık dürüst bir özet çıkaralım."
  },
  en: {
    title: 'YorumAnalizi — An honest summary of your Google reviews',
    description: 'Paste your Google Maps link; we read every review and hand you a one-page honest summary.'
  },
  de: {
    title: 'YorumAnalizi — Ehrliche Zusammenfassung deiner Google-Bewertungen',
    description: 'Füge deinen Google-Maps-Link ein; wir lesen alle Bewertungen und fassen sie ehrlich zusammen.'
  },
  ar: { title: 'YorumAnalizi — ملخص صادق لتقييمات Google', description: 'حلّل تقييمات خرائط Google.' },
  ru: { title: 'YorumAnalizi — честная сводка отзывов Google', description: 'Анализируйте отзывы Google Maps.' },
  fr: { title: 'YorumAnalizi — résumé honnête de vos avis Google', description: 'Analysez vos avis Google Maps.' },
  es: { title: 'YorumAnalizi — resumen honesto de tus reseñas de Google', description: 'Analiza tus reseñas de Google Maps.' },
  nl: { title: 'YorumAnalizi — eerlijke samenvatting van je Google-reviews', description: 'Analyseer je Google Maps-reviews.' },
  fa: { title: 'YorumAnalizi — خلاصه صادقانه نظرات گوگل', description: 'نظرات گوگل‌مپس را تحلیل کنید.' },
  az: { title: 'YorumAnalizi — Google rəylərinin dürüst xülasəsi', description: 'Google Maps rəylərinizi təhlil edin.' }
};

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale = (locales as readonly string[]).includes(params.locale) ? params.locale : defaultLocale;
  const m = META[locale] || META.tr;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://ornek.vercel.app').replace(/\/+$/, '');
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `${base}/${l}`;
  languages['x-default'] = `${base}/en`;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: `${base}/${locale}`, languages }
  };
}

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

  return (
    <html
      lang={locale}
      dir={dir}
      suppressHydrationWarning
      className={`${display.variable} ${bodyFont.variable} ${mono.variable}`}
    >
      <body className="nb-body">
        <ThemeScript />
        <div className="grain" aria-hidden="true" />
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <header className="site-head">
              <div className="wrap wrap--wide head-in">
                <a className="brand" href={`/${locale}`} aria-label="YorumAnalizi">
                  <BrandMark />
                  <span>
                    <span className="brand__name">
                      Yorum<em>Analizi</em>
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
                    Yorum<em>Analizi</em>
                  </span>
                  <p style={{ fontSize: 14, color: 'var(--ink-2)', marginTop: 8, maxWidth: '38ch' }}>
                    {t('foot.tagline')}
                  </p>
                  <p className="foot-mono">© 2026 · {t('foot.made')}</p>
                </div>
                <nav className="foot-links" aria-label="Alt bilgi">
                  {(['l1', 'l2', 'l3', 'l4'] as const).map((k) => (
                    <a key={k} href={`/${locale}`}>
                      {t(`foot.${k}`)}
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
